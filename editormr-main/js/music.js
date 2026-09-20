    // ===================== MUSIC =====================
    musicBtn.addEventListener('click', () => musicInput.click());

    musicInput.addEventListener('change', async () => {
      const file = musicInput.files[0];
      if (!file) return;
      await addMusic(file);
      musicInput.value = '';
    });

    async function addMusic(file) {
      loading.classList.add('show');
      try {
        pushHistory();
        if (state.music) {
          // URL ni revoke qilmaymiz — undo stack da saqlanishi mumkin
          if (state.music.audio) {
            state.music.audio.pause();
            state.music.audio = null;
          }
          musicLane.innerHTML = '';
        }

        await loadMusicFromFile(file, { startTime: state.currentTime });
        showToast('Music added');
        scheduleSave();
      } catch (err) {
        console.error(err);
        showToast('Failed to load music');
      } finally {
        loading.classList.remove('show');
      }
    }

    // Faylni o'qib state.music yaratadi. overrides — saqlangan loyihani tiklashda (startTime, trim...)
    async function loadMusicFromFile(file, overrides = {}) {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.preload = 'auto';

      await new Promise((resolve) => {
        audio.onloadedmetadata = resolve;
        audio.onerror = resolve;
        setTimeout(resolve, 3000);
      });

      const duration = audio.duration || 30;
      let audioBuffer = null;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      } catch (err) {
        console.warn('Waveform decode failed', err);
      }

      state.music = {
        file,
        url,
        audio,
        buffer: audioBuffer,
        duration,
        startTime: 0,
        offsetY: 0,
        trimStart: 0,
        trimEnd: duration,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
        ...overrides,
      };
      if (state.music.fadeIn == null) state.music.fadeIn = 0;
      if (state.music.fadeOut == null) state.music.fadeOut = 0;
      state.music.trimEnd = Math.min(state.music.trimEnd, duration);
      if (state.music.volume == null) state.music.volume = 1;
      if (state.music.muted == null) state.music.muted = false;
      applyMusicVolume();

      musicTrack.style.display = 'flex';
      renderMusicBlock();
      updateTimelineLayout();
    }

    function renderMusicBlock() {
      if (!state.music) return;
      musicLane.innerHTML = '';

      const m = state.music;
      const visible = m.trimEnd - m.trimStart;
      const left = timeToPx(m.startTime);
      const width = timeToPx(visible);

      const block = document.createElement('div');
      block.className = 'media-block music'
        + (isSelected(MUSIC_ID) ? ' selected' : '')
        + (m.muted ? ' is-muted' : '');
      block.dataset.clipId = MUSIC_ID;
      block.style.left = left + 'px';
      block.style.width = Math.max(width, 24) + 'px';
      block.style.top = (4 + (m.offsetY || 0)) + 'px';

      const canvas = document.createElement('canvas');
      canvas.className = 'waveform';
      canvas.width = Math.max(Math.floor(width), 24);
      canvas.height = 24;
      block.appendChild(canvas);

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = (m.file?.name || 'Music').slice(0, 24);
      block.appendChild(label);

      if (m.muted) {
        const muteBadge = document.createElement('div');
        muteBadge.className = 'mute-badge';
        muteBadge.title = 'Muted';
        muteBadge.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
        block.appendChild(muteBadge);
      }

      const leftHandle = document.createElement('div');
      leftHandle.className = 'trim-handle left';
      block.appendChild(leftHandle);

      const rightHandle = document.createElement('div');
      rightHandle.className = 'trim-handle right';
      block.appendChild(rightHandle);

      musicLane.appendChild(block);

      drawWaveform(canvas, m.buffer, m.trimStart, m.trimEnd);

      attachLongPress(block, {
        shouldSkip: (e) => e.target.classList.contains('trim-handle'),
        onPointerDown: () => { focusClip(MUSIC_ID); },
        onLongPress: (e) => {
          showMusicContextMenu(e.clientX, e.clientY);
        },
        onDragStart: (e) => {
          startDrag(e, 'music', 'move');
        },
      });
      leftHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectOnly(MUSIC_ID);
        startDrag(e, 'music', 'trim-left');
      });
      rightHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectOnly(MUSIC_ID);
        startDrag(e, 'music', 'trim-right');
      });
      block.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        focusClip(MUSIC_ID);
        showMusicContextMenu(e.clientX, e.clientY);
      });
    }

    function drawWaveform(canvas, buffer, trimStart, trimEnd) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = BRAND.whiteDeep;
      ctx.fillRect(0, 0, w, h);

      if (!buffer) {
        ctx.fillStyle = BRAND.white;
        for (let i = 0; i < w; i += 3) {
          const barH = 4 + Math.random() * (h - 8);
          ctx.fillRect(i, (h - barH) / 2, 2, barH);
        }
        return;
      }

      const channel = buffer.getChannelData(0);
      const sampleRate = buffer.sampleRate;
      const startSample = Math.floor(trimStart * sampleRate);
      const endSample = Math.floor(trimEnd * sampleRate);
      const samples = endSample - startSample;
      const samplesPerPixel = samples / w;

      ctx.fillStyle = BRAND.white;
      for (let x = 0; x < w; x++) {
        const start = startSample + Math.floor(x * samplesPerPixel);
        const end = startSample + Math.floor((x + 1) * samplesPerPixel);
        let min = 1, max = -1;
        for (let i = start; i < end && i < channel.length; i++) {
          const v = channel[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const y1 = ((1 + min) / 2) * h;
        const y2 = ((1 + max) / 2) * h;
        ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    }


// ===================== AUDIO CLIPS (music / sfx / voice) =====================
// state.audioClips — asosiy model. state.music — birinchi music clip bilan sinxron (eski UI/export mosligi).

(function () {
  'use strict';

  function L() { return typeof EMRAudioLogic !== 'undefined' ? EMRAudioLogic : null; }

  function syncMusicFromAudioClips() {
    // Eski kod yo'llari state.music ga tayanadi — birinchi music clip ni ko'rsatamiz
    var list = state.audioClips || [];
    var first = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].kind === 'music') { first = list[i]; break; }
    }
    if (!first && list.length) first = list[0];
    if (!first) {
      if (state.music && state.music.audio) {
        try { state.music.audio.pause(); } catch (_) {}
      }
      state.music = null;
      return;
    }
    // Saqlab qolish: agar state.music allaqachon shu clip bo'lsa, faqat maydonlarni yangila
    if (state.music && state.music._audioClipId === first.id) {
      state.music.startTime = first.startTime;
      state.music.trimStart = first.trimStart;
      state.music.trimEnd = first.trimEnd;
      state.music.volume = first.gain;
      state.music.muted = first.muted;
      state.music.fadeIn = first.fadeIn;
      state.music.fadeOut = first.fadeOut;
      return;
    }
    state.music = {
      _audioClipId: first.id,
      file: first.file,
      url: first.url,
      audio: first.audio || null,
      buffer: first.buffer || null,
      peaks: first.peaks || null,
      duration: first.duration || (first.trimEnd - first.trimStart),
      startTime: first.startTime || 0,
      offsetY: 0,
      trimStart: first.trimStart || 0,
      trimEnd: first.trimEnd || 0,
      volume: first.gain != null ? first.gain : 1,
      muted: !!first.muted,
      fadeIn: first.fadeIn || 0,
      fadeOut: first.fadeOut || 0,
      name: first.name,
    };
  }

  function syncAudioClipFromMusic() {
    if (!state.music) return;
    var list = state.audioClips || [];
    var id = state.music._audioClipId;
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id || (list[i].kind === 'music' && !id)) {
        found = list[i];
        break;
      }
    }
    if (found) {
      found.startTime = state.music.startTime;
      found.trimStart = state.music.trimStart;
      found.trimEnd = state.music.trimEnd;
      found.gain = state.music.volume;
      found.muted = state.music.muted;
      found.fadeIn = state.music.fadeIn;
      found.fadeOut = state.music.fadeOut;
    }
  }

  // --- Add music (existing button) ---
  if (typeof musicBtn !== 'undefined' && musicBtn) {
    musicBtn.addEventListener('click', function () { musicInput.click(); });
  }
  if (typeof musicInput !== 'undefined' && musicInput) {
    musicInput.addEventListener('change', async function () {
      var file = musicInput.files[0];
      if (!file) return;
      await addAudioFiles([file], 'music');
      musicInput.value = '';
    });
  }

  // SFX button (created if missing)
  function ensureSfxButton() {
    var existing = document.getElementById('sfx-btn');
    if (existing) return existing;
    if (!musicBtn || !musicBtn.parentNode) return null;
    var btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.id = 'sfx-btn';
    btn.title = 'SFX qo\'sh';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 10v4h4l5 5V5L7 10H3z" fill="currentColor"/><path d="M16 8a4 4 0 010 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    musicBtn.parentNode.insertBefore(btn, musicBtn.nextSibling);
    var sfxInput = document.createElement('input');
    sfxInput.type = 'file';
    sfxInput.id = 'sfx-input';
    sfxInput.accept = 'audio/mp3,audio/wav,audio/m4a,audio/mpeg,audio/ogg,audio/webm,.mp3,.wav,.m4a,.ogg,.webm';
    sfxInput.multiple = true;
    sfxInput.style.display = 'none';
    document.body.appendChild(sfxInput);
    btn.addEventListener('click', function () { sfxInput.click(); });
    sfxInput.addEventListener('change', async function () {
      var files = Array.from(sfxInput.files || []);
      if (!files.length) return;
      await addAudioFiles(files, 'sfx');
      sfxInput.value = '';
    });
    return btn;
  }

  async function addAudioFiles(files, kind) {
    if (typeof loading !== 'undefined') loading.classList.add('show');
    try {
      if (typeof pushHistory === 'function') pushHistory();
      for (var i = 0; i < files.length; i++) {
        await loadAudioClipFromFile(files[i], { kind: kind || 'music', startTime: state.currentTime || 0 });
      }
      if (typeof showToast === 'function') {
        showToast(kind === 'sfx' ? 'SFX qo\'shildi' : (kind === 'voice' ? 'Ovoz qo\'shildi' : 'Musiqa qo\'shildi'));
      }
      if (typeof scheduleSave === 'function') scheduleSave();
    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') showToast('Audioni yuklab bo\'lmadi');
    } finally {
      if (typeof loading !== 'undefined') loading.classList.remove('show');
    }
  }

  async function loadAudioClipFromFile(file, overrides) {
    overrides = overrides || {};
    // Format check
    var url = URL.createObjectURL(file);
    var audio = new Audio(url);
    audio.preload = 'auto';
    var duration = await new Promise(function (resolve) {
      var done = false;
      function finish(d) {
        if (done) return;
        done = true;
        resolve(d);
      }
      audio.onloadedmetadata = function () { finish(audio.duration || 0); };
      audio.onerror = function () { finish(0); };
      setTimeout(function () { finish(audio.duration || 0); }, 8000);
    });
    if (!duration || !isFinite(duration) || duration < 0.05) {
      try { URL.revokeObjectURL(url); } catch (_) {}
      if (typeof showToast === 'function') {
        showToast('Bu audio formatni brauzer o\'qiy olmadi. MP3/WAV/M4A ni sinab ko\'ring');
      }
      throw new Error('unsupported audio');
    }

    var fileId = typeof fileIdOf === 'function' ? fileIdOf(file) : null;
    var peaks = null;
    // Peaks via engine (frees buffer)
    if (typeof EMRAudioEngine !== 'undefined' && EMRAudioEngine.decodePeaksFromFile) {
      try {
        peaks = await EMRAudioEngine.decodePeaksFromFile(file, fileId);
      } catch (e) {
        console.warn('Peaks decode failed', e);
      }
    }

    var logic = L();
    var id = (logic && logic.makeAudioClipId) ? logic.makeAudioClipId() : ('ac_' + Math.random().toString(36).slice(2, 10));
    var kind = overrides.kind || 'music';
    var track = overrides.track;
    if (track == null) {
      track = (kind === 'music') ? 0 : (kind === 'sfx') ? 1 : 2;
      // find free track if overlap
    }
    var startTime = overrides.startTime != null ? overrides.startTime : (state.currentTime || 0);
    var trimStart = overrides.trimStart != null ? overrides.trimStart : 0;
    var trimEnd = overrides.trimEnd != null ? overrides.trimEnd : duration;
    var gain = overrides.gain != null ? overrides.gain : 1;

    if (logic && logic.resolveAudioStartTimeOnTrack) {
      startTime = logic.resolveAudioStartTimeOnTrack(
        state.audioClips || [], track, null, startTime, trimEnd - trimStart
      );
    }

    var clip = {
      id: id,
      kind: kind,
      fileId: fileId,
      name: file.name || 'Audio',
      track: track,
      startTime: startTime,
      trimStart: trimStart,
      trimEnd: trimEnd,
      gain: gain,
      muted: !!overrides.muted,
      fadeIn: overrides.fadeIn || 0,
      fadeOut: overrides.fadeOut || 0,
      duck: kind === 'music',
      file: file,
      url: url,
      audio: audio,
      peaks: peaks,
      duration: duration,
    };

    if (!state.audioClips) state.audioClips = [];
    state.audioClips.push(clip);
    syncMusicFromAudioClips();
    renderAllAudioBlocks();
    if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
    return clip;
  }

  function renderAllAudioBlocks() {
    if (!musicLane) return;
    musicLane.innerHTML = '';
    var list = state.audioClips || [];
    if (!list.length) {
      if (musicTrack) musicTrack.style.display = 'none';
      return;
    }
    if (musicTrack) musicTrack.style.display = 'flex';

    // Sort by track then start
    var sorted = list.slice().sort(function (a, b) {
      var ta = a.track != null ? a.track : 0;
      var tb = b.track != null ? b.track : 0;
      if (ta !== tb) return ta - tb;
      return (a.startTime || 0) - (b.startTime || 0);
    });

    var maxTrack = 0;
    for (var i = 0; i < sorted.length; i++) {
      maxTrack = Math.max(maxTrack, sorted[i].track || 0);
    }
    // Lane height grows with tracks
    var laneH = Math.max(32, (maxTrack + 1) * 28 + 8);
    musicLane.style.minHeight = laneH + 'px';
    if (musicTrack) musicTrack.style.minHeight = laneH + 'px';

    for (var j = 0; j < sorted.length; j++) {
      renderOneAudioBlock(sorted[j]);
    }
  }

  function renderOneAudioBlock(c) {
    if (!c || !musicLane) return;
    var logic = L();
    var vis = logic ? logic.audioClipDuration(c) : Math.max(0, (c.trimEnd || 0) - (c.trimStart || 0));
    var left = typeof timeToPx === 'function' ? timeToPx(c.startTime || 0) : 0;
    var width = typeof timeToPx === 'function' ? timeToPx(vis) : 40;
    var track = c.track != null ? c.track : 0;
    var top = 4 + track * 28;

    var block = document.createElement('div');
    var kindClass = c.kind === 'sfx' ? ' audio-sfx' : (c.kind === 'voice' ? ' audio-voice' : ' music');
    var sel = (typeof isSelected === 'function' && (isSelected(c.id) || (c.kind === 'music' && typeof MUSIC_ID !== 'undefined' && isSelected(MUSIC_ID))));
    block.className = 'media-block' + kindClass + (sel ? ' selected' : '') + (c.muted ? ' is-muted' : '');
    block.dataset.clipId = c.id;
    block.dataset.audioKind = c.kind || 'music';
    block.style.left = left + 'px';
    block.style.width = Math.max(width, 24) + 'px';
    block.style.top = top + 'px';
    block.style.height = '24px';

    // clipping badge
    if (logic && c.peaks && c.peaks.length) {
      var peak = 0;
      for (var pi = 0; pi < c.peaks.length; pi++) {
        peak = Math.max(peak, Math.abs(c.peaks[pi].max), Math.abs(c.peaks[pi].min));
      }
      if (logic.isClipping(peak, c.gain != null ? c.gain : 1)) {
        block.classList.add('is-clipping');
        var badge = document.createElement('div');
        badge.className = 'clipping-badge';
        badge.title = 'Clipping — ovoz 0 dBFS dan oshadi';
        badge.textContent = '!';
        block.appendChild(badge);
      }
    }

    var canvas = document.createElement('canvas');
    canvas.className = 'waveform';
    canvas.width = Math.max(Math.floor(width), 24);
    canvas.height = 24;
    block.appendChild(canvas);

    var label = document.createElement('div');
    label.className = 'label';
    var prefix = c.kind === 'sfx' ? 'SFX: ' : (c.kind === 'voice' ? 'VO: ' : '');
    label.textContent = (prefix + (c.name || 'Audio')).slice(0, 28);
    block.appendChild(label);

    if (c.muted) {
      var muteBadge = document.createElement('div');
      muteBadge.className = 'mute-badge';
      muteBadge.title = 'Muted';
      muteBadge.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      block.appendChild(muteBadge);
    }

    var leftHandle = document.createElement('div');
    leftHandle.className = 'trim-handle left';
    block.appendChild(leftHandle);
    var rightHandle = document.createElement('div');
    rightHandle.className = 'trim-handle right';
    block.appendChild(rightHandle);

    musicLane.appendChild(block);

    // Waveform from peaks
    if (typeof EMRAudioEngine !== 'undefined' && EMRAudioEngine.drawPeaksWaveform && c.peaks) {
      EMRAudioEngine.drawPeaksWaveform(canvas, c.peaks, c.trimStart, c.trimEnd);
    } else if (c.buffer && typeof drawWaveform === 'function') {
      drawWaveform(canvas, c.buffer, c.trimStart, c.trimEnd);
    } else {
      // placeholder
      var ctx2 = canvas.getContext('2d');
      ctx2.fillStyle = '#2a2a3e';
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Interactions — map to drag system via audio clip id
    if (typeof attachLongPress === 'function') {
      attachLongPress(block, {
        shouldSkip: function (e) { return e.target.classList.contains('trim-handle'); },
        onPointerDown: function () {
          if (typeof focusClip === 'function') focusClip(c.id);
          else if (typeof selectOnly === 'function') selectOnly(c.id);
        },
        onLongPress: function (e) {
          showAudioContextMenu(e.clientX, e.clientY, c);
        },
        onDragStart: function (e, origin) {
          // Use music drag path but with audio clip
          startAudioDrag(e, c, 'move', origin);
        },
      });
    }
    leftHandle.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (typeof selectOnly === 'function') selectOnly(c.id);
      startAudioDrag(e, c, 'trim-left');
    });
    rightHandle.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
      if (typeof selectOnly === 'function') selectOnly(c.id);
      startAudioDrag(e, c, 'trim-right');
    });
    block.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof focusClip === 'function') focusClip(c.id);
      if (typeof isTouchUi === 'function' && isTouchUi()) return;
      showAudioContextMenu(e.clientX, e.clientY, c);
    });
  }

  // Drag for audio clips — lightweight, updates audioClips then re-renders
  var audioDrag = null;
  function startAudioDrag(e, clip, type, origin) {
    e.preventDefault();
    if (typeof pushHistory === 'function' && type === 'move') { /* history on pointerup if changed */ }
    audioDrag = {
      clip: clip,
      type: type,
      startX: e.clientX,
      origStart: clip.startTime,
      origTrimStart: clip.trimStart,
      origTrimEnd: clip.trimEnd,
      changed: false,
    };
    if (typeof pushHistory === 'function') pushHistory();
    function onMove(ev) {
      if (!audioDrag) return;
      var dx = ev.clientX - audioDrag.startX;
      var dt = typeof pxToTime === 'function' ? pxToTime(dx) : dx / (state.pixelsPerSecond || 40);
      var c = audioDrag.clip;
      if (audioDrag.type === 'move') {
        var vis = (c.trimEnd - c.trimStart);
        var logic = L();
        var ns = Math.max(0, audioDrag.origStart + dt);
        if (logic && logic.resolveAudioStartTimeOnTrack) {
          ns = logic.resolveAudioStartTimeOnTrack(state.audioClips, c.track || 0, c.id, ns, vis);
        }
        c.startTime = ns;
        audioDrag.changed = true;
      } else if (audioDrag.type === 'trim-left') {
        var newTs = Math.max(0, Math.min(audioDrag.origTrimStart + dt, c.trimEnd - 0.1));
        var delta = newTs - audioDrag.origTrimStart;
        c.trimStart = newTs;
        c.startTime = Math.max(0, audioDrag.origStart + delta);
        audioDrag.changed = true;
      } else if (audioDrag.type === 'trim-right') {
        c.trimEnd = Math.max(c.trimStart + 0.1, Math.min(audioDrag.origTrimEnd + dt, c.duration || audioDrag.origTrimEnd + dt));
        audioDrag.changed = true;
      }
      syncMusicFromAudioClips();
      renderAllAudioBlocks();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (audioDrag && audioDrag.changed) {
        syncMusicFromAudioClips();
        if (typeof scheduleSave === 'function') scheduleSave();
      }
      audioDrag = null;
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function showAudioContextMenu(x, y, clip) {
    if (!clip) return;
    // Reuse music context menu patterns
    if (typeof showMusicContextMenu === 'function' && clip.kind === 'music' && state.music && state.music._audioClipId === clip.id) {
      // ensure state.music fields match
      syncMusicFromAudioClips();
      showMusicContextMenu(x, y);
      return;
    }
    // Generic audio menu
    var menu = document.querySelector('.clip-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'clip-context-menu';
      document.body.appendChild(menu);
    }
    menu.innerHTML = '';
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    function addItem(label, fn) {
      var it = document.createElement('div');
      it.className = 'ctx-item';
      it.textContent = label;
      it.addEventListener('click', function () {
        menu.style.display = 'none';
        fn();
      });
      menu.appendChild(it);
    }

    addItem(clip.muted ? 'Ovozni yoqish' : 'Ovozsiz', function () {
      if (typeof pushHistory === 'function') pushHistory();
      clip.muted = !clip.muted;
      syncMusicFromAudioClips();
      renderAllAudioBlocks();
      if (typeof scheduleSave === 'function') scheduleSave();
    });

    [0.5, 1, 1.5, 2].forEach(function (v) {
      addItem('Ovoz ' + Math.round(v * 100) + '%', function () {
        if (typeof pushHistory === 'function') pushHistory();
        clip.gain = v;
        syncMusicFromAudioClips();
        renderAllAudioBlocks();
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    });

    addItem('Fade in 0.5s', function () {
      if (typeof pushHistory === 'function') pushHistory();
      clip.fadeIn = 0.5;
      syncMusicFromAudioClips();
      renderAllAudioBlocks();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    addItem('Fade out 0.5s', function () {
      if (typeof pushHistory === 'function') pushHistory();
      clip.fadeOut = 0.5;
      syncMusicFromAudioClips();
      renderAllAudioBlocks();
      if (typeof scheduleSave === 'function') scheduleSave();
    });

    if (clip.kind === 'music') {
      addItem(clip.duck !== false ? 'Ducking o\'chirish' : 'Ducking yoqish', function () {
        if (typeof pushHistory === 'function') pushHistory();
        clip.duck = clip.duck === false ? true : false;
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    }

    addItem('Ovozni tekislash', function () {
      normalizeAudioClip(clip);
    });

    addItem('O\'chirish', function () {
      deleteAudioClip(clip.id);
    });

    setTimeout(function () {
      function close(ev) {
        if (!menu.contains(ev.target)) {
          menu.style.display = 'none';
          document.removeEventListener('pointerdown', close, true);
        }
      }
      document.addEventListener('pointerdown', close, true);
    }, 0);
  }

  function deleteAudioClip(id) {
    if (typeof pushHistory === 'function') pushHistory();
    state.audioClips = (state.audioClips || []).filter(function (c) { return c.id !== id; });
    syncMusicFromAudioClips();
    renderAllAudioBlocks();
    if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof showToast === 'function') showToast('Audio o\'chirildi');
  }

  function normalizeAudioClip(clip) {
    if (!clip || !clip.peaks || !clip.peaks.length) {
      if (typeof showToast === 'function') showToast('Waveform yo\'q — avval audio yuklang');
      return;
    }
    // Approximate RMS/peak from peaks
    var sumSq = 0, peak = 0, n = clip.peaks.length;
    for (var i = 0; i < n; i++) {
      var mn = Math.abs(clip.peaks[i].min);
      var mx = Math.abs(clip.peaks[i].max);
      var p = Math.max(mn, mx);
      if (p > peak) peak = p;
      sumSq += p * p;
    }
    var rms = Math.sqrt(sumSq / n);
    var rmsDb = rms > 1e-12 ? 20 * Math.log10(rms) : -120;
    var peakDb = peak > 1e-12 ? 20 * Math.log10(peak) : -120;
    var logic = L();
    var g = logic ? logic.computeNormalizeGain(rmsDb, peakDb, -16) : 1;
    if (typeof pushHistory === 'function') pushHistory();
    clip.gain = Math.round(g * 100) / 100;
    syncMusicFromAudioClips();
    renderAllAudioBlocks();
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof showToast === 'function') showToast('Ovoz tekislandi (' + Math.round(clip.gain * 100) + '%)');
  }

  /**
   * Detach audio from selected video clip → new voice audioClip, mute video.
   */
  async function detachAudioFromVideoClip(clip) {
    if (!clip || clip.isImage) {
      if (typeof showToast === 'function') showToast('Video clip tanlang');
      return;
    }
    if (!clip.file && !clip.url) {
      if (typeof showToast === 'function') showToast('Fayl topilmadi');
      return;
    }
    // Speed != 1: reject for safety (pitch issues without time-stretch)
    var sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
    if (Math.abs(sp - 1) > 0.01) {
      if (typeof showToast === 'function') {
        showToast('Avval tezlikni 1× qiling — speed≠1 da ajratish qo\'llab-quvvatlanmaydi');
      }
      return;
    }
    if (typeof pushHistory === 'function') pushHistory();
    try {
      var file = clip.file;
      if (!file && clip.url) {
        // Can't easily re-fetch; use existing if possible
        if (typeof showToast === 'function') showToast('Fayl mavjud emas');
        return;
      }
      // Check if video has audio by trying decode
      var hasAudio = true;
      try {
        var ab = await file.arrayBuffer();
        var actx = new (window.AudioContext || window.webkitAudioContext)();
        var buf = await actx.decodeAudioData(ab.slice(0));
        hasAudio = buf.numberOfChannels > 0 && buf.duration > 0;
        try { actx.close(); } catch (_) {}
        buf = null;
      } catch (e) {
        hasAudio = false;
      }
      if (!hasAudio) {
        if (typeof showToast === 'function') showToast('Bu videoda ovoz yo\'q');
        return;
      }
      var ac = await loadAudioClipFromFile(file, {
        kind: 'voice',
        startTime: clip.startTime,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        track: 2,
      });
      // Share same fileId
      if (clip.fileId) ac.fileId = clip.fileId;
      clip.muted = true;
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof showToast === 'function') showToast('Ovoz ajratildi (voice qator)');
      if (typeof scheduleSave === 'function') scheduleSave();
    } catch (err) {
      console.error(err);
      if (typeof showToast === 'function') showToast('Ajratib bo\'lmadi');
    }
  }

  // Legacy API used by rest of app
  async function addMusic(file) {
    return addAudioFiles([file], 'music');
  }

  async function loadMusicFromFile(file, overrides) {
    overrides = overrides || {};
    overrides.kind = overrides.kind || 'music';
    return loadAudioClipFromFile(file, overrides);
  }

  function renderMusicBlock() {
    renderAllAudioBlocks();
  }

  function drawWaveform(canvas, buffer, trimStart, trimEnd) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = (typeof BRAND !== 'undefined' && BRAND.whiteDeep) ? BRAND.whiteDeep : '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    if (!buffer) return;
    var channel = buffer.getChannelData(0);
    var sampleRate = buffer.sampleRate;
    var startSample = Math.floor(trimStart * sampleRate);
    var endSample = Math.floor(trimEnd * sampleRate);
    var samples = endSample - startSample;
    var samplesPerPixel = samples / w;
    ctx.fillStyle = (typeof BRAND !== 'undefined' && BRAND.white) ? BRAND.white : '#eee';
    for (var x = 0; x < w; x++) {
      var start = startSample + Math.floor(x * samplesPerPixel);
      var end = startSample + Math.floor((x + 1) * samplesPerPixel);
      var min = 1, max = -1;
      for (var i = start; i < end && i < channel.length; i++) {
        var v = channel[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      var y1 = ((1 + min) / 2) * h;
      var y2 = ((1 + max) / 2) * h;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }

  // Init SFX button
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSfxButton);
  } else {
    ensureSfxButton();
  }

  // Export to global (classic scripts)

  function ensureDuckButton() {
    if (document.getElementById('duck-btn')) return;
    var musicBtn = document.getElementById('music-btn');
    if (!musicBtn || !musicBtn.parentNode) return;
    var btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.id = 'duck-btn';
    btn.title = 'Ducking (musiqa pastga)';
    btn.textContent = 'Duck';
    musicBtn.parentNode.appendChild(btn);
    function refresh() {
      var on = state.duckingSettings && state.duckingSettings.enabled;
      btn.classList.toggle('active', !!on);
      btn.title = on ? 'Ducking yoqilgan (bosib o\'chirish)' : 'Ducking o\'chiq (bosib yoqish)';
    }
    btn.addEventListener('click', function () {
      if (!state.duckingSettings) {
        state.duckingSettings = { enabled: false, amountDb: -12, attackMs: 150, releaseMs: 400, includeVideoAudio: true };
      }
      if (typeof pushHistory === 'function') pushHistory();
      state.duckingSettings.enabled = !state.duckingSettings.enabled;
      refresh();
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof showToast === 'function') {
        showToast(state.duckingSettings.enabled ? 'Ducking yoqildi (−12 dB)' : 'Ducking o\'chirildi');
      }
    });
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var cur = (state.duckingSettings && state.duckingSettings.amountDb) || -12;
      var v = prompt('Ducking miqdori (dB), -6..-24', String(cur));
      if (v == null) return;
      var n = parseFloat(v);
      if (!isFinite(n)) return;
      n = Math.max(-24, Math.min(-6, n));
      if (!state.duckingSettings) state.duckingSettings = { enabled: true, amountDb: n, attackMs: 150, releaseMs: 400, includeVideoAudio: true };
      else { state.duckingSettings.amountDb = n; state.duckingSettings.enabled = true; }
      refresh();
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof showToast === 'function') showToast('Ducking: ' + n + ' dB');
    });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureDuckButton);
  else ensureDuckButton();

  window.addMusic = addMusic;
  window.loadMusicFromFile = loadMusicFromFile;
  window.renderMusicBlock = renderMusicBlock;
  window.renderAllAudioBlocks = renderAllAudioBlocks;
  window.drawWaveform = drawWaveform;
  window.deleteAudioClip = deleteAudioClip;
  window.normalizeAudioClip = normalizeAudioClip;
  window.detachAudioFromVideoClip = detachAudioFromVideoClip;
  window.syncMusicFromAudioClips = syncMusicFromAudioClips;
  window.syncAudioClipFromMusic = syncAudioClipFromMusic;
  window.addAudioFiles = addAudioFiles;
  window.loadAudioClipFromFile = loadAudioClipFromFile;
  window.showAudioContextMenu = showAudioContextMenu;
})();

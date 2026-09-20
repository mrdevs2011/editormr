    // ===================== VIDEO BLOCKS (multi-clip + select + split) =====================
    function renderVideoBlock() {
      videoLane.innerHTML = '';
      if (!state.videoClips.length) return;

      const pitch = getVideoRowHeight();
      if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();

      let maxMain = 0;
      const floatIds = [];
      for (const c of state.videoClips) {
        if (isFloated(c)) floatIds.push(c.id);
        else maxMain = Math.max(maxMain, clipTrackIndex(c));
      }

      for (const clip of state.videoClips) {
        const left = timeToPx(clip.startTime);
        const width = Math.max(timeToPx(clipDuration(clip)), 24);
        const floated = isFloated(clip);
        const track = floated ? 0 : clipTrackIndex(clip);
        if (!floated) applyClipTrack(clip, track);
        const row = floated
          ? (maxMain + 1 + Math.max(0, floatIds.indexOf(clip.id)))
          : track;

        const block = document.createElement('div');
        block.className = 'media-block video'
          + (isSelected(clip.id) ? ' selected' : '')
          + (clip.muted ? ' is-muted' : '')
          + (floated ? ' is-float' : '');
        block.dataset.clipId = clip.id;
        block.dataset.track = String(track);
        block.style.left = left + 'px';
        block.style.width = width + 'px';
        block.style.top = (3 + row * pitch) + 'px';

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(width);
        canvas.height = 24;
        canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;';
        block.appendChild(canvas);
        drawFilmstripOnCanvas(canvas, clip);

        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = (clip.name || state.videoFile?.name || (clip.isImage ? 'Photo' : 'Video')).slice(0, 28);
        label.style.cssText = 'bottom:1px;top:auto;transform:none;background:rgba(0,0,0,0.45);padding:1px 6px;border-radius:3px;font-size:0.65rem;';
        block.appendChild(label);

        if (floated) {
          const fl = document.createElement('div');
          fl.className = 'float-badge';
          fl.title = 'Float';
          fl.textContent = 'F';
          block.appendChild(fl);
        }

        if (clip.muted && !clip.isImage) {
          const muteBadge = document.createElement('div');
          muteBadge.className = 'mute-badge';
          muteBadge.title = 'Muted';
          muteBadge.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
          block.appendChild(muteBadge);
        }

        const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
        if (!clip.isImage && Math.abs(sp - 1) > 0.001) {
          const speedBadge = document.createElement('div');
          speedBadge.className = 'speed-badge';
          speedBadge.title = 'Speed ' + sp + '×';
          speedBadge.textContent = sp + '×';
          block.appendChild(speedBadge);
        }

        if (!clip.isImage && clip.transitionType && clip.transitionType !== 'none') {
          const tb = document.createElement('div');
          tb.className = 'transition-badge';
          const td = clip.transitionDuration != null ? clip.transitionDuration : 0.3;
          const tm = getTransitionMeta(clip.transitionType);
          tb.title = (tm ? tm.label : clip.transitionType) + ' (' + td + 's)';
          tb.textContent = getTransitionBadge(clip.transitionType) || '•';
          block.appendChild(tb);
        }

        const fi = clip.fadeIn || 0;
        const fo = clip.fadeOut || 0;
        if (fi > 0) {
          const fiEl = document.createElement('div');
          fiEl.className = 'fade-in-overlay';
          fiEl.style.width = Math.min(width, timeToPx(fi)) + 'px';
          block.appendChild(fiEl);
        }
        if (fo > 0) {
          const foEl = document.createElement('div');
          foEl.className = 'fade-out-overlay';
          foEl.style.width = Math.min(width, timeToPx(fo)) + 'px';
          block.appendChild(foEl);
        }

        const leftHandle = document.createElement('div');
        leftHandle.className = 'trim-handle left';
        block.appendChild(leftHandle);

        const rightHandle = document.createElement('div');
        rightHandle.className = 'trim-handle right';
        block.appendChild(rightHandle);

        videoLane.appendChild(block);

        // Chap tugma: tanlash + move; long-press → context menu (mobile)
        attachLongPress(block, {
          shouldSkip: (e) => e.target.classList.contains('trim-handle'),
          onPointerDown: () => {
            focusClip(clip.id);
            ensurePreviewForClip(clip);
            renderVideoBlock();
          },
          onLongPress: (e) => {
            if (typeof isTouchUi === 'function' && isTouchUi()) return;
            showClipContextMenu(e.clientX, e.clientY, clip.id);
          },
          onDragStart: (e) => {
            startDrag(e, 'video', 'move', clip.id);
          },
        });
        leftHandle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          selectOnly(clip.id);
          startDrag(e, 'video', 'trim-left', clip.id);
        });
        rightHandle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          selectOnly(clip.id);
          startDrag(e, 'video', 'trim-right', clip.id);
        });

        // O'ng tugma: context menu
        block.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          focusClip(clip.id);
          renderVideoBlock();
          if (typeof isTouchUi === 'function' && isTouchUi()) return;
          showClipContextMenu(e.clientX, e.clientY, clip.id);
        });
      }

      // Cliplar ORASIDAGI transition tugmalari (oxirgi clipning o'ng chetida YO'Q)
      renderTransitionJunctions();
      // Transition toast ochiq bo'lsa (undo/redo, split, o'chirish...) holatini yangilaydi
      if (typeof syncTransitionToast === 'function') syncTransitionToast();
    }

    function renderTransitionJunctions() {
      const pitch = getVideoRowHeight();
      const byTrack = new Map();
      for (const c of state.videoClips) {
        if (isFloated(c)) continue;
        const tr = clipTrackIndex(c);
        if (!byTrack.has(tr)) byTrack.set(tr, []);
        byTrack.get(tr).push(c);
      }
      for (const [tr, list] of byTrack) {
        list.sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < list.length - 1; i++) {
          const leftClip = list[i];
          const rightClip = list[i + 1];
          if (clipsTimeOverlap(leftClip.startTime, clipEnd(leftClip), rightClip.startTime, clipEnd(rightClip))) continue;
        const x = timeToPx(clipEnd(leftClip));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'transition-junction'
          + (leftClip.transitionType && leftClip.transitionType !== 'none' ? ' active' : '');
        btn.title = 'Transition';
        btn.dataset.clipId = leftClip.id;
        btn.setAttribute('aria-label', 'Transition');
        const tt = leftClip.transitionType || 'none';
        const badge = getTransitionBadge(tt);
        if (badge) btn.textContent = badge;
        else btn.innerHTML = '<span class="tj-icon"></span>';
        btn.style.left = (x - 9) + 'px';
        btn.style.top = (3 + tr * pitch + pitch / 2) + 'px';
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleTransitionToast(leftClip.id);
        });
        videoLane.appendChild(btn);
        }
      }
    }

    function drawFilmstripOnCanvas(canvas, clip) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      const fs = clip.filmstrip || state.filmstrip;

      if (!fs) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, BRAND.blueDeep);
        grad.addColorStop(1, BRAND.blue);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        return;
      }

      const visibleStart = clip.trimStart;
      const visibleEnd = clip.trimEnd;
      const visibleDur = Math.max(0.01, visibleEnd - visibleStart);

      if (fs.isImage) {
        const fw = fs.frameWidth;
        for (let x = 0; x < w; x += fw) {
          ctx.drawImage(fs.canvas, 0, 0, fw, h, x, 0, Math.min(fw, w - x), h);
        }
      } else {
        const fullDur = fs.duration || clip.duration || state.videoDuration;
        const srcX = (visibleStart / fullDur) * fs.canvas.width;
        const srcW = (visibleDur / fullDur) * fs.canvas.width;
        ctx.drawImage(
          fs.canvas,
          srcX, 0, Math.max(1, srcW), h,
          0, 0, w, h
        );
      }
    }


    // ===================== HELPERS =====================
    // EMR brend ranglari (CSS dagi --brand-* bilan bir xil; canvas CSS var o'qimaydi)
    const BRAND = {
      blue: '#5d95ad',
      blueDeep: '#2a4a59',
      white: '#f4f7f8',
      whiteDeep: '#1d2f38',   // musiqa waveform foni
    };

    function showToast(msg, duration = 2500) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), duration);
    }

    function formatTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function timeToPx(t) {
      return t * state.pixelsPerSecond;
    }

    function pxToTime(px) {
      return px / state.pixelsPerSecond;
    }

    // Backward-compat helper (single selected / first clip)
    function videoVisibleDuration() {
      const c = getSelectedClip() || state.videoClips[0];
      return c ? clipDuration(c) : 0;
    }

    function updateBlackOverlay() {
      if (findClipAtTime(state.currentTime)) blackOverlay.classList.remove('show');
      else blackOverlay.classList.add('show');
    }

    // volume 0–1, muted bool — muted bo'lsa element.muted=true (volume qiymati saqlanadi)
    function applyMediaVolume(el, obj) {
      if (!el || !obj) return;
      const vol = obj.volume != null ? obj.volume : 1;
      el.volume = Math.max(0, Math.min(1, vol));
      el.muted = !!obj.muted;
    }

    function applyMusicVolume() {
      if (state.music?.audio) applyMediaVolume(state.music.audio, state.music);
    }

    function applyPreviewClipVolume(clip) {
      if (!clip || clip.isImage) {
        previewVideo.muted = true;
        return;
      }
      applyMediaVolume(previewVideo, clip);
    }

    function applyPreviewClipSpeed(clip) {
      if (!clip || clip.isImage) {
        previewVideo.playbackRate = 1;
        return;
      }
      const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      previewVideo.playbackRate = sp;
    }

    // Fade in/out opacity (0–1) for a clip at timeline time t
    function getClipOpacity(clip, t) {
      if (!clip) return 1;
      const start = clip.startTime;
      const end = clipEnd(clip);
      const dur = Math.max(0.001, end - start);
      let fi = Math.max(0, clip.fadeIn || 0);
      let fo = Math.max(0, clip.fadeOut || 0);
      const maxF = dur / 2;
      if (fi > maxF) fi = maxF;
      if (fo > maxF) fo = maxF;

      if (t < start || t >= end) return 0;
      if (fi > 0 && t < start + fi) {
        return Math.max(0, Math.min(1, (t - start) / fi));
      }
      if (fo > 0 && t > end - fo) {
        return Math.max(0, Math.min(1, (end - t) / fo));
      }
      return 1;
    }

    function applyPreviewClipFade(clip) {
      if (!clip) {
        previewVideo.style.opacity = '1';
        const imgEl = document.getElementById('image-preview');
        if (imgEl) imgEl.style.opacity = '1';
        return;
      }
      const op = getClipOpacity(clip, state.currentTime);
      if (clip.isImage) {
        const imgEl = document.getElementById('image-preview');
        if (imgEl) imgEl.style.opacity = String(op);
        previewVideo.style.opacity = '1';
      } else {
        previewVideo.style.opacity = String(op);
      }
    }


    function getSelectedForClipboard() {
      // Text clip tanlanganmi?
      const textId = [...(state.selectedIds || [])].find(id => String(id).startsWith('t') && getTextClipById(id));
      if (textId) {
        const tc = getTextClipById(textId);
        if (tc) return { type: 'text', data: tc };
      }
      // selectedClipId text bo'lishi mumkin
      if (state.selectedClipId && String(state.selectedClipId).startsWith('t')) {
        const tc = getTextClipById(state.selectedClipId);
        if (tc) return { type: 'text', data: tc };
      }
      const clip = getSelectedClip();
      if (clip) return { type: 'clip', data: clip };
      // selectedIds ichidan video
      for (const id of (state.selectedIds || [])) {
        const c = getClipById(id);
        if (c) return { type: 'clip', data: c };
      }
      return null;
    }

    function copySelectedToClipboard() {
      const sel = getSelectedForClipboard();
      if (!sel) {
        showToast('Nusxa olish uchun clip tanlang');
        return false;
      }
      // File/Audio elementlarni nusxalamaymiz — reference saqlanadi
      const data = { ...sel.data };
      delete data.audio;
      state.clipboard = { type: sel.type, data };
      showToast('Nusxalandi');
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
      return true;
    }

    function pasteFromClipboard(atPlayhead) {
      if (!state.clipboard || !state.clipboard.data) {
        showToast('Clipboard bo\'sh');
        return false;
      }
      pushHistory();
      const src = state.clipboard.data;
      const type = state.clipboard.type;

      if (type === 'text') {
        if (!state.textClips) state.textClips = [];
        const tc = {
          ...src,
          id: makeTextClipId(),
          startTime: atPlayhead ? (state.currentTime || 0) : textClipEnd(src),
        };
        state.textClips.push(tc);
        selectOnly(tc.id);
        if (typeof renderTextLane === 'function') renderTextLane();
        updateTimelineLayout();
        if (typeof updateTextOverlays === 'function') updateTextOverlays();
        scheduleSave();
        showToast(atPlayhead ? 'Joylashtirildi' : 'Dublikat qo\'shildi');
        if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
        return true;
      }

      // video clip
      const newClip = {
        ...src,
        id: makeClipId(),
        startTime: atPlayhead ? (state.currentTime || 0) : clipEnd(src),
      };
      // File/url reference saqlanadi
      state.videoClips.push(newClip);
      selectOnly(newClip.id);
      renderVideoBlock();
      updateTimelineLayout();
      scheduleSave();
      showToast(atPlayhead ? 'Joylashtirildi' : 'Dublikat qo\'shildi');
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
      return true;
    }

    function duplicateSelected() {
      const sel = getSelectedForClipboard();
      if (!sel) {
        showToast('Dublikat uchun clip tanlang');
        return false;
      }
      // Clipboardga vaqtincha yozmasdan to'g'ridan-to'g'ri
      const prev = state.clipboard;
      state.clipboard = { type: sel.type, data: { ...sel.data } };
      const ok = pasteFromClipboard(false);
      state.clipboard = prev;
      return ok;
    }

    // Touch long-press (context menu) + delayed drag
    function attachLongPress(el, opts) {
      const delay = opts.delay != null ? opts.delay : 500;
      const threshold = opts.threshold != null ? opts.threshold : 8;
      const onLongPress = opts.onLongPress;
      const onDragStart = opts.onDragStart;
      const shouldSkip = opts.shouldSkip || (() => false);

      let timer = null;
      let startX = 0, startY = 0;
      let longFired = false;
      let dragStarted = false;
      let pointerId = null;

      function clearTimer() {
        if (timer != null) {
          clearTimeout(timer);
          timer = null;
        }
      }

      function cleanup() {
        clearTimer();
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      }

      function onMove(ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > threshold) {
          clearTimer();
          if (!longFired && !dragStarted && onDragStart) {
            dragStarted = true;
            onDragStart(ev);
          }
        }
      }

      function onUp(ev) {
        if (pointerId != null && ev.pointerId !== pointerId) return;
        cleanup();
      }

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (shouldSkip(e)) return;
        longFired = false;
        dragStarted = false;
        startX = e.clientX;
        startY = e.clientY;
        pointerId = e.pointerId;
        if (opts.onPointerDown) opts.onPointerDown(e);
        clearTimer();
        timer = setTimeout(() => {
          timer = null;
          longFired = true;
          if (onLongPress) onLongPress(e);
        }, delay);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    }

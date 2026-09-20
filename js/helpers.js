    // ===================== HELPERS =====================
    // EMR brend ranglari (CSS dagi --brand-* bilan bir xil; canvas CSS var o'qimaydi)
    const BRAND = {
      blue: '#5d95ad',
      blueDeep: '#2a4a59',
      white: '#f4f7f8',
      whiteDeep: '#1d2f38',   // musiqa waveform foni
    };

    // Telefon / planshet: context-menu yo'q. Desktop (sichqoncha) da qoladi.
    function isTouchUi() {
      try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) return true;
        const tp = navigator.maxTouchPoints || 0;
        const ua = navigator.userAgent || '';
        if (/iPad/i.test(ua)) return true;
        if (navigator.platform === 'MacIntel' && tp > 1) return true; // iPadOS desktop mode
        if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return true;
        if (tp > 0 && Math.min(window.innerWidth, window.innerHeight) <= 1024) return true;
        return false;
      } catch (_) {
        return ('ontouchstart' in window);
      }
    }

    function isDesktopUi() {
      return !isTouchUi();
    }

    function syncTouchUiClass() {
      const touch = isTouchUi();
      document.documentElement.classList.toggle('is-touch-ui', touch);
      if (document.body) document.body.classList.toggle('is-touch-ui', touch);
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', syncTouchUiClass);
    } else {
      syncTouchUiClass();
    }
    window.addEventListener('resize', syncTouchUiClass);
    window.addEventListener('orientationchange', syncTouchUiClass);


    // Blob URL registry — memory leak kamaytirish
    const _objectUrls = new Set();
    function trackObjectUrl(url) {
      if (url && String(url).startsWith('blob:')) _objectUrls.add(url);
      return url;
    }
    function releaseObjectUrl(url) {
      if (!url || !_objectUrls.has(url)) return;
      _objectUrls.delete(url);
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    function releaseAllObjectUrls(exceptSet) {
      const keep = exceptSet || new Set();
      for (const u of [..._objectUrls]) {
        if (!keep.has(u)) releaseObjectUrl(u);
      }
    }

    function showToast(msg, duration = 2500) {
      if (!toast) return;
      toast.textContent = String(msg == null ? '' : msg);
      toast.classList.add('show');
      clearTimeout(showToast._timer);
      showToast._timer = setTimeout(() => toast.classList.remove('show'), duration);
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

    
    // Playhead/scrub: to'g'ri clip manbasini ochib, lokal vaqtga seek qilish.
    // Pause paytida boshqa clip'ga o'tganda preview eski manbada qolib ketmasligi uchun.
    let _seekPreviewClipId = null;
    let _seekGen = 0;
    async function seekPreviewToTime(t) {
      const gen = ++_seekGen;
      const c = findClipAtTime(t);
      if (!c) {
        _seekPreviewClipId = null;
        if (typeof previewVideo !== 'undefined' && previewVideo) {
          try { previewVideo.pause(); } catch (_) {}
        }
        if (typeof updateBlackOverlay === 'function') updateBlackOverlay();
        if (typeof resetPlaybackClipCache === 'function') resetPlaybackClipCache(null);
        if (typeof updatePreviewTransition === 'function') updatePreviewTransition(t);
        if (typeof updatePreviewFloat === 'function') updatePreviewFloat(t);
        return;
      }
      if (typeof blackOverlay !== 'undefined' && blackOverlay) blackOverlay.classList.remove('show');
      const needSwap = _seekPreviewClipId !== c.id ||
        (typeof state !== 'undefined' && state.videoUrl && c.url && state.videoUrl !== c.url);
      if (needSwap) {
        _seekPreviewClipId = c.id;
        if (typeof ensurePreviewForClip === 'function') {
          await ensurePreviewForClip(c);
          if (gen !== _seekGen) return; // eskirgan scrub
        }
      }
      if (c.isImage) {
        if (typeof resetPlaybackClipCache === 'function') resetPlaybackClipCache(c.id);
        if (typeof updatePreviewTransition === 'function') updatePreviewTransition(t);
        if (typeof updatePreviewFloat === 'function') updatePreviewFloat(t);
        return;
      }
      if (typeof applyPreviewClipVolume === 'function') applyPreviewClipVolume(c);
      if (typeof applyPreviewClipSpeed === 'function') applyPreviewClipSpeed(c);
      const local = timelineToSource(c, t);
      const maxT = (c.duration || state.videoDuration || 5) - 0.05;
      if (typeof previewVideo !== 'undefined' && previewVideo) {
        try {
          previewVideo.currentTime = Math.max(0, Math.min(local, maxT));
        } catch (_) {}
      }
      if (typeof resetPlaybackClipCache === 'function') resetPlaybackClipCache(c.id);
      if (typeof updatePreviewTransition === 'function') updatePreviewTransition(t);
      if (typeof updatePreviewFloat === 'function') updatePreviewFloat(t);
    }


    // ========== PREVIEW TRANSITION (real-time dual layer) ==========
    // Export / toast bilan bir xil getTransitionLayers(). Bitta video + B qatlam.
    let _previewBClipId = null;
    let _transPreviewActive = false;
    let _transGen = 0;

    function stylePreviewLayer(el, L, z) {
      if (!el) return;
      const st = el.style;
      st.zIndex = String(z);
      st.opacity = String(L.a);
      st.transform = 'translate3d(' + (L.tx * 100) + '%,' + (L.ty * 100) + '%,0) scale(' + L.s + ')';
      // blur: 0.04 * min(vw,vh) taxminan — to'liq preview uchun 24px * (blur/0.04)
      const blurPx = L.blur > 0 ? (L.blur / 0.04) * 24 : 0;
      st.filter = blurPx > 0.1 ? 'blur(' + blurPx.toFixed(1) + 'px)' : 'none';
      st.clipPath = L.clip
        ? 'inset(' + (L.clip[1] * 100) + '% ' + ((1 - L.clip[2]) * 100) + '% ' +
          ((1 - L.clip[3]) * 100) + '% ' + (L.clip[0] * 100) + '%)'
        : 'none';
    }

    function resetPreviewLayerStyle(el) {
      if (!el) return;
      el.style.zIndex = '';
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
      el.style.clipPath = 'none';
    }

    async function ensurePreviewLayerB(clip) {
      if (!clip || !previewVideoB) return;
      const imgB = document.getElementById('image-preview-b');
      if (clip.isImage) {
        if (imgB) {
          imgB.hidden = false;
          if (imgB.src !== clip.url) imgB.src = clip.url;
        }
        previewVideoB.style.display = 'none';
        try { previewVideoB.pause(); } catch (_) {}
      } else {
        if (imgB) imgB.hidden = true;
        previewVideoB.style.display = 'block';
        if (_previewBClipId !== clip.id || !previewVideoB.src ||
            (clip.url && previewVideoB.src !== clip.url && previewVideoB.currentSrc !== clip.url)) {
          previewVideoB.src = clip.url;
          await new Promise((r) => {
            const done = () => { previewVideoB.onloadeddata = null; previewVideoB.onerror = null; r(); };
            previewVideoB.onloadeddata = done;
            previewVideoB.onerror = done;
            setTimeout(done, 2500);
          });
        }
        _previewBClipId = clip.id;
        // B ovoz chiqarmasin — asosiy A/musiqa
        previewVideoB.muted = true;
        previewVideoB.volume = 0;
      }
    }

    function seekLayerMedia(clip, tTimeline, videoEl, imgEl) {
      if (!clip) return;
      if (clip.isImage) {
        if (imgEl) {
          imgEl.hidden = false;
          if (imgEl.src !== clip.url) imgEl.src = clip.url;
        }
        if (videoEl) {
          videoEl.style.display = 'none';
          try { videoEl.pause(); } catch (_) {}
        }
        return;
      }
      if (imgEl) imgEl.hidden = true;
      if (!videoEl) return;
      videoEl.style.display = 'block';
      const local = timelineToSource(clip, tTimeline);
      const maxT = (clip.duration || 5) - 0.05;
      try {
        videoEl.currentTime = Math.max(0, Math.min(local, maxT));
      } catch (_) {}
    }

    /** Transition zonasida ikki qatlam; tashqarida oddiy bitta preview */
    async function updatePreviewTransition(t) {
      const layerA = typeof previewLayerA !== 'undefined' ? previewLayerA : document.getElementById('preview-layer-a');
      const layerB = typeof previewLayerB !== 'undefined' ? previewLayerB : document.getElementById('preview-layer-b');
      const stack = typeof previewStack !== 'undefined' ? previewStack : document.getElementById('preview-stack');
      if (!layerA || !layerB) return;

      const trans = typeof getActiveTransition === 'function' ? getActiveTransition(t) : null;
      if (!trans) {
        if (!_transPreviewActive) return;
        {
          layerB.classList.remove('is-active');
          layerB.style.visibility = 'hidden';
          layerB.style.opacity = '0';
          resetPreviewLayerStyle(layerA);
          resetPreviewLayerStyle(layerB);
          if (stack) stack.style.background = '#000';
          if (typeof previewVideoB !== 'undefined' && previewVideoB) {
            try { previewVideoB.pause(); } catch (_) {}
          }
          _transPreviewActive = false;
        }
        return;
      }

      const gen = ++_transGen;
      _transPreviewActive = true;
      layerB.classList.add('is-active');
      layerB.style.visibility = 'visible';

      const { from: clipA, to: clipB, progress, start: tStart } = trans;
      const L = getTransitionLayers(clipA.transitionType || 'fade', progress);
      if (stack) stack.style.background = L.bg || '#000';

      const tB = Math.max(
        clipB.startTime,
        Math.min(clipEnd(clipB) - 0.04, clipB.startTime + Math.max(0, t - tStart))
      );

      await ensurePreviewLayerB(clipB);
      if (gen !== _transGen) return;

      // A: play paytida har frame seek qilmaslik (playbackni buzadi).
      // Faqat paused/scrub yoki katta drift bo'lsa seek.
      if (!clipA.isImage && typeof previewVideo !== 'undefined' && previewVideo) {
        const localA = timelineToSource(clipA, Math.min(t, clipEnd(clipA) - 0.001));
        const maxA = (clipA.duration || 5) - 0.05;
        const target = Math.max(0, Math.min(localA, maxA));
        const drift = Math.abs((previewVideo.currentTime || 0) - target);
        if (!state.isPlaying || drift > 0.2 || previewVideo.paused) {
          try { previewVideo.currentTime = target; } catch (_) {}
        }
        if (state.isPlaying && previewVideo.paused) {
          applyPreviewClipVolume(clipA);
          applyPreviewClipSpeed(clipA);
          previewVideo.play().catch(() => {});
        }
      }

      const imgB = document.getElementById('image-preview-b');
      const vB = typeof previewVideoB !== 'undefined' ? previewVideoB : null;
      if (clipB.isImage) {
        seekLayerMedia(clipB, tB, vB, imgB);
      } else if (vB) {
        const localB = timelineToSource(clipB, tB);
        const maxB = (clipB.duration || 5) - 0.05;
        const targetB = Math.max(0, Math.min(localB, maxB));
        const driftB = Math.abs((vB.currentTime || 0) - targetB);
        if (!state.isPlaying || driftB > 0.25 || vB.paused) {
          try { vB.currentTime = targetB; } catch (_) {}
        }
        vB.muted = true;
        vB.volume = 0;
        if (state.isPlaying) {
          const sp = (clipB.speed && clipB.speed > 0) ? clipB.speed : 1;
          try {
            vB.playbackRate = sp;
            if (vB.paused) vB.play().catch(() => {});
          } catch (_) {}
        } else {
          try { vB.pause(); } catch (_) {}
        }
      }

      stylePreviewLayer(layerA, L.a, L.top === 'a' ? 2 : 1);
      stylePreviewLayer(layerB, L.b, L.top === 'a' ? 1 : 2);
    }

    let _previewFloatId = null;
    async function updatePreviewFloat(t) {
      const layer = typeof previewLayerFloat !== 'undefined'
        ? previewLayerFloat
        : document.getElementById('preview-layer-float');
      const vEl = typeof previewVideoFloat !== 'undefined'
        ? previewVideoFloat
        : document.getElementById('preview-video-float');
      const imgEl = document.getElementById('image-preview-float');
      if (!layer) return;
      const floats = typeof findFloatedAtTime === 'function' ? findFloatedAtTime(t) : [];
      const clip = floats.length ? floats[floats.length - 1] : null;
      if (!clip) {
        layer.classList.remove('is-active');
        layer.style.opacity = '0';
        if (vEl) try { vEl.pause(); } catch (_) {}
        _previewFloatId = null;
        return;
      }
      layer.classList.add('is-active');
      layer.style.opacity = String(typeof getClipOpacity === 'function' ? getClipOpacity(clip, t) : 1);
      if (clip.isImage) {
        if (vEl) {
          vEl.style.display = 'none';
          try { vEl.pause(); } catch (_) {}
        }
        if (imgEl) {
          imgEl.hidden = false;
          if (imgEl.src !== clip.url) imgEl.src = clip.url;
        }
        _previewFloatId = clip.id;
        return;
      }
      if (imgEl) imgEl.hidden = true;
      if (!vEl) return;
      vEl.style.display = 'block';
      vEl.muted = true;
      if (_previewFloatId !== clip.id || (clip.url && vEl.src !== clip.url && vEl.currentSrc !== clip.url)) {
        vEl.src = clip.url;
        _previewFloatId = clip.id;
        await new Promise((r) => {
          const done = () => { vEl.onloadeddata = null; vEl.onerror = null; r(); };
          vEl.onloadeddata = done;
          vEl.onerror = done;
          setTimeout(done, 2000);
        });
      }
      const local = timelineToSource(clip, t);
      const maxT = (clip.duration || 5) - 0.05;
      const target = Math.max(0, Math.min(local, maxT));
      const drift = Math.abs((vEl.currentTime || 0) - target);
      if (!state.isPlaying || drift > 0.2 || vEl.paused) {
        try { vEl.currentTime = target; } catch (_) {}
      }
      const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      try { vEl.playbackRate = sp; } catch (_) {}
      if (state.isPlaying && vEl.paused) vEl.play().catch(() => {});
      if (!state.isPlaying) try { vEl.pause(); } catch (_) {}
    }

    function updateBlackOverlay() {
      const hasMain = !!findClipAtTime(state.currentTime);
      const hasFloat = typeof findFloatedAtTime === 'function' && findFloatedAtTime(state.currentTime).length;
      if (hasMain || hasFloat) blackOverlay.classList.remove('show');
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

    async function tryPasteSystemMedia() {
      // OS clipboard dagi rasm/video (Ctrl+V screenshot, Copy image, ...)
      if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
        return false;
      }
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const types = item.types || [];
          for (const type of types) {
            if (!type.startsWith('image/') && !type.startsWith('video/')) continue;
            const blob = await item.getType(type);
            if (!blob || blob.size < 8) continue;
            const sub = (type.split('/')[1] || 'png').split(';')[0];
            const file = new File([blob], 'pasted-' + Date.now() + '.' + sub, { type: type });
            if (typeof editorScreen !== 'undefined' && editorScreen.style.display === 'flex' && state.videoClips.length) {
              if (typeof addMediaToTimeline === 'function') await addMediaToTimeline(file);
              else if (typeof handleFile === 'function') await handleFile(file);
            } else if (typeof handleFile === 'function') {
              await handleFile(file);
            } else {
              return false;
            }
            showToast('Clipboarddan media qo\'shildi');
            return true;
          }
        }
      } catch (err) {
        // Ruxsat yo'q yoki bo'sh — jim
        console.warn('[clipboard.read]', err && err.message);
      }
      return false;
    }

    async function pasteSmart(atPlayhead) {
      const fromOs = await tryPasteSystemMedia();
      if (fromOs) return true;
      return pasteFromClipboard(atPlayhead !== false);
    }

    function pasteFromClipboard(atPlayhead) {
      if (!state.clipboard || !state.clipboard.data) {
        showToast('Clipboard bo\'sh — avval Copy qiling yoki rasmni OS clipboarddan joylashtiring');
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
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      state.videoClips.push(newClip);
      if (typeof resolveVideoPlacement === 'function') {
        const place = resolveVideoPlacement(newClip, newClip.startTime, clipTrackIndex(newClip));
        newClip.startTime = place.start;
        applyClipTrack(newClip, place.track);
      }
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

    // Touch: darhol surish. Desktop: long-press menyu (lekin drag 6px dan keyin).
    function attachLongPress(el, opts) {
      const delay = opts.delay != null ? opts.delay : 500;
      const threshold = opts.threshold != null ? opts.threshold : 6;
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
        if (ev.cancelable) ev.preventDefault();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) > threshold) {
          clearTimer();
          if (!longFired && !dragStarted && onDragStart) {
            dragStarted = true;
            onDragStart(ev, { x: startX, y: startY, pointerId: pointerId });
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
        if (e.cancelable) e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        if (opts.onPointerDown) opts.onPointerDown(e);
        clearTimer();
        const allowMenu = typeof isTouchUi === 'function' ? !isTouchUi() : true;
        if (allowMenu && onLongPress) {
          timer = setTimeout(() => {
            timer = null;
            longFired = true;
            onLongPress(e);
          }, delay);
        }
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });
    }

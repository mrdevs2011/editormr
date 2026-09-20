    // ===================== PLAYBACK =====================
    playBtn.addEventListener('click', togglePlay);

    // Professional keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (editorScreen.style.display !== 'flex') return;

      // Ctrl/Cmd + / - / 0 — timeline zoom (brauzer zoom'i chiqmasin)
      // Ctrl/Cmd + C / V / D — copy / paste / duplicate
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomTimeline(1.25); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomTimeline(0.8); return; }
        if (e.key === '0') { e.preventDefault(); resetZoom(); return; }
        const k = e.key.toLowerCase();
        if (k === 'c') { e.preventDefault(); copySelectedToClipboard(); return; }
        if (k === 'v') {
          // Ichki clip clipboard bo'lsa — darhol paste.
          // Bo'sh bo'lsa preventDefault QILINMAYDI: brauzer 'paste' eventini yuboradi
          // (OS clipboarddagi rasm/video shu yerda keladi).
          if (state.clipboard && state.clipboard.data) {
            e.preventDefault();
            pasteFromClipboard(true);
          }
          return;
        }
        if (k === 'd') { e.preventDefault(); duplicateSelected(); return; }
      }

      // Space — play/pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!state.isPlayheadDragging) togglePlay();
        return;
      }
      // S — split (faqat video/rasm clip; matn emas)
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        let id = state.selectedClipId;
        if (!id || !getClipById(id)) {
          id = findClipAtTime(state.currentTime)?.id;
        }
        if (id && getClipById(id)) {
          focusClip(id);
          splitClipAtPlayhead(id);
        }
        return;
      }
      // Delete / Backspace — selected clip o'chirish
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedClip();
        return;
      }
      // Arrow left/right — playhead nudge
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        state.currentTime = Math.max(0, state.currentTime + (e.key === 'ArrowRight' ? step : -step));
        seekPreviewToTime(state.currentTime);
        updatePlayhead();
        updateTimeDisplay();
        updateBlackOverlay();
        return;
      }
      // +/- zoom
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomTimeline(1.25);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomTimeline(0.8);
        return;
      }
    });

    function deleteSelectedClip() {
      // Avval tanlangan text clip'lar
      if (typeof deleteSelectedTextClips === 'function' && deleteSelectedTextClips()) return;

      // Tanlangan HAMMA video clip (marquee bilan tanlanganlar ham). Musiqa bu yerda o'chirilmaydi.
      const ids = state.videoClips.filter(c => isSelected(c.id)).map(c => c.id);
      if (!ids.length) return;
      if (ids.length >= state.videoClips.length) {
        showToast('Kamida 1 ta clip qolishi kerak');
        return;
      }
      pushHistory();
      if (typeof invalidateClipOrder === "function") invalidateClipOrder();
      const removed = state.videoClips.filter(c => ids.includes(c.id)).map(c => {
        c._wasFloated = isFloated(c);
        c._homeTrack = clipTrackIndex(c);
        return c;
      });
      if (typeof inheritTransitionsForRemoved === 'function') inheritTransitionsForRemoved(removed);
      if (typeof ripplePackAfterRemove === 'function') ripplePackAfterRemove(removed);
      state.videoClips = state.videoClips.filter(c => !ids.includes(c.id));
      selectOnly(state.videoClips[0].id);
      ensurePreviewForClip(getSelectedClip());
      renderVideoBlock();
      updateTimelineLayout();
      updateBlackOverlay();
      scheduleSave();
      showToast(ids.length > 1 ? ids.length + ' ta clip o\'chirildi' : 'Clip o\'chirildi');
    }

    // Smooth playback: video native play (seek faqat 1 marta), playhead video dan olinadi
    let rafId = null;
    let lastRafTime = 0;
    let videoWasInRange = false;
    let musicWasInRange = false;

    function togglePlay() {
      if (state.isPlaying) {
        pauseAll();
      } else {
        playAll();
      }
    }

    let activePlayClipId = null;

    function resetPlaybackClipCache(clipId) {
      activePlayClipId = clipId || null;
      videoWasInRange = !!clipId;
    }

    function playAll() {
      state.isPlaying = true;
      const ip = document.getElementById('icon-play');
      const iq = document.getElementById('icon-pause');
      if (ip) ip.style.display = 'none';
      if (iq) iq.style.display = 'block';
      lastRafTime = performance.now();
      videoWasInRange = false;
      musicWasInRange = false;
      activePlayClipId = null;

      const clip = findClipAtTime(state.currentTime);
      if (clip) {
        // Manba to'g'ri clipga o'tkaziladi (pause+boshqa clip scrub'dan keyin)
        if (typeof ensurePreviewForClip === 'function') {
          ensurePreviewForClip(clip).then(() => {
            if (!state.isPlaying) return;
            if (!clip.isImage) {
              applyPreviewClipVolume(clip);
              applyPreviewClipSpeed(clip);
              const local = timelineToSource(clip, state.currentTime);
              const maxT = (clip.duration || state.videoDuration || 5) - 0.05;
              previewVideo.currentTime = Math.max(0, Math.min(local, maxT));
              previewVideo.play().catch(() => {});
            }
          });
        } else if (!clip.isImage) {
          applyPreviewClipVolume(clip);
          applyPreviewClipSpeed(clip);
          previewVideo.currentTime = timelineToSource(clip, state.currentTime);
          previewVideo.play().catch(() => {});
        }
        videoWasInRange = true;
        activePlayClipId = clip.id;
      }
      applyMusicVolume();
      startMusicIfNeeded();
      rafId = requestAnimationFrame(tick);
    }

    function pauseAll() {
      state.isPlaying = false;
      const ip2 = document.getElementById('icon-play');
      const iq2 = document.getElementById('icon-pause');
      if (ip2) ip2.style.display = 'block';
      if (iq2) iq2.style.display = 'none';
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      previewVideo.pause();
      if (typeof previewVideoFloat !== 'undefined' && previewVideoFloat) {
        try { previewVideoFloat.pause(); } catch (_) {}
      }
      if (state.music?.audio) state.music.audio.pause();
      videoWasInRange = false;
      musicWasInRange = false;
      activePlayClipId = null;
    }

    function tick(now) {
      if (!state.isPlaying) return;

      const clip = findClipAtTime(state.currentTime);
      const inVideo = !!clip;

      // state.isImage global — faqat joriy preview; clock uchun clip.isImage ishlatiladi
      if (clip && !clip.isImage && inVideo && !previewVideo.paused && videoWasInRange && activePlayClipId === clip.id) {
        state.currentTime = sourceToTimeline(clip, previewVideo.currentTime);
        if (state.currentTime >= clipEnd(clip) - 0.02) {
          state.currentTime = clipEnd(clip);
          previewVideo.pause();
          videoWasInRange = false;
          activePlayClipId = null;
        }
      } else {
        // Gap / image / manba yuklanayotgan / pause — real vaqt (1x)
        const dt = Math.min(0.1, (now - lastRafTime) / 1000);
        state.currentTime += dt;
      }
      lastRafTime = now;

      const totalEnd = Math.max(
        videoTimelineEnd(),
        state.music ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
        typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0
      );

      if (state.currentTime >= totalEnd) {
        state.currentTime = totalEnd;
        pauseAll();
        updatePlayhead();
        updateTimeDisplay();
        updateBlackOverlay();
        return;
      }

      const clipNow = findClipAtTime(state.currentTime);
      if (clipNow) {
        if (activePlayClipId !== clipNow.id) {
          // Clip chegarasi — manba async yuklanadi; tayyor bo'lguncha dt-clock
          const switchId = clipNow.id;
          activePlayClipId = switchId;
          videoWasInRange = false;
          ensurePreviewForClip(clipNow).then(() => {
            if (!state.isPlaying || activePlayClipId !== switchId) return;
            if (clipNow.isImage) return;
            applyPreviewClipVolume(clipNow);
            applyPreviewClipSpeed(clipNow);
            const local = timelineToSource(clipNow, state.currentTime);
            const maxT = (clipNow.duration || state.videoDuration || 5) - 0.05;
            try {
              previewVideo.currentTime = Math.max(0, Math.min(local, maxT));
            } catch (_) {}
            previewVideo.play().catch(() => {});
            videoWasInRange = true;
          });
        } else if (!clipNow.isImage && videoWasInRange && previewVideo.paused) {
          applyPreviewClipVolume(clipNow);
          applyPreviewClipSpeed(clipNow);
          previewVideo.play().catch(() => {});
        }
      } else if (videoWasInRange || activePlayClipId) {
        previewVideo.pause();
        videoWasInRange = false;
        activePlayClipId = null;
      }

      syncMusicPlaybackSmooth();
      updatePlayhead();
      updateTimeDisplay();
      updateBlackOverlay();
      if (typeof updatePreviewTransition === 'function') {
        updatePreviewTransition(state.currentTime);
      }
      if (typeof updatePreviewFloat === 'function') {
        updatePreviewFloat(state.currentTime);
      }

      rafId = requestAnimationFrame(tick);
    }

    function updateTimeDisplay() {
      const total = Math.max(
        videoTimelineEnd(),
        state.music ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
        typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
        state.videoDuration
      );
      timeDisplay.textContent = `${formatTime(state.currentTime)} / ${formatTime(total)}`;
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
    }


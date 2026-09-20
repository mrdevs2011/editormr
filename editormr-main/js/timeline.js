    // ===================== TIMELINE =====================
    function updateTimelineLayout() {
      const totalDuration = Math.max(
        videoTimelineEnd(),
        state.music ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
        typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
        2
      ) + 2;

      const contentWidth = Math.max(timelineScroll.clientWidth - 16, timeToPx(totalDuration));
      timelineContent.style.width = contentWidth + 'px';

      // Timeline balandligi 38% dan kichik bo'lsa vaqt raqamlarini yashirish
      const currentPercent = Math.round((timelineSection.offsetHeight / window.innerHeight) * 100);
      timelineSection.classList.toggle('compressed', currentPercent < 38);

      // Ruler
      timeRuler.innerHTML = '';
      // Yorliqlar orasi kamida ~32px bo'lsin (zoom-out da raqamlar ustma-ust tushmasin)
      const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
      const step = NICE_STEPS.find(s => s * state.pixelsPerSecond >= 32) || 3600;
      for (let t = 0; t <= totalDuration; t += step) {
        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.left = timeToPx(t) + 'px';
        tick.textContent = formatTime(t);
        timeRuler.appendChild(tick);
      }

      renderVideoBlock();
      if (state.music) renderMusicBlock();
      if (typeof renderTextLane === 'function') renderTextLane();
      updatePlayhead();
    }

    function updatePlayhead() {
      playhead.style.left = (8 + timeToPx(state.currentTime)) + 'px';
      if (typeof updateTextOverlays === 'function') updateTextOverlays();
      updateBlackOverlay();
      const c = findClipAtTime(state.currentTime);
      if (typeof applyPreviewClipFade === 'function') applyPreviewClipFade(c);
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
    }

    // ===== Playhead drag (grab the red top handle / line and scrub) =====
    playhead.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.isPlayheadDragging = true;
      playhead.classList.add('dragging');
      // Ruler-tick'larni yashirish
      timeRuler.classList.add('hide-ticks');
      // Pause while scrubbing for smooth feel
      const wasPlaying = state.isPlaying;
      if (wasPlaying) pauseAll();
      state._wasPlayingBeforeScrub = wasPlaying;

      document.addEventListener('pointermove', onPlayheadDrag);
      document.addEventListener('pointerup', endPlayheadDrag);
    });

    function onPlayheadDrag(e) {
      if (!state.isPlayheadDragging) return;
      const rect = timelineContent.getBoundingClientRect();
      const x = e.clientX - rect.left - 8;
      const t = Math.max(0, pxToTime(x));
      state.currentTime = t;
      updatePlayhead();
      updateTimeDisplay();

      // Live seek video
      if (!state.isImage) {
        const c = findClipAtTime(t);
        if (c) {
          if (!c.isImage) previewVideo.currentTime = timelineToSource(c, t);
          blackOverlay.classList.remove('show');
        } else {
          blackOverlay.classList.add('show');
          previewVideo.pause();
        }
      } else {
        updateBlackOverlay();
      }

      // Live seek music
      if (state.music?.audio) {
        const m = state.music;
        const local = t - m.startTime + m.trimStart;
        if (local >= m.trimStart && local <= m.trimEnd) {
          m.audio.currentTime = local;
        }
      }
    }

    function endPlayheadDrag() {
      state.isPlayheadDragging = false;
      playhead.classList.remove('dragging');
      // Ruler-tick'larni qayta ko'rish
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onPlayheadDrag);
      document.removeEventListener('pointerup', endPlayheadDrag);

      // Magnetic snap — eng yaqin kesikka (0.15s ichida)
      const nearest = findNearestCutPoint(state.currentTime);
      if (Math.abs(nearest - state.currentTime) < 0.15) {
        state.currentTime = nearest;
        updatePlayhead();
        updateTimeDisplay();
        updateBlackOverlay();
        const c = findClipAtTime(state.currentTime);
        if (c && !c.isImage) {
          previewVideo.currentTime = timelineToSource(c, state.currentTime);
        }
      }

      if (state._wasPlayingBeforeScrub) {
        playAll();
      }
      state._wasPlayingBeforeScrub = false;
    }

    // Click timeline to seek
    timelineContent.addEventListener('click', (e) => {
      if (state.isDragging || state.isPlayheadDragging || state.justMarquee) return;
      const rect = timelineContent.getBoundingClientRect();
      const x = e.clientX - rect.left - 8;
      if (x < 0) return;
      const t = Math.max(0, pxToTime(x));
      state.currentTime = t;
      updatePlayhead();
      updateTimeDisplay();
      updateBlackOverlay();

      // seek video
      const c = findClipAtTime(t);
      if (c) {
        if (!c.isImage) previewVideo.currentTime = timelineToSource(c, t);
        blackOverlay.classList.remove('show');
      } else {
        blackOverlay.classList.add('show');
        previewVideo.pause();
      }

      // seek music
      if (state.music?.audio) {
        const m = state.music;
        const local = t - m.startTime + m.trimStart;
        if (local >= m.trimStart && local <= m.trimEnd) {
          m.audio.currentTime = local;
        }
      }
    });


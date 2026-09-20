    // ===================== DRAG LOGIC (video + music) =====================
    function startDrag(e, target, type, clipId) {
      e.preventDefault();
      pushHistory();
      state.isDragging = true;
      state.dragTarget = target;
      state.dragType = type;
      state.dragClipId = clipId || null;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      // Ruler-tick'larni yashirish
      timeRuler.classList.add('hide-ticks');

      if (target === 'video') {
        const clip = getClipById(clipId) || getSelectedClip() || state.videoClips[0];
        if (!clip) return;
        state.dragClipId = clip.id;
        state.dragOrigStart = clip.startTime;
        state.dragOrigOffsetY = clip.offsetY || 0;
        state.dragOrigTrimStart = clip.trimStart;
        state.dragOrigTrimEnd = clip.trimEnd;
      } else {
        state.dragOrigStart = state.music.startTime;
        state.dragOrigOffsetY = state.music.offsetY || 0;
        state.dragOrigTrimStart = state.music.trimStart;
        state.dragOrigTrimEnd = state.music.trimEnd;
      }

      // Multi-select: tanlangan bloklardan birini ushlasak — HAMMASI birga suriladi
      state.dragGroup = null;
      const grabbedId = target === 'music' ? MUSIC_ID : clipId;
      if (type === 'move' && state.selectedIds.size > 1 && isSelected(grabbedId)) {
        state.dragGroup = [];
        for (const c of state.videoClips) {
          if (isSelected(c.id)) state.dragGroup.push({ item: c, start: c.startTime, offY: c.offsetY || 0 });
        }
        if (state.music && isSelected(MUSIC_ID)) {
          state.dragGroup.push({ item: state.music, start: state.music.startTime, offY: state.music.offsetY || 0 });
        }
      }

      document.addEventListener('pointermove', onDrag);
      document.addEventListener('pointerup', endDrag);
    }

    function onDrag(e) {
      if (!state.isDragging) return;
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      const dt = pxToTime(dx);

      if (state.dragGroup) {
        // Chegaradan (0) oshmasin, lekin bloklar orasidagi masofa buzilmasin:
        // har birini alohida clamp qilmaymiz, butun guruhni birga to'xtatamiz
        const gdt = Math.max(dt, -Math.min(...state.dragGroup.map(g => g.start)));
        const gdy = Math.max(dy, -Math.min(...state.dragGroup.map(g => g.offY)));
        for (const g of state.dragGroup) {
          g.item.startTime = g.start + gdt;
          g.item.offsetY = g.offY + gdy;
        }
        updateTimelineLayout(); // video + musiqa bloklarini qayta chizadi
        return;
      }

      if (state.dragTarget === 'video') {
        const clip = getClipById(state.dragClipId);
        if (!clip) return;
        if (state.dragType === 'move') {
          clip.startTime = Math.max(0, state.dragOrigStart + dt);
          // Vertical cheklov: 0 dan asqar, tepadagi devorvga chiqib ketmasin
          clip.offsetY = Math.max(0, state.dragOrigOffsetY + dy);
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, clip.trimEnd - 0.15));
          const delta = newTrimStart - state.dragOrigTrimStart;
          clip.trimStart = newTrimStart;
          clip.startTime = state.dragOrigStart + delta;
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          const maxDur = clip.duration || state.videoDuration || 9999;
          newTrimEnd = Math.max(clip.trimStart + 0.15, Math.min(newTrimEnd, maxDur));
          clip.trimEnd = newTrimEnd;
        }
        renderVideoBlock();
      } else if (state.dragTarget === 'music' && state.music) {
        if (state.dragType === 'move') {
          state.music.startTime = Math.max(0, state.dragOrigStart + dt);
          // Vertical cheklov: 0 dan asqar, tepadagi devorvga chiqib ketmasin
          state.music.offsetY = Math.max(0, state.dragOrigOffsetY + dy);
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, state.music.trimEnd - 0.1));
          const delta = newTrimStart - state.dragOrigTrimStart;
          state.music.trimStart = newTrimStart;
          state.music.startTime = state.dragOrigStart + delta;
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          newTrimEnd = Math.max(state.music.trimStart + 0.1, Math.min(newTrimEnd, state.music.duration));
          state.music.trimEnd = newTrimEnd;
        }
        renderMusicBlock();
      }

      updateTimelineLayout();
    }

    function endDrag() {
      state.isDragging = false;
      state.dragTarget = null;
      state.dragType = null;
      state.dragClipId = null;
      state.dragGroup = null;
      scheduleSave();
      // Ruler-tick'larni qayta ko'rish
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onDrag);
      document.removeEventListener('pointerup', endDrag);
    }


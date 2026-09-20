    // ===================== CONTEXT MENU + SPLIT + VOLUME =====================
    let contextMenuEl = null;

    function hideClipContextMenu() {
      if (contextMenuEl && contextMenuEl.parentNode) {
        contextMenuEl.parentNode.removeChild(contextMenuEl);
      }
      contextMenuEl = null;
    }

    function positionContextMenu(menu, x, y) {
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      document.body.appendChild(menu);
      contextMenuEl = menu;
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    }

    function appendMuteVolumeItems(menu, target) {
      // target: video clip object yoki state.music
      const muteBtn = document.createElement('button');
      muteBtn.textContent = target.muted ? 'Unmute' : 'Mute';
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pushHistory();
        target.muted = !target.muted;
        hideClipContextMenu();
        if (target === state.music) {
          applyMusicVolume();
          renderMusicBlock();
        } else {
          if (getSelectedClip()?.id === target.id || findClipAtTime(state.currentTime)?.id === target.id) {
            applyPreviewClipVolume(target);
          }
          renderVideoBlock();
        }
        scheduleSave();
      });
      menu.appendChild(muteBtn);

      const volRow = document.createElement('div');
      volRow.className = 'ctx-volume-row';
      volRow.addEventListener('click', (e) => e.stopPropagation());
      volRow.addEventListener('pointerdown', (e) => e.stopPropagation());

      const volLabel = document.createElement('span');
      volLabel.className = 'ctx-volume-label';
      const pct = Math.round((target.volume != null ? target.volume : 1) * 100);
      volLabel.textContent = pct + '%';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.step = '1';
      range.value = String(pct);
      range.className = 'ctx-volume-slider';
      range.title = 'Volume';

      let historyPushed = false;
      range.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!historyPushed) {
          pushHistory();
          historyPushed = true;
        }
      });
      range.addEventListener('input', () => {
        const v = Math.max(0, Math.min(100, Number(range.value))) / 100;
        target.volume = v;
        volLabel.textContent = Math.round(v * 100) + '%';
        if (target === state.music) {
          applyMusicVolume();
        } else if (getSelectedClip()?.id === target.id || findClipAtTime(state.currentTime)?.id === target.id) {
          applyPreviewClipVolume(target);
        }
      });
      range.addEventListener('change', () => {
        scheduleSave();
        historyPushed = false;
      });

      volRow.appendChild(volLabel);
      volRow.appendChild(range);
      menu.appendChild(volRow);
    }

    function showClipContextMenu(x, y, clipId) {
      hideClipContextMenu();
      if (typeof isTouchUi === 'function' && isTouchUi()) return;
      const clip = getClipById(clipId);
      if (!clip) return;

      const menu = document.createElement('div');
      menu.className = 'clip-context-menu';

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideClipContextMenu();
        focusClip(clipId);
        copySelectedToClipboard();
      });
      menu.appendChild(copyBtn);

      const dupBtn = document.createElement('button');
      dupBtn.textContent = 'Duplicate';
      dupBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideClipContextMenu();
        focusClip(clipId);
        duplicateSelected();
      });
      menu.appendChild(dupBtn);

      const splitBtn = document.createElement('button');
      splitBtn.textContent = 'Split';
      const t = state.currentTime;
      const canSplit = t > clip.startTime + 0.05 && t < clipEnd(clip) - 0.05;
      splitBtn.disabled = !canSplit;
      if (!canSplit) splitBtn.title = 'Playhead clip ichida bo\'lishi kerak';
      splitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideClipContextMenu();
        if (canSplit) splitClipAtPlayhead(clipId);
      });
      menu.appendChild(splitBtn);

      const floatBtn = document.createElement('button');
      floatBtn.textContent = clip.floated ? 'Unfloat' : 'Float';
      floatBtn.title = clip.floated
        ? 'Qatorga qaytarish'
        : 'Qatordan chiqarib videolar ustida float qilish';
      floatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideClipContextMenu();
        focusClip(clipId);
        toggleFloatClip(clip);
      });
      menu.appendChild(floatBtn);

      if (clip.isImage) {
        appendImageDurationItems(menu, clip);
      } else {
        appendMuteVolumeItems(menu, clip);
        appendSpeedItems(menu, clip);
        appendFadeItems(menu, clip);
      }

      positionContextMenu(menu, x, y);
    }

    function appendImageDurationItems(menu, clip) {
      const durations = [1, 2, 3, 5, 10];
      const row = document.createElement('div');
      row.className = 'ctx-speed-row';
      row.addEventListener('click', (e) => e.stopPropagation());
      row.addEventListener('pointerdown', (e) => e.stopPropagation());
      const lab = document.createElement('span');
      lab.className = 'ctx-speed-label';
      lab.textContent = 'Duration';
      row.appendChild(lab);
      const cur = Math.max(0.1, (clip.trimEnd || 5) - (clip.trimStart || 0));
      for (const d of durations) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctx-speed-btn' + (Math.abs(cur - d) < 0.05 ? ' active' : '');
        btn.textContent = d + 's';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setImageClipDuration(clip, d);
          hideClipContextMenu();
        });
        row.appendChild(btn);
      }
      menu.appendChild(row);
    }

    function appendTransitionItems(menu, clip) {
      const types = TRANSITION_TYPES;
      const durations = [0.1, 0.2, 0.3, 0.5, 1.0];
      const current = clip.transitionType || 'none';
      const curDur = clip.transitionDuration != null ? clip.transitionDuration : 0.3;

      const typeRow = document.createElement('div');
      typeRow.className = 'ctx-speed-row';
      typeRow.addEventListener('click', (e) => e.stopPropagation());
      typeRow.addEventListener('pointerdown', (e) => e.stopPropagation());
      const typeLab = document.createElement('span');
      typeLab.className = 'ctx-speed-label';
      typeLab.textContent = 'Transition';
      typeRow.appendChild(typeLab);
      for (const tp of types) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctx-speed-btn' + (current === tp.id ? ' active' : '');
        btn.textContent = tp.label;
        btn.title = tp.id;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if ((clip.transitionType || 'none') === tp.id) {
            hideClipContextMenu();
            return;
          }
          pushHistory();
          clip.transitionType = tp.id;
          if (clip.transitionDuration == null) clip.transitionDuration = 0.3;
          hideClipContextMenu();
          renderVideoBlock();
          scheduleSave();
        });
        typeRow.appendChild(btn);
      }
      menu.appendChild(typeRow);

      if (current !== 'none') {
        const durRow = document.createElement('div');
        durRow.className = 'ctx-speed-row';
        durRow.addEventListener('click', (e) => e.stopPropagation());
        durRow.addEventListener('pointerdown', (e) => e.stopPropagation());
        const durLab = document.createElement('span');
        durLab.className = 'ctx-speed-label';
        durLab.textContent = 'Dur';
        durRow.appendChild(durLab);
        for (const d of durations) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ctx-speed-btn' + (Math.abs(curDur - d) < 0.01 ? ' active' : '');
          btn.textContent = d + 's';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pushHistory();
            clip.transitionDuration = d;
            hideClipContextMenu();
            renderVideoBlock();
            scheduleSave();
          });
          durRow.appendChild(btn);
        }
        menu.appendChild(durRow);
      }
    }


    function appendFadeItems(menu, clip) {
      const maxF = Math.max(0.1, Math.min(3, clipDuration(clip) / 2));
      const col = document.createElement('div');
      col.className = 'ctx-fade-col';
      col.addEventListener('click', (e) => e.stopPropagation());
      col.addEventListener('pointerdown', (e) => e.stopPropagation());

      function makeSlider(key, labelText) {
        const wrap = document.createElement('div');
        wrap.className = 'ctx-fade-row';
        const lab = document.createElement('span');
        lab.className = 'ctx-fade-label';
        const cur = Math.max(0, Math.min(maxF, clip[key] || 0));
        lab.textContent = labelText + ' ' + cur.toFixed(1) + 's';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = String(maxF);
        range.step = '0.1';
        range.value = String(cur);
        range.className = 'ctx-fade-slider';
        let historyPushed = false;
        range.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (!historyPushed) {
            pushHistory();
            historyPushed = true;
          }
        });
        range.addEventListener('input', () => {
          const v = Math.max(0, Math.min(maxF, Number(range.value) || 0));
          clip[key] = v;
          lab.textContent = labelText + ' ' + v.toFixed(1) + 's';
          renderVideoBlock();
          if (typeof applyPreviewClipFade === 'function') {
            applyPreviewClipFade(findClipAtTime(state.currentTime));
          }
        });
        range.addEventListener('change', () => {
          scheduleSave();
          historyPushed = false;
        });
        wrap.appendChild(lab);
        wrap.appendChild(range);
        return wrap;
      }

      col.appendChild(makeSlider('fadeIn', 'Fade in'));
      col.appendChild(makeSlider('fadeOut', 'Fade out'));
      menu.appendChild(col);
    }

    function appendSpeedItems(menu, clip) {
      const speeds = [0.25, 0.5, 1, 1.5, 2];
      const row = document.createElement('div');
      row.className = 'ctx-speed-row';
      row.addEventListener('click', (e) => e.stopPropagation());
      row.addEventListener('pointerdown', (e) => e.stopPropagation());

      const label = document.createElement('span');
      label.className = 'ctx-speed-label';
      label.textContent = 'Speed';
      row.appendChild(label);

      const current = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      for (const sp of speeds) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ctx-speed-btn' + (Math.abs(current - sp) < 0.001 ? ' active' : '');
        btn.textContent = sp + '×';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (Math.abs((clip.speed || 1) - sp) < 0.001) {
            hideClipContextMenu();
            return;
          }
          pushHistory();
          clip.speed = sp;
          hideClipContextMenu();
          renderVideoBlock();
          updateTimelineLayout();
          if (getSelectedClip()?.id === clip.id || findClipAtTime(state.currentTime)?.id === clip.id) {
            applyPreviewClipSpeed(clip);
          }
          scheduleSave();
        });
        row.appendChild(btn);
      }
      menu.appendChild(row);
    }

    function setImageClipDuration(clip, seconds) {
      if (!clip || !clip.isImage) return;
      const d = Math.max(0.1, Number(seconds) || 1);
      const cur = Math.max(0.1, (clip.trimEnd || 5) - (clip.trimStart || 0));
      if (Math.abs(cur - d) < 0.05) return;
      pushHistory();
      clip.trimStart = 0;
      clip.trimEnd = d;
      clip.duration = d;
      renderVideoBlock();
      updateTimelineLayout();
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
      scheduleSave();
    }

    function showMusicContextMenu(x, y) {
      hideClipContextMenu();
      if (typeof isTouchUi === 'function' && isTouchUi()) return;
      if (!state.music) return;
      const menu = document.createElement('div');
      menu.className = 'clip-context-menu';
      appendMuteVolumeItems(menu, state.music);
      appendMusicFadeItems(menu, state.music);
      positionContextMenu(menu, x, y);
    }

    function appendMusicFadeItems(menu, music) {
      if (!music) return;
      const maxF = 2;
      const col = document.createElement('div');
      col.className = 'ctx-fade-col';
      col.addEventListener('click', (e) => e.stopPropagation());
      col.addEventListener('pointerdown', (e) => e.stopPropagation());

      function makeSlider(key, labelText) {
        const wrap = document.createElement('div');
        wrap.className = 'ctx-fade-row';
        const lab = document.createElement('span');
        lab.className = 'ctx-fade-label';
        const cur = Math.max(0, Math.min(maxF, music[key] || 0));
        lab.textContent = labelText + ' ' + cur.toFixed(1) + 's';
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = String(maxF);
        range.step = '0.1';
        range.value = String(cur);
        range.className = 'ctx-fade-slider';
        let historyPushed = false;
        range.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (!historyPushed) { pushHistory(); historyPushed = true; }
        });
        range.addEventListener('input', () => {
          const v = Math.max(0, Math.min(maxF, Number(range.value) || 0));
          music[key] = v;
          lab.textContent = labelText + ' ' + v.toFixed(1) + 's';
        });
        range.addEventListener('change', () => { scheduleSave(); historyPushed = false; });
        wrap.appendChild(lab);
        wrap.appendChild(range);
        return wrap;
      }
      col.appendChild(makeSlider('fadeIn', 'Fade in'));
      col.appendChild(makeSlider('fadeOut', 'Fade out'));
      menu.appendChild(col);
    }

    function splitClipAtPlayhead(clipId) {
      const clip = getClipById(clipId);
      if (!clip) return;
      // Faqat tanlangan clip
      if (state.selectedClipId !== clipId) {
        showToast('Avval clip ni tanlang (chap tugma)');
        return;
      }

      const t = state.currentTime;
      if (t <= clip.startTime + 0.05 || t >= clipEnd(clip) - 0.05) {
        showToast('Playhead clip ichida bo\'lishi kerak');
        return;
      }

      pushHistory();

      // Timeline vaqt → manba (original) vaqti (speed hisobga olinadi)
      const localSource = timelineToSource(clip, t);

      // Chap qism: eski clip
      const rightTrimStart = localSource;
      const rightTrimEnd = clip.trimEnd;
      const rightStartTime = t;

      clip.trimEnd = localSource;
      // Transition A oxirida yashaydi — chap clip qisqargach duration clamp
      if (clip.transitionDuration && typeof clipDuration === 'function') {
        const maxT = Math.max(0.1, clipDuration(clip) - 0.05);
        if (clip.transitionDuration > maxT) clip.transitionDuration = maxT;
      }

      // O'ng qism: yangi clip (volume/muted/speed meros)
      const newClip = {
        id: makeClipId(),
        startTime: rightStartTime,
        trimStart: rightTrimStart,
        trimEnd: rightTrimEnd,
        offsetY: clip.offsetY || 0,
        track: clipTrackIndex(clip),
        url: clip.url || state.videoUrl,
        file: clip.file || state.videoFile,
        duration: clip.duration || state.videoDuration,
        isImage: clip.isImage != null ? clip.isImage : state.isImage,
        filmstrip: clip.filmstrip || state.filmstrip,
        name: clip.name || state.videoFile?.name,
        volume: clip.volume != null ? clip.volume : 1,
        muted: !!clip.muted,
        speed: (clip.speed && clip.speed > 0) ? clip.speed : 1,
        fadeIn: clip.fadeIn || 0,
        fadeOut: clip.fadeOut || 0,
        transitionType: 'none',
        transitionDuration: 0.3,
        floated: !!clip.floated,
      };
      // Eski clip dan keyin qo'yish
      const idx = state.videoClips.findIndex(c => c.id === clipId);
      if (typeof invalidateClipOrder === "function") invalidateClipOrder();
      state.videoClips.splice(idx + 1, 0, newClip);
      selectOnly(newClip.id);

      renderVideoBlock();
      updateTimelineLayout();
      scheduleSave();
      showToast('Split qilindi');
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('.clip-context-menu')) return;
      hideClipContextMenu();
    });
    document.addEventListener('contextmenu', (e) => {
      // Timeline tashqarisida default menu; music/video blok ichida yopilmasin
      if (!e.target.closest('.media-block.video, .media-block.music, .clip-context-menu')) {
        hideClipContextMenu();
      }
    });

    function floatClip(clip) {
      if (!clip || isFloated(clip)) return;
      const origStart = clip.startTime;
      clip._homeTrack = clipTrackIndex(clip);
      inheritTransitionsForRemoved([clip]);
      clip.floated = true;
      clip.transitionType = 'none';
      ripplePackAfterRemove([clip]);
      clip.startTime = origStart;
    }

    function unfloatClip(clip) {
      if (!clip || !isFloated(clip)) return;
      clip.floated = false;
      if (typeof resolveVideoPlacement === 'function') {
        const place = resolveVideoPlacement(clip, clip.startTime, clipTrackIndex(clip) || 0);
        clip.startTime = place.start;
        applyClipTrack(clip, place.track);
      }
    }

    function toggleFloatClip(clip) {
      if (!clip) {
        clip = getSelectedClip();
      }
      if (!clip) {
        showToast('Float uchun clip tanlang');
        return;
      }
      pushHistory();
      if (isFloated(clip)) {
        unfloatClip(clip);
        showToast('Qatorga qaytarildi');
      } else {
        floatClip(clip);
        showToast('Float: videolar ustida');
      }
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      renderVideoBlock();
      updateTimelineLayout();
      if (typeof seekPreviewToTime === 'function') seekPreviewToTime(state.currentTime);
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
      scheduleSave();
    }

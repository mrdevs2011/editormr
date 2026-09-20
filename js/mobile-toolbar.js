    // ===================== MOBILE ACTION BAR =====================
    function updateMobileToolbar() {
      const bar = document.getElementById('mobile-action-bar');
      if (!bar) return;

      const touch = typeof isTouchUi === 'function' ? isTouchUi() : false;
      bar.hidden = !touch;
      bar.setAttribute('aria-hidden', touch ? 'false' : 'true');

      const clip = getSelectedClip();
      const hasVideo = !!clip;
      const hasAnySelected = (state.selectedIds && state.selectedIds.size > 0) || !!state.selectedClipId;
      const hasClipboard = !!(state.clipboard && state.clipboard.data);
      const canSplit = (() => {
        if (!clip) return false;
        const t = state.currentTime;
        return t > clip.startTime + 0.05 && t < clipEnd(clip) - 0.05;
      })();

      const desktopUndo = document.getElementById('undo-btn');
      const desktopRedo = document.getElementById('redo-btn');
      const undoBtn = bar.querySelector('[data-act="undo"]');
      const redoBtn = bar.querySelector('[data-act="redo"]');
      if (undoBtn && desktopUndo) undoBtn.disabled = desktopUndo.disabled;
      if (redoBtn && desktopRedo) redoBtn.disabled = desktopRedo.disabled;

      bar.querySelectorAll('.mob-btn[data-need]').forEach((btn) => {
        const need = btn.getAttribute('data-need');
        let show = false;
        if (need === 'sel') show = hasAnySelected;
        else if (need === 'video') show = hasVideo;
        else if (need === 'clip') show = hasClipboard;
        btn.classList.toggle('is-off', !show);
        btn.hidden = !show;
        if (btn.dataset.act === 'split') btn.disabled = !canSplit;
        else btn.disabled = !show;
      });

      const floatBtn = bar.querySelector('[data-act="float"]');
      if (floatBtn) {
        const floated = !!(clip && clip.floated);
        const label = floatBtn.querySelector('span');
        if (label) label.textContent = floated ? 'Unfloat' : 'Float';
        floatBtn.title = floated ? 'Qatorga qaytarish' : 'Float';
      }

      const durRow = document.getElementById('mob-duration-row');
      const showDur = !!(touch && clip && clip.isImage);
      if (durRow) {
        durRow.hidden = !showDur;
        if (showDur) {
          const cur = Math.max(0.1, (clip.trimEnd || 5) - (clip.trimStart || 0));
          durRow.querySelectorAll('.mob-dur-btn').forEach((btn) => {
            const d = Number(btn.getAttribute('data-dur'));
            btn.classList.toggle('active', Math.abs(cur - d) < 0.05);
          });
        }
      }
      bar.style.setProperty('--mob-dur-h', showDur ? '40px' : '0px');
    }

    function initMobileToolbar() {
      const bar = document.getElementById('mobile-action-bar');
      if (!bar) return;

      bar.addEventListener('click', (e) => {
        const durBtn = e.target.closest('.mob-dur-btn');
        if (durBtn) {
          const clip = getSelectedClip();
          if (clip && typeof setImageClipDuration === 'function') {
            setImageClipDuration(clip, durBtn.getAttribute('data-dur'));
          }
          return;
        }

        const btn = e.target.closest('.mob-btn');
        if (!btn || btn.disabled) return;
        const act = btn.dataset.act;
        if (act === 'undo') undo();
        else if (act === 'redo') redo();
        else if (act === 'copy') copySelectedToClipboard();
        else if (act === 'paste') pasteSmart(true);
        else if (act === 'split') {
          const id = state.selectedClipId || findClipAtTime(state.currentTime)?.id;
          if (id) {
            focusClip(id);
            splitClipAtPlayhead(id);
          }
        } else if (act === 'float') {
          const clip = getSelectedClip() || findClipAtTime(state.currentTime);
          if (clip) toggleFloatClip(clip);
        } else if (act === 'dup') duplicateSelected();
        else if (act === 'del') deleteSelectedClip();
        updateMobileToolbar();
      });

      updateMobileToolbar();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMobileToolbar);
    } else {
      initMobileToolbar();
    }

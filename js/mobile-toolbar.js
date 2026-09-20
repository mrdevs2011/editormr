    // ===================== MOBILE ACTION BAR =====================
    function isTouchUi() {
      try {
        return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      } catch (_) {
        return false;
      }
    }

    function updateMobileToolbar() {
      const bar = document.getElementById('mobile-action-bar');
      if (!bar) return;

      const hasVideo = !!getSelectedClip();
      const hasAnySelected = (state.selectedIds && state.selectedIds.size > 0) || !!state.selectedClipId;
      const hasClipboard = !!(state.clipboard && state.clipboard.data);
      const canSplit = (() => {
        const c = getSelectedClip();
        if (!c) return false;
        const t = state.currentTime;
        return t > c.startTime + 0.05 && t < clipEnd(c) - 0.05;
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
    }

    function initMobileToolbar() {
      const bar = document.getElementById('mobile-action-bar');
      if (!bar) return;

      bar.addEventListener('click', (e) => {
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

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

      const undoBtn = bar.querySelector('[data-act="undo"]');
      const redoBtn = bar.querySelector('[data-act="redo"]');
      const copyBtn = bar.querySelector('[data-act="copy"]');
      const pasteBtn = bar.querySelector('[data-act="paste"]');
      const splitBtn = bar.querySelector('[data-act="split"]');
      const dupBtn = bar.querySelector('[data-act="dup"]');
      const delBtn = bar.querySelector('[data-act="del"]');

      const hasClip = !!(getSelectedClip() || (state.selectedClipId && String(state.selectedClipId).startsWith('t') && typeof getTextClipById === 'function' && getTextClipById(state.selectedClipId)));
      const hasAnySelected = (state.selectedIds && state.selectedIds.size > 0) || !!state.selectedClipId;
      const hasClipboard = !!(state.clipboard && state.clipboard.data);
      const canSplit = (() => {
        const c = getSelectedClip();
        if (!c) return false;
        const t = state.currentTime;
        return t > c.startTime + 0.05 && t < clipEnd(c) - 0.05;
      })();

      if (undoBtn) undoBtn.disabled = !(typeof undoStack !== 'undefined' ? undoStack.length : false);
      // undoStack is module-scope in history.js — use buttons state from updateUndoRedoButtons instead
      const desktopUndo = document.getElementById('undo-btn');
      const desktopRedo = document.getElementById('redo-btn');
      if (undoBtn && desktopUndo) undoBtn.disabled = desktopUndo.disabled;
      if (redoBtn && desktopRedo) redoBtn.disabled = desktopRedo.disabled;

      if (copyBtn) copyBtn.disabled = !hasAnySelected && !hasClip;
      if (pasteBtn) pasteBtn.disabled = !hasClipboard;
      if (splitBtn) splitBtn.disabled = !canSplit;
      if (dupBtn) dupBtn.disabled = !hasAnySelected && !hasClip;
      if (delBtn) delBtn.disabled = !hasAnySelected && !hasClip;
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
        else if (act === 'paste') pasteFromClipboard(true);
        else if (act === 'split') {
          const id = state.selectedClipId || findClipAtTime(state.currentTime)?.id;
          if (id) {
            focusClip(id);
            splitClipAtPlayhead(id);
          }
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

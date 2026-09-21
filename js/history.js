    // ===================== UNDO / REDO (snapshot) =====================
    const undoStack = [];
    const redoStack = [];
    const HISTORY_MAX = 30;

    function snapshotState() {
      // Faza 2C-3: fit/transform/opacity/kenBurns ham snapshot'da
      return {
        videoClips: state.videoClips.map(c => ({
          ...c,
          transform: c.transform ? { ...c.transform } : { x: 0, y: 0, scale: 1, rotation: 0 },
          kenBurns: c.kenBurns ? {
            from: c.kenBurns.from ? { ...c.kenBurns.from } : undefined,
            to: c.kenBurns.to ? { ...c.kenBurns.to } : undefined,
          } : undefined,
        })),
        music: state.music ? { ...state.music } : null,
        textClips: (state.textClips || []).map(c => ({ ...c })),
        canvasRatio: state.canvasRatio,
        canvas: state.canvas ? { ...state.canvas } : null,
        selectedClipId: state.selectedClipId,
        selectedIds: new Set(state.selectedIds),
      };
    }

    function collectSnapUrls(snap, set) {
      if (!snap) return;
      for (const c of snap.videoClips || []) {
        if (c.url) set.add(c.url);
      }
      if (snap.music?.url) set.add(snap.music.url);
    }

    // Hozirgi state + qolgan stack'larda ishlatilmayotgan URL'larni revoke qiladi
    function revokeOrphanUrls(discardedSnaps) {
      if (!discardedSnaps || !discardedSnaps.length) return;
      const live = new Set();
      for (const c of state.videoClips) if (c.url) live.add(c.url);
      if (state.videoUrl) live.add(state.videoUrl);
      if (state.music?.url) live.add(state.music.url);
      for (const s of undoStack) collectSnapUrls(s, live);
      for (const s of redoStack) collectSnapUrls(s, live);

      for (const snap of discardedSnaps) {
        const urls = new Set();
        collectSnapUrls(snap, urls);
        for (const u of urls) {
          if (u && !live.has(u)) {
            try { URL.revokeObjectURL(u); } catch (_) {}
          }
        }
      }
    }

    function restoreSnapshot(snap) {
      state.videoClips = snap.videoClips.map(c => ({
        ...c,
        transform: c.transform ? { ...c.transform } : { x: 0, y: 0, scale: 1, rotation: 0 },
        kenBurns: c.kenBurns ? {
          from: c.kenBurns.from ? { ...c.kenBurns.from } : undefined,
          to: c.kenBurns.to ? { ...c.kenBurns.to } : undefined,
        } : undefined,
      }));
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      state.music = snap.music ? { ...snap.music } : null;
      state.textClips = (snap.textClips || []).map(c => ({ ...c }));
      // Faza 2: canvas obyekt + ratio
      if (snap.canvasRatio != null) state.canvasRatio = snap.canvasRatio;
      else if (typeof snap.canvas === 'string') state.canvasRatio = snap.canvas; // eski snapshot
      state.canvas = snap.canvas && typeof snap.canvas === 'object' ? { ...snap.canvas } : null;
      if (typeof applyCanvas === 'function') applyCanvas();
      state.selectedClipId = snap.selectedClipId;
      state.selectedIds = new Set(snap.selectedIds || []);
      if (typeof window.EMR !== 'undefined' && window.EMR.requestPreviewRedraw) {
        try { window.EMR.requestPreviewRedraw(true); } catch (_) {}
      }

      if (state.music) {
        musicTrack.style.display = 'flex';
        renderMusicBlock();
      } else {
        musicLane.innerHTML = '';
        musicTrack.style.display = 'none';
      }

      renderVideoBlock();
      if (typeof renderTextLane === 'function') renderTextLane();
      updateTimelineLayout();
      updateBlackOverlay();
      if (typeof updateTextOverlays === 'function') updateTextOverlays();

      const clip = getSelectedClip() || state.videoClips[0];
      if (clip) {
        ensurePreviewForClip(clip).then(() => {
          if (typeof seekPreviewToTime === 'function') seekPreviewToTime(state.currentTime);
        });
      }

      scheduleSave();
      updateUndoRedoButtons();
    }

    function pushHistory() {
      undoStack.push(snapshotState());
      if (undoStack.length > HISTORY_MAX) {
        const dropped = undoStack.shift();
        // Yangi amal — redo butunlay bekor; tashlab ketilgan + eski redo URL'lari
        const discarded = [dropped, ...redoStack];
        redoStack.length = 0;
        revokeOrphanUrls(discarded);
      } else {
        // Yangi amal — redo tarixi bekor
        const discarded = redoStack.slice();
        redoStack.length = 0;
        revokeOrphanUrls(discarded);
      }
      updateUndoRedoButtons();
    }

    function undo() {
      if (!undoStack.length) {
        showToast('Undo qilinadigan narsa yo\'q');
        return;
      }
      redoStack.push(snapshotState());
      const snap = undoStack.pop();
      restoreSnapshot(snap);
    }

    function redo() {
      if (!redoStack.length) {
        showToast('Redo qilinadigan narsa yo\'q');
        return;
      }
      undoStack.push(snapshotState());
      const snap = redoStack.pop();
      restoreSnapshot(snap);
    }

    function updateUndoRedoButtons() {
      const undoBtn = document.getElementById('undo-btn');
      const redoBtn = document.getElementById('redo-btn');
      if (undoBtn) undoBtn.disabled = undoStack.length === 0;
      if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    
      if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
    }

    function clearHistory() {
      // Stack tozalanadi — undagi URL'lar (state'da qolmaganlari) revoke
      const discarded = undoStack.concat(redoStack);
      undoStack.length = 0;
      redoStack.length = 0;
      revokeOrphanUrls(discarded);
      updateUndoRedoButtons();
    }

    // Klaviatura: Ctrl+Z / Cmd+Z → undo, Ctrl+Shift+Z yoki Ctrl+Y → redo
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (editorScreen.style.display !== 'flex') return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      }
    });

    // Toolbar tugmalari
    document.getElementById('undo-btn')?.addEventListener('click', () => undo());
    document.getElementById('redo-btn')?.addEventListener('click', () => redo());
    updateUndoRedoButtons();

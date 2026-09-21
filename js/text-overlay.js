    // ===================== TEXT OVERLAY =====================
    const TEXT_DEFAULTS = {
      text: 'Text',
      duration: 3,
      offsetY: 0,
      track: 0,
      x: 0.5,
      y: 0.85,
      fontSize: 32,
      color: '#ffffff',
      bold: false,
      align: 'center',
      bgColor: '#000000',
      bgOpacity: 0.45,
    };

    const TEXT_ROW_H = 28;
    const MAX_TEXT_TRACKS = 12;

    function textTrackIndex(tc) {
      if (!tc) return 0;
      const t = tc.track != null ? Number(tc.track) : 0;
      return Math.max(0, Math.min(MAX_TEXT_TRACKS - 1, Math.round(t) || 0));
    }

    function textClipDuration(tc) {
      return Math.max(0.1, (tc && tc.duration) || 1);
    }

    function textClipsOnTrack(track, excludeId) {
      return (state.textClips || []).filter((c) => {
        if (!c || c.id === excludeId) return false;
        return textTrackIndex(c) === track;
      });
    }

    /** Bir qatorda ustma-ust tushmasin — overlap bo'lsa keyinga suradi */
    function resolveTextStartOnTrack(track, excludeId, desiredStart, duration) {
      let start = Math.max(0, desiredStart);
      const others = textClipsOnTrack(track, excludeId)
        .slice()
        .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
      let changed = true;
      let guard = 0;
      while (changed && guard++ < 64) {
        changed = false;
        const myEnd = start + duration;
        for (let i = 0; i < others.length; i++) {
          const o = others[i];
          const oStart = o.startTime || 0;
          const oEnd = oStart + textClipDuration(o);
          if (start < oEnd - 1e-4 && myEnd > oStart + 1e-4) {
            start = oEnd;
            changed = true;
          }
        }
      }
      return Math.max(0, start);
    }

    function textTrackSlotFree(track, start, duration, excludeId) {
      const end = start + duration;
      const others = textClipsOnTrack(track, excludeId);
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        const oStart = o.startTime || 0;
        const oEnd = oStart + textClipDuration(o);
        if (start < oEnd - 1e-4 && end > oStart + 1e-4) return false;
      }
      return true;
    }

    /** Bo'sh qator topish (overlap bo'lmasin) */
    function findFreeTextTrack(start, duration, excludeId, preferred) {
      const pref = preferred != null ? preferred : 0;
      if (textTrackSlotFree(pref, start, duration, excludeId)) return pref;
      for (let t = 0; t < MAX_TEXT_TRACKS; t++) {
        if (textTrackSlotFree(t, start, duration, excludeId)) return t;
      }
      return pref;
    }

    function createTextClip(overrides = {}) {
      return {
        id: makeTextClipId(),
        text: TEXT_DEFAULTS.text,
        startTime: state.currentTime || 0,
        duration: TEXT_DEFAULTS.duration,
        offsetY: TEXT_DEFAULTS.offsetY,
        track: TEXT_DEFAULTS.track,
        x: TEXT_DEFAULTS.x,
        y: TEXT_DEFAULTS.y,
        fontSize: TEXT_DEFAULTS.fontSize,
        color: TEXT_DEFAULTS.color,
        bold: TEXT_DEFAULTS.bold,
        align: TEXT_DEFAULTS.align,
        bgColor: TEXT_DEFAULTS.bgColor,
        bgOpacity: TEXT_DEFAULTS.bgOpacity,
        ...overrides,
      };
    }

    function addTextClip() {
      if (!state.videoClips.length) {
        showToast('Avval video qo\'shing');
        return;
      }
      pushHistory();
      const start = state.currentTime || 0;
      const dur = TEXT_DEFAULTS.duration;
      const track = findFreeTextTrack(start, dur, null, 0);
      const tc = createTextClip({ text: 'Matn', startTime: start, track: track });
      if (!state.textClips) state.textClips = [];
      state.textClips.push(tc);
      selectOnly(tc.id);
      state.textInlineEditId = tc.id;
      renderTextLane();
      updateTimelineLayout();
      updateTextOverlays();
      scheduleSave();
      // CapCut: darhol preview ustida tahrirlash — modal ochilmaydi
      requestAnimationFrame(() => focusInlineTextEdit(tc.id));
    }

    function getTextLane() {
      return document.getElementById('text-lane');
    }

    function getTextTrack() {
      return document.getElementById('text-track');
    }

    function renderTextLane() {
      const lane = getTextLane();
      const trackEl = getTextTrack();
      if (!lane || !trackEl) return;

      lane.innerHTML = '';
      const list = state.textClips || [];
      trackEl.style.display = list.length ? 'flex' : 'none';
      if (!list.length) {
        lane.style.minHeight = '';
        trackEl.style.minHeight = '';
        return;
      }

      let maxTrack = 0;
      for (let i = 0; i < list.length; i++) {
        maxTrack = Math.max(maxTrack, textTrackIndex(list[i]));
      }
      // Bitta bo'sh qator qo'shimcha (yangi qatorga tashlash uchun)
      const rows = Math.min(MAX_TEXT_TRACKS, maxTrack + 2);
      const laneH = Math.max(TEXT_ROW_H, rows * TEXT_ROW_H + 8);
      lane.style.minHeight = laneH + 'px';
      trackEl.style.minHeight = laneH + 'px';
      trackEl.style.height = laneH + 'px';

      for (const tc of list) {
        const left = timeToPx(tc.startTime);
        const width = Math.max(timeToPx(Math.max(0.1, tc.duration || 1)), 24);
        const tr = textTrackIndex(tc);
        const top = 4 + tr * TEXT_ROW_H;

        const block = document.createElement('div');
        block.className = 'media-block text' + (isSelected(tc.id) ? ' selected' : '');
        block.dataset.clipId = tc.id;
        block.style.left = left + 'px';
        block.style.width = width + 'px';
        block.style.top = top + 'px';
        block.style.height = (TEXT_ROW_H - 6) + 'px';

        const label = document.createElement('div');
        label.className = 'label';
        const preview = (tc.text || 'Text').replace(/\s+/g, ' ').trim();
        label.textContent = preview.slice(0, 28) || 'Text';
        block.appendChild(label);

        lane.appendChild(block);

        attachLongPress(block, {
          onPointerDown: () => {
            focusClip(tc.id);
            renderTextLane();
            updateTextOverlays();
          },
          onLongPress: (e) => {
            if (typeof isTouchUi === 'function' && isTouchUi()) return;
            showTextContextMenu(e.clientX, e.clientY, tc.id);
          },
          onDragStart: (e) => {
            startTextDrag(e, tc.id);
          },
        });
        block.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          focusClip(tc.id);
          renderTextLane();
          if (typeof isTouchUi === 'function' && isTouchUi()) return;
          showTextContextMenu(e.clientX, e.clientY, tc.id);
        });
        block.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          focusClip(tc.id);
          openTextEditModal(tc.id);
        });
      }
    }

    function showTextContextMenu(x, y, textId) {
      if (typeof isTouchUi === 'function' && isTouchUi()) return;
      if (typeof hideClipContextMenu === 'function') hideClipContextMenu();
      const existing = document.getElementById('clip-context-menu');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const menu = document.createElement('div');
      menu.className = 'clip-context-menu';
      menu.id = 'clip-context-menu';

      function addBtn(label, fn) {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (menu.parentNode) menu.parentNode.removeChild(menu);
          fn();
        });
        menu.appendChild(b);
      }

      addBtn('Copy', () => {
        focusClip(textId);
        copySelectedToClipboard();
      });
      addBtn('Duplicate', () => {
        focusClip(textId);
        duplicateSelected();
      });
      addBtn('Edit', () => openTextEditModal(textId));

      document.body.appendChild(menu);
      const pad = 6;
      let left = x;
      let top = y;
      const rect = menu.getBoundingClientRect();
      if (left + rect.width > window.innerWidth - pad) left = window.innerWidth - rect.width - pad;
      if (top + rect.height > window.innerHeight - pad) top = window.innerHeight - rect.height - pad;
      menu.style.left = Math.max(pad, left) + 'px';
      menu.style.top = Math.max(pad, top) + 'px';

      const closer = (ev) => {
        if (!menu.contains(ev.target)) {
          if (menu.parentNode) menu.parentNode.removeChild(menu);
          document.removeEventListener('pointerdown', closer, true);
        }
      };
      setTimeout(() => document.addEventListener('pointerdown', closer, true), 0);
    }

    // ---- Drag (move only) ----
    let textDrag = null; // { id, startX, startY, origStart, origTrack }

    function startTextDrag(e, id) {
      e.preventDefault();
      pushHistory();
      const tc = getTextClipById(id);
      if (!tc) return;
      textDrag = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        origStart: tc.startTime,
        origTrack: textTrackIndex(tc),
      };
      state.isDragging = true;
      state.dragTarget = 'text';
      timeRuler.classList.add('hide-ticks');
      document.addEventListener('pointermove', onTextDrag);
      document.addEventListener('pointerup', endTextDrag);
    }

    function onTextDrag(e) {
      if (!textDrag) return;
      const tc = getTextClipById(textDrag.id);
      if (!tc) return;
      const dx = e.clientX - textDrag.startX;
      const dy = e.clientY - textDrag.startY;
      const dt = pxToTime(dx);
      const dTrack = Math.round(dy / TEXT_ROW_H);
      let track = Math.max(0, Math.min(MAX_TEXT_TRACKS - 1, textDrag.origTrack + dTrack));
      let start = Math.max(0, textDrag.origStart + dt);
      const dur = textClipDuration(tc);
      // Bir qatorda ustma-ust bo'lmasin
      if (!textTrackSlotFree(track, start, dur, tc.id)) {
        start = resolveTextStartOnTrack(track, tc.id, start, dur);
        // Agar baribir joy yo'q (juda zich) — boshqa qatorga
        if (!textTrackSlotFree(track, start, dur, tc.id)) {
          track = findFreeTextTrack(start, dur, tc.id, track);
          start = resolveTextStartOnTrack(track, tc.id, start, dur);
        }
      }
      tc.track = track;
      tc.offsetY = track * TEXT_ROW_H;
      tc.startTime = start;
      renderTextLane();
      updateTimelineLayout();
      updateTextOverlays();
    }

    function endTextDrag() {
      if (textDrag) {
        const tc = getTextClipById(textDrag.id);
        if (tc) {
          const dur = textClipDuration(tc);
          const tr = textTrackIndex(tc);
          tc.startTime = resolveTextStartOnTrack(tr, tc.id, tc.startTime || 0, dur);
          tc.track = tr;
          tc.offsetY = tr * TEXT_ROW_H;
        }
      }
      textDrag = null;
      state.isDragging = false;
      state.dragTarget = null;
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onTextDrag);
      document.removeEventListener('pointerup', endTextDrag);
      renderTextLane();
      updateTimelineLayout();
      scheduleSave();
    }

    // ---- Preview overlays ----
    function getOverlayRoot() {
      let root = document.getElementById('text-overlay-root');
      if (!root) {
        const wrapper = document.querySelector('.video-wrapper');
        if (!wrapper) return null;
        root = document.createElement('div');
        root.id = 'text-overlay-root';
        root.className = 'text-overlay-root';
        wrapper.appendChild(root);
      }
      return root;
    }

    // CapCut-style: tanlangan matn preview ustida drag/resize/edit + floating toolbar
    let overlayPosDrag = null;   // { id, startX, startY, origX, origY, rootRect }
    let overlaySizeDrag = null;  // { id, startY, origSize }

    function commitInlineText(el, id) {
      const tc = getTextClipById(id);
      if (!tc || !el) return;
      // Handle element textContent'ga aralashmasin
      const handle = el.querySelector('.toi-handle');
      let next;
      if (handle) {
        const clone = el.cloneNode(true);
        const h2 = clone.querySelector('.toi-handle');
        if (h2) h2.remove();
        next = (clone.innerText || '').replace(/ /g, ' ').replace(/\s+$/,'');
      } else {
        next = (el.innerText || '').replace(/ /g, ' ').replace(/\s+$/,'');
      }
      if (next !== tc.text) {
        pushHistory();
        tc.text = next;
        renderTextLane();
        scheduleSave();
      }
    }

    function focusInlineTextEdit(id) {
      const root = getOverlayRoot();
      if (!root) return;
      const el = root.querySelector('.text-overlay-item[data-id="' + id + '"]');
      if (!el) return;
      // Handle contentEditable ichiga tushmasin
      const handle = el.querySelector('.toi-handle');
      if (handle) handle.style.display = 'none';
      el.classList.add('is-editing');
      el.contentEditable = 'true';
      el.focus();
      try {
        // Faqat matn node'larini tanlash
        const range = document.createRange();
        range.selectNodeContents(el);
        if (handle) {
          try { range.setEndBefore(handle); } catch (_) {}
        }
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
      showTextFloatBar(id);
    }

    function endInlineTextEdit(id) {
      const root = getOverlayRoot();
      const el = root && root.querySelector('.text-overlay-item[data-id="' + id + '"]');
      if (el) {
        commitInlineText(el, id);
        el.contentEditable = 'false';
        el.classList.remove('is-editing');
      }
      if (state.textInlineEditId === id) state.textInlineEditId = null;
    }

    function showTextFloatBar(id) {
      const bar = ensureTextFloatBar();
      const tc = getTextClipById(id);
      if (!tc) { bar.classList.remove('is-open'); return; }
      bar.dataset.textId = id;
      const sizeEl = bar.querySelector('.tfb-size-val');
      if (sizeEl) sizeEl.textContent = String(tc.fontSize || 32);
      const colorInp = bar.querySelector('.tfb-color');
      if (colorInp) colorInp.value = tc.color || '#ffffff';
      bar.querySelector('.tfb-bold')?.classList.toggle('is-on', !!tc.bold);
      bar.querySelectorAll('.tfb-align').forEach((btn) => {
        btn.classList.toggle('is-on', (btn.dataset.a || 'center') === (tc.align || 'center'));
      });
      const hasBg = (tc.bgOpacity != null ? tc.bgOpacity : 0.45) > 0.05;
      bar.querySelector('.tfb-bg-toggle')?.classList.toggle('is-on', hasBg);
      // preset highlight
      bar.querySelectorAll('.tfb-preset').forEach((btn) => {
        const match =
          (btn.dataset.color || '') === (tc.color || '#ffffff') &&
          (btn.dataset.bg || '') === (tc.bgColor || '#000000') &&
          Math.abs(Number(btn.dataset.op || 0) - (tc.bgOpacity != null ? tc.bgOpacity : 0.45)) < 0.06;
        btn.classList.toggle('is-on', match);
      });
      bar.classList.add('is-open');
    }

    function hideTextFloatBar() {
      const bar = document.getElementById('text-float-bar');
      if (bar) bar.classList.remove('is-open');
    }

    function ensureTextFloatBar() {
      let bar = document.getElementById('text-float-bar');
      if (bar) return bar;
      const area = document.querySelector('.preview-area') || document.querySelector('.video-wrapper');
      bar = document.createElement('div');
      bar.id = 'text-float-bar';
      bar.className = 'text-float-bar';
      bar.innerHTML =
        '<div class="tfb-group">' +
          '<button type="button" class="tfb-bold" title="Qalin"><b>B</b></button>' +
          '<label class="tfb-swatch" title="Rang"><input type="color" class="tfb-color" value="#ffffff"></label>' +
        '</div>' +
        '<div class="tfb-group tfb-size-group">' +
          '<button type="button" class="tfb-size-dec" title="Kichikroq">−</button>' +
          '<span class="tfb-size-val">32</span>' +
          '<button type="button" class="tfb-size-inc" title="Kattaroq">+</button>' +
        '</div>' +
        '<div class="tfb-group">' +
          '<button type="button" class="tfb-align" data-a="left" title="Chap">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/></svg>' +
          '</button>' +
          '<button type="button" class="tfb-align" data-a="center" title="Markaz">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M5 18h14"/></svg>' +
          '</button>' +
          '<button type="button" class="tfb-align" data-a="right" title="O\'ng">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M10 12h10M6 18h14"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="tfb-group tfb-presets">' +
          '<button type="button" class="tfb-preset" data-color="#ffffff" data-bg="#000000" data-op="0.45" title="Oq + fon" style="--p:#fff;--pb:#000"></button>' +
          '<button type="button" class="tfb-preset" data-color="#ffffff" data-bg="#000000" data-op="0" title="Oq" style="--p:#fff;--pb:transparent"></button>' +
          '<button type="button" class="tfb-preset" data-color="#FFE566" data-bg="#000000" data-op="0" title="Sariq" style="--p:#FFE566;--pb:transparent"></button>' +
          '<button type="button" class="tfb-preset" data-color="#111111" data-bg="#ffffff" data-op="0.9" title="Qora + oq fon" style="--p:#111;--pb:#fff"></button>' +
        '</div>' +
        '<div class="tfb-group">' +
          '<button type="button" class="tfb-bg-toggle" title="Fon yoq/o\'chir">Fon</button>' +
          '<button type="button" class="tfb-dur" title="Davomiylik">⏱</button>' +
          '<button type="button" class="tfb-del" title="O\'chirish">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 12h10l1-12"/></svg>' +
          '</button>' +
        '</div>';
      (area || document.body).appendChild(bar);

      const apply = (mut) => {
        const id = bar.dataset.textId;
        const tc = getTextClipById(id);
        if (!tc) return;
        pushHistory();
        mut(tc);
        updateTextOverlays();
        renderTextLane();
        scheduleSave();
        showTextFloatBar(id);
      };

      const bumpSize = (delta) => {
        apply((tc) => {
          tc.fontSize = Math.max(12, Math.min(120, (tc.fontSize || 32) + delta));
        });
      };

      bar.querySelector('.tfb-bold').addEventListener('click', () => {
        apply((tc) => { tc.bold = !tc.bold; });
      });

      let _colorHist = false;
      bar.querySelector('.tfb-color').addEventListener('input', (e) => {
        const id = bar.dataset.textId;
        const tc = getTextClipById(id);
        if (!tc) return;
        if (!_colorHist) { pushHistory(); _colorHist = true; }
        tc.color = e.target.value;
        updateTextOverlays();
        scheduleSave();
        showTextFloatBar(id);
      });
      bar.querySelector('.tfb-color').addEventListener('change', () => { _colorHist = false; });

      bar.querySelector('.tfb-size-dec').addEventListener('click', () => bumpSize(-4));
      bar.querySelector('.tfb-size-inc').addEventListener('click', () => bumpSize(4));

      bar.querySelectorAll('.tfb-align').forEach((btn) => {
        btn.addEventListener('click', () => {
          apply((tc) => { tc.align = btn.dataset.a || 'center'; });
        });
      });

      bar.querySelectorAll('.tfb-preset').forEach((btn) => {
        btn.addEventListener('click', () => {
          apply((tc) => {
            tc.color = btn.dataset.color || '#ffffff';
            tc.bgColor = btn.dataset.bg || '#000000';
            tc.bgOpacity = Number(btn.dataset.op != null ? btn.dataset.op : 0.45);
          });
        });
      });

      bar.querySelector('.tfb-bg-toggle').addEventListener('click', () => {
        apply((tc) => {
          const op = tc.bgOpacity != null ? tc.bgOpacity : 0.45;
          if (op > 0.05) {
            tc._prevBgOpacity = op;
            tc.bgOpacity = 0;
          } else {
            tc.bgOpacity = tc._prevBgOpacity != null ? tc._prevBgOpacity : 0.45;
            if (!tc.bgColor) tc.bgColor = '#000000';
          }
        });
      });

      bar.querySelector('.tfb-dur').addEventListener('click', () => {
        const id = bar.dataset.textId;
        if (id) openTextEditModal(id);
      });

      bar.querySelector('.tfb-del').addEventListener('click', () => {
        const id = bar.dataset.textId;
        if (!id) return;
        selectOnly(id);
        deleteSelectedTextClips();
        hideTextFloatBar();
      });

      document.addEventListener('pointerdown', (e) => {
        if (!state.textInlineEditId) return;
        const el = e.target.closest && e.target.closest('.text-overlay-item, .text-float-bar, .text-edit-modal-overlay');
        if (!el) endInlineTextEdit(state.textInlineEditId);
      }, true);

      return bar;
    }

    function startOverlayPosDrag(e, id) {
      if (e.button != null && e.button !== 0) return;
      const root = getOverlayRoot();
      if (!root) return;
      const tc = getTextClipById(id);
      if (!tc) return;
      // Agar editing — faqat text selection ishlasin
      if (state.textInlineEditId === id && e.target.closest && !e.target.classList.contains('toi-handle')) {
        // still allow drag from outline area if not on text caret intent — skip if contentEditable focused
        const el = e.target.closest('.text-overlay-item');
        if (el && el.isContentEditable && document.activeElement === el) return;
      }
      e.preventDefault();
      e.stopPropagation();
      selectOnly(id);
      const rect = root.getBoundingClientRect();
      overlayPosDrag = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        origX: tc.x != null ? tc.x : 0.5,
        origY: tc.y != null ? tc.y : 0.85,
        w: rect.width,
        h: rect.height,
      };
      pushHistory();
      document.addEventListener('pointermove', onOverlayPosDrag);
      document.addEventListener('pointerup', endOverlayPosDrag);
    }

    function onOverlayPosDrag(e) {
      if (!overlayPosDrag) return;
      const tc = getTextClipById(overlayPosDrag.id);
      if (!tc) return;
      const dx = (e.clientX - overlayPosDrag.startX) / Math.max(1, overlayPosDrag.w);
      const dy = (e.clientY - overlayPosDrag.startY) / Math.max(1, overlayPosDrag.h);
      tc.x = Math.max(0.02, Math.min(0.98, overlayPosDrag.origX + dx));
      tc.y = Math.max(0.02, Math.min(0.98, overlayPosDrag.origY + dy));
      updateTextOverlays();
    }

    function endOverlayPosDrag() {
      if (overlayPosDrag) {
        scheduleSave();
        showTextFloatBar(overlayPosDrag.id);
      }
      overlayPosDrag = null;
      document.removeEventListener('pointermove', onOverlayPosDrag);
      document.removeEventListener('pointerup', endOverlayPosDrag);
    }

    function startOverlaySizeDrag(e, id) {
      e.preventDefault();
      e.stopPropagation();
      const tc = getTextClipById(id);
      if (!tc) return;
      selectOnly(id);
      overlaySizeDrag = {
        id,
        startY: e.clientY,
        origSize: tc.fontSize || 32,
      };
      pushHistory();
      document.addEventListener('pointermove', onOverlaySizeDrag);
      document.addEventListener('pointerup', endOverlaySizeDrag);
    }

    function onOverlaySizeDrag(e) {
      if (!overlaySizeDrag) return;
      const tc = getTextClipById(overlaySizeDrag.id);
      if (!tc) return;
      const dy = overlaySizeDrag.startY - e.clientY; // yuqoriga = kattaroq
      const sc = (typeof getCanvasPreviewScale === 'function') ? getCanvasPreviewScale() : 1;
      tc.fontSize = Math.max(12, Math.min(120, Math.round(overlaySizeDrag.origSize + (dy / sc) * 0.4)));
      updateTextOverlays();
      const bar = document.getElementById('text-float-bar');
      if (bar && bar.classList.contains('is-open')) {
        const val = bar.querySelector('.tfb-size-val');
        if (val) val.textContent = String(tc.fontSize);
      }
    }

    function endOverlaySizeDrag() {
      if (overlaySizeDrag) {
        scheduleSave();
        showTextFloatBar(overlaySizeDrag.id);
      }
      overlaySizeDrag = null;
      document.removeEventListener('pointermove', onOverlaySizeDrag);
      document.removeEventListener('pointerup', endOverlaySizeDrag);
    }

    function applyOverlayStyles(el, tc, active) {
      el.style.left = ((tc.x != null ? tc.x : 0.5) * 100) + '%';
      el.style.top = ((tc.y != null ? tc.y : 0.85) * 100) + '%';
      el.style.color = tc.color || '#fff';
      // Matn o'lchami export kadr pikselida saqlanadi; preview'da canvas eniga qarab masshtablanadi (preview = export)
      const sc = (typeof getCanvasPreviewScale === 'function') ? getCanvasPreviewScale() : 1;
      el.style.fontSize = ((tc.fontSize || 32) * sc) + 'px';
      el.style.padding = (6 * sc) + 'px ' + (10 * sc) + 'px';
      el.style.fontWeight = tc.bold ? '700' : '400';
      el.style.textAlign = tc.align || 'center';
      const bg = tc.bgColor || '#000000';
      const op = tc.bgOpacity != null ? tc.bgOpacity : 0.45;
      el.style.background = hexToRgba(bg, op);
      el.classList.toggle('is-active', !!active);
      el.classList.toggle('is-editing', state.textInlineEditId === tc.id);
    }

    function wireOverlayItem(el, tc) {
      if (el.dataset.wired === '1') return;
      el.dataset.wired = '1';
      el.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('toi-handle')) return;
        startOverlayPosDrag(e, tc.id);
      });
      el.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.textInlineEditId = tc.id;
        focusInlineTextEdit(tc.id);
      });
      el.addEventListener('blur', () => {
        if (state.textInlineEditId === tc.id) {
          setTimeout(() => {
            if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.text-float-bar')) return;
            if (document.activeElement === el) return;
            endInlineTextEdit(tc.id);
            updateTextOverlays();
          }, 120);
        }
      }, true);
    }

    function updateTextOverlays() {
      const root = getOverlayRoot();
      if (!root) return;

      // Drag/edit paytida DOM ni yo'qotmasdan faqat style yangilaymiz
      if (overlayPosDrag || overlaySizeDrag) {
        const id = (overlayPosDrag || overlaySizeDrag).id;
        const tc = getTextClipById(id);
        const el = root.querySelector('.text-overlay-item[data-id="' + id + '"]');
        if (tc && el) applyOverlayStyles(el, tc, true);
        return;
      }

      // Inline edit: matnni commit qilmaymiz har frame — faqat style
      if (state.textInlineEditId) {
        const el = root.querySelector('.text-overlay-item[data-id="' + state.textInlineEditId + '"]');
        const tc = getTextClipById(state.textInlineEditId);
        if (el && tc && el.isContentEditable && document.activeElement === el) {
          applyOverlayStyles(el, tc, true);
          // Boshqa kliplar ham ko'rinsin — soft path only for active
          showTextFloatBar(tc.id);
          return;
        }
      }

      const t = state.currentTime;
      const needed = new Set();
      let visibleSelected = null;

      for (const tc of (state.textClips || [])) {
        if (t < tc.startTime || t >= textClipEnd(tc)) continue;
        needed.add(tc.id);
        let el = root.querySelector('.text-overlay-item[data-id="' + tc.id + '"]');
        const active = isSelected(tc.id) || state.textInlineEditId === tc.id;
        if (!el) {
          el = document.createElement('div');
          el.className = 'text-overlay-item';
          el.dataset.id = tc.id;
          el.textContent = tc.text || '';
          root.appendChild(el);
        } else if (!el.isContentEditable) {
          // Matn faqat tashqaridan o'zgarganda
          if (el.childNodes.length === 1 && el.firstChild && el.firstChild.nodeType === 3) {
            if (el.textContent !== (tc.text || '')) el.textContent = tc.text || '';
          } else if (!el.querySelector('.toi-handle') && el.textContent !== (tc.text || '')) {
            el.textContent = tc.text || '';
          }
        }
        applyOverlayStyles(el, tc, active);

        if (active) {
          visibleSelected = tc.id;
          if (!el.querySelector('.toi-handle')) {
            const h = document.createElement('span');
            h.className = 'toi-handle';
            h.title = "O'lcham";
            h.addEventListener('pointerdown', (e) => startOverlaySizeDrag(e, tc.id));
            el.appendChild(h);
          }
          wireOverlayItem(el, tc);
        } else {
          const h = el.querySelector('.toi-handle');
          if (h) h.remove();
          el.contentEditable = 'false';
          el.classList.remove('is-editing');
        }
      }

      // Keraksiz elementlarni olib tashlash
      [...root.querySelectorAll('.text-overlay-item')].forEach(el => {
        if (!needed.has(el.dataset.id)) el.remove();
      });

      if (visibleSelected) {
        showTextFloatBar(visibleSelected);
      } else {
        hideTextFloatBar();
        if (state.textInlineEditId) state.textInlineEditId = null;
      }
    }

    function hexToRgba(hex, alpha) {
      let h = (hex || '#000000').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const r = parseInt(h.slice(0, 2), 16) || 0;
      const g = parseInt(h.slice(2, 4), 16) || 0;
      const b = parseInt(h.slice(4, 6), 16) || 0;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 0.45) + ')';
    }

    // ---- Export canvas draw ----
    function drawTextOverlaysOnCanvas(ctx, outW, outH, elapsed) {
      for (const tc of (state.textClips || [])) {
        if (elapsed < tc.startTime || elapsed >= textClipEnd(tc)) continue;
        const text = tc.text || '';
        if (!text) continue;
        const fontSize = tc.fontSize || 32;
        const bold = tc.bold ? 'bold ' : '';
        ctx.font = bold + fontSize + 'px sans-serif';
        ctx.textAlign = tc.align || 'center';
        ctx.textBaseline = 'middle';

        const x = (tc.x != null ? tc.x : 0.5) * outW;
        const y = (tc.y != null ? tc.y : 0.85) * outH;
        const lines = text.split('\n');
        const lineH = fontSize * 1.25;
        const maxW = Math.max(...lines.map(l => ctx.measureText(l).width), 0);
        const padX = 10;
        const padY = 6;
        const boxH = lines.length * lineH + padY * 2;
        const boxW = maxW + padX * 2;

        let boxX = x - boxW / 2;
        if ((tc.align || 'center') === 'left') boxX = x - padX;
        if ((tc.align || 'center') === 'right') boxX = x - boxW + padX;

        const bg = tc.bgColor || '#000000';
        const op = tc.bgOpacity != null ? tc.bgOpacity : 0.45;
        ctx.fillStyle = hexToRgba(bg, op);
        ctx.fillRect(boxX, y - boxH / 2, boxW, boxH);

        ctx.fillStyle = tc.color || '#ffffff';
        lines.forEach((line, i) => {
          const ly = y - ((lines.length - 1) * lineH) / 2 + i * lineH;
          ctx.fillText(line, x, ly);
        });
      }
    }

    // ---- Edit modal ----
    let textModalEl = null;

    function closeTextEditModal() {
      if (textModalEl && textModalEl.parentNode) textModalEl.parentNode.removeChild(textModalEl);
      textModalEl = null;
    }

    function openTextEditModal(id) {
      closeTextEditModal();
      const tc = getTextClipById(id);
      if (!tc) return;

      const overlay = document.createElement('div');
      overlay.className = 'text-edit-modal-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeTextEditModal();
      });

      const modal = document.createElement('div');
      modal.className = 'text-edit-modal';
      modal.addEventListener('click', (e) => e.stopPropagation());

      modal.innerHTML = `
        <div class="tem-title">Matn sozlamalari</div>
        <label class="tem-label">Matn</label>
        <textarea class="tem-textarea" id="tem-text" rows="3" placeholder="Matn yozing…"></textarea>
        <div class="tem-row tem-row-single">
          <label class="tem-field">Davomiylik (s)
            <input type="number" id="tem-dur" min="0.2" max="600" step="0.1" />
          </label>
        </div>
        <div class="tem-actions">
          <button type="button" class="tem-btn ghost" id="tem-cancel">Bekor</button>
          <button type="button" class="tem-btn primary" id="tem-ok">Saqlash</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      textModalEl = overlay;

      modal.querySelector('#tem-text').value = tc.text || '';
      modal.querySelector('#tem-dur').value = tc.duration || 3;

      modal.querySelector('#tem-cancel').addEventListener('click', () => closeTextEditModal());
      modal.querySelector('#tem-ok').addEventListener('click', () => {
        pushHistory();
        tc.text = modal.querySelector('#tem-text').value;
        tc.duration = Math.max(0.2, Number(modal.querySelector('#tem-dur').value) || 3);
        closeTextEditModal();
        renderTextLane();
        updateTimelineLayout();
        updateTextOverlays();
        scheduleSave();
      });

      setTimeout(() => modal.querySelector('#tem-text')?.focus(), 50);
    }

    function deleteSelectedTextClips() {
      const ids = (state.textClips || []).filter(c => isSelected(c.id)).map(c => c.id);
      if (!ids.length) return false;
      pushHistory();
      state.textClips = state.textClips.filter(c => !ids.includes(c.id));
      clearSelection();
      renderTextLane();
      updateTimelineLayout();
      updateTextOverlays();
      scheduleSave();
      showToast(ids.length > 1 ? ids.length + ' ta matn o\'chirildi' : 'Matn o\'chirildi');
      return true;
    }

    // Toolbar
    document.getElementById('text-btn')?.addEventListener('click', () => addTextClip());

    // Init overlay root
    getOverlayRoot();

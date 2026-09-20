    // ===================== TEXT OVERLAY =====================
    const TEXT_DEFAULTS = {
      text: 'Text',
      duration: 3,
      offsetY: 0,
      x: 0.5,
      y: 0.85,
      fontSize: 32,
      color: '#ffffff',
      bold: false,
      align: 'center',
      bgColor: '#000000',
      bgOpacity: 0.45,
    };

    function createTextClip(overrides = {}) {
      return {
        id: makeTextClipId(),
        text: TEXT_DEFAULTS.text,
        startTime: state.currentTime || 0,
        duration: TEXT_DEFAULTS.duration,
        offsetY: TEXT_DEFAULTS.offsetY,
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
      const tc = createTextClip();
      if (!state.textClips) state.textClips = [];
      state.textClips.push(tc);
      selectOnly(tc.id);
      renderTextLane();
      updateTimelineLayout();
      updateTextOverlays();
      scheduleSave();
      showToast('Matn qo\'shildi');
      openTextEditModal(tc.id);
    }

    function getTextLane() {
      return document.getElementById('text-lane');
    }

    function getTextTrack() {
      return document.getElementById('text-track');
    }

    function renderTextLane() {
      const lane = getTextLane();
      const track = getTextTrack();
      if (!lane || !track) return;

      lane.innerHTML = '';
      const list = state.textClips || [];
      track.style.display = list.length ? 'flex' : 'none';

      for (const tc of list) {
        const left = timeToPx(tc.startTime);
        const width = Math.max(timeToPx(Math.max(0.1, tc.duration || 1)), 24);

        const block = document.createElement('div');
        block.className = 'media-block text' + (isSelected(tc.id) ? ' selected' : '');
        block.dataset.clipId = tc.id;
        block.style.left = left + 'px';
        block.style.width = width + 'px';
        block.style.top = (4 + (tc.offsetY || 0)) + 'px';

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
          },
          onLongPress: (e) => {
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
    let textDrag = null; // { id, startX, origStart }

    function startTextDrag(e, id) {
      e.preventDefault();
      pushHistory();
      const tc = getTextClipById(id);
      if (!tc) return;
      textDrag = {
        id,
        startX: e.clientX,
        origStart: tc.startTime,
      };
      state.isDragging = true;
      timeRuler.classList.add('hide-ticks');
      document.addEventListener('pointermove', onTextDrag);
      document.addEventListener('pointerup', endTextDrag);
    }

    function onTextDrag(e) {
      if (!textDrag) return;
      const tc = getTextClipById(textDrag.id);
      if (!tc) return;
      const dx = e.clientX - textDrag.startX;
      const dt = pxToTime(dx);
      tc.startTime = Math.max(0, textDrag.origStart + dt);
      renderTextLane();
      updateTimelineLayout();
      updateTextOverlays();
    }

    function endTextDrag() {
      textDrag = null;
      state.isDragging = false;
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onTextDrag);
      document.removeEventListener('pointerup', endTextDrag);
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

    function updateTextOverlays() {
      const root = getOverlayRoot();
      if (!root) return;
      root.innerHTML = '';
      const t = state.currentTime;
      for (const tc of (state.textClips || [])) {
        if (t >= tc.startTime && t < textClipEnd(tc)) {
          const el = document.createElement('div');
          el.className = 'text-overlay-item';
          el.style.left = ((tc.x != null ? tc.x : 0.5) * 100) + '%';
          el.style.top = ((tc.y != null ? tc.y : 0.85) * 100) + '%';
          el.style.color = tc.color || '#fff';
          el.style.fontSize = (tc.fontSize || 32) + 'px';
          el.style.fontWeight = tc.bold ? '700' : '400';
          el.style.textAlign = tc.align || 'center';
          const bg = tc.bgColor || '#000000';
          const op = tc.bgOpacity != null ? tc.bgOpacity : 0.45;
          el.style.background = hexToRgba(bg, op);
          el.textContent = tc.text || '';
          root.appendChild(el);
        }
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
        <div class="tem-title">Edit Text</div>
        <label class="tem-label">Text</label>
        <textarea class="tem-textarea" id="tem-text" rows="3"></textarea>
        <div class="tem-row">
          <label>Size <input type="number" id="tem-size" min="12" max="120" step="1" /></label>
          <label>Color <input type="color" id="tem-color" /></label>
          <label class="tem-check"><input type="checkbox" id="tem-bold" /> Bold</label>
        </div>
        <div class="tem-row">
          <label>Align
            <select id="tem-align">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label>Duration (s) <input type="number" id="tem-dur" min="0.2" max="600" step="0.1" /></label>
        </div>
        <div class="tem-row">
          <label>BG <input type="color" id="tem-bg" /></label>
          <label class="tem-slider">BG opacity <input type="range" id="tem-bgop" min="0" max="100" step="1" /> <span id="tem-bgop-val"></span></label>
        </div>
        <div class="tem-row">
          <label>X (0–1) <input type="number" id="tem-x" min="0" max="1" step="0.01" /></label>
          <label>Y (0–1) <input type="number" id="tem-y" min="0" max="1" step="0.01" /></label>
        </div>
        <div class="tem-actions">
          <button type="button" class="tem-btn ghost" id="tem-cancel">Cancel</button>
          <button type="button" class="tem-btn" id="tem-ok">OK</button>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      textModalEl = overlay;

      modal.querySelector('#tem-text').value = tc.text || '';
      modal.querySelector('#tem-size').value = tc.fontSize || 32;
      modal.querySelector('#tem-color').value = tc.color || '#ffffff';
      modal.querySelector('#tem-bold').checked = !!tc.bold;
      modal.querySelector('#tem-align').value = tc.align || 'center';
      modal.querySelector('#tem-dur').value = tc.duration || 3;
      modal.querySelector('#tem-bg').value = tc.bgColor || '#000000';
      const opPct = Math.round((tc.bgOpacity != null ? tc.bgOpacity : 0.45) * 100);
      modal.querySelector('#tem-bgop').value = String(opPct);
      modal.querySelector('#tem-bgop-val').textContent = opPct + '%';
      modal.querySelector('#tem-x').value = tc.x != null ? tc.x : 0.5;
      modal.querySelector('#tem-y').value = tc.y != null ? tc.y : 0.85;

      modal.querySelector('#tem-bgop').addEventListener('input', (e) => {
        modal.querySelector('#tem-bgop-val').textContent = e.target.value + '%';
      });

      modal.querySelector('#tem-cancel').addEventListener('click', () => closeTextEditModal());
      modal.querySelector('#tem-ok').addEventListener('click', () => {
        pushHistory();
        tc.text = modal.querySelector('#tem-text').value;
        tc.fontSize = Math.max(12, Math.min(120, Number(modal.querySelector('#tem-size').value) || 32));
        tc.color = modal.querySelector('#tem-color').value || '#ffffff';
        tc.bold = !!modal.querySelector('#tem-bold').checked;
        tc.align = modal.querySelector('#tem-align').value || 'center';
        tc.duration = Math.max(0.2, Number(modal.querySelector('#tem-dur').value) || 3);
        tc.bgColor = modal.querySelector('#tem-bg').value || '#000000';
        tc.bgOpacity = Math.max(0, Math.min(1, Number(modal.querySelector('#tem-bgop').value) / 100));
        tc.x = Math.max(0, Math.min(1, Number(modal.querySelector('#tem-x').value) || 0.5));
        tc.y = Math.max(0, Math.min(1, Number(modal.querySelector('#tem-y').value) || 0.85));
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

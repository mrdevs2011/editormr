    // ===================== CANVAS (aspect ratio tanlash) =====================
    // Canvas = preview ustidagi va export qilinadigan kadr nisbati.
    //   state.canvasRatio : preset id ('9:16' | '1:1' | ... | 'fit')
    //   'fit'             : birinchi (asosiy qator) clipning o'z nisbati — eski xatti-harakat
    // Preview (#preview-stack) shu nisbatda o'lchanadi, export (export.js) getCanvasOutputSize() dan o'qiydi,
    // clip'lar canvas ichiga "contain" (qora chetlar bilan) joylashadi.

    const CANVAS_MAX_SIDE = 1280;   // export.js dagi eski chegara bilan bir xil (uzun tomon)

    // Rasmlardagi jadval: nisbat, nom, qayerda ishlatiladi
    const CANVAS_PRESETS = [
      { id: '9:16',   r: 9 / 16,   label: '9:16',   title: '9:16',            sub: 'Tik/Vertikal',        use: 'Smartfon (To‘liq), TikTok, Reels, Shorts' },
      { id: '1:1',    r: 1,        label: '1:1',    title: '1:1',             sub: 'Kvadrat',             use: 'Instagram Post (Lenta), Facebook Post' },
      { id: '16:9',   r: 16 / 9,   label: '16:9',   title: '16:9',            sub: 'Gorizontal',          use: 'YouTube (Standart), TV, Monitorlar, Filmlar' },
      { id: '4:5',    r: 4 / 5,    label: '4:5',    title: '4:5',             sub: 'Uzunchoq',            use: 'Instagram Lenta (Optimal), E’tibor tortuvchi' },
      { id: '3:4',    r: 3 / 4,    label: '3:4',    title: '3:4',             sub: 'O‘rtacha Vertikal',   use: 'Pinterest, Ijtimoiy tarmoq postlari' },
      { id: '2:3',    r: 2 / 3,    label: '2:3',    title: '2:3',             sub: 'Portret Baland',      use: 'Pinterest, Vertikal posterlar' },
      { id: '2.35:1', r: 2.35,     label: '2.35:1', title: '2.1:1 / 2.35:1',  sub: 'Ultra-keng/Kino',     use: 'Kino stili, Treylerlar, Filmlar' },
      { id: 'fit',    r: 0,        label: 'Fit',    title: 'Fit',             sub: 'Original',            use: 'Videoning o‘z o‘lchami, Manbaga moslashish' },
    ];

    function canvasPresetById(id) {
      return CANVAS_PRESETS.find(p => p.id === id) || null;
    }

    function canvasValidId(id) {
      return canvasPresetById(id) ? id : 'fit';
    }

    // ---------- Fit: asosiy qatordagi birinchi clipning o'lchami ----------
    const _canvasProbing = new Set();

    function canvasRefClip() {
      const list = (state.videoClips || []).filter(c => !isFloated(c)).sort((a, b) => a.startTime - b.startTime);
      return list[0] || (state.videoClips || [])[0] || null;
    }

    // Clip'ning haqiqiy piksel o'lchamini o'qiydi va clip._vw/_vh ga yozadi (saqlanmaydi — har ochilganda qayta o'qiladi)
    function canvasProbeClipSize(clip) {
      return new Promise((resolve) => {
        if (!clip || !clip.url) return resolve();
        const done = () => resolve();
        if (clip.isImage) {
          const im = new Image();
          im.onload = () => { clip._vw = im.naturalWidth; clip._vh = im.naturalHeight; done(); };
          im.onerror = done;
          im.src = clip.url;
          return;
        }
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        const finish = () => {
          if (v.videoWidth && v.videoHeight) { clip._vw = v.videoWidth; clip._vh = v.videoHeight; }
          v.onloadedmetadata = null; v.onerror = null;
          v.removeAttribute('src');
          try { v.load(); } catch (_) {}
          done();
        };
        v.onloadedmetadata = finish;
        v.onerror = finish;
        setTimeout(finish, 4000);
        v.src = clip.url;
      });
    }

    function getFitSourceSize() {
      const c = canvasRefClip();
      if (c && c._vw && c._vh) return { w: c._vw, h: c._vh };
      if (c && !_canvasProbing.has(c.id)) {
        _canvasProbing.add(c.id);
        canvasProbeClipSize(c).then(() => {
          _canvasProbing.delete(c.id);
          if (c._vw && c._vh) applyCanvas();
        });
      }
      // Probe tugaguncha: hozir preview'da turgan videoning o'lchami, bo'lmasa 16:9
      if (!state.isImage && previewVideo && previewVideo.videoWidth > 0) {
        return { w: previewVideo.videoWidth, h: previewVideo.videoHeight };
      }
      return { w: 1280, h: 720 };
    }

    function getCanvasRatio() {
      const p = canvasPresetById(state.canvasRatio);
      if (p && p.r) return p.r;
      const s = getFitSourceSize();
      return s.w / s.h;
    }

    // Export (va preview'dagi matn masshtabi) uchun chiqish o'lchami. Har ikki tomon juft (ffmpeg/x264 uchun).
    function getCanvasOutputSize() {
      const p = canvasPresetById(state.canvasRatio);
      let w, h;
      if (p && p.r) {
        // Uzun tomon = 1280
        if (p.r >= 1) { w = CANVAS_MAX_SIDE; h = CANVAS_MAX_SIDE / p.r; }
        else { h = CANVAS_MAX_SIDE; w = CANVAS_MAX_SIDE * p.r; }
      } else {
        // Fit: manba o'lchami, faqat kattasi kichraytiriladi (eski xatti-harakat)
        const s = getFitSourceSize();
        w = s.w; h = s.h;
        const m = Math.max(w, h);
        if (m > CANVAS_MAX_SIDE) { const k = CANVAS_MAX_SIDE / m; w *= k; h *= k; }
      }
      w = Math.round(w); h = Math.round(h);
      w = Math.max(2, w - (w % 2));
      h = Math.max(2, h - (h % 2));
      return { w, h };
    }

    // Export uchun: manbani (video/rasm) katak ichiga "contain" qilib chizadi (cho'zmaydi)
    function canvasDrawContain(ctx, src, sw, sh, dx, dy, dw, dh) {
      if (!sw || !sh) { ctx.drawImage(src, dx, dy, dw, dh); return; }
      const k = Math.min(dw / sw, dh / sh);
      const w = sw * k, h = sh * k;
      ctx.drawImage(src, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
    }

    // ---------- Preview qutisi ----------
    const canvasBox = { w: 0, h: 0, scale: 1 };

    // Preview'dagi matn masshtabi: preview eni / export eni (matn preview'da ham export'dagi kabi ko'rinsin)
    function getCanvasPreviewScale() {
      return canvasBox.scale > 0 ? canvasBox.scale : 1;
    }

    function fitCanvasBox() {
      const stack = document.getElementById('preview-stack');
      const wrap = stack && stack.parentElement;
      if (!stack || !wrap) return;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      if (cw < 2 || ch < 2) return;            // editor hali ko'rinmayapti — ResizeObserver keyin chaqiradi
      const r = getCanvasRatio();
      let w = cw, h = cw / r;
      if (h > ch) { h = ch; w = ch * r; }
      w = Math.max(2, Math.floor(w));
      h = Math.max(2, Math.floor(h));

      const out = getCanvasOutputSize();
      const scale = w / out.w;
      const changed = w !== canvasBox.w || h !== canvasBox.h || Math.abs(scale - canvasBox.scale) > 1e-4;
      if (!changed) return;

      canvasBox.w = w; canvasBox.h = h; canvasBox.scale = scale;
      stack.style.width = w + 'px';
      stack.style.height = h + 'px';
      if (typeof updateTextOverlays === 'function') updateTextOverlays();
    }

    function updateCanvasButton() {
      const lbl = document.getElementById('canvas-btn-label');
      const p = canvasPresetById(state.canvasRatio);
      if (lbl) lbl.textContent = p ? p.label : 'Fit';
      const btn = document.getElementById('canvas-btn');
      if (btn && p) btn.title = 'Canvas: ' + p.title + ' (' + p.sub + ')';
    }

    function applyCanvas() {
      fitCanvasBox();
      updateCanvasButton();
      if (canvasPickerEl && canvasPickerEl.classList.contains('is-open')) refreshCanvasPicker();
    }

    // Clip'lar o'zgarganda (renderVideoBlock chaqiradi) — Fit nisbati yangilanadi
    function canvasOnClipsChanged() {
      if (state.canvasRatio === 'fit') applyCanvas();
    }

    function setCanvasRatio(id, opts) {
      opts = opts || {};
      id = canvasValidId(id);
      if (id === state.canvasRatio) return;
      if (opts.history !== false && typeof pushHistory === 'function') pushHistory();
      state.canvasRatio = id;
      applyCanvas();
      if (opts.save !== false && typeof scheduleSave === 'function') scheduleSave();
    }

    // ---------- Rasmlar (qo'lda chizilgan uslubdagi oddiy chiziqli illyustratsiyalar, brend belgilarisiz) ----------
    const CANVAS_ART = {
      '9:16':
        '<svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<rect x="33" y="8" width="24" height="5" rx="2.5"/>' +
        '<rect x="12" y="38" width="30" height="30" rx="9"/><path d="M23 47l12 6-12 6z"/>' +
        '<rect x="48" y="38" width="30" height="30" rx="9"/><rect x="56" y="46" width="14" height="14" rx="4"/><circle cx="63" cy="53" r="3"/>' +
        '<rect x="30" y="78" width="30" height="30" rx="9"/><path d="M47 87v13"/><circle cx="43" cy="101" r="4"/><path d="M47 87l7 3"/>' +
        '<rect x="12" y="118" width="30" height="16" rx="6"/><rect x="48" y="118" width="30" height="16" rx="6"/>' +
        '<path d="M36 150h18"/></svg>',
      '1:1':
        '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<circle cx="14" cy="12" r="5"/><path d="M24 10h32M24 15h22"/>' +
        '<rect x="8" y="24" width="84" height="48" rx="2"/>' +
        '<path d="M8 64l20-18 14 12 14-10 36 24"/><circle cx="74" cy="37" r="5"/>' +
        '<path d="M14 83c-4-4-2-9 2-9 2 0 3 1 4 2 1-1 2-2 4-2 4 0 6 5 2 9l-6 6z"/>' +
        '<circle cx="38" cy="82" r="5"/><path d="M8 95h30M46 95h14"/></svg>',
      '16:9':
        '<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<path d="M12 14h34M114 14h34"/>' +
        '<rect x="56" y="22" width="48" height="34" rx="10"/><path d="M75 31l14 8-14 8z"/>' +
        '<path d="M12 74h136"/><circle cx="58" cy="74" r="3.2" class="f"/></svg>',
      '4:5':
        '<svg viewBox="0 0 80 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<circle cx="12" cy="10" r="4"/><path d="M20 8h26M20 13h18"/>' +
        '<rect x="6" y="20" width="68" height="58" rx="2"/>' +
        '<circle cx="40" cy="49" r="5"/>' +
        '<ellipse cx="40" cy="38" rx="5" ry="8"/><ellipse cx="40" cy="38" rx="5" ry="8" transform="rotate(72 40 49)"/>' +
        '<ellipse cx="40" cy="38" rx="5" ry="8" transform="rotate(144 40 49)"/><ellipse cx="40" cy="38" rx="5" ry="8" transform="rotate(216 40 49)"/>' +
        '<ellipse cx="40" cy="38" rx="5" ry="8" transform="rotate(288 40 49)"/>' +
        '<path d="M12 90c-3-3-1-7 2-7 1.5 0 2.5.7 3 1.5.5-.8 1.5-1.5 3-1.5 3 0 5 4 2 7l-5 5z"/><path d="M34 90h26"/></svg>',
      '3:4':
        '<svg viewBox="0 0 90 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<rect x="10" y="12" width="70" height="74" rx="2"/>' +
        '<path d="M10 74l22-24 15 15 12-10 21 19"/><circle cx="60" cy="30" r="6"/>' +
        '<path d="M10 99h50M10 108h32"/></svg>',
      '2:3':
        '<svg viewBox="0 0 80 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<circle cx="40" cy="36" r="12"/>' +
        '<path d="M14 88c0-20 11-30 26-30s26 10 26 30"/>' +
        '<path d="M14 104h52M22 112h36"/></svg>',
      '2.35:1':
        '<svg viewBox="0 0 141 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<rect x="0" y="0" width="141" height="9" class="f"/><rect x="0" y="51" width="141" height="9" class="f"/>' +
        '<path d="M0 46l24-15 16 9 22-20 26 21 18-10 35 15"/><circle cx="104" cy="22" r="5"/></svg>',
      'fit':
        '<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
        '<path d="M10 24V10h14M150 24V10h-14M10 66v14h14M150 66v14h-14"/>' +
        '<rect x="52" y="26" width="56" height="38" rx="4"/><path d="M74 35l14 10-14 10z"/></svg>',
    };

    // ---------- Picker ----------
    let canvasPickerEl = null;

    function canvasCardHtml(p) {
      const r = p.r || 16 / 9;                       // Fit uchun chizma 16:9 da turadi
      return '' +
        '<button type="button" class="cv-card" role="radio" aria-checked="false" data-id="' + p.id + '">' +
          '<span class="cv-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
          '<span class="cv-title">' + p.title + '</span>' +
          '<span class="cv-sub">(' + p.sub + ')</span>' +
          '<span class="cv-stage">' +
            '<span class="cv-frame' + (p.id === 'fit' ? ' is-fit' : '') + '" style="--r:' + r.toFixed(4) + '">' + CANVAS_ART[p.id] + '</span>' +
          '</span>' +
          '<span class="cv-use">' + p.use + '</span>' +
        '</button>';
    }

    function buildCanvasPicker() {
      if (canvasPickerEl) return canvasPickerEl;
      const ov = document.createElement('div');
      ov.className = 'cv-overlay';
      ov.id = 'canvas-picker';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-label', 'Canvas');
      ov.innerHTML =
        '<div class="cv-panel">' +
          '<div class="cv-head">' +
            '<div class="cv-head-text">' +
              '<h2>Canvas</h2>' +
              '<p>Aspect ratio va ularning qo‘llanilishi</p>' +
            '</div>' +
            '<button type="button" class="cv-close" aria-label="Yopish"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
          '</div>' +
          '<div class="cv-row" role="radiogroup" aria-label="Aspect ratio">' +
            CANVAS_PRESETS.map(canvasCardHtml).join('') +
          '</div>' +
          '<div class="cv-foot">Export o‘lchami: <b id="cv-foot-size"></b></div>' +
        '</div>';
      document.body.appendChild(ov);

      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) closeCanvasPicker(); });
      ov.querySelector('.cv-close').addEventListener('click', closeCanvasPicker);
      ov.querySelectorAll('.cv-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          setCanvasRatio(btn.dataset.id);
          refreshCanvasPicker();
          setTimeout(closeCanvasPicker, 160);       // tanlov ko'rinib tursin, keyin yopiladi
        });
      });
      canvasPickerEl = ov;
      return ov;
    }

    function refreshCanvasPicker() {
      if (!canvasPickerEl) return;
      const cur = canvasValidId(state.canvasRatio);
      canvasPickerEl.querySelectorAll('.cv-card').forEach((btn) => {
        const on = btn.dataset.id === cur;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      const size = getCanvasOutputSize();
      const el = canvasPickerEl.querySelector('#cv-foot-size');
      if (el) el.textContent = size.w + ' × ' + size.h + ' px';
    }

    function openCanvasPicker() {
      const ov = buildCanvasPicker();
      refreshCanvasPicker();
      ov.classList.add('is-open');
      const sel = ov.querySelector('.cv-card.is-selected');
      if (sel) {
        try { sel.focus({ preventScroll: true }); } catch (_) { sel.focus(); }
        // tanlangan karta panel (mobil) ichida ko'rinib tursin
        requestAnimationFrame(() => { try { sel.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) {} });
      }
    }

    function closeCanvasPicker() {
      if (canvasPickerEl) canvasPickerEl.classList.remove('is-open');
      const btn = document.getElementById('canvas-btn');
      if (btn) { try { btn.focus({ preventScroll: true }); } catch (_) {} }
    }

    document.addEventListener('keydown', (e) => {
      if (!canvasPickerEl || !canvasPickerEl.classList.contains('is-open')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCanvasPicker();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const cards = [...canvasPickerEl.querySelectorAll('.cv-card')];
        const i = cards.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const n = cards[(i + (e.key === 'ArrowRight' ? 1 : cards.length - 1)) % cards.length];
        n.focus();
      }
    });

    document.getElementById('canvas-btn')?.addEventListener('click', () => {
      if (canvasPickerEl && canvasPickerEl.classList.contains('is-open')) closeCanvasPicker();
      else openCanvasPicker();
    });

    // Preview joyi o'zgarganda (oyna, timeline balandligi, editor ochilishi) canvas qutisini qayta hisoblaymiz
    (function watchCanvasArea() {
      const stack = document.getElementById('preview-stack');
      const wrap = stack && stack.parentElement;
      if (!wrap) return;
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitCanvasBox()).observe(wrap);
      window.addEventListener('resize', fitCanvasBox);
      updateCanvasButton();
      fitCanvasBox();
    })();

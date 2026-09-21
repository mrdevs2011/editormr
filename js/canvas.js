    // ===================== CANVAS (aspect ratio tanlash) =====================
    // Canvas = preview ustidagi va export qilinadigan kadr nisbati.
    //   state.canvasRatio : preset id ('9:16' | '1:1' | ... | 'fit')
    //   'fit'             : birinchi (asosiy qator) clipning o'z nisbati — eski xatti-harakat
    // Preview (#preview-stack) shu nisbatda o'lchanadi, export (export.js) getCanvasOutputSize() dan o'qiydi,
    // clip'lar canvas ichiga "contain" (qora chetlar bilan) joylashadi.

    const CANVAS_MAX_SIDE = 1280;   // preview masshtabi; export sifat tanlovi maxSide ni alohida beradi

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
    // opts.maxSide berilsa (720p=1280, 1080p=1920) shu cap ishlatiladi; preview default 1280.
    function getCanvasOutputSize(opts) {
      const maxSide = (opts && opts.maxSide) ? opts.maxSide : CANVAS_MAX_SIDE;
      const p = canvasPresetById(state.canvasRatio);
      let w, h;
      if (p && p.r) {
        if (p.r >= 1) { w = maxSide; h = maxSide / p.r; }
        else { h = maxSide; w = maxSide * p.r; }
      } else {
        // Fit: manba o'lchami, faqat kattasi kichraytiriladi (eski xatti-harakat)
        const s = getFitSourceSize();
        w = s.w; h = s.h;
        const m = Math.max(w, h);
        if (m > maxSide) { const k = maxSide / m; w *= k; h *= k; }
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

    // ---------- Rasmlar: har bir nisbat ichida shu formatni ishlatadigan ilovalar logotiplari ----------
    // Logotiplar Simple Icons (CC0) dan, 24×24 katakda. Ular tegishli kompaniyalarning savdo belgilari —
    // bu yerda faqat format qaysi ilovalarda ishlatilishini ko'rsatish uchun.
    const CANVAS_LOGOS = {
      tiktok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
      instagram: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
      youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
      netflix: 'm5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z',
      facebook: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
      pinterest: 'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z',
    };

    // Brendga tegishli bo'lmagan oddiy belgilar (24×24 katak, chiziqli)
    const CANVAS_GLYPHS = {
      tv: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 3l4 4 4-4"/>',
      image: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
      person: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="2.5"/><path d="M7.5 18c.6-3 2.4-4.5 4.5-4.5s3.9 1.5 4.5 4.5"/>',
      camera: '<rect x="2" y="7" width="14" height="10" rx="2"/><path d="M16 11l6-3v8l-6-3z"/>',
      film: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 8h16M4 16h16M8 3v18M16 3v18"/>',
      play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
    };

    // Yumaloq katak (s × s) ichida logotip ('logo') yoki oddiy belgi ('glyph')
    function cvTile(kind, name, x, y, s) {
      const pad = s * 0.22, k = (s - 2 * pad) / 24;
      const inner = kind === 'logo' ? '<path class="logo" d="' + CANVAS_LOGOS[name] + '"/>' : CANVAS_GLYPHS[name];
      return '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + (s * 0.26).toFixed(1) + '"/>' +
        '<g transform="translate(' + (x + pad) + ' ' + (y + pad) + ') scale(' + k.toFixed(4) + ')">' + inner + '</g>';
    }

    function cvSvg(vw, vh, inner) {
      return '<svg viewBox="0 0 ' + vw + ' ' + vh + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' + inner + '</svg>';
    }

    const CANVAS_ART = {
      '9:16':   cvSvg(90, 160, cvTile('logo', 'tiktok', 25, 12, 40) + cvTile('logo', 'instagram', 25, 60, 40) + cvTile('logo', 'youtube', 25, 108, 40)),
      '1:1':    cvSvg(100, 100, cvTile('logo', 'instagram', 8, 31, 38) + cvTile('logo', 'facebook', 54, 31, 38)),
      '16:9':   cvSvg(160, 90, cvTile('logo', 'youtube', 10, 25, 40) + cvTile('logo', 'netflix', 60, 25, 40) + cvTile('glyph', 'tv', 110, 25, 40)),
      '4:5':    cvSvg(80, 100, cvTile('logo', 'instagram', 14, 24, 52)),
      '3:4':    cvSvg(90, 120, cvTile('logo', 'pinterest', 23, 11, 44) + cvTile('glyph', 'image', 23, 65, 44)),
      '2:3':    cvSvg(80, 120, cvTile('logo', 'pinterest', 19, 13, 42) + cvTile('glyph', 'person', 19, 65, 42)),
      '2.35:1': cvSvg(141, 60, cvTile('glyph', 'camera', 29.5, 12, 36) + cvTile('glyph', 'film', 75.5, 12, 36)),
      'fit':    cvSvg(160, 90, '<path d="M10 24V10h14M150 24V10h-14M10 66v14h14M150 66v14h-14"/>' + cvTile('glyph', 'play', 60, 25, 40)),
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

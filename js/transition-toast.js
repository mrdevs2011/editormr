    // ===================== TRANSITION TOAST =====================
    // Cliplar orasidagi transition tugmasi bosilganda pastdan chiqadigan panel.
    // Modal EMAS: OK/Cancel yo'q — tanlov darhol qo'llanadi (Ctrl+Z bilan qaytadi),
    // panel fonni bloklamaydi (play/scrub qilib natijani ko'rish mumkin) va
    // ishlatilmasa TT_IDLE_MS dan keyin o'zi yopiladi.

    const TT_IDLE_MS = 4500;
    const TT_DUR_MIN = 0.1;

    // Turlar ro'yxati state.js dagi TRANSITION_TYPES dan keladi (yagona manba). Tartib: maketdagi
    // None, Slide left, Slide right, Fade, keyin qolganlari — ular gorizontal scroll bilan ochiladi.
    const TT_NONE_ICON = '<circle cx="16" cy="16" r="10"/><line x1="9" y1="9" x2="23" y2="23"/>';
    const TT_TYPES = TRANSITION_TYPES.map(tp => tp.id === 'none' ? Object.assign({ icon: TT_NONE_ICON }, tp) : tp);
    const TT_CARD_PX = 84;         // karta o'lchami (CSS .tt-card bilan bir xil) — blur px hisobi uchun

    // Karta ichidagi jonli preview uchun ikkita kadr (A -> B). Bitta rasmdan yasalgan:
    // B = ko'zgu + iliq rang, aks holda fade/slide farqi ko'rinmasdi.
    const TT_IMG_A = 'assets/transition-preview-a.jpg';
    const TT_IMG_B = 'assets/transition-preview-b.jpg';
    const TT_PREVIEW_HOLD = 0.4;   // s — o'tishlar orasida kadr shuncha turadi (qisqa: animatsiya doim harakatda ko'rinsin)
    [TT_IMG_A, TT_IMG_B].forEach(src => { const im = new Image(); im.src = src; });   // birinchi ochilishda bo'sh miltillamasin

    const ttState = {
      el: null,
      typesEl: null,
      durEl: null,
      rangeEl: null,
      valEl: null,
      clipId: null,     // chap clip (transition shu clipning oxirida turadi)
      timer: null,
      held: false,      // sichqoncha panel ustida / slider sudralyapti — yopilmasin
      dirty: false,     // bitta slider sudrashi = bitta undo qadami
      raf: 0,           // preview animatsiya sikli
      prevDur: 0.3,     // preview'dagi HAQIQIY o'tish davomiyligi (s)
      prevT: 0,         // joriy sikl ichidagi vaqt
      prevCycle: 0,     // juft: A->B, toq: B->A (ketma-ket clip'lar kabi)
      prevLast: 0,
    };

    function ttRound(v) { return Math.round(v * 10) / 10; }

    // Slider maksimumi qattiq raqam emas — junction'dagi CHAP clip uzunligidan kelib chiqadi
    // (qoida state.js dagi getTransitionMaxDuration). Renderer ham shu qoidadan o'qiydi,
    // shuning uchun slider hech qachon renderer beradigan qiymatdan ko'p va'da qilmaydi.
    function ttMaxFor(clip) {
      const m = Math.floor(getTransitionMaxDuration(clip) * 10) / 10;   // 0.1 qadamga pastga yaxlitlanadi
      return Math.max(TT_DUR_MIN, m);
    }

    function ttArm() {
      clearTimeout(ttState.timer);
      if (ttState.held || !ttState.clipId) return;
      ttState.timer = setTimeout(hideTransitionToast, TT_IDLE_MS);
    }

    function ttHold(on) {
      ttState.held = on;
      if (on) clearTimeout(ttState.timer);
      else ttArm();
    }

    function ttBuild() {
      if (ttState.el) return;

      const el = document.createElement('div');
      el.id = 'transition-toast';
      el.className = 'tt-toast';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Transition');

      const cards = TT_TYPES.map(tp =>
        '<button type="button" class="tt-card" role="radio" aria-checked="false" data-type="' + tp.id + '">'
        + '<span class="tt-prev" aria-hidden="true">'
        +   '<img class="tt-l tt-l-a" src="' + TT_IMG_A + '" alt="" draggable="false">'
        +   (tp.icon
              ? '<svg class="tt-ico" viewBox="0 0 32 32">' + tp.icon + '</svg>'    // None: kadr statik + ⃠ belgisi
              : '<img class="tt-l tt-l-b" src="' + TT_IMG_B + '" alt="" draggable="false">')
        + '</span>'
        + '<span class="tt-name">' + tp.label + '</span></button>'
      ).join('');

      el.innerHTML =
        '<div class="tt-types" role="radiogroup" aria-label="Transition type">' + cards + '</div>'
        + '<div class="tt-dur">'
        +   '<output class="tt-val"></output>'
        +   '<input type="range" class="tt-range" step="0.1" aria-label="Transition duration (seconds)">'
        + '</div>';

      document.body.appendChild(el);

      ttState.el = el;
      ttState.typesEl = el.querySelector('.tt-types');
      ttState.durEl = el.querySelector('.tt-dur');
      ttState.rangeEl = el.querySelector('.tt-range');
      ttState.valEl = el.querySelector('.tt-val');

      // --- tur tanlash ---
      ttState.typesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.tt-card');
        if (!btn) return;
        const clip = getClipById(ttState.clipId);
        if (!clip) { hideTransitionToast(); return; }
        ttArm();
        const id = btn.dataset.type;
        if ((clip.transitionType || 'none') === id) return;
        pushHistory();
        clip.transitionType = id;
        if (clip.transitionDuration == null) clip.transitionDuration = 0.3;
        renderVideoBlock();          // badge/junction yangilanadi; sync ham shu yerdan chaqiriladi
        scheduleSave();
      });

      // Kartalar sig'masa chetlari xiralashadi — yana borligi ko'rinib tursin
      ttState.typesEl.addEventListener('scroll', ttUpdateScrollHint, { passive: true });

      // Desktopda g'ildirak = gorizontal scroll (faqat kartalar sig'masa)
      ttState.typesEl.addEventListener('wheel', (e) => {
        const box = ttState.typesEl;
        if (box.scrollWidth <= box.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        box.scrollLeft += e.deltaY;
        ttArm();
      }, { passive: false });

      // --- davomiylik slideri ---
      ttState.rangeEl.addEventListener('input', () => {
        const clip = getClipById(ttState.clipId);
        if (!clip) { hideTransitionToast(); return; }
        if (!ttState.dirty) { pushHistory(); ttState.dirty = true; }
        clip.transitionDuration = ttRound(Number(ttState.rangeEl.value));
        ttPaintRange();
      });
      ttState.rangeEl.addEventListener('change', () => {
        ttState.dirty = false;
        scheduleSave();
        renderVideoBlock();          // badge tooltip'idagi vaqt yangilansin (sudrash tugagach, 1 marta)
        ttArm();
      });
      ttState.rangeEl.addEventListener('pointerdown', () => ttHold(true));
      // Sichqoncha/touch bilan sudrab bo'lgach fokusni qaytaramiz — aks holda fokus INPUT'da
      // qolib, Space / Ctrl+Z kabi umumiy shortcut'lar (ular INPUT'ni o'tkazib yuboradi) ishlamay qoladi
      ttState.rangeEl.addEventListener('pointerup', () => ttState.rangeEl.blur());
      window.addEventListener('pointerup', () => { if (ttState.held && !ttState.el.matches(':hover')) ttHold(false); });
      window.addEventListener('pointercancel', () => ttHold(false));

      // --- yopilish: hover paytida to'xtaydi, ketganda qayta sanaydi ---
      el.addEventListener('pointerenter', () => ttHold(true));
      el.addEventListener('pointerleave', () => ttHold(false));
      el.addEventListener('keydown', (e) => {
        ttArm();
        // Klaviatura bilan slider fokusida bo'lsa ham undo/redo ishlasin
        // (history.js INPUT'dagi Ctrl+Z ni o'tkazib yuboradi). Tugma fokusida history.js o'zi ushlaydi.
        if (e.target.tagName === 'INPUT' && (e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
          else if (k === 'y') { e.preventDefault(); redo(); }
        }
      });
      // Panel ichidagi bosishlar pastdagi umumiy handlerlarga o'tmasin
      el.addEventListener('pointerdown', (e) => e.stopPropagation());

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && ttState.clipId) hideTransitionToast();
      });
      window.addEventListener('resize', () => { if (ttState.clipId != null) { ttPlace(); ttUpdateScrollHint(); } });
    }

    // ---- Jonli preview: export.js bilan BIR XIL matematika ----
    // Barcha turlar formulasi state.js dagi getTransitionLayers() da; export canvas'ga, bu yerda CSS'ga qo'llaydi.
    // progress p: 0..1, CHIZIQLI (easing yo'q), davomiylik = clipning haqiqiy transitionDuration'i.
    // Sikl juft/toq almashadi (A->B, keyin B->A), shuning uchun kadr sakrab ketmaydi.
    function ttStyleLayer(img, L, z) {
      const st = img.style;
      st.zIndex = z;
      st.opacity = L.a;
      st.transform = 'translate3d(' + (L.tx * 100) + '%,' + (L.ty * 100) + '%,0) scale(' + L.s + ')';
      st.filter = L.blur > 0 ? 'blur(' + (L.blur * TT_CARD_PX) + 'px)' : 'none';
      // clip [x0,y0,x1,y1] -> inset(tepa o'ng past chap)
      st.clipPath = L.clip
        ? 'inset(' + (L.clip[1] * 100) + '% ' + ((1 - L.clip[2]) * 100) + '% ' + ((1 - L.clip[3]) * 100) + '% ' + (L.clip[0] * 100) + '%)'
        : 'none';
    }

    function ttApplyFrame(p, cycle) {
      const odd = cycle % 2 === 1;
      ttState.typesEl.querySelectorAll('.tt-card').forEach(card => {
        const la = card.querySelector('.tt-l-a');
        const lb = card.querySelector('.tt-l-b');
        if (!lb) return;                                   // None — statik
        const L = getTransitionLayers(card.dataset.type, p);
        const out = odd ? lb : la;                         // ketayotgan kadr (A)
        const inc = odd ? la : lb;                         // kirayotgan kadr (B)
        ttStyleLayer(out, L.a, L.top === 'a' ? 2 : 1);
        ttStyleLayer(inc, L.b, L.top === 'a' ? 1 : 2);
        card.firstElementChild.style.background = L.bg || '';   // dip: orqa fon (qora/oq)
      });
    }

    function ttPreviewTick(now) {
      const st = ttState;
      if (!st.clipId) { st.raf = 0; return; }
      const dt = Math.min(0.1, Math.max(0, (now - st.prevLast) / 1000));   // fon tabdan qaytganda sakramasin
      st.prevLast = now;
      st.prevT += dt;
      const period = TT_PREVIEW_HOLD + st.prevDur;
      while (st.prevT >= period) { st.prevT -= period; st.prevCycle++; }
      const p = st.prevT < TT_PREVIEW_HOLD ? 0 : Math.min(1, (st.prevT - TT_PREVIEW_HOLD) / st.prevDur);
      ttApplyFrame(p, st.prevCycle);
      st.raf = requestAnimationFrame(ttPreviewTick);
    }

    // MUHIM: prefers-reduced-motion bu yerda ataylab tekshirilmaydi. Preview'ning o'zi animatsiya —
    // OS'da "animatsiya o'chiq" bo'lsa (Windows battery saver va h.k.) u qotib, oddiy rasmga aylanib qolardi.
    function ttStartPreview() {
      cancelAnimationFrame(ttState.raf);
      ttState.prevT = 0;
      ttState.prevCycle = 0;
      ttApplyFrame(0, 0);
      ttState.prevLast = performance.now();
      ttState.raf = requestAnimationFrame(ttPreviewTick);
    }

    function ttStopPreview() {
      cancelAnimationFrame(ttState.raf);
      ttState.raf = 0;
    }

    function ttUpdateScrollHint() {
      const box = ttState.typesEl;
      if (!box) return;
      const max = box.scrollWidth - box.clientWidth;
      box.classList.toggle('fade-l', box.scrollLeft > 4);
      box.classList.toggle('fade-r', box.scrollLeft < max - 4);
    }

    function ttPaintRange() {
      const r = ttState.rangeEl;
      const min = Number(r.min), max = Number(r.max), v = Number(r.value);
      const p = max > min ? (v - min) / (max - min) : 0;
      ttState.durEl.style.setProperty('--p', p);
      ttState.valEl.textContent = ttState.durEl.classList.contains('is-off') ? 'Off' : ttRound(v).toFixed(1) + 's';
    }

    // Qaysi junction tahrirlanayotganini timeline'da ko'rsatadi
    function ttMarkJunction() {
      const openId = ttState.clipId == null ? null : String(ttState.clipId);
      document.querySelectorAll('.transition-junction').forEach(b => {
        b.classList.toggle('editing', openId !== null && b.dataset.clipId === openId);
      });
    }

    // Odatda toast ekran pastida turadi. Lekin timeline past bo'lsa (telefon, yoki timeline
    // sudralib kichraytirilgan) u tahrirlanayotgan junction'ni yopib qo'yadi — shunda toast
    // timeline'ning TEPASIGA ko'chadi (preview ustiga), junction esa ko'rinib turadi.
    function ttPlace() {
      const el = ttState.el;
      if (!el) return;
      el.style.bottom = '';                                  // CSS dagi standart joy
      const jn = document.querySelector('.transition-junction.editing');
      if (!jn) return;
      // transform (kirish animatsiyasi) hisobga olinmasligi uchun getBoundingClientRect emas, CSS geometriya
      const bottomGap = parseFloat(getComputedStyle(el).bottom) || 0;
      const top = window.innerHeight - bottomGap - el.offsetHeight;
      const t = { top, bottom: top + el.offsetHeight };
      const j = jn.getBoundingClientRect();
      const overlapsY = j.bottom > t.top - 8 && j.top < t.bottom + 8;
      const tr = el.getBoundingClientRect();
      const overlapsX = j.right > tr.left && j.left < tr.right;
      if (!(overlapsY && overlapsX)) return;
      const tl = timelineSection.getBoundingClientRect();
      el.style.bottom = Math.max(12, window.innerHeight - tl.top + 10) + 'px';
    }

    // Clip holatidan UI ni qayta o'qiydi. renderVideoBlock() oxirida ham chaqiriladi,
    // shuning uchun undo/redo, split, o'chirish — hammasidan keyin panel to'g'ri qoladi.
    function syncTransitionToast() {
      if (!ttState.el || ttState.clipId == null) return;
      const clip = getClipById(ttState.clipId);
      if (!clip || !findNextClip(clip)) { hideTransitionToast(); return; }

      const type = clip.transitionType || 'none';
      ttState.typesEl.querySelectorAll('.tt-card').forEach(b => {
        const on = b.dataset.type === type;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });

      const r = ttState.rangeEl;
      const max = ttMaxFor(clip);
      const cur = clip.transitionDuration != null ? clip.transitionDuration : 0.3;
      r.min = TT_DUR_MIN;
      r.max = max;
      r.value = Math.min(max, Math.max(TT_DUR_MIN, ttRound(cur)));
      // Preview shu davomiylikda o'ynaydi — getTransitionDuration() bilan bir xil clamp
      ttState.prevDur = clampTransitionDuration(clip, cur);
      const off = type === 'none';
      r.disabled = off;
      ttState.durEl.classList.toggle('is-off', off);
      ttPaintRange();
      ttMarkJunction();
      ttPlace();
    }

    function showTransitionToast(clipId) {
      const clip = getClipById(clipId);
      if (!clip || !findNextClip(clip)) return;
      ttBuild();
      ttState.clipId = clipId;
      ttState.dirty = false;
      syncTransitionToast();
      ttState.el.classList.add('show');
      ttStartPreview();

      // Tanlangan karta ko'rinib tursin (kartalar sig'masa scroll qilinadi)
      const box = ttState.typesEl;
      const active = box.querySelector('.tt-card.active');
      if (active && box.scrollWidth > box.clientWidth) {
        box.scrollLeft = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
      }
      ttUpdateScrollHint();
      ttHold(false);
    }

    function hideTransitionToast() {
      clearTimeout(ttState.timer);
      ttStopPreview();
      ttState.clipId = null;
      ttState.held = false;
      ttState.dirty = false;
      if (ttState.el) ttState.el.classList.remove('show');
      ttMarkJunction();
    }

    // Shu junction'ga qayta bosilsa — yopiladi, boshqasiga bosilsa — o'sha clipga o'tadi
    function toggleTransitionToast(clipId) {
      if (ttState.clipId != null && String(ttState.clipId) === String(clipId)) hideTransitionToast();
      else showTransitionToast(clipId);
    }

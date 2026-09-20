    // ===================== SELECTION (multi-select + marquee) =====================
    // state.selectedIds  — ko'rinadigan tanlov (clip id lar va 'music')
    // state.selectedClipId — "asosiy" clip: split / preview / eski kod shu bilan ishlaydi
    const MUSIC_ID = 'music';

    function isSelected(id) {
      return state.selectedIds.has(id);
    }

    function applySelectionClasses() {
      timelineContent.querySelectorAll('.media-block').forEach((el) => {
        el.classList.toggle('selected', isSelected(el.dataset.clipId));
      });
    }

    // Tanlovni butunlay almashtirish. Asosiy clip = eng chapdagi tanlangan clip.
    function setSelection(ids) {
      state.selectedIds = new Set(ids);
      const first = state.videoClips
        .filter(c => state.selectedIds.has(c.id))
        .sort((a, b) => a.startTime - b.startTime)[0];
      state.selectedClipId = first ? first.id : null;
      applySelectionClasses();
    }

    function selectOnly(id) {
      state.selectedIds = new Set([id]);
      state.selectedClipId = id === MUSIC_ID ? null : id;
      applySelectionClasses();
    }

    function clearSelection() {
      setSelection([]);
    }

    // Bosilgan clip tanlov ichida bo'lsa — guruh saqlanadi (birga surish uchun),
    // bo'lmasa faqat shu clip tanlanadi.
    function focusClip(id) {
      if (isSelected(id)) {
        state.selectedClipId = id;
        applySelectionClasses();
      } else {
        selectOnly(id);
      }
    }

    // ---------- Marquee (Windows uslubidagi to'rtburchak tanlash) ----------
    // Faqat butunlay ichiga kirgan blok tanlanadi (qisman kesishgani — yo'q).
    let mq = null; // { startX, startY (content koordinata), clientX, clientY, active }
    let mqRaf = null;

    timelineContent.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return; // touch — oddiy scroll
      if (state.isDragging || state.isPlayheadDragging) return;
      if (e.target.closest('.media-block, .playhead')) return;

      const r = timelineContent.getBoundingClientRect();
      mq = {
        startX: e.clientX - r.left,
        startY: e.clientY - r.top,
        clientX: e.clientX,
        clientY: e.clientY,
        active: false,
      };
      document.addEventListener('pointermove', onMarqueeMove);
      document.addEventListener('pointerup', endMarquee);
      document.addEventListener('pointercancel', endMarquee);
    });

    function onMarqueeMove(e) {
      if (!mq) return;
      mq.clientX = e.clientX;
      mq.clientY = e.clientY;
      if (!mq.active) {
        const r = timelineContent.getBoundingClientRect();
        // 4px dan kam siljish — bu oddiy click, marquee emas
        if (Math.hypot(e.clientX - r.left - mq.startX, e.clientY - r.top - mq.startY) < 4) return;
        mq.active = true;
        marqueeEl.style.display = 'block';
        mqRaf = requestAnimationFrame(marqueeAutoScroll);
      }
      updateMarquee();
    }

    function updateMarquee() {
      const r = timelineContent.getBoundingClientRect();
      const cx = Math.max(0, Math.min(r.width, mq.clientX - r.left));
      const cy = Math.max(0, Math.min(r.height, mq.clientY - r.top));
      const x1 = Math.min(mq.startX, cx), x2 = Math.max(mq.startX, cx);
      const y1 = Math.min(mq.startY, cy), y2 = Math.max(mq.startY, cy);

      marqueeEl.style.left = x1 + 'px';
      marqueeEl.style.top = y1 + 'px';
      marqueeEl.style.width = (x2 - x1) + 'px';
      marqueeEl.style.height = (y2 - y1) + 'px';

      const ids = [];
      timelineContent.querySelectorAll('.media-block').forEach((el) => {
        const b = el.getBoundingClientRect();
        const inside = b.left - r.left >= x1 && b.right - r.left <= x2 &&
                       b.top - r.top >= y1 && b.bottom - r.top <= y2;
        if (inside) ids.push(el.dataset.clipId);
      });
      setSelection(ids); // jonli — Windows'dagi kabi drag paytida ham yonib turadi
    }

    // Kursor timeline chetiga yaqinlashsa — o'zi scroll qiladi
    function marqueeAutoScroll() {
      if (!mq || !mq.active) return;
      const s = timelineScroll.getBoundingClientRect();
      const EDGE = 32, MAX = 22;
      const push = (pos, lo, hi) =>
        pos < lo + EDGE ? -Math.min(2, (lo + EDGE - pos) / EDGE) * MAX
        : pos > hi - EDGE ? Math.min(2, (pos - (hi - EDGE)) / EDGE) * MAX
        : 0;
      const dx = push(mq.clientX, s.left, s.right);
      const dy = push(mq.clientY, s.top, s.bottom);
      if (dx) timelineScroll.scrollLeft += dx; // scroll event marquee'ni yangilaydi
      if (dy) timelineScroll.scrollTop += dy;
      mqRaf = requestAnimationFrame(marqueeAutoScroll);
    }

    // g'ildirak / autoscroll paytida to'rtburchak content bilan birga yangilanadi
    timelineScroll.addEventListener('scroll', () => {
      if (mq && mq.active) updateMarquee();
    });

    function endMarquee(e) {
      document.removeEventListener('pointermove', onMarqueeMove);
      document.removeEventListener('pointerup', endMarquee);
      document.removeEventListener('pointercancel', endMarquee);
      cancelAnimationFrame(mqRaf);
      marqueeEl.style.display = 'none';

      const wasActive = mq && mq.active;
      mq = null;
      if (wasActive) {
        // marquee tugagach brauzer "click" yuboradi — playhead sakramasin
        state.justMarquee = true;
        setTimeout(() => { state.justMarquee = false; }, 0);
      } else if (e.type === 'pointerup') {
        clearSelection(); // bo'sh joyga oddiy click = tanlovni bekor qilish
      }
    }

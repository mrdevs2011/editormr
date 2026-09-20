    // ===================== ZOOM & SCROLL =====================
    // Ctrl +/-/0         — timeline kengligini o'zgartirish
    // Ctrl + g'ildirak   — zoom (trackpad pinch ham shu: brauzer uni ctrlKey bilan wheel qilib yuboradi)
    // Oddiy g'ildirak    — gorizontal scroll (Alt bosilsa — odatdagidek vertikal)
    const ZOOM_MIN = 6;
    const ZOOM_MAX = 300;
    const ZOOM_DEFAULT = 40;
    const TL_OFFSET = 8; // playhead / click hisobidagi chap ofset (timeline.js bilan bir xil)

    function updateZoomLabel() {
      const zl = document.getElementById('zoom-label');
      if (zl) zl.textContent = Math.round((state.pixelsPerSecond / ZOOM_DEFAULT) * 100) + '%';
    }

    // Zoom qilinganda anchorX (timelineScroll ichidagi px) ostidagi VAQT joyida qoladi
    function setZoom(pps, anchorX) {
      pps = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pps));
      if (pps === state.pixelsPerSecond) return;
      const anchorTime = pxToTime(timelineScroll.scrollLeft + anchorX - TL_OFFSET);
      state.pixelsPerSecond = pps;
      updateZoomLabel();
      updateTimelineLayout(); // ruler + bloklar + playhead
      timelineScroll.scrollLeft = TL_OFFSET + timeToPx(anchorTime) - anchorX;
    }

    // Tugma / klaviatura: playhead ko'rinib tursa shu joyda, bo'lmasa viewport o'rtasida
    function defaultZoomAnchor() {
      const x = TL_OFFSET + timeToPx(state.currentTime) - timelineScroll.scrollLeft;
      return (x >= 0 && x <= timelineScroll.clientWidth) ? x : timelineScroll.clientWidth / 2;
    }

    function zoomTimeline(factor, anchorX = defaultZoomAnchor()) {
      setZoom(state.pixelsPerSecond * factor, anchorX);
    }

    function resetZoom() {
      setZoom(ZOOM_DEFAULT, defaultZoomAnchor());
    }

    // ---------- Wheel ----------
    let pendingZoom = null; // bir frame ichidagi ko'p wheel eventni bitta layout'ga yig'amiz

    function wheelPixels(e, delta) {
      if (e.deltaMode === 1) return delta * 32;                        // qator
      if (e.deltaMode === 2) return delta * timelineScroll.clientWidth; // sahifa
      return delta;
    }

    timelineScroll.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // brauzerning o'z zoom'i chiqmasin
        const dy = Math.max(-100, Math.min(100, wheelPixels(e, e.deltaY)));
        const anchorX = e.clientX - timelineScroll.getBoundingClientRect().left;
        if (!pendingZoom) {
          pendingZoom = { pps: state.pixelsPerSecond, anchorX };
          requestAnimationFrame(() => {
            const z = pendingZoom;
            pendingZoom = null;
            setZoom(z.pps, z.anchorX);
          });
        }
        pendingZoom.anchorX = anchorX;
        pendingZoom.pps = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pendingZoom.pps * Math.exp(-dy * 0.002)));
        return;
      }
      if (e.altKey) return; // Alt + g'ildirak — vertikal scroll (brauzer o'zi)
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      timelineScroll.scrollLeft += wheelPixels(e, d);
    }, { passive: false });

    updateZoomLabel();

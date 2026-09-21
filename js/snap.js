    // ===================== SNAP (magnit) — Faza 3A =====================
    // Sof funksiya: DOM yo'q. Drag/trim oldidan chaqiriladi, resolve* DAN OLDIN.

    /**
     * candidates: number[] — yopishishi kerak bo'lgan vaqtlar (chap/o'ng chet, playhead, ...)
     * targets: number[] — yopishish nuqtalari
     * thresholdSec: number — soniya (odatda 6–8 px / pps)
     * Qaytaradi: { snapped: number|null, delta: number, target: number|null }
     *   snapped — eng yaqin target (yoki null), delta = snapped - candidate (birinchi mos)
     */
    function computeSnap(candidates, targets, thresholdSec) {
      if (!candidates || !candidates.length || !targets || !targets.length || !(thresholdSec > 0)) {
        return { snapped: null, delta: 0, target: null, candidate: null };
      }
      let best = null;
      let bestAbs = Infinity;
      let bestCand = null;
      let bestTarget = null;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (typeof c !== 'number' || !isFinite(c)) continue;
        for (let j = 0; j < targets.length; j++) {
          const t = targets[j];
          if (typeof t !== 'number' || !isFinite(t)) continue;
          const d = t - c;
          const a = Math.abs(d);
          if (a <= thresholdSec && a < bestAbs) {
            bestAbs = a;
            best = t;
            bestCand = c;
            bestTarget = t;
          }
        }
      }
      if (best == null) {
        return { snapped: null, delta: 0, target: null, candidate: null };
      }
      return {
        snapped: best,
        delta: best - bestCand,
        target: bestTarget,
        candidate: bestCand,
      };
    }

    /**
     * Barcha snap maqsadlarini yig'ish (playhead, clip chetlari, marker, in/out).
     * excludeIds: Set — sudralayotgan clip id lari (o'zini o'ziga yopishmasin).
     */
    function collectSnapTargets(opts) {
      opts = opts || {};
      const exclude = opts.excludeIds || new Set();
      const out = [];
      const seen = new Set();
      function add(t) {
        if (typeof t !== 'number' || !isFinite(t)) return;
        const k = Math.round(t * 1000);
        if (seen.has(k)) return;
        seen.add(k);
        out.push(t);
      }
      if (opts.playhead != null) add(opts.playhead);
      if (opts.inPoint != null) add(opts.inPoint);
      if (opts.outPoint != null) add(opts.outPoint);
      const clips = opts.clips || [];
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        if (!c || exclude.has(c.id)) continue;
        add(c.startTime);
        const end = typeof clipEnd === 'function' ? clipEnd(c) : (c.startTime + (c.trimEnd - c.trimStart) / (c.speed || 1));
        add(end);
      }
      const markers = opts.markers || [];
      for (let i = 0; i < markers.length; i++) {
        if (markers[i] && markers[i].time != null) add(markers[i].time);
      }
      return out;
    }

    /** Piksel → soniya (pps orqali). Default threshold 7 px. */
    function snapThresholdSec(pps, px) {
      const p = pps > 0 ? pps : 40;
      const pixels = (px != null && px > 0) ? px : 7;
      return pixels / p;
    }

    // Guide chiziq (DOM) — faqat brauzerda
    let _snapGuideEl = null;
    function ensureSnapGuide() {
      if (typeof document === 'undefined') return null;
      if (_snapGuideEl && _snapGuideEl.parentNode) return _snapGuideEl;
      const el = document.createElement('div');
      el.id = 'snap-guide';
      el.className = 'snap-guide';
      el.style.cssText = 'display:none;position:absolute;top:0;bottom:0;width:1px;background:#fbbf24;pointer-events:none;z-index:40;box-shadow:0 0 4px rgba(251,191,36,0.8);';
      const host = document.getElementById('timeline-content') || document.body;
      host.appendChild(el);
      _snapGuideEl = el;
      return el;
    }

    function showSnapGuide(timeSec) {
      const el = ensureSnapGuide();
      if (!el || typeof timeToPx !== 'function') return;
      el.style.display = 'block';
      el.style.left = (timeToPx(timeSec) + 8) + 'px';
    }

    function hideSnapGuide() {
      if (_snapGuideEl) _snapGuideEl.style.display = 'none';
    }

    function isSnapActive() {
      if (state && state.snapEnabled === false) return false;
      // Alt bosilgan paytda vaqtincha o'chadi
      if (typeof window !== 'undefined' && window._snapAltHeld) return false;
      return true;
    }

    function initSnapUi() {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
      // Alt hold
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Alt') window._snapAltHeld = true;
      });
      document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') window._snapAltHeld = false;
      });
      // localStorage toggle
      try {
        const v = localStorage.getItem('emr-snap-enabled');
        if (v === '0') state.snapEnabled = false;
        if (v === '1') state.snapEnabled = true;
      } catch (_) {}
    }

    function setSnapEnabled(on) {
      state.snapEnabled = !!on;
      try { localStorage.setItem('emr-snap-enabled', on ? '1' : '0'); } catch (_) {}
      if (typeof updateSnapToggleUi === 'function') updateSnapToggleUi();
    }

    function toggleSnapEnabled() {
      setSnapEnabled(!state.snapEnabled);
    }

    function updateSnapToggleUi() {
      const btn = document.getElementById('btn-snap-toggle');
      if (!btn) return;
      btn.classList.toggle('is-active', !!state.snapEnabled);
      btn.setAttribute('aria-pressed', state.snapEnabled ? 'true' : 'false');
      const label = (typeof S === 'function' ? S('snap.toggle') : null) || (state.snapEnabled ? 'Snap yoqilgan' : 'Snap o‘chirilgan');
      btn.title = label;
    }

    function bootSnapUi() {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
      initSnapUi();
      const btn = document.getElementById('btn-snap-toggle');
      if (btn) {
        btn.addEventListener('click', () => {
          toggleSnapEnabled();
          updateSnapToggleUi();
        });
        updateSnapToggleUi();
      }
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootSnapUi);
      } else {
        bootSnapUi();
      }
    }

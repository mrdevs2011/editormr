    // ===================== MARKERLAR + RAZOR + HOTKEY HELP (Faza 3B) =====================

    function toggleMarkerAtPlayhead() {
      const t = state.currentTime;
      const existing = (state.markers || []).find((m) => m.kind !== 'beat' && Math.abs(m.time - t) < 0.05);
      if (typeof pushHistory === 'function') pushHistory();
      if (existing) {
        state.markers = state.markers.filter((m) => m !== existing);
        if (typeof showToast === 'function') showToast('Marker o‘chirildi');
      } else {
        const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        state.markers = (state.markers || []).concat([{ id, time: t, label: '', kind: 'user' }]);
        if (typeof showToast === 'function') showToast((typeof S === 'function' ? S('marker.add') : 'Marker') + ' ' + t.toFixed(2) + 's');
      }
      renderMarkers();
      if (typeof scheduleSave === 'function') scheduleSave();
    }

    function renderMarkers() {
      if (typeof document === 'undefined') return;
      const host = document.getElementById('time-ruler') || document.getElementById('timeline-content');
      if (!host) return;
      let layer = document.getElementById('marker-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'marker-layer';
        layer.style.cssText = 'position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;z-index:25;';
        host.style.position = host.style.position || 'relative';
        host.appendChild(layer);
      }
      layer.innerHTML = '';
      const markers = state.markers || [];
      for (const m of markers) {
        if (m.time == null || typeof timeToPx !== 'function') continue;
        const el = document.createElement('div');
        el.className = 'marker-tick' + (m.kind === 'beat' ? ' is-beat' : '');
        el.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;left:' + (timeToPx(m.time) + 8) + 'px;background:' + (m.kind === 'beat' ? '#a78bfa' : '#38bdf8') + ';pointer-events:auto;cursor:pointer;';
        el.title = (m.label || '') + ' ' + m.time.toFixed(2) + 's';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          state.currentTime = m.time;
          if (typeof seekPreviewToTime === 'function') seekPreviewToTime(m.time);
          if (typeof updatePlayhead === 'function') updatePlayhead();
          if (typeof updateTimeDisplay === 'function') updateTimeDisplay();
        });
        layer.appendChild(el);
      }
      // in/out
      if (state.inPoint != null && typeof timeToPx === 'function') {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;left:' + (timeToPx(state.inPoint) + 8) + 'px;background:#4ade80;';
        el.title = 'In';
        layer.appendChild(el);
      }
      if (state.outPoint != null && typeof timeToPx === 'function') {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;left:' + (timeToPx(state.outPoint) + 8) + 'px;background:#f87171;';
        el.title = 'Out';
        layer.appendChild(el);
      }
    }

    function razorCutLeftOfPlayhead() {
      const t = state.currentTime;
      const clip = typeof findClipAtTime === 'function' ? findClipAtTime(t) : null;
      if (!clip || clip.isImage) return;
      if (t <= clip.startTime + 0.05) return;
      if (typeof pushHistory === 'function') pushHistory();
      // Chap tomonni o'chir (ripple): trimStart ni playhead manbasiga ko'tar, startTime = t
      const local = typeof timelineToSource === 'function' ? timelineToSource(clip, t) : t;
      clip.trimStart = local;
      clip.startTime = t;
      if (typeof ripplePackAfterRemove === 'function') {
        // chapdagi boshqa clip'larni siljitish shart emas — faqat shu clip qisqardi
      }
      // Asosiy qatorda oldingi clip'lardan keyin bo'shliq bo'lmasin: normalize
      if (typeof normalizeVideoOverlaps === 'function') normalizeVideoOverlaps();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
      if (typeof scheduleSave === 'function') scheduleSave();
    }

    function razorCutRightOfPlayhead() {
      const t = state.currentTime;
      const clip = typeof findClipAtTime === 'function' ? findClipAtTime(t) : null;
      if (!clip || clip.isImage) return;
      const end = typeof clipEnd === 'function' ? clipEnd(clip) : clip.startTime + 1;
      if (t >= end - 0.05) return;
      if (typeof pushHistory === 'function') pushHistory();
      const local = typeof timelineToSource === 'function' ? timelineToSource(clip, t) : t;
      clip.trimEnd = local;
      if (typeof normalizeVideoOverlaps === 'function') normalizeVideoOverlaps();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
      if (typeof scheduleSave === 'function') scheduleSave();
    }

    function deleteSelectedLeaveGap() {
      // Shift+Delete: bo'shliq qoldirib o'chirish (ripple YO'Q)
      if (typeof deleteSelectedTextClips === 'function' && deleteSelectedTextClips()) return;
      const ids = state.videoClips.filter((c) => typeof isSelected === 'function' && isSelected(c.id)).map((c) => c.id);
      if (!ids.length) return;
      if (ids.length >= state.videoClips.length) {
        if (typeof showToast === 'function') showToast('Kamida 1 ta clip qolishi kerak');
        return;
      }
      if (typeof pushHistory === 'function') pushHistory();
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      // ripplePack chaqirilMAYDI
      state.videoClips = state.videoClips.filter((c) => !ids.includes(c.id));
      if (state.videoClips.length) {
        if (typeof selectOnly === 'function') selectOnly(state.videoClips[0].id);
        if (typeof ensurePreviewForClip === 'function') ensurePreviewForClip(typeof getSelectedClip === 'function' ? getSelectedClip() : state.videoClips[0]);
      }
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof showToast === 'function') showToast('Clip o‘chirildi (bo‘shliq qoldi)');
    }

    function zoomToFit() {
      if (typeof videoTimelineEnd !== 'function' || typeof timelineScroll === 'undefined') return;
      const dur = Math.max(videoTimelineEnd(), 2);
      const w = (timelineScroll && timelineScroll.clientWidth) ? timelineScroll.clientWidth - 32 : 800;
      state.pixelsPerSecond = Math.max(5, Math.min(400, w / dur));
      if (typeof updateZoomLabel === 'function') updateZoomLabel();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof renderMarkers === 'function') renderMarkers();
    }

    function zoomToSelection() {
      const sel = state.videoClips.filter((c) => typeof isSelected === 'function' && isSelected(c.id));
      if (!sel.length) { zoomToFit(); return; }
      let a = Infinity, b = 0;
      for (const c of sel) {
        a = Math.min(a, c.startTime);
        b = Math.max(b, typeof clipEnd === 'function' ? clipEnd(c) : c.startTime + 1);
      }
      const dur = Math.max(0.5, b - a);
      const w = (timelineScroll && timelineScroll.clientWidth) ? timelineScroll.clientWidth - 32 : 800;
      state.pixelsPerSecond = Math.max(5, Math.min(400, w / dur));
      if (typeof updateZoomLabel === 'function') updateZoomLabel();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      // scroll to selection
      if (timelineScroll && typeof timeToPx === 'function') {
        timelineScroll.scrollLeft = Math.max(0, timeToPx(a) - 40);
      }
    }

    function showHotkeyHelp() {
      if (typeof document === 'undefined') return;
      let modal = document.getElementById('hotkey-help-modal');
      if (modal) { modal.remove(); return; }
      modal = document.createElement('div');
      modal.id = 'hotkey-help-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#1e1e24;color:#e5e7eb;border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:20px 24px;font:14px/1.5 system-ui,sans-serif;';
      const rows = [
        ['Space', 'Play / Pause'],
        ['S', 'Split (kesish)'],
        ['Delete', 'O‘chirish (ripple)'],
        ['Shift+Delete', 'O‘chirish (bo‘shliq qoldir)'],
        ['I / O', 'In / Out nuqta'],
        ['Q / W', 'Playheadgacha chap / o‘ng kes'],
        [', / .', 'Bir kadr orqaga / oldinga'],
        ['Home / End', 'Bosh / oxir'],
        ['M', 'Marker qo‘sh / o‘chir'],
        ['J / K / L', 'Orqaga (seek) / To‘xta / Oldinga (1×→2×→4×)'],
        ['Shift+Z', 'Hammasiga sig‘dir (zoom-to-fit)'],
        ['Ctrl+Z / Y', 'Undo / Redo'],
        ['Ctrl+C / V / D', 'Nusxa / Joylashtir / Takrorla'],
        ['Ctrl + / − / 0', 'Zoom'],
        ['← / →', 'Playhead ±0.1s (Shift ±1s)'],
        ['Alt (ushlab)', 'Snap vaqtincha o‘chirish'],
        ['?', 'Shu oynani ochish'],
      ];
      box.innerHTML = '<h2 style="margin:0 0 12px;font-size:18px;">' + (typeof S === 'function' ? S('hotkey.title') : 'Klaviatura yorliqlari') + '</h2>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        rows.map(([k, v]) => '<tr><td style="padding:4px 8px;color:#93c5fd;white-space:nowrap;"><kbd style="background:#333;padding:2px 6px;border-radius:4px;">' + k + '</kbd></td><td style="padding:4px 8px;">' + v + '</td></tr>').join('') +
        '</table>' +
        '<p style="margin:12px 0 0;opacity:0.7;font-size:12px;">J: brauzer orqaga ijro qilolmaydi — qadamli seek, ovozsiz.</p>' +
        '<button id="hotkey-help-close" style="margin-top:16px;padding:8px 16px;border:0;border-radius:8px;background:#3b82f6;color:#fff;cursor:pointer;">Yopish</button>';
      modal.appendChild(box);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
      box.querySelector('#hotkey-help-close').addEventListener('click', () => modal.remove());
      document.body.appendChild(modal);
    }

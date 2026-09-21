    function ensureSubtitlesState() {
      if (!state.subtitles || !Array.isArray(state.subtitles.cues)) {
        state.subtitles = TextCore.defaultSubtitles();
      }
      return state.subtitles;
    }

    function getActiveCue(t) {
      const cues = (ensureSubtitlesState().cues || []);
      for (let i = 0; i < cues.length; i++) {
        if (t >= cues[i].start && t < cues[i].end) return cues[i];
      }
      return null;
    }

    function drawSubtitlesOnCanvas(ctx, outW, outH, t) {
      const sub = ensureSubtitlesState();
      const cue = getActiveCue(t);
      if (!cue) return;
      const style = TextCore.migrateTextClip(Object.assign({}, sub.style, {
        posX: (sub.position && sub.position.posX != null) ? sub.position.posX : 0.5,
        posY: (sub.position && sub.position.posY != null) ? sub.position.posY : 0.75,
        maxWidth: (sub.style && sub.style.maxWidth) || 0.85
      }));
      style._fullText = cue.text || '';
      const measure = canvasMeasureFactory(ctx, style, (style.size || 0.04) * outH);
      const layout = TextCore.layoutText(cue.text || '', style, outW, outH, measure);
      const fakeClip = { startTime: cue.start, duration: cue.end - cue.start, anim: style.anim };
      const anim = TextCore.clipAnimAt(fakeClip, t);
      let words = cue.words;
      let estimated = false;
      if (!words || !words.length) {
        words = TextCore.estimateWordTimings(cue.text, cue.start, cue.end);
        estimated = true;
      }
      const hi = (style.highlight && style.highlight.enabled) ? TextCore.activeWordIndex(words, t) : null;
      style.highlight = style.highlight || { enabled: false };
      drawLaidText(ctx, layout, style, anim, hi);
      if (estimated && typeof console !== 'undefined') {
        /* UI flag alohida panelda */
      }
    }

    function renderSubtitleLane() {
      let track = document.getElementById('subtitle-track');
      let lane = document.getElementById('subtitle-lane');
      if (!track) {
        const ts = document.getElementById('timeline-content');
        if (!ts) return;
        track = document.createElement('div');
        track.className = 'track';
        track.id = 'subtitle-track';
        lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.id = 'subtitle-lane';
        track.appendChild(lane);
        const textTrack = document.getElementById('text-track');
        if (textTrack && textTrack.parentNode) textTrack.parentNode.insertBefore(track, textTrack.nextSibling);
        else ts.appendChild(track);
      }
      lane = document.getElementById('subtitle-lane');
      const cues = ensureSubtitlesState().cues || [];
      track.style.display = cues.length ? 'flex' : 'none';
      lane.innerHTML = '';
      cues.forEach(function (cue) {
        const block = document.createElement('div');
        block.className = 'media-block text sub-cue';
        block.style.left = timeToPx(cue.start) + 'px';
        block.style.width = Math.max(24, timeToPx(Math.max(0.1, cue.end - cue.start))) + 'px';
        block.style.top = '4px';
        block.title = cue.text || '';
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = (cue.text || '').replace(/\s+/g, ' ').slice(0, 24) || 'cue';
        block.appendChild(label);
        block.onclick = function () {
          state.currentTime = cue.start;
          if (typeof seekPreviewToTime === 'function') seekPreviewToTime(cue.start);
          updateTimeDisplay();
        };
        lane.appendChild(block);
      });
    }

    function openSubtitlesPanel() {
      ensureSubtitlesState();
      let el = document.getElementById('sub-panel');
      if (el) { el.remove(); }
      el = document.createElement('div');
      el.id = 'sub-panel';
      el.className = 'sub-panel';
      const S = (typeof EMR_STRINGS !== 'undefined') ? EMR_STRINGS : {};
      el.innerHTML =
        '<div class="sub-panel-h">' + (S.SUBTITLES || 'Subtitrlar') +
        ' <button type="button" id="sub-close">×</button></div>' +
        '<div class="sub-panel-tools">' +
        '<button type="button" id="sub-add">Cue qo\'shish</button>' +
        '<button type="button" id="sub-imp">' + (S.IMPORT_SRT || 'Import') + '</button>' +
        '<button type="button" id="sub-srt">' + (S.EXPORT_SRT || 'SRT') + '</button>' +
        '<button type="button" id="sub-vtt">' + (S.EXPORT_VTT || 'VTT') + '</button>' +
        '<button type="button" id="sub-paste">' + (S.PASTE_SPLIT || 'Yopishtir') + '</button>' +
        '<button type="button" id="sub-tap">' + (S.TAP_SYNC || 'Tap') + '</button>' +
        '<button type="button" id="sub-cap" hidden>' + (S.AUTO_CAPTION || 'Beta') + '</button>' +
        '</div>' +
        '<label class="sub-apo"><input type="checkbox" id="sub-apo"> ' + (S.APOSTROPHE_HELP || '') + '</label>' +
        '<div id="sub-list" class="sub-list"></div>';
      document.body.appendChild(el);
      el.querySelector('#sub-close').onclick = function () { el.remove(); };
      el.querySelector('#sub-add').onclick = function () {
        pushHistory();
        const t = state.currentTime || 0;
        ensureSubtitlesState().cues.push({ id: 'cue-' + Date.now(), start: t, end: t + 2, text: 'Matn' });
        renderSubtitleLane(); scheduleSave(); refreshSubList();
      };
      el.querySelector('#sub-srt').onclick = function () {
        downloadText(TextCore.formatSrt(ensureSubtitlesState().cues), (state.projectName || 'sub') + '.srt', 'text/plain');
      };
      el.querySelector('#sub-vtt').onclick = function () {
        downloadText(TextCore.formatVtt(ensureSubtitlesState().cues), (state.projectName || 'sub') + '.vtt', 'text/vtt');
      };
      el.querySelector('#sub-imp').onclick = function () { pickSubtitleFile(); };
      el.querySelector('#sub-paste').onclick = function () { pasteSplitDialog(); };
      el.querySelector('#sub-tap').onclick = function () { tapSyncDialog(); };
      const cap = el.querySelector('#sub-cap');
      if (captionsBetaEnabled()) { cap.hidden = false; cap.onclick = function () { if (typeof startAutoCaptions === 'function') startAutoCaptions(); }; }
      refreshSubList();
    }

    function captionsBetaEnabled() {
      try {
        if (localStorage.getItem('emr.captions') === '1') return true;
        return /(?:\?|&)captions=beta\b/.test(location.search || '');
      } catch (_) { return false; }
    }

    function downloadText(text, name, type) {
      const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    }

    function refreshSubList() {
      const box = document.getElementById('sub-list');
      if (!box) return;
      const cues = ensureSubtitlesState().cues;
      box.innerHTML = cues.map(function (c, i) {
        return '<div class="sub-row" data-i="' + i + '">' +
          '<input class="sub-t0" type="number" step="0.01" value="' + c.start + '">' +
          '<input class="sub-t1" type="number" step="0.01" value="' + c.end + '">' +
          '<textarea class="sub-tx">' + String(c.text || '').replace(/</g, '<') + '</textarea>' +
          '<button type="button" class="sub-seek">▶</button>' +
          '<button type="button" class="sub-del">×</button></div>';
      }).join('');
      box.querySelectorAll('.sub-row').forEach(function (row) {
        const i = Number(row.dataset.i);
        row.querySelector('.sub-t0').onchange = function (e) {
          pushHistory(); cues[i].start = Number(e.target.value) || 0; scheduleSave(); renderSubtitleLane();
        };
        row.querySelector('.sub-t1').onchange = function (e) {
          pushHistory(); cues[i].end = Number(e.target.value) || 0; scheduleSave(); renderSubtitleLane();
        };
        row.querySelector('.sub-tx').onchange = function (e) {
          pushHistory();
          let v = e.target.value;
          if (document.getElementById('sub-apo') && document.getElementById('sub-apo').checked) v = TextCore.normalizeUzbekApostrophes(v);
          cues[i].text = v; scheduleSave(); renderSubtitleLane();
        };
        row.querySelector('.sub-seek').onclick = function () {
          state.currentTime = cues[i].start;
          if (typeof seekPreviewToTime === 'function') seekPreviewToTime(cues[i].start);
        };
        row.querySelector('.sub-del').onclick = function () {
          pushHistory(); cues.splice(i, 1); scheduleSave(); renderSubtitleLane(); refreshSubList();
        };
      });
    }

    function pickSubtitleFile() {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.srt,.vtt,text/plain';
      inp.onchange = async function () {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const buf = await f.arrayBuffer();
        const dec = TextCore.detectAndDecode(buf);
        if (dec.encoding === 'windows-1251') showToast('Fayl windows-1251 deb o\'qildi');
        let parsed = TextCore.parseSubtitles(dec.text);
        const apo = document.getElementById('sub-apo');
        if (apo && apo.checked) {
          parsed.cues = parsed.cues.map(function (c) {
            return Object.assign({}, c, { text: TextCore.normalizeUzbekApostrophes(c.text) });
          });
        }
        const fromHead = confirm('Playhead dan boshlansinmi? OK = playhead, Bekor = 0');
        if (fromHead) parsed.cues = TextCore.shiftCues(parsed.cues, state.currentTime || 0);
        pushHistory();
        const sub = ensureSubtitlesState();
        if (sub.cues.length) {
          if (!confirm('Mavjud subtitrlar o\'rniga yozilsinmi? Bekor = qo\'shish')) {
            sub.cues = sub.cues.concat(parsed.cues);
          } else sub.cues = parsed.cues;
        } else sub.cues = parsed.cues;
        if (parsed.skipped) showToast(parsed.skipped + ' ta cue o\'tkazib yuborildi');
        renderSubtitleLane(); scheduleSave(); refreshSubList();
      };
      inp.click();
    }

    function pasteSplitDialog() {
      const raw = prompt('Matnni yopishtiring');
      if (raw == null) return;
      const parts = TextCore.splitScriptIntoCues(raw, { maxChars: 42 });
      const start = state.currentTime || 0;
      const span = 2;
      const cues = parts.map(function (p, i) {
        return { id: p.id, text: p.text, start: start + i * span, end: start + (i + 1) * span };
      });
      pushHistory();
      ensureSubtitlesState().cues = cues;
      renderSubtitleLane(); scheduleSave(); refreshSubList();
    }

    function tapSyncDialog() {
      const raw = prompt('Qatorlarni yopishtiring (har qator = cue)');
      if (raw == null) return;
      const lines = raw.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length) return;
      const taps = [];
      const offsetMs = Number((function () {
        try { return localStorage.getItem('emr_tap_offset_ms') || '0'; } catch (_) { return '0'; }
      })());
      showToast('Video ijro. Har qator uchun Space. Oxirida Esc.');
      function onKey(e) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          taps.push(state.currentTime || 0);
          showToast((taps.length) + ' / ' + lines.length);
          if (taps.length >= lines.length) finish();
        }
        if (e.code === 'Escape') finish();
      }
      function finish() {
        document.removeEventListener('keydown', onKey, true);
        pushHistory();
        ensureSubtitlesState().cues = TextCore.applyTapTimes(lines.slice(0, taps.length), taps, { offsetMs: offsetMs, tailSec: 1.2 });
        renderSubtitleLane(); scheduleSave(); refreshSubList();
      }
      document.addEventListener('keydown', onKey, true);
    }

    // Timeline header tugmasi
    (function hookSubBtn() {
      const right = document.querySelector('.timeline-header-right');
      if (!right || document.getElementById('subtitles-btn')) return;
      const b = document.createElement('button');
      b.id = 'subtitles-btn';
      b.type = 'button';
      b.className = 'zoom-btn';
      b.title = 'Subtitrlar';
      b.textContent = 'CC';
      b.onclick = openSubtitlesPanel;
      right.insertBefore(b, right.firstChild);
    })();

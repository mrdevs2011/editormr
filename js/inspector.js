    // ===================== INSPECTOR PANEL (Faza 3C) =====================
    let _inspectorOpen = true;
    let _inspHistoryArmed = false;

    function getInspectorSelectedClips() {
      return state.videoClips.filter((c) => typeof isSelected === 'function' && isSelected(c.id));
    }

    function mixedOr(val, list, key) {
      if (!list.length) return '';
      const first = list[0][key];
      for (let i = 1; i < list.length; i++) {
        if (list[i][key] !== first) return '—';
      }
      return val != null ? val : first;
    }

    function applyInspectorField(key, value) {
      const clips = getInspectorSelectedClips();
      if (!clips.length) return;
      if (!_inspHistoryArmed) {
        if (typeof pushHistory === 'function') pushHistory();
        _inspHistoryArmed = true;
      }
      for (const c of clips) {
        if (key === 'speed') c.speed = Math.max(0.5, Math.min(2, Number(value) || 1));
        else if (key === 'volume') c.volume = Math.max(0, Math.min(1, Number(value)));
        else if (key === 'muted') c.muted = !!value;
        else if (key === 'fadeIn') c.fadeIn = Math.max(0, Number(value) || 0);
        else if (key === 'fadeOut') c.fadeOut = Math.max(0, Number(value) || 0);
        else if (key === 'transitionType') c.transitionType = value || 'none';
        else if (key === 'transitionDuration') c.transitionDuration = Math.max(0, Number(value) || 0);
        else if (key === 'photoDur' && c.isImage) {
          c.trimEnd = c.trimStart + Math.max(0.5, Math.min(10, Number(value) || 3));
        }
      }
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof ensurePreviewForClip === 'function') {
        const sel = typeof getSelectedClip === 'function' ? getSelectedClip() : clips[0];
        if (sel) ensurePreviewForClip(sel);
      }
      if (typeof scheduleSave === 'function') scheduleSave();
    }

    function commitInspectorHistory() {
      _inspHistoryArmed = false;
    }

    function buildInspectorHtml() {
      const clips = getInspectorSelectedClips();
      if (!clips.length) {
        return '<div class="insp-empty">Clip tanlang</div>';
      }
      const speed = mixedOr(clips[0].speed, clips, 'speed');
      const vol = mixedOr(clips[0].volume != null ? clips[0].volume : 1, clips, 'volume');
      const muted = clips.every((c) => c.muted);
      const fadeIn = mixedOr(clips[0].fadeIn || 0, clips, 'fadeIn');
      const fadeOut = mixedOr(clips[0].fadeOut || 0, clips, 'fadeOut');
      const tr = mixedOr(clips[0].transitionType || 'none', clips, 'transitionType');
      const trd = mixedOr(clips[0].transitionDuration != null ? clips[0].transitionDuration : 0.3, clips, 'transitionDuration');
      const isPhoto = clips.every((c) => c.isImage);
      let html = '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.speed') : 'Tezlik') + '</label>';
      html += '<input type="range" min="0.5" max="2" step="0.05" data-field="speed" value="' + (speed === '—' ? 1 : speed) + '"/>';
      html += '<span class="insp-val">' + (speed === '—' ? '—' : Number(speed).toFixed(2) + '×') + '</span></div>';
      html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.volume') : 'Ovoz') + '</label>';
      html += '<input type="range" min="0" max="1" step="0.01" data-field="volume" value="' + (vol === '—' ? 1 : vol) + '"/>';
      html += '<span class="insp-val">' + (vol === '—' ? '—' : Math.round(Number(vol) * 100) + '%') + '</span></div>';
      html += '<div class="insp-section"><label><input type="checkbox" data-field="muted"' + (muted ? ' checked' : '') + '/> ' + (typeof S === 'function' ? S('inspector.mute') : 'Ovozsiz') + '</label></div>';
      html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.fadeIn') : 'Fade kirish') + '</label>';
      html += '<input type="range" min="0" max="2" step="0.05" data-field="fadeIn" value="' + (fadeIn === '—' ? 0 : fadeIn) + '"/></div>';
      html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.fadeOut') : 'Fade chiqish') + '</label>';
      html += '<input type="range" min="0" max="2" step="0.05" data-field="fadeOut" value="' + (fadeOut === '—' ? 0 : fadeOut) + '"/></div>';
      html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.transition') : 'O‘tish') + '</label>';
      html += '<select data-field="transitionType"><option value="none"' + (tr === 'none' ? ' selected' : '') + '>Yo‘q</option>';
      html += '<option value="fade"' + (tr === 'fade' ? ' selected' : '') + '>Fade</option>';
      html += '<option value="dissolve"' + (tr === 'dissolve' ? ' selected' : '') + '>Dissolve</option></select></div>';
      html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.transDur') : 'O‘tish davomi') + '</label>';
      html += '<input type="range" min="0" max="2" step="0.05" data-field="transitionDuration" value="' + (trd === '—' ? 0.3 : trd) + '"/></div>';
      if (isPhoto) {
        const dur = clips[0].trimEnd - clips[0].trimStart;
        html += '<div class="insp-section"><label>' + (typeof S === 'function' ? S('inspector.photoDur') : 'Rasm davomi') + '</label>';
        html += '<input type="range" min="0.5" max="10" step="0.1" data-field="photoDur" value="' + dur + '"/></div>';
      }
      // Silence section
      html += '<div class="insp-section insp-silence"><button type="button" id="insp-silence-btn" class="insp-btn">' + (typeof S === 'function' ? S('silence.title') : 'Jim joylarni kesish') + '</button></div>';
      return html;
    }

    function refreshInspector() {
      const body = document.getElementById('inspector-body');
      if (!body) return;
      body.innerHTML = buildInspectorHtml();
      body.querySelectorAll('input[type=range], select').forEach((el) => {
        el.addEventListener('input', () => {
          const field = el.getAttribute('data-field');
          applyInspectorField(field, el.value);
          const span = el.parentElement && el.parentElement.querySelector('.insp-val');
          if (span && field === 'speed') span.textContent = Number(el.value).toFixed(2) + '×';
          if (span && field === 'volume') span.textContent = Math.round(Number(el.value) * 100) + '%';
        });
        el.addEventListener('change', commitInspectorHistory);
      });
      body.querySelectorAll('input[type=checkbox]').forEach((el) => {
        el.addEventListener('change', () => {
          applyInspectorField(el.getAttribute('data-field'), el.checked);
          commitInspectorHistory();
        });
      });
      const silBtn = document.getElementById('insp-silence-btn');
      if (silBtn) silBtn.addEventListener('click', () => {
        if (typeof openSilenceDialog === 'function') openSilenceDialog();
      });
    }

    function ensureInspectorPanel() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('inspector-panel')) return;
      const panel = document.createElement('div');
      panel.id = 'inspector-panel';
      panel.innerHTML = '<div class="insp-header"><span>' + (typeof S === 'function' ? S('inspector.title') : 'Sozlamalar') + '</span>' +
        '<button type="button" id="insp-toggle" aria-label="Yopish">×</button></div><div id="inspector-body"></div>';
      const editor = document.getElementById('editor-screen') || document.body;
      editor.appendChild(panel);
      try {
        const v = localStorage.getItem('emr-inspector-open');
        if (v === '0') _inspectorOpen = false;
      } catch (_) {}
      panel.classList.toggle('is-open', _inspectorOpen);
      document.getElementById('insp-toggle').addEventListener('click', () => {
        _inspectorOpen = !_inspectorOpen;
        panel.classList.toggle('is-open', _inspectorOpen);
        try { localStorage.setItem('emr-inspector-open', _inspectorOpen ? '1' : '0'); } catch (_) {}
      });
      // Mobile sheet vs desktop
      const mq = window.matchMedia('(max-width: 767px)');
      function applyLayout() {
        panel.classList.toggle('is-sheet', mq.matches);
      }
      applyLayout();
      if (mq.addEventListener) mq.addEventListener('change', applyLayout);
      refreshInspector();
    }

    // Tanlov o'zgarganda yangilash
    const _origSelectOnly = typeof selectOnly === 'function' ? selectOnly : null;
    // Selection o'zgarishini kuzatish — periodik engil
    if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => {
        ensureInspectorPanel();
        setInterval(() => {
          if (document.getElementById('inspector-panel')) refreshInspector();
        }, 800);
      });
    }

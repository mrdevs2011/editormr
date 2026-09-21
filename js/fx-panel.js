// ===================== FAZA 6 — Effektlar paneli (rang, preset, crop, blend, keyframe) =====================
(function () {
  const SLIDERS = [
    { key: 'brightness', label: 'Yorug\'lik', min: -100, max: 100, div: 100 },
    { key: 'contrast', label: 'Kontrast', min: -100, max: 100, div: 100 },
    { key: 'saturation', label: 'To\'yinganlik', min: -100, max: 100, div: 100 },
    { key: 'warmth', label: 'Iliqlik', min: -100, max: 100, div: 100 },
    { key: 'vignette', label: 'Vinyetka', min: 0, max: 100, div: 100 },
    { key: 'sharpen', label: 'O\'tkirlik', min: 0, max: 100, div: 100 },
  ];

  let panelEl = null;
  let dragging = false;
  let histPushed = false;

  function selectedVideoClip() {
    if (!state.selectedClipId) return null;
    return (state.videoClips || []).find(c => c.id === state.selectedClipId) || null;
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    const el = document.createElement('div');
    el.id = 'emr-fx-panel';
    el.className = 'emr-fx-panel';
    el.innerHTML = `
      <div class="emr-fx-head">
        <span>Effektlar</span>
        <button type="button" class="emr-fx-close" aria-label="Yopish">×</button>
      </div>
      <div class="emr-fx-tabs">
        <button type="button" data-tab="rang" class="is-on">Rang</button>
        <button type="button" data-tab="preset">Filter</button>
        <button type="button" data-tab="kesish">Kesish</button>
        <button type="button" data-tab="blend">Aralashtirish</button>
        <button type="button" data-tab="anim">Animatsiya</button>
      </div>
      <div class="emr-fx-body" data-body="rang"></div>
      <div class="emr-fx-body" data-body="preset" hidden></div>
      <div class="emr-fx-body" data-body="kesish" hidden></div>
      <div class="emr-fx-body" data-body="blend" hidden></div>
      <div class="emr-fx-body" data-body="anim" hidden></div>
    `;
    document.body.appendChild(el);
    panelEl = el;

    el.querySelector('.emr-fx-close').addEventListener('click', () => hidePanel());
    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
        el.querySelectorAll('[data-body]').forEach(b => {
          b.hidden = b.getAttribute('data-body') !== btn.getAttribute('data-tab');
        });
        refreshBodies();
      });
    });

    buildRang(el.querySelector('[data-body="rang"]'));
    buildPreset(el.querySelector('[data-body="preset"]'));
    buildKesish(el.querySelector('[data-body="kesish"]'));
    buildBlend(el.querySelector('[data-body="blend"]'));
    buildAnim(el.querySelector('[data-body="anim"]'));
    return el;
  }

  function buildRang(body) {
    body.innerHTML = '';
    SLIDERS.forEach(s => {
      const row = document.createElement('label');
      row.className = 'emr-fx-row';
      row.innerHTML = `<span>${s.label}</span>
        <input type="range" min="${s.min}" max="${s.max}" step="1" data-fx="${s.key}" />
        <em data-val="${s.key}">0</em>`;
      body.appendChild(row);
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'emr-fx-btn';
    reset.textContent = 'Asl holatga';
    reset.addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      clip.fx = null;
      refreshBodies();
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    body.appendChild(reset);

    body.querySelectorAll('input[data-fx]').forEach(inp => {
      inp.addEventListener('pointerdown', () => { histPushed = false; });
      inp.addEventListener('input', () => {
        const clip = selectedVideoClip();
        if (!clip) return;
        if (!histPushed) {
          if (typeof pushHistory === 'function') pushHistory();
          histPushed = true;
        }
        if (!clip.fx) clip.fx = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0, sharpen: 0, presetId: null };
        const key = inp.getAttribute('data-fx');
        const meta = SLIDERS.find(s => s.key === key);
        clip.fx[key] = Number(inp.value) / meta.div;
        // neytral bo'lsa null
        if (window.EMR && window.EMR.fxMath && window.EMR.fxMath.isNeutralFx(clip.fx)) clip.fx = null;
        body.querySelector(`[data-val="${key}"]`).textContent = inp.value;
        redraw();
      });
      inp.addEventListener('change', () => {
        histPushed = false;
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    });
  }

  function buildPreset(body) {
    body.innerHTML = '<div class="emr-fx-presets"></div>';
    const wrap = body.querySelector('.emr-fx-presets');
    const presets = (window.EMR && window.EMR.fxMath && window.EMR.fxMath.FX_PRESETS) || [];
    presets.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emr-fx-preset';
      b.textContent = p.name;
      b.addEventListener('click', () => {
        const clip = selectedVideoClip();
        if (!clip) return;
        if (typeof pushHistory === 'function') pushHistory();
        clip.fx = { ...p.fx, presetId: p.id };
        refreshBodies();
        redraw();
        if (typeof scheduleSave === 'function') scheduleSave();
      });
      wrap.appendChild(b);
    });
    // Kuchi
    const strength = document.createElement('label');
    strength.className = 'emr-fx-row';
    strength.innerHTML = `<span>Kuchi</span><input type="range" min="0" max="100" value="100" data-strength /><em data-sval>100</em>`;
    body.appendChild(strength);
    strength.querySelector('input').addEventListener('input', (e) => {
      const clip = selectedVideoClip();
      if (!clip || !clip.fx || !clip.fx.presetId) return;
      const preset = presets.find(x => x.id === clip.fx.presetId);
      if (!preset) return;
      const k = Number(e.target.value) / 100;
      strength.querySelector('[data-sval]').textContent = e.target.value;
      if (!histPushed) { if (typeof pushHistory === 'function') pushHistory(); histPushed = true; }
      const scaled = window.EMR.fxMath.scaleFx({ ...preset.fx, presetId: preset.id }, k);
      clip.fx = scaled;
      redraw();
    });
    strength.querySelector('input').addEventListener('change', () => {
      histPushed = false;
      if (typeof scheduleSave === 'function') scheduleSave();
    });

    const applyAll = document.createElement('button');
    applyAll.type = 'button';
    applyAll.className = 'emr-fx-btn';
    applyAll.textContent = 'Barcha clip\'larga qo\'llash';
    applyAll.addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip || !clip.fx) return;
      if (typeof pushHistory === 'function') pushHistory();
      const fxCopy = { ...clip.fx };
      (state.videoClips || []).forEach(c => {
        if ((c.track | 0) === 0 && !c.floated) c.fx = { ...fxCopy };
      });
      showToast('Effekt asosiy qator clip\'lariga qo\'llandi');
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    body.appendChild(applyAll);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'emr-fx-btn';
    clear.textContent = 'Effektni olib tashlash';
    clear.addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      clip.fx = null;
      refreshBodies();
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    body.appendChild(clear);
  }

  function buildKesish(body) {
    body.innerHTML = `
      <div class="emr-fx-row-btns">
        <button type="button" data-rot="-90">↺ 90°</button>
        <button type="button" data-rot="90">↻ 90°</button>
        <button type="button" data-flip="H">Aylantirish H</button>
        <button type="button" data-flip="V">Aylantirish V</button>
      </div>
      <div class="emr-fx-row-btns">
        <button type="button" data-aspect="free">Erkin</button>
        <button type="button" data-aspect="1:1">1:1</button>
        <button type="button" data-aspect="9:16">9:16</button>
        <button type="button" data-aspect="16:9">16:9</button>
        <button type="button" data-aspect="4:5">4:5</button>
        <button type="button" data-aspect="3:4">3:4</button>
      </div>
      <button type="button" class="emr-fx-btn" data-crop-reset>Kesishni bekor</button>
    `;
    body.querySelectorAll('[data-rot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clip = selectedVideoClip();
        if (!clip) return;
        if (typeof pushHistory === 'function') pushHistory();
        const d = Number(btn.getAttribute('data-rot'));
        const from = clip.rot90 || 0;
        const to = ((from + d) % 360 + 360) % 360;
        if (clip.crop && window.EMR && window.EMR.fxMath) {
          clip.crop = window.EMR.fxMath.rotateCropRect(clip.crop, from, to);
        }
        clip.rot90 = to;
        redraw();
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    });
    body.querySelectorAll('[data-flip]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clip = selectedVideoClip();
        if (!clip) return;
        if (typeof pushHistory === 'function') pushHistory();
        if (btn.getAttribute('data-flip') === 'H') clip.flipH = !clip.flipH;
        else clip.flipV = !clip.flipV;
        redraw();
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    });
    body.querySelectorAll('[data-aspect]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clip = selectedVideoClip();
        if (!clip) return;
        if (typeof pushHistory === 'function') pushHistory();
        const a = btn.getAttribute('data-aspect');
        if (a === 'free') {
          clip.crop = null;
        } else {
          const [aw, ah] = a.split(':').map(Number);
          // markazda aspect crop
          const target = aw / ah;
          // assume square view for simplicity: center crop
          let w = 1, h = 1;
          if (target >= 1) { h = 1 / target; w = 1; }
          else { w = target; h = 1; }
          clip.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
        }
        redraw();
        if (typeof scheduleSave === 'function') scheduleSave();
      });
    });
    body.querySelector('[data-crop-reset]').addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      clip.crop = null;
      clip.rot90 = 0;
      clip.flipH = false;
      clip.flipV = false;
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
  }

  function buildBlend(body) {
    body.innerHTML = `
      <label class="emr-fx-row"><span>Shaffoflik</span>
        <input type="range" min="0" max="100" data-opacity />
        <em data-op-val>100</em>
      </label>
      <label class="emr-fx-row emr-fx-blend-row"><span>Aralashtirish</span>
        <select data-blend>
          <option value="normal">Oddiy</option>
          <option value="screen">Screen</option>
          <option value="multiply">Multiply</option>
          <option value="overlay">Overlay</option>
        </select>
      </label>
      <p class="emr-fx-hint">Aralashtirish faqat float qatorlar uchun</p>
    `;
    const opInp = body.querySelector('[data-opacity]');
    opInp.addEventListener('pointerdown', () => { histPushed = false; });
    opInp.addEventListener('input', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (!histPushed) { if (typeof pushHistory === 'function') pushHistory(); histPushed = true; }
      clip.opacity = Number(opInp.value) / 100;
      body.querySelector('[data-op-val]').textContent = opInp.value;
      redraw();
    });
    opInp.addEventListener('change', () => {
      histPushed = false;
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    body.querySelector('[data-blend]').addEventListener('change', (e) => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      clip.blend = e.target.value;
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
  }

  function buildAnim(body) {
    body.innerHTML = `
      <button type="button" class="emr-fx-btn" data-add-kf>+ Keyframe</button>
      <button type="button" class="emr-fx-btn" data-kb>Ken Burns</button>
      <ul class="emr-fx-kf-list"></ul>
    `;
    body.querySelector('[data-add-kf]').addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      if (!Array.isArray(clip.kf)) clip.kf = [];
      if (clip.kf.length >= 4) { showToast('Eng ko\'pi 4 ta keyframe'); return; }
      const dur = (typeof clipDuration === 'function') ? clipDuration(clip) : 1;
      const p = dur > 0 ? Math.max(0, Math.min(1, (state.currentTime - clip.startTime) / dur)) : 0;
      const tr = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
      clip.kf.push({
        p, x: tr.x || 0, y: tr.y || 0, scale: tr.scale != null ? tr.scale : 1,
        rotation: tr.rotation || 0, opacity: clip.opacity != null ? clip.opacity : 1, ease: 'linear',
      });
      clip.kf.sort((a, b) => a.p - b.p);
      refreshBodies();
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
    body.querySelector('[data-kb]').addEventListener('click', () => {
      const clip = selectedVideoClip();
      if (!clip) return;
      if (typeof pushHistory === 'function') pushHistory();
      clip.kenBurns = undefined;
      clip.kf = [
        { p: 0, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ease: 'linear' },
        { p: 1, x: 0.05, y: 0, scale: 1.25, rotation: 0, opacity: 1, ease: 'linear' },
      ];
      refreshBodies();
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
    });
  }

  function refreshBodies() {
    if (!panelEl) return;
    const clip = selectedVideoClip();
    // Rang
    const fx = (clip && clip.fx) || {};
    SLIDERS.forEach(s => {
      const inp = panelEl.querySelector(`input[data-fx="${s.key}"]`);
      const val = panelEl.querySelector(`[data-val="${s.key}"]`);
      if (!inp) return;
      const v = Math.round((fx[s.key] || 0) * s.div);
      inp.value = v;
      if (val) val.textContent = String(v);
    });
    // Opacity / blend
    const opInp = panelEl.querySelector('[data-opacity]');
    if (opInp && clip) {
      const ov = Math.round((clip.opacity != null ? clip.opacity : 1) * 100);
      opInp.value = ov;
      const em = panelEl.querySelector('[data-op-val]');
      if (em) em.textContent = String(ov);
    }
    const blendSel = panelEl.querySelector('[data-blend]');
    if (blendSel && clip) {
      blendSel.value = clip.blend || 'normal';
      const isF = clip && ((clip.track | 0) > 0 || clip.floated);
      const row = panelEl.querySelector('.emr-fx-blend-row');
      if (row) row.style.display = isF ? '' : 'none';
    }
    // Keyframes list
    const list = panelEl.querySelector('.emr-fx-kf-list');
    if (list) {
      list.innerHTML = '';
      const kfs = (clip && Array.isArray(clip.kf)) ? clip.kf : [];
      kfs.forEach((k, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${Math.round((k.p || 0) * 100)}%</span>
          <select data-kf-ease="${i}">
            <option value="linear">linear</option>
            <option value="easeIn">easeIn</option>
            <option value="easeOut">easeOut</option>
            <option value="easeInOut">easeInOut</option>
          </select>
          <button type="button" data-kf-del="${i}">×</button>`;
        li.querySelector('select').value = k.ease || 'linear';
        li.querySelector('select').addEventListener('change', (e) => {
          if (typeof pushHistory === 'function') pushHistory();
          k.ease = e.target.value;
          if (typeof scheduleSave === 'function') scheduleSave();
        });
        li.querySelector('[data-kf-del]').addEventListener('click', () => {
          if (typeof pushHistory === 'function') pushHistory();
          clip.kf.splice(i, 1);
          refreshBodies();
          redraw();
          if (typeof scheduleSave === 'function') scheduleSave();
        });
        list.appendChild(li);
      });
    }
  }

  function redraw() {
    if (window.EMR && typeof window.EMR.requestPreviewRedraw === 'function') {
      window.EMR.requestPreviewRedraw(true);
    }
  }

  function showPanel() {
    ensurePanel();
    panelEl.classList.add('is-open');
    refreshBodies();
  }
  function hidePanel() {
    if (panelEl) panelEl.classList.remove('is-open');
  }

  function openForSelection() {
    const clip = selectedVideoClip();
    if (!clip) {
      showToast('Avval clip tanlang');
      return;
    }
    showPanel();
  }

  // Toolbar tugma
  function injectToolbarBtn() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar || document.getElementById('fx-panel-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fx-panel-btn';
    btn.className = 'tool-btn';
    btn.title = 'Effektlar';
    btn.textContent = 'Fx';
    btn.addEventListener('click', openForSelection);
    toolbar.appendChild(btn);

    // Sticker tugma
    if (!document.getElementById('sticker-btn')) {
      const sb = document.createElement('button');
      sb.type = 'button';
      sb.id = 'sticker-btn';
      sb.className = 'tool-btn';
      sb.title = 'Sticker';
      sb.textContent = '😊';
      sb.addEventListener('click', openStickerPicker);
      toolbar.appendChild(sb);
    }
  }

  const EMOJIS = [
    '😀','😂','🤣','😊','😍','🥰','😘','😎','🤔','😢',
    '😭','😡','👍','👎','👏','🙏','🔥','❤️','💔','⭐',
    '✨','🎉','🎊','💯','✅','❌','⚡','🎵','🎬','📷',
    '🌈','☀️','🌙','⭐','🌸','🍕','🍔','☕','🎂','🎁',
    '🚀','💻','📱','🎮','🏆','💪','👋','🤝','👀','💀',
    '🎃','👻','🦄','🐶','🐱','🦊','🐻','🐼','🐨','🐯',
    '🦁','🐸','🐵','🐔','🐧','🐦','🦋','🐝','🌍','🌊',
  ];

  function openStickerPicker() {
    let modal = document.getElementById('emr-sticker-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'emr-sticker-modal';
      modal.className = 'emr-sticker-modal';
      modal.innerHTML = `
        <div class="emr-sticker-sheet">
          <div class="emr-sticker-tabs">
            <button type="button" data-stab="emoji" class="is-on">Emoji</button>
            <button type="button" data-stab="image">Rasm</button>
            <button type="button" class="emr-sticker-close">×</button>
          </div>
          <div class="emr-sticker-emoji" data-sbody="emoji"></div>
          <div class="emr-sticker-image" data-sbody="image" hidden>
            <p>PNG, WebP, JPEG (GIF — faqat birinchi kadr). SVG qabul qilinmaydi. Max 8 MB.</p>
            <input type="file" accept="image/png,image/webp,image/jpeg,image/gif" />
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('.emr-sticker-close').addEventListener('click', () => modal.classList.remove('is-open'));
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('is-open'); });
      const emojiBox = modal.querySelector('[data-sbody="emoji"]');
      EMOJIS.forEach(ch => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = ch;
        b.addEventListener('click', () => {
          addEmojiSticker(ch);
          modal.classList.remove('is-open');
        });
        emojiBox.appendChild(b);
      });
      modal.querySelectorAll('[data-stab]').forEach(btn => {
        btn.addEventListener('click', () => {
          modal.querySelectorAll('[data-stab]').forEach(x => x.classList.remove('is-on'));
          btn.classList.add('is-on');
          modal.querySelectorAll('[data-sbody]').forEach(x => {
            x.hidden = x.getAttribute('data-sbody') !== btn.getAttribute('data-stab');
          });
        });
      });
      modal.querySelector('input[type=file]').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        await addImageSticker(file);
        modal.classList.remove('is-open');
      });
    }
    modal.classList.add('is-open');
  }

  function addEmojiSticker(ch) {
    if (typeof pushHistory === 'function') pushHistory();
    if (!state.stickers) state.stickers = [];
    state.stickers.push({
      id: 's' + Math.random().toString(36).slice(2, 9),
      kind: 'emoji',
      char: ch,
      name: ch,
      startTime: state.currentTime || 0,
      duration: 3,
      posX: 0.5, posY: 0.5,
      width: 0.15, rotation: 0, opacity: 1,
      anim: { in: 'pop', out: 'fade' },
    });
    redraw();
    if (typeof scheduleSave === 'function') scheduleSave();
    showToast('Sticker qo\'shildi');
  }

  async function addImageSticker(file) {
    if (file.size > 8 * 1024 * 1024) {
      showToast('Rasm 8 MB dan katta');
      return;
    }
    const type = (file.type || '').toLowerCase();
    if (type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      showToast('SVG qabul qilinmaydi');
      return;
    }
    if (type === 'image/gif') {
      showToast('GIF — faqat birinchi kadr ishlatiladi');
    }
    try {
      let bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      // resize if > 2048
      const maxSide = Math.max(bitmap.width, bitmap.height);
      if (maxSide > 2048) {
        const k = 2048 / maxSide;
        const w = Math.round(bitmap.width * k);
        const h = Math.round(bitmap.height * k);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        bitmap.close && bitmap.close();
        bitmap = await createImageBitmap(c);
        // re-encode
        const blob = await new Promise(r => c.toBlob(r, type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92));
        file = new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), { type: blob.type });
      }
      if (typeof pushHistory === 'function') pushHistory();
      if (!state.stickers) state.stickers = [];
      const url = URL.createObjectURL(file);
      state.stickers.push({
        id: 's' + Math.random().toString(36).slice(2, 9),
        kind: 'image',
        file,
        url,
        name: file.name,
        startTime: state.currentTime || 0,
        duration: 3,
        posX: 0.5, posY: 0.5,
        width: 0.25, rotation: 0, opacity: 1,
        anim: { in: 'fade', out: 'fade' },
        _bitmap: bitmap,
      });
      redraw();
      if (typeof scheduleSave === 'function') scheduleSave();
      showToast('Sticker qo\'shildi');
    } catch (err) {
      console.error(err);
      showToast('Rasmni o\'qib bo\'lmadi');
    }
  }

  // Context menu: Effektlar
  document.addEventListener('DOMContentLoaded', () => {
    injectToolbarBtn();
  });
  // late inject
  setTimeout(injectToolbarBtn, 500);
  setTimeout(injectToolbarBtn, 2000);

  window.EMR = window.EMR || {};
  window.EMR.fxPanel = { show: showPanel, hide: hidePanel, open: openForSelection };
})();

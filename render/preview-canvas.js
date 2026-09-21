/**
 * Canvas preview (Faza 2B-4).
 * Feature flag: ?renderer=legacy|canvas  yoki localStorage 'emr.renderer'
 * Default (sinovdan o'tgach): canvas. Hozir: URL/localStorage yo'q bo'lsa canvas.
 *
 * Bitta ko'rinadigan <canvas>. Video elementlar manba sifatida (opacity:0).
 * Ijro: requestVideoFrameCallback (bo'lmasa rAF).
 * To'xtaganda / scrub'da faqat kerak bo'lganda chiz.
 * devicePixelRatio max 2.
 */

import { renderFrame } from './compositor.js';
import { createPreviewProvider } from './frame-provider.js';

const LS_KEY = 'emr.renderer';

export function getRendererMode() {
  try {
    const q = new URLSearchParams(window.location.search).get('renderer');
    if (q === 'legacy' || q === 'canvas') return q;
  } catch (_) {}
  try {
    const ls = localStorage.getItem(LS_KEY);
    if (ls === 'legacy' || ls === 'canvas') return ls;
  } catch (_) {}
  return 'canvas'; // yangi default
}

export function setRendererMode(mode) {
  try { localStorage.setItem(LS_KEY, mode === 'legacy' ? 'legacy' : 'canvas'); } catch (_) {}
}

let canvasEl = null;
let ctx = null;
let provider = null;
let rafId = 0;
let rvfcId = 0;
let lastDrawnT = -1;
let dirty = true;
let playing = false;
let showSafeZone = false;
let poolWarned = false;

function toastPoolFull(limit, mobile) {
  if (poolWarned) return;
  poolWarned = true;
  const msg = mobile
    ? 'Bir vaqtda 2 tadan ortiq float cheklangan (mobil)'
    : 'Bir vaqtda 4 tadan ortiq float cheklangan';
  if (typeof showToast === 'function') showToast(msg, 3500);
  setTimeout(() => { poolWarned = false; }, 5000);
}

function ensureCanvas() {
  if (canvasEl && canvasEl.isConnected) return canvasEl;
  const stack = document.getElementById('preview-stack');
  if (!stack) return null;
  let c = document.getElementById('emr-preview-canvas');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'emr-preview-canvas';
    c.className = 'emr-preview-canvas';
    c.setAttribute('aria-hidden', 'true');
    stack.appendChild(c);
  }
  canvasEl = c;
  ctx = c.getContext('2d', { alpha: false });
  return c;
}

function hideLegacyLayers(hide) {
  const ids = ['preview-layer-a', 'preview-layer-b', 'preview-layer-float'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = hide ? 'hidden' : '';
  });
  if (canvasEl) canvasEl.style.display = hide ? 'block' : 'none';
}

function sizeCanvas() {
  const c = ensureCanvas();
  if (!c) return;
  const stack = document.getElementById('preview-stack');
  if (!stack) return;
  const cssW = stack.clientWidth || 1;
  const cssH = stack.clientHeight || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.max(2, Math.round(cssW * dpr));
  const ph = Math.max(2, Math.round(cssH * dpr));
  if (c.width !== pw || c.height !== ph) {
    c.width = pw;
    c.height = ph;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    dirty = true;
  }
}

function buildProjectSnapshot(outW, outH) {
  const clips = (typeof state !== 'undefined' && state.videoClips) ? state.videoClips : [];
  const textClips = (typeof state !== 'undefined' && state.textClips) ? state.textClips : [];
  return {
    canvas: (typeof state !== 'undefined' && state.canvas) ? state.canvas : null,
    clips,
    textClips,
    canvasW: outW,
    canvasH: outH,
  };
}

function helpers() {
  return {
    getTransitionLayers: typeof getTransitionLayers === 'function' ? getTransitionLayers : null,
    clipDuration: typeof clipDuration === 'function' ? clipDuration : null,
    clipEnd: typeof clipEnd === 'function' ? clipEnd : null,
    timelineToSource: typeof timelineToSource === 'function' ? timelineToSource : null,
    isFloated: typeof isFloated === 'function' ? isFloated : null,
    drawSafeZone: showSafeZone,
  };
}

function drawOnce(t) {
  if (getRendererMode() !== 'canvas') return;
  sizeCanvas();
  if (!ctx || !canvasEl) return;
  if (!provider) {
    provider = createPreviewProvider({ onPoolFull: toastPoolFull });
  }
  const W = canvasEl.width;
  const H = canvasEl.height;
  const project = buildProjectSnapshot(W, H);
  const opts = helpers();
  try {
    renderFrame(ctx, project, t, provider, opts);
  } catch (err) {
    console.error('[EMR] renderFrame', err);
  }
  lastDrawnT = t;
  dirty = false;
}

function loop() {
  if (getRendererMode() !== 'canvas') return;
  if (!playing) return;
  const t = (typeof state !== 'undefined') ? state.currentTime : 0;
  drawOnce(t);
  // rVFC asosiy video'dan — agar mavjud
  const pv = typeof previewVideo !== 'undefined' ? previewVideo : null;
  if (pv && typeof pv.requestVideoFrameCallback === 'function' && !pv.paused) {
    rvfcId = pv.requestVideoFrameCallback(() => { loop(); });
  } else {
    rafId = requestAnimationFrame(loop);
  }
}

function stopLoop() {
  playing = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  const pv = typeof previewVideo !== 'undefined' ? previewVideo : null;
  if (rvfcId && pv && typeof pv.cancelVideoFrameCallback === 'function') {
    try { pv.cancelVideoFrameCallback(rvfcId); } catch (_) {}
    rvfcId = 0;
  }
  if (provider) provider.pauseAll();
}

function startLoop() {
  if (getRendererMode() !== 'canvas') return;
  stopLoop();
  playing = true;
  loop();
}

export function requestPreviewRedraw(force) {
  if (getRendererMode() !== 'canvas') return;
  dirty = true;
  if (playing) return; // loop o'zi chizadi
  const t = (typeof state !== 'undefined') ? state.currentTime : 0;
  if (!force && Math.abs(t - lastDrawnT) < 1e-4 && !dirty) return;
  drawOnce(t);
}

export function setSafeZoneVisible(v) {
  showSafeZone = !!v;
  requestPreviewRedraw(true);
}

export function isSafeZoneVisible() {
  return showSafeZone;
}

export function initPreviewCanvas() {
  const mode = getRendererMode();
  ensureCanvas();
  if (mode === 'canvas') {
    hideLegacyLayers(true);
    sizeCanvas();
    requestPreviewRedraw(true);
  } else {
    hideLegacyLayers(false);
    if (canvasEl) canvasEl.style.display = 'none';
  }

  // Resize
  const stack = document.getElementById('preview-stack');
  if (stack && typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (getRendererMode() === 'canvas') {
        sizeCanvas();
        requestPreviewRedraw(true);
      }
    }).observe(stack);
  }

  // Play/pause hooks — state.isPlaying kuzatish (playback.js dan chaqiriladi)
  window.EMR = window.EMR || {};
  window.EMR.requestPreviewRedraw = requestPreviewRedraw;
  window.EMR.setSafeZoneVisible = setSafeZoneVisible;
  window.EMR.isSafeZoneVisible = isSafeZoneVisible;
  window.EMR.getRendererMode = getRendererMode;
  window.EMR.setRendererMode = setRendererMode;
  window.EMR._previewCanvas = {
    startLoop,
    stopLoop,
    drawOnce,
    onPlay() { startLoop(); },
    onPause() { stopLoop(); requestPreviewRedraw(true); },
    onSeek() { requestPreviewRedraw(true); },
  };
}

// Auto-init when module loads (after DOM)
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => { initPreviewCanvas(); bindPanZoom(); }, 0);
    });
  } else {
    setTimeout(() => { initPreviewCanvas(); bindPanZoom(); }, 0);
  }
}


// ---------- 2A-4: pan/zoom (tanlangan clip transform) ----------
let panState = null;

function selectedClip() {
  if (typeof getSelectedClip === 'function') return getSelectedClip();
  if (typeof state !== 'undefined' && state.selectedClipId) {
    return (state.videoClips || []).find(c => c.id === state.selectedClipId) || null;
  }
  return null;
}

function bindPanZoom() {
  const c = ensureCanvas();
  if (!c || c._emrPanBound) return;
  c._emrPanBound = true;
  c.style.pointerEvents = 'auto';

  c.addEventListener('pointerdown', (e) => {
    if (getRendererMode() !== 'canvas') return;
    const clip = selectedClip();
    if (!clip) return;
    if (!clip.transform) clip.transform = { x: 0, y: 0, scale: 1, rotation: 0 };
    panState = {
      id: clip.id,
      x0: e.clientX,
      y0: e.clientY,
      tx: clip.transform.x || 0,
      ty: clip.transform.y || 0,
      pushed: false,
    };
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });

  c.addEventListener('pointermove', (e) => {
    if (!panState) return;
    const clip = selectedClip();
    if (!clip || clip.id !== panState.id) { panState = null; return; }
    if (!panState.pushed && typeof pushHistory === 'function') {
      pushHistory();
      panState.pushed = true;
    }
    const rect = c.getBoundingClientRect();
    const dx = (e.clientX - panState.x0) / Math.max(1, rect.width);
    const dy = (e.clientY - panState.y0) / Math.max(1, rect.height);
    clip.transform.x = panState.tx + dx;
    clip.transform.y = panState.ty + dy;
    requestPreviewRedraw(true);
  });

  const endPan = (e) => {
    if (!panState) return;
    panState = null;
    if (typeof scheduleSave === 'function') scheduleSave();
  };
  c.addEventListener('pointerup', endPan);
  c.addEventListener('pointercancel', endPan);

  c.addEventListener('wheel', (e) => {
    if (getRendererMode() !== 'canvas') return;
    const clip = selectedClip();
    if (!clip) return;
    e.preventDefault();
    if (!clip.transform) clip.transform = { x: 0, y: 0, scale: 1, rotation: 0 };
    if (typeof pushHistory === 'function') pushHistory();
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    clip.transform.scale = Math.max(0.1, Math.min(5, (clip.transform.scale || 1) * delta));
    requestPreviewRedraw(true);
    if (typeof scheduleSave === 'function') scheduleSave();
  }, { passive: false });
}

const _oldInit = initPreviewCanvas;
export function initPreviewCanvasPatched() {
  _oldInit();
  bindPanZoom();
}

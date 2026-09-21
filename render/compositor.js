/**
 * Yagona kadr compositor. Faza 2B-1.
 *
 * renderFrame(ctx, project, t, frameProvider) — "t vaqtida kadrda nima ko'rinadi".
 * Preview va export ikkalasi ham shuni chaqiradi.
 *
 * Layer tartibi: fon → asosiy qator (transition) → float (pastdan yuqoriga) → matn.
 *
 * frameProvider.getFrame(clip, sourceTime) → HTMLVideoElement | HTMLImageElement | ImageBitmap | null
 * getTransitionLayers — global (state.js), o'zgartirilmaydi.
 */

import { computeFit, interpolateTransform } from './geometry.js';

/**
 * @typedef {object} ProjectSnapshot
 * @property {{w:number,h:number,fps?:number}|null} canvas
 * @property {object[]} clips
 * @property {object[]} [textClips]
 * @property {number} [canvasW]  // aniq chizish o'lchami (export/preview)
 * @property {number} [canvasH]
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ProjectSnapshot} project
 * @param {number} t  timeline vaqti (soniya)
 * @param {{ getFrame: (clip: object, sourceTime: number) => any }} frameProvider
 * @param {object} [opts]
 * @param {function} [opts.getTransitionLayers]  default: global getTransitionLayers
 * @param {function} [opts.clipDuration]
 * @param {function} [opts.clipEnd]
 * @param {function} [opts.timelineToSource]
 * @param {function} [opts.isFloated]
 * @param {boolean} [opts.drawSafeZone]  faqat preview
 */
export function renderFrame(ctx, project, t, frameProvider, opts) {
  opts = opts || {};
  const W = project.canvasW || (project.canvas && project.canvas.w) || ctx.canvas.width;
  const H = project.canvasH || (project.canvas && project.canvas.h) || ctx.canvas.height;
  const getTL = opts.getTransitionLayers || (typeof getTransitionLayers === 'function' ? getTransitionLayers : null);
  const clipDur = opts.clipDuration || defaultClipDuration;
  const clipEndFn = opts.clipEnd || ((c) => c.startTime + clipDur(c));
  const toSrc = opts.timelineToSource || defaultTimelineToSource;
  const isFloat = opts.isFloated || ((c) => (c.track | 0) > 0 || !!c.floated);

  // 1) Fon
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const clips = project.clips || [];
  const mainClips = clips.filter((c) => !isFloat(c)).sort((a, b) => a.startTime - b.startTime);
  const floatClips = clips.filter((c) => isFloat(c) && t >= c.startTime && t < clipEndFn(c))
    .sort((a, b) => (a.track | 0) - (b.track | 0) || a.startTime - b.startTime);

  // 2) Asosiy qator + transition
  const active = findMainAt(mainClips, t, clipEndFn);
  if (active) {
    const next = findNextOnTrack(mainClips, active, clipEndFn);
    const trType = active.transitionType || 'none';
    const trDur = active.transitionDuration != null ? active.transitionDuration : 0.3;
    const endA = clipEndFn(active);
    const inTransition = next && trType && trType !== 'none' && trDur > 0 &&
      t >= endA - trDur && t < endA + 1e-4;

    if (inTransition && getTL) {
      const progress = Math.max(0, Math.min(1, (t - (endA - trDur)) / trDur));
      const L = getTL(trType, progress);
      // A (outgoing)
      drawClipLayer(ctx, active, t, frameProvider, W, H, toSrc, L.a, L, true);
      // B (incoming)
      if (next) drawClipLayer(ctx, next, t, frameProvider, W, H, toSrc, L.b, L, false);
    } else {
      drawClipLayer(ctx, active, t, frameProvider, W, H, toSrc, 1, null, true);
    }
  }

  // 3) Float qatorlar (pastdan yuqoriga)
  for (const fc of floatClips) {
    drawClipLayer(ctx, fc, t, frameProvider, W, H, toSrc, fc.opacity != null ? fc.opacity : 1, null, true);
  }

  // 4) Matn
  const texts = project.textClips || [];
  for (const tc of texts) {
    if (t < tc.startTime || t >= tc.startTime + Math.max(0.1, tc.duration || 0)) continue;
    drawTextClip(ctx, tc, W, H);
  }

  // 5) Xavfsiz zona (faqat preview)
  if (opts.drawSafeZone) {
    drawSafeZone(ctx, W, H);
  }
}

function defaultClipDuration(c) {
  const src = Math.max(0, (c.trimEnd - c.trimStart));
  const sp = (c.speed && c.speed > 0) ? c.speed : 1;
  return src / sp;
}

function defaultTimelineToSource(c, t) {
  const sp = (c.speed && c.speed > 0) ? c.speed : 1;
  return c.trimStart + (t - c.startTime) * sp;
}

function findMainAt(mainClips, t, clipEndFn) {
  let best = null;
  for (const c of mainClips) {
    if (t >= c.startTime && t < clipEndFn(c)) best = c;
  }
  return best;
}

function findNextOnTrack(mainClips, clip, clipEndFn) {
  const end = clipEndFn(clip);
  let best = null;
  let bestStart = Infinity;
  for (const c of mainClips) {
    if (c.id === clip.id) continue;
    if (c.startTime + 1e-4 < end) continue;
    if (c.startTime < bestStart) {
      bestStart = c.startTime;
      best = c;
    }
  }
  return best;
}

/**
 * Bitta clipni chizish (fit + transform + opacity + ixtiyoriy Ken Burns).
 * @param {object|null} layerInfo getTransitionLayers natijasi (slide/zoom uchun)
 * @param {boolean} isA outgoing qatlammi
 */
function drawClipLayer(ctx, clip, t, frameProvider, W, H, toSrc, alpha, layerInfo, isA) {
  if (!clip) return;
  const sourceTime = toSrc(clip, t);
  const frame = frameProvider && frameProvider.getFrame(clip, sourceTime);
  if (!frame) return;

  let sw = 0, sh = 0;
  if (frame.videoWidth) { sw = frame.videoWidth; sh = frame.videoHeight; }
  else if (frame.naturalWidth) { sw = frame.naturalWidth; sh = frame.naturalHeight; }
  else if (frame.width) { sw = frame.width; sh = frame.height; }
  if (!sw || !sh) return;

  // Ken Burns (faqat rasm)
  let transform = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  if (clip.isImage && clip.kenBurns && clip.kenBurns.from && clip.kenBurns.to) {
    const dur = defaultClipDuration(clip);
    const p = dur > 0 ? Math.max(0, Math.min(1, (t - clip.startTime) / dur)) : 0;
    transform = interpolateTransform(clip.kenBurns.from, clip.kenBurns.to, p);
  }

  const fitMode = clip.fit || 'contain';
  const fit = computeFit(sw, sh, W, H, fitMode);
  const op = alpha != null ? alpha : (clip.opacity != null ? clip.opacity : 1);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, op));

  // Transition layer offset/scale (getTransitionLayers a/b maydonlari)
  if (layerInfo) {
    const L = isA ? layerInfo : layerInfo; // a/b allaqachon alpha sifatida keladi
    // Ba'zi transition'lar translate/scale beradi — state.js getTransitionLayers strukturasiga bog'liq
    if (layerInfo.ax != null && isA) {
      ctx.translate(layerInfo.ax * W || 0, layerInfo.ay * H || 0);
    }
    if (layerInfo.bx != null && !isA) {
      ctx.translate(layerInfo.bx * W || 0, layerInfo.by * H || 0);
    }
  }

  // Transform
  const cx = W / 2 + (transform.x || 0) * W;
  const cy = H / 2 + (transform.y || 0) * H;
  const scale = transform.scale != null && transform.scale > 0 ? transform.scale : 1;
  const rot = ((transform.rotation || 0) * Math.PI) / 180;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -H / 2);

  // Blur fon
  if (fitMode === 'blur' && fit.blur) {
    ctx.save();
    ctx.filter = 'blur(24px)';
    try {
      ctx.drawImage(frame, 0, 0, sw, sh, fit.blur.dx, fit.blur.dy, fit.blur.dw, fit.blur.dh);
    } catch (_) {}
    ctx.restore();
    ctx.filter = 'none';
  }

  try {
    ctx.drawImage(frame, 0, 0, sw, sh, fit.dx, fit.dy, fit.dw, fit.dh);
  } catch (_) {}

  ctx.restore();
}

function drawTextClip(ctx, tc, W, H) {
  const text = (tc.text || '').trim();
  if (!text) return;
  // B4: fontSize — kanvas balandligining 720 px ga nisbati
  const baseSize = tc.fontSize || 32;
  const fontSize = baseSize * (H / 720);
  const x = (tc.x != null ? tc.x : 0.5) * W;
  const y = (tc.y != null ? tc.y : 0.85) * H;
  const align = tc.align || 'center';
  const color = tc.color || '#ffffff';
  const bold = tc.bold ? 'bold ' : '';
  const font = `${bold}${fontSize}px sans-serif`;

  ctx.save();
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const padX = fontSize * 0.35;
  const padY = fontSize * 0.25;
  const tw = metrics.width;
  const th = fontSize;
  let bx = x;
  if (align === 'center') bx = x - tw / 2;
  else if (align === 'right') bx = x - tw;

  const bgOp = tc.bgOpacity != null ? tc.bgOpacity : 0.45;
  if (bgOp > 0) {
    ctx.fillStyle = tc.bgColor || '#000000';
    ctx.globalAlpha = bgOp;
    ctx.fillRect(bx - padX, y - th / 2 - padY, tw + padX * 2, th + padY * 2);
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawSafeZone(ctx, W, H) {
  // TikTok/Reels taxminiy xavfsiz zona: yuqori 12%, quyi 18%
  const top = H * 0.12;
  const bot = H * 0.18;
  ctx.save();
  ctx.fillStyle = 'rgba(255,0,80,0.12)';
  ctx.fillRect(0, 0, W, top);
  ctx.fillRect(0, H - bot, W, bot);
  ctx.strokeStyle = 'rgba(255,0,80,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top); ctx.lineTo(W, top);
  ctx.moveTo(0, H - bot); ctx.lineTo(W, H - bot);
  ctx.stroke();
  ctx.restore();
}

// Bridge for classic scripts
if (typeof window !== 'undefined') {
  window.EMR = window.EMR || {};
  window.EMR.renderFrame = renderFrame;
  window.EMR.geometry = { computeFit, interpolateTransform };
}

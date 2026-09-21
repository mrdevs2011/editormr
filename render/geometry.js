/**
 * Sof geometriya (DOM'siz). Faza 2A-3 / 2B / 2C.
 * Node testlari bilan qoplanadi.
 */

/**
 * Manba (srcW×srcH) ni kanvas (canvasW×canvasH) ichiga joylashtirish.
 * @param {number} srcW
 * @param {number} srcH
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {'contain'|'cover'|'blur'} mode
 * @returns {{ dx:number, dy:number, dw:number, dh:number, sx:number, sy:number, sw:number, sh:number, blur?: {dx,dy,dw,dh} }}
 *   - contain/cover/blur: asosiy rasm joyi (dx,dy,dw,dh) — drawImage dest
 *   - cover uchun manba kesish (sx,sy,sw,sh) ham beriladi (0,0,srcW,srcH agar to'liq)
 *   - blur: orqa xira nusxa uchun blur.{dx,dy,dw,dh} (cover kabi to'ldirilgan)
 */
export function computeFit(srcW, srcH, canvasW, canvasH, mode) {
  const m = mode || 'contain';
  if (!srcW || !srcH || !canvasW || !canvasH) {
    return { dx: 0, dy: 0, dw: canvasW || 0, dh: canvasH || 0, sx: 0, sy: 0, sw: srcW || 0, sh: srcH || 0 };
  }

  if (m === 'cover') {
    const k = Math.max(canvasW / srcW, canvasH / srcH);
    const dw = srcW * k;
    const dh = srcH * k;
    const dx = (canvasW - dw) / 2;
    const dy = (canvasH - dh) / 2;
    // drawImage(src, 0,0,srcW,srcH, dx,dy,dw,dh) — chetlari kesiladi
    return { dx, dy, dw, dh, sx: 0, sy: 0, sw: srcW, sh: srcH };
  }

  if (m === 'blur') {
    // Orqa: cover (to'ldirish), old: contain (markazda)
    const kCover = Math.max(canvasW / srcW, canvasH / srcH);
    const blurDw = srcW * kCover;
    const blurDh = srcH * kCover;
    const blurDx = (canvasW - blurDw) / 2;
    const blurDy = (canvasH - blurDh) / 2;

    const kContain = Math.min(canvasW / srcW, canvasH / srcH);
    const dw = srcW * kContain;
    const dh = srcH * kContain;
    const dx = (canvasW - dw) / 2;
    const dy = (canvasH - dh) / 2;
    return {
      dx, dy, dw, dh, sx: 0, sy: 0, sw: srcW, sh: srcH,
      blur: { dx: blurDx, dy: blurDy, dw: blurDw, dh: blurDh },
    };
  }

  // contain (default)
  const k = Math.min(canvasW / srcW, canvasH / srcH);
  const dw = srcW * k;
  const dh = srcH * k;
  const dx = (canvasW - dw) / 2;
  const dy = (canvasH - dh) / 2;
  return { dx, dy, dw, dh, sx: 0, sy: 0, sw: srcW, sh: srcH };
}

/**
 * Transform (normalizatsiyalangan x,y ∈ [-0.5..0.5] markazga nisbatan,
 * scale, rotation deg) ni canvas piksellariga aylantiradi.
 * x=0,y=0 → markaz; scale=1 → o'zgarmagan; rotation soat strelkasiga qarshi (CSS kabi).
 */
export function applyTransform(base, transform, canvasW, canvasH) {
  const t = transform || { x: 0, y: 0, scale: 1, rotation: 0 };
  const scale = t.scale != null && t.scale > 0 ? t.scale : 1;
  const rot = (t.rotation || 0) * Math.PI / 180;
  const cx = canvasW / 2 + (t.x || 0) * canvasW;
  const cy = canvasH / 2 + (t.y || 0) * canvasH;
  return {
    cx, cy,
    scale,
    rotation: rot,
    // base rect relative to center before scale/rot
    ox: base.dx + base.dw / 2 - canvasW / 2,
    oy: base.dy + base.dh / 2 - canvasH / 2,
    dw: base.dw * scale,
    dh: base.dh * scale,
  };
}

/**
 * Ken Burns: from/to transform orasida linear interpolyatsiya.
 * @param {{x,y,scale,rotation}} from
 * @param {{x,y,scale,rotation}} to
 * @param {number} progress 0..1
 */
export function interpolateTransform(from, to, progress) {
  const p = Math.max(0, Math.min(1, progress));
  const a = from || { x: 0, y: 0, scale: 1, rotation: 0 };
  const b = to || { x: 0, y: 0, scale: 1, rotation: 0 };
  return {
    x: (a.x || 0) + ((b.x || 0) - (a.x || 0)) * p,
    y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * p,
    scale: (a.scale != null ? a.scale : 1) + ((b.scale != null ? b.scale : 1) - (a.scale != null ? a.scale : 1)) * p,
    rotation: (a.rotation || 0) + ((b.rotation || 0) - (a.rotation || 0)) * p,
  };
}

/**
 * Kanvas preset id → {w,h} (juft sonlar, H.264).
 * null/'fit' → null (asl nisbat).
 * quality: '720' | '1080'
 */
export function canvasSizeFromPreset(presetId, quality) {
  const q = quality === '1080' ? 1080 : 720;
  const presets = {
    '9:16': { r: 9 / 16 },
    '1:1': { r: 1 },
    '4:5': { r: 4 / 5 },
    '16:9': { r: 16 / 9 },
    '3:4': { r: 3 / 4 },
    '2:3': { r: 2 / 3 },
    '2.35:1': { r: 2.35 },
  };
  if (!presetId || presetId === 'fit') return null;
  const p = presets[presetId];
  if (!p) return null;
  let w, h;
  if (p.r >= 1) {
    w = q * Math.max(1, p.r);
    h = q;
  } else {
    h = q / p.r;
    w = q;
  }
  // uzun tomon = quality
  if (p.r >= 1) {
    w = Math.round(q * p.r);
    h = q;
  } else {
    h = Math.round(q / p.r);
    w = q;
  }
  w = Math.max(2, w - (w % 2));
  h = Math.max(2, h - (h % 2));
  return { w, h, fps: 30 };
}

/**
 * Chiqish o'lchami: state.canvas yoki fit manbadan, quality bilan.
 */
export function resolveCanvasSize(canvas, fitSource, quality) {
  if (canvas && canvas.w && canvas.h) {
    const q = quality === '1080' ? 1080 : quality === '720' ? 720 : null;
    if (!q) {
      let w = Math.round(canvas.w), h = Math.round(canvas.h);
      w = Math.max(2, w - (w % 2));
      h = Math.max(2, h - (h % 2));
      return { w, h, fps: canvas.fps > 0 ? canvas.fps : 30 };
    }
    const r = canvas.w / canvas.h;
    let w, h;
    if (r >= 1) { w = Math.round(q * r); h = q; }
    else { h = Math.round(q / r); w = q; }
    w = Math.max(2, w - (w % 2));
    h = Math.max(2, h - (h % 2));
    return { w, h, fps: canvas.fps > 0 ? canvas.fps : 30 };
  }
  // asl nisbat
  const sw = (fitSource && fitSource.w) || 1280;
  const sh = (fitSource && fitSource.h) || 720;
  const maxSide = quality === '1080' ? 1080 : quality === '720' ? 720 : 1280;
  let w = sw, h = sh;
  const m = Math.max(w, h);
  if (m > maxSide) {
    const k = maxSide / m;
    w *= k; h *= k;
  }
  w = Math.max(2, Math.round(w) - (Math.round(w) % 2));
  h = Math.max(2, Math.round(h) - (Math.round(h) % 2));
  return { w, h, fps: (canvas && canvas.fps > 0) ? canvas.fps : 30 };
}

/**
 * FrameProvider interfeysi (Faza 2B-3).
 * getFrame(clip, sourceTime) → HTMLVideoElement | HTMLImageElement | null
 *
 * Video elementlar DOM'da qoladi, lekin ko'rinmas:
 * opacity:0, position:absolute, 1px, pointer-events:none; playsinline, muted.
 * display:none ISHLATILMAYDI (ba'zi brauzerlar dekod qilmaydi).
 *
 * Element puli: desktop 4, mobil 2. Ortig'i — toast ogohlantirish.
 */

const HIDDEN_STYLE = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';

function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= 640;
}

function poolLimit() {
  return isMobile() ? 2 : 4;
}

function makeHiddenVideo() {
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.preload = 'auto';
  v.style.cssText = HIDDEN_STYLE;
  document.body.appendChild(v);
  return v;
}

function makeHiddenImg() {
  const img = document.createElement('img');
  img.alt = '';
  img.style.cssText = HIDDEN_STYLE;
  document.body.appendChild(img);
  return img;
}

/**
 * PreviewProvider — jonli preview uchun yashirin <video>/<img> puli.
 */
export function createPreviewProvider(opts) {
  opts = opts || {};
  const onPoolFull = opts.onPoolFull || null;
  /** @type {Map<string, HTMLVideoElement|HTMLImageElement>} */
  const pool = new Map(); // clipId -> element
  const order = []; // LRU

  function touch(id) {
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.push(id);
  }

  function evictIfNeeded() {
    const limit = poolLimit();
    while (order.length > limit) {
      const old = order.shift();
      const el = pool.get(old);
      if (el) {
        try {
          if (el.tagName === 'VIDEO') {
            el.pause();
            el.removeAttribute('src');
            el.load();
          } else {
            el.removeAttribute('src');
          }
          el.remove();
        } catch (_) {}
        pool.delete(old);
      }
    }
  }

  function getOrCreate(clip) {
    if (!clip || !clip.url) return null;
    const id = clip.id;
    if (pool.has(id)) {
      touch(id);
      return pool.get(id);
    }
    const limit = poolLimit();
    if (order.length >= limit) {
      if (onPoolFull) {
        try {
          onPoolFull(limit, isMobile());
        } catch (_) {}
      }
      evictIfNeeded();
    }
    let el;
    if (clip.isImage) {
      el = makeHiddenImg();
      el.src = clip.url;
    } else {
      el = makeHiddenVideo();
      el.src = clip.url;
    }
    pool.set(id, el);
    touch(id);
    return el;
  }

  /**
   * @param {object} clip
   * @param {number} sourceTime
   * @returns {HTMLVideoElement|HTMLImageElement|null}
   */
  function getFrame(clip, sourceTime) {
    const el = getOrCreate(clip);
    if (!el) return null;
    if (clip.isImage) {
      if (el.complete && el.naturalWidth) return el;
      return el.naturalWidth ? el : null;
    }
    // video
    const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
    try { el.playbackRate = sp; } catch (_) {}
    const st = Math.max(0, sourceTime || 0);
    if (Math.abs((el.currentTime || 0) - st) > 0.12) {
      try { el.currentTime = st; } catch (_) {}
    }
    if (el.readyState >= 2) return el;
    return el.readyState >= 1 ? el : null;
  }

  function ensurePlaying(clip, sourceTime) {
    const el = getOrCreate(clip);
    if (!el || clip.isImage) return el;
    getFrame(clip, sourceTime);
    if (el.paused) el.play().catch(() => {});
    return el;
  }

  function pauseAll() {
    pool.forEach((el) => {
      if (el.tagName === 'VIDEO') {
        try { el.pause(); } catch (_) {}
      }
    });
  }

  function destroy() {
    order.slice().forEach((id) => {
      const el = pool.get(id);
      if (el) {
        try {
          if (el.tagName === 'VIDEO') {
            el.pause();
            el.removeAttribute('src');
            el.load();
          }
          el.remove();
        } catch (_) {}
      }
    });
    pool.clear();
    order.length = 0;
  }

  return { getFrame, ensurePlaying, pauseAll, destroy, _pool: pool };
}

/**
 * ExportProvider — export sikli uchun alohida elementlar (preview bilan aralashmasin).
 */
export function createExportProvider() {
  const videos = new Map();
  const images = new Map();

  function getVideo(clip) {
    if (!clip || !clip.url) return null;
    let v = videos.get(clip.id);
    if (!v) {
      v = makeHiddenVideo();
      v.src = clip.url;
      videos.set(clip.id, v);
    } else if (v.src !== clip.url && !v.src.endsWith(clip.url)) {
      try { v.src = clip.url; } catch (_) {}
    }
    return v;
  }

  function getImage(clip) {
    if (!clip || !clip.url) return null;
    let img = images.get(clip.id);
    if (!img) {
      img = makeHiddenImg();
      img.src = clip.url;
      images.set(clip.id, img);
    } else if (img.src !== clip.url) {
      img.src = clip.url;
    }
    return img;
  }

  function getFrame(clip, sourceTime) {
    if (!clip) return null;
    if (clip.isImage) {
      const img = getImage(clip);
      return img && img.naturalWidth ? img : img;
    }
    const v = getVideo(clip);
    if (!v) return null;
    const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
    try { v.playbackRate = sp; } catch (_) {}
    const st = Math.max(0, sourceTime || 0);
    if (Math.abs((v.currentTime || 0) - st) > 0.08) {
      try { v.currentTime = st; } catch (_) {}
    }
    if (v.paused) v.play().catch(() => {});
    return v.readyState >= 2 ? v : v;
  }

  function destroy() {
    videos.forEach((v) => {
      try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch (_) {}
    });
    images.forEach((img) => {
      try { img.remove(); } catch (_) {}
    });
    videos.clear();
    images.clear();
  }

  return { getFrame, destroy };
}

if (typeof window !== 'undefined') {
  window.EMR = window.EMR || {};
  window.EMR.createPreviewProvider = createPreviewProvider;
  window.EMR.createExportProvider = createExportProvider;
}

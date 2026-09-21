// ===================== AUDIO ENGINE (preview) =====================
// Singleton AudioContext + MediaElementSource pool. Gain curves from buildMixPlan only.
(function () {
  'use strict';

  var MAX_POOL_DESKTOP = 8;
  var MAX_POOL_MOBILE = 4;

  var sharedCtx = null;
  var masterGain = null;
  var limiter = null;
  var pool = []; // { el, source, gainNode, clipId, inUse }
  var peaksCache = Object.create(null); // fileId -> peaks
  var enginePlaying = false;

  function isMobile() {
    return typeof isTouchUi === 'function' ? isTouchUi() : /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  }

  function maxPool() {
    return isMobile() ? MAX_POOL_MOBILE : MAX_POOL_DESKTOP;
  }

  function getAudioContext() {
    if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = sharedCtx.createGain();
    masterGain.gain.value = 1;
    // Master limiter — parametrlar MASTER_LIMITER bilan bir xil (preview = export)
    var lim = (typeof EMRAudioLogic !== 'undefined' && EMRAudioLogic.MASTER_LIMITER)
      ? EMRAudioLogic.MASTER_LIMITER
      : { threshold: -1, ratio: 20, attack: 0.003, release: 0.1 };
    limiter = sharedCtx.createDynamicsCompressor();
    limiter.threshold.value = lim.threshold;
    limiter.knee.value = 0;
    limiter.ratio.value = lim.ratio;
    limiter.attack.value = lim.attack;
    limiter.release.value = lim.release;
    masterGain.connect(limiter);
    limiter.connect(sharedCtx.destination);
    return sharedCtx;
  }

  function resumeAudioContext() {
    var ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      return ctx.resume().catch(function () {});
    }
    return Promise.resolve();
  }

  // iOS: resume on first user gesture
  function armResumeOnGesture() {
    var once = function () {
      resumeAudioContext();
      document.removeEventListener('pointerdown', once, true);
      document.removeEventListener('touchstart', once, true);
      document.removeEventListener('keydown', once, true);
    };
    document.addEventListener('pointerdown', once, true);
    document.addEventListener('touchstart', once, true);
    document.addEventListener('keydown', once, true);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', armResumeOnGesture);
    } else {
      armResumeOnGesture();
    }
  }

  function createPoolSlot() {
    var ctx = getAudioContext();
    var el = new Audio();
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.volume = 1; // gain via GainNode (0..2)
    var source = null;
    var gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    try {
      source = ctx.createMediaElementSource(el);
      source.connect(gainNode);
      gainNode.connect(masterGain);
    } catch (e) {
      console.warn('createMediaElementSource failed', e);
    }
    return { el: el, source: source, gainNode: gainNode, clipId: null, inUse: false };
  }

  function acquireSlot(clipId) {
    // reuse same clip
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].clipId === clipId) {
        pool[i].inUse = true;
        return pool[i];
      }
    }
    // free slot
    for (var j = 0; j < pool.length; j++) {
      if (!pool[j].inUse) {
        pool[j].inUse = true;
        pool[j].clipId = clipId;
        return pool[j];
      }
    }
    if (pool.length < maxPool()) {
      var slot = createPoolSlot();
      slot.inUse = true;
      slot.clipId = clipId;
      pool.push(slot);
      return slot;
    }
    // steal oldest not matching
    var stolen = pool[0];
    try { stolen.el.pause(); } catch (_) {}
    stolen.clipId = clipId;
    stolen.inUse = true;
    if (typeof showToast === 'function') {
      showToast('Juda ko\'p audio birga — ba\'zilari o\'chirildi');
    }
    return stolen;
  }

  function releaseAllSlots() {
    for (var i = 0; i < pool.length; i++) {
      var s = pool[i];
      try { s.el.pause(); } catch (_) {}
      s.gainNode.gain.cancelScheduledValues(0);
      s.gainNode.gain.value = 0;
      s.inUse = false;
      s.clipId = null;
    }
  }

  function projectForMix() {
    return {
      audioClips: state.audioClips || [],
      videoClips: state.videoClips || [],
      clips: state.videoClips || [],
      ducking: state.duckingSettings || (typeof EMRAudioLogic !== 'undefined' ? EMRAudioLogic.DEFAULT_DUCKING : null),
      duckingSettings: state.duckingSettings,
      duration: typeof videoTimelineEnd === 'function' ? videoTimelineEnd() : 3600,
    };
  }

  function ensureClipOnSlot(slot, clip) {
    if (!clip) return;
    var url = clip.url || (clip.file ? URL.createObjectURL(clip.file) : null);
    if (!url) return;
    if (slot.el.src !== url && slot.el.getAttribute('src') !== url) {
      slot.el.src = url;
      try { slot.el.load(); } catch (_) {}
    }
  }

  function scheduleGain(slot, curve, whenCtx) {
    var g = slot.gainNode.gain;
    var ctx = getAudioContext();
    var now = whenCtx != null ? whenCtx : ctx.currentTime;
    g.cancelScheduledValues(now);
    if (!curve || !curve.length) {
      g.setValueAtTime(0, now);
      return;
    }
    // Map timeline t → context time relative to play start
    // Caller passes curve already in absolute timeline; we need offset
    // For live preview we set value at current position and ramp upcoming
  }

  /**
   * Apply gain for current timeline time (called each tick / on seek).
   */
  function applyGainsAtTime(t) {
    if (typeof EMRAudioLogic === 'undefined') return;
    var plan = EMRAudioLogic.buildMixPlan(projectForMix());
    var activeIds = {};
    for (var i = 0; i < plan.length; i++) {
      var entry = plan[i];
      activeIds[entry.id] = true;
      var g = EMRAudioLogic.gainAtFromPlanEntry(entry, t);
      var clip = null;
      var list = state.audioClips || [];
      for (var j = 0; j < list.length; j++) {
        if (list[j].id === entry.id) { clip = list[j]; break; }
      }
      if (!clip) continue;
      var slot = acquireSlot(entry.id);
      ensureClipOnSlot(slot, clip);
      // GainNode can go 0..2; element.volume stays 1
      slot.gainNode.gain.setValueAtTime(Math.max(0, Math.min(2, g)), getAudioContext().currentTime);
      // Sync element position
      var local = (entry.trimStart || 0) + Math.max(0, t - (entry.startTime || 0));
      var vis = (entry.trimEnd || 0) - (entry.trimStart || 0);
      if (local >= 0 && local < vis + 0.05) {
        if (Math.abs((slot.el.currentTime || 0) - local) > 0.15) {
          try { slot.el.currentTime = local; } catch (_) {}
        }
        if (enginePlaying && slot.el.paused) {
          slot.el.play().catch(function () {});
        }
      } else {
        if (!slot.el.paused) slot.el.pause();
      }
    }
    // Pause slots not in plan
    for (var k = 0; k < pool.length; k++) {
      if (pool[k].clipId && !activeIds[pool[k].clipId]) {
        try { pool[k].el.pause(); } catch (_) {}
        pool[k].gainNode.gain.setValueAtTime(0, getAudioContext().currentTime);
        pool[k].inUse = false;
      }
    }
  }

  function startEngine() {
    enginePlaying = true;
    resumeAudioContext().then(function () {
      applyGainsAtTime(state.currentTime || 0);
    });
  }

  function stopEngine() {
    enginePlaying = false;
    for (var i = 0; i < pool.length; i++) {
      try { pool[i].el.pause(); } catch (_) {}
      pool[i].gainNode.gain.cancelScheduledValues(0);
      pool[i].gainNode.gain.value = 0;
    }
  }

  function seekEngine(t) {
    applyGainsAtTime(t);
  }

  function syncEngineTick() {
    if (!enginePlaying) return;
    applyGainsAtTime(state.currentTime || 0);
  }

  // --- Peaks ---
  function getCachedPeaks(fileId) {
    return peaksCache[fileId] || null;
  }

  function setCachedPeaks(fileId, peaks) {
    peaksCache[fileId] = peaks;
  }

  /**
   * Decode file → peaks (100/s), free AudioBuffer immediately.
   * Returns Promise<peaks>
   */
  function decodePeaksFromFile(file, fileId, onProgress) {
    if (fileId && peaksCache[fileId]) return Promise.resolve(peaksCache[fileId]);
    return file.arrayBuffer().then(function (ab) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx.decodeAudioData(ab.slice(0)).then(function (buf) {
        var ch = buf.getChannelData(0);
        // For long files, process in chunks to avoid UI freeze
        var peaks;
        if (typeof EMRAudioLogic !== 'undefined') {
          peaks = EMRAudioLogic.computePeaks(ch, buf.sampleRate, 100);
        } else {
          peaks = [];
        }
        try { ctx.close(); } catch (_) {}
        // free references
        buf = null;
        ch = null;
        if (fileId) peaksCache[fileId] = peaks;
        return peaks;
      }).catch(function (err) {
        try { ctx.close(); } catch (_) {}
        throw err;
      });
    });
  }

  function drawPeaksWaveform(canvas, peaks, trimStart, trimEnd, sampleRateHint) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = (typeof BRAND !== 'undefined' && BRAND.whiteDeep) ? BRAND.whiteDeep : '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    if (!peaks || !peaks.length) {
      ctx.fillStyle = (typeof BRAND !== 'undefined' && BRAND.white) ? BRAND.white : '#eee';
      for (var i = 0; i < w; i += 3) {
        var barH = 4 + Math.random() * (h - 8);
        ctx.fillRect(i, (h - barH) / 2, 2, barH);
      }
      return;
    }
    // peaks are 100/s of full file; map trim window to peak indices
    var pps = 100;
    var i0 = Math.floor((trimStart || 0) * pps);
    var i1 = Math.ceil((trimEnd || peaks.length / pps) * pps);
    i0 = Math.max(0, Math.min(peaks.length - 1, i0));
    i1 = Math.max(i0 + 1, Math.min(peaks.length, i1));
    var span = i1 - i0;
    ctx.fillStyle = (typeof BRAND !== 'undefined' && BRAND.white) ? BRAND.white : '#eee';
    for (var x = 0; x < w; x++) {
      var pi = i0 + Math.floor(x * span / w);
      var p = peaks[Math.min(pi, peaks.length - 1)];
      var y1 = ((1 + p.min) / 2) * h;
      var y2 = ((1 + p.max) / 2) * h;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }

  // Public API on window
  window.EMRAudioEngine = {
    getAudioContext: getAudioContext,
    resumeAudioContext: resumeAudioContext,
    startEngine: startEngine,
    stopEngine: stopEngine,
    seekEngine: seekEngine,
    syncEngineTick: syncEngineTick,
    applyGainsAtTime: applyGainsAtTime,
    releaseAllSlots: releaseAllSlots,
    decodePeaksFromFile: decodePeaksFromFile,
    getCachedPeaks: getCachedPeaks,
    setCachedPeaks: setCachedPeaks,
    drawPeaksWaveform: drawPeaksWaveform,
    projectForMix: projectForMix,
  };
})();

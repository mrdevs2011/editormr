// ===================== AUDIO PURE LOGIC (DOM-siz, Node testlari bilan) =====================
// buildMixPlan — bitta retsept. Preview ham, export ham FAQAT shundan o'qiydi.
(function (root) {
  'use strict';

  const DEFAULT_DUCKING = {
    enabled: false,
    amountDb: -12,
    attackMs: 150,
    releaseMs: 400,
    includeVideoAudio: true,
  };

  const MASTER_LIMITER = {
    threshold: -1,
    ratio: 20,
    attack: 0.003,
    release: 0.1,
  };

  function musicToAudioClip(music, id) {
    if (!music) return null;
    return {
      id: id || ('ac_' + Math.random().toString(36).slice(2, 10)),
      kind: 'music',
      fileId: music.fileId || null,
      name: music.name || (music.file && music.file.name) || 'Music',
      track: 0,
      startTime: music.startTime != null ? music.startTime : 0,
      trimStart: music.trimStart != null ? music.trimStart : 0,
      trimEnd: music.trimEnd != null ? music.trimEnd : (music.duration || 0),
      gain: music.volume != null ? music.volume : (music.gain != null ? music.gain : 1),
      muted: !!music.muted,
      fadeIn: music.fadeIn != null ? music.fadeIn : 0,
      fadeOut: music.fadeOut != null ? music.fadeOut : 0,
      duck: true,
    };
  }

  function migrateMusicToAudioClips(meta) {
    if (!meta) return meta;
    const clips = Array.isArray(meta.audioClips) ? meta.audioClips.slice() : [];
    if (clips.length === 0 && meta.music) {
      const ac = musicToAudioClip(meta.music);
      if (ac) clips.push(ac);
    }
    meta.audioClips = clips;
    if (!meta.ducking || typeof meta.ducking !== 'object') {
      meta.ducking = Object.assign({}, DEFAULT_DUCKING);
    } else {
      meta.ducking = Object.assign({}, DEFAULT_DUCKING, meta.ducking);
    }
    return meta;
  }

  function countFileRefs(project) {
    const counts = new Map();
    function add(id) {
      if (!id) return;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    const clips = project.clips || project.videoClips || [];
    for (const c of clips) add(c.fileId);
    const audio = project.audioClips || [];
    for (const a of audio) add(a.fileId);
    if (project.music && project.music.fileId) add(project.music.fileId);
    return counts;
  }

  /** Clip visible duration on timeline. */
  function audioClipDuration(c) {
    if (!c) return 0;
    return Math.max(0, (c.trimEnd != null ? c.trimEnd : 0) - (c.trimStart != null ? c.trimStart : 0));
  }

  function audioClipEnd(c) {
    return (c.startTime || 0) + audioClipDuration(c);
  }

  /**
   * Base gain (fade + mute + volume) at timeline time t for one clip.
   * Returns 0..2 (gain can go above 1).
   */
  function sampleClipGain(clip, t) {
    if (!clip || clip.muted) return 0;
    const start = clip.startTime || 0;
    const vis = audioClipDuration(clip);
    const end = start + vis;
    if (t < start || t >= end || vis <= 0) return 0;
    const g = Math.max(0, Math.min(2, clip.gain != null ? clip.gain : 1));
    let fi = Math.max(0, clip.fadeIn || 0);
    let fo = Math.max(0, clip.fadeOut || 0);
    const maxF = vis / 2;
    if (fi > maxF) fi = maxF;
    if (fo > maxF) fo = maxF;
    let env = 1;
    if (fi > 0 && t < start + fi) env = (t - start) / fi;
    if (fo > 0 && t > end - fo) env = Math.min(env, (end - t) / fo);
    return g * Math.max(0, Math.min(1, env));
  }

  /**
   * Voice/video activity intervals → ducking gain envelope over time.
   * intervals: [{start, end}, ...]
   * Returns array of {t, g} where g is multiplier 0..1 applied to music (1 = full, amount = ducked).
   */
  function computeDuckingEnvelope(intervals, opts, duration) {
    const amountDb = opts && opts.amountDb != null ? opts.amountDb : -12;
    const attackMs = opts && opts.attackMs != null ? opts.attackMs : 150;
    const releaseMs = opts && opts.releaseMs != null ? opts.releaseMs : 400;
    const attack = Math.max(0.001, attackMs / 1000);
    const release = Math.max(0.001, releaseMs / 1000);
    const duckGain = Math.pow(10, amountDb / 20); // e.g. -12 dB → ~0.25
    const dur = duration != null ? duration : 3600;

    // Merge overlapping intervals
    const sorted = (intervals || []).slice().filter(function (iv) {
      return iv && iv.end > iv.start;
    }).sort(function (a, b) { return a.start - b.start; });
    const merged = [];
    for (let i = 0; i < sorted.length; i++) {
      const iv = sorted[i];
      if (!merged.length || iv.start > merged[merged.length - 1].end) {
        merged.push({ start: iv.start, end: iv.end });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
      }
    }

    // Build piecewise linear envelope: 1 outside, duckGain inside, linear attack/release
    const pts = [{ t: 0, g: 1 }];
    for (let i = 0; i < merged.length; i++) {
      const iv = merged[i];
      const a0 = Math.max(0, iv.start - attack);
      const a1 = iv.start;
      const r0 = iv.end;
      const r1 = Math.min(dur, iv.end + release);
      // approach attack
      if (a0 > pts[pts.length - 1].t) pts.push({ t: a0, g: 1 });
      pts.push({ t: a1, g: duckGain });
      pts.push({ t: r0, g: duckGain });
      pts.push({ t: r1, g: 1 });
    }
    if (pts[pts.length - 1].t < dur) pts.push({ t: dur, g: 1 });
    return pts;
  }

  /** Sample piecewise linear envelope at t. */
  function sampleEnvelope(pts, t) {
    if (!pts || !pts.length) return 1;
    if (t <= pts[0].t) return pts[0].g;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].t) {
        const a = pts[i - 1];
        const b = pts[i];
        const span = b.t - a.t;
        if (span <= 0) return b.g;
        const u = (t - a.t) / span;
        return a.g + (b.g - a.g) * u;
      }
    }
    return pts[pts.length - 1].g;
  }

  /**
   * Activity intervals from voice clips + optional video audio regions.
   * videoClips: if includeVideoAudio, non-muted non-image clips count as activity.
   */
  function collectDuckingIntervals(project) {
    const intervals = [];
    const audio = (project && project.audioClips) || [];
    for (let i = 0; i < audio.length; i++) {
      const c = audio[i];
      if (!c || c.muted || c.kind !== 'voice') continue;
      const d = audioClipDuration(c);
      if (d > 0) intervals.push({ start: c.startTime || 0, end: (c.startTime || 0) + d });
    }
    const duck = (project && project.ducking) || (project && project.duckingSettings) || {};
    if (duck.includeVideoAudio !== false) {
      const vclips = (project && (project.clips || project.videoClips)) || [];
      for (let i = 0; i < vclips.length; i++) {
        const c = vclips[i];
        if (!c || c.isImage || c.muted) continue;
        const start = c.startTime || 0;
        const end = typeof clipEnd === 'function' ? clipEnd(c) : start + Math.max(0, (c.trimEnd || 0) - (c.trimStart || 0)) / ((c.speed && c.speed > 0) ? c.speed : 1);
        if (end > start) intervals.push({ start: start, end: end });
      }
    }
    return intervals;
  }

  /**
   * THE single recipe. Returns list of active sources with gain curve points.
   * Each entry: { id, kind, fileId, track, startTime, trimStart, trimEnd, curve: [{t,g}], gainAt(t) }
   */
  function buildMixPlan(project) {
    const plan = [];
    const audio = (project && project.audioClips) || [];
    const duckOpts = (project && (project.ducking || project.duckingSettings)) || DEFAULT_DUCKING;
    let duckEnv = null;
    if (duckOpts.enabled) {
      const intervals = collectDuckingIntervals(project);
      const dur = typeof project.duration === 'number' ? project.duration : 3600;
      duckEnv = computeDuckingEnvelope(intervals, duckOpts, dur);
    }

    for (let i = 0; i < audio.length; i++) {
      const c = audio[i];
      if (!c || c.muted) continue;
      const vis = audioClipDuration(c);
      if (vis <= 0) continue;
      const start = c.startTime || 0;
      const end = start + vis;
      // Sample key points: start, fadeIn end, fadeOut start, end, plus duck changes
      const keyTs = [start, end];
      const fi = Math.max(0, c.fadeIn || 0);
      const fo = Math.max(0, c.fadeOut || 0);
      if (fi > 0) keyTs.push(start + fi);
      if (fo > 0) keyTs.push(end - fo);
      if (duckEnv && c.duck !== false && c.kind === 'music') {
        for (let k = 0; k < duckEnv.length; k++) {
          const tt = duckEnv[k].t;
          if (tt > start && tt < end) keyTs.push(tt);
        }
      }
      keyTs.sort(function (a, b) { return a - b; });
      const uniq = [];
      for (let k = 0; k < keyTs.length; k++) {
        if (!uniq.length || Math.abs(keyTs[k] - uniq[uniq.length - 1]) > 1e-6) uniq.push(keyTs[k]);
      }
      const curve = [];
      for (let k = 0; k < uniq.length; k++) {
        const t = uniq[k];
        let g = sampleClipGain(c, t);
        if (duckEnv && c.duck !== false && (c.kind === 'music' || c.duck === true)) {
          g *= sampleEnvelope(duckEnv, t);
        }
        curve.push({ t: t, g: g });
      }
      plan.push({
        id: c.id,
        kind: c.kind || 'music',
        fileId: c.fileId,
        track: c.track != null ? c.track : 0,
        startTime: start,
        trimStart: c.trimStart || 0,
        trimEnd: c.trimEnd || 0,
        curve: curve,
        // bound sampler for tests / export
        _clip: c,
        _duckEnv: duckEnv,
      });
    }
    return plan;
  }

  /** Gain of a plan entry at timeline time t (for A/B preview=export tests). */
  function gainAtFromPlanEntry(entry, t) {
    if (!entry) return 0;
    if (entry._clip) {
      let g = sampleClipGain(entry._clip, t);
      if (entry._duckEnv && entry._clip.duck !== false && (entry._clip.kind === 'music' || entry._clip.duck === true)) {
        g *= sampleEnvelope(entry._duckEnv, t);
      }
      return g;
    }
    return sampleEnvelope(entry.curve, t);
  }

  function isClipping(peak, gain) {
    const p = peak != null ? peak : 0;
    const g = gain != null ? gain : 1;
    return p * g > 1.0 + 1e-9;
  }

  function computeNormalizeGain(rmsDb, peakDb, targetRmsDb) {
    const target = targetRmsDb != null ? targetRmsDb : -16;
    if (rmsDb == null || !isFinite(rmsDb)) return 1;
    let gainDb = target - rmsDb;
    let gain = Math.pow(10, gainDb / 20);
    if (peakDb != null && isFinite(peakDb)) {
      const peakAfter = peakDb + gainDb;
      if (peakAfter > -1) {
        gainDb = -1 - peakDb;
        gain = Math.pow(10, gainDb / 20);
      }
    }
    return Math.max(0.01, Math.min(2, gain));
  }

  function computePeaks(float32, sampleRate, peaksPerSec) {
    const pps = peaksPerSec || 100;
    if (!float32 || !float32.length || !sampleRate) return [];
    const samplesPerPeak = Math.max(1, Math.floor(sampleRate / pps));
    const n = Math.ceil(float32.length / samplesPerPeak);
    const peaks = new Array(n);
    for (let i = 0; i < n; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, float32.length);
      let min = 1, max = -1;
      for (let j = start; j < end; j++) {
        const v = float32[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[i] = { min: min, max: max };
    }
    return peaks;
  }

  /** RMS and peak in dBFS from Float32 channel (or peaks approximation). */
  function computeRmsPeakDb(float32) {
    if (!float32 || !float32.length) return { rmsDb: -Infinity, peakDb: -Infinity };
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < float32.length; i++) {
      const v = float32[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / float32.length);
    return {
      rmsDb: rms > 1e-12 ? 20 * Math.log10(rms) : -120,
      peakDb: peak > 1e-12 ? 20 * Math.log10(peak) : -120,
    };
  }

  function crossfadeGains(progress) {
    const p = Math.max(0, Math.min(1, progress));
    return {
      out: Math.cos(p * Math.PI / 2),
      in: Math.sin(p * Math.PI / 2),
    };
  }

  /** Resolve overlap on an audio track (same logic spirit as video resolveVideoStartTimeOnTrack). */
  function resolveAudioStartTimeOnTrack(clips, track, excludeId, desiredStart, duration) {
    let start = Math.max(0, desiredStart);
    const others = (clips || []).filter(function (c) {
      return c && c.id !== excludeId && (c.track != null ? c.track : 0) === track;
    }).sort(function (a, b) { return (a.startTime || 0) - (b.startTime || 0); });
    // simple: if overlaps, push after the overlapping clip
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        const oStart = o.startTime || 0;
        const oEnd = audioClipEnd(o);
        const myEnd = start + duration;
        if (start < oEnd && myEnd > oStart) {
          start = oEnd;
          changed = true;
        }
      }
    }
    return Math.max(0, start);
  }

  function makeAudioClipId() {
    return 'ac_' + Math.random().toString(36).slice(2, 10);
  }

  const api = {
    DEFAULT_DUCKING: DEFAULT_DUCKING,
    MASTER_LIMITER: MASTER_LIMITER,
    musicToAudioClip: musicToAudioClip,
    migrateMusicToAudioClips: migrateMusicToAudioClips,
    countFileRefs: countFileRefs,
    audioClipDuration: audioClipDuration,
    audioClipEnd: audioClipEnd,
    sampleClipGain: sampleClipGain,
    computeDuckingEnvelope: computeDuckingEnvelope,
    sampleEnvelope: sampleEnvelope,
    collectDuckingIntervals: collectDuckingIntervals,
    buildMixPlan: buildMixPlan,
    gainAtFromPlanEntry: gainAtFromPlanEntry,
    isClipping: isClipping,
    computeNormalizeGain: computeNormalizeGain,
    computePeaks: computePeaks,
    computeRmsPeakDb: computeRmsPeakDb,
    crossfadeGains: crossfadeGains,
    resolveAudioStartTimeOnTrack: resolveAudioStartTimeOnTrack,
    makeAudioClipId: makeAudioClipId,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.EMRAudioLogic = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);

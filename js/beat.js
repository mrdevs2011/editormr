    // ===================== RITM / BEAT (Faza 3F) — sof mantiq =====================

    /**
     * onset: qisqa oynalarda energiya farqi.
     * samples: Float32Array yoki number[] (mono)
     * sampleRate: Hz
     * Qaytaradi: onsetTimesSec[] (eng kuchli onset'lar)
     */
    function detectOnsets(samples, sampleRate, opts) {
      opts = opts || {};
      if (!samples || !samples.length || !(sampleRate > 0)) return [];
      const hop = opts.hop != null ? opts.hop : Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms
      const win = opts.win != null ? opts.win : hop * 2;
      const energies = [];
      for (let i = 0; i + win < samples.length; i += hop) {
        let e = 0;
        for (let j = 0; j < win; j++) {
          const v = samples[i + j] || 0;
          e += v * v;
        }
        energies.push(e / win);
      }
      if (energies.length < 3) return [];

      // Spectral flux o'xshash: musbat farq
      const flux = [0];
      for (let i = 1; i < energies.length; i++) {
        flux.push(Math.max(0, energies[i] - energies[i - 1]));
      }

      // Adaptiv threshold: o'rtacha + k * std
      let mean = 0;
      for (const v of flux) mean += v;
      mean /= flux.length;
      let varr = 0;
      for (const v of flux) varr += (v - mean) * (v - mean);
      varr /= flux.length;
      const std = Math.sqrt(varr);
      const k = opts.k != null ? opts.k : 1.5;
      const thr = mean + k * std;

      const times = [];
      let last = -1e9;
      const minGap = opts.minGapSec != null ? opts.minGapSec : 0.12;
      for (let i = 1; i < flux.length - 1; i++) {
        if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
          const t = (i * hop) / sampleRate;
          if (t - last >= minGap) {
            times.push(t);
            last = t;
          }
        }
      }
      return times;
    }

    /**
     * BPM taxmini: onset intervallari yoki energiya autokorrelyatsiya.
     * onsets: number[] soniya
     * yoki samples+sampleRate berilsa — oddiy energiya akf.
     * Qaytaradi: { bpm, confidence }
     */
    function estimateBpm(onsetsOrSamples, sampleRate, opts) {
      opts = opts || {};
      // Onset massivi bo'lsa
      if (Array.isArray(onsetsOrSamples) && (sampleRate == null || typeof onsetsOrSamples[0] === 'number' && onsetsOrSamples.length < 100000)) {
        const onsets = onsetsOrSamples.filter((t) => typeof t === 'number' && isFinite(t)).sort((a, b) => a - b);
        if (onsets.length < 4) return { bpm: 0, confidence: 0 };
        const intervals = [];
        for (let i = 1; i < onsets.length; i++) {
          const d = onsets[i] - onsets[i - 1];
          if (d > 0.2 && d < 2.0) intervals.push(d); // 30–300 BPM oralig'i
        }
        if (!intervals.length) return { bpm: 0, confidence: 0 };
        // Histogram 0.01s bins
        const bins = new Map();
        for (const d of intervals) {
          const k = Math.round(d * 100);
          bins.set(k, (bins.get(k) || 0) + 1);
        }
        let bestK = 0, bestC = 0;
        for (const [k, c] of bins) {
          if (c > bestC) { bestC = c; bestK = k; }
        }
        const period = bestK / 100;
        const bpm = period > 0 ? 60 / period : 0;
        // 70–180 normalizatsiya (double/half time)
        let b = bpm;
        while (b < 70 && b > 0) b *= 2;
        while (b > 180) b /= 2;
        return { bpm: Math.round(b), confidence: bestC / intervals.length };
      }

      // Sample-based oddiy akf (qisqa)
      const samples = onsetsOrSamples;
      if (!samples || !samples.length || !(sampleRate > 0)) return { bpm: 0, confidence: 0 };
      const hop = Math.max(1, Math.floor(sampleRate * 0.01));
      const energies = [];
      const win = hop;
      for (let i = 0; i + win < Math.min(samples.length, sampleRate * 30); i += hop) {
        let e = 0;
        for (let j = 0; j < win; j++) {
          const v = samples[i + j] || 0;
          e += v * v;
        }
        energies.push(e);
      }
      if (energies.length < 50) return { bpm: 0, confidence: 0 };

      // Min/max lag: 60–180 BPM → period 1.0–0.333 s → lag frames
      const minLag = Math.floor(0.33 / 0.01);
      const maxLag = Math.floor(1.0 / 0.01);
      let bestLag = minLag, bestScore = -1;
      for (let lag = minLag; lag <= maxLag && lag < energies.length; lag++) {
        let s = 0, n = 0;
        for (let i = 0; i + lag < energies.length; i++) {
          s += energies[i] * energies[i + lag];
          n++;
        }
        const score = n ? s / n : 0;
        if (score > bestScore) { bestScore = score; bestLag = lag; }
      }
      const period = bestLag * 0.01;
      let bpm = period > 0 ? 60 / period : 0;
      while (bpm < 70 && bpm > 0) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      return { bpm: Math.round(bpm), confidence: bestScore > 0 ? 0.5 : 0 };
    }

    /**
     * Beat setka: bpm + offset dan marker vaqtlari.
     */
    function buildBeatGrid(bpm, durationSec, offsetSec) {
      if (!(bpm > 0) || !(durationSec > 0)) return [];
      const period = 60 / bpm;
      const off = offsetSec || 0;
      const out = [];
      // Birinchi beat >= 0
      let t = off;
      while (t < 0) t += period;
      while (t <= durationSec + 1e-6) {
        out.push(Math.round(t * 1000) / 1000);
        t += period;
      }
      return out;
    }

    /**
     * Asosiy qator kesish nuqtalarini eng yaqin beat'ga surish.
     * cuts: clip chegaralari [{clipId, edge: 'start'|'end', time}]
     * beats: number[]
     * maxDeltaSec: chegara
     * Qaytaradi: { moved: number, skipped: number, adjustments: [{clipId, edge, from, to}] }
     */
    function snapCutsToBeats(cuts, beats, maxDeltaSec) {
      maxDeltaSec = maxDeltaSec != null ? maxDeltaSec : 0.15;
      if (!cuts || !cuts.length || !beats || !beats.length) {
        return { moved: 0, skipped: cuts ? cuts.length : 0, adjustments: [] };
      }
      const adjustments = [];
      let moved = 0, skipped = 0;
      for (const c of cuts) {
        let best = null, bestAbs = Infinity;
        for (const b of beats) {
          const a = Math.abs(b - c.time);
          if (a < bestAbs) { bestAbs = a; best = b; }
        }
        if (best != null && bestAbs <= maxDeltaSec) {
          adjustments.push({ clipId: c.clipId, edge: c.edge, from: c.time, to: best });
          moved++;
        } else {
          skipped++;
        }
      }
      return { moved, skipped, adjustments };
    }

    // ===================== JIM JOY ANIQLASH (Faza 3E) — sof mantiq =====================

    /**
     * envelope: number[] — 20ms oynalarda RMS dB (manfiy, masalan -60..0)
     * opts: { thresholdDb, minSilenceSec, paddingSec, hopSec? }
     * Qaytaradi: [{ startSec, endSec }] — jim bo'laklar (padding qo'llangan)
     */
    function detectSilence(envelope, opts) {
      opts = opts || {};
      const thresholdDb = opts.thresholdDb != null ? opts.thresholdDb : -35;
      const minSilenceSec = opts.minSilenceSec != null ? opts.minSilenceSec : 0.4;
      const paddingSec = opts.paddingSec != null ? opts.paddingSec : 0.1;
      const hopSec = opts.hopSec != null ? opts.hopSec : 0.02; // 20 ms

      if (!envelope || !envelope.length) return [];

      const minFrames = Math.max(1, Math.ceil(minSilenceSec / hopSec));
      const padFrames = Math.max(0, Math.round(paddingSec / hopSec));

      const regions = [];
      let i = 0;
      const n = envelope.length;
      while (i < n) {
        // jimlik boshi
        while (i < n && envelope[i] > thresholdDb) i++;
        if (i >= n) break;
        const start = i;
        while (i < n && envelope[i] <= thresholdDb) i++;
        const end = i; // exclusive
        if (end - start >= minFrames) {
          // padding: jimlik ichidan chetga qisqartirish (saqlab qolish)
          let a = start + padFrames;
          let b = end - padFrames;
          if (b > a) {
            regions.push({
              startSec: a * hopSec,
              endSec: b * hopSec,
            });
          }
        }
      }
      return regions;
    }

    /**
     * Envelope past foizidan threshold taxmin (Avto).
     * default: 15-percentile + kichik margin.
     */
    function estimateSilenceThreshold(envelope, percentile) {
      if (!envelope || !envelope.length) return -35;
      const p = percentile != null ? percentile : 0.15;
      const sorted = envelope.slice().filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
      if (!sorted.length) return -35;
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)));
      const base = sorted[idx];
      // Biroz yuqoriroq — shovqin ostidagi gaplarni ushlash
      return Math.min(-20, base + 3);
    }

    /**
     * cuts: [{startSec, endSec}] — manba (trim oralig'idagi) vaqt
     * clips: video clip massivi (asosiy qator yoki tanlangan)
     * clipId: qaysi clipga tegishli (bitta clip uchun)
     * speed/trim hisobga olinadi: startSec manba vaqti.
     *
     * Qaytaradi yangi clip massivi (split + o'chirish natijasi), asl o'zgarmaydi.
     * Mavjud split/ripple mantig'iga o'xshash: jim joy o'chiriladi, qolganlar ketma-ket.
     */
    function applyCutsToClips(clips, cuts, clipId) {
      if (!clips || !clips.length || !cuts || !cuts.length) {
        return clips ? clips.map((c) => ({ ...c })) : [];
      }
      const out = [];
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        if (clipId && c.id !== clipId) {
          out.push({ ...c });
          continue;
        }
        // Manba oralig'i [trimStart, trimEnd]
        const t0 = c.trimStart || 0;
        const t1 = c.trimEnd != null ? c.trimEnd : (c.duration || t0 + 1);
        const speed = (c.speed && c.speed > 0) ? c.speed : 1;

        // cuts manba vaqtida; faqat shu oraliqdagi
        const localCuts = cuts
          .map((k) => ({
            startSec: Math.max(t0, k.startSec),
            endSec: Math.min(t1, k.endSec),
          }))
          .filter((k) => k.endSec - k.startSec > 1e-4)
          .sort((a, b) => a.startSec - b.startSec);

        if (!localCuts.length) {
          out.push({ ...c });
          continue;
        }

        // Qolgan segmentlar
        const segs = [];
        let cursor = t0;
        for (const k of localCuts) {
          if (k.startSec > cursor + 1e-4) {
            segs.push({ trimStart: cursor, trimEnd: k.startSec });
          }
          cursor = Math.max(cursor, k.endSec);
        }
        if (t1 > cursor + 1e-4) {
          segs.push({ trimStart: cursor, trimEnd: t1 });
        }

        if (!segs.length) continue; // hammasi jim — clip yo'qoladi

        // Timeline boshlanishi: asl startTime, keyin ripple (ketma-ket)
        let tl = c.startTime;
        for (let s = 0; s < segs.length; s++) {
          const seg = segs[s];
          const durSrc = seg.trimEnd - seg.trimStart;
          const durTl = durSrc / speed;
          const nc = {
            ...c,
            id: s === 0 ? c.id : (c.id + '_s' + s + '_' + Math.random().toString(36).slice(2, 7)),
            trimStart: seg.trimStart,
            trimEnd: seg.trimEnd,
            startTime: tl,
          };
          // transition faqat oxirgi bo'lakda saqlansin (soddalashtirish)
          if (s < segs.length - 1) {
            nc.transitionType = 'none';
            nc.transitionDuration = 0;
          }
          out.push(nc);
          tl += durTl;
        }
      }
      // Asosiy qatorda ketma-ket joylash (ripple): startTime qayta hisoblash track=0 uchun
      const main = out.filter((c) => (c.track == null || c.track === 0) && !c.floated);
      const other = out.filter((c) => !main.includes(c));
      main.sort((a, b) => a.startTime - b.startTime);
      let cursor = 0;
      for (const c of main) {
        c.startTime = cursor;
        const speed = (c.speed && c.speed > 0) ? c.speed : 1;
        const dur = (c.trimEnd - c.trimStart) / speed;
        cursor += dur;
      }
      return main.concat(other);
    }

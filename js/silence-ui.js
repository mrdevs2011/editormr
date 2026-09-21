    // ===================== JIM JOY UI (Faza 3E) =====================
    const _envelopeCache = new Map(); // key: fileId|trimStart|trimEnd -> Float32 dB array

    async function buildEnvelopeForClip(clip, onProgress) {
      if (!clip || clip.isImage || clip.muted) {
        throw new Error(typeof S === 'function' ? S('silence.noAudio') : 'Audio yo‘q');
      }
      const key = (clip.fileId || clip.id) + '|' + (clip.trimStart || 0) + '|' + (clip.trimEnd || 0);
      if (_envelopeCache.has(key)) return _envelopeCache.get(key);

      const file = clip.file;
      if (!file) throw new Error('Fayl topilmadi');

      const buf = await file.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let audioBuf;
      try {
        audioBuf = await ctx.decodeAudioData(buf.slice(0));
      } finally {
        try { await ctx.close(); } catch (_) {}
      }
      const sr = audioBuf.sampleRate;
      const ch = audioBuf.getChannelData(0);
      const t0 = Math.max(0, Math.floor((clip.trimStart || 0) * sr));
      const t1 = Math.min(ch.length, Math.floor((clip.trimEnd != null ? clip.trimEnd : audioBuf.duration) * sr));
      const hop = Math.max(1, Math.floor(sr * 0.02)); // 20ms
      const envelope = [];
      const total = Math.max(1, Math.floor((t1 - t0) / hop));
      for (let i = t0, n = 0; i + hop < t1; i += hop, n++) {
        let sum = 0;
        for (let j = 0; j < hop; j++) {
          const v = ch[i + j] || 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / hop);
        const db = rms > 1e-12 ? 20 * Math.log10(rms) : -100;
        envelope.push(db);
        if (onProgress && n % 50 === 0) {
          onProgress(n / total);
          await new Promise((r) => setTimeout(r, 0)); // UI gap
        }
      }
      // audioBuf bo'shatish
      audioBuf = null;
      _envelopeCache.set(key, envelope);
      return envelope;
    }

    function openSilenceDialog() {
      const clips = state.videoClips.filter((c) => typeof isSelected === 'function' && isSelected(c.id));
      const clip = clips[0] || (typeof findClipAtTime === 'function' ? findClipAtTime(state.currentTime) : null);
      if (!clip) {
        if (typeof showToast === 'function') showToast('Clip tanlang');
        return;
      }
      let modal = document.getElementById('silence-modal');
      if (modal) modal.remove();
      modal = document.createElement('div');
      modal.id = 'silence-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px;';
      const box = document.createElement('div');
      box.style.cssText = 'background:#1e1e24;color:#e5e7eb;border-radius:12px;max-width:400px;width:100%;padding:20px;font:14px system-ui,sans-serif;';
      box.innerHTML =
        '<h2 style="margin:0 0 12px;">' + (typeof S === 'function' ? S('silence.title') : 'Jim joylarni kesish') + '</h2>' +
        '<label>Chegara (dB) <input type="range" id="sil-thr" min="-60" max="-10" value="-35"/><span id="sil-thr-v">-35</span></label><br/><br/>' +
        '<label>Min. jimlik (s) <input type="range" id="sil-min" min="0.2" max="1.5" step="0.1" value="0.4"/><span id="sil-min-v">0.4</span></label><br/><br/>' +
        '<label>Chet (s) <input type="range" id="sil-pad" min="0" max="0.3" step="0.05" value="0.1"/><span id="sil-pad-v">0.1</span></label><br/><br/>' +
        '<div id="sil-status" style="min-height:24px;opacity:0.8;"></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
        '<button id="sil-auto" class="insp-btn">Avto</button>' +
        '<button id="sil-analyze" class="insp-btn">Tahlil</button>' +
        '<button id="sil-apply" class="insp-btn" disabled>Qo‘llash</button>' +
        '<button id="sil-close" class="insp-btn">Bekor</button></div>';
      modal.appendChild(box);
      document.body.appendChild(modal);

      let lastCuts = [];
      let lastEnv = null;

      const thr = () => Number(document.getElementById('sil-thr').value);
      const minS = () => Number(document.getElementById('sil-min').value);
      const pad = () => Number(document.getElementById('sil-pad').value);

      ['sil-thr', 'sil-min', 'sil-pad'].forEach((id) => {
        document.getElementById(id).addEventListener('input', (e) => {
          document.getElementById(id + '-v').textContent = e.target.value;
        });
      });

      document.getElementById('sil-close').onclick = () => modal.remove();
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

      document.getElementById('sil-analyze').onclick = async () => {
        const st = document.getElementById('sil-status');
        st.textContent = 'Tahlil…';
        try {
          const dur = (clip.trimEnd - clip.trimStart) || 0;
          if (dur > 15 * 60) st.textContent = typeof S === 'function' ? S('silence.longWarn') : 'Uzun fayl…';
          lastEnv = await buildEnvelopeForClip(clip, (p) => {
            st.textContent = 'Tahlil ' + Math.round(p * 100) + '%';
          });
          lastCuts = detectSilence(lastEnv, { thresholdDb: thr(), minSilenceSec: minS(), paddingSec: pad() });
          const saved = lastCuts.reduce((a, c) => a + (c.endSec - c.startSec), 0);
          st.textContent = (typeof S === 'function' ? S('silence.result', { n: lastCuts.length, x: saved.toFixed(1) }) : (lastCuts.length + ' ta, ' + saved.toFixed(1) + 's'));
          document.getElementById('sil-apply').disabled = !lastCuts.length;
          // Timeline qizil belgilar (vaqtinchalik)
          if (typeof showSilencePreview === 'function') showSilencePreview(clip, lastCuts);
        } catch (err) {
          st.textContent = err.message || String(err);
        }
      };

      document.getElementById('sil-auto').onclick = async () => {
        const st = document.getElementById('sil-status');
        try {
          if (!lastEnv) lastEnv = await buildEnvelopeForClip(clip);
          const t = estimateSilenceThreshold(lastEnv);
          document.getElementById('sil-thr').value = Math.round(t);
          document.getElementById('sil-thr-v').textContent = Math.round(t);
          st.textContent = 'Avto threshold: ' + Math.round(t) + ' dB';
        } catch (err) {
          st.textContent = err.message || String(err);
        }
      };

      document.getElementById('sil-apply').onclick = () => {
        if (!lastCuts.length) return;
        const apply = () => {
          const next = applyCutsToClips(state.videoClips, lastCuts, clip.id);
          state.videoClips = next;
          if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
          if (typeof renderVideoBlock === 'function') renderVideoBlock();
          if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
          if (typeof scheduleSave === 'function') scheduleSave();
          if (typeof showToast === 'function') showToast('Jim joylar kesildi');
        };
        if (typeof runAsSingleUndo === 'function') runAsSingleUndo(apply);
        else {
          if (typeof pushHistory === 'function') pushHistory();
          apply();
        }
        modal.remove();
      };
    }

    function showSilencePreview(clip, cuts) {
      // oddiy: marker sifatida vaqtinchalik ko'rsatish mumkin — skip heavy
    }

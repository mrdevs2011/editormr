    // Avto-subtitr beta. Audio qurilmada qayta ishlanadi.
    // Kutubxona: @xenova/transformers 2.17.2 (jsdelivr ESM). Sinalmagan, API hujjatiga tayangan.

    function captionsWorkerSrc() {
      return URL.createObjectURL(new Blob([
        "import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';\n" +
        "env.allowLocalModels = false;\n" +
        "self.onmessage = async (e) => {\n" +
        "  const d = e.data || {};\n" +
        "  try {\n" +
        "    self.postMessage({ type: 'status', msg: 'model' });\n" +
        "    const asr = await pipeline('automatic-speech-recognition', d.model || 'Xenova/whisper-base');\n" +
        "    self.postMessage({ type: 'status', msg: 'run' });\n" +
        "    const out = await asr(d.audio, { return_timestamps: 'word', language: d.lang === 'avto' ? null : d.lang, chunk_length_s: 30 });\n" +
        "    self.postMessage({ type: 'done', out });\n" +
        "  } catch (err) {\n" +
        "    self.postMessage({ type: 'error', message: String(err && err.message || err) });\n" +
        "  }\n" +
        "};\n"
      ], { type: 'text/javascript' }));
    }

    async function clipAudioToMono16k(clip) {
      const url = clip.url || state.videoUrl;
      if (!url) throw new Error('Audio manba yo\'q');
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      const trim0 = clip.trimStart || 0;
      const trim1 = clip.trimEnd != null ? clip.trimEnd : decoded.duration;
      const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      const dur = Math.max(0.05, (trim1 - trim0) / speed);
      if (dur > 30 * 60) throw new Error('30 daqiqadan uzun — bo\'laklarga bo\'ling');
      const off = new OfflineAudioContext(1, Math.ceil(dur * 16000), 16000);
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = speed;
      src.connect(off.destination);
      src.start(0, trim0, trim1 - trim0);
      const rendered = await off.startRendering();
      try { ctx.close(); } catch (_) {}
      return rendered.getChannelData(0);
    }

    async function startAutoCaptions() {
      if (!captionsBetaEnabled()) {
        showToast('Beta flag yo\'q (?captions=beta)');
        return;
      }
      const clips = (state.videoClips || []).filter(function (c) { return !c.isImage && !c.muted; });
      if (!clips.length) {
        showToast('Audiosi bor clip yo\'q');
        return;
      }
      showToast('Avto-subtitr: model yuklanishi sinalmagan');
      const model = 'Xenova/whisper-base';
      const lang = prompt('Til: uz / ru / en / avto', 'uz') || 'avto';
      let worker;
      try {
        const src = captionsWorkerSrc();
        worker = new Worker(src, { type: 'module' });
      } catch (e) {
        showToast('Worker ochilmadi: ' + (e.message || e));
        return;
      }
      const allWords = [];
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        let pcm;
        try { pcm = await clipAudioToMono16k(clip); }
        catch (e) { showToast(e.message || 'audio'); continue; }
        const out = await new Promise(function (resolve, reject) {
          worker.onmessage = function (ev) {
            if (ev.data.type === 'done') resolve(ev.data.out);
            if (ev.data.type === 'error') reject(new Error(ev.data.message));
            if (ev.data.type === 'status') console.info('[captions]', ev.data.msg);
          };
          worker.onerror = function (err) { reject(err); };
          worker.postMessage({ audio: pcm, model: model, lang: lang });
        });
        const chunks = (out && (out.chunks || out.words)) || [];
        chunks.forEach(function (w) {
          const srcT0 = (w.timestamp && w.timestamp[0]) || w.t0 || 0;
          const srcT1 = (w.timestamp && w.timestamp[1]) || w.t1 || srcT0 + 0.2;
          const speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
          allWords.push({
            w: w.text || w.word || '',
            t0: clip.startTime + (srcT0) / speed,
            t1: clip.startTime + (srcT1) / speed
          });
        });
      }
      try { worker.terminate(); } catch (_) {}
      const grouped = TextCore.groupWordsIntoCues(allWords, { maxCharsPerLine: 32, maxLines: 2, maxDurSec: 4, pauseSplitSec: 0.4 });
      if (!grouped.length) { showToast('Natija bo\'sh'); return; }
      const sub = ensureSubtitlesState();
      if (sub.cues.length && !confirm('Mavjud subtitrlar o\'rniga yozilsinmi?')) {
        pushHistory();
        sub.cues = sub.cues.concat(grouped);
      } else {
        pushHistory();
        sub.cues = grouped;
      }
      renderSubtitleLane();
      scheduleSave();
      showToast((typeof EMR_STRINGS !== 'undefined' ? EMR_STRINGS.CAPTION_QUALITY_NOTE : 'Tekshiring'));
      if (typeof refreshSubList === 'function') refreshSubList();
    }

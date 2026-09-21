    // ===================== EXPORT (real timeline render) =====================

    // B7 yamog'i + Faza 1: beforeunload va Wake Lock saqlanadi.
    // Bekor qilish / xato / tugash — hammasi finally da lockni bo'shatadi.
    function exportBeforeUnloadGuard(e) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    let _exportWakeLock = null;
    let _exportSession = null;

    function newExportSession() {
      return { aborted: false, pathUsed: null, resources: [] };
    }

    function currentForcedExportPath() {
      try {
        return ExportCore.parseForcedPath(window.location.search || '');
      } catch (_) {
        return null;
      }
    }

    function logExportPath(path, extra) {
      console.info('[export] yo\'l:', path, extra || '', 'forced=', currentForcedExportPath());
    }

    async function acquireExportGuards() {
      window.addEventListener('beforeunload', exportBeforeUnloadGuard);
      if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
        try {
          _exportWakeLock = await navigator.wakeLock.request('screen');
        } catch (_) {
          _exportWakeLock = null;
        }
      }
    }

    async function releaseExportGuards() {
      window.removeEventListener('beforeunload', exportBeforeUnloadGuard);
      if (_exportWakeLock) {
        try { await _exportWakeLock.release(); } catch (_) {}
        _exportWakeLock = null;
      }
    }

    function readExportSettingsFromUi() {
      const overlay = document.getElementById('export-ui-modal');
      const q = overlay && overlay.querySelector('input[name="emr-exp-q"]:checked');
      const b = overlay && overlay.querySelector('input[name="emr-exp-b"]:checked');
      const fps60 = overlay && overlay.querySelector('#emr-exp-fps60');
      return ExportCore.saveSettings({
        quality: q ? q.value : undefined,
        bitrate: b ? b.value : undefined,
        fps: fps60 && fps60.checked ? 60 : 30
      });
    }

    exportBtn.addEventListener('click', () => {
      if (!state.videoClips || !state.videoClips.length) {
        showToast('Export qilish uchun video/rasm qo\'shing');
        return;
      }
      if (state.isExporting) return;
      showExportSetupModal();
    });

    window.addEventListener('pagehide', () => {
      if (state.isExporting && _exportSession) _exportSession.aborted = true;
    });
    document.addEventListener('visibilitychange', () => {
      // Fondagi tab live yo'lda kadr tashlashi mumkin — resursni yopmaymiz,
      // faqat bekor flag qo'yilgan bo'lsa tozalash tick/fast loopda bo'ladi.
      if (document.visibilityState === 'hidden' && state.isExporting) {
        console.info('[export] tab fon rejimida, sessiya davom etadi');
      }
    });

    async function beginExport(wantFast) {
      if (state.isExporting) return;
      const settings = readExportSettingsFromUi();
      state.isExporting = true;
      _exportSession = newExportSession();
      showExportProgressModal(0, { running: true });

      await acquireExportGuards();
      try {
        const forced = currentForcedExportPath();
        const start = ExportCore.defaultStartPath(forced, wantFast);
        const chain = ExportCore.fallbackChain(start);
        let lastErr = null;
        let result = null;
        for (let i = 0; i < chain.length; i++) {
          const path = chain[i];
          if (_exportSession.aborted) throw ExportCore.ExportAbortedError();
          try {
            logExportPath(path, i ? '(fallback)' : '(start)');
            if (path === 'fast') {
              result = await FastExporter.run({
                settings: settings,
                abort: _exportSession,
                useDecoder: /(?:\?|&)export=fast-decoder\b/.test(window.location.search || ''),
                onProgress: (p) => {
                  const eta = ExportCore.estimateRemainingSec(p.ratio, p.elapsedMs);
                  updateExportProgress(Math.round(p.ratio * 100), eta);
                }
              });
            } else {
              result = await exportTimeline({
                preferMp4: path === 'mp4',
                settings: settings,
                abort: _exportSession
              });
            }
            _exportSession.pathUsed = result.path || path;
            lastErr = null;
            break;
          } catch (err) {
            if (ExportCore.isAbortError(err)) throw err;
            lastErr = err;
            console.warn('[export] yo\'l yiqildi:', path, err);
            showToast(path + ' xato: ' + (err && err.message ? err.message : 'noma\'lum') + (i < chain.length - 1 ? ' — keyingi yo\'l' : ''));
          }
        }
        if (!result) throw lastErr || new Error('Export ishlamadi');

        const blob = result.blob;
        const mime = result.mime || blob.type;
        console.log('Export blob size:', blob.size, 'type:', mime, 'path:', result.path);
        if (blob.size < 500) {
          showToast('Export muvaffaqiyatsiz — qayta urinib ko\'ring');
          closeExportUiModal();
          return;
        }
        const ext = ExportCore.blobExt(mime, result.path === 'legacy' ? 'webm' : 'mp4');
        const baseName = 'edited-' + ((state.videoFile && state.videoFile.name)?.replace(/\.[^.]+$/, '') || state.projectName || 'video') + '.' + ext;
        const mb = (blob.size / (1024 * 1024)).toFixed(1);
        showToast('Export tayyor! (' + mb + ' MB)');
        showExportResultModal(blob, baseName, { mime: mime, path: result.path, videoOnly: result.videoOnly });
      } catch (err) {
        if (ExportCore.isAbortError(err)) {
          showToast('Export bekor qilindi');
          closeExportUiModal();
        } else {
          console.error(err);
          showToast('Export xatosi: ' + (err.message || 'noma\'lum'));
          closeExportUiModal();
        }
      } finally {
        state.isExporting = false;
        _exportSession = null;
        await releaseExportGuards();
      }
    }

    async function exportTimeline(opts) {
      opts = opts || {};
      const abort = opts.abort || { aborted: false };
      const settings = ExportCore.normalizeSettings(opts.settings || ExportCore.loadSettings());
      const preferMp4 = !!opts.preferMp4;

      const videoEnd = videoTimelineEnd();
      const exportDuration = Math.max(videoEnd, 0.5);
      let exportActiveClipId = null;

      const { w: outW, h: outH } = getCanvasOutputSize({ maxSide: ExportCore.maxSide(settings) });

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d', { alpha: false });

      let exportVideoEl = null;
      let exportVideoElB = null;
      let exportVideoElF = null;
      const exportFloatImgCache = new Map();
      function makeExportVideo() {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(v);
        return v;
      }
      exportVideoElF = makeExportVideo();
      if (!state.isImage && state.videoUrl) {
        exportVideoEl = makeExportVideo();
        exportVideoEl.src = state.videoUrl;
        exportVideoElB = makeExportVideo();
        await new Promise((resolve) => {
          if (exportVideoEl.readyState >= 2) return resolve();
          exportVideoEl.onloadeddata = resolve;
          exportVideoEl.onerror = resolve;
          setTimeout(resolve, 5000);
        });
      }

      const pack = {
        live: true,
        videoA: exportVideoEl,
        videoB: exportVideoElB,
        videoF: exportVideoElF,
        imageEl: document.getElementById('image-preview'),
        floatImgCache: exportFloatImgCache,
        onVideoClip: function (clip, t, isTrans) {
          if (!exportVideoAudioEl || !clip || clip.isImage) return;
          const src = clip.url || state.videoUrl;
          if (src && exportVideoAudioEl.src !== src) exportVideoAudioEl.src = src;
          applyMediaVolume(exportVideoAudioEl, clip);
          const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
          exportVideoAudioEl.playbackRate = sp;
          const local = timelineToSource(clip, t);
          if (Math.abs((exportVideoAudioEl.currentTime || 0) - local) > 0.12) {
            try { exportVideoAudioEl.currentTime = local; } catch (_) {}
          }
          if (exportVideoAudioEl.paused) exportVideoAudioEl.play().catch(() => {});
        },
        onGap: function () {
          if (exportVideoEl && videoPlaying) {
            exportVideoEl.pause();
            if (exportVideoElB) exportVideoElB.pause();
            if (exportVideoAudioEl) exportVideoAudioEl.pause();
            videoPlaying = false;
            exportActiveClipId = null;
          }
        }
      };

      let audioCtx = null;
      let exportMusicEl = null;
      let exportVideoAudioEl = null;
      let exportVideoGain = null;
      let exportMusicGain = null;
      const audioTracks = [];
      const needAudio = (!state.isImage && state.videoUrl) || state.music?.url;

      if (needAudio) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const dest = audioCtx.createMediaStreamDestination();

        if (!state.isImage && state.videoUrl) {
          exportVideoAudioEl = document.createElement('video');
          exportVideoAudioEl.src = state.videoUrl;
          exportVideoAudioEl.volume = 1;
          exportVideoAudioEl.muted = false;
          exportVideoAudioEl.playsInline = true;
          exportVideoAudioEl.preload = 'auto';
          exportVideoAudioEl.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;';
          document.body.appendChild(exportVideoAudioEl);
          await new Promise((resolve) => {
            if (exportVideoAudioEl.readyState >= 2) return resolve();
            exportVideoAudioEl.onloadeddata = resolve;
            exportVideoAudioEl.onerror = resolve;
            setTimeout(resolve, 4000);
          });
          try {
            const vSrc = audioCtx.createMediaElementSource(exportVideoAudioEl);
            exportVideoGain = audioCtx.createGain();
            exportVideoGain.gain.value = 1;
            vSrc.connect(exportVideoGain);
            exportVideoGain.connect(dest);
          } catch (e) {
            console.warn('Video audio connect failed', e);
          }
        }

        if (state.music?.url) {
          exportMusicEl = new Audio(state.music.url);
          exportMusicEl.crossOrigin = 'anonymous';
          exportMusicEl.preload = 'auto';
          exportMusicEl.volume = 1;
          exportMusicEl.muted = false;
          await new Promise((resolve) => {
            exportMusicEl.oncanplaythrough = resolve;
            exportMusicEl.onerror = resolve;
            setTimeout(resolve, 4000);
          });
          try {
            const mSrc = audioCtx.createMediaElementSource(exportMusicEl);
            exportMusicGain = audioCtx.createGain();
            exportMusicGain.gain.value = 1;
            mSrc.connect(exportMusicGain);
            exportMusicGain.connect(dest);
          } catch (e) {
            console.warn('Music connect failed', e);
          }
        }

        audioTracks.push(...dest.stream.getAudioTracks());
      }

      const canvasStream = canvas.captureStream(settings.fps);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks
      ]);

      let mimeType = '';
      if (preferMp4) {
        mimeType = ExportCore.pickMp4Mime();
        if (!mimeType) throw new Error('MediaRecorder MP4 qo\'llab-quvvatlanmaydi');
      } else {
        mimeType = ExportCore.pickWebmMime();
      }

      const chunks = [];
      let recorder;
      const recOpts = { mimeType: mimeType, videoBitsPerSecond: ExportCore.videoBitrate(settings) };
      try {
        recorder = new MediaRecorder(combinedStream, recOpts);
      } catch (e) {
        if (preferMp4) throw e;
        recorder = new MediaRecorder(combinedStream);
        mimeType = recorder.mimeType || 'video/webm';
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const recorded = new Promise((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = (e) => reject(e.error || new Error('Recorder error'));
      });

      let videoPlaying = false;
      let musicStarted = false;

      async function cleanupLive() {
        try { if (exportVideoEl) exportVideoEl.pause(); } catch (_) {}
        try { if (exportVideoElB) exportVideoElB.pause(); } catch (_) {}
        try { if (exportVideoAudioEl) exportVideoAudioEl.pause(); } catch (_) {}
        try { if (exportMusicEl) exportMusicEl.pause(); } catch (_) {}
        try { canvasStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        try { audioTracks.forEach(t => t.stop()); } catch (_) {}
        [canvas, exportVideoEl, exportVideoElB, exportVideoElF, exportVideoAudioEl].forEach((el) => {
          try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
        });
        if (exportMusicEl) exportMusicEl.src = '';
        try { if (audioCtx) await audioCtx.close(); } catch (_) {}
      }

      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);
        await new Promise(r => requestAnimationFrame(r));
      }

      recorder.start(200);

      const startPerf = performance.now();

      const firstClip = findClipAtTime(0) || state.videoClips[0];
      if (exportVideoEl && firstClip && firstClip.startTime <= 0.05) {
        const sp0 = (firstClip.speed && firstClip.speed > 0) ? firstClip.speed : 1;
        exportVideoEl.playbackRate = sp0;
        exportVideoEl.currentTime = firstClip.trimStart;
        if (exportVideoAudioEl) {
          applyMediaVolume(exportVideoAudioEl, firstClip);
          exportVideoAudioEl.playbackRate = sp0;
          exportVideoAudioEl.currentTime = firstClip.trimStart;
        }
        await new Promise((r) => {
          const done = () => { exportVideoEl.removeEventListener('seeked', done); r(); };
          exportVideoEl.addEventListener('seeked', done);
          setTimeout(r, 500);
        });
        await exportVideoEl.play().catch(() => {});
        if (exportVideoAudioEl) await exportVideoAudioEl.play().catch(() => {});
        videoPlaying = true;
        exportActiveClipId = firstClip.id;
      }

      try {
        await new Promise((resolveDone, rejectDone) => {
          const tick = () => {
            if (abort.aborted) {
              rejectDone(ExportCore.ExportAbortedError());
              return;
            }
            const elapsed = (performance.now() - startPerf) / 1000;
            if (elapsed >= exportDuration) {
              resolveDone();
              return;
            }

            pack.onVideoClip = function (clip, t) {
              exportActiveClipId = clip && clip.id;
              videoPlaying = true;
              if (!exportVideoAudioEl || !clip || clip.isImage) return;
              const src = clip.url || state.videoUrl;
              if (src && exportVideoAudioEl.src !== src) exportVideoAudioEl.src = src;
              applyMediaVolume(exportVideoAudioEl, clip);
              const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
              exportVideoAudioEl.playbackRate = sp;
              const local = timelineToSource(clip, t);
              if (Math.abs((exportVideoAudioEl.currentTime || 0) - local) > 0.12) {
                try { exportVideoAudioEl.currentTime = local; } catch (_) {}
              }
              if (exportVideoAudioEl.paused) exportVideoAudioEl.play().catch(() => {});
            };

            renderFrame(ctx, elapsed, outW, outH, pack);

            if (exportVideoGain) {
              const vc = findClipAtTime(elapsed);
              if (vc && !vc.isImage) {
                const base = vc.muted ? 0 : (vc.volume != null ? vc.volume : 1);
                const env = typeof getClipOpacity === 'function' ? getClipOpacity(vc, elapsed) : 1;
                exportVideoGain.gain.value = Math.max(0, Math.min(1, base * env));
              } else {
                exportVideoGain.gain.value = 0;
              }
            }
            if (exportMusicGain && state.music) {
              const m = state.music;
              const mStart = m.startTime;
              const mEnd = m.startTime + (m.trimEnd - m.trimStart);
              let env = 1;
              if (elapsed < mStart || elapsed >= mEnd) env = 0;
              else {
                const fi = Math.max(0, m.fadeIn || 0);
                const fo = Math.max(0, m.fadeOut || 0);
                if (fi > 0 && elapsed < mStart + fi) env = (elapsed - mStart) / fi;
                if (fo > 0 && elapsed > mEnd - fo) env = Math.min(env, (mEnd - elapsed) / fo);
                env = Math.max(0, Math.min(1, env));
              }
              const base = m.muted ? 0 : (m.volume != null ? m.volume : 1);
              exportMusicGain.gain.value = Math.max(0, Math.min(1, base * env));
            }

            if (exportMusicEl && state.music) {
              const m = state.music;
              const mEnd = Math.min(m.startTime + (m.trimEnd - m.trimStart), videoEnd);
              if (!musicStarted && elapsed >= m.startTime && elapsed < mEnd) {
                exportMusicEl.volume = 1;
                exportMusicEl.muted = false;
                exportMusicEl.currentTime = m.trimStart + Math.max(0, elapsed - m.startTime);
                exportMusicEl.play().catch(() => {});
                musicStarted = true;
              }
              if (musicStarted && elapsed >= mEnd) {
                exportMusicEl.pause();
              }
            }

            const pct = Math.min(100, Math.round((elapsed / exportDuration) * 100));
            const eta = ExportCore.estimateRemainingSec(elapsed / exportDuration, performance.now() - startPerf);
            updateExportProgress(pct, eta);

            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });

        if (exportVideoEl) exportVideoEl.pause();
        if (exportVideoElB) exportVideoElB.pause();
        if (exportVideoAudioEl) exportVideoAudioEl.pause();
        if (exportMusicEl) exportMusicEl.pause();

        if (recorder.state === 'recording') {
          try { recorder.requestData(); } catch (_) {}
          await new Promise(r => setTimeout(r, 150));
          recorder.stop();
        }
        await recorded;

        const blob = new Blob(chunks, { type: mimeType });
        await cleanupLive();
        return {
          blob: blob,
          mime: mimeType,
          path: ExportCore.isMp4Mime(mimeType) ? 'mp4' : 'legacy'
        };
      } catch (err) {
        try {
          if (recorder && recorder.state === 'recording') recorder.stop();
        } catch (_) {}
        await cleanupLive();
        throw err;
      }
    }



    // ---------- MP4 (ffmpeg.wasm) ----------
    // B15 tuzatish: ilgari ffmpeg.js + @ffmpeg/util index.html'da <script> bilan
    // HAR SAHIFA YUKLANGANDA olinardi (export qilinmasa ham). Endi shu ikkita
    // kutubxona faqat birinchi marta export (MP4) kerak bo'lganda inject qilinadi.
    const FFMPEG_SCRIPTS = [
      'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/umd/index.js',
    ];
    let ffmpegScriptsLoading = null;
    function loadFFmpegScripts() {
      if (window.FFmpegWASM || window.FFmpeg) return Promise.resolve();
      if (ffmpegScriptsLoading) return ffmpegScriptsLoading;
      ffmpegScriptsLoading = (async () => {
        for (const src of FFMPEG_SCRIPTS) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('FFmpeg skripti yuklanmadi: ' + src));
            document.head.appendChild(s);
          });
        }
      })();
      return ffmpegScriptsLoading;
    }

    let ffmpegInstance = null;
    let ffmpegLoading = null;

    async function getFFmpeg() {
      if (ffmpegInstance) return ffmpegInstance;
      if (ffmpegLoading) return ffmpegLoading;
      ffmpegLoading = (async () => {
        await loadFFmpegScripts();
        const FFmpegClass = (window.FFmpegWASM && window.FFmpegWASM.FFmpeg)
          || (window.FFmpeg && window.FFmpeg.FFmpeg)
          || window.FFmpeg;
        if (!FFmpegClass) throw new Error('FFmpeg yuklanmadi (CDN)');
        const util = window.FFmpegUtil || {};
        const toBlobURL = util.toBlobURL;
        const ffmpeg = new FFmpegClass();
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
        if (toBlobURL) {
          await ffmpeg.load({
            coreURL: await toBlobURL(baseURL + '/ffmpeg-core.js', 'text/javascript'),
            wasmURL: await toBlobURL(baseURL + '/ffmpeg-core.wasm', 'application/wasm'),
          });
        } else {
          await ffmpeg.load();
        }
        ffmpegInstance = ffmpeg;
        return ffmpeg;
      })();
      try {
        return await ffmpegLoading;
      } finally {
        ffmpegLoading = null;
      }
    }

    async function transcodeWebmToMp4(webmBlob, onProgress) {
      const ffmpeg = await getFFmpeg();
      const util = window.FFmpegUtil || {};
      const fetchFile = util.fetchFile;
      const inputName = 'input.webm';
      const outputName = 'output.mp4';
      const data = fetchFile
        ? await fetchFile(webmBlob)
        : new Uint8Array(await webmBlob.arrayBuffer());
      await ffmpeg.writeFile(inputName, data);
      if (ffmpeg.on) {
        ffmpeg.on('progress', ({ progress }) => {
          if (onProgress) onProgress(Math.min(99, Math.round((progress || 0) * 100)));
        });
      }
      await ffmpeg.exec([
        '-i', inputName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName,
      ]);
      const out = await ffmpeg.readFile(outputName);
      try { await ffmpeg.deleteFile(inputName); } catch (_) {}
      try { await ffmpeg.deleteFile(outputName); } catch (_) {}
      return new Blob([out.buffer], { type: 'video/mp4' });
    }


    // ---------- Export card: past-o'ng, editorni lock qilmaydi ----------
    function closeExportUiModal() {
      const el = document.getElementById('export-ui-modal');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function ensureExportCard() {
      let overlay = document.getElementById('export-ui-modal');
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.id = 'export-ui-modal';
      overlay.className = 'export-ui-overlay';
      overlay.innerHTML =
        '<div class="export-ui-card" role="status" aria-live="polite">' +
          '<button type="button" class="export-ui-x" id="export-ui-x" title="Yopish">×</button>' +
          '<div class="export-ui-head">' +
            '<div class="export-ui-ring" aria-hidden="true"><span id="export-ui-ringp">0</span>%</div>' +
            '<div class="export-ui-copy">' +
              '<div class="export-ui-title" id="export-ui-title">Export</div>' +
              '<div class="export-ui-sub" id="export-ui-sub">Ishlashda davom eting</div>' +
            '</div>' +
          '</div>' +
          '<div class="export-ui-banner" id="export-ui-banner">Tabni yopma / ekranni o\'chirma</div>' +
          '<div class="export-ui-settings" id="export-ui-settings" hidden></div>' +
          '<div class="export-ui-bar"><i id="export-ui-bar"></i></div>' +
          '<div class="export-ui-eta" id="export-ui-eta"></div>' +
          '<div class="export-ui-actions" id="export-ui-actions" hidden></div>' +
          '<div class="export-ui-status" id="export-ui-status"></div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#export-ui-x').onclick = () => {
        if (state.isExporting) overlay.classList.add('is-mini');
        else closeExportUiModal();
      };
      overlay.querySelector('.export-ui-card').addEventListener('click', (e) => {
        if (!overlay.classList.contains('is-mini')) return;
        if (e.target.closest('.export-ui-x')) return;
        overlay.classList.remove('is-mini');
      });
      return overlay;
    }

    function showExportSetupModal() {
      const overlay = ensureExportCard();
      overlay.classList.remove('is-done', 'is-mini', 'is-running');
      overlay.classList.add('is-setup');
      const s = ExportCore.loadSettings();
      const title = overlay.querySelector('#export-ui-title');
      const sub = overlay.querySelector('#export-ui-sub');
      const settings = overlay.querySelector('#export-ui-settings');
      const actions = overlay.querySelector('#export-ui-actions');
      const status = overlay.querySelector('#export-ui-status');
      const banner = overlay.querySelector('#export-ui-banner');
      const eta = overlay.querySelector('#export-ui-eta');
      if (title) title.textContent = 'Export';
      if (sub) sub.textContent = 'Sifatni tanlang';
      if (banner) banner.hidden = false;
      if (eta) eta.textContent = '';
      if (status) { status.textContent = ''; status.className = 'export-ui-status'; }
      if (settings) {
        settings.hidden = false;
        settings.innerHTML =
          '<div class="export-ui-row">' +
            '<label><input type="radio" name="emr-exp-q" value="720p"' + (s.quality === '720p' ? ' checked' : '') + '> 720p</label>' +
            '<label><input type="radio" name="emr-exp-q" value="1080p"' + (s.quality === '1080p' ? ' checked' : '') + '> 1080p</label>' +
          '</div>' +
          '<div class="export-ui-row">' +
            '<label><input type="checkbox" id="emr-exp-fps60"' + (s.fps === 60 ? ' checked' : '') + '> 60 fps (ixtiyoriy, default 30)</label>' +
          '</div>' +
          '<div class="export-ui-row export-ui-col">' +
            '<label><input type="radio" name="emr-exp-b" value="telegram"' + (s.bitrate === 'telegram' ? ' checked' : '') + '> Telegram (kichik)</label>' +
            '<label><input type="radio" name="emr-exp-b" value="good"' + (s.bitrate === 'good' ? ' checked' : '') + '> Yaxshi</label>' +
            '<label><input type="radio" name="emr-exp-b" value="high"' + (s.bitrate === 'high' ? ' checked' : '') + '> Yuqori</label>' +
          '</div>' +
          '<p class="export-ui-note">Tez export: tezlik (0.5–2×) ovoz balandligini (pitch) ham o\'zgartiradi.</p>';
      }
      if (actions) {
        actions.hidden = false;
        actions.innerHTML =
          '<button type="button" class="export-ui-download" id="export-ui-start">Boshlash</button>' +
          '<button type="button" class="export-ui-mrdrive" id="export-ui-fast"><span>Tez export (beta)</span></button>' +
          '<button type="button" class="export-ui-mp4" id="export-ui-cancel-setup">Bekor</button>';
        actions.querySelector('#export-ui-start').onclick = () => beginExport(false);
        actions.querySelector('#export-ui-fast').onclick = () => beginExport(true);
        actions.querySelector('#export-ui-cancel-setup').onclick = () => closeExportUiModal();
      }
    }

    function showExportProgressModal(pct, extra) {
      extra = extra || {};
      const overlay = ensureExportCard();
      overlay.classList.remove('is-done', 'is-setup', 'is-mini');
      overlay.classList.add('is-running');
      const title = overlay.querySelector('#export-ui-title');
      const sub = overlay.querySelector('#export-ui-sub');
      const actions = overlay.querySelector('#export-ui-actions');
      const settings = overlay.querySelector('#export-ui-settings');
      const banner = overlay.querySelector('#export-ui-banner');
      if (title) title.textContent = 'Export';
      if (sub) sub.textContent = 'Ishlashda davom eting';
      if (banner) banner.hidden = false;
      if (settings) settings.hidden = true;
      if (actions) {
        actions.hidden = false;
        actions.innerHTML = '<button type="button" class="export-ui-mp4" id="export-ui-abort">Bekor qilish</button>';
        const abortBtn = actions.querySelector('#export-ui-abort');
        if (abortBtn) {
          abortBtn.onclick = () => {
            if (_exportSession) _exportSession.aborted = true;
          };
        }
      }
      updateExportProgress(pct || 0, extra.eta);
    }

    function updateExportProgress(pct, etaSec) {
      pct = Math.max(0, Math.min(100, pct | 0));
      const ring = document.getElementById('export-ui-ringp');
      const bar = document.getElementById('export-ui-bar');
      const title = document.getElementById('export-ui-title');
      const etaEl = document.getElementById('export-ui-eta');
      if (ring) ring.textContent = String(pct);
      if (bar) bar.style.width = pct + '%';
      if (title && !document.querySelector('#export-ui-modal.is-done')) title.textContent = 'Export';
      if (etaEl) etaEl.textContent = ExportCore.formatEta(etaSec);
      const card = document.querySelector('#export-ui-modal .export-ui-card');
      if (card) card.style.setProperty('--p', String(pct / 100));
    }

    function showExportResultModal(webmBlob, webmName, info) {
      info = info || {};
      const overlay = ensureExportCard();
      overlay.classList.add('is-done');
      overlay.classList.remove('is-mini', 'is-setup', 'is-running');
      const isMp4 = ExportCore.isMp4Mime(info.mime || webmBlob.type) || /\.mp4$/i.test(webmName);
      const title = overlay.querySelector('#export-ui-title');
      const sub = overlay.querySelector('#export-ui-sub');
      const ring = overlay.querySelector('#export-ui-ringp');
      const bar = overlay.querySelector('#export-ui-bar');
      const actions = overlay.querySelector('#export-ui-actions');
      const status = overlay.querySelector('#export-ui-status');
      const settings = overlay.querySelector('#export-ui-settings');
      const banner = overlay.querySelector('#export-ui-banner');
      const eta = overlay.querySelector('#export-ui-eta');
      if (settings) settings.hidden = true;
      if (banner) banner.hidden = true;
      if (eta) eta.textContent = '';
      if (title) title.textContent = 'Tayyor';
      const kind = isMp4 ? 'MP4' : 'WebM';
      const extra = info.videoOnly ? ' · audiosiz' : '';
      if (sub) sub.textContent = ((webmBlob.size / (1024 * 1024)).toFixed(1)) + ' MB · ' + kind + extra;
      if (ring) ring.textContent = '✓';
      if (bar) bar.style.width = '100%';
      if (status) { status.textContent = info.path ? ('yo\'l: ' + info.path) : ''; status.className = 'export-ui-status'; }
      if (!actions) return;
      actions.hidden = false;
      actions.innerHTML =
        '<button type="button" class="export-ui-download" id="export-ui-dl">Yuklab olish</button>' +
        '<button type="button" class="export-ui-mrdrive" id="export-ui-mrdrive">' +
          '<span>MRdrive</span><span class="export-ui-mlogo">M</span>' +
        '</button>' +
        (isMp4 ? '' : '<button type="button" class="export-ui-mp4" id="export-ui-mp4">MP4</button>');

      actions.querySelector('#export-ui-dl').onclick = () => {
        const url = URL.createObjectURL(webmBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = webmName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 20000);
        showToast('Yuklandi');
      };
      actions.querySelector('#export-ui-mrdrive').onclick = () => {
        closeExportUiModal();
        showMrdriveExportModal(webmBlob, webmName);
      };
      const mp4Btn = actions.querySelector('#export-ui-mp4');
      if (mp4Btn) mp4Btn.onclick = async () => {
        mp4Btn.disabled = true;
        if (status) { status.textContent = 'MP4...'; status.className = 'export-ui-status'; }
        try {
          const mp4 = await transcodeWebmToMp4(webmBlob, (p) => {
            if (status) status.textContent = 'MP4 ' + p + '%';
          });
          const mp4Name = webmName.replace(/\.webm$/i, '.mp4');
          const url = URL.createObjectURL(mp4);
          const a = document.createElement('a');
          a.href = url;
          a.download = mp4Name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 20000);
          if (status) { status.textContent = 'MP4 tayyor'; status.className = 'export-ui-status ok'; }
          mp4Btn.textContent = 'MP4 ✓';
          showToast('MP4 yuklandi');
        } catch (err) {
          console.error('[mp4]', err);
          if (status) { status.textContent = 'MP4 xato'; status.className = 'export-ui-status err'; }
          mp4Btn.disabled = false;
        }
      };
    }

    function showExportFormatModal(webmBlob, webmName) {
      const existing = document.getElementById('export-format-modal');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.id = 'export-format-modal';
      overlay.className = 'mrdrive-modal-overlay';
      overlay.innerHTML =
        '<div class="mrdrive-modal" role="dialog">' +
        '<div class="mrdrive-title">Export tayyor (WebM)</div>' +
        '<div class="mrdrive-ok">Kompyuterga WebM yuklandi ✓</div>' +
        '<div class="mrdrive-status" id="export-fmt-status"></div>' +
        '<div class="mrdrive-actions" style="flex-wrap:wrap">' +
        '<button type="button" class="mrdrive-btn primary" id="export-mp4-btn">MP4 ga o\'girish</button>' +
        '<button type="button" class="mrdrive-btn" id="export-mrdrive-btn">MRdrive</button>' +
        '<button type="button" class="mrdrive-btn ghost" id="export-fmt-close">Yopish</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      const status = overlay.querySelector('#export-fmt-status');
      overlay.querySelector('#export-fmt-close').onclick = () => overlay.remove();
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('#export-mrdrive-btn').onclick = () => {
        overlay.remove();
        showMrdriveExportModal(webmBlob, webmName);
      };
      overlay.querySelector('#export-mp4-btn').onclick = async () => {
        const btn = overlay.querySelector('#export-mp4-btn');
        btn.disabled = true;
        status.textContent = 'FFmpeg yuklanmoqda...';
        status.className = 'mrdrive-status';
        try {
          const mp4 = await transcodeWebmToMp4(webmBlob, (p) => {
            status.textContent = 'MP4: ' + p + '%...';
          });
          const mp4Name = webmName.replace(/\.webm$/i, '.mp4');
          const url = URL.createObjectURL(mp4);
          const a = document.createElement('a');
          a.href = url;
          a.download = mp4Name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 20000);
          status.textContent = 'MP4 yuklandi ✓ (' + (mp4.size / 1024 / 1024).toFixed(1) + ' MB)';
          status.className = 'mrdrive-status ok';
          btn.textContent = 'MP4 tayyor';
          showToast('MP4 yuklandi');
        } catch (err) {
          console.error('[mp4]', err);
          status.textContent = 'MP4 xato: ' + (err.message || 'transcode');
          status.className = 'mrdrive-status err';
          btn.disabled = false;
        }
      };
    }

    // ---------- MRdrive (alohida Supabase client — editormr Auth'ga tegilmaydi) ----------
    const MRDRIVE_DEFAULTS = {
      url: 'https://hharvpgnqmjbbgnfsauq.supabase.co',
      anonKey: 'sb_publishable_enRXsK8Yqzn_goNRUHBocg_DPvuWUDb',
      maxUploadsPerWindow: 5,
      windowMs: 10 * 60 * 1000,
    };
    let mrdriveClient = null;

    function getMrdriveConfig() {
      const c = window.MRDRIVE_CONFIG || {};
      return {
        url: (c.url && String(c.url).trim()) || MRDRIVE_DEFAULTS.url,
        anonKey: (c.anonKey && String(c.anonKey).trim()) || MRDRIVE_DEFAULTS.anonKey,
        maxUploadsPerWindow: Number(c.maxUploadsPerWindow) > 0 ? Number(c.maxUploadsPerWindow) : MRDRIVE_DEFAULTS.maxUploadsPerWindow,
        windowMs: Number(c.windowMs) > 0 ? Number(c.windowMs) : MRDRIVE_DEFAULTS.windowMs,
      };
    }

    function assertMrdriveRateLimit() {
      const cfg = getMrdriveConfig();
      const key = 'emr_mrdrive_uploads';
      let arr = [];
      try { arr = JSON.parse(sessionStorage.getItem(key) || '[]'); } catch (_) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      const now = Date.now();
      arr = arr.filter((t) => typeof t === 'number' && now - t < cfg.windowMs);
      if (arr.length >= cfg.maxUploadsPerWindow) {
        throw new Error("MRdrive limit: " + cfg.maxUploadsPerWindow + " / " + Math.round(cfg.windowMs / 60000) + " min. Try later.");
      }
      arr.push(now);
      try { sessionStorage.setItem(key, JSON.stringify(arr)); } catch (_) {}
    }

    function getMrdriveClient() {
      if (mrdriveClient) return mrdriveClient;
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase client topilmadi');
      }
      const cfg = getMrdriveConfig();
      if (!cfg.url || !cfg.anonKey) throw new Error('MRdrive sozlanmagan');
      mrdriveClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return mrdriveClient;
    }

    function randomDigits8() {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return String(10000000 + (buf[0] % 90000000));
    }

    function randomHexToken(bytes) {
      const arr = new Uint8Array(bytes || 16);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    function sanitizeUsername(raw) {
      return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/@.*$/, '')
        .replace(/[^a-z0-9_.-]/g, '')
        .slice(0, 32) || 'user';
    }

    // Parol localStorage'ga YOZILMAYDI (xavfsizlik).
    // Mavjud EMR sessiyasi bo'lsa — shu JWT ishlatiladi.
    // Aks holda username eslab qolinadi; one-shot parol faqat xotirada.
    function getOrCreateMrdriveCredentials() {
      try { localStorage.removeItem('mrdrive_pass'); } catch (_) {}

      let username = '';
      try { username = localStorage.getItem('mrdrive_username') || ''; } catch (_) {}
      let name = '';
      try { name = localStorage.getItem('mrdrive_name') || ''; } catch (_) {}

      const session = (typeof Auth !== 'undefined' && Auth.session) || null;
      const user = session && session.user ? session.user : null;
      const email = (user && user.email) || '';
      const meta = (user && user.user_metadata) || {};

      if (!username) {
        username = sanitizeUsername((email.split('@')[0]) || meta.username || 'user');
        try { localStorage.setItem('mrdrive_username', username); } catch (_) {}
      }
      if (!name) {
        name = meta.full_name || meta.name || username;
        try { localStorage.setItem('mrdrive_name', name); } catch (_) {}
      }

      // Session bor — alohida parol kerak emas
      if (session) {
        return { username, pass: null, name: name || username, isNew: false, useSession: true };
      }

      // Session yo'q — ephemeral parol (faqat RAM, saqlanmaydi)
      const pass = randomDigits8();
      return { username, pass, name: name || username, isNew: true, useSession: false };
    }

    function closeMrdriveModal() {
      const el = document.getElementById('mrdrive-modal');
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function showMrdriveExportModal(blob, fileName) {
      closeMrdriveModal();
      const overlay = document.createElement('div');
      overlay.id = 'mrdrive-modal';
      overlay.className = 'mrdrive-modal-overlay';
      overlay.innerHTML =
        '<div class="mrdrive-modal" role="dialog" aria-modal="true">' +
        '<div class="mrdrive-title">Export tayyor</div>' +
        '<div class="mrdrive-ok">Kompyuterga yuklandi ✓</div>' +
        '<div class="mrdrive-status" id="mrdrive-status"></div>' +
        '<div class="mrdrive-link-row" id="mrdrive-link-row" hidden>' +
        '<input type="text" class="mrdrive-link" id="mrdrive-link" readonly />' +
        '<button type="button" class="mrdrive-btn" id="mrdrive-copy">Nusxalash</button>' +
        '</div>' +
        '<div class="mrdrive-actions">' +
        '<button type="button" class="mrdrive-btn primary" id="mrdrive-upload">MRdrive\'ga joylash</button>' +
        '<button type="button" class="mrdrive-btn ghost" id="mrdrive-close">Yopish</button>' +
        '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      const statusEl = overlay.querySelector('#mrdrive-status');
      const linkRow = overlay.querySelector('#mrdrive-link-row');
      const linkInput = overlay.querySelector('#mrdrive-link');
      const uploadBtn = overlay.querySelector('#mrdrive-upload');
      const closeBtn = overlay.querySelector('#mrdrive-close');
      const copyBtn = overlay.querySelector('#mrdrive-copy');

      closeBtn.addEventListener('click', () => closeMrdriveModal());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeMrdriveModal();
      });

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(linkInput.value);
          copyBtn.textContent = 'Nusxalandi';
          setTimeout(() => { copyBtn.textContent = 'Nusxalash'; }, 1500);
        } catch (_) {
          linkInput.select();
        }
      });

      uploadBtn.addEventListener('click', async () => {
        uploadBtn.disabled = true;
        statusEl.textContent = 'MRdrive\'ga ulanmoqda...';
        statusEl.className = 'mrdrive-status';
        try {
          const result = await uploadBlobToMrdrive(blob, fileName, (msg) => {
            statusEl.textContent = msg;
          });
          statusEl.textContent = result.isNew
            ? ('MRdrive hisobing yaratildi: username=' + result.username)
            : 'MRdrive\'ga joylandi ✓';
          statusEl.className = 'mrdrive-status ok';
          linkInput.value = result.shareUrl;
          linkRow.hidden = false;
          uploadBtn.textContent = 'Joylandi';
        } catch (err) {
          console.error('[mrdrive]', err);
          statusEl.textContent = 'Xato: ' + (err.message || 'yuklab bo\'lmadi');
          statusEl.className = 'mrdrive-status err';
          uploadBtn.disabled = false;
        }
      });
    }

    async function uploadBlobToMrdrive(blob, fileName, onStatus) {
      assertMrdriveRateLimit();
      const client = getMrdriveClient();
      // Parol diskka yozilmaydi: har upload — ephemeral hisob (faqat RAM).
      try { localStorage.removeItem('mrdrive_pass'); } catch (_) {}

      const base = sanitizeUsername(
        (function () {
          try { return localStorage.getItem('mrdrive_username') || ''; } catch (_) { return ''; }
        })() ||
        ((typeof Auth !== 'undefined' && Auth.session && Auth.session.user && Auth.session.user.email) || 'user').split('@')[0]
      );
      const suffix = randomHexToken(4);
      const username = (base + '_' + suffix).slice(0, 32);
      const pass = randomHexToken(16);
      const name = (function () {
        try { return localStorage.getItem('mrdrive_name') || username; } catch (_) { return username; }
      })();
      const mrdriveEmail = username.toLowerCase() + '@mrdrive.local';

      if (onStatus) onStatus('Hisob yaratilmoqda...');
      const { data: signUpData, error: signUpErr } = await client.auth.signUp({
        email: mrdriveEmail,
        password: pass,
        options: { data: { name, username } },
      });

      let session = signUpData && signUpData.session ? signUpData.session : null;
      if (!session) {
        if (onStatus) onStatus('Kirilmoqda...');
        const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
          email: mrdriveEmail,
          password: pass,
        });
        if (signInErr || !signInData || !signInData.session) {
          throw new Error(
            (signInErr && signInErr.message) ||
            (signUpErr && signUpErr.message) ||
            'MRdrive sessiyasi olinmadi'
          );
        }
        session = signInData.session;
      }

      const userId = session.user.id;
      const safeName = String(fileName || 'video.webm').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = userId + '/' + Date.now() + '_' + safeName;
      const file = new File([blob], fileName || safeName, { type: blob.type || 'video/webm' });

      if (onStatus) onStatus('Fayl yuklanmoqda...');
      const { error: upErr } = await client.storage.from('files').upload(path, file);
      if (upErr) throw new Error(upErr.message || 'Storage upload xatosi');

      const token = randomHexToken(16);
      if (onStatus) onStatus('Yozuv saqlanmoqda...');
      const { error: insErr } = await client.from('files').insert({
        user_id: userId,
        filename: file.name,
        storage_path: path,
        size: file.size,
        is_public: true,
        public_token: token,
        expires_at: null,
      });
      if (insErr) throw new Error(insErr.message || 'DB insert xatosi');

      try {
        localStorage.setItem('mrdrive_username', base);
        localStorage.setItem('mrdrive_name', name);
        localStorage.removeItem('mrdrive_pass');
      } catch (_) {}

      return {
        shareUrl: 'https://mrdrive.vercel.app/?share=' + token,
        username: base,
        isNew: true,
      };
    }


    // ===================== EXPORT (real timeline render) =====================
    exportBtn.addEventListener('click', async () => {
      if (!state.videoFile) return;
      if (state.isExporting) return;
      state.isExporting = true;
      loading.classList.add('show');
      const loadingText = loading.querySelector('div:last-child');
      if (loadingText) loadingText.textContent = 'Export qilinmoqda...';

      try {
        await exportTimeline();
      } catch (err) {
        console.error(err);
        showToast('Export xatosi: ' + (err.message || 'noma\'lum'));
      } finally {
        state.isExporting = false;
        loading.classList.remove('show');
        if (loadingText) loadingText.textContent = 'Processing...';
      }
    });

    async function exportTimeline() {
      // Editor preview = export natijasi
      // Bo'sh joylar qora, qirqilmaydi; musiqa video oxirida kesiladi

      const videoEnd = videoTimelineEnd();
      const exportDuration = Math.max(videoEnd, 0.5);
      let exportActiveClipId = null;

      // Chiqish o'lchami
      let outW = 1280, outH = 720;
      if (!state.isImage && previewVideo.videoWidth > 0) {
        outW = previewVideo.videoWidth;
        outH = previewVideo.videoHeight;
      } else if (state.isImage) {
        const imgEl = document.getElementById('image-preview');
        if (imgEl?.naturalWidth) {
          outW = imgEl.naturalWidth;
          outH = imgEl.naturalHeight;
        }
      }
      const maxSide = 1280;
      if (outW > maxSide || outH > maxSide) {
        const scale = maxSide / Math.max(outW, outH);
        outW = Math.round(outW * scale);
        outH = Math.round(outH * scale);
      }
      outW = Math.max(2, outW - (outW % 2));
      outH = Math.max(2, outH - (outH % 2));

      // Canvas (DOM ga qo'shamiz — ba'zi brauzerlarda captureStream uchun kerak)
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d', { alpha: false });

      // Export video (rasm uchun chizish) — muted, chunki audio alohida olinadi
      // exportVideoElB — transition (incoming) clip uchun ikkinchi video
      let exportVideoEl = null;
      let exportVideoElB = null;
      function makeExportVideo() {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(v);
        return v;
      }
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

      function ensureExportClipOnEl(el, clip, t) {
        if (!el || !clip || clip.isImage) return;
        const src = clip.url || state.videoUrl;
        if (src && el.src !== src && !el.src.endsWith(src) && el.getAttribute('src') !== src) {
          try {
            if (el.src !== src) el.src = src;
          } catch (_) {}
        }
        const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
        el.playbackRate = sp;
        const local = timelineToSource(clip, t);
        if (Math.abs((el.currentTime || 0) - local) > 0.12) {
          try { el.currentTime = local; } catch (_) {}
        }
        if (el.paused) el.play().catch(() => {});
      }

      function drawExportClipFrame(ctx, el, clip, t, outW, outH, alpha) {
        if (!el || !clip || clip.isImage) return;
        ensureExportClipOnEl(el, clip, t);
        if (el.readyState < 2) return;
        ctx.save();
        ctx.globalAlpha = alpha != null ? alpha : 1;
        try {
          ctx.drawImage(el, 0, 0, outW, outH);
        } catch (_) {}
        ctx.restore();
      }

      function drawExportTransition(ctx, trans, elapsed, outW, outH) {
        const { from: clipA, to: clipB, progress: alpha, start: tStart } = trans;
        // B hali startTime ga yetmagan — virtual timeline (transition boshidan)
        const tB = clipB.startTime + Math.max(0, elapsed - tStart);
        const type = clipA.transitionType || 'fade';
        if (type === 'fade') {
          drawExportClipFrame(ctx, exportVideoEl, clipA, elapsed, outW, outH, 1);
          drawExportClipFrame(ctx, exportVideoElB, clipB, tB, outW, outH, alpha);
        } else if (type === 'slide-left') {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, outW, outH);
          ctx.clip();
          ctx.translate(-outW * alpha, 0);
          drawExportClipFrame(ctx, exportVideoEl, clipA, elapsed, outW, outH, 1);
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, outW, outH);
          ctx.clip();
          ctx.translate(outW * (1 - alpha), 0);
          drawExportClipFrame(ctx, exportVideoElB, clipB, tB, outW, outH, 1);
          ctx.restore();
        } else if (type === 'slide-right') {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, outW, outH);
          ctx.clip();
          ctx.translate(outW * alpha, 0);
          drawExportClipFrame(ctx, exportVideoEl, clipA, elapsed, outW, outH, 1);
          ctx.restore();
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, outW, outH);
          ctx.clip();
          ctx.translate(-outW * (1 - alpha), 0);
          drawExportClipFrame(ctx, exportVideoElB, clipB, tB, outW, outH, 1);
          ctx.restore();
        } else {
          drawExportClipFrame(ctx, exportVideoEl, clipA, elapsed, outW, outH, 1);
        }
      }

      // Audio mix: video o'z ovozi + musiqa (ikkala birga)
      let audioCtx = null;
      let exportMusicEl = null;
      let exportVideoAudioEl = null; // video ovozini yozish uchun
      let exportVideoGain = null;
      let exportMusicGain = null;
      const audioTracks = [];
      const needAudio = (!state.isImage && state.videoUrl) || state.music?.url;

      if (needAudio) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const dest = audioCtx.createMediaStreamDestination();

        // 1) Video original audio
        if (!state.isImage && state.videoUrl) {
          exportVideoAudioEl = document.createElement('video');
          exportVideoAudioEl.src = state.videoUrl;
          const firstAudioClip = state.videoClips.find(c => !c.isImage) || state.videoClips[0];
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

        // 2) Background music
        if (state.music?.url) {
          exportMusicEl = new Audio(state.music.url);
          exportMusicEl.crossOrigin = 'anonymous';
          exportMusicEl.preload = 'auto';
          // volume via gain node (fade envelope)
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

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks
      ]);

      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];
      let mimeType = '';
      for (const m of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(m)) { mimeType = m; break; }
      }
      if (!mimeType) mimeType = 'video/webm';

      const chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 4000000
        });
      } catch (e) {
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

      pauseAll();
      state.currentTime = 0;
      updatePlayhead();
      updateTimeDisplay();
      updateBlackOverlay();
      if (state.music?.audio) state.music.audio.pause();

      // Warm-up: bir necha qora kadr chizamiz
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);
        await new Promise(r => requestAnimationFrame(r));
      }

      recorder.start(200);

      const startPerf = performance.now();
      let musicStarted = false;
      let videoPlaying = false;

      // Agar birinchi clip 0 dan boshlansa — oldindan play
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

      await new Promise((resolveDone) => {
        const tick = () => {
          const elapsed = (performance.now() - startPerf) / 1000;
          if (elapsed >= exportDuration) {
            resolveDone();
            return;
          }

          ctx.globalAlpha = 1;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, outW, outH);

          const trans = typeof getActiveTransition === 'function' ? getActiveTransition(elapsed) : null;
          const clip = findClipAtTime(elapsed);

          if (trans && exportVideoEl) {
            // Transition zone: blend A → B
            videoPlaying = true;
            exportActiveClipId = trans.from.id;
            drawExportTransition(ctx, trans, elapsed, outW, outH);
            // Audio from outgoing clip
            if (exportVideoAudioEl && !trans.from.isImage) {
              const src = trans.from.url || state.videoUrl;
              if (exportVideoAudioEl.src !== src) exportVideoAudioEl.src = src;
              applyMediaVolume(exportVideoAudioEl, trans.from);
              const sp = (trans.from.speed && trans.from.speed > 0) ? trans.from.speed : 1;
              exportVideoAudioEl.playbackRate = sp;
              const local = timelineToSource(trans.from, elapsed);
              if (Math.abs((exportVideoAudioEl.currentTime || 0) - local) > 0.12) {
                try { exportVideoAudioEl.currentTime = local; } catch (_) {}
              }
              if (exportVideoAudioEl.paused) exportVideoAudioEl.play().catch(() => {});
            }
          } else if (clip) {
            const fadeAlpha = typeof getClipOpacity === 'function' ? getClipOpacity(clip, elapsed) : 1;
            ctx.globalAlpha = fadeAlpha;
            if (state.isImage) {
              const imgEl = document.getElementById('image-preview');
              if (imgEl?.complete) {
                const iw = imgEl.naturalWidth || outW;
                const ih = imgEl.naturalHeight || outH;
                const scale = Math.max(outW / iw, outH / ih);
                const dw = iw * scale, dh = ih * scale;
                ctx.drawImage(imgEl, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
              }
            } else if (clip.isImage) {
              // photo clip — skip
            } else if (exportVideoEl) {
              if (!videoPlaying || exportActiveClipId !== clip.id) {
                videoPlaying = true;
                exportActiveClipId = clip.id;
                const src = clip.url || state.videoUrl;
                if (exportVideoEl.src !== src) {
                  exportVideoEl.src = src;
                  if (exportVideoAudioEl) exportVideoAudioEl.src = src;
                }
                const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
                exportVideoEl.playbackRate = sp;
                if (exportVideoAudioEl) {
                  exportVideoAudioEl.volume = 1;
                  exportVideoAudioEl.muted = false;
                  exportVideoAudioEl.playbackRate = sp;
                }
                const local = timelineToSource(clip, elapsed);
                exportVideoEl.currentTime = local;
                exportVideoEl.play().catch(() => {});
                if (exportVideoAudioEl) {
                  exportVideoAudioEl.currentTime = local;
                  exportVideoAudioEl.play().catch(() => {});
                }
              }
              if (exportVideoEl.readyState >= 2) {
                try {
                  ctx.drawImage(exportVideoEl, 0, 0, outW, outH);
                } catch (_) {}
              }
            }
            ctx.globalAlpha = 1;
          } else if (exportVideoEl && videoPlaying) {
            exportVideoEl.pause();
            if (exportVideoElB) exportVideoElB.pause();
            if (exportVideoAudioEl) exportVideoAudioEl.pause();
            videoPlaying = false;
            exportActiveClipId = null;
          }

          // Audio fade envelope
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

          // Text overlay
          if (typeof drawTextOverlaysOnCanvas === 'function') {
            try { drawTextOverlaysOnCanvas(ctx, outW, outH, elapsed); } catch (_) {}
          }

          // Musiqa (video ovozi bilan birga)
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

          state.currentTime = elapsed;
          updatePlayhead();
          updateTimeDisplay();

          const pct = Math.min(100, Math.round((elapsed / exportDuration) * 100));
          const lt = loading.querySelector('div:last-child');
          if (lt) lt.textContent = `Export ${pct}%...`;

          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      // Yakunlash
      if (exportVideoEl) exportVideoEl.pause();
      if (exportVideoElB) exportVideoElB.pause();
      if (exportVideoAudioEl) exportVideoAudioEl.pause();
      if (exportMusicEl) exportMusicEl.pause();

      // Oxirgi ma'lumotlarni olish
      if (recorder.state === 'recording') {
        try { recorder.requestData(); } catch (_) {}
        await new Promise(r => setTimeout(r, 150));
        recorder.stop();
      }
      await recorded;

      // Tozalash
      canvasStream.getTracks().forEach(t => t.stop());
      audioTracks.forEach(t => t.stop());
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (exportVideoEl?.parentNode) exportVideoEl.parentNode.removeChild(exportVideoEl);
      if (exportVideoElB?.parentNode) exportVideoElB.parentNode.removeChild(exportVideoElB);
      if (exportVideoAudioEl?.parentNode) exportVideoAudioEl.parentNode.removeChild(exportVideoAudioEl);
      if (exportMusicEl) exportMusicEl.src = '';
      try { if (audioCtx) await audioCtx.close(); } catch (_) {}

      const blob = new Blob(chunks, { type: mimeType });
      console.log('Export blob size:', blob.size, 'type:', mimeType, 'chunks:', chunks.length);

      if (blob.size < 500) {
        showToast('Export muvaffaqiyatsiz — qayta urinib ko\'ring');
        state.currentTime = 0;
        updatePlayhead();
        return;
      }

      const ext = 'webm';
      const baseName = 'edited-' + (state.videoFile.name?.replace(/\.[^.]+$/, '') || 'video') + '.' + ext;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = baseName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);

      state.currentTime = 0;
      updatePlayhead();
      updateTimeDisplay();
      updateBlackOverlay();

      const mb = (blob.size / (1024 * 1024)).toFixed(1);
      showToast('Export tayyor! (' + mb + ' MB, video' + (state.music ? ' + musiqa' : '') + ')');

      // Format tanlash: WebM allaqachon yuklandi; MP4 ixtiyoriy
      showExportFormatModal(blob, baseName);
    }

    // ---------- MP4 (ffmpeg.wasm) ----------
    let ffmpegInstance = null;
    let ffmpegLoading = null;

    async function getFFmpeg() {
      if (ffmpegInstance) return ffmpegInstance;
      if (ffmpegLoading) return ffmpegLoading;
      ffmpegLoading = (async () => {
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
    const MRDRIVE_URL = 'https://hharvpgnqmjbbgnfsauq.supabase.co';
    const MRDRIVE_ANON_KEY = 'sb_publishable_enRXsK8Yqzn_goNRUHBocg_DPvuWUDb';
    let mrdriveClient = null;

    function getMrdriveClient() {
      if (mrdriveClient) return mrdriveClient;
      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase client topilmadi');
      }
      mrdriveClient = window.supabase.createClient(MRDRIVE_URL, MRDRIVE_ANON_KEY, {
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

    function getOrCreateMrdriveCredentials() {
      let username = localStorage.getItem('mrdrive_username');
      let pass = localStorage.getItem('mrdrive_pass');
      let name = localStorage.getItem('mrdrive_name');
      let isNew = false;

      if (!username || !pass) {
        isNew = true;
        const session = (typeof Auth !== 'undefined' && Auth.session) || null;
        const user = session?.user || null;
        const email = user?.email || '';
        const meta = user?.user_metadata || {};
        username = sanitizeUsername(email.split('@')[0] || meta.username || 'user');
        pass = randomDigits8();
        name = meta.full_name || meta.name || username;
        localStorage.setItem('mrdrive_username', username);
        localStorage.setItem('mrdrive_pass', pass);
        localStorage.setItem('mrdrive_name', name);
      }

      return { username, pass, name: name || username, isNew };
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
      const client = getMrdriveClient();
      const creds = getOrCreateMrdriveCredentials();
      const { username, pass, name, isNew } = creds;
      const mrdriveEmail = username.trim().toLowerCase() + '@mrdrive.local';

      if (onStatus) onStatus(isNew ? 'Hisob yaratilmoqda...' : 'Kirilmoqda...');

      let session = null;
      const { data: signUpData, error: signUpErr } = await client.auth.signUp({
        email: mrdriveEmail,
        password: pass,
        options: { data: { name, username } },
      });

      if (signUpData?.session) {
        session = signUpData.session;
      } else {
        const already = signUpErr && /already|registered|exists/i.test(signUpErr.message || '');
        if (!signUpErr || already || signUpData?.user) {
          if (onStatus) onStatus('Kirilmoqda...');
          const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({
            email: mrdriveEmail,
            password: pass,
          });
          if (signInErr) {
            throw new Error(signInErr.message || 'MRdrive login xatosi');
          }
          session = signInData?.session || null;
        } else {
          throw new Error(signUpErr.message || 'MRdrive ro\'yxatdan o\'tish xatosi');
        }
      }

      if (!session?.user?.id) {
        const { data: again, error: againErr } = await client.auth.signInWithPassword({
          email: mrdriveEmail,
          password: pass,
        });
        if (againErr || !again?.session?.user?.id) {
          throw new Error(againErr?.message || 'MRdrive sessiyasi olinmadi');
        }
        session = again.session;
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

      return {
        shareUrl: 'https://mrdrive.vercel.app/?share=' + token,
        username,
        isNew,
      };
    }


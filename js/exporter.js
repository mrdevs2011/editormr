    // ===================== FAST EXPORT (WebCodecs + Mediabunny) =====================
    // Kadr sikli t = i / fps. Manba: <video> seek → seeked → drawImage (variant a).
    // Variant b (VideoDecoder + demuxer) — alohida flag, hozir implement qilinmagan.
    // Audio: OfflineAudioContext miks. Speed playbackRate pitch'ni o'zgartiradi.

    var FastExporter = (function () {
      var VENDOR_SRC = 'js/vendor/mediabunny.min.js';
      var loadPromise = null;

      function loadMediabunny() {
        if (typeof Mediabunny !== 'undefined') return Promise.resolve(Mediabunny);
        if (loadPromise) return loadPromise;
        loadPromise = new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = VENDOR_SRC;
          s.onload = function () {
            if (typeof Mediabunny === 'undefined') reject(new Error('Mediabunny global topilmadi'));
            else resolve(Mediabunny);
          };
          s.onerror = function () { reject(new Error('Mediabunny yuklanmadi: ' + VENDOR_SRC)); };
          document.head.appendChild(s);
        });
        return loadPromise;
      }

      function waitSeeked(el, time, timeoutMs) {
        return new Promise(function (resolve) {
          if (!el) return resolve();
          var target = Math.max(0, time);
          if (el.readyState >= 2 && Math.abs((el.currentTime || 0) - target) < 0.005) {
            return resolve();
          }
          var done = false;
          function finish() {
            if (done) return;
            done = true;
            el.removeEventListener('seeked', onSeeked);
            el.removeEventListener('error', onErr);
            clearTimeout(tid);
            resolve();
          }
          function onSeeked() { finish(); }
          function onErr() { finish(); }
          var tid = setTimeout(finish, timeoutMs || 1800);
          el.addEventListener('seeked', onSeeked);
          el.addEventListener('error', onErr);
          try {
            el.currentTime = target;
          } catch (_) {
            finish();
          }
        });
      }

      function makeHiddenVideo() {
        var v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.crossOrigin = 'anonymous';
        v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(v);
        return v;
      }

      function setSrcIfNeeded(el, src) {
        if (!el || !src) return Promise.resolve();
        if (el.src === src || String(el.src || '').endsWith(src) || el.getAttribute('src') === src) {
          return Promise.resolve();
        }
        return new Promise(function (resolve) {
          var done = function () {
            el.removeEventListener('loadeddata', done);
            el.removeEventListener('error', done);
            resolve();
          };
          el.addEventListener('loadeddata', done);
          el.addEventListener('error', done);
          setTimeout(done, 5000);
          try { el.src = src; } catch (_) { resolve(); }
        });
      }

      async function preparePackAt(pack, t) {
        var trans = typeof getActiveTransition === 'function' ? getActiveTransition(t) : null;
        var clip = typeof findClipAtTime === 'function' ? findClipAtTime(t) : null;
        var tasks = [];

        function seekClip(el, c, time) {
          if (!el || !c || c.isImage) return Promise.resolve();
          var src = c.url || state.videoUrl;
          var local = typeof timelineToSource === 'function'
            ? timelineToSource(c, time)
            : ExportCore.sourceTimeAt(c, time);
          return setSrcIfNeeded(el, src).then(function () { return waitSeeked(el, local); });
        }

        if (trans) {
          var clipB = trans.to;
          var tB = Math.max(clipB.startTime,
            Math.min(clipEnd(clipB) - 0.04, clipB.startTime + Math.max(0, t - trans.start)));
          tasks.push(seekClip(pack.videoA, trans.from, t));
          tasks.push(seekClip(pack.videoB, clipB, tB));
        } else if (clip && !clip.isImage && !state.isImage) {
          tasks.push(seekClip(pack.videoA, clip, t));
        }

        if (typeof findFloatedAtTime === 'function') {
          var floats = findFloatedAtTime(t);
          for (var i = 0; i < floats.length; i++) {
            if (!floats[i].isImage) tasks.push(seekClip(pack.videoF, floats[i], t));
          }
        }
        await Promise.all(tasks);
      }

      function uniqueMediaUrls() {
        var urls = [];
        function add(u) {
          if (!u) return;
          if (urls.indexOf(u) === -1) urls.push(u);
        }
        (state.videoClips || []).forEach(function (c) {
          if (!c.isImage) add(c.url || state.videoUrl);
        });
        if (state.music && state.music.url) add(state.music.url);
        return urls;
      }

      async function decodeToBuffer(ctx, url) {
        var res = await fetch(url);
        if (!res.ok) throw new Error('Audio yuklanmadi');
        var raw = await res.arrayBuffer();
        return await ctx.decodeAudioData(raw.slice(0));
      }

      function scheduleGainEnvelope(gain, start, end, valueAt) {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(valueAt(start), Math.max(0, start));
        var step = 0.05;
        for (var t = start + step; t < end; t += step) {
          gain.gain.linearRampToValueAtTime(valueAt(t), t);
        }
        gain.gain.linearRampToValueAtTime(valueAt(end), Math.max(start, end));
      }

      // Offline miks. playbackRate pitch'ni o'zgartiradi — bu yashirilmaydi.
      async function mixOfflineAudio(durationSec, sampleRate, abort) {
        var sr = sampleRate || 48000;
        var length = Math.max(1, Math.ceil(durationSec * sr));
        var ctx = new OfflineAudioContext(2, length, sr);
        var decoded = {};

        async function bufFor(url) {
          if (decoded[url]) return decoded[url];
          try {
            decoded[url] = await decodeToBuffer(ctx, url);
          } catch (e) {
            console.warn('[fast-export] audio decode:', url, e);
            decoded[url] = null;
          }
          return decoded[url];
        }

        var clips = state.videoClips || [];
        for (var i = 0; i < clips.length; i++) {
          if (abort && abort.aborted) throw ExportCore.ExportAbortedError();
          var clip = clips[i];
          if (clip.isImage) continue;
          var url = clip.url || state.videoUrl;
          if (!url) continue;
          var buf = await bufFor(url);
          if (!buf) continue;
          var src = ctx.createBufferSource();
          src.buffer = buf;
          var sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
          src.playbackRate.value = sp;
          var g = ctx.createGain();
          src.connect(g);
          g.connect(ctx.destination);
          var start = clip.startTime || 0;
          var end = typeof clipEnd === 'function' ? clipEnd(clip) : (start + (clip.duration || 0));
          var trimStart = clip.trimStart || 0;
          var srcDur = Math.max(0.01, (clip.trimEnd != null ? clip.trimEnd : (trimStart + 1)) - trimStart);
          scheduleGainEnvelope(g, start, end, function (t) {
            var base = clip.muted ? 0 : (clip.volume != null ? clip.volume : 1);
            var env = typeof getClipOpacity === 'function' ? getClipOpacity(clip, t) : 1;
            return Math.max(0, Math.min(1, base * env));
          });
          try { src.start(Math.max(0, start), trimStart, srcDur); } catch (_) {}
        }

        if (state.music && state.music.url) {
          var m = state.music;
          var mbuf = await bufFor(m.url);
          if (mbuf) {
            var ms = ctx.createBufferSource();
            ms.buffer = mbuf;
            var mg = ctx.createGain();
            ms.connect(mg);
            mg.connect(ctx.destination);
            var mStart = m.startTime || 0;
            var mEnd = mStart + Math.max(0, (m.trimEnd || 0) - (m.trimStart || 0));
            scheduleGainEnvelope(mg, mStart, Math.min(mEnd, durationSec), function (t) {
              var env = 1;
              if (t < mStart || t >= mEnd) env = 0;
              else {
                var fi = Math.max(0, m.fadeIn || 0);
                var fo = Math.max(0, m.fadeOut || 0);
                if (fi > 0 && t < mStart + fi) env = (t - mStart) / fi;
                if (fo > 0 && t > mEnd - fo) env = Math.min(env, (mEnd - t) / fo);
                env = Math.max(0, Math.min(1, env));
              }
              var base = m.muted ? 0 : (m.volume != null ? m.volume : 1);
              return Math.max(0, Math.min(1, base * env));
            });
            try {
              ms.start(Math.max(0, mStart), m.trimStart || 0, Math.max(0.01, (m.trimEnd || 0) - (m.trimStart || 0)));
            } catch (_) {}
          }
        }

        return await ctx.startRendering();
      }

      function pickVideoCodecConfig(width, height, fps, bitrate) {
        return [
          { codec: 'avc1.42001f', width: width, height: height, bitrate: bitrate, framerate: fps, avc: { format: 'avc' } },
          { codec: 'avc1.4D001f', width: width, height: height, bitrate: bitrate, framerate: fps, avc: { format: 'avc' } },
          { codec: 'avc1.42001f', width: width, height: height, bitrate: bitrate, framerate: fps }
        ];
      }

      async function firstSupportedVideoConfig(width, height, fps, bitrate) {
        if (typeof VideoEncoder === 'undefined' || typeof VideoEncoder.isConfigSupported !== 'function') {
          throw new Error('VideoEncoder yo\'q');
        }
        var list = pickVideoCodecConfig(width, height, fps, bitrate);
        for (var i = 0; i < list.length; i++) {
          try {
            var r = await VideoEncoder.isConfigSupported(list[i]);
            if (r && r.supported) return r.config || list[i];
          } catch (_) {}
        }
        throw new Error('H.264 VideoEncoder qo\'llab-quvvatlanmaydi');
      }

      async function pickAudioCodec(sampleRate, bitrate) {
        if (typeof AudioEncoder === 'undefined' || typeof AudioEncoder.isConfigSupported !== 'function') {
          return null;
        }
        var cands = [
          { codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: sampleRate, bitrate: bitrate },
          { codec: 'opus', numberOfChannels: 2, sampleRate: sampleRate, bitrate: bitrate }
        ];
        for (var i = 0; i < cands.length; i++) {
          try {
            var r = await AudioEncoder.isConfigSupported(cands[i]);
            if (r && r.supported) return { config: r.config || cands[i], muxCodec: cands[i].codec.indexOf('opus') === 0 ? 'opus' : 'aac' };
          } catch (_) {}
        }
        return null;
      }

      async function run(opts) {
        opts = opts || {};
        var abort = opts.abort || { aborted: false };
        var settings = ExportCore.normalizeSettings(opts.settings);
        var onProgress = opts.onProgress || function () {};
        var useDecoder = !!(opts.useDecoder);

        // Variant (b) flag — demuxer/decoder yo'li shu seansda yozilmadi.
        if (useDecoder) {
          console.warn('[export] decoder manba (variant b) yo\'q — seek yo\'liga tushildi');
        }

        var MB = await loadMediabunny();
        if (abort.aborted) throw ExportCore.ExportAbortedError();

        var duration = Math.max(typeof videoTimelineEnd === 'function' ? videoTimelineEnd() : 0.5, 0.5);
        var fps = settings.fps;
        var frameCount = Math.max(1, Math.round(duration * fps));
        var maxS = ExportCore.maxSide(settings);
        var size = typeof getCanvasOutputSize === 'function'
          ? getCanvasOutputSize({ maxSide: maxS })
          : ExportCore.outputSizeForRatio(null, maxS, null);
        var outW = size.w;
        var outH = size.h;
        var vBitrate = ExportCore.videoBitrate(settings);
        var aBitrate = ExportCore.audioBitrate(settings);

        var vConfig = await firstSupportedVideoConfig(outW, outH, fps, vBitrate);

        var canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(canvas);
        var ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

        var pack = {
          live: false,
          videoA: makeHiddenVideo(),
          videoB: makeHiddenVideo(),
          videoF: makeHiddenVideo(),
          imageEl: document.getElementById('image-preview'),
          floatImgCache: new Map()
        };

        var resources = [canvas, pack.videoA, pack.videoB, pack.videoF];
        var encoder = null;
        var audioEncoder = null;
        var output = null;
        var closed = false;

        async function cleanup() {
          if (closed) return;
          closed = true;
          try { if (encoder) encoder.close(); } catch (_) {}
          try { if (audioEncoder) audioEncoder.close(); } catch (_) {}
          try { if (output && output.state === 'started') await output.cancel(); } catch (_) {}
          resources.forEach(function (el) {
            try {
              if (el && el.tagName === 'VIDEO') {
                el.pause();
                el.removeAttribute('src');
                el.load();
              }
            } catch (_) {}
            try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (_) {}
          });
        }

        try {
          var target = new MB.BufferTarget();
          output = new MB.Output({
            format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
            target: target
          });

          var videoSrc = new MB.EncodedVideoPacketSource('avc');
          output.addVideoTrack(videoSrc, { frameRate: fps });

          var needAudio = uniqueMediaUrls().length > 0;
          var audioPick = null;
          var mixed = null;
          if (needAudio) {
            try {
              mixed = await mixOfflineAudio(duration, 48000, abort);
              audioPick = await pickAudioCodec(mixed.sampleRate || 48000, aBitrate);
            } catch (ae) {
              console.warn('[export] offline audio miks xato, video-only davom:', ae);
              mixed = null;
              audioPick = null;
            }
          }

          var audioSrc = null;
          if (mixed && audioPick) {
            audioSrc = new MB.EncodedAudioPacketSource(audioPick.muxCodec);
            output.addAudioTrack(audioSrc);
          }

          await output.start();

          var videoMeta;
          encoder = new VideoEncoder({
            output: function (chunk, meta) {
              if (meta) videoMeta = meta;
              var pkt = MB.EncodedPacket.fromEncodedChunk(chunk);
              videoSrc.add(pkt, meta || videoMeta);
            },
            error: function (e) { console.error('[export] VideoEncoder', e); }
          });
          encoder.configure(vConfig);

          if (mixed && audioPick && audioSrc) {
            audioEncoder = new AudioEncoder({
              output: function (chunk, meta) {
                var pkt = MB.EncodedPacket.fromEncodedChunk(chunk);
                audioSrc.add(pkt, meta);
              },
              error: function (e) { console.error('[export] AudioEncoder', e); }
            });
            audioEncoder.configure(audioPick.config);

            var channels = [];
            for (var ch = 0; ch < mixed.numberOfChannels; ch++) channels.push(mixed.getChannelData(ch));
            var frameSize = 1024;
            var total = mixed.length;
            var tsUs = 0;
            for (var off = 0; off < total; off += frameSize) {
              if (abort.aborted) throw ExportCore.ExportAbortedError();
              var n = Math.min(frameSize, total - off);
              var planar = new Float32Array(n * mixed.numberOfChannels);
              for (var c = 0; c < mixed.numberOfChannels; c++) {
                planar.set(channels[c].subarray(off, off + n), c * n);
              }
              var asample = new AudioData({
                format: 'f32-planar',
                sampleRate: mixed.sampleRate,
                numberOfFrames: n,
                numberOfChannels: mixed.numberOfChannels,
                timestamp: tsUs,
                data: planar
              });
              tsUs += Math.round((n / mixed.sampleRate) * 1e6);
              while (audioEncoder.encodeQueueSize > 16) {
                await new Promise(function (r) { audioEncoder.addEventListener('dequeue', r, { once: true }); });
              }
              audioEncoder.encode(asample);
              asample.close();
            }
            await audioEncoder.flush();
            try { audioSrc.close(); } catch (_) {}
          }

          var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          for (var i = 0; i < frameCount; i++) {
            if (abort.aborted) throw ExportCore.ExportAbortedError();
            // VFR tuzog'i: kadr indeksi emas, vaqt tamg'asi.
            var t = i / fps;
            await preparePackAt(pack, t);
            renderFrame(ctx, t, outW, outH, pack);

            var vf = new VideoFrame(canvas, {
              timestamp: Math.round(t * 1e6),
              duration: Math.round((1 / fps) * 1e6)
            });
            while (encoder.encodeQueueSize > 8) {
              await new Promise(function (r) { encoder.addEventListener('dequeue', r, { once: true }); });
            }
            encoder.encode(vf, { keyFrame: i % Math.max(1, fps * 2) === 0 });
            vf.close();

            if (i % 3 === 0 || i === frameCount - 1) {
              var elapsedMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
              onProgress({
                ratio: (i + 1) / frameCount,
                frame: i + 1,
                total: frameCount,
                elapsedMs: elapsedMs
              });
            }
          }

          await encoder.flush();
          try { videoSrc.close(); } catch (_) {}
          await output.finalize();

          var buf = target.buffer;
          if (!buf || buf.byteLength < 500) throw new Error('MP4 bo\'sh chiqdi');
          var blob = new Blob([buf], { type: 'video/mp4' });
          await cleanup();
          return { blob: blob, mime: 'video/mp4', path: 'fast', videoOnly: !(mixed && audioPick) };
        } catch (err) {
          await cleanup();
          throw err;
        }
      }

      return {
        run: run,
        loadMediabunny: loadMediabunny,
        sourceTimeAt: function (clip, t) { return ExportCore.sourceTimeAt(clip, t); }
      };
    })();

    if (typeof globalThis !== 'undefined') globalThis.FastExporter = FastExporter;

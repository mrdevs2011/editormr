    // ===================== EXPORT CORE (sof mantiq, DOM shart emas) =====================
    // Sifat presetlari, yo'l tanlash, vaqt taxmini, sourceTime.
    // Brauzer va Node testlari shu obyektni ishlatadi.
    var ExportCore = (function () {
      var LS_KEY = 'emr_export_settings_v1';

      var PATHS = ['fast', 'mp4', 'legacy'];

      var QUALITY = {
        '720p': { id: '720p', maxSide: 1280, label: '720p' },
        '1080p': { id: '1080p', maxSide: 1920, label: '1080p' }
      };

      var BITRATE = {
        telegram: {
          id: 'telegram',
          label: 'Telegram (kichik)',
          videoBps720: 1200000,
          videoBps1080: 1800000,
          audioBps: 96000
        },
        good: {
          id: 'good',
          label: 'Yaxshi',
          videoBps720: 4000000,
          videoBps1080: 6000000,
          audioBps: 128000
        },
        high: {
          id: 'high',
          label: 'Yuqori',
          videoBps720: 8000000,
          videoBps1080: 12000000,
          audioBps: 192000
        }
      };

      var DEFAULTS = {
        quality: '720p',
        fps: 30,
        bitrate: 'good'
      };

      function clampFps(fps) {
        var n = Number(fps);
        if (n === 60) return 60;
        return 30;
      }

      function normalizeSettings(raw) {
        raw = raw || {};
        var q = QUALITY[raw.quality] ? raw.quality : DEFAULTS.quality;
        var b = BITRATE[raw.bitrate] ? raw.bitrate : DEFAULTS.bitrate;
        return {
          quality: q,
          fps: clampFps(raw.fps),
          bitrate: b
        };
      }

      function loadSettings(storage) {
        var store = storage;
        if (!store && typeof localStorage !== 'undefined') store = localStorage;
        if (!store || typeof store.getItem !== 'function') return normalizeSettings(DEFAULTS);
        try {
          return normalizeSettings(JSON.parse(store.getItem(LS_KEY) || 'null'));
        } catch (_) {
          return normalizeSettings(DEFAULTS);
        }
      }

      function saveSettings(settings, storage) {
        var store = storage;
        if (!store && typeof localStorage !== 'undefined') store = localStorage;
        var n = normalizeSettings(settings);
        if (store && typeof store.setItem === 'function') {
          try { store.setItem(LS_KEY, JSON.stringify(n)); } catch (_) {}
        }
        return n;
      }

      function videoBitrate(settings) {
        var s = normalizeSettings(settings);
        var p = BITRATE[s.bitrate];
        return s.quality === '1080p' ? p.videoBps1080 : p.videoBps720;
      }

      function audioBitrate(settings) {
        var s = normalizeSettings(settings);
        return BITRATE[s.bitrate].audioBps;
      }

      function maxSide(settings) {
        var s = normalizeSettings(settings);
        return QUALITY[s.quality].maxSide;
      }

      // URL ?export=legacy|mp4|fast  (boshqa qiymat e'tiborsiz)
      function parseForcedPath(search) {
        var q = String(search || '');
        if (q.charAt(0) === '?') q = q.slice(1);
        var parts = q.split('&');
        for (var i = 0; i < parts.length; i++) {
          var kv = parts[i].split('=');
          if (decodeURIComponent(kv[0] || '') === 'export') {
            var v = decodeURIComponent((kv[1] || '').toLowerCase());
            if (v === 'legacy' || v === 'mp4' || v === 'fast') return v;
          }
        }
        return null;
      }

      function fallbackChain(startPath) {
        var start = PATHS.indexOf(startPath);
        if (start < 0) start = 1; // default: mp4 → legacy (fast faqat beta/flag)
        return PATHS.slice(start);
      }

      function defaultStartPath(forced, wantFast) {
        if (forced) return forced;
        if (wantFast) return 'fast';
        return 'mp4';
      }

      var MP4_MIME_CANDIDATES = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a',
        'video/mp4;codecs=avc1',
        'video/mp4'
      ];

      var WEBM_MIME_CANDIDATES = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ];

      function pickSupportedMime(candidates, isTypeSupported) {
        var fn = isTypeSupported;
        if (!fn && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
          fn = function (m) { return MediaRecorder.isTypeSupported(m); };
        }
        if (!fn) return '';
        for (var i = 0; i < candidates.length; i++) {
          try {
            if (fn(candidates[i])) return candidates[i];
          } catch (_) {}
        }
        return '';
      }

      function pickMp4Mime(isTypeSupported) {
        return pickSupportedMime(MP4_MIME_CANDIDATES, isTypeSupported);
      }

      function pickWebmMime(isTypeSupported) {
        return pickSupportedMime(WEBM_MIME_CANDIDATES, isTypeSupported) || 'video/webm';
      }

      function isMp4Mime(mime) {
        return String(mime || '').indexOf('video/mp4') === 0;
      }

      // sourceTime = trimStart + (t - startTime) * speed
      function sourceTimeAt(clip, t) {
        if (!clip) return 0;
        var speed = (clip.speed && clip.speed > 0) ? clip.speed : 1;
        var trimStart = clip.trimStart || 0;
        var startTime = clip.startTime || 0;
        return trimStart + (t - startTime) * speed;
      }

      function estimateRemainingSec(doneRatio, elapsedMs) {
        if (!(doneRatio > 0.02) || !(elapsedMs > 0)) return null;
        var total = elapsedMs / doneRatio;
        return Math.max(0, (total - elapsedMs) / 1000);
      }

      function formatEta(sec) {
        if (sec == null || !isFinite(sec)) return '';
        var s = Math.round(sec);
        if (s < 60) return s + ' s qoldi';
        var m = Math.floor(s / 60);
        var r = s % 60;
        return m + ' daq ' + r + ' s qoldi';
      }

      function blobExt(mime, fallback) {
        if (isMp4Mime(mime)) return 'mp4';
        if (String(mime || '').indexOf('webm') !== -1) return 'webm';
        return fallback || 'webm';
      }

      function evenDim(n) {
        n = Math.round(Number(n) || 0);
        n = Math.max(2, n - (n % 2));
        return n;
      }

      // Preview cap o'zgarmaydi; export maxSide ni shu yerdan oladi.
      function outputSizeForRatio(ratioWoverH, maxSidePx, fitSource) {
        var maxS = maxSidePx || 1280;
        var w, h;
        if (ratioWoverH && isFinite(ratioWoverH) && ratioWoverH > 0) {
          if (ratioWoverH >= 1) {
            w = maxS;
            h = maxS / ratioWoverH;
          } else {
            h = maxS;
            w = maxS * ratioWoverH;
          }
        } else {
          var s = fitSource || { w: 1280, h: 720 };
          w = s.w;
          h = s.h;
          var m = Math.max(w, h);
          if (m > maxS) {
            var k = maxS / m;
            w *= k;
            h *= k;
          }
        }
        return { w: evenDim(w), h: evenDim(h) };
      }

      function ExportAbortedError(message) {
        var e = new Error(message || 'Export bekor qilindi');
        e.name = 'ExportAbortedError';
        e.aborted = true;
        return e;
      }

      function isAbortError(err) {
        if (!err) return false;
        return !!(err.aborted || err.name === 'ExportAbortedError' || err.name === 'AbortError');
      }

      return {
        LS_KEY: LS_KEY,
        PATHS: PATHS,
        QUALITY: QUALITY,
        BITRATE: BITRATE,
        DEFAULTS: DEFAULTS,
        MP4_MIME_CANDIDATES: MP4_MIME_CANDIDATES,
        WEBM_MIME_CANDIDATES: WEBM_MIME_CANDIDATES,
        normalizeSettings: normalizeSettings,
        loadSettings: loadSettings,
        saveSettings: saveSettings,
        videoBitrate: videoBitrate,
        audioBitrate: audioBitrate,
        maxSide: maxSide,
        parseForcedPath: parseForcedPath,
        fallbackChain: fallbackChain,
        defaultStartPath: defaultStartPath,
        pickSupportedMime: pickSupportedMime,
        pickMp4Mime: pickMp4Mime,
        pickWebmMime: pickWebmMime,
        isMp4Mime: isMp4Mime,
        sourceTimeAt: sourceTimeAt,
        estimateRemainingSec: estimateRemainingSec,
        formatEta: formatEta,
        blobExt: blobExt,
        evenDim: evenDim,
        outputSizeForRatio: outputSizeForRatio,
        ExportAbortedError: ExportAbortedError,
        isAbortError: isAbortError
      };
    })();

    if (typeof globalThis !== 'undefined') globalThis.ExportCore = ExportCore;

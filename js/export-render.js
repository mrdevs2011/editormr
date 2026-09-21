    // ===================== EXPORT RENDER (bitta retsept) =====================
    // Hozirgi export.js chizish mantig'i renderFrame(t) ga ko'chirildi.
    // B2–B5 (rasm clip skip, float 7% pad, matn o'lchami) QASDDAN o'zgartirilmagan.
    // pack.live === true  → MediaRecorder yo'li: video play + 0.12s drift seek
    // pack.live === false → tez export: currentTime allaqachon sourceTime ga seek qilingan

    function exportEnsureClipOnEl(el, clip, t) {
      if (!el || !clip || clip.isImage) return;
      var src = clip.url || state.videoUrl;
      if (src && el.src !== src && !String(el.src || '').endsWith(src) && el.getAttribute('src') !== src) {
        try {
          if (el.src !== src) el.src = src;
        } catch (_) {}
      }
      var sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
      try { el.playbackRate = sp; } catch (_) {}
      var local = typeof timelineToSource === 'function'
        ? timelineToSource(clip, t)
        : ExportCore.sourceTimeAt(clip, t);
      if (Math.abs((el.currentTime || 0) - local) > 0.12) {
        try { el.currentTime = local; } catch (_) {}
      }
      if (el.paused) el.play().catch(function () {});
    }

    function exportDrawClipFrame(ctx, el, clip, t, outW, outH, alpha, pack) {
      if (!el || !clip || clip.isImage) return;
      if (pack && pack.live) exportEnsureClipOnEl(el, clip, t);
      if (el.readyState < 2) return;
      ctx.save();
      ctx.globalAlpha = alpha != null ? alpha : 1;
      try {
        canvasDrawContain(ctx, el, el.videoWidth, el.videoHeight, 0, 0, outW, outH);
      } catch (_) {}
      ctx.restore();
    }

    function exportDrawLayer(ctx, el, clip, t, outW, outH, l, pack) {
      if (l.a <= 0) {
        if (pack && pack.live) exportEnsureClipOnEl(el, clip, t);
        return;
      }
      ctx.save();
      if (l.clip) {
        ctx.beginPath();
        ctx.rect(l.clip[0] * outW, l.clip[1] * outH, (l.clip[2] - l.clip[0]) * outW, (l.clip[3] - l.clip[1]) * outH);
        ctx.clip();
      }
      ctx.translate(l.tx * outW + outW / 2, l.ty * outH + outH / 2);
      ctx.scale(l.s, l.s);
      ctx.translate(-outW / 2, -outH / 2);
      if (l.blur > 0 && 'filter' in ctx) ctx.filter = 'blur(' + (l.blur * Math.min(outW, outH)) + 'px)';
      exportDrawClipFrame(ctx, el, clip, t, outW, outH, l.a, pack);
      ctx.restore();
    }

    function exportDrawTransition(ctx, trans, elapsed, outW, outH, pack) {
      var clipA = trans.from;
      var clipB = trans.to;
      var progress = trans.progress;
      var tStart = trans.start;
      var tB = Math.max(clipB.startTime,
        Math.min(clipEnd(clipB) - 0.04, clipB.startTime + Math.max(0, elapsed - tStart)));
      var L = getTransitionLayers(clipA.transitionType || 'fade', progress);
      if (L.bg) {
        ctx.save();
        ctx.fillStyle = L.bg;
        ctx.fillRect(0, 0, outW, outH);
        ctx.restore();
      }
      var layers = [
        { el: pack.videoA, clip: clipA, t: elapsed, l: L.a },
        { el: pack.videoB, clip: clipB, t: tB, l: L.b }
      ];
      if (L.top === 'a') layers.reverse();
      for (var i = 0; i < layers.length; i++) {
        var x = layers[i];
        exportDrawLayer(ctx, x.el, x.clip, x.t, outW, outH, x.l, pack);
      }
    }

    function exportDrawImagePreview(ctx, outW, outH, pack) {
      var imgEl = pack.imageEl || (typeof document !== 'undefined' ? document.getElementById('image-preview') : null);
      if (imgEl && imgEl.complete) {
        var iw = imgEl.naturalWidth || outW;
        var ih = imgEl.naturalHeight || outH;
        var scale = Math.min(outW / iw, outH / ih);
        var dw = iw * scale, dh = ih * scale;
        ctx.drawImage(imgEl, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
      }
    }

    function exportDrawFloats(ctx, elapsed, outW, outH, pack) {
      if (typeof findFloatedAtTime !== 'function') return;
      var floats = findFloatedAtTime(elapsed);
      for (var i = 0; i < floats.length; i++) {
        var fc = floats[i];
        var fa = typeof getClipOpacity === 'function' ? getClipOpacity(fc, elapsed) : 1;
        var padX = outW * 0.07;
        var padY = outH * 0.07;
        var fw = outW - padX * 2;
        var fh = outH - padY * 2;
        ctx.save();
        ctx.globalAlpha = fa;
        if (fc.isImage) {
          var cache = pack.floatImgCache;
          var img = cache.get(fc.url);
          if (!img) {
            img = new Image();
            img.src = fc.url;
            cache.set(fc.url, img);
          }
          if (img.complete && img.naturalWidth) {
            try { canvasDrawContain(ctx, img, img.naturalWidth, img.naturalHeight, padX, padY, fw, fh); } catch (_) {}
          }
        } else if (pack.videoF) {
          if (pack.live) exportEnsureClipOnEl(pack.videoF, fc, elapsed);
          if (pack.videoF.readyState >= 2) {
            try { canvasDrawContain(ctx, pack.videoF, pack.videoF.videoWidth, pack.videoF.videoHeight, padX, padY, fw, fh); } catch (_) {}
          }
        }
        ctx.restore();
      }
    }

    // t — timeline soniyasi (devor soati EMAS).
    function renderFrame(ctx, t, outW, outH, pack) {
      pack = pack || {};
      if (!pack.floatImgCache) pack.floatImgCache = new Map();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, outW, outH);

      var trans = typeof getActiveTransition === 'function' ? getActiveTransition(t) : null;
      var clip = typeof findClipAtTime === 'function' ? findClipAtTime(t) : null;

      if (trans && pack.videoA) {
        exportDrawTransition(ctx, trans, t, outW, outH, pack);
        if (pack.onVideoClip) pack.onVideoClip(trans.from, t, true);
      } else if (clip) {
        var fadeAlpha = typeof getClipOpacity === 'function' ? getClipOpacity(clip, t) : 1;
        ctx.globalAlpha = fadeAlpha;
        if (state.isImage) {
          exportDrawImagePreview(ctx, outW, outH, pack);
        } else if (clip.isImage) {
          // photo clip — skip (B2, Faza 2)
        } else if (pack.videoA) {
          if (pack.onVideoClip) pack.onVideoClip(clip, t, false);
          if (pack.live) exportEnsureClipOnEl(pack.videoA, clip, t);
          if (pack.videoA.readyState >= 2) {
            try {
              canvasDrawContain(ctx, pack.videoA, pack.videoA.videoWidth, pack.videoA.videoHeight, 0, 0, outW, outH);
            } catch (_) {}
          }
        }
        ctx.globalAlpha = 1;
      } else if (pack.onGap) {
        pack.onGap();
      }

      exportDrawFloats(ctx, t, outW, outH, pack);

      if (typeof drawTextOverlaysOnCanvas === 'function') {
        try { drawTextOverlaysOnCanvas(ctx, outW, outH, t); } catch (_) {}
      }
    }

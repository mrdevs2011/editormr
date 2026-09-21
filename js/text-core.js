    // ===================== TEXT CORE (sof mantiq, DOM shart emas) =====================
    var TextCore = (function () {
      var REF_H = 720; // Faza 2 qarori yo'q — eski fontSize pikselini shu referensga nisbatan size ga o'tkazamiz

      var DEFAULT_STYLE = {
        size: 32 / REF_H,
        posX: 0.5,
        posY: 0.85,
        fontFamily: 'sans-serif',
        weight: 400,
        italic: false,
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 0,
        shadow: null,
        bgColor: '#000000',
        bgOpacity: 0.45,
        bgRadius: 0.2,
        bgPadding: 0.25,
        letterSpacing: 0,
        lineHeight: 1.2,
        maxWidth: 0.9,
        align: 'center',
        anim: { in: { type: 'none', dur: 0.25 }, out: { type: 'none', dur: 0.25 } },
        presetId: null
      };

      var TEXT_PRESETS = [
        { id: 'oddiy', label: 'Oddiy', style: { size: 32 / REF_H, weight: 400, bgOpacity: 0.45, strokeWidth: 0, shadow: null, maxWidth: 0.9, posY: 0.85 } },
        { id: 'sarlavha', label: 'Sarlavha', style: { size: 64 / REF_H, weight: 700, bgOpacity: 0, strokeWidth: 0.04, strokeColor: '#000000', posY: 0.18, maxWidth: 0.92 } },
        { id: 'pastki', label: 'Pastki subtitr', style: { size: 28 / REF_H, weight: 700, bgOpacity: 0.7, posY: 0.75, maxWidth: 0.85 } },
        { id: 'urgu', label: "Urg'u so'z", style: { size: 48 / REF_H, weight: 700, italic: true, bgOpacity: 0, strokeWidth: 0.05, posY: 0.5 } },
        { id: 'yorqin', label: 'Yorqin pill', style: { size: 36 / REF_H, weight: 700, bgColor: '#ffdd33', bgOpacity: 0.95, color: '#111111', posY: 0.82 } }
      ];

      var FONT_CATALOG = [
        { id: 'sans-serif', family: 'sans-serif', label: 'Tizim sans', files: [], latin: true, cyrillic: true },
        { id: 'inter', family: 'EMR Inter', label: 'Inter', files: ['fonts/inter-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'manrope', family: 'EMR Manrope', label: 'Manrope', files: ['fonts/manrope-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'noto-sans', family: 'EMR Noto Sans', label: 'Noto Sans', files: ['fonts/noto-sans-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'source-sans', family: 'EMR Source Sans', label: 'Source Sans', files: ['fonts/source-sans-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'source-serif', family: 'EMR Source Serif', label: 'Source Serif', files: ['fonts/source-serif-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'literata', family: 'EMR Literata', label: 'Literata', files: ['fonts/literata-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'comfortaa', family: 'EMR Comfortaa', label: 'Comfortaa', files: ['fonts/comfortaa-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'caveat', family: 'EMR Caveat', label: "Qo'l yozuvi", files: ['fonts/caveat-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true },
        { id: 'jetbrains', family: 'EMR JetBrains Mono', label: 'Mono', files: ['fonts/jetbrains-mono-latin-ext-cyrillic.woff2'], latin: true, cyrillic: true }
      ];

      function clone(o) {
        return JSON.parse(JSON.stringify(o));
      }

      function applyPreset(presetId) {
        var p = TEXT_PRESETS.filter(function (x) { return x.id === presetId; })[0];
        if (!p) return clone(DEFAULT_STYLE);
        var s = Object.assign(clone(DEFAULT_STYLE), clone(p.style));
        s.presetId = p.id;
        return s;
      }

      function migrateTextClip(raw) {
        raw = raw || {};
        var out = Object.assign({}, raw);
        if (out.size == null) {
          var fs = Number(out.fontSize);
          if (!isFinite(fs) || fs <= 0) fs = 32;
          out.size = fs / REF_H;
        }
        if (out.posX == null) {
          var x = Number(out.x);
          out.posX = (isFinite(x) && x >= 0 && x <= 1) ? x : 0.5;
        }
        if (out.posY == null) {
          var y = Number(out.y);
          out.posY = (isFinite(y) && y >= 0 && y <= 1) ? y : 0.85;
        }
        if (!out.fontFamily) out.fontFamily = DEFAULT_STYLE.fontFamily;
        if (out.weight == null) out.weight = out.bold ? 700 : 400;
        if (out.italic == null) out.italic = false;
        if (out.strokeWidth == null) out.strokeWidth = 0;
        if (!out.strokeColor) out.strokeColor = '#000000';
        if (out.shadow === undefined) out.shadow = null;
        if (out.bgRadius == null) out.bgRadius = DEFAULT_STYLE.bgRadius;
        if (out.bgPadding == null) out.bgPadding = DEFAULT_STYLE.bgPadding;
        if (out.letterSpacing == null) out.letterSpacing = 0;
        if (out.lineHeight == null) out.lineHeight = 1.2;
        if (out.maxWidth == null) out.maxWidth = 0.9;
        if (!out.align) out.align = 'center';
        if (!out.color) out.color = '#ffffff';
        if (!out.bgColor) out.bgColor = '#000000';
        if (out.bgOpacity == null) out.bgOpacity = 0.45;
        if (!out.anim) out.anim = clone(DEFAULT_STYLE.anim);
        if (!out.anim.in) out.anim.in = { type: 'none', dur: 0.25 };
        if (!out.anim.out) out.anim.out = { type: 'none', dur: 0.25 };
        return out;
      }

      function defaultSubtitles() {
        return {
          lang: '',
          cues: [],
          style: Object.assign(clone(DEFAULT_STYLE), {
            size: 28 / REF_H,
            posY: 0.75,
            maxWidth: 0.85,
            weight: 700,
            highlight: { enabled: true, color: '#ffe082', scale: 1.08 }
          }),
          position: { posX: 0.5, posY: 0.75 }
        };
      }

      function measureWidth(text, style, measure) {
        if (!text) return 0;
        var w = measure(text, style);
        var sizePx = (style && style._sizePx) || 0;
        var ls = (style && style.letterSpacing) || 0;
        if (ls && text.length > 1 && sizePx) w += ls * sizePx * (text.length - 1);
        return w;
      }

      function splitLongWord(word, style, maxW, measure) {
        var parts = [];
        var buf = '';
        for (var i = 0; i < word.length; i++) {
          var next = buf + word.charAt(i);
          if (buf && measureWidth(next, style, measure) > maxW) {
            parts.push(buf);
            buf = word.charAt(i);
          } else buf = next;
        }
        if (buf) parts.push(buf);
        return parts.length ? parts : [word];
      }

      function wrapLine(line, style, maxW, measure) {
        if (line === '') return [''];
        var words = line.split(/(\s+)/);
        var rows = [];
        var cur = '';
        function flush() {
          rows.push(cur);
          cur = '';
        }
        for (var i = 0; i < words.length; i++) {
          var tok = words[i];
          if (tok === '') continue;
          if (/^\s+$/.test(tok)) {
            if (cur) cur += tok;
            continue;
          }
          var pieces = measureWidth(tok, style, measure) > maxW
            ? splitLongWord(tok, style, maxW, measure)
            : [tok];
          for (var p = 0; p < pieces.length; p++) {
            var piece = pieces[p];
            var trial = cur ? cur.replace(/\s+$/, '') + (cur ? ' ' : '') + piece : piece;
            if (cur && measureWidth(trial, style, measure) > maxW) {
              flush();
              cur = piece;
            } else {
              cur = trial;
            }
          }
        }
        if (cur || rows.length === 0) rows.push(cur);
        return rows;
      }

      function layoutText(text, style, canvasW, canvasH, measure) {
        style = style ? Object.assign({}, style) : {};
        canvasW = Number(canvasW) || 1;
        canvasH = Number(canvasH) || 1;
        var sizePx = Math.max(1, (style.size != null ? style.size : DEFAULT_STYLE.size) * canvasH);
        style._sizePx = sizePx;
        var maxW = Math.max(8, (style.maxWidth != null ? style.maxWidth : 0.9) * canvasW);
        var lh = (style.lineHeight != null ? style.lineHeight : 1.2) * sizePx;
        var align = style.align || 'center';
        var posX = style.posX != null ? style.posX : 0.5;
        var posY = style.posY != null ? style.posY : 0.85;
        var raw = text == null ? '' : String(text);
        var paras = raw.split('\n');
        var lineTexts = [];
        for (var i = 0; i < paras.length; i++) {
          var wrapped = wrapLine(paras[i], style, maxW, measure);
          for (var j = 0; j < wrapped.length; j++) lineTexts.push(wrapped[j]);
        }
        if (!lineTexts.length) lineTexts = [''];

        var lines = [];
        var maxLineW = 0;
        for (var li = 0; li < lineTexts.length; li++) {
          var lt = lineTexts[li];
          var lw = measureWidth(lt, style, measure);
          if (lw > maxLineW) maxLineW = lw;
        }
        var boxW = Math.min(maxW, Math.max(maxLineW, 1));
        var boxH = lineTexts.length * lh;
        var cx = posX * canvasW;
        var cy = posY * canvasH;
        var boxX = cx - boxW / 2;
        if (align === 'left') boxX = cx - (style.bgPadding || 0) * sizePx;
        if (align === 'right') boxX = cx - boxW + (style.bgPadding || 0) * sizePx;
        var boxY = cy - boxH / 2;

        for (var k = 0; k < lineTexts.length; k++) {
          var tline = lineTexts[k];
          var tw = measureWidth(tline, style, measure);
          var lx = boxX;
          if (align === 'center') lx = boxX + (boxW - tw) / 2;
          if (align === 'right') lx = boxX + (boxW - tw);
          var ly = boxY + k * lh;
          var words = [];
          var acc = 0;
          var parts = tline ? tline.split(/(\s+)/) : [''];
          for (var wi = 0; wi < parts.length; wi++) {
            var wtxt = parts[wi];
            if (!wtxt) continue;
            var ww = measureWidth(wtxt, style, measure);
            words.push({ text: wtxt, x: lx + acc, y: ly, width: ww, height: lh, isSpace: /^\s+$/.test(wtxt) });
            acc += ww;
          }
          lines.push({ text: tline, x: lx, y: ly, width: tw, height: lh, words: words });
        }
        return {
          lines: lines,
          box: { x: boxX, y: boxY, width: boxW, height: boxH },
          sizePx: sizePx,
          lineHeight: lh,
          maxWidthPx: maxW,
          canvasW: canvasW,
          canvasH: canvasH
        };
      }

      function clamp01(n) {
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
      }

      function textAnimState(kind, progress, phase) {
        var p = clamp01(Number(progress) || 0);
        var out = { alpha: 1, scale: 1, dy: 0, revealChars: Infinity };
        if (!kind || kind === 'none' || phase === 'hold') return out;
        if (phase === 'out') {
          if (kind === 'fade') out.alpha = 1 - p;
          else if (kind === 'pop') { out.alpha = 1 - p; out.scale = 1 + 0.08 * p; }
          else if (kind === 'slideUp') { out.alpha = 1 - p; out.dy = -0.15 * p; }
          else if (kind === 'typewriter') { out.alpha = 1; out.revealChars = Infinity; }
          return out;
        }
        // in
        if (kind === 'fade') out.alpha = p;
        else if (kind === 'pop') { out.alpha = p; out.scale = 0.8 + 0.2 * p; }
        else if (kind === 'slideUp') { out.alpha = p; out.dy = 0.15 * (1 - p); }
        else if (kind === 'typewriter') { out.alpha = 1; out.revealChars = p; }
        return out;
      }

      function clipAnimAt(clip, t) {
        var start = clip.startTime || 0;
        var end = start + (clip.duration || 0);
        var dur = Math.max(0.001, end - start);
        var anim = (clip.anim || DEFAULT_STYLE.anim);
        var inD = Math.max(0, (anim.in && anim.in.dur) || 0);
        var outD = Math.max(0, (anim.out && anim.out.dur) || 0);
        if (inD + outD > dur) {
          var k = dur / (inD + outD);
          inD *= k;
          outD *= k;
        }
        var local = t - start;
        if (local < inD && inD > 0) {
          return textAnimState(anim.in.type, local / inD, 'in');
        }
        if (local > dur - outD && outD > 0) {
          return textAnimState(anim.out.type, (local - (dur - outD)) / outD, 'out');
        }
        return textAnimState('none', 1, 'hold');
      }

      function normalizeUzbekApostrophes(text) {
        var s = String(text == null ? '' : text);
        return s.replace(/([A-Za-z\u0400-\u04FF])(['\u2018\u2019\u02BC])/g, function (_, letter, mark) {
          var low = letter.toLowerCase();
          if (low === 'o' || low === 'g') return letter + '\u02BB';
          if (/[A-Za-z]/.test(letter)) return letter + '\u02BC';
          return letter + mark;
        });
      }

      function pad2(n) { return (n < 10 ? '0' : '') + n; }
      function pad3(n) {
        var s = String(Math.max(0, Math.round(n)));
        while (s.length < 3) s = '0' + s;
        return s.slice(0, 3);
      }

      function formatTs(sec, comma) {
        sec = Math.max(0, Number(sec) || 0);
        var ms = Math.round(sec * 1000);
        var h = Math.floor(ms / 3600000); ms -= h * 3600000;
        var m = Math.floor(ms / 60000); ms -= m * 60000;
        var s = Math.floor(ms / 1000); ms -= s * 1000;
        var sep = comma ? ',' : '.';
        return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + sep + pad3(ms);
      }

      function parseTs(raw) {
        var t = String(raw || '').trim().replace(',', '.');
        var parts = t.split(':');
        if (parts.length === 2) parts.unshift('0');
        if (parts.length !== 3) return null;
        var h = Number(parts[0]);
        var m = Number(parts[1]);
        var s = Number(parts[2]);
        if (![h, m, s].every(function (n) { return isFinite(n); })) return null;
        return h * 3600 + m * 60 + s;
      }

      function stripCueTags(s) {
        return String(s || '')
          .replace(/\{\\an\d+\}/g, '')
          .replace(/<\/?(i|b|u|font)[^>]*>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>');
      }

      function parseSubtitles(text) {
        var src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        var skipped = 0;
        var cues = [];
        var isVtt = /^\s*WEBVTT/i.test(src);
        var body = src;
        if (isVtt) {
          body = src.replace(/^\s*WEBVTT[^\n]*\n/, '');
          body = body.replace(/^NOTE[\s\S]*?(?=\n\n|\n\d|\n(?=\d{2}:))/gm, '');
          body = body.replace(/^STYLE[\s\S]*?(?=\n\n)/gm, '');
        }
        var blocks = body.split(/\n{2,}/);
        var idn = 1;
        for (var i = 0; i < blocks.length; i++) {
          var block = blocks[i].trim();
          if (!block) continue;
          if (/^NOTE\b/i.test(block) || /^STYLE\b/i.test(block)) continue;
          var lines = block.split('\n');
          if (lines[0] && !/-->/.test(lines[0]) && lines[1] && /-->/.test(lines[1])) lines.shift();
          var timeLine = lines[0] || '';
          var m = timeLine.match(/([0-9:.,]+)\s*-->\s*([0-9:.,]+)/);
          if (!m) continue;
          var start = parseTs(m[1]);
          var end = parseTs(m[2]);
          if (start == null || end == null || start >= end) { skipped++; continue; }
          var payload = lines.slice(1).join('\n');
          payload = payload.replace(/^[^\n]*align:(start|middle|end)[^\n]*\n/i, '');
          var clean = stripCueTags(payload).trim();
          if (!clean) continue;
          cues.push({ id: 'cue-' + idn++, start: start, end: end, text: clean });
        }
        return { cues: cues, skipped: skipped, format: isVtt ? 'vtt' : 'srt' };
      }

      function formatSrt(cues) {
        var list = cues || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          out.push(String(i + 1));
          out.push(formatTs(c.start, true) + ' --> ' + formatTs(c.end, true));
          out.push(c.text || '');
          out.push('');
        }
        return out.join('\n');
      }

      function formatVtt(cues) {
        return 'WEBVTT\n\n' + formatSrt(cues).replace(/,/g, '.');
      }

      function detectAndDecode(bytes) {
        var buf = bytes instanceof ArrayBuffer ? bytes : (bytes && bytes.buffer) || bytes;
        var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        try {
          var utf = new TextDecoder('utf-8', { fatal: true }).decode(u8);
          return { text: utf, encoding: 'utf-8' };
        } catch (_) {
          try {
            var win = new TextDecoder('windows-1251').decode(u8);
            return { text: win, encoding: 'windows-1251' };
          } catch (e2) {
            return { text: new TextDecoder('utf-8').decode(u8), encoding: 'utf-8-lossy' };
          }
        }
      }

      function splitScriptIntoCues(text, opts) {
        opts = opts || {};
        var maxChars = opts.maxChars || 42;
        var raw = String(text || '').replace(/\r/g, '').trim();
        if (!raw) return [];
        var parts = raw.split(/\n+/);
        var cues = [];
        var n = 1;
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i].trim();
          if (!p) continue;
          if (p.length <= maxChars) {
            cues.push({ id: 'cue-' + n++, text: p });
            continue;
          }
          var sents = p.split(/([.!?…]+)\s+/);
          var rebuilt = [];
          for (var si = 0; si < sents.length; si++) {
            if (/^[.!?…]+$/.test(sents[si]) && rebuilt.length) rebuilt[rebuilt.length - 1] += sents[si];
            else if (sents[si]) rebuilt.push(sents[si]);
          }
          sents = rebuilt.length ? rebuilt : [p];
          var buf = '';
          function pushBuf() {
            if (buf) { cues.push({ id: 'cue-' + n++, text: buf.trim() }); buf = ''; }
          }
          for (var s = 0; s < sents.length; s++) {
            var piece = sents[s];
            if ((buf + ' ' + piece).trim().length > maxChars) {
              pushBuf();
              if (piece.length > maxChars) {
                var words = piece.split(/\s+/);
                var wbuf = '';
                for (var w = 0; w < words.length; w++) {
                  if ((wbuf + ' ' + words[w]).trim().length > maxChars) {
                    if (wbuf) cues.push({ id: 'cue-' + n++, text: wbuf.trim() });
                    wbuf = words[w];
                  } else wbuf = (wbuf + ' ' + words[w]).trim();
                }
                if (wbuf) cues.push({ id: 'cue-' + n++, text: wbuf.trim() });
              } else buf = piece;
            } else buf = (buf + ' ' + piece).trim();
          }
          pushBuf();
        }
        return cues;
      }

      function applyTapTimes(lines, tapTimes, opts) {
        opts = opts || {};
        var offset = (opts.offsetMs || 0) / 1000;
        var tail = opts.tailSec != null ? opts.tailSec : 1.2;
        var cues = [];
        for (var i = 0; i < lines.length; i++) {
          var t0 = (tapTimes[i] != null ? tapTimes[i] : 0) + offset;
          var t1;
          if (tapTimes[i + 1] != null) t1 = tapTimes[i + 1] + offset;
          else t1 = t0 + tail;
          if (t1 <= t0) t1 = t0 + 0.2;
          cues.push({ id: 'cue-' + (i + 1), start: Math.max(0, t0), end: Math.max(0.05, t1), text: lines[i] });
        }
        return cues;
      }

      function activeWordIndex(words, t) {
        if (!words || !words.length) return -1;
        for (var i = 0; i < words.length; i++) {
          var w = words[i];
          if (t >= w.t0 && t < w.t1) return i;
        }
        if (t >= words[words.length - 1].t1) return words.length - 1;
        return -1;
      }

      function estimateWordTimings(text, start, end) {
        var words = String(text || '').trim().split(/\s+/).filter(Boolean);
        var dur = Math.max(0.05, (end || 0) - (start || 0));
        var totalChars = words.reduce(function (s, w) { return s + Math.max(1, w.length); }, 0) || 1;
        var t = start || 0;
        var out = [];
        for (var i = 0; i < words.length; i++) {
          var frac = Math.max(1, words[i].length) / totalChars;
          var t1 = t + dur * frac;
          out.push({ t0: t, t1: t1, w: words[i], estimated: true });
          t = t1;
        }
        return out;
      }

      function groupWordsIntoCues(words, opts) {
        opts = opts || {};
        var maxChars = opts.maxCharsPerLine || 32;
        var maxLines = opts.maxLines || 2;
        var maxDur = opts.maxDurSec || 4;
        var pause = opts.pauseSplitSec || 0.4;
        var maxBox = maxChars * maxLines;
        var cues = [];
        var cur = [];
        function charsOf(arr) {
          return arr.reduce(function (s, w) { return s + (w.w ? w.w.length : 0) + 1; }, 0);
        }
        function flush() {
          if (!cur.length) return;
          var text = cur.map(function (w) { return w.w; }).join(' ');
          cues.push({
            id: 'cue-' + (cues.length + 1),
            start: cur[0].t0,
            end: cur[cur.length - 1].t1,
            text: text,
            words: cur.slice()
          });
          cur = [];
        }
        for (var i = 0; i < (words || []).length; i++) {
          var w = words[i];
          if (!cur.length) { cur.push(w); continue; }
          var last = cur[cur.length - 1];
          var gap = w.t0 - last.t1;
          var dur = w.t1 - cur[0].t0;
          var punct = /[.!?…]$/.test(last.w || '');
          if (gap >= pause || punct || dur > maxDur || charsOf(cur) + (w.w || '').length > maxBox) {
            flush();
            cur.push(w);
          } else cur.push(w);
        }
        flush();
        return cues;
      }

      function computeWer(ref, hyp) {
        function norm(s) {
          return String(s || '')
            .toLowerCase()
            .replace(/['\u2018\u2019\u02BC\u02BB]/g, "'")
            .replace(/[^\w\u0400-\u04FF']+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        }
        var r = norm(ref);
        var h = norm(hyp);
        var n = r.length;
        var m = h.length;
        if (!n && !m) return 0;
        if (!n) return 1;
        var dp = [];
        for (var i = 0; i <= n; i++) {
          dp[i] = [];
          dp[i][0] = i;
        }
        for (var j = 0; j <= m; j++) dp[0][j] = j;
        for (i = 1; i <= n; i++) {
          for (j = 1; j <= m; j++) {
            var cost = r[i - 1] === h[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
          }
        }
        return dp[n][m] / n;
      }

      function collectFontNeeds(textClips, subtitles) {
        var map = {};
        function add(family, weight) {
          family = family || 'sans-serif';
          weight = weight || 400;
          var k = family + '|' + weight;
          map[k] = { family: family, weight: weight };
        }
        (textClips || []).forEach(function (tc) {
          add(tc.fontFamily, tc.weight || (tc.bold ? 700 : 400));
        });
        if (subtitles && subtitles.style) add(subtitles.style.fontFamily, subtitles.style.weight);
        return Object.keys(map).map(function (k) { return map[k]; });
      }

      function shiftCues(cues, delta) {
        return (cues || []).map(function (c) {
          return Object.assign({}, c, { start: c.start + delta, end: c.end + delta });
        });
      }

      function cuesOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
      }

      return {
        REF_H: REF_H,
        DEFAULT_STYLE: DEFAULT_STYLE,
        TEXT_PRESETS: TEXT_PRESETS,
        FONT_CATALOG: FONT_CATALOG,
        migrateTextClip: migrateTextClip,
        defaultSubtitles: defaultSubtitles,
        applyPreset: applyPreset,
        layoutText: layoutText,
        textAnimState: textAnimState,
        clipAnimAt: clipAnimAt,
        normalizeUzbekApostrophes: normalizeUzbekApostrophes,
        parseSubtitles: parseSubtitles,
        formatSrt: formatSrt,
        formatVtt: formatVtt,
        formatTs: formatTs,
        detectAndDecode: detectAndDecode,
        splitScriptIntoCues: splitScriptIntoCues,
        applyTapTimes: applyTapTimes,
        activeWordIndex: activeWordIndex,
        estimateWordTimings: estimateWordTimings,
        groupWordsIntoCues: groupWordsIntoCues,
        computeWer: computeWer,
        collectFontNeeds: collectFontNeeds,
        shiftCues: shiftCues,
        cuesOverlap: cuesOverlap
      };
    })();

    if (typeof globalThis !== 'undefined') globalThis.TextCore = TextCore;

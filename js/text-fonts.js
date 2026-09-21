    // Shriftlar faqat kerak bo'lganda. Fayllar fonts/ da (OFL).
    async function ensureFontsLoaded(families, text) {
      if (typeof document === 'undefined' || !document.fonts) return;
      const sample = text || 'Oʻzbekcha ғ ҳ ў';
      const list = families || [];
      const jobs = [];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const fam = typeof f === 'string' ? f : f.family;
        const weight = typeof f === 'string' ? 400 : (f.weight || 400);
        if (!fam || fam === 'sans-serif') continue;
        jobs.push(document.fonts.load(weight + ' 48px "' + fam + '"', sample).catch(function () {}));
      }
      await Promise.all(jobs);
    }

    function usedTextSample() {
      let s = '';
      (state.textClips || []).forEach(function (tc) { s += (tc.text || '') + ' '; });
      if (state.subtitles && state.subtitles.cues) {
        state.subtitles.cues.forEach(function (c) { s += (c.text || '') + ' '; });
      }
      return s || 'Oʻzbekcha';
    }

    async function ensureProjectFontsLoaded() {
      if (typeof TextCore === 'undefined') return;
      const needs = TextCore.collectFontNeeds(state.textClips, state.subtitles);
      await ensureFontsLoaded(needs, usedTextSample());
    }

    if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', function () {
        if (typeof updateTextOverlays === 'function') updateTextOverlays();
      });
    }

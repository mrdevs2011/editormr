    // ===================== STATE =====================
    const state = {
      videoFile: null,
      videoUrl: null,
      videoDuration: 0,          // original full duration
      videoClips: [],            // [{ id, ..., speed, fadeIn, fadeOut, transitionType, transitionDuration }]
      selectedClipId: null,      // "asosiy" tanlangan clip (split / preview shu bilan ishlaydi)
      selectedIds: new Set(),    // ko'rinadigan tanlov: clip id lar + 'music' (marquee / multi-select)
      isImage: false,
      filmstrip: null,

      isPlaying: false,
      currentTime: 0,
      pixelsPerSecond: 40,

      music: null,
      textClips: [],             // [{ id, text, startTime, duration, offsetY, x, y, fontSize, color, bold, align, bgColor, bgOpacity }]
      clipboard: null,           // { type: 'clip'|'text', data: {...} } — faqat sessiya ichida

      isDragging: false,
      dragTarget: null,          // 'video' | 'music' | 'text'
      dragClipId: null,
      dragType: null,
      dragStartX: 0,
      dragStartY: 0,
      dragOrigStart: 0,
      dragOrigOffsetY: 0,
      dragOrigTrimStart: 0,
      dragOrigTrimEnd: 0,
      dragGroup: null,           // multi-select drag: [{ clip|music, start, offY }]
      isPlayheadDragging: false,
      isExporting: false,

      // Project (IndexedDB da saqlanadi)
      projectId: null,
      projectName: '',
      projectCreatedAt: 0,
      projectThumb: null,        // dataURL (dashboard uchun)
      savedFileIds: new Set(),   // DB ga allaqachon yozilgan manba fayllar
      isRestoring: false,

      justMarquee: false,        // marquee tugagach keladigan "click" ni yutish uchun
    };

    function makeClipId() {
      return 'c' + Math.random().toString(36).slice(2, 9);
    }

    function makeTextClipId() {
      return 't' + Math.random().toString(36).slice(2, 9);
    }

    function getTextClipById(id) {
      return (state.textClips || []).find(c => c.id === id) || null;
    }

    function textClipEnd(tc) {
      return tc.startTime + Math.max(0.1, tc.duration || 0);
    }

    function textTimelineEnd() {
      let end = 0;
      for (const tc of (state.textClips || [])) end = Math.max(end, textClipEnd(tc));
      return end;
    }

    function getClipById(id) {
      return state.videoClips.find(c => c.id === id) || null;
    }

    function getSelectedClip() {
      return getClipById(state.selectedClipId);
    }

    // Timeline dagi haqiqiy uzunlik: (trimEnd - trimStart) / speed
    function clipDuration(c) {
      const src = Math.max(0, (c.trimEnd - c.trimStart));
      const sp = (c.speed && c.speed > 0) ? c.speed : 1;
      return src / sp;
    }

    function clipEnd(c) {
      return c.startTime + clipDuration(c);
    }

    // Timeline vaqti → manba (original) vaqti
    function timelineToSource(c, t) {
      const sp = (c.speed && c.speed > 0) ? c.speed : 1;
      return c.trimStart + (t - c.startTime) * sp;
    }

    // Manba vaqti → timeline vaqti
    function sourceToTimeline(c, sourceT) {
      const sp = (c.speed && c.speed > 0) ? c.speed : 1;
      return c.startTime + (sourceT - c.trimStart) / sp;
    }

    function videoTimelineEnd() {
      let end = 0;
      for (const c of state.videoClips) end = Math.max(end, clipEnd(c));
      return end;
    }

    function findClipAtTime(t) {
      for (const c of state.videoClips) {
        if (t >= c.startTime && t < clipEnd(c)) return c;
      }
      return null;
    }

    function findNextClip(clip) {
      if (!clip) return null;
      const sorted = [...state.videoClips].sort((a, b) => a.startTime - b.startTime);
      const idx = sorted.findIndex(c => c.id === clip.id);
      return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    }

    function getTransitionDuration(clip) {
      if (!clip || !clip.transitionType || clip.transitionType === 'none') return 0;
      const next = findNextClip(clip);
      if (!next) return 0;
      const dur = clip.transitionDuration != null ? clip.transitionDuration : 0.3;
      const maxD = Math.max(0.05, clipDuration(clip) * 0.5);
      return Math.max(0.05, Math.min(maxD, dur));
    }

    // Outgoing clip A transition zone: [clipEnd(A) - dur, clipEnd(A))
    function getActiveTransition(t) {
      const sorted = [...state.videoClips].sort((a, b) => a.startTime - b.startTime);
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        if (!a.transitionType || a.transitionType === 'none') continue;
        const b = sorted[i + 1];
        const dur = getTransitionDuration(a);
        if (dur <= 0) continue;
        const endA = clipEnd(a);
        const start = endA - dur;
        if (t >= start && t < endA) {
          const progress = Math.max(0, Math.min(1, (t - start) / dur));
          return { from: a, to: b, progress, start, end: endA, duration: dur };
        }
      }
      return null;
    }


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
      dragOrigTrack: 0,
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
      projectUpdatedAt: null,    // oxirgi yuklangan/saqlangan versiya (last-write himoyasi)
      saveForceOverwrite: false, // conflict dialogida "shu versiyani yoz"

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

    function clipsTimeOverlap(aStart, aEnd, bStart, bEnd) {
      return aStart < bEnd - 1e-4 && bStart < aEnd - 1e-4;
    }

    // 1-qator (track 0) = asosiy o'q, hech qachon float emas.
    // 2-qator va pastdagilar (track 1+) = float overlay. Qatorlar kerak bo'lsa o'sadi.
    const MAIN_TRACK = 0;
    const MIN_VIDEO_TRACKS = 2;
    const MAX_VIDEO_TRACKS = 32;

    function getVideoRowHeight() {
      if (window.innerWidth <= 640) return 40;
      return 28;
    }

    function isMainTrack(track) {
      return (track | 0) <= MAIN_TRACK;
    }

    function isFloated(c) {
      if (!c) return false;
      return clipTrackIndex(c) > MAIN_TRACK;
    }

    function clipTrackIndex(c) {
      if (!c) return MAIN_TRACK;
      if (c.track != null && isFinite(c.track)) {
        return Math.max(MAIN_TRACK, Math.min(MAX_VIDEO_TRACKS - 1, Math.round(Number(c.track))));
      }
      // Eski loyihalar: floated=true lekin track yo'q
      if (c.floated) return 1;
      return MAIN_TRACK;
    }

    function applyClipTrack(c, track) {
      if (!c) return MAIN_TRACK;
      const t = Math.max(MAIN_TRACK, Math.min(MAX_VIDEO_TRACKS - 1, Math.round(Number(track) || 0)));
      c.track = t;
      c.floated = t > MAIN_TRACK;
      c.offsetY = t * getVideoRowHeight();
      return t;
    }

    function usedVideoTracks() {
      let maxT = MAIN_TRACK;
      for (const c of (state.videoClips || [])) {
        maxT = Math.max(maxT, clipTrackIndex(c));
      }
      return maxT;
    }

    function visibleVideoRows() {
      return Math.max(MIN_VIDEO_TRACKS, usedVideoTracks() + 1);
    }

    function findFreeFloatTrack(clip, start, excludeIds) {
      const dur = clipDuration(clip);
      const s = Math.max(0, start != null ? start : clip.startTime);
      const e = s + dur;
      excludeIds = excludeIds || new Set([clip.id]);
      for (let t = 1; t < MAX_VIDEO_TRACKS; t++) {
        if (typeof trackSlotFree === 'function') {
          if (trackSlotFree(t, s, e, excludeIds)) return t;
        } else {
          return t;
        }
      }
      return 1;
    }

    function normalizeClipLaneFlags() {
      const pending = [];
      for (const c of (state.videoClips || [])) {
        if (c.floated && (c.track == null || Number(c.track) <= MAIN_TRACK)) pending.push(c);
        else applyClipTrack(c, clipTrackIndex(c));
      }
      for (const c of pending) {
        applyClipTrack(c, findFreeFloatTrack(c, c.startTime, new Set([c.id])));
      }
    }

    function syncVideoLaneHeight() {
      const lane = (typeof videoLane !== 'undefined' && videoLane)
        ? videoLane
        : document.getElementById('video-lane');
      const trackEl = document.getElementById('video-track');
      const pitch = getVideoRowHeight();
      const rows = visibleVideoRows();
      const laneH = rows * pitch + 4;
      if (lane) {
        lane.style.height = laneH + 'px';
        lane.style.minHeight = laneH + 'px';
        lane.style.setProperty('--row-h', pitch + 'px');
      }
      if (trackEl) {
        trackEl.style.height = (laneH + 8) + 'px';
        trackEl.style.minHeight = (laneH + 8) + 'px';
      }
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

    let _sortedClips = null;
    function invalidateClipOrder() { _sortedClips = null; }
    function sortedVideoClips() {
      if (!_sortedClips) {
        _sortedClips = state.videoClips.length > 1
          ? [...state.videoClips].sort((a, b) => a.startTime - b.startTime)
          : state.videoClips.slice();
      }
      return _sortedClips;
    }

    function findClipAtTime(t) {
      let best = null;
      let bestTrack = -1;
      for (const c of state.videoClips) {
        if (isFloated(c)) continue;
        if (t >= c.startTime && t < clipEnd(c)) {
          const tr = clipTrackIndex(c);
          if (tr >= bestTrack) {
            best = c;
            bestTrack = tr;
          }
        }
      }
      return best;
    }

    function findFloatedAtTime(t) {
      const list = [];
      for (const c of state.videoClips) {
        if (!isFloated(c)) continue;
        if (t >= c.startTime && t < clipEnd(c)) list.push(c);
      }
      list.sort((a, b) => a.startTime - b.startTime);
      return list;
    }

    function findNextClip(clip) {
      if (!clip || isFloated(clip)) return null;
      const track = clipTrackIndex(clip);
      const end = clipEnd(clip);
      let best = null;
      let bestStart = Infinity;
      for (const c of state.videoClips) {
        if (c.id === clip.id) continue;
        if (isFloated(c)) continue;
        if (clipTrackIndex(c) !== track) continue;
        if (c.startTime + 1e-4 < end) continue;
        if (c.startTime < bestStart) {
          best = c;
          bestStart = c.startTime;
        }
      }
      return best;
    }

    /** O'rtadagi clip(lar) o'chirilganda/float qilinganda A bilan C ni yopishtirish + transition meros */
    function inheritTransitionsForRemoved(removedClips) {
      const removedIds = new Set((removedClips || []).map(c => c.id));
      const tracks = new Set();
      for (const c of removedClips || []) {
        if (c._wasFloated) continue;
        const tr = c._homeTrack != null ? c._homeTrack : clipTrackIndex(c);
        if (tr > MAIN_TRACK) continue;
        tracks.add(tr);
      }
      for (const tr of tracks) {
        const all = state.videoClips
          .filter(c => {
            if (isFloated(c) && !removedIds.has(c.id)) return false;
            const ctr = (removedIds.has(c.id) && c._homeTrack != null) ? c._homeTrack : clipTrackIndex(c);
            return ctr === tr;
          })
          .sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < all.length; i++) {
          const cur = all[i];
          if (!removedIds.has(cur.id)) continue;
          let prev = null;
          for (let j = i - 1; j >= 0; j--) {
            if (!removedIds.has(all[j].id)) { prev = all[j]; break; }
          }
          let next = null;
          for (let j = i + 1; j < all.length; j++) {
            if (!removedIds.has(all[j].id)) { next = all[j]; break; }
          }
          if (prev && next) {
            const prevHas = prev.transitionType && prev.transitionType !== 'none';
            const curHas = cur.transitionType && cur.transitionType !== 'none';
            if (!prevHas && curHas) {
              prev.transitionType = cur.transitionType;
              prev.transitionDuration = cur.transitionDuration != null ? cur.transitionDuration : 0.3;
            }
          } else if (prev && !next) {
            prev.transitionType = 'none';
          }
        }
      }
    }

    function ripplePackAfterRemove(removedClips) {
      const removedIds = new Set((removedClips || []).map(c => c.id));
      const tracks = new Set();
      for (const c of removedClips || []) {
        if (c._wasFloated) continue;
        const tr = c._homeTrack != null ? c._homeTrack : clipTrackIndex(c);
        if (tr > MAIN_TRACK) continue;
        tracks.add(tr);
      }
      for (const tr of tracks) {
        const kept = state.videoClips
          .filter(c => !removedIds.has(c.id) && !isFloated(c) && clipTrackIndex(c) === tr)
          .sort((a, b) => a.startTime - b.startTime);
        if (!kept.length) continue;
        let cursor = kept[0].startTime;
        for (const c of kept) {
          c.startTime = cursor;
          cursor = clipEnd(c);
        }
      }
    }

    // Transition maksimumi = CHAP (A) clip uzunligi. O'tish A ning oxirida yashaydi, shuning uchun
    // A dan uzun bo'lolmaydi; O'NG (B) clip uzunligi maksimumga TA'SIR QILMAYDI.
    //   Misol: A=2s, B=1s -> 2s;  A=10s, B=1s -> 10s;  A=5s, B=5s -> 5s
    // B o'tishdan qisqa bo'lsa, export'da B oxirgi kadrida qotib turadi (export.js, drawExportTransition).
    // Renderer (getTransitionDuration) ham, transition toast slideri ham SHU funksiyadan o'qiydi.
    function getTransitionMaxDuration(clip) {
      if (!clip || !findNextClip(clip)) return 0;
      return clipDuration(clip);
    }

    function clampTransitionDuration(clip, dur) {
      const maxD = Math.max(0.05, getTransitionMaxDuration(clip));
      return Math.max(0.05, Math.min(maxD, dur));
    }

    function getTransitionDuration(clip) {
      if (!clip || !clip.transitionType || clip.transitionType === 'none') return 0;
      if (!findNextClip(clip)) return 0;
      const dur = clip.transitionDuration != null ? clip.transitionDuration : 0.3;
      return clampTransitionDuration(clip, dur);
    }

    // Outgoing clip A transition zone: [clipEnd(A) - dur, clipEnd(A))
    function getActiveTransition(t) {
      const byTrack = new Map();
      for (const c of state.videoClips) {
        if (isFloated(c)) continue;
        const tr = clipTrackIndex(c);
        if (!byTrack.has(tr)) byTrack.set(tr, []);
        byTrack.get(tr).push(c);
      }
      for (const list of byTrack.values()) {
        list.sort((a, b) => a.startTime - b.startTime);
        for (let i = 0; i < list.length - 1; i++) {
          const a = list[i];
          if (!a.transitionType || a.transitionType === 'none') continue;
          const b = list[i + 1];
          const dur = getTransitionDuration(a);
          if (dur <= 0) continue;
          const endA = clipEnd(a);
          const start = endA - dur;
          if (t >= start && t < endA) {
            const progress = Math.max(0, Math.min(1, (t - start) / dur));
            return { from: a, to: b, progress, start, end: endA, duration: dur };
          }
        }
      }
      return null;
    }

    // ---- Transition turlari: YAGONA manba ----
    // Toast kartalari, timeline badge/junction, context-menu va export.js SHU ro'yxatdan o'qiydi.
    // Yangi tur qo'shish = bu yerga 1 qator + getTransitionLayers() ga 1 case. Boshqa faylga tegish shart emas.
    // Tartib: dastlabki 4 tasi maketdagi (None, Slide left, Slide right, Fade), qolganlari kundalik
    // ishlatilish tartibida (toast'da gorizontal scroll bo'ladi).
    //   badge : timeline'dagi kichik belgi (bo'sh = belgi yo'q)
    //   slide : [dx, dy] — A ketadigan yo'nalish (B teskari tomondan kiradi)
    const TRANSITION_TYPES = [
      { id: 'none',        label: 'None',        badge: '' },
      { id: 'slide-left',  label: 'Slide left',  badge: '\u2190', slide: [-1, 0] },
      { id: 'slide-right', label: 'Slide right', badge: '\u2192', slide: [1, 0] },
      { id: 'fade',        label: 'Fade',        badge: 'F' },
      { id: 'dip-black',   label: 'Dip black',   badge: '\u25A0' },   // A -> qora -> B
      { id: 'dip-white',   label: 'Dip white',   badge: '\u25A1' },   // A -> oq (flash) -> B
      { id: 'zoom',        label: 'Zoom',        badge: '+' },
      { id: 'blur',        label: 'Blur',        badge: 'B' },
      { id: 'slide-up',    label: 'Slide up',    badge: '\u2191', slide: [0, -1] },
      { id: 'wipe-left',   label: 'Wipe left',   badge: '\u25C2' },   // chegara o'ngdan chapga suriladi
      { id: 'wipe-right',  label: 'Wipe right',  badge: '\u25B8' },   // chegara chapdan o'ngga suriladi
    ];

    function getTransitionMeta(id) {
      return TRANSITION_TYPES.find(t => t.id === id) || null;
    }

    function getTransitionBadge(id) {
      const m = getTransitionMeta(id);
      return m ? m.badge : '';
    }

    // Transition matematikasi — export (canvas) ham, toast'dagi jonli preview (CSS) ham AYNAN SHU funksiyadan
    // oladi, shuning uchun preview'da ko'ringan narsa export'da ham xuddi shunday chiqadi.
    //   p: 0..1, CHIZIQLI (easing yo'q). A = ketayotgan clip, B = kirayotgan clip.
    // Qaytadi: { a, b, top, bg }, har bir qatlam (a/b) uchun:
    //   tx, ty : siljish (kadr eni/balandligiga nisbatan; -1..1)
    //   s      : scale (kadr markazidan)
    //   a      : opacity 0..1
    //   blur   : xiralik radiusi (kadrning KICHIK tomoniga nisbatan)
    //   clip   : null yoki [x0, y0, x1, y1] (0..1) — faqat shu to'rtburchak ichi ko'rinadi (wipe)
    //   top    : qaysi qatlam ustida chiziladi ('a' | 'b'),  bg : orqa fon rangi yoki null (dip)
    const TRANSITION_BLUR_MAX = 0.04;   // kichik tomonning 4% i (1080p da ~43px)

    function getTransitionLayers(type, p) {
      const A = { tx: 0, ty: 0, s: 1, a: 1, blur: 0, clip: null };
      const B = { tx: 0, ty: 0, s: 1, a: 1, blur: 0, clip: null };
      let top = 'b';
      let bg = null;
      const meta = getTransitionMeta(type);
      switch (type) {
        case 'fade':
          B.a = p;
          break;
        case 'dip-black':
        case 'dip-white':
          // yarmigacha A so'nadi, keyin B paydo bo'ladi; o'rtada sof fon rangi
          A.a = Math.max(0, 1 - 2 * p);
          B.a = Math.max(0, 2 * p - 1);
          bg = type === 'dip-black' ? '#000' : '#fff';
          break;
        case 'slide-left':
        case 'slide-right':
        case 'slide-up': {
          const d = meta.slide;
          A.tx = d[0] * p;        A.ty = d[1] * p;
          B.tx = -d[0] * (1 - p); B.ty = -d[1] * (1 - p);
          break;
        }
        case 'wipe-left':         // B ustidan chegara o'ngdan chapga surilib ochadi
          B.clip = [1 - p, 0, 1, 1];
          break;
        case 'wipe-right':
          B.clip = [0, 0, p, 1];
          break;
        case 'zoom':
          // A kattalashib so'nadi (tepada), B pastdan biroz kichrayib joyiga o'tiradi. Ikkalasi ham scale >= 1,
          // shuning uchun kadr chetlarida bo'sh joy ko'rinmaydi.
          A.s = 1 + 0.6 * p;
          A.a = 1 - p;
          B.s = 1.15 - 0.15 * p;
          top = 'a';
          break;
        case 'blur':
          // A xiralashadi, B aniqlashib ustidan kiradi. Xira chetlari shaffof bo'lib qolmasligi uchun biroz kattalashtiriladi.
          A.blur = TRANSITION_BLUR_MAX * p;
          B.blur = TRANSITION_BLUR_MAX * (1 - p);
          A.s = 1 + 3 * A.blur;
          B.s = 1 + 3 * B.blur;
          B.a = p;
          break;
        default:                  // none / noma'lum tur — oddiy kesish (A oxirigacha turadi)
          B.a = 0;
      }
      return { a: A, b: B, top, bg };
    }


    // ===================== DRAG LOGIC (video + music) =====================
    // Vertikal + gorizontal drag. Bir qatorda vaqt overlap yo'q — klip boshqa
    // klip USTIGA tushmaydi. Musiqa/matn treki ustiga ham chiqmaydi
    // (faqat video-lane ichidagi qatorlar).

    // clipsTimeOverlap — state.js da e'lon qilingan (B11: bu yerda ilgari
    // aynan bir xil funksiya ikkinchi marta e'lon qilinardi — script tartibiga
    // fragil bog'liqlik edi, global scope'da state.js dagisi ustidan yozilib
    // ketardi; olib tashlandi, state.js dagisi ishlatiladi).

    function videoClipsOnTrack(track, excludeIds) {
      excludeIds = excludeIds || new Set();
      return state.videoClips.filter(c => !excludeIds.has(c.id) && clipTrackIndex(c) === track);
    }

    function trackSlotFree(track, start, end, excludeIds) {
      const others = videoClipsOnTrack(track, excludeIds);
      for (const o of others) {
        if (clipsTimeOverlap(start, end, o.startTime, clipEnd(o))) return false;
      }
      return true;
    }

    /** desired startTime uchun BERILGAN qatordagi boshqa kliplar bilan to'qnashmaydigan eng yaqin qiymat */
    function resolveVideoStartTimeOnTrack(clip, desiredStart, track, excludeIds) {
      const dur = clipDuration(clip);
      if (dur <= 0) return Math.max(0, desiredStart);
      excludeIds = excludeIds || new Set([clip.id]);
      track = Math.max(0, Math.min(MAX_VIDEO_TRACKS - 1, track | 0));

      const others = videoClipsOnTrack(track, excludeIds)
        .map(c => ({ start: c.startTime, end: clipEnd(c) }))
        .sort((a, b) => a.start - b.start);

      let t = Math.max(0, desiredStart);
      for (let guard = 0; guard < 64; guard++) {
        const hit = others.find(o => clipsTimeOverlap(t, t + dur, o.start, o.end));
        if (!hit) break;
        const before = hit.start - dur;
        const after = hit.end;
        const pickBefore = before >= 0 && Math.abs(before - desiredStart) <= Math.abs(after - desiredStart);
        const next = pickBefore ? before : after;
        if (Math.abs(next - t) < 1e-6) t = after;
        else t = next;
        t = Math.max(0, t);
      }
      return t;
    }

    /** Eski API: track 0 (yoki clipning hozirgi qatori) */
    function resolveVideoStartTime(clip, desiredStart, excludeIds) {
      const track = clip ? clipTrackIndex(clip) : 0;
      return resolveVideoStartTimeOnTrack(clip, desiredStart, track, excludeIds);
    }

    /**
     * 1-qator = asosiy o'q (float emas). 2+ qator = float.
     * Asosiy o'q boshqa qatorga "qochib" ketmaydi.
     */
    function resolveVideoPlacement(clip, desiredStart, desiredTrack, excludeIds) {
      const dur = clipDuration(clip);
      excludeIds = excludeIds || new Set([clip.id]);
      desiredStart = Math.max(0, desiredStart);
      desiredTrack = Math.max(0, Math.min(MAX_VIDEO_TRACKS - 1, Math.round(desiredTrack || 0)));
      if (dur <= 0) return { start: desiredStart, track: desiredTrack };

      if (trackSlotFree(desiredTrack, desiredStart, desiredStart + dur, excludeIds)) {
        return { start: desiredStart, track: desiredTrack };
      }

      if (desiredTrack === MAIN_TRACK) {
        return {
          start: resolveVideoStartTimeOnTrack(clip, desiredStart, MAIN_TRACK, excludeIds),
          track: MAIN_TRACK,
        };
      }

      return {
        start: resolveVideoStartTimeOnTrack(clip, desiredStart, desiredTrack, excludeIds),
        track: desiredTrack,
      };
    }

    /**
     * Asosiy qator (track 0): insertAt vaqtda joy ochadi — o'sha nuqtadan
     * keyin boshlanadigan kliplar o'ngga suriladi (drag qilinayotgan klip uchun).
     * 2 ta clip ORTASIGA olib borganda ular joy beradi.
     */
    function rippleInsertOnMain(clip, insertAt, excludeIds) {
      const dur = clipDuration(clip);
      if (dur <= 0) return Math.max(0, insertAt);
      excludeIds = excludeIds || new Set([clip.id]);
      let t = Math.max(0, insertAt);

      const others = videoClipsOnTrack(MAIN_TRACK, excludeIds)
        .slice()
        .sort((a, b) => a.startTime - b.startTime);

      // Kursor clip ichida bo'lsa — yaqin chetga snap (orasiga tushish)
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        const oEnd = clipEnd(o);
        if (t > o.startTime + 1e-3 && t < oEnd - 1e-3) {
          const mid = (o.startTime + oEnd) / 2;
          t = t < mid ? o.startTime : oEnd;
          break;
        }
      }

      // t dan keyin (yoki t da) boshlanadiganlarni o'ngga sur
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (o.startTime >= t - 1e-4) {
          o.startTime += dur;
        }
      }

      // t dan oldin boshlanib t ni kesib o'tadiganlar — ularning oxirini bo'shatish
      // (snap qilingan bo'lsa kamdan-kam); agar hali overlap bo'lsa o'ngga
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        if (excludeIds.has(o.id)) continue;
        if (clipsTimeOverlap(t, t + dur, o.startTime, clipEnd(o))) {
          o.startTime = t + dur;
        }
      }

      return t;
    }

    function snapshotVideoLayout() {
      const map = new Map();
      for (const c of state.videoClips) {
        map.set(c.id, {
          startTime: c.startTime,
          track: clipTrackIndex(c),
          trimStart: c.trimStart,
          trimEnd: c.trimEnd,
        });
      }
      return map;
    }

    function restoreVideoLayout(snap, exceptId) {
      if (!snap) return;
      for (const c of state.videoClips) {
        if (c.id === exceptId) continue;
        const s = snap.get(c.id);
        if (!s) continue;
        c.startTime = s.startTime;
        applyClipTrack(c, s.track);
        // trim faqat drag qilinayotganda o'zgaradi — qolganlarini tikla
        if (s.trimStart != null) c.trimStart = s.trimStart;
        if (s.trimEnd != null) c.trimEnd = s.trimEnd;
      }
    }

    /** Multi-select guruh: bir xil dt + dTrack, tashqi kliplar bilan overlap yo'q */
    function resolveGroupDelta(group, desiredDt, desiredDTrack) {
      const videoG = group.filter(g => g.item && state.videoClips.some(c => c.id === g.item.id));
      if (!videoG.length) {
        return {
          dt: Math.max(desiredDt, -Math.min(...group.map(g => g.start))),
          dTrack: 0,
        };
      }

      const exclude = new Set(videoG.map(g => g.item.id));
      let dt = Math.max(desiredDt, -Math.min(...videoG.map(g => g.start)));
      const dTrack = desiredDTrack || 0;

      const fits = (tryDt, tryDTrack) => {
        for (const g of videoG) {
          const s = g.start + tryDt;
          const e = s + clipDuration(g.item);
          const tr = Math.max(0, Math.min(MAX_VIDEO_TRACKS - 1, (g.track != null ? g.track : clipTrackIndex(g.item)) + tryDTrack));
          if (!trackSlotFree(tr, s, e, exclude)) return false;
        }
        return true;
      };

      if (fits(dt, dTrack)) return { dt, dTrack };

      // Vaqtni saqlab, yaqinroq qator
      for (let dist = 1; dist <= MAX_VIDEO_TRACKS; dist++) {
        for (const alt of [dTrack - dist, dTrack + dist]) {
          if (fits(dt, alt)) return { dt, dTrack: alt };
        }
      }

      // Qatorni saqlab, vaqt snap (guruh chap a'zosiga qarab)
      videoG.sort((a, b) => a.start - b.start);
      const left = videoG[0];
      const leftTrack = Math.max(0, Math.min(MAX_VIDEO_TRACKS - 1, (left.track != null ? left.track : clipTrackIndex(left.item)) + dTrack));
      const snapped = resolveVideoStartTimeOnTrack(left.item, left.start + dt, leftTrack, exclude);
      dt = snapped - left.start;
      dt = Math.max(dt, -Math.min(...videoG.map(g => g.start)));
      return { dt, dTrack };
    }

    /** Mavjud overlap'larni HAR QATOR ichida ketma-ket joylashtirib tuzatish */
    function normalizeVideoOverlaps() {
      const byTrack = new Map();
      for (const c of state.videoClips) {
        const tr = clipTrackIndex(c);
        applyClipTrack(c, tr);
        if (!byTrack.has(tr)) byTrack.set(tr, []);
        byTrack.get(tr).push(c);
      }
      for (const [, list] of byTrack) {
        list.sort((a, b) => a.startTime - b.startTime);
        let cursor = 0;
        for (const c of list) {
          if (c.startTime < cursor - 1e-4) c.startTime = cursor;
          cursor = Math.max(cursor, clipEnd(c));
        }
      }
    }

    let _dragRaf = 0;
    let _dragLastEv = null;

    function startDrag(e, target, type, clipId, origin) {
      if (e && e.cancelable) e.preventDefault();
      if (_dragRaf) {
        cancelAnimationFrame(_dragRaf);
        _dragRaf = 0;
      }
      _dragLastEv = null;
      pushHistory();
      state.isDragging = true;
      state.dragTarget = target;
      state.dragType = type;
      state.dragClipId = clipId || null;
      const ox = origin && origin.x != null ? origin.x : e.clientX;
      const oy = origin && origin.y != null ? origin.y : e.clientY;
      state.dragStartX = ox;
      state.dragStartY = oy;
      state.dragPitch = getVideoRowHeight();
      if (timeRuler) timeRuler.classList.add('hide-ticks');
      document.body.classList.add('is-clip-dragging');

      if (target === 'video') {
        const clip = getClipById(clipId) || getSelectedClip() || state.videoClips[0];
        if (!clip) return;
        state.dragClipId = clip.id;
        state.dragOrigStart = clip.startTime;
        state.dragOrigOffsetY = clip.offsetY || 0;
        state.dragOrigTrack = clipTrackIndex(clip);
        state.dragOrigTrimStart = clip.trimStart;
        state.dragOrigTrimEnd = clip.trimEnd;
        state.dragLayoutSnap = snapshotVideoLayout();
      } else {
        state.dragOrigStart = state.music.startTime;
        state.dragOrigOffsetY = state.music.offsetY || 0;
        state.dragOrigTrimStart = state.music.trimStart;
        state.dragOrigTrimEnd = state.music.trimEnd;
      }

      // Multi-select: tanlangan bloklardan birini ushlasak — HAMMASI birga suriladi
      state.dragGroup = null;
      const grabbedId = target === 'music' ? MUSIC_ID : clipId;
      if (type === 'move' && state.selectedIds.size > 1 && isSelected(grabbedId)) {
        state.dragGroup = [];
        for (const c of state.videoClips) {
          if (isSelected(c.id)) {
            state.dragGroup.push({
              item: c,
              start: c.startTime,
              offY: c.offsetY || 0,
              track: clipTrackIndex(c),
            });
          }
        }
        if (state.music && isSelected(MUSIC_ID)) {
          state.dragGroup.push({
            item: state.music,
            start: state.music.startTime,
            offY: state.music.offsetY || 0,
            track: 0,
          });
        }
      }

      if (typeof hideTransitionJunctions === 'function') hideTransitionJunctions();

      try {
        if (e && e.target && e.pointerId != null) e.target.setPointerCapture(e.pointerId);
      } catch (_) {}

      document.addEventListener('pointermove', onDrag, { passive: false });
      document.addEventListener('pointerup', endDrag);
      document.addEventListener('pointercancel', endDrag);
    }

    function onDrag(e) {
      if (!state.isDragging) return;
      if (e.cancelable) e.preventDefault();
      _dragLastEv = e;
      if (_dragRaf) return;
      _dragRaf = requestAnimationFrame(applyDragFrame);
    }

    function applyDragFrame() {
      _dragRaf = 0;
      const e = _dragLastEv;
      if (!e || !state.isDragging) return;
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      const dt = pxToTime(dx);
      const pitch = state.dragPitch || getVideoRowHeight();
      const dTrack = Math.round(dy / Math.max(24, pitch));

      if (state.dragGroup) {
        const minStart = Math.min(...state.dragGroup.map(g => g.start));
        const dtClamped = Math.max(dt, -minStart);
        for (const g of state.dragGroup) {
          g.item.startTime = Math.max(0, g.start + dtClamped);
          if (state.videoClips.some(c => c.id === g.item.id)) {
            applyClipTrack(g.item, (g.track || 0) + dTrack);
          } else {
            g.item.offsetY = 0;
          }
        }
        if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
        if (typeof syncDraggingClipPositions === 'function') syncDraggingClipPositions();
        stretchTimelineForDrag();
        return;
      }

      if (state.dragTarget === 'video') {
        const clip = getClipById(state.dragClipId);
        if (!clip) return;
        if (state.dragType === 'move') {
          // Har frame: asosiy joylashuvni tikla, keyin yangi joy + asosiy qatorda joy och
          restoreVideoLayout(state.dragLayoutSnap, clip.id);
          const desiredStart = Math.max(0, state.dragOrigStart + dt);
          const desiredTrack = Math.max(0, Math.min(MAX_VIDEO_TRACKS - 1, (state.dragOrigTrack || 0) + dTrack));
          applyClipTrack(clip, desiredTrack);
          if (desiredTrack === MAIN_TRACK) {
            const insertAt = rippleInsertOnMain(clip, desiredStart, new Set([clip.id]));
            clip.startTime = insertAt;
            applyClipTrack(clip, MAIN_TRACK);
          } else {
            // Float qator: oddiy overlap-siz joylashuv
            const place = resolveVideoPlacement(clip, desiredStart, desiredTrack, new Set([clip.id]));
            clip.startTime = place.start;
            applyClipTrack(clip, place.track);
          }
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, clip.trimEnd - 0.15));
          const delta = newTrimStart - state.dragOrigTrimStart;
          clip.trimStart = newTrimStart;
          clip.startTime = Math.max(0, state.dragOrigStart + delta);
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          const maxDur = clip.duration || state.videoDuration || 9999;
          newTrimEnd = Math.max(clip.trimStart + 0.15, Math.min(newTrimEnd, maxDur));
          clip.trimEnd = newTrimEnd;
        }
      } else if (state.dragTarget === 'music' && state.music) {
        if (state.dragType === 'move') {
          state.music.startTime = Math.max(0, state.dragOrigStart + dt);
          state.music.offsetY = 0;
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, state.music.trimEnd - 0.1));
          const delta = newTrimStart - state.dragOrigTrimStart;
          state.music.trimStart = newTrimStart;
          state.music.startTime = Math.max(0, state.dragOrigStart + delta);
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          newTrimEnd = Math.max(state.music.trimStart + 0.1, Math.min(newTrimEnd, state.music.duration));
          state.music.trimEnd = newTrimEnd;
        }
      }

      if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
      if (typeof syncDraggingClipPositions === 'function') syncDraggingClipPositions();
      stretchTimelineForDrag();
    }

    function stretchTimelineForDrag() {
      if (!timelineContent || !timelineScroll) return;
      const totalDuration = Math.max(
        typeof videoTimelineEnd === 'function' ? videoTimelineEnd() : 0,
        state.music ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
        typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
        2
      ) + 2;
      const contentWidth = Math.max(timelineScroll.clientWidth - 16, timeToPx(totalDuration));
      timelineContent.style.width = contentWidth + 'px';
    }

    function endDrag() {
      if (_dragRaf) {
        cancelAnimationFrame(_dragRaf);
        _dragRaf = 0;
        if (_dragLastEv) applyDragFrame();
      }
      _dragLastEv = null;
      document.body.classList.remove('is-clip-dragging');

      // Bo'sh drag — undo stack'ni ifloslantirmaslik
      let changed = false;
      if (state.dragGroup) {
        for (const g of state.dragGroup) {
          if (Math.abs((g.item.startTime || 0) - g.start) > 1e-4) { changed = true; break; }
          if (state.videoClips.some(c => c.id === g.item.id)) {
            if (clipTrackIndex(g.item) !== (g.track || 0)) { changed = true; break; }
          }
        }
      } else if (state.dragTarget === 'video' && state.dragClipId) {
        const clip = getClipById(state.dragClipId);
        if (clip) {
          if (Math.abs(clip.startTime - state.dragOrigStart) > 1e-4) changed = true;
          if (clipTrackIndex(clip) !== (state.dragOrigTrack || 0)) changed = true;
          if (Math.abs((clip.trimStart || 0) - state.dragOrigTrimStart) > 1e-4) changed = true;
          if (Math.abs((clip.trimEnd || 0) - state.dragOrigTrimEnd) > 1e-4) changed = true;
        }
      } else if (state.dragTarget === 'music' && state.music) {
        if (Math.abs(state.music.startTime - state.dragOrigStart) > 1e-4) changed = true;
        if (Math.abs((state.music.trimStart || 0) - state.dragOrigTrimStart) > 1e-4) changed = true;
        if (Math.abs((state.music.trimEnd || 0) - state.dragOrigTrimEnd) > 1e-4) changed = true;
      }
      if (!changed && typeof undoStack !== 'undefined' && undoStack.length) {
        undoStack.pop();
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
      }

      if (state.dragGroup) {
        const vids = state.dragGroup.filter(g => state.videoClips.some(c => c.id === g.item.id));
        if (vids.length) {
          const leavingMain = vids.filter(g => (g.track || 0) === MAIN_TRACK && clipTrackIndex(g.item) > MAIN_TRACK);
          if (leavingMain.length) {
            for (const g of leavingMain) {
              g.item._homeTrack = MAIN_TRACK;
              g.item._wasFloated = false;
            }
            inheritTransitionsForRemoved(leavingMain.map(g => g.item));
            ripplePackAfterRemove(leavingMain.map(g => g.item));
          }
          const exclude = new Set(vids.map(g => g.item.id));
          vids.sort((a, b) => a.item.startTime - b.item.startTime);
          const left = vids[0].item;
          const before = left.startTime;
          const place = resolveVideoPlacement(left, left.startTime, clipTrackIndex(left), exclude);
          left.startTime = place.start;
          applyClipTrack(left, place.track);
          const shift = left.startTime - before;
          if (Math.abs(shift) > 1e-6) {
            for (let i = 1; i < vids.length; i++) {
              vids[i].item.startTime = Math.max(0, vids[i].item.startTime + shift);
            }
          }
          for (const g of vids) applyClipTrack(g.item, clipTrackIndex(g.item));
          normalizeVideoOverlaps();
        }
      } else if (state.dragTarget === 'video' && state.dragClipId) {
        const clip = getClipById(state.dragClipId);
        if (clip && (state.dragType === 'move' || state.dragType === 'trim-left' || state.dragType === 'trim-right')) {
          const origTrack = state.dragOrigTrack || MAIN_TRACK;
          const nowTrack = clipTrackIndex(clip);
          if (state.dragType === 'move' && origTrack === MAIN_TRACK && nowTrack > MAIN_TRACK) {
            clip._homeTrack = MAIN_TRACK;
            clip._wasFloated = false;
            inheritTransitionsForRemoved([clip]);
            // Main dan chiqganda: snap allaqachon restore qilingan emas — packing
            // live drag restore + float place qilgan; asosiy qatorni qayta yig'ish
            ripplePackAfterRemove([clip]);
          }
          if (state.dragType === 'move' && nowTrack === MAIN_TRACK) {
            // Live ripple allaqachon qo'llangan — faqat yakuniy overlap tozalash
            normalizeVideoOverlaps();
          } else if (state.dragType !== 'move' || nowTrack !== MAIN_TRACK) {
            const place = resolveVideoPlacement(clip, clip.startTime, nowTrack);
            clip.startTime = place.start;
            applyClipTrack(clip, place.track);
            if (nowTrack === MAIN_TRACK) normalizeVideoOverlaps();
          }
        }
      }

      if (state.music) state.music.offsetY = 0;

      state.isDragging = false;
      state.dragTarget = null;
      state.dragType = null;
      state.dragClipId = null;
      state.dragGroup = null;
      state.dragPitch = null;
      state.dragLayoutSnap = null;
      scheduleSave();
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onDrag);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
    }

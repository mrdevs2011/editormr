    // ===================== DRAG LOGIC (video + music) =====================
    // Vertikal + gorizontal drag. Bir qatorda vaqt overlap yo'q — klip boshqa
    // klip USTIGA tushmaydi. Musiqa/matn treki ustiga ham chiqmaydi
    // (faqat video-lane ichidagi qatorlar).

    function clipsTimeOverlap(aStart, aEnd, bStart, bEnd) {
      return aStart < bEnd - 1e-4 && bStart < aEnd - 1e-4;
    }

    function videoClipsOnTrack(track, excludeIds) {
      excludeIds = excludeIds || new Set();
      return state.videoClips.filter(c => !isFloated(c) && !excludeIds.has(c.id) && clipTrackIndex(c) === track);
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
     * Vertikal + gorizontal joylash: avvalo vaqtni saqlab bo'sh qator qidiriladi,
     * bo'lmasa shu qatorda vaqt snap qilinadi. Hech qachon ustma-ust tushmaydi.
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

      for (let dist = 1; dist <= MAX_VIDEO_TRACKS; dist++) {
        for (const t of [desiredTrack - dist, desiredTrack + dist]) {
          if (t < 0 || t >= MAX_VIDEO_TRACKS) continue;
          if (trackSlotFree(t, desiredStart, desiredStart + dur, excludeIds)) {
            return { start: desiredStart, track: t };
          }
        }
      }

      return {
        start: resolveVideoStartTimeOnTrack(clip, desiredStart, desiredTrack, excludeIds),
        track: desiredTrack,
      };
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
        if (isFloated(c)) continue;
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

    function startDrag(e, target, type, clipId) {
      e.preventDefault();
      pushHistory();
      state.isDragging = true;
      state.dragTarget = target;
      state.dragType = type;
      state.dragClipId = clipId || null;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      timeRuler.classList.add('hide-ticks');

      if (target === 'video') {
        const clip = getClipById(clipId) || getSelectedClip() || state.videoClips[0];
        if (!clip) return;
        state.dragClipId = clip.id;
        state.dragOrigStart = clip.startTime;
        state.dragOrigOffsetY = clip.offsetY || 0;
        state.dragOrigTrack = clipTrackIndex(clip);
        state.dragOrigTrimStart = clip.trimStart;
        state.dragOrigTrimEnd = clip.trimEnd;
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

      document.addEventListener('pointermove', onDrag);
      document.addEventListener('pointerup', endDrag);
    }

    function onDrag(e) {
      if (!state.isDragging) return;
      const dx = e.clientX - state.dragStartX;
      const dy = e.clientY - state.dragStartY;
      const dt = pxToTime(dx);
      const pitch = getVideoRowHeight();
      const dTrack = Math.round(dy / pitch);

      if (state.dragGroup) {
        const resolved = resolveGroupDelta(state.dragGroup, dt, dTrack);
        for (const g of state.dragGroup) {
          g.item.startTime = Math.max(0, g.start + resolved.dt);
          if (state.videoClips.some(c => c.id === g.item.id)) {
            applyClipTrack(g.item, (g.track || 0) + resolved.dTrack);
          } else {
            // Musiqa o'z trekidan chiqmasin
            g.item.offsetY = 0;
          }
        }
        if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
        updateTimelineLayout();
        return;
      }

      if (state.dragTarget === 'video') {
        const clip = getClipById(state.dragClipId);
        if (!clip) return;
        if (state.dragType === 'move') {
          const desired = Math.max(0, state.dragOrigStart + dt);
          if (isFloated(clip)) {
            clip.startTime = desired;
          } else {
            const desiredTrack = (state.dragOrigTrack || 0) + dTrack;
            const place = resolveVideoPlacement(clip, desired, desiredTrack);
            clip.startTime = place.start;
            applyClipTrack(clip, place.track);
          }
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, clip.trimEnd - 0.15));
          const delta = newTrimStart - state.dragOrigTrimStart;
          clip.trimStart = newTrimStart;
          clip.startTime = state.dragOrigStart + delta;
          if (!isFloated(clip)) {
            clip.startTime = resolveVideoStartTimeOnTrack(clip, clip.startTime, clipTrackIndex(clip));
          }
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          const maxDur = clip.duration || state.videoDuration || 9999;
          newTrimEnd = Math.max(clip.trimStart + 0.15, Math.min(newTrimEnd, maxDur));
          const proposedEnd = clip.startTime + (newTrimEnd - clip.trimStart) / ((clip.speed && clip.speed > 0) ? clip.speed : 1);
          const myTrack = clipTrackIndex(clip);
          for (const other of state.videoClips) {
            if (other.id === clip.id) continue;
            if (isFloated(clip) || isFloated(other)) continue;
            if (clipTrackIndex(other) !== myTrack) continue;
            if (clipsTimeOverlap(clip.startTime, proposedEnd, other.startTime, clipEnd(other))) {
              const maxEnd = other.startTime;
              const maxTimelineDur = Math.max(0.15, maxEnd - clip.startTime);
              const sp = (clip.speed && clip.speed > 0) ? clip.speed : 1;
              newTrimEnd = clip.trimStart + maxTimelineDur * sp;
              break;
            }
          }
          clip.trimEnd = Math.max(clip.trimStart + 0.15, newTrimEnd);
        }
        renderVideoBlock();
      } else if (state.dragTarget === 'music' && state.music) {
        if (state.dragType === 'move') {
          state.music.startTime = Math.max(0, state.dragOrigStart + dt);
          state.music.offsetY = 0; // musiqa trekidan tashqariga chiqmasin
        } else if (state.dragType === 'trim-left') {
          let newTrimStart = state.dragOrigTrimStart + dt;
          newTrimStart = Math.max(0, Math.min(newTrimStart, state.music.trimEnd - 0.1));
          const delta = newTrimStart - state.dragOrigTrimStart;
          state.music.trimStart = newTrimStart;
          state.music.startTime = state.dragOrigStart + delta;
        } else if (state.dragType === 'trim-right') {
          let newTrimEnd = state.dragOrigTrimEnd + dt;
          newTrimEnd = Math.max(state.music.trimStart + 0.1, Math.min(newTrimEnd, state.music.duration));
          state.music.trimEnd = newTrimEnd;
        }
        renderMusicBlock();
      }

      if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
      updateTimelineLayout();
    }

    function endDrag() {
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
          normalizeVideoOverlaps();
        }
      } else if (state.dragTarget === 'video' && state.dragClipId) {
        const clip = getClipById(state.dragClipId);
        if (clip && !isFloated(clip)) {
          if (state.dragType === 'move' || state.dragType === 'trim-left' || state.dragType === 'trim-right') {
            const place = resolveVideoPlacement(clip, clip.startTime, clipTrackIndex(clip));
            clip.startTime = place.start;
            applyClipTrack(clip, place.track);
          }
        }
      }

      if (state.music) state.music.offsetY = 0;

      state.isDragging = false;
      state.dragTarget = null;
      state.dragType = null;
      state.dragClipId = null;
      state.dragGroup = null;
      scheduleSave();
      timeRuler.classList.remove('hide-ticks');
      document.removeEventListener('pointermove', onDrag);
      document.removeEventListener('pointerup', endDrag);
      if (typeof invalidateClipOrder === 'function') invalidateClipOrder();
      if (typeof renderVideoBlock === 'function') renderVideoBlock();
      if (typeof updateTimelineLayout === 'function') updateTimelineLayout();
    }

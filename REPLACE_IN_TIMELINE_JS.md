# Code Snippets — Replace in EMR/js/timeline.js

## 🔴 LOCATION 1: Line 1-35 (updateTimelineLayout function boshidagi)

### OLD CODE (bunaqa):
```javascript
function updateTimelineLayout() {
  const totalDuration = Math.max(
    videoTimelineEnd(),
    state.music ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
    typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
    2
  ) + 2;
  // ...
}
```

### NEW CODE (shunday bo'lsin):
```javascript
// FIRST: Add this helper function BEFORE updateTimelineLayout()
function validateContentBounds() {
  const videoClips = state.clips || [];
  let isVideoInBounds = true;
  
  videoClips.forEach(clip => {
    if (clip.startTime < 0 || clip.startTime + clip.trimEnd - clip.trimStart > (state.maxDuration || 3600)) {
      isVideoInBounds = false;
      clip.isInactive = true;
    } else {
      clip.isInactive = false;
    }
  });

  if (state.music) {
    if (state.music.startTime < 0 || 
        state.music.startTime + (state.music.trimEnd - state.music.trimStart) > (state.maxDuration || 3600)) {
      state.music.isInactive = true;
    } else {
      state.music.isInactive = false;
    }
  }

  if (state.textOverlays && typeof state.textOverlays.forEach === 'function') {
    state.textOverlays.forEach(text => {
      if (text.startTime < 0 || text.startTime + text.duration > (state.maxDuration || 3600)) {
        text.isInactive = true;
      } else {
        text.isInactive = false;
      }
    });
  }

  return isVideoInBounds && (!state.music || !state.music.isInactive);
}

// NOW update updateTimelineLayout():
function updateTimelineLayout() {
  validateContentBounds(); // ← ADD THIS LINE

  const totalDuration = Math.max(
    videoTimelineEnd(),
    state.music && !state.music.isInactive ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
    typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
    2
  ) + 2;

  const contentWidth = Math.max(timelineScroll.clientWidth - 16, timeToPx(totalDuration));
  timelineContent.style.width = contentWidth + 'px';

  const currentPercent = Math.round((timelineSection.offsetHeight / window.innerHeight) * 100);
  timelineSection.classList.toggle('compressed', currentPercent < 38);

  timeRuler.innerHTML = '';
  const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  const step = NICE_STEPS.find(s => s * state.pixelsPerSecond >= 32) || 3600;
  
  for (let t = 0; t <= totalDuration; t += step) {
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    tick.style.left = timeToPx(t) + 'px';
    tick.textContent = formatTime(t);
    tick.style.cursor = 'pointer'; // ← ADD THIS
    timeRuler.appendChild(tick);
  }

  if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
  renderVideoBlock();
  if (state.music && !state.music.isInactive) renderMusicBlock(); // ← CHANGE THIS LINE (add `&& !state.music.isInactive`)
  if (typeof renderTextLane === 'function') renderTextLane();
  updatePlayhead();
}
```

---

## 🔴 LOCATION 2: Line 37-44 (updatePlayhead function)

### OLD CODE:
```javascript
function updatePlayhead() {
  playhead.style.left = (8 + timeToPx(state.currentTime)) + 'px';
  if (typeof updateTextOverlays === 'function') updateTextOverlays();
  updateBlackOverlay();
  const c = findClipAtTime(state.currentTime);
  if (typeof applyPreviewClipFade === 'function') applyPreviewClipFade(c);
  if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
}
```

### NEW CODE:
```javascript
function updatePlayhead() {
  playhead.style.left = (8 + timeToPx(state.currentTime)) + 'px';
  
  // ADD THESE 2 LINES:
  const allInactive = validateContentBounds();
  playhead.classList.toggle('all-content-inactive', !allInactive);
  
  if (typeof updateTextOverlays === 'function') updateTextOverlays();
  updateBlackOverlay();
  const c = findClipAtTime(state.currentTime);
  if (typeof applyPreviewClipFade === 'function') applyPreviewClipFade(c);
  if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
}
```

---

## 🔴 LOCATION 3: Line 46-61 (Playhead pointerdown event — REPLACE COMPLETELY)

### OLD CODE:
```javascript
playhead.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  state.isPlayheadDragging = true;
  playhead.classList.add('dragging');
  timeRuler.classList.add('hide-ticks');
  const wasPlaying = state.isPlaying;
  if (wasPlaying) pauseAll();
  state._wasPlayingBeforeScrub = wasPlaying;

  document.addEventListener('pointermove', onPlayheadDrag);
  document.addEventListener('pointerup', endPlayheadDrag);
});
```

### NEW CODE:
```javascript
// STRICT: Only drag from playhead header (white vertical line)
playhead.addEventListener('pointerdown', (e) => {
  // Only allow drag from the playhead itself (not outside)
  if (e.target !== playhead) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  state.isPlayheadDragging = true;
  playhead.classList.add('dragging');
  timeRuler.classList.add('hide-ticks');
  
  const wasPlaying = state.isPlaying;
  if (wasPlaying) pauseAll();
  state._wasPlayingBeforeScrub = wasPlaying;

  document.addEventListener('pointermove', onPlayheadDrag);
  document.addEventListener('pointerup', endPlayheadDrag);
}, { passive: false });
```

---

## 🔴 LOCATION 4: Line 63-83 (onPlayheadDrag function — UPDATE)

### OLD CODE:
```javascript
function onPlayheadDrag(e) {
  if (!state.isPlayheadDragging) return;
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  const t = Math.max(0, pxToTime(x));
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
  seekPreviewToTime(t);
  if (state.music?.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
}
```

### NEW CODE:
```javascript
function onPlayheadDrag(e) {
  if (!state.isPlayheadDragging) return;
  
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  
  // ADD: Bound checking — playhead can't go beyond timeline
  const maxX = timelineContent.offsetWidth - 8;
  const boundedX = Math.max(0, Math.min(x, maxX));
  const t = pxToTime(boundedX);
  
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
  seekPreviewToTime(t);
  
  // UPDATE: Check if music is in bounds before seeking
  if (state.music && !state.music.isInactive && state.music.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
}
```

---

## 🔴 LOCATION 5: Line 109-132 (timelineContent click event — REPLACE)

### OLD CODE:
```javascript
timelineContent.addEventListener('click', (e) => {
  if (state.isDragging || state.isPlayheadDragging || state.justMarquee) return;
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  if (x < 0) return;
  const t = Math.max(0, pxToTime(x));
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
  updateBlackOverlay();
  seekPreviewToTime(t);
  if (state.music?.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
});
```

### NEW CODE:
```javascript
// CHANGE: Click on TIME RULER (sekundlar qatori) to seek, not content
timeRuler.addEventListener('click', (e) => {
  if (state.isDragging || state.isPlayheadDragging || state.justMarquee) return;
  
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  if (x < 0) return;
  
  const t = Math.max(0, pxToTime(x));
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
  updateBlackOverlay();
  seekPreviewToTime(t);
  
  if (state.music && !state.music.isInactive && state.music.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
});
```

---

## ✅ Summary of Changes

| Location | Change Type | Line # |
|----------|-------------|--------|
| 1 | Add function + modify updateTimelineLayout | 1-35 |
| 2 | Modify updatePlayhead | 37-44 |
| 3 | Modify playhead pointerdown | 46-61 |
| 4 | Modify onPlayheadDrag | 63-83 |
| 5 | Replace timelineContent click → timeRuler click | 109-132 |

---

## 📋 Checklist Before Saving

- [ ] validateContentBounds() function qo'shildi
- [ ] updateTimelineLayout() da validateContentBounds() chaqiriladi
- [ ] updatePlayhead() da inactive class toggle bor
- [ ] onPlayheadDrag() da maxX bound checking bor
- [ ] timelineContent.addEventListener('click') — OLD CODE o'chirildi
- [ ] timeRuler.addEventListener('click') — NEW CODE qo'shildi
- [ ] All state.music checks `&& !state.music.isInactive` qo'shildi

---

**Note**: Bu kodlar 1:1 copy-paste ready. Line number'lar approximate — exact line number'ini "Ctrl+F" orqali toping.

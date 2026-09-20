// ===================== TIMELINE ENHANCEMENTS =====================
// Features:
// 1. Strict playhead drag — faqat header bo'lgan oq chiziqdan suring
// 2. Content bounds validation — agar content joydan chiqsa, inactive
// 3. Smooth real-time playhead movement

// Helper: Check if content is within bounds
function validateContentBounds() {
  // Video clips
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

  // Music
  if (state.music) {
    if (state.music.startTime < 0 || 
        state.music.startTime + (state.music.trimEnd - state.music.trimStart) > (state.maxDuration || 3600)) {
      state.music.isInactive = true;
    } else {
      state.music.isInactive = false;
    }
  }

  // Text overlays (if exists)
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

// Enhanced updateTimelineLayout with bounds checking
function updateTimelineLayout() {
  // Bounds check barcha content
  validateContentBounds();

  const totalDuration = Math.max(
    videoTimelineEnd(),
    state.music && !state.music.isInactive ? state.music.startTime + (state.music.trimEnd - state.music.trimStart) : 0,
    typeof textTimelineEnd === 'function' ? textTimelineEnd() : 0,
    2
  ) + 2;

  const contentWidth = Math.max(timelineScroll.clientWidth - 16, timeToPx(totalDuration));
  timelineContent.style.width = contentWidth + 'px';

  // Timeline height < 38% => time labels yashirish
  const currentPercent = Math.round((timelineSection.offsetHeight / window.innerHeight) * 100);
  timelineSection.classList.toggle('compressed', currentPercent < 38);

  // Ruler
  timeRuler.innerHTML = '';
  const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  const step = NICE_STEPS.find(s => s * state.pixelsPerSecond >= 32) || 3600;
  for (let t = 0; t <= totalDuration; t += step) {
    const tick = document.createElement('div');
    tick.className = 'ruler-tick';
    tick.style.left = timeToPx(t) + 'px';
    tick.textContent = formatTime(t);
    tick.style.cursor = 'pointer'; // Sekundalarga bosish mumkinligini ko'rsatish
    timeRuler.appendChild(tick);
  }

  if (typeof syncVideoLaneHeight === 'function') syncVideoLaneHeight();
  renderVideoBlock();
  if (state.music && !state.music.isInactive) renderMusicBlock();
  if (typeof renderTextLane === 'function') renderTextLane();
  updatePlayhead();
}

// Enhanced updatePlayhead with inactive state styling
function updatePlayhead() {
  playhead.style.left = (8 + timeToPx(state.currentTime)) + 'px';
  
  // Agar hech qanday content joyda bo'lmasa, playhead yashir yoki dim qil
  const allInactive = validateContentBounds();
  playhead.classList.toggle('all-content-inactive', !allInactive);
  
  if (typeof updateTextOverlays === 'function') updateTextOverlays();
  updateBlackOverlay();
  const c = findClipAtTime(state.currentTime);
  if (typeof applyPreviewClipFade === 'function') applyPreviewClipFade(c);
  if (typeof updateMobileToolbar === 'function') updateMobileToolbar();
}

// ===== STRICT PLAYHEAD DRAG: Faqat header'dan suring =====
// Playhead'ni pointerdown event o'rniga, faqat header'dagi oq chiziqdan drag qilish

// Define playhead header (oq vertikal chiziq)
const playheadHandle = playhead; // Yoki alohida element qil agar kerak

playheadHandle.addEventListener('pointerdown', (e) => {
  // Faqat playhead'nin o'zidan chiqsa, drag qilma
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

function onPlayheadDrag(e) {
  if (!state.isPlayheadDragging) return;
  
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  
  // Playhead faqat 0 dan totalDuration'gacha suring
  const maxX = timelineContent.offsetWidth - 8;
  const boundedX = Math.max(0, Math.min(x, maxX));
  const t = pxToTime(boundedX);
  
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();

  // Live seek video
  seekPreviewToTime(t);

  // Live seek music (agar in bounds bo'lsa)
  if (state.music && !state.music.isInactive && state.music.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
}

function endPlayheadDrag() {
  state.isPlayheadDragging = false;
  playhead.classList.remove('dragging');
  timeRuler.classList.remove('hide-ticks');
  document.removeEventListener('pointermove', onPlayheadDrag);
  document.removeEventListener('pointerup', endPlayheadDrag);

  // Magnetic snap — eng yaqin kesikka (0.15s ichida)
  const nearest = findNearestCutPoint(state.currentTime);
  if (Math.abs(nearest - state.currentTime) < 0.15) {
    state.currentTime = nearest;
  }
  updatePlayhead();
  updateTimeDisplay();
  updateBlackOverlay();
  seekPreviewToTime(state.currentTime);

  if (state._wasPlayingBeforeScrub) {
    playAll();
  }
  state._wasPlayingBeforeScrub = false;
}

// ===== TIME RULER — CLICK SEEK (FAQAT SECONDLAR QATORIGA) =====
timeRuler.addEventListener('click', (e) => {
  if (state.isDragging || state.isPlayheadDragging || state.justMarquee) return;
  
  // Faqat tick'larga (sekundlar qatoriga) bosish qabul qilinadisi
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  
  if (x < 0) return;
  
  const t = Math.max(0, pxToTime(x));
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
  updateBlackOverlay();

  // Seek video
  seekPreviewToTime(t);

  // Seek music
  if (state.music && !state.music.isInactive && state.music.audio) {
    const m = state.music;
    const local = t - m.startTime + m.trimStart;
    if (local >= m.trimStart && local <= m.trimEnd) {
      m.audio.currentTime = local;
    }
  }
});

// ===== CONTENT INACTIVE STYLING =====
// CSS'da qo'shish kerak:
/*
.playhead.all-content-inactive {
  opacity: 0.5;
  background: rgba(255, 255, 255, 0.3);
}

.track.inactive {
  opacity: 0.4;
  pointer-events: none;
}

.media-block.inactive {
  opacity: 0.4;
  background: rgba(100, 100, 100, 0.3) !important;
  border-color: rgba(100, 100, 100, 0.5) !important;
}
*/

// Helper function to update inactive styling
function updateInactiveStyling() {
  // Video blocks
  const videoBlocks = document.querySelectorAll('.media-block');
  videoBlocks.forEach((block, i) => {
    if (state.clips[i] && state.clips[i].isInactive) {
      block.classList.add('inactive');
    } else {
      block.classList.remove('inactive');
    }
  });

  // Music block
  const musicBlock = document.querySelector('#music-lane .media-block');
  if (musicBlock && state.music && state.music.isInactive) {
    musicBlock.classList.add('inactive');
  } else if (musicBlock) {
    musicBlock.classList.remove('inactive');
  }

  // Text overlays
  const textBlocks = document.querySelectorAll('#text-lane .text-block');
  textBlocks.forEach((block, i) => {
    if (state.textOverlays[i] && state.textOverlays[i].isInactive) {
      block.classList.add('inactive');
    } else if (textBlocks[i]) {
      textBlocks[i].classList.remove('inactive');
    }
  });
}

// Call updateInactiveStyling in renderVideoBlock, renderMusicBlock, renderTextLane after rendering

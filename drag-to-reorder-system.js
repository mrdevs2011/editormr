// ===================== DRAG-TO-REORDER SYSTEM =====================
// Features:
// 1. Line 1 = Header (no clips, sticky guide line)
// 2. Lines 2+ = Actual clips
// 3. Drag clip → drop between clips → reorder
// 4. Visual feedback: drop zones, ghost element, snap

// ===== TRACK STRUCTURE =====
// Track (video-track)
//   ├─ Lane (video-lane) — contains all content
//       ├─ Header Line (line-header) — static, no clips
//       ├─ Track Line 1 (track-line-1)
//       │   └─ Clip 1, Clip 2, Clip 3
//       ├─ Track Line 2 (track-line-2)
//       │   └─ Clip 4, Clip 5
//       └─ Track Line 3 (track-line-3)
//           └─ Clip 6

// ===== HELPER: Calculate dropzone height & gaps =====
function calculateLineLayout() {
  const lineHeight = 50; // px, har bir line'ning height
  const gap = 2; // px, lines orasida gap
  return { lineHeight, gap };
}

// ===== HELPER: Get track line at Y position =====
function getTrackLineAtY(y, trackElement) {
  const lines = trackElement.querySelectorAll('.track-line');
  const rect = trackElement.getBoundingClientRect();
  const relativeY = y - rect.top;
  
  for (let i = 0; i < lines.length; i++) {
    const lineRect = lines[i].getBoundingClientRect();
    const lineRelativeY = lineRect.top - rect.top;
    const lineRelativeBottom = lineRelativeY + lineRect.height;
    
    if (relativeY >= lineRelativeY && relativeY <= lineRelativeBottom) {
      return { line: lines[i], lineIndex: i, y: relativeY - lineRelativeY };
    }
  }
  
  return null;
}

// ===== HELPER: Prevent dragging from line 1 (header) =====
function isHeaderLine(lineElement) {
  return lineElement && lineElement.classList.contains('line-header');
}

// ===== HELPER: Get dropzone insert position =====
function getDropPosition(droppedY, targetLine) {
  if (!targetLine) return null;
  
  const clips = targetLine.querySelectorAll('.media-block:not(.dragging)');
  const lineHeight = targetLine.offsetHeight;
  const midpoint = lineHeight / 2;
  
  // Agar Y position line'ning birinchi yarmisida bo'lsa, boshiga qo'sh
  if (droppedY < midpoint) {
    return { position: 'before', targetClip: clips[0] || null };
  } else {
    return { position: 'after', targetClip: clips[clips.length - 1] || null };
  }
}

// ===== STATE: Track drag state =====
state.draggedClip = null;
state.dragSourceLine = null;
state.dragSourceIndex = null;
state.dropZoneActive = null;

// ===== ENHANCED: Media block drag setup =====
function setupMediaBlockDrag(clipElement, clipIndex, lineElement) {
  clipElement.addEventListener('pointerdown', (e) => {
    // Playhead drag bo'lsa, skip
    if (state.isPlayheadDragging) return;
    
    // Agar resize handle'dan drag bo'lsa, skip
    if (e.target.closest('.resize-handle')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Header line'dan clip olmasa (line 1 = header)
    if (isHeaderLine(lineElement)) return;
    
    state.isDragging = true;
    state.draggedClip = clipElement;
    state.dragSourceLine = lineElement;
    state.dragSourceIndex = clipIndex;
    
    clipElement.classList.add('dragging');
    
    // Ghost element (dragging visual)
    const ghost = clipElement.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.7';
    ghost.style.zIndex = '1000';
    document.body.appendChild(ghost);
    
    const rect = clipElement.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let offsetX = e.clientX - rect.left;
    let offsetY = e.clientY - rect.top;
    
    function onDragMove(moveEvent) {
      if (!state.draggedClip) return;
      
      // Ghost element ko'rsat
      ghost.style.left = (moveEvent.clientX - offsetX) + 'px';
      ghost.style.top = (moveEvent.clientY - offsetY) + 'px';
      
      // Dropzone feedback
      const targetLine = getTrackLineAtY(moveEvent.clientY, lineElement.closest('.track-lane'));
      
      if (targetLine && !isHeaderLine(targetLine.line)) {
        // Valid dropzone
        state.dropZoneActive = targetLine;
        targetLine.line.classList.add('drop-zone-active');
        clipElement.classList.add('dragging-over');
      } else {
        // Invalid (header line yoki joydan chiqdi)
        if (state.dropZoneActive) {
          state.dropZoneActive.line.classList.remove('drop-zone-active');
        }
        clipElement.classList.remove('dragging-over');
        state.dropZoneActive = null;
      }
    }
    
    function onDragEnd(endEvent) {
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      
      ghost.remove();
      state.isDragging = false;
      clipElement.classList.remove('dragging');
      clipElement.classList.remove('dragging-over');
      
      if (state.dropZoneActive) {
        state.dropZoneActive.line.classList.remove('drop-zone-active');
        
        // DROP LOGIC: Move clip to new line/position
        const targetLine = state.dropZoneActive.line;
        const dropPos = getDropPosition(state.dropZoneActive.y, targetLine);
        
        // Hozirgi line'dan clip olib tashla
        const clip = state.clips[state.dragSourceIndex];
        state.clips.splice(state.dragSourceIndex, 1);
        
        // Yangi line'ga clip qo'shish
        if (dropPos.targetClip) {
          const targetClipIndex = state.clips.indexOf(dropPos.targetClip);
          if (dropPos.position === 'before') {
            state.clips.splice(targetClipIndex, 0, clip);
          } else {
            state.clips.splice(targetClipIndex + 1, 0, clip);
          }
        } else {
          state.clips.push(clip);
        }
        
        // Update history
        if (typeof addToHistory === 'function') {
          addToHistory();
        }
        
        // Re-render
        renderVideoBlock();
      }
      
      state.draggedClip = null;
      state.dragSourceLine = null;
      state.dragSourceIndex = null;
      state.dropZoneActive = null;
    }
    
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
  }, { passive: false });
}

// ===== RENDER: Create header line (no clips) =====
function renderHeaderLine(laneElement) {
  // Remove existing header
  const existingHeader = laneElement.querySelector('.line-header');
  if (existingHeader) existingHeader.remove();
  
  // Create header line
  const headerLine = document.createElement('div');
  headerLine.className = 'track-line line-header';
  headerLine.id = 'line-header';
  headerLine.innerHTML = `
    <div class="line-label">
      <span class="label-text">Track</span>
      <span class="label-icon">━</span>
    </div>
  `;
  
  laneElement.insertBefore(headerLine, laneElement.firstChild);
}

// ===== RENDER: Create track lines =====
function createTrackLines(laneElement, numberOfLines) {
  // Header daqiqa mavjud bo'lsin
  renderHeaderLine(laneElement);
  
  // Hozirgi track lines'ni olib tashla (header'dan keyin)
  laneElement.querySelectorAll('.track-line:not(.line-header)').forEach(line => line.remove());
  
  // Yangi track lines qo'shish (Line 1, Line 2, etc)
  for (let i = 0; i < numberOfLines; i++) {
    const trackLine = document.createElement('div');
    trackLine.className = 'track-line';
    trackLine.id = `track-line-${i}`;
    trackLine.dataset.lineIndex = i;
    trackLine.innerHTML = `
      <div class="line-label">
        <span class="label-text">Line ${i + 1}</span>
        <span class="clip-count">(0)</span>
      </div>
      <div class="line-clips"></div>
    `;
    laneElement.appendChild(trackLine);
  }
}

// ===== RENDER: Distribute clips to lines =====
function distributeClipsToLines(laneElement) {
  const lineClipsContainers = laneElement.querySelectorAll('.line-clips');
  
  // Clear existing clips from all lines
  lineClipsContainers.forEach(container => {
    container.innerHTML = '';
  });
  
  // Distribute clips across lines
  const clipsPerLine = Math.ceil(state.clips.length / lineClipsContainers.length);
  let clipIndex = 0;
  
  lineClipsContainers.forEach((container, lineIndex) => {
    for (let i = 0; i < clipsPerLine && clipIndex < state.clips.length; i++) {
      const clip = state.clips[clipIndex];
      const clipElement = createMediaBlockElement(clip, clipIndex);
      
      // Setup drag-to-reorder
      setupMediaBlockDrag(clipElement, clipIndex, container.closest('.track-line'));
      
      container.appendChild(clipElement);
      clipIndex++;
    }
    
    // Update clip count
    const lineElement = container.closest('.track-line');
    const countSpan = lineElement.querySelector('.clip-count');
    if (countSpan) {
      countSpan.textContent = `(${container.children.length})`;
    }
  });
}

// ===== ENHANCED: renderVideoBlock with line system =====
function renderVideoBlockWithLines() {
  if (!videoLane) return;
  
  const numberOfLines = Math.max(3, Math.ceil(state.clips.length / 5)); // Min 3 lines
  createTrackLines(videoLane, numberOfLines);
  distributeClipsToLines(videoLane);
  
  updateBlackOverlay();
}

// ===== CSS CLASSES (add to stylesheet) =====
/*
.track-line {
  display: flex;
  align-items: center;
  height: 50px;
  background: #0f1113;
  border-bottom: 1px solid #1c1e21;
  position: relative;
  padding: 0 8px;
  gap: 8px;
}

.track-line.line-header {
  background: #1a1d22;
  border-bottom: 2px solid #303339;
  font-weight: bold;
  height: 40px;
}

.line-label {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 80px;
  font-size: 11px;
  color: #6b7280;
  user-select: none;
}

.line-label .label-text {
  font-weight: 500;
}

.line-label .label-icon {
  color: #404854;
}

.clip-count {
  font-size: 9px;
  color: #4f555f;
  margin-left: 4px;
}

.line-clips {
  display: flex;
  gap: 4px;
  flex: 1;
  align-items: center;
  min-height: 100%;
  flex-wrap: wrap;
  align-content: center;
}

.media-block {
  flex-shrink: 0;
  position: relative;
  cursor: grab;
  transition: all 0.15s ease;
}

.media-block:hover {
  filter: brightness(1.1);
}

.media-block.dragging {
  opacity: 0.5;
  cursor: grabbing;
  transform: scale(0.95);
}

.drag-ghost {
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.5);
  border: 2px solid var(--brand-blue);
  border-radius: 4px;
}

.track-line.drop-zone-active {
  background: rgba(100, 150, 255, 0.1);
  border-left: 3px solid var(--brand-blue);
}

.dragging-over {
  opacity: 0.7;
}
*/

// ===== INTEGRATION: Call in main render =====
// Replace: renderVideoBlock() 
// With: renderVideoBlockWithLines()
// Or add alias:
function renderVideoBlock() {
  renderVideoBlockWithLines();
}

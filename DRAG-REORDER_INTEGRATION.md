# Drag-to-Reorder Track Lines System — Integration Guide

## What This Does

```
BEFORE:                          AFTER:
All clips in 1 row              Line Header (sticky, no clips)
├─ Clip 1                        ├─ Line 1
├─ Clip 2                        │  ├─ Clip 1
├─ Clip 3                        │  ├─ Clip 2
└─ Clip 4                        │  └─ Clip 3
                                 ├─ Line 2
                                 │  ├─ Clip 4
                                 │  └─ Clip 5
                                 └─ Line 3
                                    └─ Clip 6

Drag Clip 1 → Drop between Clip 4 & Clip 5 → Reorders! ✅
```

## Features

1. **Line Header** (Line 0) — Sticky guide, no clips, visual separator
2. **Multiple Lines** (Line 1, Line 2, etc) — Auto-distributed clips
3. **Drag-to-Reorder** — Grab clip → drag to another line → drop → reorder
4. **Drop Zone Feedback** — Blue highlight shows where it will drop
5. **Ghost Element** — Dragging visual follows mouse
6. **Auto-layout** — Clips auto-distribute across lines

---

## Step-by-Step Integration

### Step 1: Update HTML Structure

EMR/index.html'da video-lane hozirgi bo'ladi:

```html
<!-- BEFORE -->
<div class="track-lane" id="video-lane"></div>

<!-- AFTER (no change needed — JS auto-creates structure) -->
<div class="track-lane" id="video-lane"></div>
```

✅ HTML o'zgarish yo'q! JS auto-creates lines.

### Step 2: Add CSS

**Open**: `css/media-blocks.css`

**Add**: `drag-to-reorder-styles.css` content'i oxiriga

```css
/* Copy ENTIRE drag-to-reorder-styles.css into media-blocks.css tail */
```

Or **alohida file qil**:

```html
<!-- index.html'dagi <head>ga qo'shish -->
<link rel="stylesheet" href="css/drag-to-reorder-styles.css" />
```

### Step 3: Add JavaScript

**Open**: `js/video-blocks.js` (yoki `js/timeline.js`)

**Add**: `drag-to-reorder-system.js` code'ini

Key places to integrate:

#### A. Add state variables (state object'iga):

```javascript
// js/state.js yoki js/projects.js'da add:
state.draggedClip = null;
state.dragSourceLine = null;
state.dragSourceIndex = null;
state.dropZoneActive = null;
```

#### B. Replace renderVideoBlock function:

```javascript
// OLD:
function renderVideoBlock() {
  // ... old code
}

// NEW:
function renderVideoBlock() {
  renderVideoBlockWithLines();
}
```

#### C. Call setupMediaBlockDrag in rendering:

```javascript
// In distributeClipsToLines() — ya setup har clip uchun
setupMediaBlockDrag(clipElement, clipIndex, container.closest('.track-line'));
```

### Step 4: Update createMediaBlockElement

Ensure `createMediaBlockElement()` mavjud va working:

```javascript
function createMediaBlockElement(clip, clipIndex) {
  const block = document.createElement('div');
  block.className = 'media-block';
  block.id = `clip-${clipIndex}`;
  block.textContent = clip.name || `Clip ${clipIndex + 1}`;
  block.dataset.clipIndex = clipIndex;
  return block;
}
```

---

## How It Works

### Drag Flow

1. **User drags clip**
   - `setupMediaBlockDrag()` → `pointerdown` handler
   - Ghost element created
   - `state.draggedClip = clipElement`

2. **While dragging**
   - Ghost follows mouse
   - `getTrackLineAtY()` → find target line
   - If valid line: `.drop-zone-active` class added (blue highlight)

3. **Drop on target**
   - `getDropPosition()` → before/after logic
   - Remove clip from old position
   - Insert clip to new position
   - `renderVideoBlock()` → re-render all
   - History updated

### Line Auto-Distribution

```javascript
const numberOfLines = Math.max(3, Math.ceil(state.clips.length / 5));
// Min 3 lines, max ~5 clips per line
```

---

## Key Functions

### `renderVideoBlockWithLines()`
Creates line structure + distributes clips

### `createTrackLines(laneElement, numberOfLines)`
Creates header line + numbered lines

### `distributeClipsToLines(laneElement)`
Distributes `state.clips` across lines, binds drag events

### `setupMediaBlockDrag(clipElement, clipIndex, lineElement)`
Handles drag logic for single clip

### `getTrackLineAtY(y, trackElement)`
Returns which line is at Y position

### `getDropPosition(droppedY, targetLine)`
Returns drop position (before/after)

---

## CSS Classes Reference

| Class | Purpose |
|-------|---------|
| `.track-line` | Single row container |
| `.line-header` | Line 0 (no clips, sticky) |
| `.line-clips` | Flex container for clips |
| `.media-block` | Individual clip |
| `.dragging` | While dragging (opacity 0.4) |
| `.drag-ghost` | Drag visual (follows mouse) |
| `.drop-zone-active` | Target line (blue highlight) |
| `.dragging-over` | Clip in hover state |

---

## Customization

### Change clips per line:
```javascript
// In distributeClipsToLines():
const clipsPerLine = 4; // instead of Math.ceil(...)
```

### Change line height:
```css
.track-line {
  height: 50px; /* Change this */
}
```

### Change colors:
```css
.track-line {
  background: #0f1113; /* Line background */
}

.media-block {
  background: linear-gradient(135deg, #1a3a52 0%, #0f1f2f 100%); /* Clip */
}

.drop-zone-active {
  border-left: 3px solid var(--brand-blue); /* Highlight */
}
```

### Change animation:
```css
@keyframes drag-float {
  /* Customize here */
}
```

---

## Testing Checklist

- [ ] Lines rendered (header + Line 1, 2, 3)
- [ ] Clips distributed across lines
- [ ] Can grab & drag clip
- [ ] Ghost element visible while dragging
- [ ] Target line highlights (blue) on hover
- [ ] Drop updates order
- [ ] History updated after reorder
- [ ] Mobile: works on small screens
- [ ] Tablet: responsive layout
- [ ] Desktop: smooth interactions
- [ ] No console errors

---

## Troubleshooting

### Lines not showing

**Check**: 
1. `renderVideoBlockWithLines()` called
2. `state.clips` has data
3. `video-lane` element exists
4. CSS loaded

**Fix**: Add console.log:
```javascript
console.log('Lines to create:', numberOfLines);
console.log('Clips to distribute:', state.clips.length);
```

### Drag not working

**Check**:
1. `setupMediaBlockDrag()` called for each clip
2. `pointerdown` handler attached
3. No other drag handler blocking (playhead drag)
4. Touch-action set correctly

**Fix**:
```javascript
// In setupMediaBlockDrag, ensure:
if (state.isPlayheadDragging) return; // Skip if playhead dragging
if (e.target.closest('.resize-handle')) return; // Skip if resize
```

### Drop not reordering

**Check**:
1. `getTrackLineAtY()` returns correct line
2. `getDropPosition()` returns valid position
3. `state.clips` array is being modified
4. `renderVideoBlock()` called after drop

**Fix**: Add debug logging:
```javascript
console.log('Drop position:', dropPos);
console.log('Updated clips:', state.clips);
```

### Styling not applying

**Check**:
1. CSS file linked in `<head>`
2. Class names match exactly
3. No CSS conflicts (z-index, position)
4. Media queries correct

**Fix**: Check in DevTools:
- Inspect `.track-line` → verify styles
- Check cascade (no override)
- Media query breakpoints

---

## Performance Notes

- **Lines created**: O(n) where n = number of clips
- **Drag event handlers**: Attached per clip, removed on drop
- **Re-render**: Full re-render on drop (acceptable for EMR)
- **Ghost element**: Removed after drop
- **Memory**: No memory leaks (proper cleanup)

---

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile Chrome
- ✅ Mobile Safari
- ✅ Touch events

---

## Future Enhancements

1. **Multi-select drag** — Drag multiple clips at once
2. **Smart line creation** — Add/remove lines dynamically
3. **Keyboard shortcuts** — Arrow keys to move between lines
4. **Undo/redo** — Restore clip order on undo
5. **Snap to grid** — Align clips to timeline grid
6. **Clip templates** — Copy-paste clip groups
7. **Line groups** — Fold/expand line groups

---

## API Reference

### Public Functions

```javascript
renderVideoBlockWithLines()  // Main entry point
createTrackLines(lane, num)  // Create line structure
distributeClipsToLines(lane) // Distribute clips
setupMediaBlockDrag(el, idx, line) // Setup drag for clip
getTrackLineAtY(y, track)   // Get line at position
getDropPosition(y, line)    // Get drop insertion point
```

### State Variables

```javascript
state.draggedClip          // Currently dragging clip
state.dragSourceLine       // Original line of dragging clip
state.dragSourceIndex      // Original clip index
state.dropZoneActive       // Current drop target
state.isDragging          // General drag flag
```

---

## Code Flow Diagram

```
User clicks clip
    ↓
setupMediaBlockDrag() → pointerdown
    ↓
state.draggedClip = clip
Create ghost element
    ↓
pointermove → onDragMove()
    ↓
getTrackLineAtY() → find target
    ↓
if valid: add drop-zone-active class
    ↓
pointerup → onDragEnd()
    ↓
getDropPosition() → before/after
    ↓
Modify state.clips array
    ↓
renderVideoBlock()
    ↓
Lines re-render with new order
    ↓
Done! ✅
```

---

## Integration Checklist

- [ ] CSS added to media-blocks.css
- [ ] JavaScript added to timeline.js or video-blocks.js
- [ ] State variables initialized
- [ ] renderVideoBlock() → renderVideoBlockWithLines()
- [ ] createMediaBlockElement() function works
- [ ] setupMediaBlockDrag() bound to all clips
- [ ] renderVideoBlockWithLines() called on init
- [ ] Testing done (desktop, tablet, mobile)
- [ ] Console clear (no errors)
- [ ] History working (undo/redo)

---

## Support

- See code comments in `drag-to-reorder-system.js`
- Check `drag-to-reorder-styles.css` for styling options
- Test in browser DevTools → Elements tab

**Made for MR • UZ-Ready 🇺🇿**

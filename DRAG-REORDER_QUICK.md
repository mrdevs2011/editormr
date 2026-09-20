# Drag-to-Reorder Quick Start

## What You Get

```
Line Header (sticky, no clips)   ← Separates from content
├─ Line 1 (Clip 1, Clip 2, Clip 3)
├─ Line 2 (Clip 4, Clip 5)
└─ Line 3 (Clip 6)

DRAG Clip 1 → DROP between Clip 4 & 5 → REORDER ✅
```

## 3-Step Integration

### 1. Add CSS (2 min)
- Open: `css/media-blocks.css`
- Add: All content from `drag-to-reorder-styles.css` to end
- Test: Lines visible with styling

### 2. Add JavaScript (5 min)
- Open: `js/timeline.js` or `js/video-blocks.js`
- Add: All functions from `drag-to-reorder-system.js`
- Update: `renderVideoBlock()` → call `renderVideoBlockWithLines()`

### 3. Test (5 min)
- Drag clip → Ghost element follows
- Drop on line → Blue highlight shows
- Release → Clip reorders ✅

## Key Changes

```javascript
// Replace this:
function renderVideoBlock() { ... }

// With this:
function renderVideoBlock() {
  renderVideoBlockWithLines();
}
```

```css
/* Add to media-blocks.css: */
.track-line { ... }
.line-header { ... }
.media-block { ... }
.drag-ghost { ... }
```

## Files

- `drag-to-reorder-system.js` — Copy to js/
- `drag-to-reorder-styles.css` — Copy to css/ media-blocks.css
- `DRAG-REORDER_INTEGRATION.md` — Full guide

## Desktop Layout

```
Line Header (40px) ━━━━━━━━━━━━━━━━━━━━
Line 1 (50px)      [Clip 1] [Clip 2] [Clip 3]
Line 2 (50px)      [Clip 4] [Clip 5]
Line 3 (50px)      [Clip 6]
                   ↑
                 Drag from here
```

## Mobile Layout

```
Line Header (40px) ━━━━
Line 1 (38px)      [C1] [C2]
Line 2 (38px)      [C3]
Line 3 (38px)      [C4]
```

## Customization

Change line height:
```css
.track-line {
  height: 50px; /* 40px header */
}
```

Change clips per line:
```javascript
const clipsPerLine = 4; // default: Math.ceil(clips/5)
```

Change colors:
```css
.drop-zone-active {
  border-left: 3px solid YOUR_COLOR;
}
```

## Testing

✅ Lines render with header
✅ Clips distribute across lines
✅ Can drag clips
✅ Ghost element visible
✅ Drop zone highlights blue
✅ Clip reorders on drop
✅ Mobile responsive
✅ No console errors

## Done! 🎬

You now have:
- ✅ Multi-line track layout
- ✅ Drag-to-reorder functionality
- ✅ Smooth animations
- ✅ Mobile support
- ✅ Responsive design

**Time to integrate: 15 minutes total**

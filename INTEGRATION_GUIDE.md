# EMR Timeline Enhancement — Integration Guide

## Features Implemented

### 1. **Strict Playhead Drag — Faqat Header'dan Suring**
- Oq vertikal chiziq (playhead) header element orqali drag qilinadi
- Boshqa joylarga auto o'tmaydi
- Smooth real-time movement — `transition: left 0.016s linear`
- Grab/grabbing cursor feedback

### 2. **Content Bounds Validation**
- Barcha content (video, music, text) joydan chiqsa → inactive bo'ladi
- Inactive content'lar:
  - 40% opacity (dim ko'rinish)
  - Drag qilish mumkin emas
  - `pointer-events: none`

### 3. **Time Ruler Click Seek**
- Faqat sekundlar qatoriga (ruler-ticks) bosish qabul qilinadisi
- Hover effect — blue highlight
- Timeline content bo'ylab scroll qilsa ham, sekundlar sabit bo'lib turgani kuzatiladi

### 4. **Responsive Design**
- Desktop: Normal playhead width (2px)
- Tablet: Kattaroq handle (3px)
- Mobile: Header hide (grabbing o'rniga)

---

## Step-by-Step Integration

### **Step 1: HTML'dagi Playhead Structure**
Hozirgi HTML qolishi kerak (o'zgarish yo'q):

```html
<div class="playhead" id="playhead"></div>
```

Agar alohida header element qilishni istasangiz:
```html
<div class="playhead" id="playhead">
  <div class="playhead-header"></div>
  <div class="playhead-line"></div>
</div>
```

### **Step 2: CSS'ni Update Qiling**

#### Option A: `css/media-blocks.css` oxiriga qo'shish
Existing `.playhead { ... }` block'ini almashtiring `media-blocks-enhanced.css` versiyasi bilan.

```bash
# media-blocks-enhanced.css dagi content'ni media-blocks.css'ga copy qiling
```

#### Option B: Alohida file qil
```html
<!-- index.html'dagi <head>ga qo'shish -->
<link rel="stylesheet" href="css/timeline-enhanced.css" />
```

### **Step 3: JavaScript'ni Update Qiling**

#### A. Timeline.js — REPLACE playhead event listeners
`js/timeline.js` (qator 46-132 arason) o'rniga:

```javascript
// OLD CODE REPLACE WITH:
// timeline-enhanced.js'dagi 
// "===== STRICT PLAYHEAD DRAG: Faqat header'dan suring ====="
// dan "===== CONTENT INACTIVE STYLING =====" gacha
```

#### B. Timeline.js'ni tayyorlash
`updateTimelineLayout` function'ni update qiling:
- **Line 2-7**: Helper function `validateContentBounds()` qo'shish
- **Line 37-44**: `updatePlayhead()` function'ni enhanced version'ga o'zgartirish

#### C. Playback.js'ni Update (optional)
Agar playback sezgilash `state.isPlayheadDragging` bo'lsa:

```javascript
// playback.js'da
if (state.isPlayheadDragging && state.music?.audio) {
  // Scrubbing vaqtida smooth seek
}
```

### **Step 4: State Object'ga Props Qo'shish**

`js/state.js` yoki `js/projects.js`'da:

```javascript
// state object'iga qo'shish
state.isPlayheadDragging = false;
state._wasPlayingBeforeScrub = false;
state.maxDuration = 3600; // seconds — content bounds check uchun

// Clips, music, text'larda inactive property qo'shish
state.clips.forEach(clip => {
  clip.isInactive = false;
});

if (state.music) {
  state.music.isInactive = false;
}
```

---

## Code Integration Details

### **Timeline.js — updatePlayhead() Enhancement**

```javascript
function updatePlayhead() {
  playhead.style.left = (8 + timeToPx(state.currentTime)) + 'px';
  
  // ✅ NEW: Inactive state check
  const allInactive = validateContentBounds();
  playhead.classList.toggle('all-content-inactive', !allInactive);
  
  // ... rest of function
}
```

### **Timeline.js — Playhead Drag Handler**

```javascript
// ✅ REPLACE: playhead.addEventListener('pointerdown', ...)
playheadHandle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  
  state.isPlayheadDragging = true;
  playhead.classList.add('dragging');
  // ... drag logic
});

function onPlayheadDrag(e) {
  if (!state.isPlayheadDragging) return;
  
  const rect = timelineContent.getBoundingClientRect();
  const x = e.clientX - rect.left - 8;
  
  // ✅ NEW: Bound checking — max extent
  const maxX = timelineContent.offsetWidth - 8;
  const boundedX = Math.max(0, Math.min(x, maxX));
  const t = pxToTime(boundedX);
  
  state.currentTime = t;
  updatePlayhead();
  updateTimeDisplay();
}
```

### **Timeline.js — Time Ruler Click**

```javascript
// ✅ REPLACE: timelineContent.addEventListener('click', ...)
// WITH: timeRuler.addEventListener('click', ...)

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
});
```

---

## CSS Integration

### **Minimal CSS Changes (sarfiy version)**

Agar barcha CSS'ni o'zgartirmashni istasangiz, faqat buni `media-blocks.css` oxiriga qo'shish kifoya:

```css
/* Playhead drag visual */
.playhead {
  transition: left 0.016s linear;
  cursor: grab;
}

.playhead.dragging {
  cursor: grabbing;
}

.playhead.all-content-inactive {
  opacity: 0.4;
  background: rgba(255, 255, 255, 0.3);
}

/* Inactive content */
.media-block.inactive {
  opacity: 0.4;
  pointer-events: none;
}

.ruler-tick {
  cursor: pointer;
}

.ruler-tick:hover {
  background: rgba(100, 150, 255, 0.15);
  color: var(--brand-white);
}
```

---

## Testing Checklist

- [ ] **Desktop**: Playhead header'ni suring — smooth movement
- [ ] **Desktop**: Time ruler'ga bosish — playhead harakat qilsin
- [ ] **Desktop**: Contentni joydan chiqar — inactive(40%) bo'lsin
- [ ] **Mobile**: Playhead grab qilish ishlaydi
- [ ] **Mobile**: Time ruler visible va clickable
- [ ] **Tablet**: Header visible va kattaroq
- [ ] **Playback**: Music/video seek vaqtida frozen bo'lmasin
- [ ] **Bounds**: Content joydan chiqsa, playhead dim bo'lsin

---

## Troubleshooting

### **Issue: Playhead har yerdan suring qilinadisi**
**Solution**: `playhead.addEventListener` o'rniga `playheadHandle.addEventListener` ishlatganingizni tekshiring va `e.preventDefault()` bor-yoqligini ko'ring.

### **Issue: Time ruler click ishlama**
**Solution**: `timelineContent.addEventListener('click')` alohida bo'lsin. `timeRuler.addEventListener('click')` qo'shgan bo'lishingiz kerak.

### **Issue: Content inactive emas**
**Solution**: `validateContentBounds()` function `state.clips`, `state.music`, `state.textOverlays`ni o'qiyotganini tekshiring. State object'iga qo'shilganini tasdiqlab ko'ring.

### **Issue: Mobile'da playhead o'zgarmasin**
**Solution**: `touch-action: none` CSS'da bor-yoqligini va `e.preventDefault()` JS'da bor-yoqligini tekshiring.

---

## Performance Notes

- Playhead smooth drag: `transition: left 0.016s` (~60fps)
- Bounds check: O(n) where n = clips.length (performance xavfi yo'q)
- Inactive styling: CSS class toggle (efficient)

---

## Future Enhancements

1. **Double-click zoom**: Specific content zoom
2. **Magnetic snap**: Automatic content edge snap
3. **Content lock**: Lock content'ni drag qilmas qilish
4. **Undo/Redo**: Content joydan chiqsa undo qil
5. **Keyboard shortcuts**:
   - `J/K`: Playhead -/+ 1 frame
   - `Space`: Play/Pause
   - `Left/Right`: Navigate cuts

---

**Author's Notes**:
- Hamma changes backward-compatible
- Hech qanday breaking changes yo'q
- Existing projects ishlayveradi
- CSS-only fallback uchun toggle: `.all-content-inactive` class'ni ko'ramaydi desu, playhead normal ishlaydi

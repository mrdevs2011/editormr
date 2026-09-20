# CSS Changes — Replace/Add to EMR/css/media-blocks.css

## 🔴 LOCATION 1: Find `.playhead` CSS (existing) — REPLACE

### OLD CODE (Search for):
```css
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--brand-white);
  z-index: 50;
  pointer-events: auto;
  cursor: ew-resize;
  touch-action: none;
}
```

### NEW CODE:
```css
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--brand-white);
  z-index: 50;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  transition: left 0.016s linear;
  left: 8px;
}
```

**Changes**: 
- `width: 1px` → `2px` (slightly thicker for better visibility)
- `cursor: ew-resize` → `grab` (better UX feedback)
- `transition: left 0.016s linear` (smooth drag movement)
- `left: 8px` (default position)

---

## 🔴 LOCATION 2: Find `.playhead::after` — REPLACE/UPDATE

### OLD CODE:
```css
.playhead::after {
  content: "";
  position: absolute;
  top: 0;
  /* ... */
}
```

### NEW CODE:
```css
.playhead::before {
  content: "";
  position: absolute;
  top: 0;
  left: -5px;
  width: 12px;
  height: 20px;
  background: var(--brand-white);
  border-radius: 2px 2px 0 0;
  z-index: 51;
  pointer-events: auto;
  cursor: grab;
}

.playhead.dragging::before {
  cursor: grabbing;
  background: var(--brand-blue);
}

.playhead:active::before {
  background: var(--brand-blue);
}

/* Remove ::after if it exists, or replace with this: */
.playhead::after {
  content: "";
  position: absolute;
  top: 20px;
  left: -0.5px;
  width: 1px;
  height: calc(100% - 20px);
  background: inherit;
  z-index: 50;
}
```

**Changes**:
- `.playhead::before` — NEW header element (12×20px white square)
- Grab/grabbing cursor states
- `.playhead::after` — vertical line (optional, faqat sahih ko'rinish uchun)

---

## 🔴 LOCATION 3: ADD NEW — Inactive Content Styles

Add this at the END of `.playhead` rules (still same block):

```css
/* ===== INACTIVE CONTENT STATES ===== */

.playhead.all-content-inactive {
  opacity: 0.4;
  background: rgba(255, 255, 255, 0.3);
}

.playhead.all-content-inactive::before {
  background: rgba(255, 255, 255, 0.2);
}

.playhead.all-content-inactive::after {
  background: rgba(255, 255, 255, 0.2);
}

/* Media block inactive — when content out of bounds */
.media-block.inactive {
  opacity: 0.4 !important;
  background: rgba(100, 100, 100, 0.2) !important;
  border-color: rgba(100, 100, 100, 0.4) !important;
  pointer-events: none !important;
  cursor: not-allowed !important;
}

.track.inactive {
  opacity: 0.4;
  pointer-events: none;
}

.track.inactive .track-lane {
  background: rgba(20, 20, 20, 0.6);
}

/* Text block inactive */
.text-block.inactive {
  opacity: 0.4 !important;
  background: rgba(100, 100, 100, 0.2) !important;
  border-color: rgba(100, 100, 100, 0.4) !important;
  pointer-events: none !important;
}
```

---

## 🔴 LOCATION 4: ADD NEW — Time Ruler Improvements

Add to CSS (find `.time-ruler` if exists, or add new):

```css
/* ===== TIME RULER ENHANCEMENTS ===== */

.time-ruler {
  position: relative;
  height: 20px;
  background: #0d0f13;
  border-bottom: 1px solid #202226;
  display: flex;
  align-items: flex-end;
  cursor: pointer;
}

.ruler-tick {
  position: absolute;
  bottom: 0;
  font-size: 9px;
  color: #6b7280;
  padding: 2px 3px;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.ruler-tick:hover {
  color: var(--brand-white);
  background: rgba(100, 150, 255, 0.15);
  border-radius: 2px;
}

.time-ruler.hide-ticks .ruler-tick {
  opacity: 0.3;
  cursor: default;
}
```

---

## 🔴 LOCATION 5: ADD NEW — Responsive Styles

Add to CSS (at end of media queries section):

```css
/* ===== RESPONSIVE PLAYHEAD ===== */

@media (max-width: 600px) {
  .playhead {
    width: 3px;
  }

  .playhead::before {
    width: 16px;
    height: 24px;
    left: -7px;
  }

  .ruler-tick {
    font-size: 8px;
    padding: 1px 2px;
  }
}

@media (max-width: 400px) {
  .playhead {
    width: 2px;
  }

  .playhead::before {
    width: 12px;
    height: 20px;
    left: -5px;
    opacity: 0.7;
  }

  .ruler-tick {
    font-size: 7px;
    padding: 1px;
  }
}

/* ===== ANIMATIONS ===== */

@keyframes playhead-drag {
  0% {
    box-shadow: 0 0 8px rgba(255, 255, 255, 0);
  }
  50% {
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.5);
  }
  100% {
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.2);
  }
}

.playhead.dragging {
  animation: playhead-drag 0.3s ease-in-out;
}

@keyframes fade-inactive {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.4;
  }
}

.media-block.inactive {
  animation: fade-inactive 0.3s ease-in-out forwards;
}
```

---

## ✅ Summary of CSS Changes

| Section | Change | Location |
|---------|--------|----------|
| `.playhead` | width, cursor, transition | Update existing |
| `.playhead::before` | NEW header element | Add after `.playhead` |
| `.playhead.dragging` | NEW grab/grabbing states | Add new |
| Inactive states | NEW .media-block.inactive | Add new |
| Time ruler | NEW hover effects | Add new |
| Responsive | NEW media queries | Add new |
| Animations | NEW drag/fade animations | Add new |

---

## 📋 Final CSS Structure

Your updated `.playhead` block should look like:

```css
.playhead {
  /* base styles */
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--brand-white);
  z-index: 50;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  transition: left 0.016s linear;
  left: 8px;
}

.playhead::before {
  /* header — white square */
  content: "";
  position: absolute;
  top: 0;
  left: -5px;
  width: 12px;
  height: 20px;
  background: var(--brand-white);
  border-radius: 2px 2px 0 0;
  z-index: 51;
  cursor: grab;
}

.playhead::after {
  /* optional: vertical line */
  content: "";
  position: absolute;
  top: 20px;
  left: -0.5px;
  width: 1px;
  height: calc(100% - 20px);
  background: inherit;
}

.playhead.dragging::before {
  cursor: grabbing;
  background: var(--brand-blue);
}

.playhead.all-content-inactive {
  opacity: 0.4;
  background: rgba(255, 255, 255, 0.3);
}

/* ... rest of inactive/responsive styles ... */
```

---

## 🔍 Quick Find/Replace Guide

### Find the old playhead section:
```bash
# Terminal'dan
grep -n "\.playhead {" /path/to/media-blocks.css
```

### Result:
```
123: .playhead {
```

Then replace lines 123-135 with NEW CODE above.

---

## ⚠️ Important Notes

1. **`!important` flags**: Inactive states'da `!important` ishlatilgan — bu necessary, max-specificity uchun
2. **Transitions**: `left 0.016s linear` — ~60fps smooth movement
3. **Z-index**: playhead::before = 51, playhead = 50 (header yuqorida)
4. **Cursor states**: grab → grabbing (UX feedback)

---

## ✨ Visual Result After CSS Changes

```
BEFORE:                    AFTER:
━━━                        ┌──────┐   ← Header (grab)
  ↑                        │      │
  │ Click/drag            │      │
anywhere                  │   ━━━│   ← Line (smooth drag)
  │                        └──────┘
  ↓
Can drag from                Drag ONLY from header ✅
ANY point                     Time ruler click ✅
                             Smooth movement ✅
                             Inactive states ✅
```

---

## Testing CSS Changes

1. **Visual Check**:
   - Playhead header visible (white square)
   - Smooth movement when dragging
   - Time ruler labels hover effect

2. **Functionality**:
   - Click ruler → playhead moves
   - Drag header → smooth movement
   - Content inactive → 40% opacity

3. **Responsive**:
   - Mobile: Header slightly visible
   - Tablet: Normal size
   - Desktop: Full size

---

**All CSS is backward-compatible. No breaking changes!**

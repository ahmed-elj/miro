# Infinite Whiteboard — Agent Guide

## Project Overview

A browser-based infinite whiteboard / canvas drawing application built with Vite and vanilla ES modules. No framework — pure Canvas 2D rendering with an HTML overlay for text editing and UI controls. Dark-themed UI with emerald (#10b981) accent color.

## Quick Start

```sh
npm install
npm run dev     # Vite dev server on :3000
npm run build   # Production build → dist/
npm run preview # Preview production build
```

## Architecture

### Entry Point

`src/main.js` — imports CSS (`./css/styles.css`) and calls `initUI()` from `ui.js`.

### Module Dependency Graph

```
main.js
└── ui.js ← (orchestrator: events, toolbar, topbar, bottombar, popup, persistence)
    ├── state.js     (shared mutable state, camera, canvas refs, ID generator)
    ├── constants.js  (colors, key maps, cursor map, config)
    ├── utils.js      (coordinate transforms, drawing helpers, toast)
    ├── canvas.js     (render loop, draw functions, grid, handles, locate highlights)
    ├── objects.js    (bounds, hit-testing, handle hit-testing)
    ├── editor.js     (text span parsing/serialization, HTML ↔ spans)
    ├── undo.js       (undo/redo stack, add/delete/find, image cache refresh)
    └── tools.js      (tool behavior, drag/resize, zoom/pan, shapes, text/sticky editing, image insert, PNG export)
```

### Key Pattern: Central State Object

All mutable scalar state lives on a single exported `state` object in `src/js/state.js`. This avoids Rollup/Vite's "Illegal reassignment of import" error — module imports are read-only bindings, but object properties can be freely mutated.

```js
import { state } from './state.js';
state.curTool = 'pen';    // ✅ works
state.selectedId = null;  // ✅ works
// curTool = 'pen';       // ❌ illegal reassignment of import
```

Immutable exports (`cam`, `objects`, `imgCache`, `canvas`, `ctx`, `dpr`) are separate `const` exports from the same module — they're objects/arrays mutated in place.

### Cross-Module Communication

- `canvas.js` render loop calls `window.__updatePopup()` (set by `ui.js`) to update the selection popup without creating a circular dependency with `ui.js`.
- All modules read from and write to `state.*` properties.

## Module Reference

| Module | Lines | Responsibility |
|---|---|---|
| `state.js` | ~63 | Central mutable state (`state`), constants (`cam`, `objects`, `imgCache`, `canvas`, `ctx`, `dpr`), ID generator (`gid()`) |
| `constants.js` | ~55 | `COLORS` (12 swatches), `STICKY_COLORS` (6), `STROKE_WIDTHS` ([1,2,4,8]), `MIN_ZOOM`/`MAX_ZOOM`, `HANDLE_SIZE`/`HANDLE_HIT`, `MAX_UNDO` (80), `KEY_MAP`, `CURSOR_MAP`, `STORAGE_KEY` |
| `utils.js` | ~74 | `s2w`/`w2s` (screen↔world coords), `ptSegDist` (point-to-segment distance), `roundedRect`, `wrapLine` (text wrapping), `rgbToHex`, `showToast` |
| `editor.js` | ~83 | `getSpans` (normalizes spans from object), `spansToHtml` (spans → contenteditable HTML), `parseHtmlSpans` (contenteditable DOM → spans, merges adjacent same-style spans) |
| `objects.js` | ~147 | `getBounds(obj)` — bounding box per type (text uses canvas measureText), `hitTest(obj, wx, wy)` — point-in-object with zoom-aware padding, `hitHandle(obj, wx, wy)` — corner resize handle detection |
| `canvas.js` | ~307 | `requestRender()` (RAF dedup), `drawObject(ctx, obj)`, render pipeline: grid → objects → preview → handles → locate highlights → empty-state text → popup update |
| `undo.js` | ~69 | `saveState()` (deep-clone snapshot), `undo()`/`redo()`, `addObj(o)`, `delSel()`, `findObj(id)`, `refreshImgCache()` (recreate Image from data URL) |
| `tools.js` | ~494 | Select (click/cycle/drag/resize), pan, pen, eraser, line/arrow/rect/ellipse shapes, text/sticky create & edit, zoom/fit/locate, image insert, PNG export |
| `ui.js` | ~578 | `initUI()`, `resizeCanvas()`, `setToolActive()`, popup (color/stroke/opacity/layer/delete/edit), toolbar/topbar/bottombar setup, pointer events, keyboard shortcuts, `saveToStorage`/`loadFromStorage` |

## State Properties

### `state` object (`state.js`)

| Property | Type | Default | Purpose |
|---|---|---|---|
| `selectedId` | number\|null | `null` | ID of selected object |
| `curTool` | string | `'select'` | Active tool name |
| `curColor` | string | `'#e4e4e8'` | Current drawing color |
| `curStroke` | number | `2` | Current stroke width |
| `fillOn` | boolean | `false` | Fill shapes toggle |
| `isDrawing` | boolean | `false` | Currently drawing a shape/path |
| `drawSt` | object\|null | `null` | Start world-point for shape drag |
| `drawCur` | object\|null | `null` | Current world-point for shape drag |
| `curPath` | array | `[]` | Current pen path points |
| `dragMode` | string\|null | `null` | `'move'` or `'resize-tl'`/`'tr'`/`'bl'`/`'br'` |
| `dragSW` | object\|null | `null` | Drag start world-point |
| `dragSnap` | object\|null | `null` | Deep clone of object at drag start |
| `dragUndo` | boolean | `false` | Whether undo state was saved during drag |
| `cycleHits` | array\|null | `null` | Objects under cursor for selection cycling |
| `cycleIdx` | number | `-1` | Current cycle index |
| `_strokeBase` | number\|null | `null` | Base stroke width for popup slider |
| `_lastPopupId` | number\|null | `null` | Last popup object ID (to detect selection change) |
| `isPan` | boolean | `false` | Currently panning |
| `panSt` | object\|null | `null` | Pan start screen-point |
| `panCamSt` | object\|null | `null` | Camera state at pan start |
| `spaceHeld` | boolean | `false` | Space bar held (temporary hand tool) |
| `toolBefore` | string\|null | `null` | Tool before space-hold |
| `undoSt` | array | `[]` | Undo stack (array of object snapshots) |
| `redoSt` | array | `[]` | Redo stack |
| `isEditing` | boolean | `false` | Currently editing text/sticky |
| `editId` | number\|string\|null | `null` | Editing object ID or `'new-text'`/`'new-sticky'` |
| `nid` | number | `1` | Next object ID counter |
| `locateEnd` | number | `0` | Timestamp when locate highlight animation ends |

### `cam` object (`state.js`)

| Property | Type | Default | Purpose |
|---|---|---|---|
| `x` | number | `0` | Screen-space x offset of world origin |
| `y` | number | `0` | Screen-space y offset of world origin |
| `zoom` | number | `1` | Scale factor (1 = 100%) |

## Coordinate System

- **Screen space**: pixel coordinates relative to the canvas element's top-left.
- **World space**: virtual infinite canvas coordinates.
- **Transforms** (`utils.js`):
  - `s2w(sx, sy)` → `{ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom }`
  - `w2s(wx, wy)` → `{ x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y }`
- Camera: `cam.x`, `cam.y` (screen-space offset of world origin), `cam.zoom` (scale factor; 1 = 1 world unit = 1 screen pixel).
- Rendering: `ctx.translate(cam.x, cam.y)` then `ctx.scale(cam.zoom, cam.zoom)`.

## Supported Object Types

| Type | Key Properties | Notes |
|---|---|---|
| `path` | `points[]`, `color`, `strokeWidth`, `opacity` | Freehand; smoothed via quadratic curves |
| `line` | `x1`, `y1`, `x2`, `y2`, `color`, `strokeWidth`, `opacity` | Straight line |
| `arrow` | Same as line + arrowhead rendering | Arrowhead size proportional to length |
| `rect` | `x`, `y`, `w`, `h`, `color`, `strokeWidth`, `fill`, `fillColor`, `opacity` | `fillColor` = color + `'33'` alpha |
| `ellipse` | Same shape props as rect | Drawn via `ctx.ellipse()` |
| `text` | `x`, `y`, `spans[]`, `fontSize`, `color`, `opacity`, `fontWeight` | `x`/`y` = center point; spans have `text`, `bold`, `italic`, `underline`, `color` |
| `sticky` | `x`, `y`, `w`, `h`, `text`, `bgColor`, `fontSize`, `opacity` | Top-left origin; text auto-wraps |
| `image` | `x`, `y`, `w`, `h`, `src` (data URL), `opacity` | Loaded into `imgCache` on demand |

Each object has a unique numeric `id` from `gid()` (monotonically increasing from `state.nid`).

## UI Structure (`index.html`)

- **Canvas**: `<canvas id="board">` — full-viewport drawing surface
- **Eraser cursor**: `<div id="eraserCursor">` — custom circle cursor
- **Image input**: `<input type="file" id="imageInput">` — hidden file picker
- **Toolbar** (`#toolbar`): left sidebar with tool buttons (select, hand, pen, eraser, line, arrow, rect, ellipse, text, sticky, image)
- **Topbar** (`#topbar`): centered top — color swatches, stroke widths, fill toggle, undo/redo/clear
- **Item popup** (`#itemPopup`): floating panel near selected object — bold/italic/underline, font size ±, color swatches + custom picker, sticky color swatches, opacity slider, stroke/font-weight slider, layer up/down, delete, edit text
- **Bottombar** (`#bottombar`): centered bottom — zoom out, zoom level (click to reset), zoom in, fit view, locate objects
- **Text editor**: `<div id="textEditor" contenteditable>` — positioned overlay for rich text editing
- **Sticky editor**: `<textarea id="stickyEditor">` — positioned overlay for sticky note text
- **Toasts**: `<div id="toasts">` — notification container (top-right)

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `V` | Select tool |
| `H` | Hand (pan) tool |
| `P` | Pen tool |
| `E` | Eraser tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `R` | Rectangle tool |
| `O` | Ellipse tool |
| `T` | Text tool |
| `S` | Sticky note tool |
| `Space` (hold) | Temporary hand tool (reverts on release) |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Ctrl+0` | Reset zoom to 100% |
| `Shift+F` | Locate objects (fit + highlight) |
| `Delete` / `Backspace` | Delete selected object |
| `Escape` | Finish editing text/sticky |

## Pointer Events

- **Left click**: tool action (select, draw, place text/sticky, etc.)
- **Middle click**: pan (regardless of tool)
- **Double-click**: edit existing text/sticky under cursor
- **Scroll wheel**: zoom at cursor position (factor 1.08 per tick)
- **Drag & drop**: insert image from file manager
- **Paste**: insert image from clipboard

## Zoom & View

- `zoomAt(sx, sy, factor)`: zoom centered on screen point, clamped to `[MIN_ZOOM, MAX_ZOOM]`
- `resetZoom()`: set `cam.zoom = 1`, center camera
- `fitView()`: compute bounding box of all objects, set zoom to fit content in viewport with 80px padding (no artificial zoom cap — pure fit-to-screen scale)
- `locateObjects()`: calls `fitView()` then animates pulsing green dashed outlines on all objects for 2.5 seconds

## Persistence

- Auto-saves to `localStorage` every 3 seconds (`STORAGE_KEY = 'infinite-whiteboard-state'`).
- Saves `objects` array, `state.nid` (next ID counter), and `cam` (x, y, zoom).
- On load, `refreshImgCache()` re-creates `Image` objects from stored data URLs.
- Camera position is restored from saved state.

## Rendering Pipeline (`canvas.js`)

1. Clear canvas with `#1a1a1f` background
2. Apply camera transform (`translate` + `scale`)
3. Draw adaptive dot grid (spacing auto-adjusts with zoom)
4. Draw all objects (skip object being edited)
5. Draw shape preview if currently drawing
6. Draw selection handles (green dashed rect + corner squares) if object selected
7. Draw locate highlights (pulsing animated outlines) if active
8. Draw empty-state hint text if no objects
9. Call `window.__updatePopup()` to sync popup UI

## Selection & Interaction

- **Click**: select topmost object under cursor; if already selected, prepare for drag
- **Click (no drag)**: cycle through overlapping objects at same position
- **Drag selected**: move object in world space
- **Drag handle**: resize object (corner handles; behavior varies by type)
  - `rect`/`ellipse`/`image`: standard corner resize with minimum size
  - `sticky`: resize + proportional font scaling
  - `text`: resize via font size scaling, anchor opposite corner
  - `line`/`arrow`: move endpoint
  - `path`: scale all points relative to opposite anchor corner
- **Undo on drag**: first movement saves undo state; no movement = click (cycle)

## Popup System

The item popup appears above (or below if no room) the selected/editing object. It has:

- **Text row**: bold/italic/underline toggles, font size ±, edit text button
- **Color row**: 12 color swatches + custom color picker (`<input type="color">`)
- **Sticky row**: 6 sticky background color swatches
- **Opacity dropdown**: range slider 0–100%
- **Stroke/Font-weight dropdown**: exponential stroke multiplier (slider -2..+2 → ¼x..4x) or absolute font weight (100–900) for text
- **Layer**: bring forward / send backward
- **Delete**: remove selected object

Dropdown panels stay open while adjusting sliders; close when clicking elsewhere.

## Important Constraints

- **No framework**: all UI is vanilla DOM manipulation.
- **No reassigning imports**: all mutable scalars go on `state.*`.
- **Canvas rendering is immediate-mode**: `requestRender()` schedules a single `requestAnimationFrame` pass via `canvas.js`.
- **Font dependency**: Google Fonts (Space Grotesk 300–700) loaded via CDN in `index.html`.
- **Icon dependency**: Font Awesome 6 loaded via CDN in `index.html`.
- **DPR-aware**: canvas resolution scaled by `window.devicePixelRatio`.
- **Stroke width is zoom-relative**: when drawing, `strokeWidth` is saved as `curStroke / cam.zoom` so strokes appear consistent at any zoom.

## Common Tasks

### Adding a new tool

1. Add tool name to `KEY_MAP` and `CURSOR_MAP` in `constants.js`.
2. Add a toolbar button with `data-tool="<name>"` in `index.html`.
3. Implement tool start/move/up handlers in `tools.js`.
4. Add cases in `onPointerDown`/`onPointerMove`/`onPointerUp` in `ui.js`.
5. Add preview drawing in `drawPreview()` in `canvas.js` if the tool shows a preview while drawing.

### Adding a new object type

1. Define the object shape and its properties.
2. Add `getBounds` and `hitTest` cases in `objects.js`.
3. Add `drawObject` / `draw<Type>` in `canvas.js`.
4. Add resize logic in `tools.js` (`handleDrag` / `applyResize`).
5. Add selection handle rendering (automatic if `getBounds` returns a rect).
6. Add popup support in `ui.js` if the type needs special popup controls.

### Modifying state

Add new properties to the `state` object in `state.js`. All modules that import `state` can read and write them immediately.

### Adding a popup control

1. Add HTML to `#itemPopup` in `index.html`.
2. Add show/hide logic in `updatePopup()` in `ui.js`.
3. Add event handler in `setupPopupHandlers()` in `ui.js`.

# Infinite Whiteboard — Agent Guide

## Project Overview

A browser-based infinite whiteboard / canvas drawing application built with Vite and vanilla ES modules. No framework — pure Canvas 2D rendering with an HTML overlay for text editing and UI controls.

## Quick Start

```sh
npm install
npm run dev      # Vite dev server on :3000
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

## Architecture

### Entry Point

`src/main.js` — imports CSS and calls `initUI()` from `ui.js`.

### Module Dependency Graph

```
main.js
  └── ui.js ← (orchestrator: events, toolbar, persistence)
        ├── state.js      (shared mutable state)
        ├── constants.js   (colors, key maps, config)
        ├── utils.js       (coordinate transforms, drawing helpers)
        ├── canvas.js      (render loop, draw functions)
        ├── objects.js     (bounds, hit-testing)
        ├── editor.js      (text span parsing/serialization)
        ├── undo.js        (undo/redo stack, add/delete/find)
        └── tools.js       (tool behavior, zoom, pan, shapes, export)
```

### Key Pattern: Central State Object

All mutable scalar state lives on a single exported `state` object in `src/js/state.js`. This avoids Rollup/Vite's "Illegal reassignment of import" error — module imports are read-only bindings, but object properties can be freely mutated.

```js
import { state } from './state.js';
state.curTool = 'pen';       // ✅ works
state.selectedId = null;     // ✅ works
// curTool = 'pen';           // ❌ illegal reassignment of import
```

Immutable exports (`cam`, `objects`, `imgCache`, `canvas`, `ctx`, `dpr`) are separate `const` exports from the same module — they're objects/arrays mutated in place.

### Cross-Module Communication

- `canvas.js` render loop calls `window.__updatePopup()` to update the selection popup without creating a circular dependency with `ui.js`.
- All modules read from and write to `state.*` properties.

## Module Reference

| Module | Responsibility |
|---|---|
| `state.js` | Central mutable state (`state`), constants (`cam`, `objects`, `imgCache`, `canvas`, `ctx`, `dpr`), ID generator (`gid()`) |
| `constants.js` | Colors, sticky colors, stroke widths, key map, cursor map, zoom limits, handle sizes, `STORAGE_KEY` |
| `utils.js` | `s2w`/`w2s` (screen↔world coords), `ptSegDist`, `roundedRect`, `wrapLine`, `rgbToHex`, `showToast` |
| `editor.js` | `getSpans`, `spansToHtml`, `parseHtmlSpans` — rich-text span model for text objects |
| `objects.js` | `getBounds`, `hitTest`, `hitHandle` — bounding-box and point-in-object testing |
| `canvas.js` | `requestRender`, `drawObject`, full render pipeline (grid, objects, previews, handles) |
| `undo.js` | `saveState`, `undo`, `redo`, `addObj`, `delSel`, `findObj`, `refreshImgCache` |
| `tools.js` | Tool handlers, drag/resize, zoom/pan, shape creation, text/sticky editing, image insert, PNG export |
| `ui.js` | `initUI`, `resizeCanvas`, `setToolActive`, `saveToStorage`/`loadFromStorage`, all event setup |

## Coordinate System

- **Screen space**: pixel coordinates relative to the canvas element.
- **World space**: virtual infinite canvas coordinates.
- Transforms: `s2w(sx, sy)` and `w2s(wx, wy)` in `utils.js`.
- Camera: `cam.x`, `cam.y` (screen-space offset of the world origin), `cam.zoom` (scale factor).

## Supported Object Types

| Type | Key Properties |
|---|---|
| `path` | `points[]`, `color`, `strokeWidth`, `opacity` |
| `line` | `x1`, `y1`, `x2`, `y2`, `color`, `strokeWidth`, `opacity` |
| `arrow` | Same as line + arrowhead rendering |
| `rect` | `x`, `y`, `w`, `h`, `color`, `strokeWidth`, `fill`, `fillColor`, `opacity` |
| `ellipse` | Same shape props as rect |
| `text` | `x`, `y`, `spans[]`, `fontSize`, `color`, `opacity` |
| `sticky` | `x`, `y`, `w`, `h`, `text`, `bgColor`, `fontSize`, `opacity` |
| `image` | `x`, `y`, `w`, `h`, `src` (data URL), `opacity` |

Each object has a unique numeric `id` from `gid()`.

## Persistence

- Auto-saves to `localStorage` every 3 seconds (`STORAGE_KEY = 'infinite-whiteboard-state'`).
- Saves `objects` array and `state.nid` (next ID counter).
- On load, `refreshImgCache()` re-creates `Image` objects from stored data URLs.

## Important Constraints

- **No framework**: all UI is vanilla DOM manipulation.
- **No reassigning imports**: all mutable scalars go on `state.*`.
- **Canvas rendering is immediate-mode**: `requestRender()` schedules a single `requestAnimationFrame` pass via `canvas.js`.
- **Font dependency**: Google Fonts (Space Grotesk) loaded via CDN in `index.html`.
- **Icon dependency**: Font Awesome 6 loaded via CDN in `index.html`.

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

### Modifying state

Add new properties to the `state` object in `state.js`. All modules that import `state` can read and write them immediately.

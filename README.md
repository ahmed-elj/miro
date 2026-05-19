# Infinite Whiteboard

A browser-based infinite whiteboard built with Vite, vanilla JavaScript modules, and the Canvas 2D API. It provides a dark canvas workspace for sketching, shapes, rich text, sticky notes, images, grouping, zooming, and local persistence.

## Features

- Infinite pan and zoom canvas with dot, grid, or plain backgrounds
- Pen, eraser, line, arrow, rectangle, ellipse, text, sticky note, and image tools
- Rich text editing with bold, italic, underline, color, rotation, resize, and in-place editing
- Shape fill controls with color and styles: solid, grain, sketch, and hatch
- Object selection, move, resize, rotate, layer ordering, grouping, and ungrouping
- Pen stroke continuation that groups nearby strokes drawn close together
- Image insert by file picker, drag and drop, or paste
- PNG export, fit view, locate objects, undo, redo, and clear
- Local autosave using `localStorage`
- Customizable accent color, canvas color, grid color, background pattern, and tool shortcuts

## Tech Stack

- Vite
- Vanilla ES modules
- HTML Canvas 2D
- Plain DOM APIs
- CSS

No frontend framework is used.

## Getting Started

Install dependencies:

```sh
npm install
```

Run the development server:

```sh
npm run dev
```

Build for production:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.
To publish it:

1. Push the repo to GitHub on the `main` branch.
2. Open the repository settings on GitHub.
3. Go to **Pages**.
4. Set **Build and deployment** → **Source** to **GitHub Actions**.

On each push to `main`, GitHub will build the Vite app and deploy the `dist/`
folder to GitHub Pages. The Vite base path is detected automatically from the
repository name during the workflow.

## Project Structure

```text
src/main.js          App entry point
src/js/ui.js         UI orchestration, events, persistence, popup controls
src/js/canvas.js     Canvas rendering pipeline
src/js/tools.js      Tool behavior and object manipulation
src/js/objects.js    Bounds, hit-testing, and handle detection
src/js/editor.js     Rich text span parsing and serialization
src/js/undo.js       Undo/redo and object helpers
src/js/state.js      Shared mutable application state
src/js/constants.js  Colors, shortcuts, cursors, and config
src/css/styles.css   Application styles
```

## Notes

The application stores board state in the browser under the `infinite-whiteboard-state` localStorage key. Clearing site data will remove saved boards.

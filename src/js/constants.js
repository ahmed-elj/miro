/**
 * Application constants and configuration.
 */

export const COLORS = [
  '#e4e4e8', '#6b6b78', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#818cf8', '#c084fc',
  '#f472b6', '#fbbf24',
];

export const STICKY_COLORS = ['#fbbf24', '#fb923c', '#f87171', '#a78bfa', '#60a5fa', '#34d399'];

export const STROKE_WIDTHS = [1, 2, 4, 8];

export const MIN_ZOOM = 0.0001;
export const MAX_ZOOM = 100000;

/** Handle size (screen px) for selection handles */
export const HANDLE_SIZE = 8;
/** Hit size (screen px) for handle hit-test */
export const HANDLE_HIT = 22;
/** Distance (screen px) of rotation handle above bounding box top-center */
export const ROTATE_HANDLE_DIST = 28;
/** Radius (screen px) of rotation handle circle */
export const ROTATE_HANDLE_RADIUS = 7;

export const MAX_UNDO = 80;

/** Tool → keyboard shortcut code mapping */
export const KEY_MAP = {
  KeyV: 'select',
  KeyH: 'hand',
  KeyP: 'pen',
  KeyE: 'eraser',
  KeyL: 'line',
  KeyA: 'arrow',
  KeyR: 'rect',
  KeyO: 'ellipse',
  KeyT: 'text',
  KeyS: 'sticky',
};

/** Tool → cursor CSS class mapping */
export const CURSOR_MAP = {
  select: 'cursor-default',
  hand: 'cursor-grab',
  pen: 'cursor-crosshair',
  eraser: 'cursor-eraser',
  line: 'cursor-crosshair',
  arrow: 'cursor-crosshair',
  rect: 'cursor-crosshair',
  ellipse: 'cursor-crosshair',
  text: 'cursor-text',
  sticky: 'cursor-crosshair',
  image: 'cursor-crosshair',
};

/** localStorage key for auto-save */
export const STORAGE_KEY = 'infinite-whiteboard-state';

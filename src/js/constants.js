/**
 * Application constants and configuration.
 */

export const COLORS = [
  '#000000', '#e4e4e8', '#6b6b78', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#10b981', '#06b6d4', '#818cf8', '#c084fc',
  '#f472b6', '#fbbf24',
];

export const STICKY_COLORS = ['#fbbf24', '#fb923c', '#f87171', '#a78bfa', '#60a5fa', '#34d399'];

export const STROKE_WIDTHS = [1, 2, 4, 8];

export const TOOL_WHEEL_TOOLS = [
  { tool: 'select', label: 'Select', mark: 'V' },
  { tool: 'hand', label: 'Pan', mark: 'H' },
  { tool: 'pen', label: 'Pen', mark: 'P' },
  { tool: 'eraser', label: 'Eraser', mark: 'E' },
  { tool: 'line', label: 'Line', mark: 'L' },
  { tool: 'arrow', label: 'Arrow', mark: 'A' },
  { tool: 'rect', label: 'Rect', mark: 'R' },
  { tool: 'ellipse', label: 'Ellipse', mark: 'O' },
  { tool: 'text', label: 'Text', mark: 'T' },
  { tool: 'sticky', label: 'Sticky', mark: 'S' },
  { tool: 'comment', label: 'Comment', mark: 'C' },
  { tool: 'image', label: 'Image', mark: 'I' },
];

export const TOOL_WHEEL_INNER_RADIUS = 58;
export const TOOL_WHEEL_OUTER_RADIUS = 148;

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
  KeyC: 'comment',
};

export const DEFAULT_SETTINGS = {
  theme: 'dark',
  accentColor: '#10b981',
  canvasColor: '#1a1a1f',
  gridColor: '#28282f',
  bgPattern: 'dots',
  toolWheelTrigger: 'middle',
  popupColorsExpanded: false,
  keyMap: Object.assign({}, KEY_MAP),
};

export const THEME_PRESETS = {
  dark: {
    canvasColor: '#1a1a1f',
    gridColor: '#28282f',
    objectColor: '#e4e4e8',
    ui: {
      bg: '#141417',
      panel: '#1e1e24',
      border: '#2a2a32',
      fg: '#e4e4e8',
      muted: '#6b6b78',
      shadowPanel: '0 4px 24px rgba(0, 0, 0, 0.4)',
      shadowPopup: '0 8px 32px rgba(0, 0, 0, 0.5)',
    },
  },
  white: {
    canvasColor: '#f8fafc',
    gridColor: '#d8dee9',
    objectColor: '#111827',
    ui: {
      bg: '#eef2f7',
      panel: '#ffffff',
      border: '#d7dde7',
      fg: '#111827',
      muted: '#667085',
      shadowPanel: '0 4px 22px rgba(15, 23, 42, 0.14)',
      shadowPopup: '0 8px 30px rgba(15, 23, 42, 0.18)',
    },
  },
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
  comment: 'cursor-crosshair',
};

/** localStorage key for auto-save */
export const STORAGE_KEY = 'infinite-whiteboard-state';

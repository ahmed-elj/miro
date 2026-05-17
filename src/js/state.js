/**
 * Shared mutable application state.
 * All mutable values live on the `state` object to avoid
 * ES module import reassignment restrictions.
 */

import { DEFAULT_SETTINGS, MAX_UNDO } from './constants.js';

// ── Canvas ──
export const canvas = document.getElementById('board');
export const ctx = canvas.getContext('2d');
export const dpr = window.devicePixelRatio || 1;

// ── Camera (object — mutations are fine) ──
export const cam = { x: 0, y: 0, zoom: 1 };

// ── Objects array (mutations are fine) ──
export const objects = [];

// ── Image cache ──
export const imgCache = {};

// ── Mutable scalar state ──
export const state = {
  selectedId: null,
  selectedIds: [],       // multiselect: array of all selected object IDs
  groupEditId: null,     // groupId currently opened for editing individual members
  groupEditCandidateId: null, // clicked selected group member that may open group edit on pointer up
  isBoxSelect: false,    // currently drawing a marquee selection box
  boxSelStart: null,     // world-space start point of marquee
  boxSelEnd: null,       // world-space end point of marquee
  multiDragSnaps: null, // map of id → deep-clone snapshot for multi-object drag
  dragRotStart: null, // angle at start of rotation drag (radians)
  dragRotSnaps: null, // map of id → { rotation, cx, cy } snapshot for rotation
  dragGroupBounds: null, // snapshot of group bounds at drag start
  groupRotation: 0, // visual rotation of current multi-select group handles
  dragGroupRotation: 0, // groupRotation snapshot at start of group rotation
  dragRotPointerOffset: 0, // pointer angle offset from group rotate handle
  curTool: 'select',
  curColor: '#e4e4e8',
  curColorTouched: false,
  curStroke: 2,
  fillOn: false,

  isDrawing: false,
  drawSt: null,
  drawCur: null,
  curPath: [],
  arrowPreviewBend: 0,

  dragMode: null,
  dragSW: null,
  dragSnap: null,
  dragUndo: false,
  cycleHits: null,
  cycleIdx: -1,
  _strokeBase: null,
  _lastPopupId: null,

  isPan: false,
  panSt: null,
  panCamSt: null,

  spaceHeld: false,
  toolBefore: null,

  undoSt: [],
  redoSt: [],

  isEditing: false,
  editId: null,

  nid: 1,

  locateEnd: 0,

  currentBoardId: 'default',

  viewBookmarks: [],
  clipboardObjects: [],
  contextPastePoint: null,
  lastPointerWorld: null,
  pendingInternalPaste: false,

  settings: {
    theme: DEFAULT_SETTINGS.theme,
    accentColor: DEFAULT_SETTINGS.accentColor,
    canvasColor: DEFAULT_SETTINGS.canvasColor,
    gridColor: DEFAULT_SETTINGS.gridColor,
    bgPattern: DEFAULT_SETTINGS.bgPattern,
    popupColorsExpanded: DEFAULT_SETTINGS.popupColorsExpanded,
    keyMap: Object.assign({}, DEFAULT_SETTINGS.keyMap),
  },
};

export function gid() { return state.nid++; }

/**
 * Shared mutable application state.
 * All mutable values live on the `state` object to avoid
 * ES module import reassignment restrictions.
 */

import { MAX_UNDO } from './constants.js';

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
  isBoxSelect: false,    // currently drawing a marquee selection box
  boxSelStart: null,     // world-space start point of marquee
  boxSelEnd: null,       // world-space end point of marquee
  multiDragSnaps: null, // map of id → deep-clone snapshot for multi-object drag
  dragRotStart: null, // angle at start of rotation drag (radians)
  dragRotSnaps: null, // map of id → { rotation, cx, cy } snapshot for rotation
  dragGroupBounds: null, // snapshot of group bounds at drag start
  curTool: 'select',
  curColor: '#e4e4e8',
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
};

export function gid() { return state.nid++; }

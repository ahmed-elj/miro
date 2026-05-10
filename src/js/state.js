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
  curTool: 'select',
  curColor: '#e4e4e8',
  curStroke: 2,
  fillOn: false,

  isDrawing: false,
  drawSt: null,
  drawCur: null,
  curPath: [],

  dragMode: null,
  dragSW: null,
  dragSnap: null,
  dragUndo: false,
  cycleHits: null,
  cycleIdx: -1,

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
};

export function gid() { return state.nid++; }

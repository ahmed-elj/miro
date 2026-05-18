/**
 * Undo / redo, object add/delete, find helpers.
 */

import { objects, cam, imgCache, state } from './state.js';
import { MAX_UNDO } from './constants.js';
import { requestRender } from './canvas.js';

export function saveState() {
  state.undoSt.push(JSON.parse(JSON.stringify(objects)));
  if (state.undoSt.length > MAX_UNDO) state.undoSt.shift();
  state.redoSt.length = 0;
}

export function undo() {
  if (!state.undoSt.length) return;
  state.redoSt.push(JSON.parse(JSON.stringify(objects)));
  var restored = state.undoSt.pop();
  objects.length = 0;
  restored.forEach(function(o) { objects.push(o); });
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  state.commentPanelId = null;
  refreshImgCache();
  requestRender();
}

export function redo() {
  if (!state.redoSt.length) return;
  state.undoSt.push(JSON.parse(JSON.stringify(objects)));
  var restored = state.redoSt.pop();
  objects.length = 0;
  restored.forEach(function(o) { objects.push(o); });
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  state.commentPanelId = null;
  refreshImgCache();
  requestRender();
}

export function addObj(o) {
  saveState();
  objects.push(o);
  requestRender();
}

export function delSel() {
  var s = state;
  if (s.selectedId === null && s.selectedIds.length === 0) return;
  saveState();
  var idsToRemove = s.selectedIds.length > 0 ? s.selectedIds.slice() : [s.selectedId];
  var filtered = objects.filter(function(x) { return idsToRemove.indexOf(x.id) < 0; });
  objects.length = 0;
  filtered.forEach(function(o) { objects.push(o); });
  s.selectedId = null;
  s.selectedIds = [];
  s.groupEditId = null;
  s.groupEditCandidateId = null;
  s.commentPanelId = null;
  requestRender();
}

export function findObj(id) {
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].id === id) return objects[i];
  }
  return null;
}

export function refreshImgCache() {
  objects.forEach(function(o) {
    if (o.type === 'image' && !imgCache[o.id]) {
      var i = new Image();
      i.onload = function() { requestRender(); };
      i.src = o.src;
      imgCache[o.id] = i;
    }
  });
}

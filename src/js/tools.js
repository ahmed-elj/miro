/**
 * Tool implementations — select, pan, pen, eraser, shapes, text, sticky, image.
 */

import { cam, objects, imgCache, state, gid } from './state.js';
import { STICKY_COLORS, MIN_ZOOM, MAX_ZOOM, CURSOR_MAP, HANDLE_HIT, ROTATE_HANDLE_DIST } from './constants.js';
import { s2w, w2s, showToast, getArrowBendHandle, ptSegDist } from './utils.js';
import { requestRender, drawObject } from './canvas.js';
import { getBounds, getRotatedBounds, hitTest, hitBorder, hitHandle, getGroupBounds, hitRotateHandle, hitRotateHandleBounds, inverseRotatePoint, hitArrowBendHandle, hitArrowEndpointHandle } from './objects.js';
import { getSpans, parseHtmlSpans, spansToHtml } from './editor.js';
import { saveState, addObj, findObj } from './undo.js';
import { createCommentBubble, openCommentPanel } from './comments.js';

function getLinkedSelectionIds(id) {
  var obj = findObj(id);
  if (!obj || !obj.groupId) return [id];
  if (state.groupEditId === obj.groupId) return [id];
  return objects.filter(function(o) { return o.groupId === obj.groupId; }).map(function(o) { return o.id; });
}

function isSelectedLinkedGroup(groupId) {
  if (!groupId || state.selectedIds.length < 2) return false;
  var found = false;
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].groupId !== groupId) continue;
    found = true;
    if (state.selectedIds.indexOf(objects[i].id) < 0) return false;
  }
  if (!found) return false;
  for (var j = 0; j < state.selectedIds.length; j++) {
    var obj = findObj(state.selectedIds[j]);
    if (!obj || obj.groupId !== groupId) return false;
  }
  return true;
}

export function enterGroupEditForObject(id) {
  var obj = findObj(id);
  if (!obj || !obj.groupId) return false;
  state.groupEditId = obj.groupId;
  state.groupEditCandidateId = null;
  state.selectedId = obj.id;
  state.selectedIds = [obj.id];
  state.groupRotation = 0;
  state._lastPopupId = null;
  showToast('Editing group');
  requestRender();
  return true;
}

export function exitGroupEdit(selectGroup) {
  var groupId = state.groupEditId;
  if (!groupId) return false;
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  if (selectGroup) {
    state.selectedIds = objects.filter(function(o) { return o.groupId === groupId; }).map(function(o) { return o.id; });
    state.selectedId = state.selectedIds.length ? state.selectedIds[state.selectedIds.length - 1] : null;
  }
  state._lastPopupId = null;
  requestRender();
  return true;
}

export function selectTopAt(wp) {
  for (var i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], wp.x, wp.y)) {
      setSelectionFromObject(objects[i].id);
      requestRender();
      return true;
    }
  }
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  state.commentPanelId = null;
  requestRender();
  return false;
}

function snapshotMultiDrag(ids) {
  state.multiDragSnaps = {};
  ids.forEach(function(id) {
    var o = findObj(id);
    if (o) state.multiDragSnaps[id] = normalizeArrowSnap(JSON.parse(JSON.stringify(o)));
  });
}

function setSelectionFromObject(id) {
  var ids = getLinkedSelectionIds(id);
  state.selectedIds = ids;
  state.selectedId = id;
  state._lastPopupId = null;
}

function expandGroupedIds(ids) {
  var out = [];
  ids.forEach(function(id) {
    getLinkedSelectionIds(id).forEach(function(linkedId) {
      if (out.indexOf(linkedId) < 0) out.push(linkedId);
    });
  });
  return out;
}

function hasUnlockedObject(ids) {
  for (var i = 0; i < ids.length; i++) {
    var obj = findObj(ids[i]);
    if (obj && !obj.locked) return true;
  }
  return false;
}

function boundsDistanceToPoint(b, wx, wy) {
  if (!b) return Infinity;
  var dx = wx < b.x ? b.x - wx : wx > b.x + b.w ? wx - (b.x + b.w) : 0;
  var dy = wy < b.y ? b.y - wy : wy > b.y + b.h ? wy - (b.y + b.h) : 0;
  return Math.hypot(dx, dy);
}

function hitScore(obj, wx, wy, zIndex) {
  if (!hitTest(obj, wx, wy)) return null;
  var b = getRotatedBounds(obj);
  var borderHit = hitBorder(obj, wx, wy);
  var score = zIndex * 0.0001;
  if (borderHit) score += 1000;
  else if (obj.type === 'text') score += 120;
  else if (obj.fill || obj.type === 'sticky' || obj.type === 'image' || obj.type === 'comment') score += 300;
  else score += 80;
  score -= boundsDistanceToPoint(b, wx, wy) * cam.zoom;
  return { obj: obj, score: score };
}

function getRankedHits(wx, wy) {
  var ranked = [];
  for (var i = objects.length - 1; i >= 0; i--) {
    var hit = hitScore(objects[i], wx, wy, i);
    if (hit) ranked.push(hit);
  }
  ranked.sort(function(a, b) { return b.score - a.score; });
  return ranked.map(function(hit) { return hit.obj; });
}

// ── Select tool: pointer down ──
export function onSelectDown(wp, sx, sy, shiftKey) {
  var s = state;

  // If shift-held and clicking on an object, toggle it in the selection
  if (shiftKey) {
    var hits = getRankedHits(wp.x, wp.y);
    if (hits.length) {
      var clicked = hits[0];
      var linkedClicked = getLinkedSelectionIds(clicked.id);
      var idx = s.selectedIds.indexOf(clicked.id);
      if (idx >= 0) {
        // Deselect this object, or its whole linked group
        s.selectedIds = s.selectedIds.filter(function(id) { return linkedClicked.indexOf(id) < 0; });
        if (s.selectedIds.length === 0) {
          s.selectedId = null;
        } else {
          s.selectedId = s.selectedIds[s.selectedIds.length - 1];
        }
      } else {
        // Add object, or its whole linked group, to selection
        linkedClicked.forEach(function(id) {
          if (s.selectedIds.indexOf(id) < 0) s.selectedIds.push(id);
        });
        s.selectedId = clicked.id;
      }
      s._lastPopupId = null;
      requestRender();
      return;
    }
    // Shift+click on empty space — start box select
    startBoxSelect(wp);
    return;
  }

  // Check rotation handle first (it sits above resize handles)
  if (s.selectedIds.length > 1) {
    var gb = getGroupBounds(s.selectedIds);
    if (gb) gb.rotation = s.groupRotation || 0;
    if (gb && hasUnlockedObject(s.selectedIds) && hitRotateHandleBounds(gb, wp.x, wp.y)) {
      var gcx = gb.x + gb.w / 2, gcy = gb.y + gb.h / 2;
      var handleLocalX = gb.x + gb.w / 2;
      var handleLocalY = gb.y - ROTATE_HANDLE_DIST / cam.zoom;
      var handleWorld = rotateAroundPoint(handleLocalX, handleLocalY, gcx, gcy, s.groupRotation || 0);
      s.dragMode = 'rotate-multi';
      s.dragSW = wp;
      s.dragUndo = false;
      s.dragGroupBounds = { x: gb.x, y: gb.y, w: gb.w, h: gb.h };
      s.dragRotStart = Math.atan2(handleWorld.y - gcy, handleWorld.x - gcx);
      s.dragGroupRotation = s.groupRotation || 0;
      s.dragRotPointerOffset = Math.atan2(wp.y - gcy, wp.x - gcx) - s.dragRotStart;
      s.dragRotSnaps = {};
      s.selectedIds.forEach(function(id) {
        var o = findObj(id);
        if (o) {
          var snap = normalizeArrowSnap(JSON.parse(JSON.stringify(o)));
          var b = getBounds(o);
          snap.cx = b ? b.x + b.w / 2 : 0;
          snap.cy = b ? b.y + b.h / 2 : 0;
          s.dragRotSnaps[id] = snap;
        }
      });
      return;
    }
  } else if (s.selectedId !== null) {
    var obj = findObj(s.selectedId);
    var arrowEndpoint = hitArrowEndpointHandle(obj, wp.x, wp.y);
    if (arrowEndpoint) {
      s.dragMode = arrowEndpoint;
      s.dragSW = wp;
      s.dragSnap = JSON.parse(JSON.stringify(obj));
      s.dragUndo = false;
      return;
    }
    if (obj && hitArrowBendHandle(obj, wp.x, wp.y)) {
      if (!Number.isFinite(obj.cpX) || !Number.isFinite(obj.cpY)) {
        var currentBend = getArrowBendHandle(obj);
        if (currentBend) {
          obj.cpX = currentBend.x;
          obj.cpY = currentBend.y;
        }
      }
      s.dragMode = 'bend-arrow';
      s.dragSW = wp;
      s.dragSnap = JSON.parse(JSON.stringify(obj));
      s.dragUndo = false;
      return;
    }
    if (obj && !obj.locked && obj.type !== 'arrow' && obj.type !== 'line' && hitRotateHandle(obj, wp.x, wp.y)) {
      s.dragMode = 'rotate';
      s.dragSW = wp;
      s.dragUndo = false;
      var ob = getBounds(obj);
      s.dragRotStart = Math.atan2(wp.y - (ob.y + ob.h / 2), wp.x - (ob.x + ob.w / 2));
      s.dragSnap = JSON.parse(JSON.stringify(obj));
      return;
    }
  }

  // Check resize handles on the group bounding box (multiselect) or single object
  if (s.selectedIds.length > 1) {
    var gb = getGroupBounds(s.selectedIds);
    if (gb) {
      gb.rotation = s.groupRotation || 0;
      var gh = hitHandleBounds(gb, wp.x, wp.y);
      if (gh && hasUnlockedObject(s.selectedIds)) {
        s.dragMode = gh;
        s.dragSW = wp;
        s.dragUndo = false;
        s.dragGroupBounds = { x: gb.x, y: gb.y, w: gb.w, h: gb.h };
        // Snapshot all selected objects for group resize
        s.multiDragSnaps = {};
        s.selectedIds.forEach(function(id) {
          var o = findObj(id);
          if (o) s.multiDragSnaps[id] = normalizeArrowSnap(JSON.parse(JSON.stringify(o)));
        });
        return;
      }
    }
  } else if (s.selectedId !== null) {
    var obj = findObj(s.selectedId);
    if (obj && !obj.locked) {
      var h = (obj.type === 'arrow' || obj.type === 'line') ? null : hitHandle(obj, wp.x, wp.y);
      if (h) {
        s.dragMode = h;
        s.dragSW = wp;
        s.dragSnap = JSON.parse(JSON.stringify(obj));
        s.dragUndo = false;
        return;
      }
    }
  }

  // Collect all objects under the click point (top-to-bottom order)
  var hits2 = getRankedHits(wp.x, wp.y);
  if (hits2.length) {
    if (s.groupEditId && hits2[0].groupId !== s.groupEditId) {
      s.groupEditId = null;
      s.groupEditCandidateId = null;
    }
    // Check if any of the clicked objects are already in the multiselection
    var clickedSelectedId = -1;
    for (var ci = 0; ci < hits2.length; ci++) {
      if (s.selectedIds.indexOf(hits2[ci].id) >= 0) {
        clickedSelectedId = hits2[ci].id;
        break;
      }
    }

    // If we clicked on an already-selected object in a multiselection, drag all
    if (clickedSelectedId >= 0 && s.selectedIds.length > 1) {
      var clickedSelectedObj = findObj(clickedSelectedId);
      if (!s.groupEditId && clickedSelectedObj && isSelectedLinkedGroup(clickedSelectedObj.groupId)) {
        s.groupEditCandidateId = clickedSelectedId;
      }
      if (!hasUnlockedObject(s.selectedIds)) return;
      s.dragMode = 'move-multi';
      s.dragSW = wp;
      s.dragUndo = false;
      // Snapshot all selected objects
      snapshotMultiDrag(s.selectedIds);
      return;
    }

    // Single selection or clicking on the sole selected object
    var selObj = s.selectedId !== null ? findObj(s.selectedId) : null;
    var selInHits = -1;
    if (selObj) {
      for (var j = 0; j < hits2.length; j++) {
        if (hits2[j].id === selObj.id) { selInHits = j; break; }
      }
    }

    if (selInHits >= 0) {
      // Set up drag on current selection; defer cycle to pointer up
      if (selObj.locked) return;
      s.dragMode = 'move';
      s.dragSW = wp;
      s.dragSnap = JSON.parse(JSON.stringify(selObj));
      s.dragUndo = false;
      s.cycleHits = hits2;
      s.cycleIdx = selInHits;
    } else {
      // New area — select topmost object (clear multiselect)
      setSelectionFromObject(hits2[0].id);
      if (hits2[0].locked) {
        requestRender();
        return;
      }
      s.dragMode = s.selectedIds.length > 1 ? 'move-multi' : 'move';
      s.dragSW = wp;
      s.dragSnap = JSON.parse(JSON.stringify(hits2[0]));
      if (s.selectedIds.length > 1) snapshotMultiDrag(s.selectedIds);
      s.dragUndo = false;
      s.cycleHits = null;
      s.cycleIdx = -1;
      s._lastPopupId = null;
    }
    requestRender();
  } else {
    if (s.groupEditId) {
      s.groupEditId = null;
      s.groupEditCandidateId = null;
    }
    // Click on empty space — start box select (always, even if nothing selected)
    startBoxSelect(wp);
  }
}

// ── Box (marquee) select ──
export function startBoxSelect(wp) {
  var s = state;
  s.isBoxSelect = true;
  s.boxSelStart = { x: wp.x, y: wp.y };
  s.boxSelEnd = { x: wp.x, y: wp.y };
}

export function updateBoxSelect(wp) {
  var s = state;
  if (!s.isBoxSelect) return;
  s.boxSelEnd = { x: wp.x, y: wp.y };
  requestRender();
}

export function finishBoxSelect(shiftKey) {
  var s = state;
  if (!s.isBoxSelect) return;
  s.isBoxSelect = false;
  if (!s.boxSelStart || !s.boxSelEnd) { s.boxSelStart = null; s.boxSelEnd = null; return; }

  var x1 = s.boxSelStart.x, y1 = s.boxSelStart.y;
  var x2 = s.boxSelEnd.x, y2 = s.boxSelEnd.y;
  var bx = Math.min(x1, x2), by = Math.min(y1, y2);
  var bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);

  s.boxSelStart = null;
  s.boxSelEnd = null;

  // If box is too small (just a click), deselect all
  if (bw < 3 / cam.zoom && bh < 3 / cam.zoom) {
    s.selectedId = null;
    s.selectedIds = [];
    s.groupEditId = null;
    s.groupEditCandidateId = null;
    requestRender();
    return;
  }

  // Find objects whose bounds intersect the marquee rect
  var newIds = [];
  objects.forEach(function(obj) {
    var b = getRotatedBounds(obj);
    if (!b) return;
    // Check if bounds overlap the marquee rectangle
    if (b.x < bx + bw && b.x + b.w > bx && b.y < by + bh && b.y + b.h > by) {
      newIds.push(obj.id);
    }
  });

  if (shiftKey) {
    // Shift+box: add to existing selection
    newIds.forEach(function(id) {
      if (s.selectedIds.indexOf(id) < 0) s.selectedIds.push(id);
    });
  } else {
    s.selectedIds = newIds;
  }
  s.selectedIds = expandGroupedIds(s.selectedIds);

  if (s.selectedIds.length > 0) {
    s.selectedId = s.selectedIds[s.selectedIds.length - 1];
  } else {
    s.selectedId = null;
  }
  s._lastPopupId = null;
  requestRender();
}

// ── Cycle selection on click (no drag) ──
export function cycleSelect() {
  var s = state;
  if (!s.cycleHits || s.cycleIdx < 0) return;
  var hits = s.cycleHits;
  var nextIdx = s.cycleIdx + 1 < hits.length ? s.cycleIdx + 1 : 0;
  var nextHit = hits[nextIdx];
  setSelectionFromObject(nextHit.id);
  s.cycleIdx = nextIdx;
  s._lastPopupId = null;
  requestRender();
}

// ── Move an object by dx,dy relative to its snapshot ──
function moveObjectBy(obj, snap, dx, dy) {
  switch (obj.type) {
  case 'path':
    obj.points = snap.points.map(function(p) { return { x: p.x + dx, y: p.y + dy }; });
    break;
  case 'line':
  case 'arrow':
    obj.x1 = snap.x1 + dx; obj.y1 = snap.y1 + dy;
    obj.x2 = snap.x2 + dx; obj.y2 = snap.y2 + dy;
    if (obj.type === 'arrow' && Number.isFinite(snap.cpX) && Number.isFinite(snap.cpY)) {
      obj.cpX = snap.cpX + dx;
      obj.cpY = snap.cpY + dy;
    }
    break;
  default:
    obj.x = snap.x + dx; obj.y = snap.y + dy;
    break;
  }
}

function normalizeArrowSnap(snap) {
  if (!snap || snap.type !== 'arrow') return snap;
  if (!Number.isFinite(snap.cpX) || !Number.isFinite(snap.cpY)) {
    var handle = getArrowBendHandle(snap);
    if (handle) {
      snap.cpX = handle.x;
      snap.cpY = handle.y;
    }
  }
  return snap;
}

function rotateAroundPoint(x, y, cx, cy, angle) {
  var cos = Math.cos(angle), sin = Math.sin(angle);
  var dx = x - cx, dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

// ── Compute group bounds from snapshot map (for resize, includes rotation) ──
function getGroupBoundsFromSnaps(snapsMap, ids) {
  var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  var found = false;
  ids.forEach(function(id) {
    var snap = snapsMap[id];
    if (!snap) return;
    var b = getRotatedBounds(snap);
    if (!b) return;
    found = true;
    ax = Math.min(ax, b.x); ay = Math.min(ay, b.y);
    bx = Math.max(bx, b.x + b.w); by = Math.max(by, b.y + b.h);
  });
  if (!found) return null;
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

// ── Hit-test handles on an arbitrary bounding box (for group resize) ──
export function hitHandleBounds(b, wx, wy) {
  if (!b) return null;
  if (b.rotation) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var p = inverseRotatePoint(wx, wy, cx, cy, b.rotation);
    wx = p.x;
    wy = p.y;
  }
  var hs = HANDLE_HIT / cam.zoom;
  var cs = [
    { k: 'resize-tl', x: b.x, y: b.y },
    { k: 'resize-t', x: b.x + b.w / 2, y: b.y },
    { k: 'resize-tr', x: b.x + b.w, y: b.y },
    { k: 'resize-r', x: b.x + b.w, y: b.y + b.h / 2 },
    { k: 'resize-bl', x: b.x, y: b.y + b.h },
    { k: 'resize-b', x: b.x + b.w / 2, y: b.y + b.h },
    { k: 'resize-br', x: b.x + b.w, y: b.y + b.h },
    { k: 'resize-l', x: b.x, y: b.y + b.h / 2 },
  ];
  var best = null;
  var bestDist = Infinity;
  for (var i = 0; i < cs.length; i++) {
    if (Math.abs(wx - cs[i].x) < hs && Math.abs(wy - cs[i].y) < hs) {
      var dx = wx - cs[i].x, dy = wy - cs[i].y;
      var dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        best = cs[i].k;
        bestDist = dist;
      }
    }
  }
  return best;
}

// ── Resize a single object relative to a group anchor + scale factors ──
function scaleObjectTo(obj, snap, anchorX, anchorY, sx, sy) {
  switch (obj.type) {
  case 'path':
    obj.points = snap.points.map(function(p) {
      return { x: anchorX + (p.x - anchorX) * sx, y: anchorY + (p.y - anchorY) * sy };
    });
    break;
  case 'line':
  case 'arrow':
    obj.x1 = anchorX + (snap.x1 - anchorX) * sx;
    obj.y1 = anchorY + (snap.y1 - anchorY) * sy;
    obj.x2 = anchorX + (snap.x2 - anchorX) * sx;
    obj.y2 = anchorY + (snap.y2 - anchorY) * sy;
    if (obj.type === 'arrow') {
      if (Number.isFinite(snap.cpX) && Number.isFinite(snap.cpY)) {
        obj.cpX = anchorX + (snap.cpX - anchorX) * sx;
        obj.cpY = anchorY + (snap.cpY - anchorY) * sy;
      } else {
        obj.bend = (snap.bend || 0) * ((Math.abs(sx) + Math.abs(sy)) / 2);
      }
    }
    break;
  case 'text':
    // Text must keep glyph proportions even when the group resize is non-uniform.
    obj.x = anchorX + (snap.x - anchorX) * sx;
    obj.y = anchorY + (snap.y - anchorY) * sy;
    applyTextUniformScale(obj, snap, Math.max(Math.abs(sx), Math.abs(sy), 0.05));
    break;
  case 'sticky':
    // Sticky: x/y is top-left; scale position, size, and font proportionally
    obj.x = anchorX + (snap.x - anchorX) * sx;
    obj.y = anchorY + (snap.y - anchorY) * sy;
    obj.w = Math.max(10 / cam.zoom, snap.w * Math.abs(sx));
    obj.h = Math.max(10 / cam.zoom, snap.h * Math.abs(sy));
    obj.fontSize = snap.fontSize * Math.max(0.05, (Math.abs(sx) + Math.abs(sy)) / 2);
    break;
  default:
    // rect, ellipse, image: x/y is top-left
    obj.x = anchorX + (snap.x - anchorX) * sx;
    obj.y = anchorY + (snap.y - anchorY) * sy;
    obj.w = Math.max(10 / cam.zoom, snap.w * Math.abs(sx));
    obj.h = Math.max(10 / cam.zoom, snap.h * Math.abs(sy));
    break;
  }
}

function constrainResizeScales(w, h, sx, sy, minScale) {
  if (w < 0.000001 || h < 0.000001) return { sx: sx, sy: sy };
  var scale = Math.max(Math.abs(sx), Math.abs(sy), minScale || 0.05);
  return { sx: scale, sy: scale };
}

function getAspectResizeSize(snapW, snapH, newW, newH, minSize) {
  if (snapW < 0.000001 || snapH < 0.000001) {
    return { w: Math.max(minSize, newW), h: Math.max(minSize, newH) };
  }
  var minScale = Math.max(minSize / snapW, minSize / snapH);
  var scale = Math.max(newW / snapW, newH / snapH, minScale);
  return { w: snapW * scale, h: snapH * scale };
}

function constrainLineEndpoint(anchor, snapMoving, rawMoving) {
  var vx = snapMoving.x - anchor.x, vy = snapMoving.y - anchor.y;
  var len2 = vx * vx + vy * vy;
  if (len2 < 0.000001) return rawMoving;
  var rx = rawMoving.x - anchor.x, ry = rawMoving.y - anchor.y;
  var scale = Math.max(0.05, (rx * vx + ry * vy) / len2);
  return { x: anchor.x + vx * scale, y: anchor.y + vy * scale };
}

function getResizeGeometry(b, dm, dx, dy) {
  var anchorX = b.x;
  var anchorY = b.y;
  var newW = b.w;
  var newH = b.h;
  if (dm === 'resize-br') {
    anchorX = b.x; anchorY = b.y;
    newW = b.w + dx; newH = b.h + dy;
  } else if (dm === 'resize-bl') {
    anchorX = b.x + b.w; anchorY = b.y;
    newW = b.w - dx; newH = b.h + dy;
  } else if (dm === 'resize-tr') {
    anchorX = b.x; anchorY = b.y + b.h;
    newW = b.w + dx; newH = b.h - dy;
  } else if (dm === 'resize-tl') {
    anchorX = b.x + b.w; anchorY = b.y + b.h;
    newW = b.w - dx; newH = b.h - dy;
  } else if (dm === 'resize-r') {
    anchorX = b.x; anchorY = b.y + b.h / 2;
    newW = b.w + dx; newH = b.h;
  } else if (dm === 'resize-l') {
    anchorX = b.x + b.w; anchorY = b.y + b.h / 2;
    newW = b.w - dx; newH = b.h;
  } else if (dm === 'resize-b') {
    anchorX = b.x + b.w / 2; anchorY = b.y;
    newW = b.w; newH = b.h + dy;
  } else if (dm === 'resize-t') {
    anchorX = b.x + b.w / 2; anchorY = b.y + b.h;
    newW = b.w; newH = b.h - dy;
  }
  return { anchorX: anchorX, anchorY: anchorY, newW: newW, newH: newH };
}

function isSideResizeMode(dm) {
  return dm === 'resize-t' || dm === 'resize-r' || dm === 'resize-b' || dm === 'resize-l';
}

function getTextBaseScale(snap) {
  return Math.max(0.05, snap.scaleX || 1, snap.scaleY || 1);
}

function applyTextUniformScale(obj, snap, scale) {
  var uniformScale = Math.max(0.1, scale);
  var baseScale = getTextBaseScale(snap);
  obj.fontSize = snap.fontSize;
  obj.scaleX = baseScale * uniformScale;
  obj.scaleY = baseScale * uniformScale;
  if (snap.boxW) obj.boxW = Math.max(40 / cam.zoom, snap.boxW * uniformScale);
  if (snap.boxH) obj.boxH = Math.max(20 / cam.zoom, snap.boxH * uniformScale);
  if (snap.wrapText) {
    obj.wrapText = true;
    obj.wrapWidth = Math.max(40 / cam.zoom, (snap.wrapWidth || snap.boxW || getBounds(snap).w) * uniformScale);
    obj.boxW = obj.wrapWidth;
  }
}

// ── Drag handling ──
export function handleDrag(wp, freeResize) {
  var s = state;
  var dx = wp.x - s.dragSW.x, dy = wp.y - s.dragSW.y;
  var preserveAspect = !freeResize;

  // Multi-object move
  if (s.dragMode === 'move-multi' && s.multiDragSnaps) {
    s.selectedIds.forEach(function(id) {
      var obj = findObj(id);
      var snap = s.multiDragSnaps[id];
      if (obj && obj.locked) return;
      if (!obj || !snap) return;
      moveObjectBy(obj, snap, dx, dy);
    });
    requestRender();
    return;
  }

  // Single-object rotation
  if (s.dragMode === 'rotate' && s.dragSnap) {
    var obj = findObj(s.selectedId);
    if (!obj) return;
    var ob = getBounds(s.dragSnap);
    if (!ob) return;
    var cx = ob.x + ob.w / 2, cy = ob.y + ob.h / 2;
    var angle = Math.atan2(wp.y - cy, wp.x - cx);
    var delta = angle - s.dragRotStart;
    obj.rotation = (s.dragSnap.rotation || 0) + delta;
    requestRender();
    return;
  }

  // Multi-object rotation (rotate all around group center)
  if (s.dragMode === 'rotate-multi' && s.dragRotSnaps) {
    var gb = s.dragGroupBounds;
    if (!gb) return;
    var gcx = gb.x + gb.w / 2, gcy = gb.y + gb.h / 2;
    var angle = Math.atan2(wp.y - gcy, wp.x - gcx);
    var desiredHandleAngle = angle - (s.dragRotPointerOffset || 0);
    var delta = desiredHandleAngle - s.dragRotStart;
    s.groupRotation = (s.dragGroupRotation || 0) + delta;
    s.selectedIds.forEach(function(id) {
      var o = findObj(id);
      var snap = s.dragRotSnaps[id];
      if (o && o.locked) return;
      if (!o || !snap) return;
      if (o.type !== 'arrow') o.rotation = (snap.rotation || 0) + delta;
      var offx = snap.cx - gcx, offy = snap.cy - gcy;
      var cos = Math.cos(delta), sin = Math.sin(delta);
      var newCx = gcx + offx * cos - offy * sin;
      var newCy = gcy + offx * sin + offy * cos;
      var moveDx = newCx - snap.cx, moveDy = newCy - snap.cy;
      switch (o.type) {
        case 'path':
          o.points = snap.points.map(function(p) { return { x: p.x + moveDx, y: p.y + moveDy }; });
          break;
        case 'line':
          o.x1 = snap.x1 + moveDx; o.y1 = snap.y1 + moveDy;
          o.x2 = snap.x2 + moveDx; o.y2 = snap.y2 + moveDy;
          break;
        case 'arrow':
          var p1 = rotateAroundPoint(snap.x1, snap.y1, gcx, gcy, delta);
          var p2 = rotateAroundPoint(snap.x2, snap.y2, gcx, gcy, delta);
          o.x1 = p1.x; o.y1 = p1.y;
          o.x2 = p2.x; o.y2 = p2.y;
          if (Number.isFinite(snap.cpX) && Number.isFinite(snap.cpY)) {
            var cp = rotateAroundPoint(snap.cpX, snap.cpY, gcx, gcy, delta);
            o.cpX = cp.x;
            o.cpY = cp.y;
          }
          o.rotation = 0;
          break;
        default:
          o.x = snap.x + moveDx; o.y = snap.y + moveDy;
          break;
      }
    });
    requestRender();
    return;
  }

  // Multi-object group resize
  if (s.dragMode && s.dragMode.startsWith('resize-') && s.multiDragSnaps && s.selectedIds.length > 1) {
    var gb2 = s.dragGroupBounds || getGroupBounds(s.selectedIds);
    if (!gb2 || gb2.w < 0.01 || gb2.h < 0.01) return;
    var snapIds = Object.keys(s.multiDragSnaps).map(Number);
    var snapGb = getGroupBoundsFromSnaps(s.multiDragSnaps, snapIds);
    if (!snapGb || snapGb.w < 0.01 || snapGb.h < 0.01) return;

    var dm = s.dragMode;
    var geom = getResizeGeometry(snapGb, dm, dx, dy);
    var anchorX = geom.anchorX, anchorY = geom.anchorY;
    var sx = Math.max(0.05, geom.newW / snapGb.w);
    var sy = Math.max(0.05, geom.newH / snapGb.h);
    if (preserveAspect && !isSideResizeMode(dm)) {
      var constrained = constrainResizeScales(snapGb.w, snapGb.h, sx, sy, 0.05);
      sx = constrained.sx;
      sy = constrained.sy;
    }

    s.selectedIds.forEach(function(id) {
      var obj = findObj(id);
      var snap = s.multiDragSnaps[id];
      if (obj && obj.locked) return;
      if (!obj || !snap) return;
      scaleObjectTo(obj, snap, anchorX, anchorY, sx, sy);
    });
    requestRender();
    return;
  }

  var obj2 = findObj(s.selectedId);
  if (!obj2 || !s.dragSnap) return;
  if (obj2.locked) return;
  var snap2 = s.dragSnap;

  if (s.dragMode === 'move') {
    var linkedIds = obj2.groupId ? getLinkedSelectionIds(obj2.id) : [obj2.id];
    if (linkedIds.length > 1) {
      if (!s.multiDragSnaps) snapshotMultiDrag(linkedIds);
      linkedIds.forEach(function(id) {
        var linkedObj = findObj(id);
        var linkedSnap = s.multiDragSnaps[id];
        if (!linkedObj || !linkedSnap) return;
        moveObjectBy(linkedObj, linkedSnap, dx, dy);
      });
      s.selectedIds = linkedIds;
      requestRender();
      return;
    }
  }

  if (s.dragMode === 'bend-arrow') {
    obj2.cpX = snap2.cpX + dx;
    obj2.cpY = snap2.cpY + dy;
    requestRender();
    return;
  }

  if (s.dragMode === 'arrow-start') {
    obj2.x1 = snap2.x1 + dx;
    obj2.y1 = snap2.y1 + dy;
    if (Number.isFinite(snap2.cpX) && Number.isFinite(snap2.cpY)) {
      obj2.cpX = snap2.cpX;
      obj2.cpY = snap2.cpY;
    }
    requestRender();
    return;
  }

  if (s.dragMode === 'arrow-end') {
    obj2.x2 = snap2.x2 + dx;
    obj2.y2 = snap2.y2 + dy;
    if (Number.isFinite(snap2.cpX) && Number.isFinite(snap2.cpY)) {
      obj2.cpX = snap2.cpX;
      obj2.cpY = snap2.cpY;
    }
    requestRender();
    return;
  }

  if (s.dragMode && s.dragMode.startsWith('resize-') && (snap2.rotation || 0)) {
    var rb = getBounds(snap2);
    if (rb) {
      var rcx = rb.x + rb.w / 2, rcy = rb.y + rb.h / 2;
      var startLocal = inverseRotatePoint(s.dragSW.x, s.dragSW.y, rcx, rcy, snap2.rotation || 0);
      var curLocal = inverseRotatePoint(wp.x, wp.y, rcx, rcy, snap2.rotation || 0);
      dx = curLocal.x - startLocal.x;
      dy = curLocal.y - startLocal.y;
    }
  }

  if (s.dragMode === 'move') {
    moveObjectBy(obj2, snap2, dx, dy);
  } else if (s.dragMode.startsWith('resize-')) {
    var ms = 10 / cam.zoom;
    if (obj2.type === 'rect' || obj2.type === 'ellipse' || obj2.type === 'image' || obj2.type === 'comment') {
      applyResize(obj2, snap2, dx, dy, ms, preserveAspect);
    } else if (obj2.type === 'sticky') {
      applyStickyResize(obj2, snap2, dx, dy, preserveAspect);
    } else if (obj2.type === 'text') {
      applyTextResize(obj2, snap2, dx, dy, preserveAspect);
    } else if (obj2.type === 'line' || obj2.type === 'arrow') {
      if (isSideResizeMode(s.dragMode)) {
        var lineBounds = getBounds(snap2);
        if (!lineBounds || lineBounds.w < 0.01 || lineBounds.h < 0.01) return;
        var lineGeom = getResizeGeometry(lineBounds, s.dragMode, dx, dy);
        var lineSx = Math.max(0.05, lineGeom.newW / lineBounds.w);
        var lineSy = Math.max(0.05, lineGeom.newH / lineBounds.h);
        scaleObjectTo(obj2, snap2, lineGeom.anchorX, lineGeom.anchorY, lineSx, lineSy);
        requestRender();
        return;
      }
      var lineAnchor = null;
      var lineMoving = null;
      if (s.dragMode === 'resize-br' || s.dragMode === 'resize-tr') {
        if (snap2.x2 >= snap2.x1) {
          lineAnchor = { x: snap2.x1, y: snap2.y1 };
          lineMoving = { x: snap2.x2, y: snap2.y2 };
          var p2 = preserveAspect ? constrainLineEndpoint(lineAnchor, lineMoving, { x: snap2.x2 + dx, y: snap2.y2 + dy }) : { x: snap2.x2 + dx, y: snap2.y2 + dy };
          obj2.x2 = p2.x; obj2.y2 = p2.y;
        }
        else {
          lineAnchor = { x: snap2.x2, y: snap2.y2 };
          lineMoving = { x: snap2.x1, y: snap2.y1 };
          var p1 = preserveAspect ? constrainLineEndpoint(lineAnchor, lineMoving, { x: snap2.x1 + dx, y: snap2.y1 + dy }) : { x: snap2.x1 + dx, y: snap2.y1 + dy };
          obj2.x1 = p1.x; obj2.y1 = p1.y;
        }
      } else {
        if (snap2.x1 <= snap2.x2) {
          lineAnchor = { x: snap2.x2, y: snap2.y2 };
          lineMoving = { x: snap2.x1, y: snap2.y1 };
          var p3 = preserveAspect ? constrainLineEndpoint(lineAnchor, lineMoving, { x: snap2.x1 + dx, y: snap2.y1 + dy }) : { x: snap2.x1 + dx, y: snap2.y1 + dy };
          obj2.x1 = p3.x; obj2.y1 = p3.y;
        }
        else {
          lineAnchor = { x: snap2.x1, y: snap2.y1 };
          lineMoving = { x: snap2.x2, y: snap2.y2 };
          var p4 = preserveAspect ? constrainLineEndpoint(lineAnchor, lineMoving, { x: snap2.x2 + dx, y: snap2.y2 + dy }) : { x: snap2.x2 + dx, y: snap2.y2 + dy };
          obj2.x2 = p4.x; obj2.y2 = p4.y;
        }
      }
      if (obj2.type === 'arrow') {
        if (Number.isFinite(snap2.cpX) && Number.isFinite(snap2.cpY)) {
          obj2.cpX = snap2.cpX;
          obj2.cpY = snap2.cpY;
        } else {
          obj2.bend = snap2.bend || 0;
        }
      }
    } else if (obj2.type === 'path') {
      var b = getBounds(snap2);
      if (!b || b.w < 0.01 || b.h < 0.01) return;
      var pathGeom = getResizeGeometry(b, s.dragMode, dx, dy);
      var ox = pathGeom.anchorX, oy = pathGeom.anchorY;
      var sx2 = pathGeom.newW / b.w, sy2 = pathGeom.newH / b.h;
      sx2 = Math.max(0.05, sx2); sy2 = Math.max(0.05, sy2);
      if (preserveAspect && !isSideResizeMode(s.dragMode)) {
        var pc = constrainResizeScales(b.w, b.h, sx2, sy2, 0.05);
        sx2 = pc.sx;
        sy2 = pc.sy;
      }
      obj2.points = snap2.points.map(function(p) { return { x: ox + (p.x - ox) * sx2, y: oy + (p.y - oy) * sy2 }; });
    }
  }
  requestRender();
}

function applyResize(o, snap, dx, dy, ms, preserveAspect) {
  var dm = state.dragMode;
  var nw, nh, size;
  if (dm === 'resize-br') {
    nw = Math.max(ms, snap.w + dx); nh = Math.max(ms, snap.h + dy);
    size = preserveAspect ? getAspectResizeSize(snap.w, snap.h, nw, nh, ms) : { w: nw, h: nh };
    o.w = size.w; o.h = size.h;
  } else if (dm === 'resize-bl') {
    nw = Math.max(ms, snap.w - dx); nh = Math.max(ms, snap.h + dy);
    size = preserveAspect ? getAspectResizeSize(snap.w, snap.h, nw, nh, ms) : { w: nw, h: nh };
    o.x = snap.x + snap.w - size.w; o.w = size.w; o.h = size.h;
  } else if (dm === 'resize-tr') {
    nw = Math.max(ms, snap.w + dx); nh = Math.max(ms, snap.h - dy);
    size = preserveAspect ? getAspectResizeSize(snap.w, snap.h, nw, nh, ms) : { w: nw, h: nh };
    o.w = size.w; o.y = snap.y + snap.h - size.h; o.h = size.h;
  } else if (dm === 'resize-tl') {
    nw = Math.max(ms, snap.w - dx); nh = Math.max(ms, snap.h - dy);
    size = preserveAspect ? getAspectResizeSize(snap.w, snap.h, nw, nh, ms) : { w: nw, h: nh };
    o.x = snap.x + snap.w - size.w; o.y = snap.y + snap.h - size.h; o.w = size.w; o.h = size.h;
  } else if (dm === 'resize-r') {
    o.w = Math.max(ms, snap.w + dx);
    o.h = snap.h;
  } else if (dm === 'resize-l') {
    o.w = Math.max(ms, snap.w - dx);
    o.x = snap.x + snap.w - o.w;
    o.h = snap.h;
  } else if (dm === 'resize-b') {
    o.w = snap.w;
    o.h = Math.max(ms, snap.h + dy);
  } else if (dm === 'resize-t') {
    o.w = snap.w;
    o.h = Math.max(ms, snap.h - dy);
    o.y = snap.y + snap.h - o.h;
  }
}

function applyStickyResize(o, snap, dx, dy, preserveAspect) {
  var ms = 40 / cam.zoom;
  var origW = snap.w, origH = snap.h;
  applyResize(o, snap, dx, dy, ms, preserveAspect);
  if (origW > 0 && origH > 0) {
    var sw2 = o.w / origW, sh2 = o.h / origH;
    o.fontSize = snap.fontSize * ((sw2 + sh2) / 2);
  }
}

function applyTextResize(obj, snap, dx, dy, preserveAspect) {
  var ob = getBounds(snap);
  if (!ob || ob.w <= 0.000001 || ob.h <= 0.000001) {
    return;
  }
  var dm = state.dragMode;
  var minW = 40 / cam.zoom;
  var minH = 20 / cam.zoom;
  var boxW = ob.w;
  var boxH = ob.h;
  if (dm === 'resize-r' || dm === 'resize-tr' || dm === 'resize-br') boxW = ob.w + dx;
  if (dm === 'resize-l' || dm === 'resize-tl' || dm === 'resize-bl') boxW = ob.w - dx;
  if (dm === 'resize-b' || dm === 'resize-bl' || dm === 'resize-br') boxH = ob.h + dy;
  if (dm === 'resize-t' || dm === 'resize-tl' || dm === 'resize-tr') boxH = ob.h - dy;
  boxW = Math.max(minW, boxW);
  boxH = Math.max(minH, boxH);
  var textScale = getTextBaseScale(snap);
  if (!preserveAspect) {
    var sx = Math.max(0.1, boxW / ob.w);
    var sy = Math.max(0.1, boxH / ob.h);
    if (dm === 'resize-l' || dm === 'resize-r') textScale *= sx;
    else if (dm === 'resize-t' || dm === 'resize-b') textScale *= sy;
    else textScale *= Math.min(sx, sy);
  }
  obj.fontSize = snap.fontSize;
  obj.scaleX = textScale;
  obj.scaleY = textScale;
  obj.wrapText = true;
  obj.wrapWidth = boxW;
  obj.boxW = boxW;
  obj.boxH = boxH;
  obj.x = ob.x + boxW / 2;
  obj.y = ob.y + boxH / 2;
  var resizedBounds = getBounds(obj);
  if (resizedBounds) {
    obj.x += ob.x - resizedBounds.x;
    obj.y += ob.y - resizedBounds.y;
  }
}

// ── Pan ──
export function startPan(sx, sy) {
  state.isPan = true;
  state.panSt = { x: sx, y: sy };
  state.panCamSt = { x: cam.x, y: cam.y };
  document.body.className = 'cursor-grabbing';
}

// ── Pen ──
export function startPen(wp) {
  state.isDrawing = true;
  state.curPath = [wp];
}

export function finishPen() {
  var s = state;
  s.isDrawing = false;
  if (s.curPath.length >= 2) {
    var pts = s.curPath.map(function(p) { return { x: p.x, y: p.y }; });
    var sw = s.curStroke / cam.zoom;
    addPenPath(pts, s.curColor, sw);
  }
  s.curPath = [];
  s.drawSt = null;
  s.drawCur = null;
}

function addPenPath(points, color, strokeWidth) {
  var now = Date.now();
  var next = {
    type: 'path', id: gid(), points: points,
    color: color, strokeWidth: strokeWidth, opacity: 1, rotation: 0,
    createdAt: now, penGroupUpdatedAt: now,
  };
  var linked = findNearbyPenPath(points, color, strokeWidth, now);
  if (!linked) {
    addObj(next);
    return;
  }
  saveState();
  var groupId = linked.groupId || nextGroupId();
  linked.groupId = groupId;
  next.groupId = groupId;
  objects.forEach(function(obj) {
    if (obj.groupId === groupId) obj.penGroupUpdatedAt = now;
  });
  objects.push(next);
  requestRender();
}

function findNearbyPenPath(points, color, strokeWidth, now) {
  if (!points || points.length < 2) return null;
  var zone = 56 / cam.zoom;
  var timeWindow = 6000;
  var best = null;
  for (var i = objects.length - 1; i >= 0; i--) {
    var obj = objects[i];
    if (!obj || obj.type !== 'path' || !obj.points || obj.points.length < 2) continue;
    var lastDrawn = obj.penGroupUpdatedAt || obj.createdAt || 0;
    if (lastDrawn && now - lastDrawn > timeWindow) continue;
    var d = pathDistance(points, obj.points);
    if (d <= zone && (!best || d < best.dist)) best = { obj: obj, dist: d };
  }
  return best && best.obj;
}

function pathDistance(a, b) {
  var best = Infinity;
  for (var i = 0; i < a.length; i++) {
    best = Math.min(best, pointPathDistance(a[i], b));
  }
  for (var j = 0; j < b.length; j++) {
    best = Math.min(best, pointPathDistance(b[j], a));
  }
  return best;
}

function pointPathDistance(p, points) {
  var best = Infinity;
  for (var i = 0; i < points.length - 1; i++) {
    best = Math.min(best, ptSegDist(p.x, p.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y));
  }
  return best;
}

function nextGroupId() {
  return 'grp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ── Eraser ──
export function startErase() { state.isDrawing = true; }

export function eraseAt(wp) {
  for (var i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], wp.x, wp.y)) {
      saveState();
      var erasedId = objects[i].id;
      objects.splice(i, 1);
      if (state.selectedId === erasedId) state.selectedId = null;
      var idx = state.selectedIds.indexOf(erasedId);
      if (idx >= 0) state.selectedIds.splice(idx, 1);
      requestRender();
      return;
    }
  }
}

export function finishErase() { state.isDrawing = false; }

// ── Shapes ──
export function startShape(wp) {
  state.isDrawing = true;
  state.drawSt = wp;
  state.drawCur = wp;
  state.arrowPreviewBend = 0;
}

export function finishShape() {
  var s = state;
  s.isDrawing = false;
  if (!s.drawSt || !s.drawCur) return false;
  var x1 = s.drawSt.x, y1 = s.drawSt.y, x2 = s.drawCur.x, y2 = s.drawCur.y;
  if (Math.abs(x2 - x1) < 3 / cam.zoom && Math.abs(y2 - y1) < 3 / cam.zoom) {
    s.drawSt = null; s.drawCur = null; s.arrowPreviewBend = 0; return false;
  }
  var sw = s.curStroke / cam.zoom;
  if (s.curTool === 'line') addObj({ type: 'line', id: gid(), x1: x1, y1: y1, x2: x2, y2: y2, color: s.curColor, strokeWidth: sw, opacity: 1, rotation: 0 });
  else if (s.curTool === 'arrow') addObj({ type: 'arrow', id: gid(), x1: x1, y1: y1, x2: x2, y2: y2, bend: s.arrowPreviewBend || 0, arrowHeads: 'end', arrowHeadSize: Math.max(s.curStroke * 5, 18) / cam.zoom, color: s.curColor, strokeWidth: sw, opacity: 1, rotation: 0 });
  else if (s.curTool === 'rect') addObj({ type: 'rect', id: gid(), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: s.curColor, strokeWidth: sw, fill: s.fillOn, fillColor: s.curColor, fillStyle: 'solid', fillOpacity: 0.28, opacity: 1, rotation: 0 });
  else if (s.curTool === 'ellipse') addObj({ type: 'ellipse', id: gid(), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: s.curColor, strokeWidth: sw, fill: s.fillOn, fillColor: s.curColor, fillStyle: 'solid', fillOpacity: 0.28, opacity: 1, rotation: 0 });
  s.drawSt = null;
  s.drawCur = null;
  s.arrowPreviewBend = 0;
  return true;
}

// ── Text create ──
export function startTextCreate(wp) {
  var s = state;
  var ed = document.getElementById('textEditor');
  var sp = w2s(wp.x, wp.y);
  var wfs = 20 / cam.zoom;
  ed.style.display = 'block';
  ed.style.left = snapScreenPx(sp.x) + 'px'; ed.style.top = snapScreenPx(sp.y) + 'px';
  ed.style.transform = 'translate(-50%, -50%)';
  ed.style.transformOrigin = 'center center';
  ed.style.minWidth = '60px';
  ed.style.color = s.curColor;
  ed.style.fontSize = wfs * cam.zoom + 'px';
  ed.style.fontWeight = '400'; ed.style.fontStyle = 'normal'; ed.style.textDecoration = 'none';
  ed.innerHTML = '';
  s.isEditing = true; s.editId = 'new-text';
  ed.dataset.wx = wp.x; ed.dataset.wy = wp.y; ed.dataset.wfs = wfs; ed.dataset.color = s.curColor;
  setTimeout(function() { ed.focus(); requestRender(); }, 80);
}

export function startTextTool(wp, clientX, clientY) {
  for (var i = objects.length - 1; i >= 0; i--) {
    if (objects[i].type === 'text' && hitTest(objects[i], wp.x, wp.y)) {
      startEditExisting(objects[i], { x: clientX, y: clientY });
      return;
    }
  }
  startTextCreate(wp);
}

// ── Sticky create ──
export function startStickyCreate(wp) {
  var s = state;
  var bg = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
  var ww = 200 / cam.zoom, wh = 200 / cam.zoom;
  var ed = document.getElementById('stickyEditor');
  var sp = w2s(wp.x, wp.y);
  ed.style.display = 'block';
  ed.style.left = sp.x + 'px'; ed.style.top = sp.y + 'px';
  ed.style.width = Math.max(80, 200) + 'px'; ed.style.height = Math.max(80, 200) + 'px';
  ed.style.backgroundColor = bg; ed.style.fontSize = Math.max(10, 16) + 'px'; ed.style.color = '#1a1a1f';
  ed.style.textAlign = 'center';
  ed.value = '';
  s.isEditing = true; s.editId = 'new-sticky';
  ed.dataset.wx = wp.x; ed.dataset.wy = wp.y; ed.dataset.bgColor = bg;
  ed.dataset.w = ww; ed.dataset.h = wh; ed.dataset.wfs = 16 / cam.zoom;
  setTimeout(function() { ed.focus(); }, 80);
}

export function startCommentCreate(wp) {
  var id = gid();
  var obj = createCommentBubble(id, wp);
  addObj(obj);
  state.selectedId = id;
  state.selectedIds = [id];
  state._lastPopupId = null;
  openCommentPanel(obj);
  requestRender();
}

// ── Edit existing text/sticky ──
export function startEditExisting(obj, caretPoint) {
  var s = state;
  s.selectedId = obj.id;
  s.selectedIds = [obj.id];
  var b = getBounds(obj), sp = w2s(b.x, b.y);
  if (obj.type === 'text') {
    var ed = document.getElementById('textEditor');
    var textBounds = getBounds(obj);
    var tsp = textBounds ? w2s(textBounds.x, textBounds.y) : w2s(obj.x, obj.y);
	    ed.style.display = 'block';
	    ed.style.left = snapScreenPx(tsp.x) + 'px'; ed.style.top = snapScreenPx(tsp.y) + 'px';
	    applyTextEditorObjectStyles(ed, obj);
	    ed.innerHTML = spansToHtml(getSpans(obj));
    s.isEditing = true; s.editId = obj.id;
    setTimeout(function() {
      ed.focus();
      if (caretPoint) placeCaretAtPoint(ed, caretPoint.x, caretPoint.y);
      requestRender();
    }, 80);
  } else if (obj.type === 'sticky') {
    var ed2 = document.getElementById('stickyEditor');
    ed2.style.display = 'block';
    ed2.style.left = sp.x + 'px'; ed2.style.top = sp.y + 'px';
    ed2.style.width = Math.max(80, obj.w * cam.zoom) + 'px';
    ed2.style.height = Math.max(80, obj.h * cam.zoom) + 'px';
    ed2.style.backgroundColor = 'transparent';
    ed2.style.fontSize = Math.max(10, obj.fontSize * cam.zoom) + 'px';
    ed2.style.color = '#1a1a1f';
    ed2.style.textAlign = obj.textAlign || 'center';
    ed2.value = obj.text;
    s.isEditing = true; s.editId = obj.id;
    setTimeout(function() { ed2.focus(); ed2.select(); }, 80);
  }
  requestRender();
}

function placeCaretAtPoint(el, clientX, clientY) {
  var range = null;
  if (document.caretPositionFromPoint) {
    var pos = document.caretPositionFromPoint(clientX, clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  } else if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY);
  }
  if (!range || !el.contains(range.startContainer)) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  var sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Finish editing ──
export function finishEditing() {
  var s = state;
  if (!s.isEditing) return;
  var te = document.getElementById('textEditor');
  var se = document.getElementById('stickyEditor');
  var teVisible = te.style.display !== 'none' && te.style.display !== '';
  if (s.editId === 'new-text' && teVisible) {
    var spans = parseHtmlSpans(te, te.dataset.color || s.curColor);
    var text = spans.map(function(sp) { return sp.text; }).join('').trim();
	    if (text) addObj({ type: 'text', id: gid(), x: +te.dataset.wx, y: +te.dataset.wy, spans: spans, fontSize: +te.dataset.wfs, scaleX: 1, scaleY: 1, color: te.dataset.color || s.curColor, textAlign: 'center', wrapText: false, opacity: 1, rotation: 0 });
	    te.style.display = 'none'; te.innerHTML = ''; te.style.transform = ''; te.style.transformOrigin = ''; te.style.minWidth = ''; te.style.width = ''; te.style.maxWidth = ''; te.style.minHeight = ''; te.style.height = ''; te.style.whiteSpace = ''; te.style.textAlign = '';
  } else if (s.editId === 'new-sticky' && se.style.display === 'block') {
    var t = se.value.trim() || 'Note';
    addObj({ type: 'sticky', id: gid(), x: +se.dataset.wx, y: +se.dataset.wy, w: +se.dataset.w, h: +se.dataset.h, text: t, bgColor: se.dataset.bgColor, fontSize: +se.dataset.wfs, textAlign: 'center', opacity: 1, rotation: 0 });
    se.style.display = 'none'; se.value = ''; se.style.textAlign = '';
  } else if (typeof s.editId === 'number') {
    var obj = findObj(s.editId);
    if (obj) {
      if (obj.type === 'text' && teVisible) {
	        saveState(); obj.spans = parseHtmlSpans(te, obj.color || '#e4e4e8');
	        te.style.display = 'none'; te.innerHTML = ''; te.style.transform = ''; te.style.transformOrigin = ''; te.style.minWidth = ''; te.style.width = ''; te.style.maxWidth = ''; te.style.minHeight = ''; te.style.height = ''; te.style.whiteSpace = ''; te.style.textAlign = '';
      } else if (obj.type === 'sticky' && se.style.display === 'block') {
        saveState(); obj.text = se.value || 'Note'; obj.textAlign = obj.textAlign || 'center';
        se.style.display = 'none'; se.value = ''; se.style.textAlign = '';
      }
    }
  }
  s.isEditing = false; s.editId = null;
  requestRender();
}

export function updateEditorFS(obj) {
  var ed = document.getElementById('textEditor');
  applyTextEditorObjectStyles(ed, obj);
}

function getTextEditorTransform(obj) {
  var rot = obj.rotation || 0;
  if (Math.abs(rot) < 0.0001) return 'none';
  return 'rotate(' + rot + 'rad)';
}

function snapScreenPx(v) {
  var ratio = window.devicePixelRatio || 1;
  return Math.round(v * ratio) / ratio;
}

function applyTextEditorObjectStyles(ed, obj) {
  var scale = getTextBaseScale(obj);
  var b = getBounds(obj);
  ed.style.transform = getTextEditorTransform(obj);
  ed.style.transformOrigin = 'center center';
  ed.style.fontFamily = '"Open Sans", system-ui, -apple-system, sans-serif';
  ed.style.color = obj.color || '#e4e4e8';
  ed.style.fontSize = obj.fontSize * scale * cam.zoom + 'px';
  ed.style.lineHeight = '1.4';
  ed.style.fontWeight = obj.fontWeight || '400';
  ed.style.fontStyle = 'normal';
  ed.style.textDecoration = 'none';
  ed.style.textAlign = obj.textAlign || 'center';
  ed.style.whiteSpace = obj.wrapText ? 'pre-wrap' : 'pre';
  ed.style.overflowWrap = 'normal';
  ed.style.wordWrap = 'normal';
  ed.style.wordBreak = 'normal';
  ed.style.hyphens = 'none';
  ed.style.minWidth = b ? Math.max(40, b.w * cam.zoom) + 'px' : '0';
  ed.style.width = b ? Math.max(40, b.w * cam.zoom) + 'px' : 'auto';
  ed.style.maxWidth = b ? Math.max(40, b.w * cam.zoom) + 'px' : 'none';
  ed.style.minHeight = b ? Math.max(20, b.h * cam.zoom) + 'px' : '1em';
  ed.style.height = b ? Math.max(20, b.h * cam.zoom) + 'px' : 'auto';
}

// ── Keep editor overlay in sync with camera ──
export function updateEditorPosition() {
  var s = state;
  if (!s.isEditing) return;
  var te = document.getElementById('textEditor');
  var se = document.getElementById('stickyEditor');
	  if (te.style.display !== 'none' && te.style.display !== '') {
    var wx = +te.dataset.wx, wy = +te.dataset.wy;
    var obj = typeof s.editId === 'number' ? findObj(s.editId) : null;
    var sp;
    if (obj && obj.type === 'text') {
      var tb = getBounds(obj);
      sp = tb ? w2s(tb.x, tb.y) : w2s(obj.x, obj.y);
    } else {
      if (obj) { wx = obj.x; wy = obj.y; }
      sp = w2s(wx, wy);
    }
	    te.style.left = snapScreenPx(sp.x) + 'px';
	    te.style.top = snapScreenPx(sp.y) + 'px';
	    if (obj && obj.type === 'text') {
	      applyTextEditorObjectStyles(te, obj);
	    } else if (s.editId === 'new-text') {
	      te.style.fontSize = (+te.dataset.wfs || 20 / cam.zoom) * cam.zoom + 'px';
	      te.style.transform = 'translate(-50%, -50%)';
	      te.style.transformOrigin = 'center center';
	      te.style.minWidth = '60px';
	      te.style.width = 'auto';
	      te.style.maxWidth = 'none';
	      te.style.minHeight = '1em';
	      te.style.height = 'auto';
	      te.style.whiteSpace = 'pre-wrap';
	      te.style.textAlign = 'center';
	    }
	  }
  if (se.style.display === 'block') {
    var swx = +se.dataset.wx, swy = +se.dataset.wy;
    var sobj = typeof s.editId === 'number' ? findObj(s.editId) : null;
    if (sobj) { swx = sobj.x; swy = sobj.y; }
    var ssp = w2s(swx, swy);
    se.style.left = ssp.x + 'px';
    se.style.top = ssp.y + 'px';
    if (sobj && sobj.type === 'sticky') {
      se.style.width = Math.max(80, sobj.w * cam.zoom) + 'px';
      se.style.height = Math.max(80, sobj.h * cam.zoom) + 'px';
      se.style.fontSize = Math.max(10, sobj.fontSize * cam.zoom) + 'px';
      se.style.textAlign = sobj.textAlign || 'center';
    } else if (s.editId === 'new-sticky') {
      se.style.width = Math.max(80, (+se.dataset.w || 200 / cam.zoom) * cam.zoom) + 'px';
      se.style.height = Math.max(80, (+se.dataset.h || 200 / cam.zoom) * cam.zoom) + 'px';
      se.style.fontSize = Math.max(10, (+se.dataset.wfs || 16 / cam.zoom) * cam.zoom) + 'px';
      se.style.textAlign = 'center';
    }
  }
}

// ── Zoom ──
export function zoomAt(sx, sy, f) {
  var wp = s2w(sx, sy);
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * f));
  cam.x = sx - wp.x * cam.zoom;
  cam.y = sy - wp.y * cam.zoom;
  updateZoomDisplay();
  requestRender();
}

export function updateZoomDisplay() {
  var z = cam.zoom;
  var el = document.getElementById('zoomLevel');
  if (z >= 100) el.textContent = Math.round(z) + 'x';
  else if (z >= 1) el.textContent = Math.round(z * 100) + '%';
  else if (z >= 0.01) el.textContent = (z * 100).toFixed(1) + '%';
  else el.textContent = z.toExponential(1);
}

export function resetZoom() {
  cam.zoom = 1; cam.x = window.innerWidth / 2; cam.y = window.innerHeight / 2;
  updateZoomDisplay(); requestRender();
}

export function fitView() {
  if (!objects.length) { resetZoom(); return; }
  fitObjects(false);
}

function fitObjects(zoomOutOnly) {
  var a = Infinity, b = Infinity, c2 = -Infinity, d = -Infinity;
  objects.forEach(function(o) {
    var bb = getRotatedBounds(o); if (!bb) return;
    a = Math.min(a, bb.x); b = Math.min(b, bb.y);
    c2 = Math.max(c2, bb.x + bb.w); d = Math.max(d, bb.y + bb.h);
  });
  if (a === Infinity) return;
  var pd = 80, cw = c2 - a, ch = d - b;
  var sx = (window.innerWidth - pd * 2) / Math.max(1, cw);
  var sy = (window.innerHeight - pd * 2) / Math.max(1, ch);
  var s = Math.min(sx, sy);
  if (zoomOutOnly) s = Math.min(s, cam.zoom);
  cam.zoom = s; cam.x = window.innerWidth / 2 - (a + cw / 2) * s; cam.y = window.innerHeight / 2 - (b + ch / 2) * s;
  updateZoomDisplay(); requestRender();
}

export function locateObjects() {
  if (!objects.length) { showToast('No objects on canvas'); return; }
  state.locateEnd = performance.now() + 3000;
  animateLocate();
}

function animateLocate() {
  if (performance.now() >= state.locateEnd) {
    state.locateEnd = 0;
    requestRender();
    return;
  }
  requestRender();
  requestAnimationFrame(animateLocate);
}

export function clearAll() {
  if (!objects.length) return;
  saveState();
  objects.length = 0;
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  requestRender();
  showToast('Canvas cleared');
}

// ── Image ──
export function insertImg(file, wp) {
  if (!file || !file.type.startsWith('image/')) return;
  var r = new FileReader();
  r.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var mw = 400 / cam.zoom, asp = img.naturalWidth / img.naturalHeight;
      var w, h;
      if (asp >= 1) { w = Math.min(mw, img.naturalWidth / cam.zoom); h = w / asp; }
      else { h = Math.min(mw, img.naturalHeight / cam.zoom); w = h * asp; }
      var id = gid(); imgCache[id] = img;
      addObj({ type: 'image', id: id, x: wp.x - w / 2, y: wp.y - h / 2, w: w, h: h, src: e.target.result, opacity: 1, rotation: 0 });
      showToast('Image added');
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
}

// ── Export PNG ──
export function exportPNG() {
  if (!objects.length) { showToast('Nothing to export'); return; }
  var a = Infinity, b = Infinity, c2 = -Infinity, d = -Infinity;
  objects.forEach(function(o) {
    var bb = getRotatedBounds(o); if (!bb) return;
    a = Math.min(a, bb.x - 20); b = Math.min(b, bb.y - 20);
    c2 = Math.max(c2, bb.x + bb.w + 20); d = Math.max(d, bb.y + bb.h + 20);
  });
  var pd = 40, w = c2 - a + pd * 2, h = d - b + pd * 2, sc = 2;
  var tc = document.createElement('canvas'), tctx = tc.getContext('2d');
  tc.width = w * sc; tc.height = h * sc;
  tctx.scale(sc, sc); tctx.fillStyle = state.settings.canvasColor; tctx.fillRect(0, 0, w, h);
  tctx.translate(-a + pd, -b + pd);
  objects.forEach(function(o) { drawObject(tctx, o); });
  var link = document.createElement('a');
  link.download = 'whiteboard.png'; link.href = tc.toDataURL('image/png'); link.click();
  showToast('Exported as PNG');
}

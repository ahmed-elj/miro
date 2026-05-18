/** 
* Object bounds calculation and hit-testing.
*/

import { cam, objects } from './state.js';
import { HANDLE_HIT, ROTATE_HANDLE_DIST, ROTATE_HANDLE_RADIUS } from './constants.js';
import { ptSegDist, getArrowCurvePoints, getArrowBendHandle, getArrowCurvePoint, getArrowControlPoint } from './utils.js';
import { getTextLayout } from './textLayout.js';
import { getCommentBounds, hitComment } from './comments.js';

var textMeasureCanvas = document.createElement('canvas');
var textMeasureCtx = textMeasureCanvas.getContext('2d');

export function getBounds(obj) {
  switch (obj.type) {
    case 'path': {
      if (!obj.points || !obj.points.length) return null;
      var a = Infinity, b = Infinity, c2 = -Infinity, d = -Infinity;
      obj.points.forEach(function(p) {
        a = Math.min(a, p.x); b = Math.min(b, p.y);
        c2 = Math.max(c2, p.x); d = Math.max(d, p.y);
      });
      var pd = obj.strokeWidth || 1;
      return { x: a - pd, y: b - pd, w: (c2 - a) + pd * 2, h: (d - b) + pd * 2 };
    }
    case 'line':
    case 'arrow': {
      var p = obj.strokeWidth || 1;
      if (obj.type === 'arrow') {
        var pts = getArrowCurvePoints(obj);
        var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
        pts.forEach(function(pt) {
          ax = Math.min(ax, pt.x);
          ay = Math.min(ay, pt.y);
          bx = Math.max(bx, pt.x);
          by = Math.max(by, pt.y);
        });
        var bh = getArrowBendHandle(obj);
        if (bh) {
          ax = Math.min(ax, bh.x);
          ay = Math.min(ay, bh.y);
          bx = Math.max(bx, bh.x);
          by = Math.max(by, bh.y);
        }
        return {
          x: ax - p,
          y: ay - p,
          w: (bx - ax) + p * 2,
          h: (by - ay) + p * 2,
        };
      }
      return {
        x: Math.min(obj.x1, obj.x2) - p,
        y: Math.min(obj.y1, obj.y2) - p,
        w: Math.abs(obj.x2 - obj.x1) + p * 2,
        h: Math.abs(obj.y2 - obj.y1) + p * 2,
      };
    }
    case 'rect':
    case 'ellipse':
    case 'sticky':
    case 'image':
      return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    case 'comment':
      return getCommentBounds(obj);
  case 'text': {
  var tc = textMeasureCtx;
  var layout = getTextLayout(tc, obj, 'Open Sans');
  var contentW = (layout.maxW * layout.scale || 1) * layout.scaleX;
  var contentH = (layout.totalHeight * layout.scale || obj.fontSize) * layout.scaleY;
  var w = Math.max(contentW, obj.boxW || obj.wrapWidth || 0);
  var h = Math.max(contentH, obj.boxH || 0);
  return { x: obj.x - w / 2, y: obj.y - h / 2, w: w, h: h };
}
  }
  return null;
}

export function getCenter(obj) {
  var b = getBounds(obj);
  if (!b) return null;
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function rotatePoint(x, y, cx, cy, rot) {
  if (!rot) return { x: x, y: y };
  var cos = Math.cos(rot), sin = Math.sin(rot);
  var dx = x - cx, dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function inverseRotatePoint(x, y, cx, cy, rot) {
  return rotatePoint(x, y, cx, cy, -rot);
}

export function getRotatedCorners(obj) {
  var b = getBounds(obj);
  if (!b) return null;
  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  var rot = obj.rotation || 0;
  return [
    rotatePoint(b.x, b.y, cx, cy, rot),
    rotatePoint(b.x + b.w, b.y, cx, cy, rot),
    rotatePoint(b.x + b.w, b.y + b.h, cx, cy, rot),
    rotatePoint(b.x, b.y + b.h, cx, cy, rot),
  ];
}

export function getRotatedBounds(obj) {
  var cs = getRotatedCorners(obj);
  if (!cs) return null;
  var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  cs.forEach(function(p) {
    ax = Math.min(ax, p.x); ay = Math.min(ay, p.y);
    bx = Math.max(bx, p.x); by = Math.max(by, p.y);
  });
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

export function hitTest(obj, wx, wy) {
  // If object is rotated, inverse-rotate the test point around the bounding box center
  var rot = obj.rotation || 0;
  if (rot) {
    var b = getBounds(obj);
    if (b) {
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      var p = inverseRotatePoint(wx, wy, cx, cy, rot);
      wx = p.x;
      wy = p.y;
    }
  }
  var pad = Math.max(8, (obj.strokeWidth || 2)) / cam.zoom;
  switch (obj.type) {
    case 'path': return hitTestPath(obj, wx, wy, pad);
    case 'line':
    case 'arrow': return hitTestLine(obj, wx, wy, pad);
    case 'rect': return hitTestRect(obj, wx, wy, pad);
    case 'ellipse': return hitTestEllipse(obj, wx, wy, pad);
    case 'sticky':
    case 'image':
      return wx >= obj.x - pad && wx <= obj.x + obj.w + pad &&
             wy >= obj.y - pad && wy <= obj.y + obj.h + pad;
    case 'comment':
      return hitComment(obj, wx, wy, pad);
    case 'text': {
      var b = getBounds(obj);
      return b && wx >= b.x - pad && wx <= b.x + b.w + pad &&
             wy >= b.y - pad && wy <= b.y + b.h + pad;
    }
  }
  return false;
}

export function hitBorder(obj, wx, wy) {
  var rot = obj.rotation || 0;
  if (rot) {
    var rb = getBounds(obj);
    if (rb) {
      var rcx = rb.x + rb.w / 2, rcy = rb.y + rb.h / 2;
      var rp = inverseRotatePoint(wx, wy, rcx, rcy, rot);
      wx = rp.x;
      wy = rp.y;
    }
  }
  var pad = Math.max(10, (obj.strokeWidth || 2) * 2) / cam.zoom;
  switch (obj.type) {
    case 'path':
      return hitTestPath(obj, wx, wy, pad);
    case 'line':
    case 'arrow':
      return hitTestLine(obj, wx, wy, pad);
    case 'rect':
    case 'sticky':
    case 'image':
    case 'comment':
    case 'text': {
      var b = obj.type === 'rect' ? { x: obj.x, y: obj.y, w: obj.w, h: obj.h } : getBounds(obj);
      return b ? hitBoundsBorder(b, wx, wy, pad) : false;
    }
    case 'ellipse':
      return hitEllipseBorder(obj, wx, wy, pad);
  }
  return false;
}

function hitBoundsBorder(b, wx, wy, pad) {
  var inX = wx >= b.x - pad && wx <= b.x + b.w + pad;
  var inY = wy >= b.y - pad && wy <= b.y + b.h + pad;
  var nearTop = Math.abs(wy - b.y) <= pad;
  var nearBot = Math.abs(wy - (b.y + b.h)) <= pad;
  var nearLeft = Math.abs(wx - b.x) <= pad;
  var nearRight = Math.abs(wx - (b.x + b.w)) <= pad;
  return (inX && (nearTop || nearBot)) || (inY && (nearLeft || nearRight));
}

function hitEllipseBorder(o, wx, wy, pad) {
  var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  var rx = Math.max(0.1, Math.abs(o.w / 2)), ry = Math.max(0.1, Math.abs(o.h / 2));
  var dx = (wx - cx) / rx, dy = (wy - cy) / ry;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var t = pad / Math.min(rx, ry);
  return Math.abs(dist - 1) <= t;
}

function hitTestPath(o, wx, wy, pad) {
  var t = Math.max(pad, (o.strokeWidth || 1) / 2 + pad);
  for (var i = 0; i < o.points.length - 1; i++) {
    if (ptSegDist(wx, wy, o.points[i].x, o.points[i].y, o.points[i + 1].x, o.points[i + 1].y) < t) return true;
  }
  return false;
}

function hitTestLine(o, wx, wy, pad) {
  if (o.type === 'arrow') {
    var pts = getArrowCurvePoints(o);
    var t = Math.max(pad, (o.strokeWidth || 1) / 2 + pad);
    for (var i = 0; i < pts.length - 1; i++) {
      if (ptSegDist(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < t) return true;
    }
    return false;
  }
  return ptSegDist(wx, wy, o.x1, o.y1, o.x2, o.y2) < Math.max(pad, (o.strokeWidth || 1) / 2 + pad);
}

function hitTestRect(o, wx, wy, pad) {
  var t = Math.max(pad, (o.strokeWidth || 1) / 2 + pad);
  // If filled, any point inside the rect is a hit
  if (o.fill) {
    return wx >= o.x - t && wx <= o.x + o.w + t &&
           wy >= o.y - t && wy <= o.y + o.h + t;
  }
  // Stroke-only: hit only if near one of the four edges
  var inX = wx >= o.x - t && wx <= o.x + o.w + t;
  var inY = wy >= o.y - t && wy <= o.y + o.h + t;
  var nearTop = Math.abs(wy - o.y) < t;
  var nearBot = Math.abs(wy - (o.y + o.h)) < t;
  var nearLeft = Math.abs(wx - o.x) < t;
  var nearRight = Math.abs(wx - (o.x + o.w)) < t;
  return (inX && (nearTop || nearBot)) || (inY && (nearLeft || nearRight));
}

function hitTestEllipse(o, wx, wy, pad) {
  var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  var rx = Math.max(0.1, Math.abs(o.w / 2)), ry = Math.max(0.1, Math.abs(o.h / 2));
  var dx = (wx - cx) / rx, dy = (wy - cy) / ry;
  var dist = Math.sqrt(dx * dx + dy * dy);
  var t = Math.max(pad, (o.strokeWidth || 1) / 2 + pad) / Math.min(rx, ry);
  // If filled, any point inside the ellipse is a hit
  if (o.fill) {
    return dist <= 1 + t;
  }
  // Stroke-only: hit only if near the ellipse border
  return Math.abs(dist - 1) < t;
}

export function hitArrowBendHandle(obj, wx, wy) {
  if (!obj || obj.type !== 'arrow' || obj.bend == null) return false;
  var b = getBounds(obj);
  if (!b) return false;
  var rot = obj.rotation || 0;
  if (rot) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var p = inverseRotatePoint(wx, wy, cx, cy, rot);
    wx = p.x;
    wy = p.y;
  }
  var handle = getArrowBendHandle(obj);
  if (!handle) return false;
  var hs = HANDLE_HIT / cam.zoom;
  return Math.abs(wx - handle.x) < hs && Math.abs(wy - handle.y) < hs;
}

export function hitArrowEndpointHandle(obj, wx, wy) {
  if (!obj || (obj.type !== 'arrow' && obj.type !== 'line')) return null;
  var b = getBounds(obj);
  if (!b) return null;
  var rot = obj.rotation || 0;
  if (rot) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var p = inverseRotatePoint(wx, wy, cx, cy, rot);
    wx = p.x;
    wy = p.y;
  }
  var hs = HANDLE_HIT / cam.zoom;
  if (Math.abs(wx - obj.x1) < hs && Math.abs(wy - obj.y1) < hs) return 'arrow-start';
  if (Math.abs(wx - obj.x2) < hs && Math.abs(wy - obj.y2) < hs) return 'arrow-end';
  return null;
}

export function hitHandle(obj, wx, wy) {
  var b = getBounds(obj);
  if (!b) return null;
  // If object is rotated, inverse-rotate the test point around bounding box center
  var rot = obj.rotation || 0;
  if (rot) {
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var p = inverseRotatePoint(wx, wy, cx, cy, rot);
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

export function getArrowTangentVector(obj, atEnd) {
  if (!obj || obj.type !== 'arrow') return null;
  var cp = getArrowControlPoint(obj);
  var p1 = cp;
  var p2 = atEnd ? { x: obj.x2, y: obj.y2 } : { x: obj.x1, y: obj.y1 };
  if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.001) return null;
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

// ── Compute the unified bounding box of a set of object IDs ──
export function getGroupBounds(ids) {
  var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  var found = false;
  ids.forEach(function(id) {
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].id === id) {
          var b = getRotatedBounds(objects[i]);
        if (b) {
          found = true;
          ax = Math.min(ax, b.x); ay = Math.min(ay, b.y);
          bx = Math.max(bx, b.x + b.w); by = Math.max(by, b.y + b.h);
        }
        break;
      }
    }
  });
  if (!found) return null;
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

// ── Hit-test the rotation handle for a single object ──
// Returns true if (wx, wy) is within the rotation handle circle.
// The handle is at top-center of the bounding box, offset upward by ROTATE_HANDLE_DIST (screen px).
// If the object is rotated, we inverse-rotate the test point into the object's local frame.
export function hitRotateHandle(obj, wx, wy) {
  var b = getBounds(obj);
  if (!b) return false;
  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  var rot = obj.rotation || 0;
  // Inverse-rotate the test point into the object's local coordinate frame
  var lwx = wx, lwy = wy;
  if (rot) {
    var p = inverseRotatePoint(wx, wy, cx, cy, rot);
    lwx = p.x;
    lwy = p.y;
  }
  var iz = 1 / cam.zoom;
  var rhx = b.x + b.w / 2;
  var rhy = b.y - ROTATE_HANDLE_DIST * iz;
  var hr = Math.max(ROTATE_HANDLE_RADIUS * iz, HANDLE_HIT / cam.zoom / 2);
  var dx2 = lwx - rhx, dy2 = lwy - rhy;
  return dx2 * dx2 + dy2 * dy2 < hr * hr;
}

// ── Hit-test the rotation handle for a group bounding box ──
// Group handles are not rotated, so no inverse-rotation needed.
export function hitRotateHandleBounds(b, wx, wy) {
  if (!b) return false;
  var iz = 1 / cam.zoom;
  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (b.rotation) {
    var p = inverseRotatePoint(wx, wy, cx, cy, b.rotation);
    wx = p.x;
    wy = p.y;
  }
  var rhx = cx;
  var rhy = b.y - ROTATE_HANDLE_DIST * iz;
  var hr = Math.max(ROTATE_HANDLE_RADIUS * iz, HANDLE_HIT / cam.zoom / 2);
  var dx = wx - rhx, dy = wy - rhy;
  return dx * dx + dy * dy < hr * hr;
}

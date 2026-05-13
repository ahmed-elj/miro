/** 
* Object bounds calculation and hit-testing.
*/

import { cam, objects } from './state.js';
import { HANDLE_HIT } from './constants.js';
import { ptSegDist } from './utils.js';
import { getSpans } from './editor.js';

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
  case 'text': {
  var spans = getSpans(obj), rS = Math.max(1, obj.fontSize), sc = obj.fontSize / rS;
  var baseW = obj.fontWeight || 400;
  var tc = textMeasureCtx;
  var lines = [[]];
  spans.forEach(function(s) {
    var pts = s.text.split('\n');
    pts.forEach(function(pt, i) {
      if (i > 0) lines.push([]);
      if (pt) lines[lines.length - 1].push({ text: pt, bold: s.bold, italic: s.italic, color: s.color });
    });
  });
  var maxW = 0;
  lines.forEach(function(line) {
    var lw = 0;
    line.forEach(function(s) {
      var w = s.bold ? '700' : String(baseW);
      tc.font = (s.italic ? 'italic ' : 'normal ') + w + ' ' + rS + 'px Space Grotesk';
      lw += tc.measureText(s.text).width;
    });
    maxW = Math.max(maxW, lw);
  });
  var w = maxW * sc || 1, h = lines.length * rS * 1.4 * sc || obj.fontSize;
  return { x: obj.x - w / 2, y: obj.y - h / 2, w: w, h: h };
}
  }
  return null;
}

export function hitTest(obj, wx, wy) {
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
    case 'text': {
      var b = getBounds(obj);
      return b && wx >= b.x - pad && wx <= b.x + b.w + pad &&
             wy >= b.y - pad && wy <= b.y + b.h + pad;
    }
  }
  return false;
}

function hitTestPath(o, wx, wy, pad) {
  var t = Math.max(pad, (o.strokeWidth || 1) / 2 + pad);
  for (var i = 0; i < o.points.length - 1; i++) {
    if (ptSegDist(wx, wy, o.points[i].x, o.points[i].y, o.points[i + 1].x, o.points[i + 1].y) < t) return true;
  }
  return false;
}

function hitTestLine(o, wx, wy, pad) {
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

export function hitHandle(obj, wx, wy) {
  var b = getBounds(obj);
  if (!b) return null;
  var hs = HANDLE_HIT / cam.zoom;
  var cs = [
    { k: 'resize-tl', x: b.x, y: b.y },
    { k: 'resize-tr', x: b.x + b.w, y: b.y },
    { k: 'resize-bl', x: b.x, y: b.y + b.h },
    { k: 'resize-br', x: b.x + b.w, y: b.y + b.h },
  ];
  for (var i = 0; i < cs.length; i++) {
    if (Math.abs(wx - cs[i].x) < hs && Math.abs(wy - cs[i].y) < hs) return cs[i].k;
  }
  return null;
}

// ── Compute the unified bounding box of a set of object IDs ──
export function getGroupBounds(ids) {
  var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  var found = false;
  ids.forEach(function(id) {
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].id === id) {
        var b = getBounds(objects[i]);
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

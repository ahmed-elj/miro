/**
 * Object bounds calculation and hit-testing.
 */

import { cam } from './state.js';
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
      var spans = getSpans(obj), minR = 14, rS = Math.max(minR, obj.fontSize), sc = obj.fontSize / rS;
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
          tc.font = (s.italic ? 'italic ' : 'normal ') + (s.bold ? '700' : '400') + ' ' + rS + 'px Space Grotesk';
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
    case 'rect':
    case 'ellipse':
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

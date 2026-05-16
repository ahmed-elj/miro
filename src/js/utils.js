/**
 * Utility / helper functions.
 */

import { cam } from './state.js';

export function s2w(sx, sy) {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

export function w2s(wx, wy) {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

export function ptSegDist(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function getArrowHeadMode(obj) {
  return obj && ['none', 'start', 'end', 'both'].indexOf(obj.arrowHeads) >= 0
    ? obj.arrowHeads
    : 'end';
}

export function getArrowMidpoint(obj) {
  return {
    x: (obj.x1 + obj.x2) / 2,
    y: (obj.y1 + obj.y2) / 2,
  };
}

export function getArrowNormal(obj) {
  var dx = obj.x2 - obj.x1;
  var dy = obj.y2 - obj.y1;
  var len = Math.hypot(dx, dy);
  if (len < 0.001) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}

export function getArrowControlPoint(obj) {
  if (Number.isFinite(obj.cpX) && Number.isFinite(obj.cpY)) {
    return {
      x: obj.cpX * 2 - (obj.x1 + obj.x2) / 2,
      y: obj.cpY * 2 - (obj.y1 + obj.y2) / 2,
    };
  }
  var mid = getArrowMidpoint(obj);
  var normal = getArrowNormal(obj);
  return {
    x: mid.x + normal.x * (obj.bend || 0),
    y: mid.y + normal.y * (obj.bend || 0),
  };
}

export function getArrowBendHandle(obj) {
  if (!obj || obj.type !== 'arrow') return null;
  if (Number.isFinite(obj.cpX) && Number.isFinite(obj.cpY)) {
    return { x: obj.cpX, y: obj.cpY };
  }
  return getArrowCurvePoint(obj, 0.5);
}

export function getArrowCurvePoint(obj, t) {
  var mt = 1 - t;
  var cp = getArrowControlPoint(obj);
  return {
    x: mt * mt * obj.x1 + 2 * mt * t * cp.x + t * t * obj.x2,
    y: mt * mt * obj.y1 + 2 * mt * t * cp.y + t * t * obj.y2,
  };
}

export function getArrowCurvePoints(obj) {
  var baseLen = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
  var cp = getArrowControlPoint(obj);
  var bendLen = Math.hypot(cp.x - (obj.x1 + obj.x2) / 2, cp.y - (obj.y1 + obj.y2) / 2);
  var steps = Math.max(16, Math.ceil((baseLen + bendLen) / 24));
  var points = [];
  for (var i = 0; i <= steps; i++) points.push(getArrowCurvePoint(obj, i / steps));
  return points;
}

export function roundedRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

export function wrapLine(c, text, maxWidth) {
  if (maxWidth <= 0) return [text];
  var words = text.split(' '), result = [], line = '';
  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    var test = line ? line + ' ' + word : word;
    if (c.measureText(test).width > maxWidth && line) {
      result.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) result.push(line);
  return result;
}

export function rgbToHex(c) {
  if (!c) return c;
  if (c.startsWith('#')) return c;
  var m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return c;
  return '#' + [m[1], m[2], m[3]].map(function(x) {
    return parseInt(x).toString(16).padStart(2, '0');
  }).join('');
}

export function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#')) return 'rgba(16, 185, 129, ' + alpha + ')';
  var raw = hex.slice(1);
  if (raw.length === 3) raw = raw.split('').map(function(ch) { return ch + ch; }).join('');
  var num = parseInt(raw, 16);
  if (!Number.isFinite(num)) return 'rgba(16, 185, 129, ' + alpha + ')';
  var r = (num >> 16) & 255;
  var g = (num >> 8) & 255;
  var b = num & 255;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

export function showToast(msg) {
  var container = document.getElementById('toasts');
  var el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  container.appendChild(el);
  requestAnimationFrame(function() { el.classList.add('show'); });
  setTimeout(function() {
    el.classList.remove('show');
    setTimeout(function() { el.remove(); }, 300);
  }, 2000);
}

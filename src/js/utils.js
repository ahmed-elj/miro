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

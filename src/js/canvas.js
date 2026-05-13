/**
 * Canvas rendering — grid, objects, previews, selection handles.
 */

import {
  cam, ctx, dpr, canvas, objects, imgCache, state,
} from './state.js';
import { HANDLE_SIZE } from './constants.js';
import { s2w, roundedRect, wrapLine } from './utils.js';
import { getSpans } from './editor.js';
import { getBounds, getGroupBounds } from './objects.js';

let rafPending = false;
export function requestRender() {
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(function() {
      render();
      rafPending = false;
    });
  }
}

function render() {
  var s = state;
  var w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1a1a1f';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  drawGrid(w, h);
  for (var i = 0; i < objects.length; i++) {
    if (s.isEditing && objects[i].id === s.editId) continue;
    drawObject(ctx, objects[i]);
  }
  if (s.isDrawing) drawPreview(ctx);
  if (s.isBoxSelect) drawMarquee(ctx);
  if (s.selectedIds.length > 1 && !s.isEditing) drawGroupHandles(ctx);
  else if (s.selectedId !== null && !s.isEditing) drawHandles(ctx);
  if (s.locateEnd > 0) drawLocateHighlights(ctx);
  ctx.restore();
  if (!objects.length && !s.isDrawing) {
    ctx.fillStyle = '#3a3a44';
    ctx.font = '500 18px Space Grotesk';
    ctx.textAlign = 'center';
    ctx.fillText('Pick a tool and start drawing', w / 2, h / 2);
    ctx.font = '400 13px Space Grotesk';
    ctx.fillStyle = '#2a2a32';
    ctx.fillText('Scroll to zoom \u00B7 Space to pan \u00B7 Ctrl+Z to undo', w / 2, h / 2 + 30);
    ctx.textAlign = 'left';
  }
  if (typeof window.__updatePopup === 'function') window.__updatePopup();
}

function drawGrid(sw, sh) {
  var ws = 36 / cam.zoom, mag = Math.pow(10, Math.floor(Math.log10(ws))), n = ws / mag;
  var gs = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  var tl = s2w(0, 0), br = s2w(sw, sh);
  var sx = Math.floor(tl.x / gs) * gs, sy = Math.floor(tl.y / gs) * gs;
  ctx.fillStyle = '#28282f';
  var dr = 1 / cam.zoom;
  for (var x = sx; x <= br.x; x += gs)
    for (var y = sy; y <= br.y; y += gs) {
      ctx.beginPath();
      ctx.arc(x, y, dr, 0, Math.PI * 2);
      ctx.fill();
    }
}

export function drawObject(c, obj) {
  c.save();
  c.globalAlpha = obj.opacity != null ? obj.opacity : 1;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (obj.type) {
    case 'path': drawPath(c, obj); break;
    case 'line': drawLine(c, obj); break;
    case 'arrow': drawArrow(c, obj); break;
    case 'rect': drawRect(c, obj); break;
    case 'ellipse': drawEllipse(c, obj); break;
    case 'text': drawText(c, obj); break;
    case 'sticky': drawSticky(c, obj); break;
    case 'image': drawImageObj(c, obj); break;
  }
  c.restore();
}

function drawPath(c, o) {
  if (o.points.length < 2) return;
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth;
  c.beginPath(); c.moveTo(o.points[0].x, o.points[0].y);
  if (o.points.length === 2) { c.lineTo(o.points[1].x, o.points[1].y); }
  else {
    for (var i = 1; i < o.points.length - 1; i++) {
      var mx = (o.points[i].x + o.points[i+1].x) / 2, my = (o.points[i].y + o.points[i+1].y) / 2;
      c.quadraticCurveTo(o.points[i].x, o.points[i].y, mx, my);
    }
    c.lineTo(o.points[o.points.length - 1].x, o.points[o.points.length - 1].y);
  }
  c.stroke();
}

function drawLine(c, o) {
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth;
  c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke();
}

function drawArrow(c, o) {
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth;
  c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke();
  var len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
  if (len < 1) return;
  var hl = Math.min(len * 0.25, Math.max(o.strokeWidth * 4, len * 0.12));
  var a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
  var hw = Math.max(0.3, 0.4 - (hl / len) * 0.2);
  c.beginPath();
  c.moveTo(o.x2, o.y2); c.lineTo(o.x2 - hl * Math.cos(a - hw), o.y2 - hl * Math.sin(a - hw));
  c.moveTo(o.x2, o.y2); c.lineTo(o.x2 - hl * Math.cos(a + hw), o.y2 - hl * Math.sin(a + hw));
  c.stroke();
}

function drawRect(c, o) {
  if (o.fill) { c.fillStyle = o.fillColor; c.fillRect(o.x, o.y, o.w, o.h); }
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth; c.strokeRect(o.x, o.y, o.w, o.h);
}

function drawEllipse(c, o) {
  c.beginPath();
  c.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0.1, Math.abs(o.w / 2)), Math.max(0.1, Math.abs(o.h / 2)), 0, 0, Math.PI * 2);
  if (o.fill) { c.fillStyle = o.fillColor; c.fill(); }
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth; c.stroke();
}

function drawText(c, o) {
  var spans = getSpans(o), rS = Math.max(1, o.fontSize), sc = o.fontSize / rS;
  var baseW = o.fontWeight || 400;
  c.save(); c.translate(o.x, o.y); c.scale(sc, sc); c.textBaseline = 'middle';
  var lines = [[]];
  spans.forEach(function(s) {
    var pts = s.text.split('\n');
    pts.forEach(function(p, i) {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ text: p, bold: s.bold, italic: s.italic, underline: s.underline, color: s.color });
    });
  });
  function spanFont(s) {
    var w = s.bold ? '700' : String(baseW);
    return (s.italic ? 'italic ' : 'normal ') + w + ' ' + rS + 'px Space Grotesk';
  }
  // Measure max width for horizontal centering
  var lh = rS * 1.4;
  var maxW = 0;
  lines.forEach(function(line) {
    var lw = 0;
    line.forEach(function(s) {
      c.font = spanFont(s);
      lw += c.measureText(s.text).width;
    });
    if (lw > maxW) maxW = lw;
  });
  // Draw text: horizontally and vertically centered within bounds
  var totalH = lines.length * lh;
  var cy = -totalH / 2 + lh / 2;
  lines.forEach(function(line) {
    var lw = 0;
    line.forEach(function(s) { c.font = spanFont(s); lw += c.measureText(s.text).width; });
    var cx = -lw / 2;
    line.forEach(function(s) {
      c.font = spanFont(s);
      c.fillStyle = s.color;
      c.fillText(s.text, cx, cy);
      if (s.underline) {
        var tw = c.measureText(s.text).width;
        c.strokeStyle = s.color;
        c.lineWidth = Math.max(1, rS * 0.06);
        c.beginPath(); c.moveTo(cx, cy + rS * 0.35); c.lineTo(cx + tw, cy + rS * 0.35); c.stroke();
      }
      cx += c.measureText(s.text).width;
    });
    cy += lh;
  });
  c.restore();
}

function drawSticky(c, o) {
  var r = Math.min(o.w, o.h) * 0.05;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = o.h * 0.04; c.shadowOffsetX = 0; c.shadowOffsetY = o.h * 0.02;
  roundedRect(c, o.x, o.y, o.w, o.h, r); c.fillStyle = o.bgColor; c.fill();
  c.restore();
  roundedRect(c, o.x, o.y, o.w, o.h, r);
  c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = Math.max(0.5, o.h * 0.003); c.stroke();
  var minR = 14, rS = Math.max(minR, o.fontSize), sc = o.fontSize / rS;
  var pad = Math.min(o.w, o.h) * 0.08;
  c.save(); c.translate(o.x + pad, o.y + pad); c.scale(sc, sc);
  c.fillStyle = '#1a1a1f'; c.font = '500 ' + rS + 'px Space Grotesk'; c.textBaseline = 'top';
  var mxW = (o.w - pad * 2) / sc, cy = 0;
  o.text.split('\n').forEach(function(l) {
    wrapLine(c, l, mxW).forEach(function(wl2) { c.fillText(wl2, 0, cy); cy += rS * 1.45; });
  });
  c.restore();
}

function drawImageObj(c, o) {
  var img = imgCache[o.id];
  if (!img || !img.complete) {
    if (!img) {
      var i = new Image(); i.onload = function() { requestRender(); }; i.src = o.src; imgCache[o.id] = i;
    }
    c.fillStyle = '#2a2a32'; c.fillRect(o.x, o.y, o.w, o.h);
    c.strokeStyle = '#3a3a44'; c.lineWidth = 2 / cam.zoom; c.strokeRect(o.x, o.y, o.w, o.h);
    return;
  }
  c.drawImage(img, o.x, o.y, o.w, o.h);
}

function drawPreview(c) {
  var s = state;
  if (s.curTool === 'pen' && s.curPath.length >= 2) {
    c.save();
    c.strokeStyle = s.curColor; c.lineWidth = s.curStroke / cam.zoom;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(s.curPath[0].x, s.curPath[0].y);
    for (var i = 1; i < s.curPath.length - 1; i++) {
      var mx = (s.curPath[i].x + s.curPath[i+1].x) / 2, my = (s.curPath[i].y + s.curPath[i+1].y) / 2;
      c.quadraticCurveTo(s.curPath[i].x, s.curPath[i].y, mx, my);
    }
    c.lineTo(s.curPath[s.curPath.length - 1].x, s.curPath[s.curPath.length - 1].y);
    c.stroke(); c.restore();
    return;
  }
  if (!s.drawSt || !s.drawCur) return;
  c.save();
  var sw = s.curStroke / cam.zoom;
  c.strokeStyle = s.curColor; c.lineWidth = sw; c.lineCap = 'round'; c.lineJoin = 'round';
  var x1 = s.drawSt.x, y1 = s.drawSt.y, x2 = s.drawCur.x, y2 = s.drawCur.y;
  var x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (s.curTool === 'line') {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  } else if (s.curTool === 'arrow') {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    var len = Math.hypot(x2 - x1, y2 - y1);
    if (len >= 1) {
      var hl = Math.min(len * 0.25, Math.max(sw * 4, len * 0.12));
      var a = Math.atan2(y2 - y1, x2 - x1);
      var hw = Math.max(0.3, 0.4 - (hl / len) * 0.2);
      c.beginPath();
      c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(a - hw), y2 - hl * Math.sin(a - hw));
      c.moveTo(x2, y2); c.lineTo(x2 - hl * Math.cos(a + hw), y2 - hl * Math.sin(a + hw));
      c.stroke();
    }
  } else if (s.curTool === 'rect') {
    if (s.fillOn) { c.fillStyle = s.curColor + '33'; c.fillRect(x, y, w, h); }
    c.strokeRect(x, y, w, h);
  } else if (s.curTool === 'ellipse') {
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
    if (s.fillOn) { c.fillStyle = s.curColor + '33'; c.fill(); }
    c.stroke();
  }
  c.restore();
}

function drawHandles(c) {
  var s = state;
  var obj = null;
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].id === s.selectedId) { obj = objects[i]; break; }
  }
  if (!obj) return;
  var b = getBounds(obj);
  if (!b) return;
  c.save();
  var iz = 1 / cam.zoom;
  c.strokeStyle = '#10b981'; c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]); c.strokeRect(b.x, b.y, b.w, b.h); c.setLineDash([]);
  var hs = HANDLE_SIZE * iz;
  [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }].forEach(function(p) {
    c.fillStyle = '#10b981'; c.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    c.strokeStyle = '#141417'; c.lineWidth = 1.5 * iz; c.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
  });
  c.restore();
}

function drawLocateHighlights(c) {
  var s = state;
  var remaining = s.locateEnd - performance.now();
  if (remaining <= 0) { s.locateEnd = 0; return; }
  // Fade out over last 800ms; pulse via sin wave
  var fade = remaining < 800 ? remaining / 800 : 1;
  var pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
  var alpha = fade * (0.4 + 0.6 * pulse);
  var iz = 1 / cam.zoom;
  var pad = 6 * iz;
  c.save();
  c.strokeStyle = 'rgba(16, 185, 129, ' + alpha.toFixed(3) + ')';
  c.lineWidth = 2.5 * iz;
  c.setLineDash([8 * iz, 4 * iz]);
  c.lineDashOffset = -performance.now() * 0.03;
  for (var i = 0; i < objects.length; i++) {
    var b = getBounds(objects[i]);
    if (!b) continue;
    c.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  }
  c.setLineDash([]);
  c.restore();
}

function drawMarquee(c) {
  var s = state;
  if (!s.boxSelStart || !s.boxSelEnd) return;
  var x1 = s.boxSelStart.x, y1 = s.boxSelStart.y;
  var x2 = s.boxSelEnd.x, y2 = s.boxSelEnd.y;
  var x = Math.min(x1, x2), y = Math.min(y1, y2);
  var w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  c.save();
  var iz = 1 / cam.zoom;
  c.fillStyle = 'rgba(16, 185, 129, 0.08)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = '#10b981';
  c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]);
  c.strokeRect(x, y, w, h);
  c.setLineDash([]);
  c.restore();
}

function drawGroupHandles(c) {
  var s = state;
  var gb = getGroupBounds(s.selectedIds);
  if (!gb) return;
  c.save();
  var iz = 1 / cam.zoom;
  // Draw individual dashed outlines for each selected object
  c.strokeStyle = '#10b981';
  c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]);
  for (var i = 0; i < objects.length; i++) {
    var obj = objects[i];
    if (s.selectedIds.indexOf(obj.id) < 0) continue;
    var b = getBounds(obj);
    if (b) c.strokeRect(b.x, b.y, b.w, b.h);
  }
  c.setLineDash([]);
  // Draw unified group bounding box with solid line and corner handles
  c.strokeStyle = '#10b981';
  c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]);
  c.strokeRect(gb.x, gb.y, gb.w, gb.h);
  c.setLineDash([]);
  var hs = HANDLE_SIZE * iz;
  [{ x: gb.x, y: gb.y }, { x: gb.x + gb.w, y: gb.y }, { x: gb.x, y: gb.y + gb.h }, { x: gb.x + gb.w, y: gb.y + gb.h }].forEach(function(p) {
    c.fillStyle = '#10b981';
    c.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    c.strokeStyle = '#141417';
    c.lineWidth = 1.5 * iz;
    c.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
  });
  c.restore();
}

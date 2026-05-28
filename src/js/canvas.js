/**
 * Canvas rendering — grid, objects, previews, selection handles.
 */

import {
  cam, ctx, dpr, canvas, objects, imgCache, state,
} from './state.js';
import {
  HANDLE_SIZE,
  ROTATE_HANDLE_DIST,
  ROTATE_HANDLE_RADIUS,
  TOOL_WHEEL_TOOLS,
  TOOL_WHEEL_INNER_RADIUS,
  TOOL_WHEEL_OUTER_RADIUS,
} from './constants.js';
import { s2w, roundedRect, wrapLine, hexToRgba, getArrowCurvePoints, getArrowBendHandle, getArrowHeadMode, getArrowControlPoint } from './utils.js';
import { getBounds, getGroupBounds, getRotatedBounds, getArrowTangentVector } from './objects.js';
import { getTextLayout, measureTextLine, textFont } from './textLayout.js';
import { drawCommentBubble } from './comments.js';

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
  ctx.fillStyle = s.settings.canvasColor;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  drawGrid(w, h);
  for (var i = 0; i < objects.length; i++) {
    if (s.isEditing && objects[i].id === s.editId) {
      if (objects[i].type === 'sticky') drawStickyShellOnly(ctx, objects[i]);
      continue;
    }
    drawObject(ctx, objects[i]);
  }
  if (s.isDrawing || s.pendingPenPaths.length) drawPreview(ctx);
  if (s.isBoxSelect) drawMarquee(ctx);
  drawSnapGuides(ctx, w, h);
  if (s.groupEditId && !s.isEditing) drawGroupEditFrame(ctx);
  if (s.selectedIds.length > 1 && !s.isEditing) drawGroupHandles(ctx);
  else if (s.selectedId !== null && (!s.isEditing || s.editId === s.selectedId)) drawHandles(ctx);
  if (s.locateEnd > 0) drawLocateHighlights(ctx);
  ctx.restore();
  if (!objects.length && !s.isDrawing && !s.pendingPenPaths.length) {
    ctx.fillStyle = '#3a3a44';
    ctx.font = '500 18px Open Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Pick a tool and start drawing', w / 2, h / 2);
    ctx.font = '400 13px Open Sans';
    ctx.fillStyle = '#2a2a32';
    ctx.fillText('Scroll to zoom \u00B7 Space to pan \u00B7 Ctrl+Z to undo', w / 2, h / 2 + 30);
    ctx.textAlign = 'left';
  }
  if (s.toolWheel && s.toolWheel.active) drawToolWheel(ctx);
  if (typeof window.__updatePopup === 'function') window.__updatePopup();
}

function drawToolWheel(c) {
  var wheel = state.toolWheel;
  var cx = wheel.x;
  var cy = wheel.y;
  var segCount = TOOL_WHEEL_TOOLS.length;
  var segAngle = (Math.PI * 2) / segCount;
  var baseAngle = -Math.PI / 2 - segAngle / 2;

  c.save();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  c.fillStyle = 'rgba(20, 20, 23, 0.72)';
  c.beginPath();
  c.arc(cx, cy, TOOL_WHEEL_OUTER_RADIUS + 22, 0, Math.PI * 2);
  c.fill();

  TOOL_WHEEL_TOOLS.forEach(function(meta, index) {
    var a0 = baseAngle + index * segAngle;
    var a1 = a0 + segAngle;
    var isHover = wheel.hoverTool === meta.tool;

    c.beginPath();
    c.arc(cx, cy, TOOL_WHEEL_OUTER_RADIUS, a0, a1);
    c.arc(cx, cy, TOOL_WHEEL_INNER_RADIUS, a1, a0, true);
    c.closePath();
    c.fillStyle = isHover ? 'rgba(16, 185, 129, 0.24)' : 'rgba(30, 30, 36, 0.94)';
    c.fill();
    c.strokeStyle = isHover ? 'rgba(16, 185, 129, 0.95)' : 'rgba(58, 58, 68, 0.95)';
    c.lineWidth = isHover ? 2.5 : 1.25;
    c.stroke();

    var mid = a0 + segAngle / 2;
    var labelRadius = (TOOL_WHEEL_INNER_RADIUS + TOOL_WHEEL_OUTER_RADIUS) / 2;
    var tx = cx + Math.cos(mid) * labelRadius;
    var ty = cy + Math.sin(mid) * labelRadius;

    drawToolWheelIcon(c, meta.tool, tx, ty - 8, isHover);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = isHover ? '#ffffff' : '#d7d7df';
    c.font = '600 10px Open Sans';
    c.fillText(meta.label, tx, ty + 18);
  });

  c.beginPath();
  c.arc(cx, cy, TOOL_WHEEL_INNER_RADIUS - 10, 0, Math.PI * 2);
  c.fillStyle = 'rgba(20, 20, 23, 0.96)';
  c.fill();
  c.strokeStyle = 'rgba(58, 58, 68, 0.95)';
  c.lineWidth = 1.25;
  c.stroke();

  if (wheel.hoverTool) {
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(wheel.x2, wheel.y2);
    c.strokeStyle = 'rgba(16, 185, 129, 0.95)';
    c.lineWidth = 3;
    c.stroke();

    c.beginPath();
    c.arc(wheel.x2, wheel.y2, 5.5, 0, Math.PI * 2);
    c.fillStyle = '#10b981';
    c.fill();
  }

  c.restore();
}

function drawToolWheelIcon(c, tool, x, y, active) {
  var color = active ? '#d7fff0' : '#c8c8d2';
  c.save();
  c.translate(x, y);
  c.scale(0.82, 0.82);
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  if (tool === 'select') {
    c.beginPath();
    c.moveTo(-7, -10);
    c.lineTo(7, 1);
    c.lineTo(0, 3);
    c.lineTo(4, 11);
    c.lineTo(0, 13);
    c.lineTo(-4, 5);
    c.lineTo(-9, 10);
    c.closePath();
    c.fill();
  } else if (tool === 'hand') {
    c.beginPath();
    c.moveTo(-8, 3);
    c.lineTo(-8, -5);
    c.moveTo(-3, 6);
    c.lineTo(-3, -10);
    c.moveTo(2, 6);
    c.lineTo(2, -9);
    c.moveTo(7, 5);
    c.lineTo(7, -5);
    c.stroke();
    c.beginPath();
    c.arc(0, 5, 9, 0.15, Math.PI - 0.15, true);
    c.stroke();
  } else if (tool === 'pen') {
    c.beginPath();
    c.moveTo(-8, 9);
    c.lineTo(6, -7);
    c.lineTo(10, -3);
    c.lineTo(-4, 12);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-8, 9);
    c.lineTo(-11, 13);
    c.lineTo(-4, 12);
    c.stroke();
  } else if (tool === 'eraser') {
    c.beginPath();
    c.moveTo(-9, 4);
    c.lineTo(2, -8);
    c.lineTo(10, -1);
    c.lineTo(-1, 11);
    c.closePath();
    c.stroke();
    c.beginPath();
    c.moveTo(-4, 9);
    c.lineTo(8, 9);
    c.stroke();
  } else if (tool === 'line') {
    c.beginPath();
    c.moveTo(-11, 8);
    c.lineTo(11, -8);
    c.stroke();
  } else if (tool === 'arrow') {
    c.beginPath();
    c.moveTo(-11, 7);
    c.lineTo(9, -7);
    c.moveTo(2, -8);
    c.lineTo(9, -7);
    c.lineTo(7, 0);
    c.stroke();
  } else if (tool === 'rect') {
    c.strokeRect(-10, -8, 20, 16);
  } else if (tool === 'ellipse') {
    c.beginPath();
    c.ellipse(0, 0, 11, 8, 0, 0, Math.PI * 2);
    c.stroke();
  } else if (tool === 'text') {
    c.font = '800 22px Open Sans';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('T', 0, 1);
  } else if (tool === 'sticky') {
    c.beginPath();
    c.roundRect(-10, -9, 20, 18, 3);
    c.stroke();
    c.beginPath();
    c.moveTo(4, 9);
    c.lineTo(10, 3);
    c.lineTo(10, 9);
    c.closePath();
    c.stroke();
  } else if (tool === 'comment') {
    c.beginPath();
    c.roundRect(-11, -8, 22, 15, 6);
    c.stroke();
    c.beginPath();
    c.moveTo(-3, 7);
    c.lineTo(-7, 12);
    c.lineTo(2, 7);
    c.stroke();
  } else if (tool === 'image') {
    c.strokeRect(-11, -9, 22, 18);
    c.beginPath();
    c.arc(5, -4, 2, 0, Math.PI * 2);
    c.moveTo(-9, 7);
    c.lineTo(-3, 1);
    c.lineTo(1, 5);
    c.lineTo(5, 1);
    c.lineTo(10, 7);
    c.stroke();
  }

  c.restore();
}

function drawGrid(sw, sh) {
  var ws = 36 / cam.zoom, mag = Math.pow(10, Math.floor(Math.log10(ws))), n = ws / mag;
  var gs = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  var tl = s2w(0, 0), br = s2w(sw, sh);
  var sx = Math.floor(tl.x / gs) * gs, sy = Math.floor(tl.y / gs) * gs;
  if (state.settings.bgPattern === 'none') return;
  ctx.fillStyle = state.settings.gridColor;
  ctx.strokeStyle = state.settings.gridColor;
  var dr = 1 / cam.zoom;
  if (state.settings.bgPattern === 'grid') {
    ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath();
    for (var gx = sx; gx <= br.x; gx += gs) { ctx.moveTo(gx, tl.y); ctx.lineTo(gx, br.y); }
    for (var gy = sy; gy <= br.y; gy += gs) { ctx.moveTo(tl.x, gy); ctx.lineTo(br.x, gy); }
    ctx.stroke();
    return;
  }
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
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  // Apply rotation around bounding box center
  var rot = obj.rotation || 0;
  if (rot) {
    var b = getBounds(obj);
    if (b) {
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.translate(cx, cy);
      c.rotate(rot);
      c.translate(-cx, -cy);
    }
  }
  switch (obj.type) {
    case 'path': drawPath(c, obj); break;
    case 'line': drawLine(c, obj); break;
    case 'arrow': drawArrow(c, obj); break;
    case 'rect': drawRect(c, obj); break;
    case 'ellipse': drawEllipse(c, obj); break;
    case 'text': drawText(c, obj); break;
    case 'sticky': drawSticky(c, obj); break;
    case 'image': drawImageObj(c, obj); break;
    case 'comment': drawCommentBubble(c, obj); break;
  }
  c.restore();
}

function drawPath(c, o) {
  if (o.points.length < 2) return;
  if (o.fill && o.points.length >= 3) {
    fillShape(c, o, function() { tracePathShape(c, o, true); });
  }
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth;
  tracePathShape(c, o, false);
  c.stroke();
}

function tracePathShape(c, o, closePath) {
  c.beginPath(); c.moveTo(o.points[0].x, o.points[0].y);
  if (o.points.length === 2) { c.lineTo(o.points[1].x, o.points[1].y); }
  else {
    for (var i = 1; i < o.points.length - 1; i++) {
      var mx = (o.points[i].x + o.points[i+1].x) / 2, my = (o.points[i].y + o.points[i+1].y) / 2;
      c.quadraticCurveTo(o.points[i].x, o.points[i].y, mx, my);
    }
    c.lineTo(o.points[o.points.length - 1].x, o.points[o.points.length - 1].y);
  }
  if (closePath) c.closePath();
}

function drawLine(c, o) {
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth;
  c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke();
}

function drawArrowHead(c, seg, headSize) {
  if (!seg) return;
  var dx = seg.x2 - seg.x1;
  var dy = seg.y2 - seg.y1;
  var len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  var ux = dx / len;
  var uy = dy / len;
  var px = -uy;
  var py = ux;
  var hl = Math.max(0.01, Math.min(headSize || 18 / cam.zoom, len * 0.8));
  var hw = hl * 0.36;
  var bx = seg.x2 - ux * hl;
  var by = seg.y2 - uy * hl;
  c.beginPath();
  c.moveTo(bx + px * hw, by + py * hw);
  c.lineTo(seg.x2, seg.y2);
  c.lineTo(bx - px * hw, by - py * hw);
  c.strokeStyle = seg.color || '#e4e4e8';
  c.lineWidth = Math.max(1 / cam.zoom, (headSize || 18 / cam.zoom) * 0.12);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

function drawArrow(c, o) {
  c.strokeStyle = o.color;
  c.lineWidth = o.strokeWidth;
  var pts = getArrowCurvePoints(o);
  if (!pts.length) return;
  var cp = getArrowControlPoint(o);
  c.beginPath();
  c.moveTo(o.x1, o.y1);
  c.quadraticCurveTo(cp.x, cp.y, o.x2, o.y2);
  c.stroke();
  var headSize = o.arrowHeadSize || Math.max((o.strokeWidth || 2) * 10, 18 / cam.zoom);
  var headMode = getArrowHeadMode(o);
  if (headMode === 'end' || headMode === 'both') {
    var endSeg = getArrowTangentVector(o, true);
    if (endSeg) endSeg.color = o.color;
    drawArrowHead(c, endSeg, headSize);
  }
  if (headMode === 'start' || headMode === 'both') {
    var startSeg = getArrowTangentVector(o, false);
    if (startSeg) startSeg.color = o.color;
    drawArrowHead(c, startSeg, headSize);
  }
}

function drawRect(c, o) {
  if (o.fill) fillShape(c, o, function() { c.rect(o.x, o.y, o.w, o.h); });
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth; c.strokeRect(o.x, o.y, o.w, o.h);
}

function drawEllipse(c, o) {
  c.beginPath();
  c.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0.1, Math.abs(o.w / 2)), Math.max(0.1, Math.abs(o.h / 2)), 0, 0, Math.PI * 2);
  if (o.fill) fillShape(c, o, function() {
    c.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0.1, Math.abs(o.w / 2)), Math.max(0.1, Math.abs(o.h / 2)), 0, 0, Math.PI * 2);
  });
  c.beginPath();
  c.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0.1, Math.abs(o.w / 2)), Math.max(0.1, Math.abs(o.h / 2)), 0, 0, Math.PI * 2);
  c.strokeStyle = o.color; c.lineWidth = o.strokeWidth; c.stroke();
}

function fillShape(c, o, pathFn) {
  var color = o.fillColor || o.color || '#e4e4e8';
  var style = o.fillStyle || 'solid';
  var b = getBounds(o) || { x: o.x, y: o.y, w: o.w, h: o.h };
  if (!b) return;
  var alpha = o.fillOpacity != null ? o.fillOpacity : 0.28;
  c.save();
  c.beginPath();
  pathFn();
  c.clip();
  c.fillStyle = hexToRgba(color, style === 'crosshatch' ? alpha * 0.28 : alpha);
  c.fillRect(b.x, b.y, b.w, b.h);
  if (style === 'grain') drawFillGrain(c, b, color, alpha, o.id, o.grainIntensity != null ? o.grainIntensity : 0.6);
  else if (style === 'crosshatch') drawFillHatch(c, b, color, alpha, true);
  c.restore();
}

function drawFillGrain(c, o, color, alpha, id, intensity) {
  if (intensity <= 0) return;
  var scale = Math.min(2, Math.max(1, cam.zoom));
  var w = Math.max(1, Math.ceil(Math.abs(o.w) * scale));
  var h = Math.max(1, Math.ceil(Math.abs(o.h) * scale));
  var tex = document.createElement('canvas');
  tex.width = w;
  tex.height = h;
  var tc = tex.getContext('2d');
  var count = Math.floor(Math.min(9000, Math.max(500, (w * h) / 3)) * intensity);
  var dotAlpha = Math.min(0.5, alpha * (0.35 + intensity * 0.5));
  for (var i = 0; i < count; i++) {
    var seed = Math.sin((id || 1) * 101 + i * 97) * 10000;
    var rx = seed - Math.floor(seed);
    seed = Math.sin((id || 1) * 211 + i * 131) * 10000;
    var ry = seed - Math.floor(seed);
    var light = seededUnit((id || 1) * 307 + i * 149) > 0.45;
    tc.fillStyle = light ? hexToRgba('#ffffff', dotAlpha) : hexToRgba('#000000', dotAlpha * 0.75);
    var s = 1 + Math.floor(intensity * 1.5);
    tc.fillRect(rx * w, ry * h, s, s);
  }
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.filter = 'blur(' + Math.max(0.25, intensity * 0.8).toFixed(2) + 'px)';
  c.globalAlpha = Math.min(0.9, 0.35 + intensity * 0.55);
  c.drawImage(tex, o.x, o.y, o.w, o.h);
  c.restore();
}

function seededUnit(seed) {
  var x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function drawFillHatch(c, o, color, alpha, cross) {
  c.strokeStyle = hexToRgba(color, Math.min(1, alpha * 1.3));
  c.lineWidth = Math.max(0.8 / cam.zoom, Math.min(Math.abs(o.w), Math.abs(o.h)) * 0.006);
  var step = Math.max(8 / cam.zoom, Math.min(Math.abs(o.w), Math.abs(o.h)) * 0.12);
  drawHatchLines(c, o, step, 1);
  if (cross) drawHatchLines(c, o, step, -1);
}

function drawHatchLines(c, o, step, dir) {
  var x0 = o.x - Math.abs(o.h), x1 = o.x + o.w + Math.abs(o.h);
  for (var x = x0; x <= x1; x += step) {
    c.beginPath();
    c.moveTo(x, o.y + (dir > 0 ? o.h : 0));
    c.lineTo(x + Math.abs(o.h), o.y + (dir > 0 ? 0 : o.h));
    c.stroke();
  }
}

function drawText(c, o) {
  var layout = getTextLayout(c, o, 'Open Sans');
  var rS = layout.size, sc = layout.scale, scaleX = layout.scaleX, scaleY = layout.scaleY;
  if (o.fill) {
    var b = getBounds(o);
    if (b) fillShape(c, o, function() { c.rect(b.x, b.y, b.w, b.h); });
  }
  c.save(); c.translate(o.x, o.y); c.scale(sc * scaleX, sc * scaleY); c.textBaseline = 'middle';
  var align = o.textAlign || 'center';
  var contentW = (layout.maxW * sc || 1) * scaleX;
  var contentH = (layout.totalHeight * sc || o.fontSize) * scaleY;
  var boxW = Math.max(contentW, o.boxW || o.wrapWidth || 0);
  var boxH = Math.max(contentH, o.boxH || 0);
  var localBoxW = boxW / Math.max(0.001, Math.abs(sc * scaleX));
  var localBoxH = boxH / Math.max(0.001, Math.abs(sc * scaleY));
  var cy = -localBoxH / 2 + layout.lineHeight / 2;
  layout.lines.forEach(function(line) {
    var lw = measureTextLine(c, line, layout);
    var cx = align === 'left' ? -localBoxW / 2 : align === 'right' ? localBoxW / 2 - lw : -lw / 2;
    line.forEach(function(s) {
      c.font = textFont(s, layout.baseWeight, layout.size, layout.family);
      c.fillStyle = s.color;
      c.fillText(s.text, cx, cy);
      if (s.underline) {
        var tw = c.measureText(s.text).width;
        var underlineScaleY = Math.max(0.001, Math.abs(sc * scaleY));
        var screenToLocal = 1 / Math.max(0.001, cam.zoom * underlineScaleY);
        c.strokeStyle = s.color;
        c.lineWidth = Math.max(screenToLocal, Math.min(rS * 0.025, 3 * screenToLocal));
        c.lineCap = 'butt';
        c.beginPath(); c.moveTo(cx, cy + rS * 0.34); c.lineTo(cx + tw, cy + rS * 0.34); c.stroke();
      }
      cx += c.measureText(s.text).width;
    });
    cy += layout.lineHeight;
  });
  c.restore();
}

function drawSticky(c, o) {
  drawStickyShell(c, o);
  drawStickyText(c, o);
}

function drawStickyShellOnly(c, o) {
  c.save();
  var rot = o.rotation || 0;
  if (rot) {
    var b = getBounds(o);
    if (b) {
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      c.translate(cx, cy);
      c.rotate(rot);
      c.translate(-cx, -cy);
    }
  }
  drawStickyShell(c, o);
  c.restore();
}

function drawStickyShell(c, o) {
  var r = Math.min(o.w, o.h) * 0.05;
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;
  if (o.fill) {
    fillShape(c, o, function() { roundedRect(c, o.x, o.y, o.w, o.h, r); });
    return;
  }
  roundedRect(c, o.x, o.y, o.w, o.h, r);
  c.fillStyle = o.bgColor;
  c.fill();
}

function drawStickyText(c, o) {
  var minR = 14, rS = Math.max(minR, o.fontSize), sc = o.fontSize / rS;
  var pad = Math.min(o.w, o.h) * 0.08;
  c.save(); c.translate(o.x + pad, o.y + pad); c.scale(sc, sc);
  c.fillStyle = '#1a1a1f';
  c.font = (o.fontStyle === 'italic' ? 'italic ' : '') + (o.fontWeight || 400) + ' ' + rS + 'px Open Sans';
  c.textBaseline = 'top';
  c.textAlign = o.textAlign || 'center';
  var mxW = (o.w - pad * 2) / sc;
  var mxH = (o.h - pad * 2) / sc;
  var lineH = rS * 1.45;
  var lines = [];
  o.text.split('\n').forEach(function(l) {
    wrapLine(c, l, mxW).forEach(function(wl2) { lines.push(wl2); });
  });
  var totalH = lines.length * lineH;
  var cy = Math.max(0, (mxH - totalH) / 2);
  var tx = c.textAlign === 'left' ? 0 : c.textAlign === 'right' ? mxW : mxW / 2;
  lines.forEach(function(line) {
    c.fillText(line, tx, cy);
    if (o.underline) {
      var tw = c.measureText(line).width;
      var x1 = c.textAlign === 'center' ? tx - tw / 2 : c.textAlign === 'right' ? tx - tw : tx;
      var y = cy + rS * 1.08;
      c.strokeStyle = '#1a1a1f';
      c.lineWidth = Math.max(1 / Math.max(0.001, cam.zoom * sc), rS * 0.05);
      c.beginPath();
      c.moveTo(x1, y);
      c.lineTo(x1 + tw, y);
      c.stroke();
    }
    cy += lineH;
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
  if (o.fill) fillShape(c, o, function() { c.rect(o.x, o.y, o.w, o.h); });
}

function drawPreview(c) {
  var s = state;
  for (var p = 0; p < s.pendingPenPaths.length; p++) {
    drawPenPreview(c, s.pendingPenPaths[p].points, s.pendingPenPaths[p].color, s.pendingPenPaths[p].strokeWidth);
  }
  if (s.curTool === 'pen' && s.curPath.length >= 2) {
    drawPenPreview(c, s.curPath, s.curColor, s.curStroke / cam.zoom);
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
    drawArrow(c, {
      type: 'arrow',
      x1: x1,
      y1: y1,
      x2: x2,
      y2: y2,
      bend: s.arrowPreviewBend,
      color: s.curColor,
      strokeWidth: sw,
      arrowHeadSize: Math.max(s.curStroke * 5, 18) / cam.zoom,
    });
  } else if (s.curTool === 'rect') {
    if (s.fillOn) fillShape(c, { x: x, y: y, w: w, h: h, color: s.curColor, fillColor: s.curColor, fillStyle: 'solid' }, function() { c.rect(x, y, w, h); });
    c.strokeRect(x, y, w, h);
  } else if (s.curTool === 'ellipse') {
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
    if (s.fillOn) fillShape(c, { x: x, y: y, w: w, h: h, color: s.curColor, fillColor: s.curColor, fillStyle: 'solid' }, function() {
      c.ellipse(x + w / 2, y + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
    });
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

function drawPenPreview(c, points, color, strokeWidth) {
  if (!points || points.length < 2) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = strokeWidth;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(points[0].x, points[0].y);
  for (var i = 1; i < points.length - 1; i++) {
    var mx = (points[i].x + points[i + 1].x) / 2, my = (points[i].y + points[i + 1].y) / 2;
    c.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  c.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  c.stroke();
  c.restore();
}

function getResizeHandlePoints(b) {
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w / 2, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h / 2 },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x + b.w / 2, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
    { x: b.x, y: b.y + b.h / 2 },
  ];
}

function drawResizeHandles(c, b, hs, iz, accent) {
  getResizeHandlePoints(b).forEach(function(p) {
    c.fillStyle = accent; c.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    c.strokeStyle = '#141417'; c.lineWidth = 1.5 * iz; c.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
  });
}

function drawSnapGuides(c, screenW, screenH) {
  var guides = state.snapGuides || [];
  if (!guides.length) return;
  var tl = s2w(0, 0);
  var br = s2w(screenW, screenH);
  var iz = 1 / cam.zoom;
  c.save();
  c.strokeStyle = hexToRgba(state.settings.accentColor, 0.55);
  c.lineWidth = 1.25 * iz;
  c.setLineDash([7 * iz, 5 * iz]);
  guides.forEach(function(guide) {
    c.beginPath();
    if (guide.axis === 'x') {
      c.moveTo(guide.value, tl.y);
      c.lineTo(guide.value, br.y);
    } else {
      c.moveTo(tl.x, guide.value);
      c.lineTo(br.x, guide.value);
    }
    c.stroke();
  });
  c.restore();
}

function drawHandles(c) {
  var s = state;
  var accent = s.settings.accentColor;
  var obj = null;
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].id === s.selectedId) { obj = objects[i]; break; }
  }
  if (!obj) return;
  if (obj.type === 'comment' && s.commentHandlesId !== obj.id) return;
  var b = getBounds(obj);
  if (!b) return;
  c.save();
  var iz = 1 / cam.zoom;
  // Apply rotation to the handles if object is rotated
  var rot = obj.rotation || 0;
  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (rot) {
    c.translate(cx, cy);
    c.rotate(rot);
    c.translate(-cx, -cy);
  }
  if (obj.type === 'arrow' || obj.type === 'line') {
    c.strokeStyle = accent;
    c.lineWidth = 1.25 * iz;
    c.setLineDash([4 * iz, 3 * iz]);
    c.beginPath();
    if (obj.type === 'arrow') {
      var bend = getArrowBendHandle(obj);
      var cp = getArrowControlPoint(obj);
      c.moveTo(obj.x1, obj.y1);
      c.quadraticCurveTo(cp.x, cp.y, obj.x2, obj.y2);
    } else {
      c.moveTo(obj.x1, obj.y1);
      c.lineTo(obj.x2, obj.y2);
    }
    c.stroke();
    c.setLineDash([]);
    if (obj.type === 'arrow') {
      c.beginPath();
      c.arc(bend.x, bend.y, HANDLE_SIZE * 1.15 * iz, 0, Math.PI * 2);
      c.fillStyle = accent;
      c.fill();
      c.strokeStyle = '#141417';
      c.lineWidth = 1.5 * iz;
      c.stroke();
    }
    [
      { x: obj.x1, y: obj.y1 },
      { x: obj.x2, y: obj.y2 },
    ].forEach(function(p) {
      c.beginPath();
      c.arc(p.x, p.y, HANDLE_SIZE * 0.9 * iz, 0, Math.PI * 2);
      c.fillStyle = '#141417';
      c.fill();
      c.strokeStyle = accent;
      c.lineWidth = 2 * iz;
      c.stroke();
    });
    c.restore();
    return;
  }
  c.strokeStyle = accent; c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]); c.strokeRect(b.x, b.y, b.w, b.h); c.setLineDash([]);
  var hs = HANDLE_SIZE * iz;
  drawResizeHandles(c, b, hs, iz, accent);
  // Rotation gizmo: line from top-center to rotation handle circle
  var tcx = b.x + b.w / 2, tcy = b.y;
  var rhx = tcx, rhy = tcy - ROTATE_HANDLE_DIST * iz;
  c.strokeStyle = accent; c.lineWidth = 1.5 * iz;
  c.beginPath(); c.moveTo(tcx, tcy); c.lineTo(rhx, rhy); c.stroke();
  c.beginPath(); c.arc(rhx, rhy, ROTATE_HANDLE_RADIUS * iz, 0, Math.PI * 2);
  c.fillStyle = accent; c.fill();
  c.strokeStyle = '#141417'; c.lineWidth = 1.5 * iz; c.stroke();
  c.restore();
}

function drawLocateHighlights(c) {
  var s = state;
  var accent = s.settings.accentColor;
  var remaining = s.locateEnd - performance.now();
  if (remaining <= 0) { s.locateEnd = 0; return; }
  var alpha = remaining < 500 ? remaining / 500 : 1;
  var iz = 1 / cam.zoom;
  var pad = 6 * iz;
  c.save();
  c.strokeStyle = hexToRgba(accent, (0.9 * alpha).toFixed(3));
  c.lineWidth = 2 * iz;
  c.setLineDash([]);
  for (var i = 0; i < objects.length; i++) {
    var b = getRotatedBounds(objects[i]);
    if (!b) continue;
    c.save();
    var obj = objects[i], rot = obj.rotation || 0;
    if (rot) {
      var ub = getBounds(obj);
      if (ub) {
        var cx = ub.x + ub.w / 2, cy = ub.y + ub.h / 2;
        c.translate(cx, cy); c.rotate(rot); c.translate(-cx, -cy);
        c.strokeRect(ub.x - pad, ub.y - pad, ub.w + pad * 2, ub.h + pad * 2);
      }
    } else {
      c.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    }
    c.restore();
  }
  c.restore();
}

function drawMarquee(c) {
  var s = state;
  var accent = s.settings.accentColor;
  if (!s.boxSelStart || !s.boxSelEnd) return;
  var x1 = s.boxSelStart.x, y1 = s.boxSelStart.y;
  var x2 = s.boxSelEnd.x, y2 = s.boxSelEnd.y;
  var x = Math.min(x1, x2), y = Math.min(y1, y2);
  var w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  c.save();
  var iz = 1 / cam.zoom;
  c.fillStyle = hexToRgba(accent, 0.08);
  c.fillRect(x, y, w, h);
  c.strokeStyle = accent;
  c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]);
  c.strokeRect(x, y, w, h);
  c.setLineDash([]);
  c.restore();
}

function drawGroupEditFrame(c) {
  var s = state;
  var accent = s.settings.accentColor;
  var bounds = [];
  for (var i = 0; i < objects.length; i++) {
    if (objects[i].groupId !== s.groupEditId) continue;
    var b = getRotatedBounds(objects[i]);
    if (b) bounds.push(b);
  }
  if (!bounds.length) return;
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  bounds.forEach(function(b) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  });
  var iz = 1 / cam.zoom;
  var pad = 16 * iz;
  var r = 14 * iz;
  var x = x1 - pad;
  var y = y1 - pad;
  var w = x2 - x1 + pad * 2;
  var h = y2 - y1 + pad * 2;

  c.save();
  roundedRect(c, x, y, w, h, r);
  c.fillStyle = hexToRgba(accent, 0.04);
  c.fill();
  roundedRect(c, x, y, w, h, r);
  c.strokeStyle = hexToRgba(accent, 0.9);
  c.lineWidth = 2.5 * iz;
  c.setLineDash([10 * iz, 6 * iz]);
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

function drawGroupHandles(c) {
  var s = state;
  var accent = s.settings.accentColor;
  var gb = s.dragMode === 'rotate-multi' && s.dragGroupBounds
    ? s.dragGroupBounds
    : getGroupBounds(s.selectedIds);
  if (!gb) return;
  c.save();
  var iz = 1 / cam.zoom;
  // Draw unified group bounding box with corner handles.
  var groupRot = s.groupRotation || 0;
  var gcx = gb.x + gb.w / 2, gcy = gb.y + gb.h / 2;
  if (groupRot) {
    c.translate(gcx, gcy);
    c.rotate(groupRot);
    c.translate(-gcx, -gcy);
  }
  c.strokeStyle = accent;
  c.lineWidth = 1.5 * iz;
  c.setLineDash([6 * iz, 4 * iz]);
  c.strokeRect(gb.x, gb.y, gb.w, gb.h);
  c.setLineDash([]);
  var hs = HANDLE_SIZE * iz;
  drawResizeHandles(c, gb, hs, iz, accent);
  // Rotation gizmo: line from top-center to rotation handle circle
  var tcx = gb.x + gb.w / 2, tcy = gb.y;
  var rhx = tcx, rhy = tcy - ROTATE_HANDLE_DIST * iz;
  c.strokeStyle = accent; c.lineWidth = 1.5 * iz;
  c.beginPath(); c.moveTo(tcx, tcy); c.lineTo(rhx, rhy); c.stroke();
  c.beginPath(); c.arc(rhx, rhy, ROTATE_HANDLE_RADIUS * iz, 0, Math.PI * 2);
  c.fillStyle = accent; c.fill();
  c.strokeStyle = '#141417'; c.lineWidth = 1.5 * iz; c.stroke();
  c.restore();
}

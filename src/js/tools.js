/**
 * Tool implementations — select, pan, pen, eraser, shapes, text, sticky, image.
 */

import { cam, objects, imgCache, state, gid } from './state.js';
import { STICKY_COLORS, MIN_ZOOM, MAX_ZOOM, CURSOR_MAP } from './constants.js';
import { s2w, w2s, showToast } from './utils.js';
import { requestRender, drawObject } from './canvas.js';
import { getBounds, hitTest, hitHandle } from './objects.js';
import { getSpans, parseHtmlSpans, spansToHtml } from './editor.js';
import { saveState, addObj, delSel, findObj } from './undo.js';

// ── Select tool: pointer down ──
export function onSelectDown(wp, sx, sy) {
  var s = state;
  // Check resize handles on currently selected object first
  if (s.selectedId !== null) {
    var obj = findObj(s.selectedId);
    if (obj) {
      var h = hitHandle(obj, wp.x, wp.y);
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
  var hits = [];
  for (var i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], wp.x, wp.y)) hits.push(objects[i]);
  }
  if (hits.length) {
    // If the already-selected object is under the cursor, allow dragging it.
    // Cycle to the next object only on click-up (no drag movement).
    var selObj = s.selectedId !== null ? findObj(s.selectedId) : null;
    var selInHits = -1;
    if (selObj) {
      for (var j = 0; j < hits.length; j++) {
        if (hits[j].id === selObj.id) { selInHits = j; break; }
      }
    }
    if (selInHits >= 0) {
      // Set up drag on current selection; defer cycle to pointer up
      s.dragMode = 'move';
      s.dragSW = wp;
      s.dragSnap = JSON.parse(JSON.stringify(selObj));
      s.dragUndo = false;
      s.cycleHits = hits;
      s.cycleIdx = selInHits;
  } else {
    // New area — select topmost object
    s.selectedId = hits[0].id;
    s.dragMode = 'move';
    s.dragSW = wp;
    s.dragSnap = JSON.parse(JSON.stringify(hits[0]));
    s.dragUndo = false;
    s.cycleHits = null;
    s.cycleIdx = -1;
    s._lastPopupId = null;
  }
    requestRender();
  } else if (s.selectedId !== null) {
    s.selectedId = null;
    requestRender();
  }
}

// ── Cycle selection on click (no drag) ──
export function cycleSelect() {
  var s = state;
  if (!s.cycleHits || s.cycleIdx < 0) return;
  var hits = s.cycleHits;
  var nextIdx = s.cycleIdx + 1 < hits.length ? s.cycleIdx + 1 : 0;
  var nextHit = hits[nextIdx];
  s.selectedId = nextHit.id;
  s.cycleIdx = nextIdx;
  s._lastPopupId = null;
  requestRender();
}

// ── Drag handling ──
export function handleDrag(wp) {
  var s = state;
  var obj = findObj(s.selectedId);
  if (!obj || !s.dragSnap) return;
  var dx = wp.x - s.dragSW.x, dy = wp.y - s.dragSW.y, snap = s.dragSnap;

  if (s.dragMode === 'move') {
    switch (obj.type) {
      case 'path':
        obj.points = snap.points.map(function(p) { return { x: p.x + dx, y: p.y + dy }; });
        break;
      case 'line':
      case 'arrow':
        obj.x1 = snap.x1 + dx; obj.y1 = snap.y1 + dy;
        obj.x2 = snap.x2 + dx; obj.y2 = snap.y2 + dy;
        break;
      default:
        obj.x = snap.x + dx; obj.y = snap.y + dy;
        break;
    }
  } else if (s.dragMode.startsWith('resize-')) {
    var ms = 10 / cam.zoom;
    if (obj.type === 'rect' || obj.type === 'ellipse' || obj.type === 'image') {
      applyResize(obj, snap, dx, dy, ms);
    } else if (obj.type === 'sticky') {
      applyStickyResize(obj, snap, dx, dy);
    } else if (obj.type === 'text') {
      applyTextResize(obj, snap, dx, dy);
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      if (s.dragMode === 'resize-br' || s.dragMode === 'resize-tr') {
        if (snap.x2 >= snap.x1) { obj.x2 = snap.x2 + dx; obj.y2 = snap.y2 + dy; }
        else { obj.x1 = snap.x1 + dx; obj.y1 = snap.y1 + dy; }
      } else {
        if (snap.x1 <= snap.x2) { obj.x1 = snap.x1 + dx; obj.y1 = snap.y1 + dy; }
        else { obj.x2 = snap.x2 + dx; obj.y2 = snap.y2 + dy; }
      }
    } else if (obj.type === 'path') {
      var b = getBounds(snap);
      if (!b || b.w < 0.01 || b.h < 0.01) return;
      var ox, oy, sx2, sy2;
      if (s.dragMode === 'resize-br') { ox = b.x; oy = b.y; sx2 = (b.w + dx) / b.w; sy2 = (b.h + dy) / b.h; }
      else if (s.dragMode === 'resize-bl') { ox = b.x + b.w; oy = b.y; sx2 = (b.w - dx) / b.w; sy2 = (b.h + dy) / b.h; }
      else if (s.dragMode === 'resize-tr') { ox = b.x; oy = b.y + b.h; sx2 = (b.w + dx) / b.w; sy2 = (b.h - dy) / b.h; }
      else { ox = b.x + b.w; oy = b.y + b.h; sx2 = (b.w - dx) / b.w; sy2 = (b.h - dy) / b.h; }
      sx2 = Math.max(0.05, sx2); sy2 = Math.max(0.05, sy2);
      obj.points = snap.points.map(function(p) { return { x: ox + (p.x - ox) * sx2, y: oy + (p.y - oy) * sy2 }; });
    }
  }
  requestRender();
}

function applyResize(o, snap, dx, dy, ms) {
  var dm = state.dragMode;
  if (dm === 'resize-br') {
    o.w = Math.max(ms, snap.w + dx); o.h = Math.max(ms, snap.h + dy);
  } else if (dm === 'resize-bl') {
    var nw = Math.max(ms, snap.w - dx); o.x = snap.x + snap.w - nw; o.w = nw; o.h = Math.max(ms, snap.h + dy);
  } else if (dm === 'resize-tr') {
    o.w = Math.max(ms, snap.w + dx); var nh = Math.max(ms, snap.h - dy); o.y = snap.y + snap.h - nh; o.h = nh;
  } else if (dm === 'resize-tl') {
    var nw2 = Math.max(ms, snap.w - dx), nh2 = Math.max(ms, snap.h - dy);
    o.x = snap.x + snap.w - nw2; o.y = snap.y + snap.h - nh2; o.w = nw2; o.h = nh2;
  }
}

function applyStickyResize(o, snap, dx, dy) {
  var ms = 40 / cam.zoom;
  var origW = snap.w, origH = snap.h;
  applyResize(o, snap, dx, dy, ms);
  if (origW > 0 && origH > 0) {
    var sw2 = o.w / origW, sh2 = o.h / origH;
    o.fontSize = snap.fontSize * ((sw2 + sh2) / 2);
  }
}

function applyTextResize(obj, snap, dx, dy) {
  var ob = getBounds(snap);
  if (!ob || ob.w < 1 || ob.h < 1) return;
  var dm = state.dragMode;
  // Anchor the opposite edge/corner in world space
  var ax, ay;
  if (dm === 'resize-br') { ax = ob.x; ay = ob.y; }
  else if (dm === 'resize-bl') { ax = ob.x + ob.w; ay = ob.y; }
  else if (dm === 'resize-tr') { ax = ob.x; ay = ob.y + ob.h; }
  else { ax = ob.x + ob.w; ay = ob.y + ob.h; }
  var sx2 = (ob.w + (dm === 'resize-bl' || dm === 'resize-tl' ? -dx : dx)) / ob.w;
  var sy2 = (ob.h + (dm === 'resize-tr' || dm === 'resize-tl' ? -dy : dy)) / ob.h;
  var sc = Math.max(0.1, (Math.abs(sx2) + Math.abs(sy2)) / 2);
  obj.fontSize = snap.fontSize * sc;
  var nb = getBounds(obj);
  if (nb) {
    // (obj.x, obj.y) is center of bounds
    if (dm === 'resize-br' || dm === 'resize-tr') obj.x = ax + nb.w / 2;
    else obj.x = ax - nb.w / 2;
    if (dm === 'resize-br' || dm === 'resize-bl') obj.y = ay + nb.h / 2;
    else obj.y = ay - nb.h / 2;
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
    addObj({
      type: 'path', id: gid(), points: s.curPath.map(function(p) { return { x: p.x, y: p.y }; }),
      color: s.curColor, strokeWidth: s.curStroke / cam.zoom, opacity: 1,
    });
  }
  s.curPath = [];
  s.drawSt = null;
  s.drawCur = null;
}

// ── Eraser ──
export function startErase() { state.isDrawing = true; }

export function eraseAt(wp) {
  for (var i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], wp.x, wp.y)) {
      saveState();
      objects.splice(i, 1);
      if (state.selectedId !== null && !findObj(state.selectedId)) state.selectedId = null;
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
}

export function finishShape() {
  var s = state;
  s.isDrawing = false;
  if (!s.drawSt || !s.drawCur) return;
  var x1 = s.drawSt.x, y1 = s.drawSt.y, x2 = s.drawCur.x, y2 = s.drawCur.y;
  if (Math.abs(x2 - x1) < 3 / cam.zoom && Math.abs(y2 - y1) < 3 / cam.zoom) {
    s.drawSt = null; s.drawCur = null; return;
  }
  var sw = s.curStroke / cam.zoom;
  if (s.curTool === 'line') addObj({ type: 'line', id: gid(), x1: x1, y1: y1, x2: x2, y2: y2, color: s.curColor, strokeWidth: sw, opacity: 1 });
  else if (s.curTool === 'arrow') addObj({ type: 'arrow', id: gid(), x1: x1, y1: y1, x2: x2, y2: y2, color: s.curColor, strokeWidth: sw, opacity: 1 });
  else if (s.curTool === 'rect') addObj({ type: 'rect', id: gid(), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: s.curColor, strokeWidth: sw, fill: s.fillOn, fillColor: s.curColor + '33', opacity: 1 });
  else if (s.curTool === 'ellipse') addObj({ type: 'ellipse', id: gid(), x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), color: s.curColor, strokeWidth: sw, fill: s.fillOn, fillColor: s.curColor + '33', opacity: 1 });
  s.drawSt = null;
  s.drawCur = null;
}

// ── Text create ──
export function startTextCreate(wp) {
  var s = state;
  var ed = document.getElementById('textEditor');
  var sp = w2s(wp.x, wp.y);
  var wfs = 20 / cam.zoom;
  ed.style.display = 'block';
  ed.style.left = sp.x + 'px'; ed.style.top = sp.y + 'px';
  ed.style.transform = 'translate(-50%, -50%)';
  ed.style.color = s.curColor;
  ed.style.fontSize = wfs * cam.zoom + 'px';
  ed.style.fontWeight = '400'; ed.style.fontStyle = 'normal'; ed.style.textDecoration = 'none';
  ed.innerHTML = '';
  s.isEditing = true; s.editId = 'new-text';
  ed.dataset.wx = wp.x; ed.dataset.wy = wp.y; ed.dataset.wfs = wfs; ed.dataset.color = s.curColor;
  setTimeout(function() { ed.focus(); requestRender(); }, 80);
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
  ed.value = '';
  s.isEditing = true; s.editId = 'new-sticky';
  ed.dataset.wx = wp.x; ed.dataset.wy = wp.y; ed.dataset.bgColor = bg;
  ed.dataset.w = ww; ed.dataset.h = wh; ed.dataset.wfs = 16 / cam.zoom;
  setTimeout(function() { ed.focus(); }, 80);
}

// ── Edit existing text/sticky ──
export function startEditExisting(obj) {
  var s = state;
  s.selectedId = obj.id;
  var b = getBounds(obj), sp = w2s(b.x, b.y);
  if (obj.type === 'text') {
    var ed = document.getElementById('textEditor');
    var tsp = w2s(obj.x, obj.y);
ed.style.display = 'block';
ed.style.left = tsp.x + 'px'; ed.style.top = tsp.y + 'px';
ed.style.transform = 'translate(-50%, -50%)';
  ed.style.color = obj.color || '#e4e4e8';
    ed.style.fontSize = obj.fontSize * cam.zoom + 'px';
    ed.style.fontWeight = '400'; ed.style.fontStyle = 'normal'; ed.style.textDecoration = 'none';
    ed.innerHTML = spansToHtml(getSpans(obj));
    s.isEditing = true; s.editId = obj.id;
    setTimeout(function() { ed.focus(); requestRender(); }, 80);
  } else if (obj.type === 'sticky') {
    var ed2 = document.getElementById('stickyEditor');
    ed2.style.display = 'block';
    ed2.style.left = sp.x + 'px'; ed2.style.top = sp.y + 'px';
    ed2.style.width = Math.max(80, obj.w * cam.zoom) + 'px';
    ed2.style.height = Math.max(80, obj.h * cam.zoom) + 'px';
    ed2.style.backgroundColor = obj.bgColor;
    ed2.style.fontSize = Math.max(10, obj.fontSize * cam.zoom) + 'px';
    ed2.style.color = '#1a1a1f';
    ed2.value = obj.text;
    s.isEditing = true; s.editId = obj.id;
    setTimeout(function() { ed2.focus(); ed2.select(); }, 80);
  }
  requestRender();
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
    if (text) addObj({ type: 'text', id: gid(), x: +te.dataset.wx, y: +te.dataset.wy, spans: spans, fontSize: +te.dataset.wfs, color: te.dataset.color || s.curColor, opacity: 1 });
    te.style.display = 'none'; te.innerHTML = ''; te.style.transform = '';
  } else if (s.editId === 'new-sticky' && se.style.display === 'block') {
    var t = se.value.trim() || 'Note';
    addObj({ type: 'sticky', id: gid(), x: +se.dataset.wx, y: +se.dataset.wy, w: +se.dataset.w, h: +se.dataset.h, text: t, bgColor: se.dataset.bgColor, fontSize: +se.dataset.wfs, opacity: 1 });
    se.style.display = 'none'; se.value = '';
  } else if (typeof s.editId === 'number') {
    var obj = findObj(s.editId);
    if (obj) {
      if (obj.type === 'text' && teVisible) {
        saveState(); obj.spans = parseHtmlSpans(te, obj.color || '#e4e4e8');
        te.style.display = 'none'; te.innerHTML = ''; te.style.transform = '';
      } else if (obj.type === 'sticky' && se.style.display === 'block') {
        saveState(); obj.text = se.value || 'Note';
        se.style.display = 'none'; se.value = '';
      }
    }
  }
  s.isEditing = false; s.editId = null;
  requestRender();
}

export function updateEditorFS(obj) {
  var ed = document.getElementById('textEditor');
  ed.style.fontSize = obj.fontSize * cam.zoom + 'px';
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
    if (obj) { wx = obj.x; wy = obj.y; }
    var sp = w2s(wx, wy);
    te.style.left = sp.x + 'px';
    te.style.top = sp.y + 'px';
    te.style.transform = 'translate(-50%, -50%)';
    if (obj && obj.type === 'text') {
      te.style.fontSize = obj.fontSize * cam.zoom + 'px';
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
  var a = Infinity, b = Infinity, c2 = -Infinity, d = -Infinity;
  objects.forEach(function(o) {
    var bb = getBounds(o); if (!bb) return;
    a = Math.min(a, bb.x); b = Math.min(b, bb.y);
    c2 = Math.max(c2, bb.x + bb.w); d = Math.max(d, bb.y + bb.h);
  });
  if (a === Infinity) return;
  var pd = 80, cw = c2 - a, ch = d - b;
  var sx = (window.innerWidth - pd * 2) / Math.max(1, cw);
  var sy = (window.innerHeight - pd * 2) / Math.max(1, ch);
  var s = Math.min(sx, sy);
  cam.zoom = s; cam.x = window.innerWidth / 2 - (a + cw / 2) * s; cam.y = window.innerHeight / 2 - (b + ch / 2) * s;
  updateZoomDisplay(); requestRender();
}

export function locateObjects() {
  if (!objects.length) { showToast('No objects on canvas'); return; }
  fitView();
  state.locateEnd = performance.now() + 2500;
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
  saveState(); objects.length = 0; state.selectedId = null;
  requestRender(); showToast('Canvas cleared');
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
      addObj({ type: 'image', id: id, x: wp.x - w / 2, y: wp.y - h / 2, w: w, h: h, src: e.target.result, opacity: 1 });
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
    var bb = getBounds(o); if (!bb) return;
    a = Math.min(a, bb.x - 20); b = Math.min(b, bb.y - 20);
    c2 = Math.max(c2, bb.x + bb.w + 20); d = Math.max(d, bb.y + bb.h + 20);
  });
  var pd = 40, w = c2 - a + pd * 2, h = d - b + pd * 2, sc = 2;
  var tc = document.createElement('canvas'), tctx = tc.getContext('2d');
  tc.width = w * sc; tc.height = h * sc;
  tctx.scale(sc, sc); tctx.fillStyle = '#1a1a1f'; tctx.fillRect(0, 0, w, h);
  tctx.translate(-a + pd, -b + pd);
  objects.forEach(function(o) { drawObject(tctx, o); });
  var link = document.createElement('a');
  link.download = 'whiteboard.png'; link.href = tc.toDataURL('image/png'); link.click();
  showToast('Exported as PNG');
}

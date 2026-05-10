/**
 * User-interface — toolbar, topbar, bottombar, popup, keyboard, pointer, persistence.
 */

import { cam, objects, canvas, dpr, state } from './state.js';
import { COLORS, STICKY_COLORS, STROKE_WIDTHS, KEY_MAP, CURSOR_MAP, STORAGE_KEY } from './constants.js';
import { s2w, w2s, showToast } from './utils.js';
import { requestRender } from './canvas.js';
import { getBounds, hitTest } from './objects.js';
import { getSpans } from './editor.js';
import { saveState, undo, redo, findObj, refreshImgCache, delSel } from './undo.js';
import {
  onSelectDown, handleDrag, startPan, startPen, finishPen,
  startErase, eraseAt, finishErase, startShape, finishShape,
  startTextCreate, startStickyCreate, startEditExisting,
  finishEditing, updateEditorFS, updateEditorPosition,
  cycleSelect,
  zoomAt, updateZoomDisplay, resetZoom, fitView,
  clearAll, insertImg, exportPNG,
} from './tools.js';

// ── Resize canvas ──
export function resizeCanvas() {
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  requestRender();
}

// ── Tool switching ──
export function setToolActive(t) {
  var s = state;
  if (s.isEditing) finishEditing();
  s.curTool = t;
  document.querySelectorAll('.tool-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tool === t);
  });
  s.selectedId = null;
  updateCursor();
  requestRender();
}

function updateCursor() {
  document.body.className = CURSOR_MAP[state.curTool] || 'cursor-default';
  if (state.curTool !== 'eraser') document.getElementById('eraserCursor').style.display = 'none';
}

// ── Popup update ──
function updatePopup() {
  var s = state;
  updateEditorPosition();
  var pop = document.getElementById('itemPopup');
  var isTextEdit = s.isEditing && (s.editId === 'new-text' || (typeof s.editId === 'number' && findObj(s.editId) && findObj(s.editId).type === 'text'));
  var isStickyEdit = s.isEditing && (s.editId === 'new-sticky' || (typeof s.editId === 'number' && findObj(s.editId) && findObj(s.editId).type === 'sticky'));

  if (isTextEdit) {
    var ed = document.getElementById('textEditor');
    var er = ed.getBoundingClientRect();
    var ph = 140;
    var top = er.top - ph - 8;
    if (top < 10) top = er.bottom + 10;
    var left = er.left;
    if (left + 380 > window.innerWidth) left = window.innerWidth - 390;
    if (left < 10) left = 10;
    pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.classList.add('visible');
    document.getElementById('popTextRow').style.display = 'flex';
    document.getElementById('popColorRow').style.display = 'flex';
    document.getElementById('popStickyRow').style.display = 'none';
    try {
      document.getElementById('popBold').classList.toggle('active', document.queryCommandState('bold'));
      document.getElementById('popItalic').classList.toggle('active', document.queryCommandState('italic'));
      document.getElementById('popUnder').classList.toggle('active', document.queryCommandState('underline'));
    } catch (e) {}
  var obj = typeof s.editId === 'number' ? findObj(s.editId) : null;
  document.getElementById('popFontSize').textContent = Math.round((obj ? obj.fontSize : 20 / cam.zoom) * cam.zoom);
  document.getElementById('popOpacity').value = obj && obj.opacity != null ? obj.opacity : 1;
  document.getElementById('popOpacityVal').textContent = Math.round((obj && obj.opacity != null ? obj.opacity : 1) * 100) + '%';
    document.getElementById('popStrokeBtn').style.display = obj && obj.type === 'text' ? 'flex' : 'none';
    document.getElementById('popEditText').style.display = 'none';
    if (obj && obj.type === 'text') {
    var fw2 = obj.fontWeight || 400;
    document.getElementById('popStrokeLabel').textContent = 'Font Weight';
    document.getElementById('popStrokeWeight').min = 100;
    document.getElementById('popStrokeWeight').max = 900;
    document.getElementById('popStrokeWeight').step = 100;
    document.getElementById('popStrokeWeight').value = fw2;
    document.getElementById('popStrokeVal').textContent = fw2;
  }
  return;
  }
  if (isStickyEdit) { pop.classList.remove('visible'); return; }
  if (s.selectedId === null || s.isEditing) { pop.classList.remove('visible'); s._lastPopupId = null; return; }
  var selObj = findObj(s.selectedId);
  if (!selObj) { pop.classList.remove('visible'); s._lastPopupId = null; return; }
  var b = getBounds(selObj);
  if (!b) { pop.classList.remove('visible'); return; }
  // Don't reposition popup while a dropdown slider is open
  var dropdownOpen = document.querySelector('.pop-dropdown.open');
  if (!dropdownOpen) {
    var sp = w2s(b.x, b.y), sh = b.h * cam.zoom, ph2 = 140;
    var top2 = sp.y - ph2 - 8;
    if (top2 < 10) top2 = sp.y + sh + 10;
    var left2 = sp.x;
    if (left2 + 380 > window.innerWidth) left2 = window.innerWidth - 390;
    if (left2 < 10) left2 = 10;
    pop.style.left = left2 + 'px'; pop.style.top = top2 + 'px';
  }
  pop.classList.add('visible');
  document.getElementById('popTextRow').style.display = selObj.type === 'text' ? 'flex' : 'none';
  document.getElementById('popColorRow').style.display = ['path','line','arrow','rect','ellipse','text'].indexOf(selObj.type) >= 0 ? 'flex' : 'none';
  document.getElementById('popStickyRow').style.display = selObj.type === 'sticky' ? 'flex' : 'none';
  document.getElementById('popEditText').style.display = (selObj.type === 'text' || selObj.type === 'sticky') ? 'flex' : 'none';
  if (selObj.type === 'text') {
    var spans = getSpans(selObj);
    document.getElementById('popBold').classList.toggle('active', spans.some(function(sp) { return sp.bold; }));
    document.getElementById('popItalic').classList.toggle('active', spans.some(function(sp) { return sp.italic; }));
    document.getElementById('popUnder').classList.toggle('active', spans.some(function(sp) { return sp.underline; }));
    document.getElementById('popFontSize').textContent = Math.round(selObj.fontSize * cam.zoom);
  }
  document.getElementById('popOpacity').value = selObj.opacity != null ? selObj.opacity : 1;
  document.getElementById('popOpacityVal').textContent = Math.round((selObj.opacity != null ? selObj.opacity : 1) * 100) + '%';
  // Stroke weight: show for stroked objects, hide for sticky/image
  var hasStroke = ['path','line','arrow','rect','ellipse'].indexOf(selObj.type) >= 0;
  document.getElementById('popStrokeBtn').style.display = hasStroke || selObj.type === 'text' ? 'flex' : 'none';
  // Only reset slider values when the selection changes
  if (s._lastPopupId !== selObj.id) {
    s._lastPopupId = selObj.id;
    if (hasStroke) {
      s._strokeBase = selObj.strokeWidth || 2;
      document.getElementById('popStrokeWeight').value = 0;
      document.getElementById('popStrokeVal').textContent = '1x';
    }
    if (selObj.type === 'text') {
      var fw = selObj.fontWeight || 400;
      document.getElementById('popStrokeLabel').textContent = 'Font Weight';
      document.getElementById('popStrokeWeight').min = 100;
      document.getElementById('popStrokeWeight').max = 900;
      document.getElementById('popStrokeWeight').step = 100;
      document.getElementById('popStrokeWeight').value = fw;
      document.getElementById('popStrokeVal').textContent = fw;
    } else {
      document.getElementById('popStrokeLabel').textContent = 'Stroke';
      document.getElementById('popStrokeWeight').min = -2;
      document.getElementById('popStrokeWeight').max = 2;
      document.getElementById('popStrokeWeight').step = 0.1;
    }
  }
}

window.__updatePopup = updatePopup;

function applyPopColor(c) {
  var s = state;
  var isTextEdit = s.isEditing && (s.editId === 'new-text' || (typeof s.editId === 'number' && findObj(s.editId) && findObj(s.editId).type === 'text'));
  if (isTextEdit) { document.getElementById('textEditor').focus(); document.execCommand('foreColor', false, c); return; }
  var obj = findObj(s.selectedId);
  if (!obj) return;
  saveState();
  if (obj.type === 'text' && obj.spans) { obj.spans.forEach(function(sp) { sp.color = c; }); obj.color = c; }
  else obj.color = c;
  requestRender();
}

function applyPopStickyColor(c) {
  var obj = findObj(state.selectedId);
  if (!obj || obj.type !== 'sticky') return;
  saveState(); obj.bgColor = c; requestRender();
}

function buildPopupSwatches() {
  var cr = document.getElementById('popColorRow');
  COLORS.forEach(function(c) {
    var s = document.createElement('div'); s.className = 'pswatch'; s.style.background = c; s.dataset.color = c;
    s.addEventListener('pointerdown', function(e) { e.preventDefault(); });
    s.addEventListener('click', function(e) { e.stopPropagation(); applyPopColor(c); });
    cr.appendChild(s);
  });
  var sr = document.getElementById('popStickyRow');
  STICKY_COLORS.forEach(function(c) {
    var s = document.createElement('div'); s.className = 'pswatch'; s.style.background = c; s.dataset.sc = c;
    s.addEventListener('pointerdown', function(e) { e.preventDefault(); });
    s.addEventListener('click', function(e) { e.stopPropagation(); applyPopStickyColor(c); });
    sr.appendChild(s);
  });
}

function setupPopupHandlers() {
  var s = state;
  var pop = document.getElementById('itemPopup');
  pop.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  pop.addEventListener('click', function(e) { e.stopPropagation(); });
  pop.addEventListener('mousedown', function(e) {
    // Allow range sliders to work normally; prevent default only on buttons
    if (e.target.type !== 'range') e.preventDefault();
  });

  function isTextEdit() {
    return s.isEditing && (s.editId === 'new-text' || (typeof s.editId === 'number' && findObj(s.editId) && findObj(s.editId).type === 'text'));
  }

  // ── Dropdown toggles ──
  function closeDropdowns() {
    document.querySelectorAll('.pop-dropdown').forEach(function(d) { d.classList.remove('open'); });
  }
  function toggleDropdown(btnId, dropdownId) {
    var dd = document.getElementById(dropdownId);
    var isOpen = dd.classList.contains('open');
    closeDropdowns();
    if (!isOpen) dd.classList.add('open');
  }
  document.getElementById('popOpacityBtn').addEventListener('click', function(e) {
    e.stopPropagation(); toggleDropdown('popOpacityBtn', 'popOpacityDropdown');
  });
  document.getElementById('popStrokeBtn').addEventListener('click', function(e) {
    e.stopPropagation(); toggleDropdown('popStrokeBtn', 'popStrokeDropdown');
  });
  // Close dropdowns when clicking anywhere in the popup except inside a dropdown
  pop.addEventListener('click', function(e) {
    if (!e.target.closest('.pop-dropdown-wrap')) closeDropdowns();
  });

  document.getElementById('popBold').addEventListener('click', function() {
    if (isTextEdit()) { document.getElementById('textEditor').focus(); document.execCommand('bold'); return; }
    var o = findObj(s.selectedId); if (!o || o.type !== 'text') return;
    saveState();
    if (o.spans) { var hb = o.spans.some(function(sp) { return sp.bold; }); o.spans.forEach(function(sp) { sp.bold = !hb; }); }
    else o.fontWeight = o.fontWeight === '700' ? '400' : '700';
    requestRender();
  });
  document.getElementById('popItalic').addEventListener('click', function() {
    if (isTextEdit()) { document.getElementById('textEditor').focus(); document.execCommand('italic'); return; }
    var o = findObj(s.selectedId); if (!o || o.type !== 'text') return;
    saveState();
    if (o.spans) { var hi = o.spans.some(function(sp) { return sp.italic; }); o.spans.forEach(function(sp) { sp.italic = !hi; }); }
    else o.fontStyle = o.fontStyle === 'italic' ? 'normal' : 'italic';
    requestRender();
  });
  document.getElementById('popUnder').addEventListener('click', function() {
    if (isTextEdit()) { document.getElementById('textEditor').focus(); document.execCommand('underline'); return; }
    var o = findObj(s.selectedId); if (!o || o.type !== 'text') return;
    saveState();
    if (o.spans) { var hu = o.spans.some(function(sp) { return sp.underline; }); o.spans.forEach(function(sp) { sp.underline = !hu; }); }
    else o.underline = !o.underline;
    requestRender();
  });
  document.getElementById('popSizeDn').addEventListener('click', function() {
    if (isTextEdit()) {
      var o = typeof s.editId === 'number' ? findObj(s.editId) : null;
      if (o && o.type === 'text') { saveState(); o.fontSize = Math.max(2 / cam.zoom, o.fontSize * 0.8); updateEditorFS(o); requestRender(); }
      return;
    }
    var o2 = findObj(s.selectedId); if (!o2 || o2.type !== 'text') return;
    saveState(); o2.fontSize = Math.max(2 / cam.zoom, o2.fontSize * 0.8); requestRender();
  });
  document.getElementById('popSizeUp').addEventListener('click', function() {
    if (isTextEdit()) {
      var o = typeof s.editId === 'number' ? findObj(s.editId) : null;
      if (o && o.type === 'text') { saveState(); o.fontSize *= 1.25; updateEditorFS(o); requestRender(); }
      return;
    }
    var o2 = findObj(s.selectedId); if (!o2 || o2.type !== 'text') return;
    saveState(); o2.fontSize *= 1.25; requestRender();
  });
  document.getElementById('popOpacity').addEventListener('input', function(e) {
    var val = +e.target.value;
    document.getElementById('popOpacityVal').textContent = Math.round(val * 100) + '%';
    // During text editing, apply to the editing text object
    if (isTextEdit()) {
      var o = typeof s.editId === 'number' ? findObj(s.editId) : null;
      if (o) { o.opacity = val; requestRender(); }
      return;
    }
    var o = findObj(s.selectedId); if (!o) return; o.opacity = val; requestRender();
  });
  document.getElementById('popOpacity').addEventListener('change', function() { saveState(); });
  document.getElementById('popStrokeWeight').addEventListener('input', function(e) {
    var val = +e.target.value;
    var selObj = findObj(s.selectedId);
    // During text editing — font weight is absolute
    if (isTextEdit()) {
      var o = typeof s.editId === 'number' ? findObj(s.editId) : null;
      if (o && o.type === 'text') {
        o.fontWeight = val;
        document.getElementById('popStrokeVal').textContent = val;
        requestRender();
      }
      return;
    }
    if (selObj && selObj.type === 'text') {
      selObj.fontWeight = val;
      document.getElementById('popStrokeVal').textContent = val;
      requestRender();
    } else if (selObj && selObj.strokeWidth != null) {
      // Exponential mapping: slider -2..0..+2 → multiplier ¼x..1x..4x
      var mult = Math.pow(2, val);
      var base = s._strokeBase || selObj.strokeWidth || 2;
      selObj.strokeWidth = base * mult;
      var label = mult >= 1 ? mult.toFixed(1) + 'x' : '1/' + (1 / mult).toFixed(1) + 'x';
      document.getElementById('popStrokeVal').textContent = label;
      requestRender();
    }
  });
  document.getElementById('popStrokeWeight').addEventListener('change', function() { saveState(); });
  document.getElementById('popLayerUp').addEventListener('click', function() {
    var i = objects.findIndex(function(x) { return x.id === s.selectedId; });
    if (i < 0 || i >= objects.length - 1) return;
    saveState(); var tmp = objects[i]; objects[i] = objects[i+1]; objects[i+1] = tmp; requestRender();
  });
  document.getElementById('popLayerDn').addEventListener('click', function() {
    var i = objects.findIndex(function(x) { return x.id === s.selectedId; });
    if (i <= 0) return;
    saveState(); var tmp = objects[i]; objects[i] = objects[i-1]; objects[i-1] = tmp; requestRender();
  });
  document.getElementById('popDelete').addEventListener('click', function() { delSel(); });
  // ── Edit text: enter editing mode so user can select characters and color them
  document.getElementById('popEditText').addEventListener('click', function() {
    var o = findObj(s.selectedId);
    if (o && (o.type === 'text' || o.type === 'sticky')) startEditExisting(o);
  });
  // ── Custom color picker: apply color to selected text or object
  document.getElementById('popCustomColor').addEventListener('input', function(e) {
    applyPopColor(e.target.value);
  });
  document.getElementById('popCustomColor').addEventListener('pointerdown', function(e) { e.stopPropagation(); });
}

function setupToolbar() {
  document.querySelectorAll('.tool-btn').forEach(function(b) {
    b.addEventListener('click', function() { setToolActive(b.dataset.tool); });
  });
}

function setupTopbar() {
  var s = state;
  var swC = document.getElementById('colorSwatches');
  COLORS.forEach(function(c) {
    var sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === s.curColor ? ' active' : '');
    sw.style.background = c;
    sw.addEventListener('click', function() {
      s.curColor = c;
      document.querySelectorAll('.color-swatch').forEach(function(x) { x.classList.remove('active'); });
      sw.classList.add('active');
    });
    swC.appendChild(sw);
  });
  var stC = document.getElementById('strokeWidths');
  STROKE_WIDTHS.forEach(function(stw) {
    var b = document.createElement('button');
    b.className = 'stroke-btn' + (stw === s.curStroke ? ' active' : '');
    var d = document.createElement('div'); d.className = 'stroke-dot';
    var sz = Math.max(4, stw * 2.5); d.style.width = sz + 'px'; d.style.height = sz + 'px';
    b.appendChild(d);
    b.addEventListener('click', function() {
      s.curStroke = stw;
      document.querySelectorAll('.stroke-btn').forEach(function(x) { x.classList.remove('active'); });
      b.classList.add('active');
    });
    stC.appendChild(b);
  });
  document.getElementById('fillToggle').addEventListener('click', function() {
    s.fillOn = !s.fillOn; this.classList.toggle('active', s.fillOn);
  });
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('redoBtn').addEventListener('click', redo);
  document.getElementById('clearBtn').addEventListener('click', clearAll);
}

function setupBottombar() {
  document.getElementById('zoomIn').addEventListener('click', function() { zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25); });
  document.getElementById('zoomOut').addEventListener('click', function() { zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.25); });
  document.getElementById('zoomLevel').addEventListener('click', resetZoom);
  document.getElementById('fitView').addEventListener('click', fitView);
}

// ── Pointer events ──
function setupPointerEvents() {
  var s = state;
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.getElementById('textEditor').addEventListener('input', function() { requestRender(); });
  document.addEventListener('selectionchange', function() { if (s.isEditing) requestRender(); });

  canvas.addEventListener('dblclick', function(e) {
    if (s.isEditing) return;
    var wp = getWorldPoint(e);
    for (var i = objects.length - 1; i >= 0; i--) {
      var obj = objects[i];
      if ((obj.type === 'text' || obj.type === 'sticky') && hitTest(obj, wp.x, wp.y)) {
        startEditExisting(obj); return;
      }
    }
  });

  document.getElementById('imageInput').addEventListener('change', function(e) {
    var f = e.target.files[0];
    if (f) { insertImg(f, s2w(window.innerWidth / 2, window.innerHeight / 2)); e.target.value = ''; }
  });
  canvas.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvas.addEventListener('drop', function(e) {
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) {
      var r = canvas.getBoundingClientRect();
      insertImg(f, s2w(e.clientX - r.left, e.clientY - r.top));
    }
  });
  window.addEventListener('paste', function(e) {
    if (s.isEditing) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        insertImg(items[i].getAsFile(), s2w(window.innerWidth / 2, window.innerHeight / 2)); break;
      }
    }
  });
  canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}

function getWorldPoint(e) {
  var r = canvas.getBoundingClientRect();
  return s2w(e.clientX - r.left, e.clientY - r.top);
}

function onPointerDown(e) {
  var s = state;
  // Close any open popup dropdowns
  document.querySelectorAll('.pop-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
  if (s.isEditing) { finishEditing(); return; }
  s.dragMode = null; s.dragUndo = false;
  var r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  var wp = s2w(sx, sy);
  if (e.button === 1) { e.preventDefault(); startPan(sx, sy); return; }
  if (e.button !== 0) return;
  switch (s.curTool) {
    case 'select': onSelectDown(wp, sx, sy); break;
    case 'hand': startPan(sx, sy); break;
    case 'pen': startPen(wp); break;
    case 'eraser': startErase(); break;
    case 'line': case 'arrow': case 'rect': case 'ellipse': startShape(wp); break;
    case 'text': startTextCreate(wp); break;
    case 'sticky': startStickyCreate(wp); break;
    case 'image': document.getElementById('imageInput').click(); break;
  }
}

function onPointerMove(e) {
  var s = state;
  var r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
  var wp = s2w(sx, sy);
  if (s.curTool === 'eraser') {
    var ec = document.getElementById('eraserCursor');
    ec.style.display = 'block'; ec.style.left = e.clientX + 'px'; ec.style.top = e.clientY + 'px';
    ec.style.width = '20px'; ec.style.height = '20px';
  }
  if (s.isPan) {
    cam.x = s.panCamSt.x + (sx - s.panSt.x);
    cam.y = s.panCamSt.y + (sy - s.panSt.y);
    requestRender(); return;
  }
  if (s.isDrawing) {
    if (s.curTool === 'pen') { s.curPath.push(wp); requestRender(); }
    else if (s.curTool === 'eraser') { eraseAt(wp); requestRender(); }
    else if (['line','arrow','rect','ellipse'].indexOf(s.curTool) >= 0) { s.drawCur = wp; requestRender(); }
  }
  if (s.dragMode) {
    if (!s.dragUndo) { saveState(); s.dragUndo = true; }
    handleDrag(wp);
  }
}

function onPointerUp(e) {
  var s = state;
  if (s.isPan) { s.isPan = false; updateCursor(); return; }
  if (s.isDrawing) {
    if (s.curTool === 'pen') finishPen();
    else if (s.curTool === 'eraser') finishErase();
    else if (['line','arrow','rect','ellipse'].indexOf(s.curTool) >= 0) finishShape();
  }
  if (s.dragMode) {
    // If no undo was saved (no movement happened), treat as a click — cycle selection
    if (!s.dragUndo && s.cycleHits) cycleSelect();
    s.dragMode = null; s.dragSW = null; s.dragSnap = null; s.dragUndo = false;
    s.cycleHits = null; s.cycleIdx = -1;
  }
}

function onWheel(e) {
  e.preventDefault();
  var r = canvas.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.08 : 1 / 1.08);
}

// ── Keyboard ──
function setupKeyboard() {
  var s = state;
  window.addEventListener('keydown', function(e) {
    if (s.isEditing) { if (e.key === 'Escape') finishEditing(); return; }
    if (e.code === 'Space' && !s.spaceHeld) {
      e.preventDefault(); s.spaceHeld = true; s.toolBefore = s.curTool; setToolActive('hand'); return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && KEY_MAP[e.code]) { setToolActive(KEY_MAP[e.code]); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId !== null) { e.preventDefault(); delSel(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '=') { e.preventDefault(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25); }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.25); }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); resetZoom(); }
  });
  window.addEventListener('keyup', function(e) {
    if (e.code === 'Space' && s.spaceHeld) {
      s.spaceHeld = false;
      if (s.toolBefore) setToolActive(s.toolBefore);
      s.toolBefore = null;
    }
  });
}

// ── Persistence ──
export function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects: objects, nid: state.nid, cam: { x: cam.x, y: cam.y, zoom: cam.zoom } }));
  } catch (e) {}
}

export function loadFromStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (data && Array.isArray(data.objects)) {
      objects.length = 0;
      data.objects.forEach(function(o) { objects.push(o); });
      if (data.nid) state.nid = data.nid;
      if (data.cam) {
        cam.x = data.cam.x;
        cam.y = data.cam.y;
        cam.zoom = data.cam.zoom;
      }
      return true;
    }
  } catch (e) {}
  return false;
}

// ── Init ──
export function initUI() {
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  setupToolbar();
  setupTopbar();
  setupBottombar();
  buildPopupSwatches();
  setupPopupHandlers();
  setupPointerEvents();
  setupKeyboard();
  updateCursor();
  updateZoomDisplay();

  if (loadFromStorage()) {
    refreshImgCache();
    updateZoomDisplay();
    showToast('Restored previous session');
  } else {
    cam.x = window.innerWidth / 2;
    cam.y = window.innerHeight / 2;
  }

  setInterval(saveToStorage, 3000);
  requestRender();
}

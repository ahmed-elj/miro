/**
 * User-interface — toolbar, topbar, bottombar, popup, keyboard, pointer, persistence.
 */

import { cam, objects, canvas, dpr, state, gid } from "./state.js";
import {
  COLORS,
  STICKY_COLORS,
  STROKE_WIDTHS,
  KEY_MAP,
  DEFAULT_SETTINGS,
  THEME_PRESETS,
  CURSOR_MAP,
  STORAGE_KEY,
  ROTATE_HANDLE_DIST,
  ROTATE_HANDLE_RADIUS,
} from "./constants.js";
import { s2w, w2s, showToast, getArrowHeadMode } from "./utils.js";
import { requestRender } from "./canvas.js";
import { getBounds, getRotatedBounds, hitTest, hitBorder } from "./objects.js";
import { getSpans, listifyPlainText, listifySpans } from "./editor.js";
import {
  saveState,
  addObj,
  undo,
  redo,
  findObj,
  refreshImgCache,
} from "./undo.js";
import {
  onSelectDown,
  handleDrag,
  startPan,
  startPen,
  finishPen,
  startErase,
  eraseAt,
  finishErase,
  startShape,
  finishShape,
  startTextCreate,
  startTextTool,
  startStickyCreate,
  startEditExisting,
  finishEditing,
  enterGroupEditForObject,
  exitGroupEdit,
  selectTopAt,
  updateEditorFS,
  updateEditorPosition,
  cycleSelect,
  startBoxSelect,
  updateBoxSelect,
  finishBoxSelect,
  zoomAt,
  updateZoomDisplay,
  resetZoom,
  fitView,
  locateObjects,
  clearAll,
  insertImg,
  exportPNG,
} from "./tools.js";

var TOOL_META = [
  { tool: "select", label: "Select" },
  { tool: "hand", label: "Pan" },
  { tool: "pen", label: "Pen" },
  { tool: "eraser", label: "Eraser" },
  { tool: "line", label: "Line" },
  { tool: "arrow", label: "Arrow" },
  { tool: "rect", label: "Rectangle" },
  { tool: "ellipse", label: "Ellipse" },
  { tool: "text", label: "Text" },
  { tool: "sticky", label: "Sticky Note" },
  { tool: "image", label: "Image" },
];

var MAX_VIEW_BOOKMARKS = 20;
var VIEW_BOOKMARK_THUMB_W = 160;
var VIEW_BOOKMARK_THUMB_H = 96;
var BOARD_INDEX_KEY = STORAGE_KEY + "-boards";
var DEFAULT_BOARD_ID = "default";

function codeToLabel(code) {
  if (!code) return "None";
  if (code.indexOf("Key") === 0) return code.slice(3);
  if (code.indexOf("Digit") === 0) return code.slice(5);
  if (code === "Minus") return "-";
  if (code === "Equal") return "=";
  if (code === "BracketLeft") return "[";
  if (code === "BracketRight") return "]";
  if (code === "Semicolon") return ";";
  if (code === "Quote") return "'";
  if (code === "Comma") return ",";
  if (code === "Period") return ".";
  if (code === "Slash") return "/";
  if (code === "Backslash") return "\\";
  return code.replace(/^(Numpad|Arrow)/, "");
}

function getToolKeyCode(tool) {
  var map = state.settings.keyMap || {};
  for (var code in map) {
    if (map[code] === tool) return code;
  }
  return "";
}

function syncKeyMap() {
  Object.keys(KEY_MAP).forEach(function (code) {
    delete KEY_MAP[code];
  });
  var map = state.settings.keyMap || {};
  Object.keys(map).forEach(function (code) {
    if (map[code]) KEY_MAP[code] = map[code];
  });
}

function updateShortcutLabels() {
  document.querySelectorAll(".tool-btn").forEach(function (btn) {
    var code = getToolKeyCode(btn.dataset.tool);
    var label = codeToLabel(code);
    var span = btn.querySelector(".shortcut");
    if (code) {
      if (!span) {
        span = document.createElement("span");
        span.className = "shortcut";
        btn.appendChild(span);
      }
      span.textContent = label;
    } else if (span) {
      span.remove();
    }
    var title = btn.getAttribute("title") || "";
    var base = title.replace(/\s*\([^)]*\)\s*$/, "");
    btn.setAttribute("title", code ? base + " (" + label + ")" : base);
  });
}

function applyAccentVars() {
  var accent = state.settings.accentColor || DEFAULT_SETTINGS.accentColor;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-dim", hexToCssRgba(accent, 0.15));
}

function getThemePreset(theme) {
  return THEME_PRESETS[theme] || THEME_PRESETS.dark;
}

function getDefaultObjectColor() {
  return getThemePreset(state.settings.theme).objectColor;
}

function applyThemeVars() {
  var preset = getThemePreset(state.settings.theme).ui;
  var root = document.documentElement;
  root.style.setProperty("--bg", preset.bg);
  root.style.setProperty("--panel", preset.panel);
  root.style.setProperty("--border", preset.border);
  root.style.setProperty("--fg", preset.fg);
  root.style.setProperty("--muted", preset.muted);
  root.style.setProperty("--shadow-panel", preset.shadowPanel);
  root.style.setProperty("--shadow-popup", preset.shadowPopup);
}

function syncTopbarColorSelection() {
  document.querySelectorAll(".color-swatch").forEach(function (sw) {
    sw.classList.toggle("active", sw.dataset.color === state.curColor);
  });
}

function applyThemeDefaults(theme) {
  var preset = getThemePreset(theme);
  state.settings.theme = THEME_PRESETS[theme] ? theme : "dark";
  state.settings.canvasColor = preset.canvasColor;
  state.settings.gridColor = preset.gridColor;
  state.curColor = preset.objectColor;
  state.curColorTouched = false;
  applyThemeVars();
}

function hexToCssRgba(hex, alpha) {
  var raw = (hex || "").replace("#", "");
  if (raw.length === 3) raw = raw.split("").map(function (ch) { return ch + ch; }).join("");
  var num = parseInt(raw, 16);
  if (!Number.isFinite(num)) return "rgba(16, 185, 129, " + alpha + ")";
  return "rgba(" + ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255) + ", " + alpha + ")";
}

function applySettingsToUI() {
  var s = state.settings;
  syncKeyMap();
  applyThemeVars();
  applyAccentVars();
  var themeInput = document.getElementById("themeSelect");
  var accentInput = document.getElementById("accentColor");
  var canvasInput = document.getElementById("canvasColor");
  var gridInput = document.getElementById("gridColor");
  var patternInput = document.getElementById("bgPattern");
  if (themeInput) themeInput.value = s.theme;
  if (accentInput) accentInput.value = s.accentColor;
  if (canvasInput) canvasInput.value = s.canvasColor;
  if (gridInput) gridInput.value = s.gridColor;
  if (patternInput) patternInput.value = s.bgPattern;
  updateShortcutLabels();
  updateKeybindList();
  syncTopbarColorSelection();
}

// ── Resize canvas ──
export function resizeCanvas() {
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  requestRender();
}

// ── Tool switching ──
export function setToolActive(t) {
  var s = state;
  if (s.isEditing) finishEditing();
  s.curTool = t;
  document.querySelectorAll(".tool-btn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.tool === t);
  });
  s.selectedId = null;
  s.selectedIds = [];
  s.groupEditId = null;
  s.groupEditCandidateId = null;
  updateCursor();
  requestRender();
}

function updateCursor() {
  document.body.className = CURSOR_MAP[state.curTool] || "cursor-default";
  if (state.curTool !== "eraser")
    document.getElementById("eraserCursor").style.display = "none";
}

function clamp(n, min, max) {
  if (max < min) return min;
  return Math.max(min, Math.min(max, n));
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function rectDistance(a, b) {
  var dx = Math.max(0, b.left - a.right, a.left - b.right);
  var dy = Math.max(0, b.top - a.bottom, a.top - b.bottom);
  return Math.hypot(dx, dy);
}

function inflateRect(r, amount) {
  if (!r) return null;
  return {
    left: r.left - amount,
    top: r.top - amount,
    right: r.right + amount,
    bottom: r.bottom + amount,
  };
}

function candidateRect(left, top, w, h) {
  return { left: left, top: top, right: left + w, bottom: top + h };
}

function getCaretRect(container) {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  var range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;
  var probe = range.cloneRange();
  probe.collapse(true);
  var rect = probe.getBoundingClientRect();
  if ((!rect || (!rect.width && !rect.height)) && probe.getClientRects().length) {
    rect = probe.getClientRects()[0];
  }
  if (!rect) return null;
  var x = rect.left || rect.right;
  var y = rect.top || rect.bottom;
  return {
    left: x - 8,
    top: y - 12,
    right: x + Math.max(8, rect.width || 8),
    bottom: y + Math.max(18, rect.height || 18),
  };
}

function positionPopupNearScreenRect(pop, rect, estimatedHeight, avoidRect, topGap) {
  var margin = 10;
  var pW = pop.offsetWidth || 380;
  var pH = pop.offsetHeight || estimatedHeight || 140;
  var safe = getPopupSafeArea();
  var safeTop = safe.top;
  var safeBottom = safe.bottom;
  var maxLeft = window.innerWidth - pW - margin;
  var maxTop = safeBottom - pH;
  var gap = 12;
  var avoid = inflateRect(avoidRect, 28);
  var cx = (rect.left + rect.right) / 2;
  var cy = (rect.top + rect.bottom) / 2;
  var raw = [
    { side: "top", left: cx - pW / 2, top: rect.top - pH - (topGap || gap) },
    { side: "bottom", left: cx - pW / 2, top: rect.bottom + gap },
    { side: "right", left: rect.right + gap, top: cy - pH / 2 },
    { side: "left", left: rect.left - pW - gap, top: cy - pH / 2 },
  ];
  var candidates = raw.map(function(c) {
    var cl = clamp(c.left, margin, maxLeft);
    var ct = clamp(c.top, safeTop, maxTop);
    var r = candidateRect(cl, ct, pW, pH);
    var fits = c.left >= margin && c.left <= maxLeft && c.top >= safeTop && c.top <= maxTop;
    var nearCaret = avoid && rectsOverlap(r, avoid);
    var overlapsObject = rectsOverlap(r, rect);
    var score =
      (fits ? 100000 : 0) +
      (!overlapsObject ? 20000 : 0) +
      (!nearCaret ? 50000 : -50000) +
      rectDistance(r, rect) +
      (avoidRect ? rectDistance(r, avoidRect) : 0);
    return { rect: r, score: score, nearCaret: nearCaret };
  });
  var usable = avoid ? candidates.filter(function(c) { return !c.nearCaret; }) : candidates;
  if (!usable.length) usable = candidates.sort(function(a, b) {
    return rectDistance(b.rect, avoidRect) - rectDistance(a.rect, avoidRect);
  }).slice(0, 1);
  usable.sort(function(a, b) { return b.score - a.score; });
  pop.style.left = usable[0].rect.left + "px";
  pop.style.top = usable[0].rect.top + "px";
}

function positionPopupNearBounds(pop, b, estimatedHeight) {
  var tl = w2s(b.x, b.y);
  positionPopupNearScreenRect(pop, {
    left: tl.x,
    top: tl.y,
    right: tl.x + b.w * cam.zoom,
    bottom: tl.y + b.h * cam.zoom,
  }, estimatedHeight, null, ROTATE_HANDLE_DIST + ROTATE_HANDLE_RADIUS + 12);
}

function getPopupSafeArea() {
  var margin = 10;
  var topbar = document.getElementById("topbar");
  var bottombar = document.getElementById("bottombar");
  var safeTop = margin;
  var safeBottom = window.innerHeight - margin;
  if (topbar) safeTop = Math.max(safeTop, topbar.getBoundingClientRect().bottom + margin);
  if (bottombar) safeBottom = Math.min(safeBottom, bottombar.getBoundingClientRect().top - margin);
  return { top: safeTop, bottom: safeBottom };
}

function positionPopupDropdown(dropdown) {
  if (!dropdown) return;
  var safe = getPopupSafeArea();
  dropdown.classList.remove("open-below");
  dropdown.style.maxHeight = "";
  dropdown.style.overflowY = "";
  var aboveRect = dropdown.getBoundingClientRect();
  if (aboveRect.top < safe.top) dropdown.classList.add("open-below");
  var rect = dropdown.getBoundingClientRect();
  if (rect.bottom > safe.bottom && aboveRect.top >= safe.top) {
    dropdown.classList.remove("open-below");
    rect = dropdown.getBoundingClientRect();
  }
  var maxHeight = Math.max(120, safe.bottom - safe.top);
  if (rect.top < safe.top || rect.bottom > safe.bottom) {
    dropdown.style.maxHeight = maxHeight + "px";
    dropdown.style.overflowY = "auto";
  }
}

function syncPaletteRows(hasColor, hasSticky) {
  var expanded = !!state.settings.popupColorsExpanded;
  var btn = document.getElementById("popColorsBtn");
  var colorRow = document.getElementById("popColorRow");
  var stickyRow = document.getElementById("popStickyRow");
  var hasPalette = !!(hasColor || hasSticky);
  btn.style.display = hasPalette ? "flex" : "none";
  btn.classList.toggle("active", expanded && hasPalette);
  btn.title = expanded ? "Hide colors" : "Show colors";
  colorRow.style.display = expanded && hasColor ? "flex" : "none";
  stickyRow.style.display = expanded && hasSticky ? "flex" : "none";
}

// ── Popup update ──
function updatePopup() {
  var s = state;
  updateEditorPosition();
  var pop = document.getElementById("itemPopup");
  var isTextEdit =
    s.isEditing &&
    (s.editId === "new-text" ||
      (typeof s.editId === "number" &&
        findObj(s.editId) &&
        findObj(s.editId).type === "text"));
  var isStickyEdit =
    s.isEditing &&
    (s.editId === "new-sticky" ||
      (typeof s.editId === "number" &&
        findObj(s.editId) &&
        findObj(s.editId).type === "sticky"));

  if (isTextEdit) {
    var ed = document.getElementById("textEditor");
    var er = ed.getBoundingClientRect();
    pop.classList.add("visible");
    positionPopupNearScreenRect(pop, {
      left: er.left,
      top: er.top,
      right: er.right,
      bottom: er.bottom,
    }, 140, getCaretRect(ed), 12);
    document.getElementById("popTextRow").style.display = "flex";
    syncPaletteRows(true, false);
    document.getElementById("popArrowRow").style.display = "none";
    document.getElementById("popGroupRow").style.display = "none";
    try {
      document
        .getElementById("popBold")
        .classList.toggle("active", document.queryCommandState("bold"));
      document
        .getElementById("popItalic")
        .classList.toggle("active", document.queryCommandState("italic"));
      document
        .getElementById("popUnder")
        .classList.toggle("active", document.queryCommandState("underline"));
    } catch (e) {}
    var obj = typeof s.editId === "number" ? findObj(s.editId) : null;
    document.getElementById("popFontSize").textContent = Math.round(
      (obj ? obj.fontSize : 20 / cam.zoom) * cam.zoom,
    );
    document.getElementById("popOpacity").value =
      obj && obj.opacity != null ? obj.opacity : 1;
    document.getElementById("popOpacityVal").textContent =
      Math.round((obj && obj.opacity != null ? obj.opacity : 1) * 100) + "%";
    document.getElementById("popStrokeBtn").style.display =
      obj && obj.type === "text" ? "flex" : "none";
    document.getElementById("popFillBtn").style.display = "none";
    document.getElementById("popEditText").style.display = "none";
    if (obj && obj.type === "text") {
      var fw2 = obj.fontWeight || 400;
      document.getElementById("popStrokeLabel").textContent = "Font Weight";
      document.getElementById("popStrokeWeight").min = 100;
      document.getElementById("popStrokeWeight").max = 900;
      document.getElementById("popStrokeWeight").step = 100;
      document.getElementById("popStrokeWeight").value = fw2;
      document.getElementById("popStrokeVal").textContent = fw2;
    }
    positionPopupNearScreenRect(pop, {
      left: er.left,
      top: er.top,
      right: er.right,
      bottom: er.bottom,
    }, 140, getCaretRect(ed), 12);
    return;
  }
  if (isStickyEdit) {
    pop.classList.remove("visible");
    return;
  }
  if (s.dragMode) {
    pop.classList.remove("visible");
    return;
  }
  if (s.selectedIds.length > 1) {
    // Multiselect popup — show limited controls
    var allBounds = [];
    s.selectedIds.forEach(function (id) {
      var o = findObj(id);
      if (o) {
        var bb = getRotatedBounds(o);
        if (bb) allBounds.push(bb);
      }
    });
    var groupPopupBounds = null;
    if (allBounds.length) {
      var abx = Infinity,
        aby = Infinity,
        abr = -Infinity,
        abb = -Infinity;
      allBounds.forEach(function (bb) {
        abx = Math.min(abx, bb.x);
        aby = Math.min(aby, bb.y);
        abr = Math.max(abr, bb.x + bb.w);
        abb = Math.max(abb, bb.y + bb.h);
      });
      groupPopupBounds = { x: abx, y: aby, w: abr - abx, h: abb - aby };
    }
    pop.classList.add("visible");
    document.getElementById("popTextRow").style.display = "none";
    syncPaletteRows(true, false);
    document.getElementById("popArrowRow").style.display = "none";
    document.getElementById("popGroupRow").style.display = "flex";
    document.getElementById("popEditText").style.display = "none";
    document.getElementById("popStrokeBtn").style.display = "none";
    var hasGroupedObject = s.selectedIds.some(function (id) {
      var groupedObj = findObj(id);
      return groupedObj && groupedObj.groupId;
    });
    document.getElementById("popGroup").style.display = "flex";
    document.getElementById("popUngroup").style.display = hasGroupedObject ? "flex" : "none";
    document.getElementById("popFillBtn").style.display = "flex";
    // Show opacity of primary selected object
    var primaryObj = findObj(s.selectedId);
    document.getElementById("popOpacity").value =
      primaryObj && primaryObj.opacity != null ? primaryObj.opacity : 1;
    document.getElementById("popOpacityVal").textContent =
      Math.round(
        (primaryObj && primaryObj.opacity != null ? primaryObj.opacity : 1) *
          100,
      ) + "%";
    syncFillControls(primaryObj);
    if (groupPopupBounds && !document.querySelector(".pop-dropdown.open")) {
      positionPopupNearBounds(pop, groupPopupBounds, 80);
    }
    s._lastPopupId = null;
    return;
  }
  if (s.selectedId === null || s.isEditing) {
    pop.classList.remove("visible");
    s._lastPopupId = null;
    return;
  }
  var selObj = findObj(s.selectedId);
  if (!selObj) {
    pop.classList.remove("visible");
    s._lastPopupId = null;
    return;
  }
  var b = getRotatedBounds(selObj);
  if (!b) {
    pop.classList.remove("visible");
    return;
  }
  var dropdownOpen = document.querySelector(".pop-dropdown.open");
  pop.classList.add("visible");
  document.getElementById("popTextRow").style.display =
    selObj.type === "text" || selObj.type === "sticky" ? "flex" : "none";
  syncPaletteRows(
    ["path", "line", "arrow", "rect", "ellipse", "text"].indexOf(selObj.type) >= 0,
    selObj.type === "sticky",
  );
  document.getElementById("popArrowRow").style.display =
    selObj.type === "arrow" ? "flex" : "none";
  document.getElementById("popGroupRow").style.display = selObj.groupId ? "flex" : "none";
  document.getElementById("popGroup").style.display = "none";
  document.getElementById("popUngroup").style.display = selObj.groupId ? "flex" : "none";
  document.getElementById("popEditText").style.display =
    selObj.type === "text" || selObj.type === "sticky" ? "flex" : "none";
  if (selObj.type === "arrow") {
    var arrowMode = getArrowHeadMode(selObj);
    document
      .getElementById("popArrowStart")
      .classList.toggle("active", arrowMode === "start");
    document
      .getElementById("popArrowEnd")
      .classList.toggle("active", arrowMode === "end");
    document
      .getElementById("popArrowBoth")
      .classList.toggle("active", arrowMode === "both");
    document
      .getElementById("popArrowNone")
      .classList.toggle("active", arrowMode === "none");
  }
  if (selObj.type === "text") {
    var spans = getSpans(selObj);
    document.getElementById("popBold").classList.toggle(
      "active",
      spans.some(function (sp) {
        return sp.bold;
      }),
    );
    document.getElementById("popItalic").classList.toggle(
      "active",
      spans.some(function (sp) {
        return sp.italic;
      }),
    );
    document.getElementById("popUnder").classList.toggle(
      "active",
      spans.some(function (sp) {
        return sp.underline;
      }),
    );
    document.getElementById("popAlignLeft").classList.toggle("active", (selObj.textAlign || "center") === "left");
    document.getElementById("popAlignCenter").classList.toggle("active", (selObj.textAlign || "center") === "center");
    document.getElementById("popAlignRight").classList.toggle("active", (selObj.textAlign || "center") === "right");
    document.getElementById("popWrapText").classList.toggle("active", !!selObj.wrapText);
    document.getElementById("popFontSize").textContent = Math.round(
      selObj.fontSize * cam.zoom,
    );
  } else if (selObj.type === "sticky") {
    document.getElementById("popBold").classList.remove("active");
    document.getElementById("popItalic").classList.remove("active");
    document.getElementById("popUnder").classList.remove("active");
    document.getElementById("popAlignLeft").classList.toggle("active", (selObj.textAlign || "center") === "left");
    document.getElementById("popAlignCenter").classList.toggle("active", (selObj.textAlign || "center") === "center");
    document.getElementById("popAlignRight").classList.toggle("active", (selObj.textAlign || "center") === "right");
    document.getElementById("popWrapText").classList.remove("active");
    document.getElementById("popFontSize").textContent = Math.round(
      selObj.fontSize * cam.zoom,
    );
  }
  document.getElementById("popOpacity").value =
    selObj.opacity != null ? selObj.opacity : 1;
  document.getElementById("popOpacityVal").textContent =
    Math.round((selObj.opacity != null ? selObj.opacity : 1) * 100) + "%";
  // Stroke weight: show for stroked objects, hide for sticky/image
  var hasStroke =
    ["path", "line", "arrow", "rect", "ellipse"].indexOf(selObj.type) >= 0;
  document.getElementById("popStrokeBtn").style.display =
    hasStroke || selObj.type === "text" ? "flex" : "none";
  document.getElementById("popFillBtn").style.display = "flex";
  syncFillControls(selObj);
  // Only reset slider values when the selection changes
  if (s._lastPopupId !== selObj.id) {
    s._lastPopupId = selObj.id;
    if (hasStroke) {
      s._strokeBase = selObj.strokeWidth || 2;
      document.getElementById("popStrokeWeight").value = 0;
      document.getElementById("popStrokeVal").textContent = "1x";
    }
    if (selObj.type === "text") {
      var fw = selObj.fontWeight || 400;
      document.getElementById("popStrokeLabel").textContent = "Font Weight";
      document.getElementById("popStrokeWeight").min = 100;
      document.getElementById("popStrokeWeight").max = 900;
      document.getElementById("popStrokeWeight").step = 100;
      document.getElementById("popStrokeWeight").value = fw;
      document.getElementById("popStrokeVal").textContent = fw;
    } else {
      document.getElementById("popStrokeLabel").textContent = "Stroke";
      document.getElementById("popStrokeWeight").min = -2;
      document.getElementById("popStrokeWeight").max = 2;
      document.getElementById("popStrokeWeight").step = 0.1;
    }
  }
  if (!dropdownOpen) positionPopupNearBounds(pop, b, 140);
}

function normalizeHexColor(color) {
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (typeof color === "string" && /^#[0-9a-fA-F]{8}$/.test(color)) return color.slice(0, 7);
  if (typeof color === "string" && /^#[0-9a-fA-F]{3}$/.test(color)) {
    return "#" + color.slice(1).split("").map(function (ch) { return ch + ch; }).join("");
  }
  return "#e4e4e8";
}

function syncFillControls(obj) {
  document.getElementById("popFillEnabled").checked = !!(obj && obj.fill);
  document.getElementById("popFillColor").value = normalizeHexColor(
    (obj && (obj.fillColor || obj.color || obj.bgColor)) || getDefaultObjectColor(),
  );
  var fillOpacity = obj && obj.fillOpacity != null ? obj.fillOpacity : 0.28;
  document.getElementById("popFillOpacity").value = fillOpacity;
  document.getElementById("popFillOpacityVal").textContent =
    Math.round(fillOpacity * 100) + "%";
  var grainIntensity = obj && obj.grainIntensity != null ? obj.grainIntensity : 0.6;
  document.getElementById("popGrainIntensity").value = grainIntensity;
  document.getElementById("popGrainIntensityVal").textContent =
    Math.round(grainIntensity * 100) + "%";
  document.querySelectorAll(".fill-style-btn").forEach(function (btn) {
    btn.classList.toggle("active", btn.dataset.fillStyle === ((obj && obj.fillStyle) || "solid"));
  });
}

window.__updatePopup = updatePopup;

function applyPopColor(c) {
  var s = state;
  var isTextEdit =
    s.isEditing &&
    (s.editId === "new-text" ||
      (typeof s.editId === "number" &&
        findObj(s.editId) &&
        findObj(s.editId).type === "text"));
  if (isTextEdit) {
    document.getElementById("textEditor").focus();
    document.execCommand("foreColor", false, c);
    return;
  }
  if (s.selectedIds.length > 1) {
    saveState();
    s.selectedIds.forEach(function (id) {
      var obj = findObj(id);
      if (!obj) return;
      if (obj.type === "text" && obj.spans) {
        obj.spans.forEach(function (sp) {
          sp.color = c;
        });
        obj.color = c;
      } else if (obj.type !== "sticky" && obj.type !== "image") obj.color = c;
    });
    requestRender();
    return;
  }
  var obj = findObj(s.selectedId);
  if (!obj) return;
  saveState();
  if (obj.type === "text" && obj.spans) {
    obj.spans.forEach(function (sp) {
      sp.color = c;
    });
    obj.color = c;
  } else obj.color = c;
  requestRender();
}

function applyPopStickyColor(c) {
  var obj = findObj(state.selectedId);
  if (!obj || obj.type !== "sticky") return;
  saveState();
  obj.bgColor = c;
  requestRender();
}

function getTopObjectAt(wp) {
  for (var i = objects.length - 1; i >= 0; i--) {
    if (hitTest(objects[i], wp.x, wp.y)) return objects[i];
  }
  return null;
}

function getSelectedIds() {
  if (state.selectedIds.length) return state.selectedIds.slice();
  return state.selectedId !== null ? [state.selectedId] : [];
}

function getSelectedObjects() {
  return getSelectedIds().map(function (id) { return findObj(id); }).filter(Boolean);
}

function selectObjectForContext(obj) {
  if (!obj) {
    state.selectedId = null;
    state.selectedIds = [];
    state._lastPopupId = null;
    return;
  }
  if (state.selectedIds.indexOf(obj.id) < 0) {
    state.selectedId = obj.id;
    state.selectedIds = obj.groupId
      ? objects.filter(function (other) { return other.groupId === obj.groupId; }).map(function (other) { return other.id; })
      : [obj.id];
    state._lastPopupId = null;
  } else {
    state.selectedId = obj.id;
  }
}

function cloneForClipboard(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function copySelection() {
  var selected = getSelectedObjects();
  if (!selected.length) return false;
  state.clipboardObjects = selected.map(cloneForClipboard);
  showToast("Copied");
  return true;
}

function removeUnlockedSelected() {
  var ids = getSelectedIds();
  if (!ids.length) return false;
  var removeIds = ids.filter(function (id) {
    var obj = findObj(id);
    return obj && !obj.locked;
  });
  if (!removeIds.length) {
    showToast("Unlock object first");
    return false;
  }
  saveState();
  var kept = objects.filter(function (obj) { return removeIds.indexOf(obj.id) < 0; });
  objects.length = 0;
  kept.forEach(function (obj) { objects.push(obj); });
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  requestRender();
  return true;
}

function cutSelection() {
  var selected = getSelectedObjects();
  if (!selected.length) return false;
  if (!selected.some(function (obj) { return !obj.locked; })) {
    showToast("Unlock object first");
    return false;
  }
  state.clipboardObjects = selected.filter(function (obj) { return !obj.locked; }).map(cloneForClipboard);
  removeUnlockedSelected();
  showToast("Cut");
  return true;
}

function getClipboardBounds(items) {
  var bounds = [];
  items.forEach(function (obj) {
    var b = getRotatedBounds(obj);
    if (b) bounds.push(b);
  });
  if (!bounds.length) return null;
  var ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  bounds.forEach(function (b) {
    ax = Math.min(ax, b.x); ay = Math.min(ay, b.y);
    bx = Math.max(bx, b.x + b.w); by = Math.max(by, b.y + b.h);
  });
  return { x: ax, y: ay, w: bx - ax, h: by - ay };
}

function moveClonedObject(obj, dx, dy) {
  if (obj.points) obj.points = obj.points.map(function (p) { return { x: p.x + dx, y: p.y + dy }; });
  ["x", "x1", "x2", "cpX"].forEach(function (key) { if (Number.isFinite(obj[key])) obj[key] += dx; });
  ["y", "y1", "y2", "cpY"].forEach(function (key) { if (Number.isFinite(obj[key])) obj[key] += dy; });
}

function pasteClipboard(atWorld) {
  var clip = state.clipboardObjects || [];
  if (!clip.length) return false;
  var bounds = getClipboardBounds(clip);
  var target = atWorld || s2w(window.innerWidth / 2, window.innerHeight / 2);
  var dx = bounds ? target.x - (bounds.x + bounds.w / 2) : 24 / cam.zoom;
  var dy = bounds ? target.y - (bounds.y + bounds.h / 2) : 24 / cam.zoom;
  if (!atWorld) {
    dx = 24 / cam.zoom;
    dy = 24 / cam.zoom;
  }
  var groupMap = {};
  var newIds = [];
  var pasted = [];
  saveState();
  clip.forEach(function (item) {
    var obj = cloneForClipboard(item);
    obj.id = gid();
    obj.locked = false;
    if (obj.groupId) {
      if (!groupMap[obj.groupId]) groupMap[obj.groupId] = "grp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      obj.groupId = groupMap[obj.groupId];
    }
    moveClonedObject(obj, dx, dy);
    objects.push(obj);
    pasted.push(cloneForClipboard(obj));
    newIds.push(obj.id);
  });
  state.clipboardObjects = pasted;
  state.selectedIds = newIds;
  state.selectedId = newIds.length ? newIds[newIds.length - 1] : null;
  state._lastPopupId = null;
  refreshImgCache();
  requestRender();
  showToast("Pasted");
  return true;
}

function getPastePoint() {
  return state.lastPointerWorld || s2w(window.innerWidth / 2, window.innerHeight / 2);
}

function pasteTextFromOS(text) {
  var clean = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\s+$/g, "");
  if (!clean) return false;
  var wp = getPastePoint();
  var color = state.curColor || getDefaultObjectColor();
  var lines = clean.split("\n");
  var longest = lines.reduce(function (max, line) { return Math.max(max, line.length); }, 0);
  var wrapText = longest > 80 || lines.length > 8;
  addObj({
    type: "text",
    id: gid(),
    x: wp.x,
    y: wp.y,
    spans: markdownToSpans(clean, color),
    fontSize: 20 / cam.zoom,
    scaleX: 1,
    scaleY: 1,
    color: color,
    textAlign: "left",
    wrapText: wrapText,
    wrapWidth: wrapText ? 560 / cam.zoom : null,
    opacity: 1,
    rotation: 0,
  });
  showToast("Text pasted");
  return true;
}

function pushMarkdownSpan(out, text, style, color) {
  if (!text) return;
  out.push({
    text: text,
    bold: !!style.bold,
    italic: !!style.italic,
    underline: !!style.underline,
    color: color,
  });
}

function parseInlineMarkdown(text, color) {
  var out = [];
  var style = { bold: false, italic: false, underline: false };
  var buf = "";
  for (var i = 0; i < text.length; i++) {
    var two = text.slice(i, i + 2);
    if (two === "**") {
      pushMarkdownSpan(out, buf, style, color); buf = ""; style.bold = !style.bold; i++; continue;
    }
    if (two === "__") {
      pushMarkdownSpan(out, buf, style, color); buf = ""; style.underline = !style.underline; i++; continue;
    }
    if (text[i] === "*" && text[i + 1] !== " ") {
      pushMarkdownSpan(out, buf, style, color); buf = ""; style.italic = !style.italic; continue;
    }
    buf += text[i];
  }
  pushMarkdownSpan(out, buf, style, color);
  return out;
}

function markdownToSpans(text, color) {
  var spans = [];
  text.split("\n").forEach(function (line, idx) {
    if (idx > 0) spans.push({ text: "\n", bold: false, italic: false, underline: false, color: color });
    var processed = line;
    var stylePrefix = { bold: false, italic: false, underline: false };
    var heading = processed.match(/^(\s*)#{1,6}\s+(.*)$/);
    if (heading) {
      processed = heading[1] + heading[2];
      stylePrefix.bold = true;
    }
    var bullet = processed.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) processed = bullet[1] + "• " + bullet[2];
    parseInlineMarkdown(processed, color).forEach(function (span) {
      span.bold = span.bold || stylePrefix.bold;
      spans.push(span);
    });
  });
  return spans;
}

function setSelectionColor(c) {
  var targets = getSelectedObjects().filter(function (obj) { return !obj.locked; });
  if (!targets.length) {
    showToast("Unlock object first");
    return;
  }
  saveState();
  targets.forEach(function (obj) {
    if (obj.type === "sticky") obj.bgColor = c;
    else if (obj.type !== "image") {
      obj.color = c;
      if (obj.type === "text" && obj.spans) {
        obj.spans.forEach(function (sp) { sp.color = c; });
      }
    }
  });
  requestRender();
}

function toggleSelectionLock() {
  var targets = getSelectedObjects();
  if (!targets.length) return;
  var shouldLock = targets.some(function (obj) { return !obj.locked; });
  saveState();
  targets.forEach(function (obj) { obj.locked = shouldLock; });
  requestRender();
  showToast(shouldLock ? "Locked" : "Unlocked");
}

function buildPopupSwatches() {
  var cr = document.getElementById("popColorRow");
  COLORS.forEach(function (c) {
    var s = document.createElement("div");
    s.className = "pswatch";
    s.style.background = c;
    s.dataset.color = c;
    s.addEventListener("pointerdown", function (e) {
      e.preventDefault();
    });
    s.addEventListener("click", function (e) {
      e.stopPropagation();
      applyPopColor(c);
    });
    cr.appendChild(s);
  });
  var sr = document.getElementById("popStickyRow");
  STICKY_COLORS.forEach(function (c) {
    var s = document.createElement("div");
    s.className = "pswatch";
    s.style.background = c;
    s.dataset.sc = c;
    s.addEventListener("pointerdown", function (e) {
      e.preventDefault();
    });
    s.addEventListener("click", function (e) {
      e.stopPropagation();
      applyPopStickyColor(c);
    });
    sr.appendChild(s);
  });
  var ctxRow = document.getElementById("contextColorRow");
  if (ctxRow) {
    COLORS.forEach(function (c) {
      var sw = document.createElement("button");
      sw.type = "button";
      sw.className = "context-color";
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener("click", function (e) {
        e.stopPropagation();
        setSelectionColor(c);
        closeContextMenu();
      });
      ctxRow.appendChild(sw);
    });
  }
}

function closeContextMenu() {
  var menu = document.getElementById("contextMenu");
  if (menu) menu.classList.remove("open");
}

function openContextMenu(clientX, clientY, wp, targetObj) {
  var menu = document.getElementById("contextMenu");
  if (!menu) return;
  state.contextPastePoint = wp;
  selectObjectForContext(targetObj);
  var hasSelection = getSelectedObjects().length > 0;
  var hasUnlockedSelection = getSelectedObjects().some(function (obj) { return !obj.locked; });
  var hasClipboard = !!(state.clipboardObjects && state.clipboardObjects.length);
  var colorRow = document.getElementById("contextColorRow");
  if (colorRow) colorRow.style.display = hasSelection ? "grid" : "none";
  menu.querySelector('[data-action="copy"]').disabled = !hasSelection;
  menu.querySelector('[data-action="cut"]').disabled = !hasUnlockedSelection;
  menu.querySelector('[data-action="delete"]').disabled = !hasUnlockedSelection;
  menu.querySelector('[data-action="paste"]').disabled = !hasClipboard;
  var lockBtn = menu.querySelector('[data-action="lock"]');
  lockBtn.disabled = !hasSelection;
  var shouldUnlock = hasSelection && getSelectedObjects().every(function (obj) { return obj.locked; });
  lockBtn.querySelector("span").textContent = shouldUnlock ? "Unlock" : "Lock";
  lockBtn.querySelector("i").className = shouldUnlock ? "fa-solid fa-lock-open" : "fa-solid fa-lock";
  menu.classList.add("open");
  var mw = menu.offsetWidth || 172;
  var mh = menu.offsetHeight || 220;
  var left = Math.max(8, Math.min(clientX, window.innerWidth - mw - 8));
  var top = Math.max(8, Math.min(clientY, window.innerHeight - mh - 8));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  requestRender();
}

function setupContextMenu() {
  var menu = document.getElementById("contextMenu");
  if (!menu) return;
  menu.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  menu.addEventListener("click", function (e) {
    e.stopPropagation();
    var btn = e.target.closest("button[data-action]");
    if (!btn || btn.disabled) return;
    var action = btn.dataset.action;
    if (action === "copy") copySelection();
    else if (action === "cut") cutSelection();
    else if (action === "paste") pasteClipboard(state.contextPastePoint);
    else if (action === "delete") removeUnlockedSelected();
    else if (action === "lock") toggleSelectionLock();
    closeContextMenu();
  });
  window.addEventListener("pointerdown", closeContextMenu);
  window.addEventListener("blur", closeContextMenu);
}

function setupPopupHandlers() {
  var s = state;
  var pop = document.getElementById("itemPopup");
  pop.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
  });
  pop.addEventListener("click", function (e) {
    e.stopPropagation();
  });
  pop.addEventListener("mousedown", function (e) {
    // Allow range sliders to work normally; prevent default only on buttons
    if (e.target.type !== "range") e.preventDefault();
  });

  function isTextEdit() {
    return (
      s.isEditing &&
      (s.editId === "new-text" ||
        (typeof s.editId === "number" &&
          findObj(s.editId) &&
          findObj(s.editId).type === "text"))
    );
  }

  // ── Dropdown toggles ──
  function closeDropdowns() {
    document.querySelectorAll(".pop-dropdown").forEach(function (d) {
      d.classList.remove("open");
      d.classList.remove("open-below");
      d.style.maxHeight = "";
      d.style.overflowY = "";
    });
  }
  function applyArrowHeadMode(mode) {
    if (s.selectedIds.length > 1) return;
    var o = findObj(s.selectedId);
    if (!o || o.type !== "arrow") return;
    if (["none", "start", "end", "both"].indexOf(mode) < 0) return;
    saveState();
    o.arrowHeads = mode;
    requestRender();
  }

  function nextGroupId() {
    return "grp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function getSelectedObjects() {
    return s.selectedIds.map(function (id) {
      return findObj(id);
    }).filter(Boolean);
  }

  function getFillTargets() {
    if (s.selectedIds.length > 1) return getSelectedObjects();
    var obj = findObj(s.selectedId);
    return obj ? [obj] : [];
  }

  function patchFillTargets(patch) {
    var targets = getFillTargets();
    if (!targets.length) return;
    targets.forEach(function (obj) {
      Object.keys(patch).forEach(function (key) {
        obj[key] = patch[key];
      });
    });
    requestRender();
  }

  function groupSelectedObjects() {
    var selected = getSelectedObjects();
    if (selected.length < 2) return;
    saveState();
    var groupId = nextGroupId();
    selected.forEach(function (obj) {
      obj.groupId = groupId;
    });
    s.groupEditId = null;
    s.groupEditCandidateId = null;
    s.selectedIds = selected.map(function (obj) { return obj.id; });
    s.selectedId = s.selectedIds[s.selectedIds.length - 1];
    s._lastPopupId = null;
    showToast("Objects grouped");
    requestRender();
  }

  function ungroupSelectedObjects() {
    var groupIds = [];
    getSelectedObjects().forEach(function (obj) {
      if (obj.groupId && groupIds.indexOf(obj.groupId) < 0) groupIds.push(obj.groupId);
    });
    if (!groupIds.length) return;
    saveState();
    objects.forEach(function (obj) {
      if (groupIds.indexOf(obj.groupId) >= 0) delete obj.groupId;
    });
    if (groupIds.indexOf(s.groupEditId) >= 0) s.groupEditId = null;
    s.groupEditCandidateId = null;
    s.selectedIds = s.selectedIds.filter(function (id) { return !!findObj(id); });
    s.selectedId = s.selectedIds.length ? s.selectedIds[s.selectedIds.length - 1] : null;
    s._lastPopupId = null;
    showToast("Objects ungrouped");
    requestRender();
  }

  function toggleDropdown(btnId, dropdownId) {
    var dd = document.getElementById(dropdownId);
    var isOpen = dd.classList.contains("open");
    closeDropdowns();
    if (!isOpen) {
      dd.classList.add("open");
      requestAnimationFrame(function () {
        positionPopupDropdown(dd);
      });
    }
  }

  document
    .getElementById("popArrowStart")
    .addEventListener("click", function () {
      applyArrowHeadMode("start");
    });
  document
    .getElementById("popArrowEnd")
    .addEventListener("click", function () {
      applyArrowHeadMode("end");
    });
  document
    .getElementById("popArrowBoth")
    .addEventListener("click", function () {
      applyArrowHeadMode("both");
    });
  document
    .getElementById("popArrowNone")
    .addEventListener("click", function () {
      applyArrowHeadMode("none");
    });
  document.getElementById("popGroup").addEventListener("click", groupSelectedObjects);
  document.getElementById("popUngroup").addEventListener("click", ungroupSelectedObjects);
  document.getElementById("popColorsBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    state.settings.popupColorsExpanded = !state.settings.popupColorsExpanded;
    saveToStorage();
    requestRender();
  });
  document
    .getElementById("popOpacityBtn")
    .addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDropdown("popOpacityBtn", "popOpacityDropdown");
    });
  document
    .getElementById("popStrokeBtn")
    .addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDropdown("popStrokeBtn", "popStrokeDropdown");
    });
  document
    .getElementById("popFillBtn")
    .addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDropdown("popFillBtn", "popFillDropdown");
    });
  // Close dropdowns when clicking anywhere in the popup except inside a dropdown
  pop.addEventListener("click", function (e) {
    if (!e.target.closest(".pop-dropdown-wrap")) closeDropdowns();
  });

  document.getElementById("popBold").addEventListener("click", function () {
    if (isTextEdit()) {
      document.getElementById("textEditor").focus();
      document.execCommand("bold");
      return;
    }
    var o = findObj(s.selectedId);
    if (!o || o.type !== "text") return;
    saveState();
    if (o.spans) {
      var hb = o.spans.some(function (sp) {
        return sp.bold;
      });
      o.spans.forEach(function (sp) {
        sp.bold = !hb;
      });
    } else o.fontWeight = o.fontWeight === "700" ? "400" : "700";
    requestRender();
  });
  document.getElementById("popItalic").addEventListener("click", function () {
    if (isTextEdit()) {
      document.getElementById("textEditor").focus();
      document.execCommand("italic");
      return;
    }
    var o = findObj(s.selectedId);
    if (!o || o.type !== "text") return;
    saveState();
    if (o.spans) {
      var hi = o.spans.some(function (sp) {
        return sp.italic;
      });
      o.spans.forEach(function (sp) {
        sp.italic = !hi;
      });
    } else o.fontStyle = o.fontStyle === "italic" ? "normal" : "italic";
    requestRender();
  });
  document.getElementById("popUnder").addEventListener("click", function () {
    if (isTextEdit()) {
      document.getElementById("textEditor").focus();
      document.execCommand("underline");
      return;
    }
    var o = findObj(s.selectedId);
    if (!o || o.type !== "text") return;
    saveState();
    if (o.spans) {
      var hu = o.spans.some(function (sp) {
        return sp.underline;
      });
      o.spans.forEach(function (sp) {
        sp.underline = !hu;
      });
    } else o.underline = !o.underline;
    requestRender();
  });
  function setTextAlign(align) {
    var o = findObj(s.selectedId);
    if (!o || (o.type !== "text" && o.type !== "sticky")) return;
    saveState();
    o.textAlign = align;
    requestRender();
  }
  document.getElementById("popAlignLeft").addEventListener("click", function () { setTextAlign("left"); });
  document.getElementById("popAlignCenter").addEventListener("click", function () { setTextAlign("center"); });
  document.getElementById("popAlignRight").addEventListener("click", function () { setTextAlign("right"); });
  document.getElementById("popWrapText").addEventListener("click", function () {
    var o = findObj(s.selectedId);
    if (!o || o.type !== "text") return;
    saveState();
    o.wrapText = !o.wrapText;
    if (o.wrapText && !o.wrapWidth) {
      var b = getBounds(o);
      o.wrapWidth = b ? Math.max(160 / cam.zoom, b.w) : 420 / cam.zoom;
    }
    requestRender();
  });
  function applyListMode(mode) {
    if (isTextEdit()) {
      var ed = document.getElementById("textEditor");
      ed.focus();
      var sel = window.getSelection();
      var selectedText = sel && sel.rangeCount ? sel.toString() : "";
      if (selectedText) {
        document.execCommand("insertText", false, listifyPlainText(selectedText, mode));
      } else {
        ed.textContent = listifyPlainText(ed.innerText || ed.textContent || "", mode);
      }
      requestRender();
      return;
    }
    var o = findObj(s.selectedId);
    if (!o || o.type !== "text") return;
    saveState();
    o.spans = listifySpans(getSpans(o), mode);
    o.textAlign = o.textAlign || "left";
    requestRender();
  }
  document.getElementById("popBulletList").addEventListener("click", function () { applyListMode("bullet"); });
  document.getElementById("popNumberList").addEventListener("click", function () { applyListMode("number"); });
  document.getElementById("popSizeDn").addEventListener("click", function () {
    if (isTextEdit()) {
      var o = typeof s.editId === "number" ? findObj(s.editId) : null;
      if (o && o.type === "text") {
        saveState();
        o.fontSize = Math.max(2 / cam.zoom, o.fontSize * 0.8);
        updateEditorFS(o);
        requestRender();
      }
      return;
    }
    var o2 = findObj(s.selectedId);
    if (!o2 || o2.type !== "text") return;
    saveState();
    o2.fontSize = Math.max(2 / cam.zoom, o2.fontSize * 0.8);
    requestRender();
  });
  document.getElementById("popSizeUp").addEventListener("click", function () {
    if (isTextEdit()) {
      var o = typeof s.editId === "number" ? findObj(s.editId) : null;
      if (o && o.type === "text") {
        saveState();
        o.fontSize *= 1.25;
        updateEditorFS(o);
        requestRender();
      }
      return;
    }
    var o2 = findObj(s.selectedId);
    if (!o2 || o2.type !== "text") return;
    saveState();
    o2.fontSize *= 1.25;
    requestRender();
  });
  document.getElementById("popOpacity").addEventListener("input", function (e) {
    var val = +e.target.value;
    document.getElementById("popOpacityVal").textContent =
      Math.round(val * 100) + "%";
    // During text editing, apply to the editing text object
    if (isTextEdit()) {
      var o = typeof s.editId === "number" ? findObj(s.editId) : null;
      if (o) {
        o.opacity = val;
        requestRender();
      }
      return;
    }
    // Apply to all selected objects in multiselect
    if (s.selectedIds.length > 1) {
      s.selectedIds.forEach(function (id) {
        var o = findObj(id);
        if (o) o.opacity = val;
      });
      requestRender();
      return;
    }
    var o = findObj(s.selectedId);
    if (!o) return;
    o.opacity = val;
    requestRender();
  });
  document.getElementById("popOpacity").addEventListener("change", function () {
    saveState();
  });
  document
    .getElementById("popStrokeWeight")
    .addEventListener("input", function (e) {
      var val = +e.target.value;
      var selObj = findObj(s.selectedId);
      // During text editing — font weight is absolute
      if (isTextEdit()) {
        var o = typeof s.editId === "number" ? findObj(s.editId) : null;
        if (o && o.type === "text") {
          o.fontWeight = val;
          document.getElementById("popStrokeVal").textContent = val;
          requestRender();
        }
        return;
      }
      if (selObj && selObj.type === "text") {
        selObj.fontWeight = val;
        document.getElementById("popStrokeVal").textContent = val;
        requestRender();
      } else if (selObj && selObj.strokeWidth != null) {
        // Exponential mapping: slider -2..0..+2 → multiplier ¼x..1x..4x
        var mult = Math.pow(2, val);
        var base = s._strokeBase || selObj.strokeWidth || 2;
        selObj.strokeWidth = base * mult;
        if (selObj.type === "arrow") {
          selObj.arrowHeadSize = Math.max(selObj.strokeWidth * 10, 18 / cam.zoom);
        }
        var label =
          mult >= 1
            ? mult.toFixed(1) + "x"
            : "1/" + (1 / mult).toFixed(1) + "x";
        document.getElementById("popStrokeVal").textContent = label;
        requestRender();
      }
    });
  document
    .getElementById("popStrokeWeight")
    .addEventListener("change", function () {
      saveState();
    });
  document.getElementById("popFillEnabled").addEventListener("change", function (e) {
    saveState();
    var targets = getFillTargets();
    targets.forEach(function (o) {
      o.fill = e.target.checked;
      if (o.fill && !o.fillColor) o.fillColor = o.color || o.bgColor || "#e4e4e8";
      if (o.fill && !o.fillStyle) o.fillStyle = "solid";
      if (o.fill && o.fillOpacity == null) o.fillOpacity = +document.getElementById("popFillOpacity").value || 0.28;
      if (o.fill && o.grainIntensity == null) o.grainIntensity = +document.getElementById("popGrainIntensity").value || 0.6;
    });
    requestRender();
  });
  document.getElementById("popFillColor").addEventListener("input", function (e) {
    patchFillTargets({ fill: true, fillColor: e.target.value });
  });
  document.getElementById("popFillColor").addEventListener("change", saveState);
  document.getElementById("popFillOpacity").addEventListener("input", function (e) {
    var val = +e.target.value;
    document.getElementById("popFillOpacityVal").textContent = Math.round(val * 100) + "%";
    patchFillTargets({ fill: true, fillOpacity: val });
  });
  document.getElementById("popFillOpacity").addEventListener("change", saveState);
  document.getElementById("popGrainIntensity").addEventListener("input", function (e) {
    var val = +e.target.value;
    document.getElementById("popGrainIntensityVal").textContent = Math.round(val * 100) + "%";
    patchFillTargets({ fill: true, fillStyle: "grain", grainIntensity: val });
  });
  document.getElementById("popGrainIntensity").addEventListener("change", saveState);
  document.querySelectorAll(".fill-style-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      saveState();
      var style = btn.dataset.fillStyle || "solid";
      getFillTargets().forEach(function (o) {
        o.fill = true;
        o.fillStyle = style;
        if (!o.fillColor) o.fillColor = o.color || o.bgColor || "#e4e4e8";
        if (o.fillOpacity == null) o.fillOpacity = +document.getElementById("popFillOpacity").value || 0.28;
        if (style === "grain" && o.grainIntensity == null) o.grainIntensity = +document.getElementById("popGrainIntensity").value || 0.6;
      });
      requestRender();
    });
  });
  document.getElementById("popLayerUp").addEventListener("click", function () {
    if (s.selectedIds.length > 1) {
      // Move all selected objects up as a group
      saveState();
      // Process from top to bottom to maintain relative order
      for (var i = objects.length - 2; i >= 0; i--) {
        if (
          s.selectedIds.indexOf(objects[i].id) >= 0 &&
          s.selectedIds.indexOf(objects[i + 1].id) < 0
        ) {
          var tmp = objects[i];
          objects[i] = objects[i + 1];
          objects[i + 1] = tmp;
        }
      }
      requestRender();
      return;
    }
    var i = objects.findIndex(function (x) {
      return x.id === s.selectedId;
    });
    if (i < 0 || i >= objects.length - 1) return;
    saveState();
    var tmp = objects[i];
    objects[i] = objects[i + 1];
    objects[i + 1] = tmp;
    requestRender();
  });
  document.getElementById("popLayerDn").addEventListener("click", function () {
    if (s.selectedIds.length > 1) {
      saveState();
      for (var i = 1; i < objects.length; i++) {
        if (
          s.selectedIds.indexOf(objects[i].id) >= 0 &&
          s.selectedIds.indexOf(objects[i - 1].id) < 0
        ) {
          var tmp = objects[i];
          objects[i] = objects[i - 1];
          objects[i - 1] = tmp;
        }
      }
      requestRender();
      return;
    }
    var i = objects.findIndex(function (x) {
      return x.id === s.selectedId;
    });
    if (i <= 0) return;
    saveState();
    var tmp = objects[i];
    objects[i] = objects[i - 1];
    objects[i - 1] = tmp;
    requestRender();
  });
  document.getElementById("popDelete").addEventListener("click", function () {
    removeUnlockedSelected();
  });
  // ── Edit text: enter editing mode so user can select characters and color them
  document.getElementById("popEditText").addEventListener("click", function () {
    var o = findObj(s.selectedId);
    if (o && (o.type === "text" || o.type === "sticky")) startEditExisting(o);
  });
  // ── Custom color picker: apply color to selected text or object
  document
    .getElementById("popCustomColor")
    .addEventListener("input", function (e) {
      applyPopColor(e.target.value);
    });
  document
    .getElementById("popCustomColor")
    .addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });
}

function setupToolbar() {
  document.querySelectorAll(".tool-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      setToolActive(b.dataset.tool);
    });
  });
}

function expandSelectionWithGroups(ids) {
  var out = [];
  ids.forEach(function (id) {
    var obj = findObj(id);
    if (!obj) return;
    if (obj.groupId) {
      if (state.groupEditId === obj.groupId) {
        if (out.indexOf(id) < 0) out.push(id);
        return;
      }
      objects.forEach(function (other) {
        if (other.groupId === obj.groupId && out.indexOf(other.id) < 0) out.push(other.id);
      });
    } else if (out.indexOf(id) < 0) {
      out.push(id);
    }
  });
  return out;
}

function setupTopbar() {
  var s = state;
  var swC = document.getElementById("colorSwatches");
  COLORS.forEach(function (c) {
    var sw = document.createElement("div");
    sw.className = "color-swatch" + (c === s.curColor ? " active" : "");
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener("click", function () {
      s.curColor = c;
      s.curColorTouched = true;
      document.querySelectorAll(".color-swatch").forEach(function (x) {
        x.classList.remove("active");
      });
      sw.classList.add("active");
    });
    swC.appendChild(sw);
  });
  var stC = document.getElementById("strokeWidths");
  STROKE_WIDTHS.forEach(function (stw) {
    var b = document.createElement("button");
    b.className = "stroke-btn" + (stw === s.curStroke ? " active" : "");
    var d = document.createElement("div");
    d.className = "stroke-dot";
    var sz = Math.max(4, stw * 2.5);
    d.style.width = sz + "px";
    d.style.height = sz + "px";
    b.appendChild(d);
    b.addEventListener("click", function () {
      s.curStroke = stw;
      document.querySelectorAll(".stroke-btn").forEach(function (x) {
        x.classList.remove("active");
      });
      b.classList.add("active");
    });
    stC.appendChild(b);
  });
  document.getElementById("fillToggle").addEventListener("click", function () {
    s.fillOn = !s.fillOn;
    this.classList.toggle("active", s.fillOn);
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
}

function setupBottombar() {
  document.getElementById("zoomIn").addEventListener("click", function () {
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
  });
  document.getElementById("zoomOut").addEventListener("click", function () {
    zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.25);
  });
  document.getElementById("zoomLevel").addEventListener("click", resetZoom);
  document.getElementById("fitView").addEventListener("click", fitView);
  document.getElementById("locateBtn").addEventListener("click", locateObjects);
  document.getElementById("saveViewBookmark").addEventListener("click", saveCurrentViewBookmark);
  document.getElementById("viewBookmarksBtn").addEventListener("click", toggleViewBookmarksPanel);
  document.addEventListener("click", function (e) {
    if (
      e.target.closest("#viewBookmarksPanel") ||
      e.target.closest("#viewBookmarksBtn") ||
      e.target.closest("#saveViewBookmark")
    ) return;
    closeViewBookmarksPanel();
  });
  renderViewBookmarks();
}

function nextViewBookmarkId() {
  return "view-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getNextViewBookmarkName() {
  var max = 0;
  state.viewBookmarks.forEach(function (bookmark) {
    var match = /^View\s+(\d+)$/.exec(bookmark.name || "");
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return "View " + (max + 1);
}

function formatZoomLabel(zoom) {
  if (zoom >= 100) return Math.round(zoom) + "x";
  if (zoom >= 1) return Math.round(zoom * 100) + "%";
  if (zoom >= 0.01) return (zoom * 100).toFixed(1) + "%";
  return zoom.toExponential(1);
}

function captureViewThumbnail() {
  var thumb = document.createElement("canvas");
  var tctx = thumb.getContext("2d");
  thumb.width = VIEW_BOOKMARK_THUMB_W;
  thumb.height = VIEW_BOOKMARK_THUMB_H;
  tctx.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    VIEW_BOOKMARK_THUMB_W,
    VIEW_BOOKMARK_THUMB_H,
  );
  try {
    var jpeg = thumb.toDataURL("image/jpeg", 0.78);
    if (jpeg.indexOf("data:image/jpeg") === 0) return jpeg;
  } catch (e) {}
  return thumb.toDataURL("image/png");
}

function saveCurrentViewBookmark() {
  if (state.isEditing) finishEditing();
  closeViewBookmarksPanel();
  requestRender();
  requestAnimationFrame(function () {
    var bookmark = {
      id: nextViewBookmarkId(),
      name: getNextViewBookmarkName(),
      cam: { x: cam.x, y: cam.y, zoom: cam.zoom },
      thumbnail: captureViewThumbnail(),
      createdAt: Date.now(),
    };
    state.viewBookmarks.push(bookmark);
    state.viewBookmarks.sort(function (a, b) { return a.createdAt - b.createdAt; });
    while (state.viewBookmarks.length > MAX_VIEW_BOOKMARKS) state.viewBookmarks.shift();
    renderViewBookmarks();
    saveToStorage();
    showToast("View saved");
  });
}

function renderViewBookmarks() {
  var list = document.getElementById("viewBookmarksList");
  if (!list) return;
  list.innerHTML = "";
  if (!state.viewBookmarks.length) {
    var empty = document.createElement("div");
    empty.className = "view-bookmarks-empty";
    empty.textContent = "No saved views";
    list.appendChild(empty);
    return;
  }
  state.viewBookmarks.slice().reverse().forEach(function (bookmark) {
    var row = document.createElement("button");
    row.type = "button";
    row.className = "view-bookmark-row";
    row.dataset.id = bookmark.id;
    row.addEventListener("click", function () {
      restoreViewBookmark(bookmark.id);
    });

    var img = document.createElement("img");
    img.className = "view-bookmark-thumb";
    img.src = bookmark.thumbnail;
    img.alt = "";

    var meta = document.createElement("div");
    meta.className = "view-bookmark-meta";
    var name = document.createElement("div");
    name.className = "view-bookmark-name";
    name.textContent = bookmark.name;
    var zoom = document.createElement("div");
    zoom.className = "view-bookmark-zoom";
    zoom.textContent = formatZoomLabel(bookmark.cam.zoom);
    meta.appendChild(name);
    meta.appendChild(zoom);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "view-bookmark-delete";
    del.title = "Delete saved view";
    del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    del.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteViewBookmark(bookmark.id);
    });

    row.appendChild(img);
    row.appendChild(meta);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function toggleViewBookmarksPanel(e) {
  if (e) e.stopPropagation();
  var panel = document.getElementById("viewBookmarksPanel");
  var btn = document.getElementById("viewBookmarksBtn");
  if (!panel) return;
  var open = panel.classList.contains("open");
  if (open) closeViewBookmarksPanel();
  else {
    renderViewBookmarks();
    panel.classList.add("open");
    if (btn) btn.classList.add("active");
  }
}

function closeViewBookmarksPanel() {
  var panel = document.getElementById("viewBookmarksPanel");
  var btn = document.getElementById("viewBookmarksBtn");
  if (panel) panel.classList.remove("open");
  if (btn) btn.classList.remove("active");
}

function restoreViewBookmark(id) {
  var bookmark = state.viewBookmarks.find(function (item) { return item.id === id; });
  if (!bookmark) return;
  cam.x = bookmark.cam.x;
  cam.y = bookmark.cam.y;
  cam.zoom = bookmark.cam.zoom;
  updateZoomDisplay();
  requestRender();
  closeViewBookmarksPanel();
  saveToStorage();
}

function deleteViewBookmark(id) {
  state.viewBookmarks = state.viewBookmarks.filter(function (bookmark) {
    return bookmark.id !== id;
  });
  renderViewBookmarks();
  saveToStorage();
}

function updateKeybindList() {
  var list = document.getElementById("keybindList");
  if (!list) return;
  list.innerHTML = "";
  TOOL_META.forEach(function (meta) {
    var row = document.createElement("div");
    row.className = "keybind-row";
    var name = document.createElement("span");
    name.className = "keybind-name";
    name.textContent = meta.label;
    var btn = document.createElement("button");
    btn.className = "keybind-btn";
    btn.type = "button";
    btn.dataset.tool = meta.tool;
    btn.textContent = codeToLabel(getToolKeyCode(meta.tool));
    btn.title = "Click, then press a key";
    row.appendChild(name);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function boardStorageKey(id) {
  return STORAGE_KEY + ":board:" + id;
}

function nextBoardId() {
  return "board-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings || state.settings));
}

function serializeCurrentBoard() {
  return {
    version: 1,
    objects: objects,
    nid: state.nid,
    cam: { x: cam.x, y: cam.y, zoom: cam.zoom },
    settings: state.settings,
    viewBookmarks: state.viewBookmarks,
  };
}

function normalizeBoardName(name) {
  var trimmed = (name || "").trim();
  return trimmed || "Untitled Board";
}

function loadBoardIndex() {
  try {
    var raw = localStorage.getItem(BOARD_INDEX_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.boards)) {
        var boards = parsed.boards.filter(function (board) {
          return board && typeof board.id === "string" && typeof board.name === "string";
        }).map(function (board) {
          return {
            id: board.id,
            name: board.name,
            updatedAt: Number.isFinite(board.updatedAt) ? board.updatedAt : Date.now(),
          };
        });
        if (boards.length) {
          return {
            activeId: typeof parsed.activeId === "string" ? parsed.activeId : boards[0].id,
            boards: boards,
          };
        }
      }
    }
  } catch (e) {}
  return {
    activeId: DEFAULT_BOARD_ID,
    boards: [{ id: DEFAULT_BOARD_ID, name: "Board 1", updatedAt: Date.now() }],
  };
}

function saveBoardIndex(index) {
  try {
    localStorage.setItem(BOARD_INDEX_KEY, JSON.stringify(index));
  } catch (e) {}
}

function upsertBoardMeta(id, name) {
  var index = loadBoardIndex();
  var found = false;
  index.boards.forEach(function (board) {
    if (board.id === id) {
      board.name = name || board.name;
      board.updatedAt = Date.now();
      found = true;
    }
  });
  if (!found) {
    index.boards.push({ id: id, name: name || "Untitled Board", updatedAt: Date.now() });
  }
  index.activeId = id;
  saveBoardIndex(index);
  renderBoardList();
}

function renderBoardList() {
  var select = document.getElementById("boardSelect");
  if (!select) return;
  var index = loadBoardIndex();
  select.innerHTML = "";
  index.boards.slice().sort(function (a, b) {
    return b.updatedAt - a.updatedAt;
  }).forEach(function (board) {
    var opt = document.createElement("option");
    opt.value = board.id;
    opt.textContent = board.name;
    select.appendChild(opt);
  });
  select.value = state.currentBoardId || index.activeId;
}

function applyBoardData(data, fallbackSettings) {
  if (!data || !Array.isArray(data.objects)) return false;
  objects.length = 0;
  data.objects.forEach(function (o) { objects.push(o); });
  state.nid = data.nid || 1;
  cam.x = data.cam && Number.isFinite(data.cam.x) ? data.cam.x : window.innerWidth / 2;
  cam.y = data.cam && Number.isFinite(data.cam.y) ? data.cam.y : window.innerHeight / 2;
  cam.zoom = data.cam && Number.isFinite(data.cam.zoom) ? data.cam.zoom : 1;
  mergeSettings(data.settings || fallbackSettings);
  mergeViewBookmarks(data.viewBookmarks);
  state.undoSt = [];
  state.redoSt = [];
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  state.isDrawing = false;
  state.dragMode = null;
  state.isEditing = false;
  refreshImgCache();
  applySettingsToUI();
  updateZoomDisplay();
  renderViewBookmarks();
  requestRender();
  return true;
}

function loadBoardById(id) {
  if (state.isEditing) finishEditing();
  saveToStorage();
  var raw = localStorage.getItem(boardStorageKey(id));
  if (!raw && id === DEFAULT_BOARD_ID) raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    showToast("Board not found");
    return false;
  }
  try {
    var data = JSON.parse(raw);
    if (!applyBoardData(data)) throw new Error("Invalid board");
    state.currentBoardId = id;
    var index = loadBoardIndex();
    index.activeId = id;
    saveBoardIndex(index);
    renderBoardList();
    saveToStorage();
    showToast("Board loaded");
    return true;
  } catch (e) {
    showToast("Could not load board");
  }
  return false;
}

function createNewBoard() {
  if (state.isEditing) finishEditing();
  saveToStorage();
  var name = normalizeBoardName(window.prompt("Board name", "Untitled Board"));
  var id = nextBoardId();
  state.currentBoardId = id;
  objects.length = 0;
  state.nid = 1;
  state.viewBookmarks = [];
  state.undoSt = [];
  state.redoSt = [];
  state.selectedId = null;
  state.selectedIds = [];
  state.groupEditId = null;
  state.groupEditCandidateId = null;
  cam.x = window.innerWidth / 2;
  cam.y = window.innerHeight / 2;
  cam.zoom = 1;
  mergeSettings(cloneSettings(state.settings));
  updateZoomDisplay();
  renderViewBookmarks();
  requestRender();
  upsertBoardMeta(id, name);
  saveToStorage();
  showToast("New board created");
}

function loadSelectedBoard() {
  var select = document.getElementById("boardSelect");
  if (select && select.value) loadBoardById(select.value);
}

function exportCurrentBoard() {
  if (state.isEditing) finishEditing();
  saveToStorage();
  var index = loadBoardIndex();
  var meta = index.boards.find(function (board) { return board.id === state.currentBoardId; });
  var name = meta ? meta.name : "whiteboard";
  var data = serializeCurrentBoard();
  data.name = name;
  data.exportedAt = new Date().toISOString();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var link = document.createElement("a");
  var safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "whiteboard";
  link.download = safeName + ".whiteboard.json";
  link.href = URL.createObjectURL(blob);
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  showToast("Board exported");
}

function importBoardFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.objects)) throw new Error("Invalid board");
      if (state.isEditing) finishEditing();
      saveToStorage();
      var id = nextBoardId();
      var name = normalizeBoardName(data.name || file.name.replace(/\.whiteboard\.json$|\.json$/i, ""));
      state.currentBoardId = id;
      if (!applyBoardData(data)) throw new Error("Invalid board");
      upsertBoardMeta(id, name);
      saveToStorage();
      showToast("Board loaded from file");
    } catch (err) {
      showToast("Could not load board file");
    }
  };
  reader.readAsText(file);
}

function setToolShortcut(tool, code) {
  var map = state.settings.keyMap;
  Object.keys(map).forEach(function (existingCode) {
    if (map[existingCode] === tool || existingCode === code) delete map[existingCode];
  });
  if (code) map[code] = tool;
  syncKeyMap();
  updateShortcutLabels();
  updateKeybindList();
  saveToStorage();
}

function resetSettings() {
  state.settings.theme = DEFAULT_SETTINGS.theme;
  state.settings.accentColor = DEFAULT_SETTINGS.accentColor;
  state.settings.canvasColor = DEFAULT_SETTINGS.canvasColor;
  state.settings.gridColor = DEFAULT_SETTINGS.gridColor;
  state.settings.bgPattern = DEFAULT_SETTINGS.bgPattern;
  state.settings.popupColorsExpanded = DEFAULT_SETTINGS.popupColorsExpanded;
  state.settings.keyMap = Object.assign({}, DEFAULT_SETTINGS.keyMap);
  state.curColor = getDefaultObjectColor();
  state.curColorTouched = false;
  applySettingsToUI();
  requestRender();
  saveToStorage();
  showToast("Options reset");
}

function setupOptions() {
  var panel = document.getElementById("optionsPanel");
  var optionsBtn = document.getElementById("optionsBtn");
  var closeBtn = document.getElementById("optionsClose");
  var captureTool = null;

  function clearCapture() {
    captureTool = null;
    document.querySelectorAll(".keybind-btn").forEach(function (btn) {
      btn.classList.remove("capturing");
      btn.textContent = codeToLabel(getToolKeyCode(btn.dataset.tool));
    });
  }

  optionsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    panel.classList.toggle("open");
    clearCapture();
  });
  closeBtn.addEventListener("click", function () {
    panel.classList.remove("open");
    clearCapture();
  });
  panel.addEventListener("pointerdown", function (e) {
    e.stopPropagation();
  });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    var btn = e.target.closest(".keybind-btn");
    if (!btn) return;
    clearCapture();
    captureTool = btn.dataset.tool;
    btn.classList.add("capturing");
    btn.textContent = "Press key";
  });
  window.addEventListener("pointerdown", function () {
    if (panel.classList.contains("open")) clearCapture();
  });
  window.addEventListener("keydown", function (e) {
    if (!captureTool) return;
    e.preventDefault();
    e.stopPropagation();
    var tool = captureTool;
    if (e.key === "Escape") {
      clearCapture();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      setToolShortcut(tool, "");
      clearCapture();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.code === "Space") {
      showToast("Choose a single letter, number, or symbol key");
      clearCapture();
      return;
    }
    setToolShortcut(tool, e.code);
    clearCapture();
  }, true);

  document.getElementById("themeSelect").addEventListener("change", function (e) {
    applyThemeDefaults(e.target.value);
    applySettingsToUI();
    requestRender();
    saveToStorage();
  });
  document.getElementById("accentColor").addEventListener("input", function (e) {
    state.settings.accentColor = e.target.value;
    applyAccentVars();
    requestRender();
  });
  document.getElementById("accentColor").addEventListener("change", saveToStorage);
  document.getElementById("canvasColor").addEventListener("input", function (e) {
    state.settings.canvasColor = e.target.value;
    requestRender();
  });
  document.getElementById("canvasColor").addEventListener("change", saveToStorage);
  document.getElementById("gridColor").addEventListener("input", function (e) {
    state.settings.gridColor = e.target.value;
    requestRender();
  });
  document.getElementById("gridColor").addEventListener("change", saveToStorage);
  document.getElementById("bgPattern").addEventListener("change", function (e) {
    state.settings.bgPattern = e.target.value;
    requestRender();
    saveToStorage();
  });
  document.getElementById("newBoardBtn").addEventListener("click", createNewBoard);
  document.getElementById("loadBoardBtn").addEventListener("click", loadSelectedBoard);
  document.getElementById("exportBoardBtn").addEventListener("click", exportCurrentBoard);
  document.getElementById("importBoardBtn").addEventListener("click", function () {
    document.getElementById("importBoardInput").click();
  });
  document.getElementById("importBoardInput").addEventListener("change", function (e) {
    importBoardFile(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("resetOptions").addEventListener("click", resetSettings);
  renderBoardList();
  updateKeybindList();
}

// ── Pointer events ──
function setupPointerEvents() {
  var s = state;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("mousedown", function (e) {
    if (e.button === 1) e.preventDefault();
  });
  canvas.addEventListener("auxclick", function (e) {
    if (e.button === 1) e.preventDefault();
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.getElementById("textEditor").addEventListener("input", function () {
    requestRender();
  });
  document.addEventListener("selectionchange", function () {
    if (s.isEditing) requestRender();
  });

  canvas.addEventListener("dblclick", function (e) {
    if (s.isEditing) return;
    var wp = getWorldPoint(e);
    for (var i = objects.length - 1; i >= 0; i--) {
      var obj = objects[i];
      if (
        (obj.type === "text" || obj.type === "sticky") &&
        hitTest(obj, wp.x, wp.y)
      ) {
        startEditExisting(obj);
        return;
      }
    }
  });

  document
    .getElementById("imageInput")
    .addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (f) {
        insertImg(f, s2w(window.innerWidth / 2, window.innerHeight / 2));
        e.target.value = "";
      }
    });
  canvas.addEventListener("dragover", function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });
  canvas.addEventListener("drop", function (e) {
    e.preventDefault();
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) {
      var r = canvas.getBoundingClientRect();
      insertImg(f, s2w(e.clientX - r.left, e.clientY - r.top));
    }
  });
  window.addEventListener("paste", function (e) {
    state.pendingInternalPaste = false;
    if (s.isEditing || s.isPan || e.pointerType || !e.clipboardData) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        insertImg(
          items[i].getAsFile(),
          getPastePoint(),
        );
        return;
      }
    }
    var text = e.clipboardData.getData("text/plain");
    if (text && pasteTextFromOS(text)) {
      e.preventDefault();
      return;
    }
    if (state.pendingInternalPaste && state.clipboardObjects && state.clipboardObjects.length) {
      e.preventDefault();
      pasteClipboard(getPastePoint());
    }
  });
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (Date.now() < s.suppressContextMenuUntil) return;
    if (s.isEditing) {
      finishEditing();
      s.suppressContextMenuUntil = Date.now() + 700;
      return;
    }
    var r = canvas.getBoundingClientRect();
    var wp = s2w(e.clientX - r.left, e.clientY - r.top);
    var target = getTopObjectAt(wp);
    openContextMenu(e.clientX, e.clientY, wp, target);
  });
}

function getWorldPoint(e) {
  var r = canvas.getBoundingClientRect();
  return s2w(e.clientX - r.left, e.clientY - r.top);
}

function onPointerDown(e) {
  var s = state;
  // Close any open popup dropdowns
  document.querySelectorAll(".pop-dropdown.open").forEach(function (d) {
    d.classList.remove("open");
  });
  if (s.isEditing) {
    if (e.button === 2) {
      s.suppressContextMenuUntil = Date.now() + 700;
      if (s.curTool !== "select") setToolActive("select");
    }
    finishEditing();
    return;
  }
  s.dragMode = null;
  s.dragUndo = false;
  s.multiDragSnaps = null;
  s.dragRotStart = null;
  s.dragRotSnaps = null;
  s.dragGroupBounds = null;
  s.dragGroupRotation = 0;
  s.dragRotPointerOffset = 0;
  s.groupEditCandidateId = null;
  var r = canvas.getBoundingClientRect(),
    sx = e.clientX - r.left,
    sy = e.clientY - r.top;
  var wp = s2w(sx, sy);
  if (e.button === 1) {
    e.preventDefault();
    startPan(sx, sy);
    s.panButton = 1;
    return;
  }
  if (e.button === 2) {
    e.preventDefault();
    s.rightPanMoved = false;
    s.rightPanStartedTool = s.curTool;
    if (s.curTool !== "select") setToolActive("select");
    startPan(sx, sy);
    s.panButton = 2;
    return;
  }
  if (e.button !== 0) return;
  if (s.curTool !== "select") {
    for (var bi = objects.length - 1; bi >= 0; bi--) {
      if (hitBorder(objects[bi], wp.x, wp.y)) {
        setToolActive("select");
        onSelectDown(wp, sx, sy, e.shiftKey);
        return;
      }
    }
  }
  switch (s.curTool) {
    case "select":
      onSelectDown(wp, sx, sy, e.shiftKey);
      break;
    case "hand":
      startPan(sx, sy);
      break;
    case "pen":
      startPen(wp);
      break;
    case "eraser":
      startErase();
      break;
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
      startShape(wp);
      break;
    case "text":
      startTextTool(wp, e.clientX, e.clientY);
      break;
    case "sticky":
      startStickyCreate(wp);
      break;
    case "image":
      document.getElementById("imageInput").click();
      break;
  }
}

function onPointerMove(e) {
  var s = state;
  var r = canvas.getBoundingClientRect(),
    sx = e.clientX - r.left,
    sy = e.clientY - r.top;
  var wp = s2w(sx, sy);
  s.lastPointerWorld = wp;
  if (s.curTool === "eraser") {
    var ec = document.getElementById("eraserCursor");
    ec.style.display = "block";
    ec.style.left = e.clientX + "px";
    ec.style.top = e.clientY + "px";
    ec.style.width = "20px";
    ec.style.height = "20px";
  }
  if (s.isPan) {
    if (s.panButton === 2 && Math.hypot(sx - s.panSt.x, sy - s.panSt.y) > 3) {
      s.rightPanMoved = true;
    }
    cam.x = s.panCamSt.x + (sx - s.panSt.x);
    cam.y = s.panCamSt.y + (sy - s.panSt.y);
    requestRender();
    return;
  }
  if (s.isBoxSelect) {
    updateBoxSelect(wp);
    return;
  }
  if (s.isDrawing) {
    if (s.curTool === "pen") {
      s.curPath.push(wp);
      requestRender();
    } else if (s.curTool === "eraser") {
      eraseAt(wp);
      requestRender();
    } else if (["line", "arrow", "rect", "ellipse"].indexOf(s.curTool) >= 0) {
      s.drawCur = wp;
      requestRender();
    }
  }
  if (s.dragMode) {
    if (!s.dragUndo) {
      saveState();
      s.dragUndo = true;
    }
    handleDrag(wp, e.ctrlKey);
  }
}

function onPointerUp(e) {
  var s = state;
  var r = canvas.getBoundingClientRect(),
    sx = e.clientX - r.left,
    sy = e.clientY - r.top;
  var wp = s2w(sx, sy);
  if (s.isPan) {
    var wasRightPan = s.panButton === 2;
    var shouldSuppressContextMenu = wasRightPan && (s.rightPanMoved || s.rightPanStartedTool !== "select");
    s.isPan = false;
    s.panButton = null;
    s.rightPanMoved = false;
    s.rightPanStartedTool = null;
    if (shouldSuppressContextMenu) s.suppressContextMenuUntil = Date.now() + 700;
    updateCursor();
    return;
  }
  if (s.isBoxSelect) {
    finishBoxSelect(e.shiftKey);
    return;
  }
  if (s.isDrawing) {
    if (s.curTool === "pen") finishPen();
    else if (s.curTool === "eraser") finishErase();
    else if (["line", "arrow", "rect", "ellipse"].indexOf(s.curTool) >= 0) {
      var createdShape = finishShape();
      if (!createdShape) {
        setToolActive("select");
        selectTopAt(wp);
      }
    }
  }
  if (s.dragMode) {
    // If no undo was saved (no movement happened), treat as a click — cycle selection
    if (!s.dragUndo && s.groupEditCandidateId !== null) enterGroupEditForObject(s.groupEditCandidateId);
    else if (!s.dragUndo && s.cycleHits) cycleSelect();
    s.dragMode = null;
    s.dragSW = null;
    s.dragSnap = null;
    s.dragUndo = false;
    s.cycleHits = null;
    s.cycleIdx = -1;
    s.multiDragSnaps = null;
    s.dragRotStart = null;
    s.dragRotSnaps = null;
    s.dragGroupBounds = null;
    s.dragGroupRotation = 0;
    s.dragRotPointerOffset = 0;
    s.groupEditCandidateId = null;
    updatePopup();
    requestRender();
  }
}

function onWheel(e) {
  e.preventDefault();
  var r = canvas.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.08 : 1 / 1.08);
}

// ── Select all objects ──
function selectAll() {
  var s = state;
  if (!objects.length) return;
  s.selectedIds = objects.map(function (o) {
    return o.id;
  });
  s.selectedIds = expandSelectionWithGroups(s.selectedIds);
  s.selectedId = s.selectedIds[s.selectedIds.length - 1];
  s._lastPopupId = null;
  requestRender();
}

// ── Keyboard ──
function setupKeyboard() {
  var s = state;
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && document.getElementById("viewBookmarksPanel").classList.contains("open")) {
      e.preventDefault();
      closeViewBookmarksPanel();
      return;
    }
    if (s.isEditing) {
      if (e.key === "Escape") finishEditing();
      return;
    }
    if (e.code === "Space" && !s.spaceHeld) {
      e.preventDefault();
      s.spaceHeld = true;
      s.toolBefore = s.curTool;
      setToolActive("hand");
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && KEY_MAP[e.code]) {
      setToolActive(KEY_MAP[e.code]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      if (copySelection()) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
      if (cutSelection()) e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      state.pendingInternalPaste = true;
      setTimeout(function () {
        if (state.pendingInternalPaste) {
          pasteClipboard(getPastePoint());
          state.pendingInternalPaste = false;
        }
      }, 80);
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      (s.selectedId !== null || s.selectedIds.length > 0)
    ) {
      e.preventDefault();
      removeUnlockedSelected();
      return;
    }
    if (e.key === "Escape" && s.groupEditId) {
      exitGroupEdit(true);
      return;
    }
    if (e.key === "Escape" && s.selectedIds.length > 0) {
      s.selectedId = null;
      s.selectedIds = [];
      requestRender();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") {
      e.preventDefault();
      redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "=") {
      e.preventDefault();
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.25);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") {
      e.preventDefault();
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.25);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "0") {
      e.preventDefault();
      resetZoom();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.shiftKey && e.code === "KeyF") {
      e.preventDefault();
      locateObjects();
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.code === "Space" && s.spaceHeld) {
      s.spaceHeld = false;
      if (s.toolBefore) setToolActive(s.toolBefore);
      s.toolBefore = null;
    }
  });
}

// ── Persistence ──
export function saveToStorage() {
  try {
    var data = serializeCurrentBoard();
    var raw = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, raw);
    localStorage.setItem(boardStorageKey(state.currentBoardId || DEFAULT_BOARD_ID), raw);
    var index = loadBoardIndex();
    index.activeId = state.currentBoardId || DEFAULT_BOARD_ID;
    var found = false;
    index.boards.forEach(function (board) {
      if (board.id === index.activeId) {
        board.updatedAt = Date.now();
        found = true;
      }
    });
    if (!found) {
      index.boards.push({ id: index.activeId, name: "Board 1", updatedAt: Date.now() });
    }
    saveBoardIndex(index);
    renderBoardList();
  } catch (e) {}
}

function mergeSettings(saved) {
  var next = {
    theme: DEFAULT_SETTINGS.theme,
    accentColor: DEFAULT_SETTINGS.accentColor,
    canvasColor: DEFAULT_SETTINGS.canvasColor,
    gridColor: DEFAULT_SETTINGS.gridColor,
    bgPattern: DEFAULT_SETTINGS.bgPattern,
    popupColorsExpanded: DEFAULT_SETTINGS.popupColorsExpanded,
    keyMap: Object.assign({}, DEFAULT_SETTINGS.keyMap),
  };
  if (saved && typeof saved === "object") {
    if (saved.theme === "dark" || saved.theme === "white") next.theme = saved.theme;
    ["accentColor", "canvasColor", "gridColor"].forEach(function (key) {
      if (typeof saved[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(saved[key])) next[key] = saved[key];
    });
    if (["dots", "grid", "none"].indexOf(saved.bgPattern) >= 0) next.bgPattern = saved.bgPattern;
    if (typeof saved.popupColorsExpanded === "boolean") next.popupColorsExpanded = saved.popupColorsExpanded;
    if (saved.keyMap && typeof saved.keyMap === "object") {
      next.keyMap = {};
      Object.keys(saved.keyMap).forEach(function (code) {
        var tool = saved.keyMap[code];
        if (TOOL_META.some(function (meta) { return meta.tool === tool; })) next.keyMap[code] = tool;
      });
    }
  }
  state.settings = next;
  state.curColor = getThemePreset(next.theme).objectColor;
  state.curColorTouched = false;
  syncKeyMap();
}

function mergeViewBookmarks(saved) {
  state.viewBookmarks = [];
  if (!Array.isArray(saved)) return;
  saved.forEach(function (bookmark) {
    if (!bookmark || typeof bookmark !== "object") return;
    if (typeof bookmark.id !== "string" || typeof bookmark.name !== "string") return;
    if (!bookmark.cam || typeof bookmark.cam !== "object") return;
    if (
      !Number.isFinite(bookmark.cam.x) ||
      !Number.isFinite(bookmark.cam.y) ||
      !Number.isFinite(bookmark.cam.zoom)
    ) return;
    if (typeof bookmark.thumbnail !== "string" || bookmark.thumbnail.indexOf("data:image/") !== 0) return;
    if (!Number.isFinite(bookmark.createdAt)) return;
    state.viewBookmarks.push({
      id: bookmark.id,
      name: bookmark.name,
      cam: {
        x: bookmark.cam.x,
        y: bookmark.cam.y,
        zoom: bookmark.cam.zoom,
      },
      thumbnail: bookmark.thumbnail,
      createdAt: bookmark.createdAt,
    });
  });
  state.viewBookmarks.sort(function (a, b) { return a.createdAt - b.createdAt; });
  if (state.viewBookmarks.length > MAX_VIEW_BOOKMARKS) {
    state.viewBookmarks = state.viewBookmarks.slice(state.viewBookmarks.length - MAX_VIEW_BOOKMARKS);
  }
}

export function loadFromStorage() {
  try {
    var index = loadBoardIndex();
    var activeId = index.activeId || DEFAULT_BOARD_ID;
    var raw = localStorage.getItem(boardStorageKey(activeId));
    if (!raw) raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (applyBoardData(data)) {
      state.currentBoardId = activeId;
      var activeMeta = index.boards.find(function (board) { return board.id === activeId; });
      upsertBoardMeta(activeId, activeMeta ? activeMeta.name : "Board 1");
      if (!localStorage.getItem(boardStorageKey(activeId))) {
        localStorage.setItem(boardStorageKey(activeId), JSON.stringify(serializeCurrentBoard()));
      }
      renderBoardList();
      return true;
    }
  } catch (e) {}
  return false;
}

// ── Init ──
export function initUI() {
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  setupToolbar();
  setupTopbar();
  setupBottombar();
  setupOptions();
  buildPopupSwatches();
  setupPopupHandlers();
  setupContextMenu();
  setupPointerEvents();
  setupKeyboard();
  applySettingsToUI();
  updateCursor();
  updateZoomDisplay();

  if (loadFromStorage()) {
    refreshImgCache();
    updateZoomDisplay();
    showToast("Restored previous session");
  } else {
    cam.x = window.innerWidth / 2;
    cam.y = window.innerHeight / 2;
  }

  setInterval(saveToStorage, 3000);
  requestRender();
}

/**
 * User-interface — toolbar, topbar, bottombar, popup, keyboard, pointer, persistence.
 */

import { cam, objects, canvas, dpr, state } from "./state.js";
import {
  COLORS,
  STICKY_COLORS,
  STROKE_WIDTHS,
  KEY_MAP,
  DEFAULT_SETTINGS,
  CURSOR_MAP,
  STORAGE_KEY,
  ROTATE_HANDLE_DIST,
  ROTATE_HANDLE_RADIUS,
} from "./constants.js";
import { s2w, w2s, showToast, getArrowHeadMode } from "./utils.js";
import { requestRender } from "./canvas.js";
import { getBounds, getRotatedBounds, hitTest } from "./objects.js";
import { getSpans } from "./editor.js";
import {
  saveState,
  undo,
  redo,
  findObj,
  refreshImgCache,
  delSel,
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
  startStickyCreate,
  startEditExisting,
  finishEditing,
  enterGroupEditForObject,
  exitGroupEdit,
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
  applyAccentVars();
  var accentInput = document.getElementById("accentColor");
  var canvasInput = document.getElementById("canvasColor");
  var gridInput = document.getElementById("gridColor");
  var patternInput = document.getElementById("bgPattern");
  if (accentInput) accentInput.value = s.accentColor;
  if (canvasInput) canvasInput.value = s.canvasColor;
  if (gridInput) gridInput.value = s.gridColor;
  if (patternInput) patternInput.value = s.bgPattern;
  updateShortcutLabels();
  updateKeybindList();
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
    var ph = 140;
    var top = er.top - ph - 8;
    if (top < 10) top = er.bottom + 10;
    var left = er.left;
    if (left + 380 > window.innerWidth) left = window.innerWidth - 390;
    if (left < 10) left = 10;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.classList.add("visible");
    document.getElementById("popTextRow").style.display = "flex";
    document.getElementById("popColorRow").style.display = "flex";
    document.getElementById("popStickyRow").style.display = "none";
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
    return;
  }
  if (isStickyEdit) {
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
      var popupClearance = ROTATE_HANDLE_DIST + ROTATE_HANDLE_RADIUS + 10;
      var sp = w2s(abx, aby),
        sh2 = (abb - aby) * cam.zoom,
        ph3 = 80;
      var top3 = sp.y - ph3 - popupClearance;
      if (top3 < 10) top3 = sp.y + sh2 + 10;
      var left3 = sp.x;
      if (left3 + 380 > window.innerWidth) left3 = window.innerWidth - 390;
      if (left3 < 10) left3 = 10;
      pop.style.left = left3 + "px";
      pop.style.top = top3 + "px";
    }
    pop.classList.add("visible");
    document.getElementById("popTextRow").style.display = "none";
    document.getElementById("popColorRow").style.display = "flex";
    document.getElementById("popStickyRow").style.display = "none";
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
    // Show opacity of primary selected object
    var primaryObj = findObj(s.selectedId);
    document.getElementById("popOpacity").value =
      primaryObj && primaryObj.opacity != null ? primaryObj.opacity : 1;
    document.getElementById("popOpacityVal").textContent =
      Math.round(
        (primaryObj && primaryObj.opacity != null ? primaryObj.opacity : 1) *
          100,
      ) + "%";
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
  // Don't reposition popup while a dropdown slider is open
  var dropdownOpen = document.querySelector(".pop-dropdown.open");
  if (!dropdownOpen) {
    var popupClearance2 = ROTATE_HANDLE_DIST + ROTATE_HANDLE_RADIUS + 10;
    var sp = w2s(b.x, b.y),
      sh = b.h * cam.zoom,
      ph2 = 140;
    var top2 = sp.y - ph2 - popupClearance2;
    if (top2 < 10) top2 = sp.y + sh + 10;
    var left2 = sp.x;
    if (left2 + 380 > window.innerWidth) left2 = window.innerWidth - 390;
    if (left2 < 10) left2 = 10;
    pop.style.left = left2 + "px";
    pop.style.top = top2 + "px";
  }
  pop.classList.add("visible");
  document.getElementById("popTextRow").style.display =
    selObj.type === "text" ? "flex" : "none";
  document.getElementById("popColorRow").style.display =
    ["path", "line", "arrow", "rect", "ellipse", "text"].indexOf(selObj.type) >=
    0
      ? "flex"
      : "none";
  document.getElementById("popStickyRow").style.display =
    selObj.type === "sticky" ? "flex" : "none";
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
    if (!isOpen) dd.classList.add("open");
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
    delSel();
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
    sw.addEventListener("click", function () {
      s.curColor = c;
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
  state.settings.accentColor = DEFAULT_SETTINGS.accentColor;
  state.settings.canvasColor = DEFAULT_SETTINGS.canvasColor;
  state.settings.gridColor = DEFAULT_SETTINGS.gridColor;
  state.settings.bgPattern = DEFAULT_SETTINGS.bgPattern;
  state.settings.keyMap = Object.assign({}, DEFAULT_SETTINGS.keyMap);
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
  document.getElementById("resetOptions").addEventListener("click", resetSettings);
  updateKeybindList();
}

// ── Pointer events ──
function setupPointerEvents() {
  var s = state;
  canvas.addEventListener("pointerdown", onPointerDown);
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
    if (s.isEditing) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        insertImg(
          items[i].getAsFile(),
          s2w(window.innerWidth / 2, window.innerHeight / 2),
        );
        break;
      }
    }
  });
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
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
    return;
  }
  if (e.button !== 0) return;
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
      startTextCreate(wp);
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
  if (s.curTool === "eraser") {
    var ec = document.getElementById("eraserCursor");
    ec.style.display = "block";
    ec.style.left = e.clientX + "px";
    ec.style.top = e.clientY + "px";
    ec.style.width = "20px";
    ec.style.height = "20px";
  }
  if (s.isPan) {
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
    handleDrag(wp);
  }
}

function onPointerUp(e) {
  var s = state;
  if (s.isPan) {
    s.isPan = false;
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
    else if (["line", "arrow", "rect", "ellipse"].indexOf(s.curTool) >= 0)
      finishShape();
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
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      (s.selectedId !== null || s.selectedIds.length > 0)
    ) {
      e.preventDefault();
      delSel();
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        objects: objects,
        nid: state.nid,
        cam: { x: cam.x, y: cam.y, zoom: cam.zoom },
        settings: state.settings,
      }),
    );
  } catch (e) {}
}

function mergeSettings(saved) {
  var next = {
    accentColor: DEFAULT_SETTINGS.accentColor,
    canvasColor: DEFAULT_SETTINGS.canvasColor,
    gridColor: DEFAULT_SETTINGS.gridColor,
    bgPattern: DEFAULT_SETTINGS.bgPattern,
    keyMap: Object.assign({}, DEFAULT_SETTINGS.keyMap),
  };
  if (saved && typeof saved === "object") {
    ["accentColor", "canvasColor", "gridColor"].forEach(function (key) {
      if (typeof saved[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(saved[key])) next[key] = saved[key];
    });
    if (["dots", "grid", "none"].indexOf(saved.bgPattern) >= 0) next.bgPattern = saved.bgPattern;
    if (saved.keyMap && typeof saved.keyMap === "object") {
      next.keyMap = {};
      Object.keys(saved.keyMap).forEach(function (code) {
        var tool = saved.keyMap[code];
        if (TOOL_META.some(function (meta) { return meta.tool === tool; })) next.keyMap[code] = tool;
      });
    }
  }
  state.settings = next;
  syncKeyMap();
}

export function loadFromStorage() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (data && Array.isArray(data.objects)) {
      objects.length = 0;
      data.objects.forEach(function (o) {
        objects.push(o);
      });
      if (data.nid) state.nid = data.nid;
      if (data.cam) {
        cam.x = data.cam.x;
        cam.y = data.cam.y;
        cam.zoom = data.cam.zoom;
      }
      mergeSettings(data.settings);
      applySettingsToUI();
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

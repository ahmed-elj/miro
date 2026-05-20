/**
 * Comment bubbles and thread panel.
 */

import { cam, state } from './state.js';
import { w2s } from './utils.js';

export const COMMENT_SIZE = 38;

var panelApi = {
  saveState: function() {},
  requestRender: function() {},
  findObj: function() { return null; },
  saveToStorage: function() {},
};

export function createCommentBubble(id, wp) {
  var size = COMMENT_SIZE / cam.zoom;
  return {
    type: 'comment',
    id: id,
    x: wp.x - size / 2,
    y: wp.y - size / 2,
    w: size,
    h: size,
    color: state.settings.accentColor || '#10b981',
    fillColor: '#ffffff',
    comments: [],
    opacity: 1,
    rotation: 0,
  };
}

export function getCommentBounds(obj) {
  return { x: obj.x, y: obj.y, w: obj.w || COMMENT_SIZE / cam.zoom, h: obj.h || COMMENT_SIZE / cam.zoom };
}

export function hitComment(obj, wx, wy, pad) {
  var b = getCommentBounds(obj);
  var cx = b.x + b.w / 2;
  var cy = b.y + b.h / 2;
  var r = Math.max(b.w, b.h) / 2 + (pad || 0);
  return Math.hypot(wx - cx, wy - cy) <= r;
}

export function drawCommentBubble(ctx, obj) {
  var b = getCommentBounds(obj);
  var cx = b.x + b.w / 2;
  var cy = b.y + b.h / 2;
  var r = Math.max(4 / cam.zoom, Math.min(b.w, b.h) / 2);
  var accent = obj.color || state.settings.accentColor || '#10b981';
  var count = Array.isArray(obj.comments) ? obj.comments.length : 0;
  ctx.save();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
  ctx.shadowBlur = 5 / cam.zoom;
  ctx.shadowOffsetY = 2 / cam.zoom;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.6 / cam.zoom, r * 0.075);
  ctx.stroke();

  var iconW = r * 0.72;
  var iconH = r * 0.52;
  var ix = cx - iconW / 2;
  var iy = cy - iconH / 2 - r * 0.02;
  var ir = Math.max(3 / cam.zoom, r * 0.16);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1.7 / cam.zoom, r * 0.085);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ix + ir, iy);
  ctx.lineTo(ix + iconW - ir, iy);
  ctx.quadraticCurveTo(ix + iconW, iy, ix + iconW, iy + ir);
  ctx.lineTo(ix + iconW, iy + iconH - ir);
  ctx.quadraticCurveTo(ix + iconW, iy + iconH, ix + iconW - ir, iy + iconH);
  ctx.lineTo(ix + iconW * 0.36, iy + iconH);
  ctx.lineTo(ix + iconW * 0.14, iy + iconH + r * 0.22);
  ctx.lineTo(ix + iconW * 0.2, iy + iconH * 0.86);
  ctx.quadraticCurveTo(ix, iy + iconH * 0.8, ix, iy + iconH - ir);
  ctx.lineTo(ix, iy + ir);
  ctx.quadraticCurveTo(ix, iy, ix + ir, iy);
  ctx.stroke();

  if (count > 0) {
    var badgeR = Math.max(7 / cam.zoom, r * 0.31);
    var bx = cx + r * 0.62;
    var by = cy - r * 0.62;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.4 / cam.zoom, badgeR * 0.16);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = '700 ' + Math.max(8 / cam.zoom, badgeR * 0.95) + 'px Open Sans';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.min(count, 99)), bx, by + 0.2 / cam.zoom);
  }
  ctx.restore();
}

export function setupCommentPanel(api) {
  panelApi = Object.assign({}, panelApi, api || {});
  var panel = document.getElementById('commentPanel');
  var close = document.getElementById('commentPanelClose');
  var form = document.getElementById('commentForm');
  var input = document.getElementById('commentInput');
  if (!panel || !form || !input) return;
  panel.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  panel.addEventListener('click', function(e) { e.stopPropagation(); });
  close.addEventListener('click', closeCommentPanel);
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var obj = panelApi.findObj(state.commentPanelId);
    if (!obj || obj.type !== 'comment' || obj.locked) return;
    var text = input.value.trim();
    if (!text) return;
    panelApi.saveState();
    if (!Array.isArray(obj.comments)) obj.comments = [];
    obj.comments.push({
      id: 'com-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      text: text,
      tags: extractTags(text),
      createdAt: Date.now(),
    });
    input.value = '';
    renderCommentPanel();
    panelApi.requestRender();
    panelApi.saveToStorage();
  });
  input.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
}

export function openCommentPanel(obj) {
  if (!obj || obj.type !== 'comment') return;
  state.commentPanelId = obj.id;
  renderCommentPanel();
}

export function closeCommentPanel() {
  state.commentPanelId = null;
  var panel = document.getElementById('commentPanel');
  if (panel) panel.classList.remove('open');
}

export function syncCommentPanelPosition() {
  if (state.commentPanelId == null) return;
  var obj = panelApi.findObj(state.commentPanelId);
  if (!obj || obj.type !== 'comment') {
    closeCommentPanel();
    return;
  }
  positionCommentPanel(obj);
}

function renderCommentPanel() {
  var panel = document.getElementById('commentPanel');
  var list = document.getElementById('commentList');
  var meta = document.getElementById('commentPanelMeta');
  if (!panel || !list || !meta) return;
  var obj = panelApi.findObj(state.commentPanelId);
  if (!obj || obj.type !== 'comment') {
    closeCommentPanel();
    return;
  }
  if (!Array.isArray(obj.comments)) obj.comments = [];
  list.innerHTML = '';
  if (!obj.comments.length) {
    var empty = document.createElement('div');
    empty.className = 'comment-empty';
    empty.textContent = 'No comments yet';
    list.appendChild(empty);
  } else {
    obj.comments.slice().reverse().forEach(function(comment) {
      list.appendChild(renderCommentItem(obj, comment));
    });
  }
  meta.textContent = obj.comments.length + (obj.comments.length === 1 ? ' comment' : ' comments');
  panel.classList.add('open');
  positionCommentPanel(obj);
  var input = document.getElementById('commentInput');
  if (input) setTimeout(function() { input.focus(); }, 0);
}

function renderCommentItem(obj, comment) {
  var item = document.createElement('article');
  item.className = 'comment-item';
  var head = document.createElement('div');
  head.className = 'comment-item-head';
  var date = document.createElement('time');
  date.textContent = formatCommentDate(comment.createdAt);
  head.appendChild(date);
  var del = document.createElement('button');
  del.type = 'button';
  del.title = 'Delete comment';
  del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
  del.addEventListener('click', function(e) {
    e.stopPropagation();
    if (obj.locked) return;
    panelApi.saveState();
    obj.comments = (obj.comments || []).filter(function(item2) { return item2.id !== comment.id; });
    renderCommentPanel();
    panelApi.requestRender();
    panelApi.saveToStorage();
  });
  head.appendChild(del);
  item.appendChild(head);
  var body = document.createElement('div');
  body.className = 'comment-text';
  body.textContent = comment.text || '';
  item.appendChild(body);
  var tags = Array.isArray(comment.tags) && comment.tags.length ? comment.tags : extractTags(comment.text || '');
  if (tags.length) {
    var tagRow = document.createElement('div');
    tagRow.className = 'comment-tags';
    tags.forEach(function(tag) {
      var chip = document.createElement('span');
      chip.textContent = tag;
      tagRow.appendChild(chip);
    });
    item.appendChild(tagRow);
  }
  return item;
}

function positionCommentPanel(obj) {
  var panel = document.getElementById('commentPanel');
  if (!panel) return;
  var b = getCommentBounds(obj);
  var p = w2s(b.x + b.w, b.y + b.h / 2);
  var margin = 12;
  var width = panel.offsetWidth || 320;
  var height = panel.offsetHeight || 360;
  var left = p.x + margin;
  if (left + width > window.innerWidth - margin) left = w2s(b.x, b.y).x - width - margin;
  left = Math.max(margin, Math.min(window.innerWidth - width - margin, left));
  var top = p.y - height / 2;
  top = Math.max(margin, Math.min(window.innerHeight - height - margin, top));
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

function extractTags(text) {
  var seen = {};
  var tags = [];
  String(text || '').replace(/(^|\s)#([A-Za-z0-9_-]+)/g, function(_, prefix, tag) {
    var normalized = '#' + tag;
    var key = normalized.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      tags.push(normalized);
    }
    return _;
  });
  return tags;
}

function formatCommentDate(ts) {
  var date = new Date(Number.isFinite(ts) ? ts : Date.now());
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

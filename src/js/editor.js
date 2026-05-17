/**
 * Text / sticky note editing — span parsing, HTML <-> spans conversion.
 */

import { rgbToHex } from './utils.js';

export function getSpans(obj) {
  if (obj.spans) return obj.spans;
  return [{
    text: obj.text || '',
    bold: obj.fontWeight === '700',
    italic: obj.fontStyle === 'italic',
    underline: !!obj.underline,
    color: obj.color || '#e4e4e8',
  }];
}

export function spansToHtml(spans) {
  var parts = [];
  spans.forEach(function(s) {
    var lines = s.text.split('\n');
    lines.forEach(function(line, li) {
      if (li > 0) parts.push('<br>');
      if (!line) return;
      var h = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/-/g, '&#8288;-&#8288;');
      if (s.italic) h = '<i>' + h + '</i>';
      if (s.bold) h = '<b>' + h + '</b>';
      if (s.underline) h = '<u>' + h + '</u>';
      if (s.color && s.color !== '#e4e4e8') h = '<span style="color:' + s.color + '">' + h + '</span>';
      parts.push(h);
    });
  });
  return parts.join('') || '<br>';
}

export function parseHtmlSpans(el, defColor) {
  var spans = [];
  function walk(node, b, it, un, col) {
    if (node.nodeType === Node.TEXT_NODE) {
      var t = node.textContent.replace(/\u2060/g, '');
      if (t) spans.push({ text: t, bold: b, italic: it, underline: un, color: col });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      var tag = node.tagName.toLowerCase();
      var nb = b, ni = it, nu = un, nc = col;
      if (tag === 'b' || tag === 'strong') nb = true;
      if (tag === 'i' || tag === 'em') ni = true;
      if (tag === 'u') nu = true;
      if (tag === 'font') {
        // <font color="..."> is produced by document.execCommand('foreColor')
        if (node.getAttribute('color')) nc = rgbToHex(node.getAttribute('color'));
      }
      if (tag === 'br') { spans.push({ text: '\n', bold: b, italic: it, underline: un, color: col }); return; }
      if ((tag === 'div' || tag === 'p') && spans.length > 0) {
        var last = spans[spans.length - 1];
        if (!last.text.endsWith('\n')) spans.push({ text: '\n', bold: b, italic: it, underline: un, color: col });
      }
      if (node.style) {
        if (node.style.color) nc = rgbToHex(node.style.color);
        if (node.style.fontWeight === '700' || node.style.fontWeight === 'bold') nb = true;
        if (node.style.fontStyle === 'italic') ni = true;
        if (node.style.textDecoration && node.style.textDecoration.includes('underline')) nu = true;
      }
      for (var ci = 0; ci < node.childNodes.length; ci++) {
        walk(node.childNodes[ci], nb, ni, nu, nc);
      }
    }
  }
  for (var ci2 = 0; ci2 < el.childNodes.length; ci2++) {
    walk(el.childNodes[ci2], false, false, false, defColor);
  }
  var merged = [];
  spans.forEach(function(s) {
    if (merged.length > 0) {
      var p = merged[merged.length - 1];
      if (p.bold === s.bold && p.italic === s.italic && p.underline === s.underline && p.color === s.color) {
        p.text += s.text;
        return;
      }
    }
    merged.push({ text: s.text, bold: s.bold, italic: s.italic, underline: s.underline, color: s.color });
  });
  return merged;
}

function linePrefix(mode, idx) {
  return mode === 'number' ? (idx + 1) + '. ' : '• ';
}

function stripListPrefix(text) {
  return text.replace(/^(\s*)(?:[•\-*]\s+|\d+[.)]\s+)/, '$1');
}

export function listifyPlainText(text, mode) {
  var idx = 0;
  return text.split('\n').map(function(line) {
    if (!line.trim()) return line;
    var indent = (line.match(/^\s*/) || [''])[0];
    var body = stripListPrefix(line).slice(indent.length);
    return indent + linePrefix(mode, idx++) + body;
  }).join('\n');
}

export function listifySpans(spans, mode) {
  var plain = spans.map(function(sp) { return sp.text; }).join('');
  var listed = listifyPlainText(plain, mode);
  var base = spans[0] || {};
  return [{
    text: listed,
    bold: !!base.bold,
    italic: !!base.italic,
    underline: !!base.underline,
    color: base.color || '#e4e4e8',
  }];
}

import { getSpans } from './editor.js';

export function textFont(span, baseWeight, size, family) {
  var w = span.bold ? '700' : String(baseWeight || 400);
  return (span.italic ? 'italic ' : 'normal ') + w + ' ' + size + 'px ' + family;
}

function splitSpanLines(spans) {
  var lines = [[]];
  spans.forEach(function(span) {
    var parts = span.text.split('\n');
    parts.forEach(function(part, idx) {
      if (idx > 0) lines.push([]);
      if (part) {
        lines[lines.length - 1].push({
          text: part,
          bold: span.bold,
          italic: span.italic,
          underline: span.underline,
          color: span.color,
        });
      }
    });
  });
  return lines;
}

function measureParts(ctx, parts, baseWeight, size, family) {
  var width = 0;
  parts.forEach(function(part) {
    ctx.font = textFont(part, baseWeight, size, family);
    width += ctx.measureText(part.text).width;
  });
  return width;
}

function lineIndent(parts) {
  if (!parts.length) return '';
  var match = (parts[0].text || '').match(/^\s+/);
  return match ? match[0] : '';
}

function pushTokenLine(out, line, indent, ctx, baseWeight, size, family, maxWidth) {
  if (!line.length) {
    out.push([]);
    return [];
  }
  out.push(line);
  if (!indent) return [];
  return [{
    text: indent,
    bold: false,
    italic: false,
    underline: false,
    color: line[0].color,
  }];
}

function wrapParts(ctx, parts, baseWeight, size, family, maxWidth) {
  if (!maxWidth || maxWidth <= 0) return [parts];
  var out = [];
  var cur = [];
  var indent = lineIndent(parts);
  parts.forEach(function(part) {
    var tokens = part.text.split(/(\s+)/).filter(function(token) { return token.length > 0; });
    tokens.forEach(function(token) {
      var next = cur.concat([{
        text: token,
        bold: part.bold,
        italic: part.italic,
        underline: part.underline,
        color: part.color,
      }]);
      if (cur.length && measureParts(ctx, next, baseWeight, size, family) > maxWidth) {
        cur = pushTokenLine(out, cur, indent, ctx, baseWeight, size, family, maxWidth);
        if (/^\s+$/.test(token)) return;
      }
      cur.push({
        text: token,
        bold: part.bold,
        italic: part.italic,
        underline: part.underline,
        color: part.color,
      });
    });
  });
  out.push(cur);
  return out;
}

export function getTextLayout(ctx, obj, family) {
  var spans = getSpans(obj);
  var size = Math.max(1, obj.fontSize);
  var baseWeight = obj.fontWeight || 400;
  var scaleX = obj.scaleX || 1;
  var scaleY = obj.scaleY || 1;
  var sc = obj.fontSize / size;
  var textBoxWidth = obj.wrapWidth || obj.boxW;
  var wrapWidth = obj.wrapText && textBoxWidth ? textBoxWidth / Math.max(0.001, sc * scaleX) : 0;
  var rawLines = splitSpanLines(spans);
  var lines = [];
  rawLines.forEach(function(line) {
    wrapParts(ctx, line, baseWeight, size, family, wrapWidth).forEach(function(wrapped) {
      lines.push(wrapped);
    });
  });
  if (!lines.length) lines = [[]];
  var maxW = 0;
  lines.forEach(function(line) {
    maxW = Math.max(maxW, measureParts(ctx, line, baseWeight, size, family));
  });
  var lh = size * 1.4;
  return {
    lines: lines,
    maxW: maxW,
    lineHeight: lh,
    totalHeight: lines.length * lh,
    size: size,
    scale: sc,
    scaleX: scaleX,
    scaleY: scaleY,
    baseWeight: baseWeight,
    family: family,
  };
}

export function measureTextLine(ctx, line, layout) {
  return measureParts(ctx, line, layout.baseWeight, layout.size, layout.family);
}

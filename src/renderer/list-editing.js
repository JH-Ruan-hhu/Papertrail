'use strict';

const LIST_PREFIX = /^(?<indent>[ \t]*)(?<marker>(?:\d+[\.、)]|[a-zA-Z][.)]|[-*]))(?<gap>[ \t]+|$)/;

function parseListPrefix(line) {
  const match = String(line || '').match(LIST_PREFIX);
  if (!match) return null;
  const marker = match.groups.marker;
  const indent = match.groups.indent.replace(/\t/g, '  ');
  const number = /^\d/.test(marker) ? Number.parseInt(marker, 10) : null;
  const letter = /^[a-zA-Z]/.test(marker) ? marker.charCodeAt(0) : null;
  return {
    indent,
    level: Math.floor(indent.length / 2),
    marker,
    number,
    letter,
    bullet: marker === '-' || marker === '*',
    contentStart: match[0].length,
    delimiter: marker.slice(-1)
  };
}

function letterAt(value, uppercase = false) {
  const normalized = Math.max(1, Number(value) || 1);
  let result = '';
  let current = normalized;
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode((uppercase ? 65 : 97) + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function markerForLevel(level, source, sequence = 1) {
  if (source?.bullet) return source.marker;
  if (level <= 0) {
    const delimiter = source?.letter != null ? '.' : source?.delimiter === '、' ? '、' : source?.delimiter === ')' ? ')' : '.';
    return `${Math.max(1, Number(sequence) || 1)}${delimiter}`;
  }
  if (level === 1) return `${letterAt(sequence)})`;
  if (level === 2) return `${letterAt(sequence, true)})`;
  return `${Math.max(1, Number(sequence) || 1)}${source?.delimiter === '、' ? '、' : '.'}`;
}

function nextMarker(prefix) {
  if (prefix.bullet) return prefix.marker;
  if (prefix.number != null) return markerForLevel(prefix.level, prefix, prefix.number + 1);
  if (prefix.letter != null) {
    const sequence = prefix.letter - (prefix.letter >= 65 && prefix.letter <= 90 ? 64 : 96) + 1;
    return `${letterAt(sequence, prefix.letter >= 65 && prefix.letter <= 90)}${prefix.delimiter === '.' ? '.' : ')'}`;
  }
  return prefix.marker;
}

function lineBounds(value, start, end = start) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = value.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = value.length;
  return { lineStart, lineEnd };
}

function replaceRange(textarea, start, end, replacement, selectionStart, selectionEnd) {
  const value = textarea.value;
  textarea.value = value.slice(0, start) + replacement + value.slice(end);
  textarea.setSelectionRange(selectionStart, selectionEnd);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleEnter(textarea) {
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (start !== end) return false;
  const bounds = lineBounds(value, start);
  const line = value.slice(bounds.lineStart, bounds.lineEnd);
  const prefix = parseListPrefix(line);
  if (!prefix) return false;
  const body = line.slice(prefix.contentStart).trim();
  if (!body) {
    replaceRange(textarea, bounds.lineStart, bounds.lineEnd, prefix.indent, bounds.lineStart + prefix.indent.length, bounds.lineStart + prefix.indent.length);
    return true;
  }
  const insertion = `\n${prefix.indent}${nextMarker(prefix)} `;
  replaceRange(textarea, start, end, insertion, start + insertion.length, start + insertion.length);
  return true;
}

function transformListLines(text, increase) {
  return text.split('\n').map((line) => {
    if (!line.trim()) return line;
    const prefix = parseListPrefix(line);
    if (!prefix) return increase ? `  ${line}` : line.replace(/^(?:  |\t)/, '');
    const level = Math.max(0, prefix.level + (increase ? 1 : -1));
    const content = line.slice(prefix.contentStart);
    const sequence = prefix.number != null
      ? prefix.number
      : prefix.letter != null
        ? prefix.letter - (prefix.letter >= 65 && prefix.letter <= 90 ? 64 : 96)
        : 1;
    return `${'  '.repeat(level)}${markerForLevel(level, prefix, sequence)}${content.startsWith(' ') || content.startsWith('\t') ? '' : ' '}${content.replace(/^[ \t]+/, ' ')}`;
  }).join('\n');
}

function handleIndent(textarea, increase) {
  const value = textarea.value;
  const selectionStart = textarea.selectionStart;
  const selectionEnd = textarea.selectionEnd;
  const bounds = lineBounds(value, selectionStart, selectionEnd);
  const nextEnd = value.indexOf('\n', selectionEnd);
  const end = nextEnd < 0 ? value.length : nextEnd;
  const replacement = transformListLines(value.slice(bounds.lineStart, end), increase);
  const delta = replacement.length - (end - bounds.lineStart);
  replaceRange(textarea, bounds.lineStart, end, replacement, bounds.lineStart, Math.max(bounds.lineStart, selectionEnd + delta));
  return true;
}

function applyListEditing(textarea, event) {
  if (!textarea || event?.isComposing || event?.keyCode === 229) return false;
  if (event.key === 'Enter') return handleEnter(textarea);
  if (event.key === 'Tab') return handleIndent(textarea, !event.shiftKey);
  return false;
}

const listEditingApi = { applyListEditing, parseListPrefix, markerForLevel, nextMarker };
if (typeof window !== 'undefined') window.YanjiListEditing = listEditingApi;
if (typeof module !== 'undefined' && module.exports) module.exports = listEditingApi;

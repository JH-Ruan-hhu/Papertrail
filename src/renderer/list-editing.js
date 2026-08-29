'use strict';

const LIST_PREFIX = /^(?<indent>[ \t\u00a0]*)(?<marker>(?:\d+[\.、)]|[a-zA-Z][.)]|[-*]))(?<gap>[ \t\u00a0]+|$)/;

function parseListPrefix(line) {
  const match = String(line || '').match(LIST_PREFIX);
  if (!match) return null;
  const marker = match.groups.marker;
  const indent = match.groups.indent.replace(/\t|\u00a0/g, '  ');
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

function continuationForLine(line) {
  const prefix = parseListPrefix(line);
  if (!prefix) return null;
  const body = String(line || '').slice(prefix.contentStart).trim();
  return body
    ? { insertion: `\n${prefix.indent}${nextMarker(prefix)} `, exitList: false }
    : { insertion: prefix.indent, exitList: true };
}

function insertContentEditableText(editor, text) {
  const selection = editor?.ownerDocument?.defaultView?.getSelection?.();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  range.deleteContents();
  const node = editor.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function contentEditableContext(editor) {
  const selection = editor?.ownerDocument?.defaultView?.getSelection?.();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const caret = selection.getRangeAt(0).cloneRange();
  if (!editor.contains(caret.commonAncestorContainer)) return null;
  if (caret.endContainer.nodeType === 1 && caret.endOffset > 0) {
    let node = caret.endContainer.childNodes[caret.endOffset - 1];
    while (node?.lastChild) node = node.lastChild;
    if (node?.nodeType === 3) {
      caret.setStart(node, node.nodeValue.length);
      caret.collapse(true);
    }
  }
  const anchorElement = caret.endContainer.nodeType === 1 ? caret.endContainer : caret.endContainer.parentElement;
  const listItem = anchorElement?.closest?.('li');
  const block = anchorElement?.closest?.('p, div, li');
  let line = '';
  if (block && block !== editor && editor.contains(block)) {
    const beforeBlockCaret = caret.cloneRange();
    beforeBlockCaret.selectNodeContents(block);
    beforeBlockCaret.setEnd(caret.endContainer, caret.endOffset);
    line = beforeBlockCaret.toString().split('\n').at(-1) || '';
  } else {
    const before = caret.cloneRange();
    before.selectNodeContents(editor);
    before.setEnd(caret.endContainer, caret.endOffset);
    const fragment = before.cloneContents();
    const read = (node) => {
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1 && node.nodeType !== 11) return '';
      if (node.nodeName === 'BR') return '\n';
      const text = [...node.childNodes].map(read).join('');
      return ['DIV', 'P', 'LI'].includes(node.nodeName) ? `${text}\n` : text;
    };
    line = read(fragment).replace(/\n$/, '').split('\n').at(-1) || '';
  }
  return { block, caret, line, listItem, selection };
}

function replaceContentEditablePrefix(editor, context, prefix, replacement) {
  const node = context?.caret?.endContainer;
  if (node?.nodeType !== 3 || !editor.contains(node)) return false;
  const offset = context.caret.endOffset;
  const lineStart = node.nodeValue.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const beforeCaret = node.nodeValue.slice(lineStart, offset);
  if (!beforeCaret.startsWith(context.line.slice(0, prefix.contentStart))) return false;
  node.replaceData(lineStart, prefix.contentStart, replacement);
  const nextOffset = Math.max(lineStart + replacement.length, offset + replacement.length - prefix.contentStart);
  const range = editor.ownerDocument.createRange();
  range.setStart(node, Math.min(nextOffset, node.nodeValue.length));
  range.collapse(true);
  context.selection.removeAllRanges();
  context.selection.addRange(range);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function continueContentEditableList(editor, insertion) {
  const document = editor.ownerDocument;
  if (typeof document.execCommand !== 'function') return false;
  const openedParagraph = document.execCommand('insertParagraph', false, null);
  if (!openedParagraph) return false;
  document.execCommand('insertText', false, insertion);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function applyContentEditableListEditing(editor, event) {
  if (!editor || event?.isComposing || event?.keyCode === 229 || !['Enter', 'Tab'].includes(event?.key)) return false;
  const context = contentEditableContext(editor);
  if (!context) return false;

  // Native rich lists already know how to continue. Tab needs an explicit
  // indent command because Chromium otherwise moves focus out of the editor.
  if (context.listItem) {
    if (event.key === 'Enter') return false;
    const command = event.shiftKey ? 'outdent' : 'indent';
    const changed = editor.ownerDocument.execCommand?.(command, false, null) === true;
    if (changed) editor.dispatchEvent(new Event('input', { bubbles: true }));
    return changed;
  }

  const prefix = parseListPrefix(context.line);
  if (!prefix) {
    if (event.key !== 'Tab' || event.shiftKey) return false;
    return insertContentEditableText(editor, '  ');
  }

  if (event.key === 'Enter') {
    const body = context.line.slice(prefix.contentStart).trim();
    if (!body) return replaceContentEditablePrefix(editor, context, prefix, prefix.indent);
    return continueContentEditableList(editor, `${prefix.indent}${nextMarker(prefix)} `);
  }

  const level = Math.max(0, prefix.level + (event.shiftKey ? -1 : 1));
  const sequence = prefix.number != null
    ? prefix.number
    : prefix.letter != null
      ? prefix.letter - (prefix.letter >= 65 && prefix.letter <= 90 ? 64 : 96)
      : 1;
  return replaceContentEditablePrefix(editor, context, prefix, `${'  '.repeat(level)}${markerForLevel(level, prefix, sequence)} `);
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
    return `${'  '.repeat(level)}${markerForLevel(level, prefix, sequence)}${/^[ \t\u00a0]/.test(content) ? '' : ' '}${content.replace(/^[ \t\u00a0]+/, ' ')}`;
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

const listEditingApi = { applyContentEditableListEditing, applyListEditing, continuationForLine, parseListPrefix, markerForLevel, nextMarker };
if (typeof window !== 'undefined') window.YanjiListEditing = listEditingApi;
if (typeof module !== 'undefined' && module.exports) module.exports = listEditingApi;

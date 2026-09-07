'use strict';

const api = window.paperTrail;
const editor = document.getElementById('captureEditor');
const result = document.getElementById('parseResult');
const highlights = document.getElementById('captureHighlights');
const tabs = [...document.querySelectorAll('[data-mode]')];
const kinds = [...document.querySelectorAll('input[name="captureItemKind"]')];
const kindPicker = document.getElementById('captureKinds');
let mode = 'item';
let itemKind = 'task';
let parseSequence = 0;
let parsedSchedule = null;
let parsedTodo = null;
let composing = false;
let parseTimer = null;

function updateResult(message, state = 'neutral') {
  result.textContent = message;
  result.classList.toggle('error', state === 'error');
  document.body.dataset.captureState = state;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function plainText() {
  return editor.value.replace(/\u00a0/g, ' ');
}

function captureDirective(text = plainText()) {
  const prefix = text.match(/^\s*[~～]\s*/)?.[0] || '';
  return { content: text.slice(prefix.length), repeat: prefix ? 'daily' : null, prefixLength: prefix.length };
}

function directiveMatches(directive, matches = []) {
  const shifted = matches.map((match) => ({ ...match, start: match.start + directive.prefixLength, end: match.end + directive.prefixLength }));
  return directive.prefixLength ? [{ start: 0, end: directive.prefixLength, text: '~' }, ...shifted] : shifted;
}

function formatWhen(schedule) {
  if (!schedule?.valid) return '自动识别时间；#1 红、#2 黄、#3 绿，默认绿色';
  if (schedule.schedules?.length > 1) {
    const times = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `已识别 ${schedule.schedules.length} 条日程 · ${schedule.schedules.map((item) => `${times.format(new Date(item.startAt))} ${item.title}`).join(' · ')}`;
  }
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(start);
  const times = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const priority = { high: '最高优先级', medium: '重要', low: '普通' }[schedule.priority];
  return `${date} · ${times.format(start)}–${times.format(end)} · ${priority}`;
}

function formatTodo(todo) {
  if (!todo?.valid) return todo?.warning || '输入内容后自动识别截止日期；没有具体时间会放到今天';
  if (!todo.dueAt) return `今天 · 无具体时间 · ${todo.title}`;
  const due = new Date(todo.dueAt);
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(due);
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(due);
  return `${date} · ${time} 截止 · ${todo.priority === 'high' ? '最高优先级' : todo.priority === 'medium' ? '重要' : '普通'}${todo.warning ? ` · ${todo.warning}` : ''}`;
}

function placeCaretAtEnd() {
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

function renderHighlights(text, matches = []) {
  const ranges = matches
    .filter((match) => Number.isInteger(match.start) && Number.isInteger(match.end) && match.end > match.start)
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce((merged, match) => {
      const previous = merged.at(-1);
      if (previous && match.start <= previous.end) previous.end = Math.max(previous.end, match.end);
      else merged.push({ start: match.start, end: match.end });
      return merged;
    }, []);
  let cursor = 0;
  let html = '';
  for (const match of ranges) {
    html += escapeHtml(text.slice(cursor, match.start));
    html += `<mark>${escapeHtml(text.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  }
  html += escapeHtml(text.slice(cursor));
  highlights.innerHTML = `${html}${text.endsWith('\n') ? '<br>' : ''}`;
}

function syncScroll() {
  highlights.scrollTop = editor.scrollTop;
  highlights.scrollLeft = editor.scrollLeft;
}

function activeMatches() {
  if (mode !== 'item') return [];
  if (itemKind === 'event') return parsedSchedule?.matches || [];
  return parsedTodo?.meta?.explicitTime && parsedSchedule?.valid ? parsedSchedule.matches : parsedTodo?.matches || [];
}

function queueParse(delay = 120) {
  clearTimeout(parseTimer);
  if (composing) return;
  parseTimer = setTimeout(parseInput, delay);
}

async function parseInput() {
  const sequence = ++parseSequence;
  const text = plainText();
  const directive = captureDirective(text);
  if (!directive.content.trim()) {
    parsedSchedule = null;
    parsedTodo = null;
    renderHighlights(text);
    updateResult(mode === 'note' ? '笔记保留原文，不解析时间' : itemKind === 'event' ? '自动识别事件时间；#1 红、#2 黄、#3 绿' : '有具体时段会同时安排时间；只有日期则作为截止日期');
    return;
  }
  try {
    if (mode === 'note') {
      parsedSchedule = null;
      parsedTodo = null;
      updateResult('笔记保留原文，不解析时间');
      renderHighlights(text);
      return;
    }
    if (itemKind === 'event') {
      const parsed = await api.parseSchedule(directive.content);
      if (sequence !== parseSequence) return;
      parsedSchedule = parsed;
      parsedTodo = null;
      updateResult(`${formatWhen(parsed)}${directive.repeat ? ' · 每天重复' : ''}`, parsed?.valid ? 'ready' : 'neutral');
      renderHighlights(text, directiveMatches(directive, parsed.matches));
      return;
    }
    const [todo, schedule] = await Promise.all([api.parseTodo(directive.content), api.parseSchedule(directive.content)]);
    if (sequence !== parseSequence) return;
    parsedTodo = todo;
    parsedSchedule = schedule;
    const hasTimeBlock = Boolean(todo?.meta?.explicitTime && schedule?.valid && schedule?.meta?.explicitTime);
    updateResult(`${hasTimeBlock ? `${formatWhen(schedule)} · 同时建立待办` : formatTodo(todo)}${directive.repeat ? ' · 每天重复' : ''}`, todo?.valid ? 'ready' : 'neutral');
    renderHighlights(text, directiveMatches(directive, hasTimeBlock ? schedule.matches : todo.matches));
  } catch (error) {
    updateResult(error.message || '暂时无法解析时间', 'error');
  }
}

function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.body.dataset.captureMode = mode;
  kindPicker.hidden = mode === 'note';
  editor.placeholder = mode === 'note'
    ? '随手记录想法…（Ctrl + Enter 保存）'
    : itemKind === 'event' ? '例如：明天下午 3 点到 5 点组会 #1' : '例如：明天下午 3 点到 5 点修改论文 #1';
  document.getElementById('submitHint').innerHTML = mode === 'note' ? '<kbd>Ctrl Enter</kbd> 保存' : '<kbd>Enter</kbd> 创建';
  renderHighlights(plainText());
  placeCaretAtEnd();
  queueParse(0);
}

function setItemKind(nextKind) {
  itemKind = nextKind;
  kinds.forEach((input) => { input.checked = input.value === itemKind; });
  setMode('item');
}

async function submit() {
  const directive = captureDirective();
  const content = directive.content.trim();
  if (!content) return;
  try {
    updateResult('正在保存…', 'busy');
    await api.submitCapture({ mode, itemKind, content, repeat: directive.repeat });
    editor.value = '';
    renderHighlights('');
    api.setCaptureContentState(false);
    parsedSchedule = null;
    parsedTodo = null;
    await api.hideCapture();
  } catch (error) {
    updateResult(error.message || '保存失败', 'error');
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
kinds.forEach((input) => input.addEventListener('change', () => setItemKind(input.value)));
editor.addEventListener('input', () => {
  const text = plainText();
  api.setCaptureContentState(Boolean(text.trim()));
  renderHighlights(text, composing ? [] : activeMatches());
  queueParse();
});
editor.addEventListener('compositionstart', () => {
  composing = true;
  parseSequence += 1;
  clearTimeout(parseTimer);
  renderHighlights(plainText());
});
editor.addEventListener('compositionend', () => {
  composing = false;
  renderHighlights(plainText());
  queueParse(0);
});
editor.addEventListener('scroll', syncScroll, { passive: true });
document.addEventListener('keydown', (event) => {
  if (event.isComposing || composing || event.keyCode === 229) return;
  if (event.key === 'Tab') {
    event.preventDefault();
    const modes = ['item', 'note'];
    setMode(modes[(modes.indexOf(mode) + (event.shiftKey ? modes.length - 1 : 1)) % modes.length]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    clearTimeout(parseTimer);
    parseSequence += 1;
    editor.value = '';
    parsedSchedule = null;
    parsedTodo = null;
    renderHighlights('');
    api.setCaptureContentState(false);
    api.hideCapture();
  } else if (event.key === 'Enter' && mode === 'note' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submit();
  } else if (event.key === 'Enter' && !event.shiftKey && window.YanjiListEditing?.applyListEditing(editor, event)) {
    event.preventDefault();
  } else if (event.key === 'Enter' && mode === 'item' && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
});
api.onCaptureFocus(() => placeCaretAtEnd());
window.addEventListener('blur', () => {
  if (!plainText().trim()) api.hideCapture();
});
api.setCaptureContentState(false);
renderHighlights('');
placeCaretAtEnd();

'use strict';

const api = window.paperTrail;
const editor = document.getElementById('captureEditor');
const result = document.getElementById('parseResult');
const highlights = document.getElementById('captureHighlights');
const tabs = [...document.querySelectorAll('[data-mode]')];
const card = document.querySelector('.capture-card');
let mode = 'schedule';
let parseSequence = 0;
let parsedSchedule = null;
let composing = false;
let parseTimer = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function plainText() {
  return editor.value.replace(/\u00a0/g, ' ');
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

function placeCaretAtEnd() {
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

function renderHighlights(text, matches = []) {
  let cursor = 0;
  let html = '';
  for (const match of matches) {
    if (match.start < cursor) continue;
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

function queueParse(delay = 120) {
  clearTimeout(parseTimer);
  if (composing) return;
  parseTimer = setTimeout(parseInput, delay);
}

async function parseInput() {
  const sequence = ++parseSequence;
  const text = plainText();
  result.classList.remove('error');
  if (mode !== 'schedule' || !text.trim()) {
    parsedSchedule = null;
    renderHighlights(text);
    result.textContent = mode === 'note' ? '笔记保留原文，不解析时间' : '自动识别时间；#1 红、#2 黄、#3 绿，默认绿色';
    return;
  }
  try {
    const parsed = await api.parseSchedule(text);
    if (sequence !== parseSequence) return;
    parsedSchedule = parsed;
    result.textContent = formatWhen(parsed);
    renderHighlights(text, parsed.matches);
  } catch (error) {
    result.textContent = error.message || '暂时无法解析时间';
    result.classList.add('error');
  }
}

function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  editor.placeholder = mode === 'schedule'
    ? '例如：明天下午 3 点到 5 点组会 #1'
    : '随手记录想法…（Ctrl + Enter 保存）';
  document.getElementById('submitHint').innerHTML = mode === 'schedule'
    ? '<kbd>Enter</kbd> 创建'
    : '<kbd>Ctrl Enter</kbd> 保存';
  renderHighlights(plainText());
  placeCaretAtEnd();
  queueParse(0);
}

async function submit() {
  const content = plainText().trim();
  if (!content) return;
  try {
    result.classList.remove('error');
    result.textContent = '正在保存…';
    await api.submitCapture({ mode, content });
    editor.value = '';
    renderHighlights('');
    api.setCaptureContentState(false);
    parsedSchedule = null;
    await api.hideCapture();
  } catch (error) {
    result.textContent = error.message || '保存失败';
    result.classList.add('error');
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
editor.addEventListener('input', () => {
  const text = plainText();
  api.setCaptureContentState(Boolean(text.trim()));
  renderHighlights(text, composing ? [] : parsedSchedule?.matches);
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
    setMode(mode === 'schedule' ? 'note' : 'schedule');
  } else if (event.key === 'Escape') {
    if (!plainText().trim()) api.hideCapture();
    else {
      card.classList.remove('shake');
      requestAnimationFrame(() => card.classList.add('shake'));
      result.textContent = '内容尚未保存；清空后再按 Esc 关闭';
      result.classList.add('error');
    }
  } else if (event.key === 'Enter' && mode === 'schedule' && !event.shiftKey) {
    event.preventDefault();
    submit();
  } else if (event.key === 'Enter' && mode === 'note' && (event.ctrlKey || event.metaKey)) {
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

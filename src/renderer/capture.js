'use strict';

const api = window.paperTrail;
const editor = document.getElementById('captureEditor');
const result = document.getElementById('parseResult');
const tabs = [...document.querySelectorAll('[data-mode]')];
const card = document.querySelector('.capture-card');
let mode = 'schedule';
let parseSequence = 0;
let parsedSchedule = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function plainText() {
  return editor.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '');
}

function formatWhen(schedule) {
  if (!schedule?.valid) return '输入自然语言，时间会自动识别';
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(start);
  const times = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const priority = { high: '最高优先级', medium: '重要', low: '普通' }[schedule.priority];
  return `${date} · ${times.format(start)}–${times.format(end)} · ${priority}`;
}

function placeCaretAtEnd() {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function applyHighlights(text, matches) {
  if (!matches?.length) return;
  let cursor = 0;
  let html = '';
  for (const match of matches) {
    if (match.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, match.start));
    html += `<mark>${escapeHtml(text.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  }
  html += escapeHtml(text.slice(cursor));
  editor.innerHTML = html;
  placeCaretAtEnd();
}

async function parseInput() {
  const sequence = ++parseSequence;
  const text = plainText();
  result.classList.remove('error');
  if (mode !== 'schedule' || !text.trim()) {
    parsedSchedule = null;
    result.textContent = mode === 'note' ? '笔记保留原文，不解析时间' : '输入自然语言，时间会自动识别';
    return;
  }
  try {
    const parsed = await api.parseSchedule(text);
    if (sequence !== parseSequence) return;
    parsedSchedule = parsed;
    result.textContent = formatWhen(parsed);
    if (!editor.querySelector('mark')) applyHighlights(text, parsed.matches);
  } catch (error) {
    result.textContent = error.message || '暂时无法解析时间';
    result.classList.add('error');
  }
}

function setMode(nextMode) {
  mode = nextMode;
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  editor.dataset.placeholder = mode === 'schedule'
    ? '例如：明天下午 3 点到 5 点组会 !!'
    : '随手记录想法…（Ctrl + Enter 保存）';
  document.getElementById('submitHint').innerHTML = mode === 'schedule'
    ? '<kbd>Enter</kbd> 创建'
    : '<kbd>Ctrl Enter</kbd> 保存';
  editor.textContent = plainText();
  placeCaretAtEnd();
  parseInput();
}

async function submit() {
  const content = plainText().trim();
  if (!content) return;
  try {
    result.classList.remove('error');
    result.textContent = '正在保存…';
    await api.submitCapture({ mode, content });
    editor.textContent = '';
    parsedSchedule = null;
    await api.hideCapture();
  } catch (error) {
    result.textContent = error.message || '保存失败';
    result.classList.add('error');
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
editor.addEventListener('input', () => {
  if (editor.querySelector('mark')) {
    const text = plainText();
    editor.textContent = text;
    placeCaretAtEnd();
  }
  parseInput();
});
editor.addEventListener('paste', (event) => {
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
});
document.addEventListener('keydown', (event) => {
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
placeCaretAtEnd();

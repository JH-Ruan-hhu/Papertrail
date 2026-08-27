'use strict';
const api = window.paperTrail;
const id = new URLSearchParams(location.search).get('id');
const title = document.getElementById('noteTitle');
const content = document.getElementById('noteContent');
const saveState = document.getElementById('saveState');
const pinButton = document.getElementById('pinButton');
let note;
let timer;
let pinned = true;
let dirty = false;
const ALLOWED_TAGS = new Set(['B', 'BR', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'S', 'SPAN', 'STRIKE', 'STRONG', 'U', 'UL']);

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function sanitizeHtml(value) {
  const root = document.createElement('div');
  const source = String(value || '');
  root.innerHTML = /<\/?[a-z][\s\S]*>/i.test(source) ? source : escapeHtml(source).replace(/\r\n?|\n/g, '<br>');
  const clean = (parent) => [...parent.childNodes].forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) return;
    if (child.nodeType !== Node.ELEMENT_NODE) return child.remove();
    if (!ALLOWED_TAGS.has(child.tagName)) {
      const fragment = document.createDocumentFragment();
      while (child.firstChild) fragment.appendChild(child.firstChild);
      child.replaceWith(fragment);
      clean(parent);
      return;
    }
    [...child.attributes].forEach((attribute) => child.removeAttribute(attribute.name));
    clean(child);
  });
  clean(root);
  return root.innerHTML.slice(0, 100_000);
}

function focusContent() {
  requestAnimationFrame(() => {
    content.focus();
    const range = document.createRange();
    range.selectNodeContents(content);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

async function load() {
  note = await api.getStickyNote(id);
  if (!note) return api.closeSticky();
  title.value = note.title;
  content.innerHTML = sanitizeHtml(note.content);
  title.readOnly = note.kind === 'daily';
  dirty = false;
  focusContent();
}

async function flushSave() {
  if (!note || !dirty) return note;
  clearTimeout(timer);
  try {
    note = await api.saveNote({ ...note, title: title.value, content: sanitizeHtml(content.innerHTML), entryId: note.entryId });
    dirty = false;
    saveState.textContent = '已保存';
    return note;
  } catch {
    saveState.textContent = '保存失败，草稿仍保留';
    throw new Error('便笺保存失败。');
  }
}

function queueSave() {
  dirty = true;
  saveState.textContent = '正在保存…';
  clearTimeout(timer);
  timer = setTimeout(() => flushSave().catch(() => {}), 400);
}

title.addEventListener('input', queueSave);
content.addEventListener('input', queueSave);
content.addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    flushSave().catch(() => {});
    return;
  }
  if (window.YanjiListEditing?.applyContentEditableListEditing(content, event)) event.preventDefault();
});
document.querySelector('.sticky-toolbar').addEventListener('mousedown', (event) => {
  if (event.target.closest('[data-command]')) event.preventDefault();
});
document.querySelector('.sticky-toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-command]');
  if (!button) return;
  content.focus();
  document.execCommand(button.dataset.command, false, null);
  queueSave();
});
pinButton.addEventListener('click', async () => {
  pinned = !pinned;
  pinButton.classList.toggle('active', pinned);
  pinButton.textContent = pinned ? '取消置顶' : '置顶';
  await api.setStickyAlwaysOnTop(pinned);
});
document.getElementById('closeButton').addEventListener('click', async () => {
  try { await flushSave(); } catch { /* keep the local text visible until the window closes */ }
  await api.closeSticky();
});
window.addEventListener('blur', () => flushSave().catch(() => {}));
window.addEventListener('beforeunload', () => { flushSave().catch(() => {}); });
api.onStickyFocus?.(() => focusContent());
load();

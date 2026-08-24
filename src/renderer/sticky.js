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

function focusContent() {
  requestAnimationFrame(() => {
    content.focus();
    content.setSelectionRange(content.value.length, content.value.length);
  });
}

async function load() {
  note = await api.getStickyNote(id);
  if (!note) return api.closeSticky();
  title.value = note.title;
  content.value = note.content;
  title.readOnly = note.kind === 'daily';
  dirty = false;
  focusContent();
}

async function flushSave() {
  if (!note || !dirty) return note;
  clearTimeout(timer);
  try {
    note = await api.saveNote({ ...note, title: title.value, content: content.value, entryId: note.entryId });
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
  if (window.YanjiListEditing?.applyListEditing(content, event)) event.preventDefault();
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

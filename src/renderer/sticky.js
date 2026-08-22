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

async function load() {
  const workspace = await api.getWorkspace();
  note = workspace.notes.find((item) => item.id === id);
  if (!note) return api.closeSticky();
  title.value = note.title;
  content.value = note.content;
}

function queueSave() {
  saveState.textContent = '正在保存…';
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      note = await api.saveNote({ ...note, title: title.value, content: content.value });
      saveState.textContent = '已保存';
    } catch {
      saveState.textContent = '保存失败';
    }
  }, 450);
}

title.addEventListener('input', queueSave);
content.addEventListener('input', queueSave);
pinButton.addEventListener('click', async () => {
  pinned = !pinned;
  pinButton.classList.toggle('active', pinned);
  await api.setStickyAlwaysOnTop(pinned);
});
document.getElementById('closeButton').addEventListener('click', () => api.closeSticky());
load();

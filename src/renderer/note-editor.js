'use strict';

(() => {
  const INSPECTOR_STATE_KEY = 'yanji.noteInspectorOpen.v1';

  function plainTextFromHtml(value) {
    const root = document.createElement('div');
    root.innerHTML = String(value || '');
    root.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
    root.querySelectorAll('img[data-note-attachment]').forEach((node) => node.replaceWith(' 图 '));
    return (root.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  function wordCount(value) {
    const text = plainTextFromHtml(value);
    const han = text.match(/[\u3400-\u9FFF]/g)?.length || 0;
    const tokens = text.replace(/[\u3400-\u9FFF]/g, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
    return han + tokens;
  }

  function placeCaretAtEnd(editor) {
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function appendedSuffix(previousHtml, nextHtml) {
    const previous = String(previousHtml || '');
    const next = String(nextHtml || '');
    return previous && next.startsWith(previous) ? next.slice(previous.length) : null;
  }

  function updateDocumentStatus(editor, note) {
    const count = wordCount(editor?.innerHTML || '');
    const wordCountLabel = document.getElementById('noteWordCount');
    const inspectorCount = document.getElementById('noteInspectorWordCount');
    if (wordCountLabel) wordCountLabel.textContent = `${count} 字`;
    if (inspectorCount) inspectorCount.textContent = String(count);
    const created = document.getElementById('noteCreatedAt');
    const updated = document.getElementById('noteUpdatedAt');
    const format = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
    if (created) created.textContent = format(note?.createdAt);
    if (updated) updated.textContent = format(note?.updatedAt);
    return count;
  }

  let paperMotion = null;
  let noteZoom = 1;

  function preferredInspectorOpen() {
    try {
      const saved = localStorage.getItem(INSPECTOR_STATE_KEY);
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  }

  function setInspectorOpen(open, { animate = true, persist = true } = {}) {
    const body = document.querySelector('.note-workspace-body');
    const panel = document.getElementById('noteMetadataPanel');
    const button = document.getElementById('toggleNoteMetadataButton');
    const paper = document.querySelector('.note-paper');
    if (!body || !panel || !button || !paper) return;
    const nextOpen = Boolean(open);
    const before = paper.getBoundingClientRect();
    body.classList.toggle('is-inspector-closed', !nextOpen);
    panel.setAttribute('aria-hidden', String(!nextOpen));
    panel.inert = !nextOpen;
    button.setAttribute('aria-expanded', String(nextOpen));
    button.setAttribute('aria-label', nextOpen ? '收起属性侧栏' : '展开属性侧栏');
    button.title = nextOpen ? '收起属性侧栏' : '展开属性侧栏';
    if (persist) {
      try { localStorage.setItem(INSPECTOR_STATE_KEY, String(nextOpen)); } catch { /* storage can be unavailable in recovery mode */ }
    }
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const after = paper.getBoundingClientRect();
    const deltaX = before.left - after.left;
    paperMotion?.cancel();
    if (Math.abs(deltaX) < 1) return;
    paperMotion = paper.animate(
      [{ transform: `translateX(${deltaX}px)` }, { transform: 'translateX(0)' }],
      { duration: 260, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
    );
  }

  function setZoom(value) {
    noteZoom = Math.min(1.8, Math.max(.7, Math.round(Number(value) * 10) / 10));
    const paper = document.querySelector('.note-paper');
    const label = document.getElementById('noteZoomLabel');
    paper?.style.setProperty('--note-zoom', noteZoom);
    if (label) label.textContent = `${Math.round(noteZoom * 100)}%`;
    return noteZoom;
  }

  function handleZoomWheel(event) {
    if (!(event?.ctrlKey || event?.metaKey)) return false;
    event.preventDefault();
    setZoom(noteZoom + (event.deltaY < 0 ? .1 : -.1));
    return true;
  }

  function toggleInspector() {
    const body = document.querySelector('.note-workspace-body');
    setInspectorOpen(body?.classList.contains('is-inspector-closed'));
  }

  function restoreInspector() {
    setInspectorOpen(preferredInspectorOpen(), { animate: false, persist: false });
  }

  window.YanjiNoteEditor = Object.freeze({ appendedSuffix, handleZoomWheel, placeCaretAtEnd, preferredInspectorOpen, restoreInspector, setInspectorOpen, setZoom, toggleInspector, updateDocumentStatus, wordCount });
})();

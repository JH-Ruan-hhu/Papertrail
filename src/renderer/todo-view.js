'use strict';

(function installTodoView() {
  const api = window.paperTrail;
  const DRAFT_KEY = 'yanji.todoDraft.v1';
  const state = { workspace: { todos: [], schedules: [] }, view: 'today', query: '', parseRequest: 0, bound: false, draftTimer: null };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function localKey(date) { const d = date instanceof Date ? date : new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function sameDay(a, b) { return localKey(a) === localKey(b); }
  function isOverdue(todo, now = new Date()) { return todo.status === 'open' && todo.dueAt && Date.parse(todo.dueAt) < now.getTime(); }
  function isToday(todo, now = new Date()) { return todo.dueAt && sameDay(todo.dueAt, now); }
  function isUpcoming(todo, now = new Date()) { return todo.status === 'open' && todo.dueAt && !isToday(todo, now) && Date.parse(todo.dueAt) >= now.getTime() && Date.parse(todo.dueAt) < now.getTime() + 8 * 86_400_000; }
  function formatDue(todo) {
    if (!todo.dueAt) return '收件箱 · 无截止时间';
    const due = new Date(todo.dueAt);
    const date = sameDay(due, new Date()) ? '今天' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(due);
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(due);
    return `${isOverdue(todo) ? '已逾期 · ' : ''}${date} ${time}`;
  }
  function priorityLabel(priority) { return priority === 'high' ? '最高' : priority === 'medium' ? '重要' : '普通'; }
  function filteredTodos() {
    const now = new Date();
    const query = state.query.trim().toLocaleLowerCase('zh-CN');
    const all = (state.workspace.todos || []).filter((todo) => !query || `${todo.title}\n${todo.notes || ''}`.toLocaleLowerCase('zh-CN').includes(query));
    if (state.view === 'today') return all.filter((todo) => todo.status === 'open' && (isToday(todo, now) || isOverdue(todo, now)));
    if (state.view === 'inbox') return all.filter((todo) => todo.status === 'open' && !todo.dueAt);
    if (state.view === 'upcoming') return all.filter((todo) => isUpcoming(todo, now));
    if (state.view === 'completed') return all.filter((todo) => todo.status === 'completed').sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0));
    if (state.view === 'cancelled') return all.filter((todo) => todo.status === 'cancelled').sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    return all.filter((todo) => todo.status !== 'cancelled');
  }
  function sorted(list) {
    return [...list].sort((a, b) => {
      const overdue = Number(isOverdue(a)) - Number(isOverdue(b));
      if (overdue) return -overdue;
      const priority = ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1);
      if (priority) return priority;
      return (Date.parse(a.dueAt || 0) || Number.MAX_SAFE_INTEGER) - (Date.parse(b.dueAt || 0) || Number.MAX_SAFE_INTEGER);
    });
  }
  function groupLabel(todo) {
    if (!todo.dueAt) return '无日期';
    if (isOverdue(todo)) return '逾期';
    if (isToday(todo)) return '今天';
    return '即将到来';
  }
  function card(todo) {
    const linked = (state.workspace.schedules || []).filter((item) => item.sourceRef?.type === 'todo' && item.sourceRef.id === todo.id).length;
    const actions = todo.status === 'completed' || todo.status === 'cancelled'
      ? `<button data-todo-action="reopen" data-todo-id="${escapeHtml(todo.id)}" type="button">重新打开</button>`
      : `<button data-todo-action="complete" data-todo-id="${escapeHtml(todo.id)}" type="button">完成</button><button data-todo-action="cancel" data-todo-id="${escapeHtml(todo.id)}" type="button">取消</button>`;
    const checkbox = todo.status === 'cancelled'
      ? `<input class="todo-check" type="checkbox" disabled aria-label="已取消${escapeHtml(todo.title)}">`
      : `<input class="todo-check" data-todo-action="${todo.status === 'completed' ? 'reopen' : 'complete'}" data-todo-id="${escapeHtml(todo.id)}" type="checkbox" ${todo.status === 'completed' ? 'checked' : ''} aria-label="${todo.status === 'completed' ? '重新打开' : '完成'}${escapeHtml(todo.title)}">`;
    return `<article class="todo-card ${isOverdue(todo) ? 'is-overdue' : ''} ${todo.status === 'completed' ? 'is-completed' : ''} ${todo.status === 'cancelled' ? 'is-cancelled' : ''}" data-todo-card="${escapeHtml(todo.id)}">${checkbox}<div class="todo-card-main" data-todo-edit="${escapeHtml(todo.id)}"><div class="todo-card-title"><i class="todo-priority-dot ${escapeHtml(todo.priority)}"></i><strong>${escapeHtml(todo.title)}</strong></div><div class="todo-card-meta"><span class="${isOverdue(todo) ? 'overdue' : ''}">${escapeHtml(formatDue(todo))}</span><span>${priorityLabel(todo.priority)}优先级</span>${linked ? `<span>已安排 ${linked} 个时间块</span>` : ''}</div>${todo.notes ? `<p class="todo-card-notes">${escapeHtml(todo.notes.slice(0, 180))}</p>` : ''}</div><div class="todo-card-actions">${actions}${todo.status === 'open' ? `<button data-todo-action="schedule" data-todo-id="${escapeHtml(todo.id)}" type="button">安排时间</button><button data-todo-action="convert-schedule" data-todo-id="${escapeHtml(todo.id)}" type="button">转为日程</button>` : ''}<button data-todo-action="edit" data-todo-id="${escapeHtml(todo.id)}" type="button">编辑</button></div></article>`;
  }
  function renderCounts() {
    const now = new Date();
    const todos = state.workspace.todos || [];
    const counts = {
      today: todos.filter((todo) => todo.status === 'open' && (isToday(todo, now) || isOverdue(todo, now))).length,
      inbox: todos.filter((todo) => todo.status === 'open' && !todo.dueAt).length,
      upcoming: todos.filter((todo) => isUpcoming(todo, now)).length,
      completed: todos.filter((todo) => todo.status === 'completed').length,
      cancelled: todos.filter((todo) => todo.status === 'cancelled').length
    };
    document.querySelectorAll('[data-todo-count]').forEach((node) => { node.textContent = String(counts[node.dataset.todoCount] || 0); });
  }
  function render() {
    const list = document.getElementById('todoList');
    if (!list) return;
    renderCounts();
    document.querySelectorAll('[data-todo-view]').forEach((button) => button.classList.toggle('active', button.dataset.todoView === state.view));
    const todos = sorted(filteredTodos());
    const groups = new Map();
    todos.forEach((todo) => { const label = state.view === 'completed' ? '已完成' : state.view === 'cancelled' ? '已取消' : groupLabel(todo); if (!groups.has(label)) groups.set(label, []); groups.get(label).push(todo); });
    list.innerHTML = todos.length ? [...groups.entries()].map(([label, items]) => `<section class="todo-group"><div class="todo-group-heading"><strong>${label}</strong><span>${items.length} 项</span></div>${items.map(card).join('')}</section>`).join('') : '<div class="todo-empty"><strong>这一组还没有待办</strong><span>点击右上角新建待办</span></div>';
  }
  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
  function writeDraft() {
    if (!document.getElementById('todoDialog')?.open) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      id: document.getElementById('todoId').value || '',
      title: document.getElementById('todoTitle').value,
      notes: document.getElementById('todoNotes').value,
      dueAt: document.getElementById('todoDueAt').value,
      reminderAt: document.getElementById('todoReminderAt').value,
      reminderMode: document.getElementById('todoReminderMode').value,
      priority: document.querySelector('input[name="todoPriority"]:checked')?.value || 'medium'
    }));
  }
  function queueDraft() { clearTimeout(state.draftTimer); state.draftTimer = setTimeout(writeDraft, 350); }
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }
  function setDateInput(value) {
    if (!value) { document.getElementById('todoDueAt').value = ''; return; }
    const date = new Date(value);
    document.getElementById('todoDueAt').value = `${localKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function setDateInputValue(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    if (!value) { input.value = ''; return; }
    const date = new Date(value);
    input.value = localKey(date) + 'T' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }
  function syncReminderInput() {
    document.getElementById('todoReminderAtField').hidden = document.getElementById('todoReminderMode').value !== 'custom';
  }
  function openEditor(todo = null, preset = null) {
    const storedDraft = readDraft();
    const draft = todo ? (storedDraft?.id === todo.id ? storedDraft : null) : storedDraft;
    const source = draft || todo || preset || {};
    document.getElementById('todoId').value = todo?.id || '';
    document.getElementById('todoTitle').value = source.title || '';
    document.getElementById('todoNotes').value = source.notes || '';
    setDateInput(source.dueAt);
    setDateInputValue('todoReminderAt', source.reminderAt);
    document.getElementById('todoReminderMode').value = source.reminderMode || 'none';
    syncReminderInput();
    document.querySelector(`input[name="todoPriority"][value="${source.priority || 'medium'}"]`).checked = true;
    document.getElementById('todoDialogTitle').textContent = todo ? '编辑待办' : '新建待办';
    document.getElementById('deleteTodoButton').hidden = !todo;
    document.getElementById('todoRecognition').hidden = true;
    document.getElementById('todoRecognition').textContent = '';
    document.getElementById('todoError').textContent = '';
    document.getElementById('todoDialog').showModal();
    api.setModalWindowState(true).catch(() => {});
    setTimeout(() => document.getElementById('todoTitle').focus(), 20);
  }
  async function parseTitle() {
    const input = document.getElementById('todoTitle').value.trim();
    const recognition = document.getElementById('todoRecognition');
    const request = ++state.parseRequest;
    if (!input || document.getElementById('todoId').value) { recognition.hidden = true; return null; }
    try {
      const parsed = await api.parseTodo(input);
      if (request !== state.parseRequest) return null;
      if (!parsed?.valid) { recognition.textContent = parsed?.warning || '日期无法识别'; recognition.hidden = false; return null; }
      recognition.textContent = parsed.dueAt ? `已识别：${new Date(parsed.dueAt).toLocaleString('zh-CN')} · 保存时将使用“${parsed.title}”` : '没有日期 · 保存到收件箱，不会提醒';
      recognition.hidden = false;
      if (parsed.dueAt) setDateInput(parsed.dueAt);
      document.getElementById('todoReminderMode').value = parsed.reminderMode || 'none';
      document.querySelector(`input[name="todoPriority"][value="${parsed.priority}"]`).checked = true;
      return parsed;
    } catch { recognition.hidden = true; return null; }
  }
  async function save() {
    const error = document.getElementById('todoError');
    const rawTitle = document.getElementById('todoTitle').value.trim();
    if (!rawTitle) { error.textContent = '待办内容不能为空'; return; }
    const parsed = await parseTitle();
    const dueValue = document.getElementById('todoDueAt').value;
    try {
      const reminderMode = document.getElementById('todoReminderMode').value;
      const reminderAtValue = document.getElementById('todoReminderAt').value;
      await api.saveTodo({ id: document.getElementById('todoId').value || undefined, title: parsed?.title || rawTitle, notes: document.getElementById('todoNotes').value, dueAt: dueValue ? new Date(dueValue).toISOString() : null, reminderMode, reminderAt: reminderMode === 'custom' && reminderAtValue ? new Date(reminderAtValue).toISOString() : null, priority: document.querySelector('input[name="todoPriority"]:checked')?.value || 'medium' });
      clearDraft();
      document.getElementById('todoDialog').close();
      api.setModalWindowState(false).catch(() => {});
      window.showWorkbenchToast?.('待办已保存');
    } catch (exception) { error.textContent = exception.message || '待办保存失败'; }
  }
  async function action(id, name) {
    try {
      if (name === 'delete') {
        const todo = state.workspace.todos.find((item) => item.id === id);
        const accepted = await window.yanjiConfirm?.({ title: '删除待办', message: `“${todo?.title || ''}”将被删除`, confirmText: '删除待办', tone: 'danger' });
        if (!accepted) return;
        await api.deleteTodo(id);
      } else if (name === 'complete') await api.completeTodo(id);
      else if (name === 'reopen') await api.reopenTodo(id);
      else if (name === 'cancel') await api.cancelTodo(id);
      else if (name === 'schedule') window.dispatchEvent(new CustomEvent('yanji:todo-schedule', { detail: state.workspace.todos.find((item) => item.id === id) }));
      else if (name === 'convert-schedule') window.dispatchEvent(new CustomEvent('yanji:todo-convert', { detail: state.workspace.todos.find((item) => item.id === id) }));
      else if (name === 'edit') openEditor(state.workspace.todos.find((item) => item.id === id));
      if (!['edit', 'schedule', 'convert-schedule'].includes(name)) window.showWorkbenchToast?.(name === 'complete' ? '待办已完成' : name === 'delete' ? '待办已删除' : '待办状态已更新');
    } catch (exception) { window.showWorkbenchToast?.(exception.message || '待办操作失败', 'error'); }
  }
  function bind() {
    if (state.bound) return;
    state.bound = true;
    document.querySelectorAll('[data-todo-view]').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.todoView; render(); }));
    document.getElementById('todoSearch').addEventListener('input', (event) => { state.query = event.target.value; render(); });
    document.getElementById('todoList').addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-todo-action]');
      if (actionButton) return action(actionButton.dataset.todoId, actionButton.dataset.todoAction);
      const edit = event.target.closest('[data-todo-edit]');
      if (edit) openEditor(state.workspace.todos.find((todo) => todo.id === edit.dataset.todoEdit));
    });
    document.getElementById('addTodoButton').addEventListener('click', () => openEditor());
    document.getElementById('todoQuickCaptureButton').addEventListener('click', () => api.showCapture());
    document.getElementById('saveTodoButton').addEventListener('click', save);
    document.getElementById('todoForm').addEventListener('submit', (event) => { event.preventDefault(); save(); });
    document.getElementById('cancelTodoButton').addEventListener('click', () => { clearDraft(); document.getElementById('todoDialog').close(); api.setModalWindowState(false).catch(() => {}); });
    document.getElementById('deleteTodoButton').addEventListener('click', () => action(document.getElementById('todoId').value, 'delete').then(() => { if (document.getElementById('todoDialog').open) document.getElementById('todoDialog').close(); }));
    document.getElementById('todoDialog').addEventListener('cancel', (event) => { event.preventDefault(); writeDraft(); event.currentTarget.close(); api.setModalWindowState(false).catch(() => {}); });
    document.getElementById('todoDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) { writeDraft(); event.currentTarget.close(); api.setModalWindowState(false).catch(() => {}); } });
    let timer;
    document.getElementById('todoTitle').addEventListener('input', () => { queueDraft(); clearTimeout(timer); timer = setTimeout(parseTitle, 180); });
    document.querySelectorAll('#todoDialog input, #todoDialog textarea, #todoDialog select').forEach((input) => input.addEventListener('change', queueDraft));
    document.querySelectorAll('#todoTitle, #todoNotes').forEach((input) => input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
        return;
      }
      if (input === document.getElementById('todoNotes') && window.YanjiListEditing?.applyListEditing(input, event)) {
        event.preventDefault();
      }
    }));
    document.getElementById('todoReminderMode').addEventListener('change', syncReminderInput);
    document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !event.target.matches('input,textarea')) { event.preventDefault(); document.getElementById('todoSearch').focus(); } });
  }
  window.YanjiTodoView = {
    init() { bind(); render(); },
    setWorkspace(workspace) { state.workspace = workspace || state.workspace; render(); },
    flushDraft() { if (document.getElementById('todoDialog')?.open) writeDraft(); },
    render,
    openCreateDialog: (preset = null) => openEditor(null, preset),
    openEditDialog: openEditor
  };
}());

'use strict';

const crypto = require('node:crypto');
const {
  cancelTodo,
  completeTodo,
  normalizeTodo,
  reopenTodo,
  saveTodo,
  snoozeTodo
} = require('./todo-core');
const { normalizeSchedule, saveSchedule } = require('./workbench-core');

const TODO_INPUT_KEYS = Object.freeze([
  'id', 'title', 'notes', 'status', 'priority', 'dueAt', 'reminderMode',
  'reminderAt', 'reminderSentAt', 'overdueNotifiedAt', 'completedAt', 'createdAt',
  'updatedAt', 'snoozedUntil', 'legacy'
]);
const SCHEDULE_INPUT_KEYS = Object.freeze([
  'id', 'title', 'startAt', 'endAt', 'allDay', 'priority', 'reminderMinutesBefore',
  'reminderSentAt', 'repeat', 'sourceRef', 'createdAt', 'updatedAt', 'legacy'
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeId(value, label = '记录') {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id)) throw new Error(`${label} ID 无效。`);
  return id;
}

function pick(value, keys) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : now;
  return value instanceof Date ? value.toISOString() : new Date(value || Date.now()).toISOString();
}

function currentWorkspace(store) {
  if (store?.data && typeof store.data === 'object') return store.data;
  return {
    schedules: typeof store?.listSchedules === 'function' ? store.listSchedules() : [],
    todos: typeof store?.listTodos === 'function' ? store.listTodos() : []
  };
}

function ensureCollections(workspace) {
  workspace.schedules ||= [];
  workspace.todos ||= [];
  return workspace;
}

function commit(store, updater) {
  if (typeof store.updateWorkspace === 'function') return store.updateWorkspace(updater);
  if (typeof store.commitWorkspace === 'function') return store.commitWorkspace(updater);
  const source = ensureCollections(currentWorkspace(store));
  const next = updater(clone(source)) || source;
  if (typeof store.setSchedules === 'function') store.setSchedules(next.schedules);
  if (typeof store.setTodos === 'function') store.setTodos(next.todos);
  return next;
}

function findById(list, id, label) {
  const item = (list || []).find((value) => value.id === id);
  if (!item) throw new Error(`找不到这条${label}。`);
  return item;
}

function createPlanningService({ store, makeId = () => crypto.randomUUID(), now = () => new Date(), onWorkspaceChanged = () => {} } = {}) {
  if (!store) throw new Error('规划服务需要数据存储。');
  const getNow = () => isoNow(now);
  const notify = (action, id, changedFields = []) => {
    try { onWorkspaceChanged({ action, id, changedFields }); } catch { /* notification must not undo a saved write */ }
  };
  const makeTodoId = () => String(makeId('todo'));
  const makeScheduleId = () => String(makeId('schedule'));

  function workspaceSnapshot() {
    const source = currentWorkspace(store);
    return {
      schedules: clone(source.schedules || []),
      todos: clone(source.todos || [])
    };
  }

  function listTodos() {
    return workspaceSnapshot().todos;
  }

  function listSchedules() {
    return workspaceSnapshot().schedules;
  }

  function saveTodoItem(input) {
    const requested = pick(input, TODO_INPUT_KEYS);
    const id = requested.id ? safeId(requested.id, '待办') : null;
    const timestamp = getNow();
    let saved;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      const existing = id ? findById(workspace.todos, id, '待办') : null;
      const next = saveTodo(workspace.todos, {
        ...requested,
        id: existing?.id || id || undefined,
        createdAt: existing?.createdAt,
        updatedAt: timestamp
      }, timestamp, makeTodoId);
      saved = next.find((todo) => todo.id === (existing?.id || id || next[0].id));
      workspace.todos = next;
      return workspace;
    });
    notify(saved.createdAt === saved.updatedAt ? 'created' : 'updated', saved.id, Object.keys(requested));
    return clone(saved);
  }

  function deleteTodoItem(idValue) {
    const id = safeId(idValue, '待办');
    commit(store, (workspace) => {
      ensureCollections(workspace);
      findById(workspace.todos, id, '待办');
      workspace.todos = workspace.todos.filter((todo) => todo.id !== id);
      // Deleting the outcome never deletes its execution blocks. It only
      // removes the source reference in the same atomic write.
      workspace.schedules = workspace.schedules.map((schedule) => (
        schedule.sourceRef?.type === 'todo' && schedule.sourceRef.id === id
          ? { ...schedule, sourceRef: null, updatedAt: getNow() }
          : schedule
      ));
      return workspace;
    });
    notify('deleted', id, ['sourceRef']);
    return true;
  }

  function updateTodoStatus(idValue, action) {
    const id = safeId(idValue, '待办');
    const timestamp = getNow();
    let saved;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      const current = findById(workspace.todos, id, '待办');
      const updated = action === 'complete'
        ? completeTodo(current, true, timestamp)
        : action === 'reopen'
          ? reopenTodo(current, timestamp)
          : cancelTodo(current, timestamp);
      workspace.todos = workspace.todos.map((todo) => todo.id === id ? updated : todo);
      saved = updated;
      return workspace;
    });
    notify('updated', id, ['status', 'completedAt', 'reminderSentAt', 'overdueNotifiedAt']);
    return clone(saved);
  }

  function linkedSchedules(todoIdValue) {
    const todoId = safeId(todoIdValue, '待办');
    findById(listTodos(), todoId, '待办');
    return listSchedules().filter((schedule) => schedule.sourceRef?.type === 'todo' && schedule.sourceRef.id === todoId);
  }

  function snoozeTodoItem(todoIdValue, until) {
    const todoId = safeId(todoIdValue, '待办');
    const timestamp = getNow();
    let saved;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      const current = findById(workspace.todos, todoId, '待办');
      saved = snoozeTodo(current, until, timestamp);
      workspace.todos = workspace.todos.map((todo) => todo.id === todoId ? saved : todo);
      return workspace;
    });
    notify('updated', todoId, ['snoozedUntil', 'reminderSentAt']);
    return clone(saved);
  }

  function validateSourceRef(sourceRef, todos) {
    if (sourceRef == null || sourceRef === '') return null;
    if (!sourceRef || typeof sourceRef !== 'object' || Array.isArray(sourceRef) || sourceRef.type !== 'todo') {
      throw new Error('日程关联引用格式无效。');
    }
    const id = safeId(sourceRef.id, '待办');
    if (!(todos || []).some((todo) => todo.id === id)) throw new Error('日程关联的待办不存在。');
    return { type: 'todo', id };
  }

  function saveScheduleItem(input) {
    const requested = pick(input, SCHEDULE_INPUT_KEYS);
    const id = requested.id ? safeId(requested.id, '日程') : null;
    const timestamp = getNow();
    let saved;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      const existing = id ? findById(workspace.schedules, id, '日程') : null;
      const prepared = {
        ...requested,
        id: existing?.id || id || undefined,
        createdAt: existing?.createdAt,
        updatedAt: timestamp,
        sourceRef: validateSourceRef(requested.sourceRef ?? existing?.sourceRef, workspace.todos)
      };
      const next = saveSchedule(workspace.schedules, prepared, timestamp, makeScheduleId);
      saved = next.find((schedule) => schedule.id === (existing?.id || id || next[0].id));
      workspace.schedules = next;
      return workspace;
    });
    notify(saved.createdAt === saved.updatedAt ? 'created' : 'updated', saved.id, Object.keys(requested));
    return clone(saved);
  }

  function deleteScheduleItem(idValue) {
    const id = safeId(idValue, '日程');
    commit(store, (workspace) => {
      ensureCollections(workspace);
      findById(workspace.schedules, id, '日程');
      workspace.schedules = workspace.schedules.filter((schedule) => schedule.id !== id);
      return workspace;
    });
    notify('deleted', id, []);
    return true;
  }

  function detachSchedule(scheduleIdValue) {
    const id = safeId(scheduleIdValue, '日程');
    const timestamp = getNow();
    let saved;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      findById(workspace.schedules, id, '日程');
      workspace.schedules = workspace.schedules.map((schedule) => schedule.id === id ? { ...schedule, sourceRef: null, updatedAt: timestamp } : schedule);
      saved = workspace.schedules.find((schedule) => schedule.id === id);
      return workspace;
    });
    notify('updated', id, ['sourceRef']);
    return clone(saved);
  }

  function scheduleTodo(todoIdValue, input) {
    const todoId = safeId(todoIdValue, '待办');
    const todo = findById(listTodos(), todoId, '待办');
    const requested = pick(input, SCHEDULE_INPUT_KEYS);
    if (!requested.startAt || !requested.endAt) throw new Error('安排待办时必须选择开始和结束时间。');
    return saveScheduleItem({
      ...requested,
      title: requested.title || todo.title,
      priority: requested.priority || todo.priority,
      sourceRef: { type: 'todo', id: todoId }
    });
  }

  function convertScheduleToTodo(scheduleIdValue, input = {}) {
    const scheduleId = safeId(scheduleIdValue, '日程');
    const schedule = findById(listSchedules(), scheduleId, '日程');
    if (schedule.sourceRef?.type === 'todo') throw new Error('这条日程已经关联待办。');
    const requested = pick(input, TODO_INPUT_KEYS);
    const keepSchedule = input.mode !== 'remove-schedule' && input.keepSchedule !== false;
    const timestamp = getNow();
    let result;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      if (requested.id && workspace.todos.some((item) => item.id === requested.id)) {
        throw new Error('转换生成的待办 ID 已存在。');
      }
      const todo = normalizeTodo({
        ...requested,
        id: requested.id || makeTodoId(),
        title: requested.title || schedule.title,
        priority: requested.priority || schedule.priority,
        dueAt: requested.dueAt || schedule.startAt,
        reminderMode: requested.reminderMode || 'at-due',
        createdAt: timestamp,
        updatedAt: timestamp
      }, 0, timestamp);
      workspace.todos = [todo, ...workspace.todos];
      if (keepSchedule) {
        workspace.schedules = workspace.schedules.map((item) => item.id === scheduleId
          ? { ...item, sourceRef: { type: 'todo', id: todo.id }, updatedAt: timestamp }
          : item);
      } else {
        workspace.schedules = workspace.schedules.filter((item) => item.id !== scheduleId);
      }
      result = { todo, schedule: workspace.schedules.find((item) => item.id === scheduleId) || null };
      return workspace;
    });
    notify('created', result.todo.id, ['dueAt', 'priority']);
    notify('updated', scheduleId, keepSchedule ? ['sourceRef'] : []);
    return clone(result);
  }

  function convertTodoToSchedule(todoIdValue, input = {}) {
    const todoId = safeId(todoIdValue, '待办');
    const todo = findById(listTodos(), todoId, '待办');
    const requested = pick(input, SCHEDULE_INPUT_KEYS);
    if (!requested.startAt || !requested.endAt) throw new Error('转为日程时必须选择开始和结束时间。');
    const keepTodo = input.mode === 'keep-linked' || input.keepTodo === true;
    const timestamp = getNow();
    let result;
    commit(store, (workspace) => {
      ensureCollections(workspace);
      if (requested.id && workspace.schedules.some((item) => item.id === requested.id)) {
        throw new Error('转换生成的日程 ID 已存在。');
      }
      const schedule = normalizeSchedule({
        ...requested,
        id: requested.id || makeScheduleId(),
        title: requested.title || todo.title,
        priority: requested.priority || todo.priority,
        sourceRef: keepTodo ? { type: 'todo', id: todoId } : null,
        createdAt: timestamp,
        updatedAt: timestamp
      }, 0, timestamp);
      workspace.todos = keepTodo ? workspace.todos : workspace.todos.filter((item) => item.id !== todoId);
      workspace.schedules = [schedule, ...workspace.schedules.map((item) => (
        !keepTodo && item.sourceRef?.type === 'todo' && item.sourceRef.id === todoId
          ? { ...item, sourceRef: null, updatedAt: timestamp }
          : item
      ))];
      result = { todo: keepTodo ? todo : null, schedule };
      return workspace;
    });
    notify(keepTodo ? 'updated' : 'deleted', todoId, keepTodo ? ['sourceRef'] : ['sourceRef']);
    notify('created', result.schedule.id, []);
    return clone(result);
  }

  return {
    cancelTodo: (id) => updateTodoStatus(id, 'cancel'),
    completeTodo: (id) => updateTodoStatus(id, 'complete'),
    convertScheduleToTodo,
    convertTodoToSchedule,
    deleteSchedule: deleteScheduleItem,
    deleteTodo: deleteTodoItem,
    detachSchedule,
    getLinkedSchedules: linkedSchedules,
    getWorkspace: workspaceSnapshot,
    listSchedules,
    listTodos,
    reopenTodo: (id) => updateTodoStatus(id, 'reopen'),
    saveSchedule: saveScheduleItem,
    saveTodo: saveTodoItem,
    scheduleTodo,
    snoozeTodo: snoozeTodoItem
  };
}

module.exports = { createPlanningService };

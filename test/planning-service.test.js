'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlanningService } = require('../src/planning-service');

function makeStore() {
  const store = {
    data: { schedules: [], todos: [] },
    updateWorkspace(updater) {
      const draft = JSON.parse(JSON.stringify(this.data));
      this.data = updater(draft) || draft;
      return this.data;
    }
  };
  return store;
}

test('persists the daily repeat option through the planning service whitelist', () => {
  const store = makeStore();
  const service = createPlanningService({
    store,
    makeId: () => 'schedule-daily',
    now: () => new Date('2026-08-29T08:00:00.000Z')
  });
  const saved = service.saveSchedule({
    title: '每日复盘',
    startAt: '2026-08-29T09:00:00.000Z',
    endAt: '2026-08-29T09:30:00.000Z',
    repeat: 'daily'
  });
  assert.equal(saved.repeat, 'daily');
  assert.equal(store.data.schedules[0].repeat, 'daily');
});

test('saves a todo, schedules linked work and deletes the todo without deleting the block', () => {
  const store = makeStore();
  let id = 0;
  const service = createPlanningService({
    store,
    makeId: (kind) => `${kind}-${++id}`,
    now: () => new Date('2026-08-22T10:00:00.000Z')
  });
  const todo = service.saveTodo({ title: '补充方法', dueAt: '2026-08-25T10:00:00.000Z', reminderMode: 'at-due' });
  const schedule = service.scheduleTodo(todo.id, { startAt: '2026-08-23T09:00:00.000Z', endAt: '2026-08-23T10:00:00.000Z' });
  assert.deepEqual(schedule.sourceRef, { type: 'todo', id: todo.id });
  assert.equal(service.getLinkedSchedules(todo.id).length, 1);
  service.deleteTodo(todo.id);
  assert.equal(store.data.todos.length, 0);
  assert.equal(store.data.schedules.length, 1);
  assert.equal(store.data.schedules[0].sourceRef, null);
});

test('saving a todo for the UI creates and maintains one linked schedule', () => {
  const store = makeStore();
  let id = 0;
  const service = createPlanningService({
    store,
    makeId: (kind) => `${kind}-${++id}`,
    now: () => new Date('2026-08-22T10:00:00.000Z')
  });
  const todo = service.saveTodoWithSchedule({ title: '整理实验数据', dueAt: '2026-08-22T11:00:00.000Z', priority: 'high' });
  assert.equal(store.data.todos.length, 1);
  assert.equal(store.data.schedules.length, 1);
  assert.deepEqual(store.data.schedules[0].sourceRef, { type: 'todo', id: todo.id });
  assert.equal(store.data.schedules[0].startAt, todo.dueAt);
  assert.equal(store.data.schedules[0].legacy.managedByTodo, true);
  service.saveTodoWithSchedule({ ...todo, title: '整理全部实验数据', dueAt: '2026-08-23T09:00:00.000Z' });
  assert.equal(store.data.schedules.length, 1);
  assert.equal(store.data.schedules[0].title, '整理全部实验数据');
  assert.equal(store.data.schedules[0].startAt, '2026-08-23T09:00:00.000Z');
  service.completeTodo(todo.id);
  assert.ok(store.data.schedules[0].completedAt);
});

test('an untimed UI todo becomes an all-day schedule for today', () => {
  const store = makeStore();
  let id = 0;
  const service = createPlanningService({
    store,
    makeId: (kind) => `${kind}-${++id}`,
    now: () => new Date('2026-08-22T10:00:00.000Z')
  });
  service.saveTodoWithSchedule({ title: '今天复盘', dueAt: null });
  assert.equal(store.data.schedules.length, 1);
  assert.equal(store.data.schedules[0].allDay, true);
  assert.equal(new Date(store.data.schedules[0].startAt).getDate(), new Date('2026-08-22T10:00:00.000Z').getDate());
});

test('creates a task and its execution block in one atomic workspace write', () => {
  const store = makeStore();
  let id = 0;
  let writes = 0;
  const originalUpdate = store.updateWorkspace.bind(store);
  store.updateWorkspace = (updater) => {
    writes += 1;
    return originalUpdate(updater);
  };
  const service = createPlanningService({
    store,
    makeId: (kind) => `${kind}-${++id}`,
    now: () => new Date('2026-08-31T08:00:00.000Z')
  });
  const result = service.createScheduledTodo({
    todo: { title: '修改论文', dueAt: '2026-09-03T09:00:00.000Z', priority: 'high' },
    schedule: { title: '修改论文', startAt: '2026-09-03T07:00:00.000Z', endAt: '2026-09-03T09:00:00.000Z' }
  });
  assert.equal(writes, 1);
  assert.equal(store.data.todos.length, 1);
  assert.equal(store.data.schedules.length, 1);
  assert.deepEqual(result.schedule.sourceRef, { type: 'todo', id: result.todo.id });
  assert.equal(result.todo.reminderMode, 'none');
  assert.equal(result.todo.priority, 'high');
  assert.equal(result.todo.legacy.managedBySchedule, true);
  const moved = service.saveSchedule({
    ...result.schedule,
    title: '修改论文终稿',
    priority: 'medium',
    startAt: '2026-09-04T07:00:00.000Z',
    endAt: '2026-09-04T09:00:00.000Z'
  });
  const syncedTodo = store.data.todos.find((item) => item.id === result.todo.id);
  assert.equal(moved.startAt, '2026-09-04T07:00:00.000Z');
  assert.equal(syncedTodo.title, '修改论文终稿');
  assert.equal(syncedTodo.priority, 'medium');
  assert.equal(syncedTodo.dueAt, '2026-09-04T09:00:00.000Z');
  assert.equal(syncedTodo.reminderMode, 'none');
});

test('converts a normal schedule to a linked todo and supports removing the source block', () => {
  const store = makeStore();
  let id = 0;
  const service = createPlanningService({ store, makeId: (kind) => `${kind}-${++id}`, now: () => new Date('2026-08-22T10:00:00.000Z') });
  const schedule = service.saveSchedule({ title: '整理样品', startAt: '2026-08-24T09:00:00.000Z', endAt: '2026-08-24T10:00:00.000Z' });
  const result = service.convertScheduleToTodo(schedule.id, { mode: 'remove-schedule' });
  assert.equal(result.todo.title, '整理样品');
  assert.equal(result.schedule, null);
  assert.equal(store.data.schedules.length, 0);
  assert.equal(store.data.todos.length, 1);
});

test('converting a todo to a schedule removes the outcome and unlinks its existing blocks in one commit', () => {
  const store = makeStore();
  let id = 0;
  const service = createPlanningService({ store, makeId: (kind) => `${kind}-${++id}`, now: () => new Date('2026-08-22T10:00:00.000Z') });
  const todo = service.saveTodo({ title: '写讨论', dueAt: '2026-08-25T10:00:00.000Z' });
  service.scheduleTodo(todo.id, { startAt: '2026-08-23T09:00:00.000Z', endAt: '2026-08-23T10:00:00.000Z' });
  const result = service.convertTodoToSchedule(todo.id, { startAt: '2026-08-25T09:00:00.000Z', endAt: '2026-08-25T10:00:00.000Z' });
  assert.equal(result.schedule.title, '写讨论');
  assert.equal(store.data.todos.length, 0);
  assert.equal(store.data.schedules.length, 2);
  assert.equal(store.data.schedules.filter((item) => item.sourceRef).length, 0);
});

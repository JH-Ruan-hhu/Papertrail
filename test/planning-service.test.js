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

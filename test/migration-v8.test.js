'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema7To8, normalizeSettings } = require('../src/migration-core');

const oldSchedule = {
  id: 'schedule-1',
  title: '提交初稿',
  startAt: '2026-08-25T09:00:00.000Z',
  endAt: '2026-08-25T10:00:00.000Z',
  deadline: true,
  completedAt: null,
  remindedAt: '2026-08-24T09:00:00.000Z',
  priority: 'high',
  createdAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:00:00.000Z'
};

test('migrates legacy deadline schedules to stable todos and leaves ordinary events as schedules', () => {
  const result = migrateSchema7To8({
    version: 7,
    settings: { scheduleWidgetEnabled: true },
    schedules: [oldSchedule, { id: 'event-1', title: '组会', startAt: '2026-08-25T13:00:00.000Z', endAt: '2026-08-25T14:00:00.000Z' }],
    papers: [],
    notes: [],
    metadataFields: [],
    attendance: [],
    focusSessions: [],
    futureMetadata: { keep: true }
  }, { defaultSettings: { appearanceTheme: 'liquid-glass', todayWidgetEnabled: false } });
  assert.equal(result.data.version, 8);
  assert.equal(result.data.todos.length, 1);
  assert.equal(result.data.todos[0].id, 'todo_schedule-1');
  assert.equal(result.data.todos[0].title, '提交初稿');
  assert.equal(result.data.todos[0].dueAt, '2026-08-25T09:00:00.000Z');
  assert.equal(result.data.todos[0].legacy.migratedFrom, 'schedule');
  assert.equal(result.data.todos[0].legacy.sourceType, 'schedule-deadline');
  assert.equal(result.data.schedules.length, 1);
  assert.equal(result.data.schedules[0].id, 'event-1');
  assert.equal(result.data.settings.todayWidgetEnabled, true);
  assert.equal('scheduleWidgetEnabled' in result.data.settings, false);
  assert.deepEqual(result.data.futureMetadata, { keep: true });
  assert.equal(result.changed, true);
});

test('adds collision suffixes and preserves completed/reminded legacy state', () => {
  const result = migrateSchema7To8({
    version: 7,
    settings: {},
    todos: [{ id: 'todo_schedule-1', title: '已有待办' }],
    schedules: [{ ...oldSchedule, completedAt: '2026-08-25T09:30:00.000Z' }]
  }, { defaultSettings: {} });
  assert.equal(result.data.todos[1].id, 'todo_schedule-1_2');
  assert.equal(result.data.todos[1].status, 'completed');
  assert.equal(result.data.todos[1].completedAt, '2026-08-25T09:30:00.000Z');
  assert.equal(result.data.todos[1].reminderSentAt, '2026-08-24T09:00:00.000Z');
});

test('rejects future versions and invalid collection shapes before writing', () => {
  assert.throws(() => migrateSchema7To8({ version: 9 }), /更高版本/);
  assert.throws(() => migrateSchema7To8({ version: 7, schedules: {} }), /日程列表格式无效/);
});

test('normalizes theme, widget, event and todo reminder defaults', () => {
  const settings = normalizeSettings({ scheduleWidgetEnabled: true, appearanceTheme: 'unknown', widgetShowTodos: false }, { defaultEventReminderMinutes: 5 });
  assert.equal(settings.todayWidgetEnabled, true);
  assert.equal(settings.appearanceTheme, 'liquid-glass');
  assert.equal(settings.widgetShowTodos, false);
  assert.equal(settings.defaultEventReminderMinutes, 5);
  assert.equal(settings.defaultTodoReminderMode, 'at-due');
});

test('keeps an old ordinary schedule reminder marker in legacy without scheduling a new reminder', () => {
  const result = migrateSchema7To8({
    version: 7,
    settings: {},
    schedules: [{ ...oldSchedule, id: 'event-legacy', deadline: false }]
  }, { defaultSettings: {} });
  assert.equal(result.data.schedules[0].reminderSentAt, null);
  assert.equal(result.data.schedules[0].legacy.remindedAt, '2026-08-24T09:00:00.000Z');
});

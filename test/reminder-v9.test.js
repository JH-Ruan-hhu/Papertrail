'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReminderPayload } = require('../src/reminder-core');

test('normalizes todo reminder payload with the real title and safe preview', () => {
  const payload = normalizeReminderPayload({
    id: 'todo-1',
    title: '提交 LC-MS/MS 结果',
    notes: '第一行\n第二行\t不泄露路径 https://example.invalid/secret',
    dueAt: '2026-08-25T08:30:00.000Z',
    priority: 'high',
    status: 'open'
  }, 'todo', 'overdue');
  assert.deepEqual(payload, {
    kind: 'todo',
    level: 'overdue',
    id: 'todo-1',
    title: '提交 LC-MS/MS 结果',
    notesPreview: '第一行 第二行 不泄露路径 链接',
    priority: 'high',
    scheduledAt: '2026-08-25T08:30:00.000Z',
    overdue: true
  });
});

test('a due-time reminder is not relabeled overdue by renderer latency', () => {
  const payload = normalizeReminderPayload({
    id: 'todo-due-now',
    title: '准时提交',
    dueAt: '2000-01-01T00:00:00.000Z',
    priority: 'high',
    status: 'open'
  }, 'todo', 'reminder');
  assert.equal(payload.level, 'reminder');
  assert.equal(payload.overdue, false);
});

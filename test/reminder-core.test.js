'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectReminderCandidates,
  eventReminderAt,
  eventReminderDue,
  suppressDuplicate
} = require('../src/reminder-core');

const now = new Date('2026-08-22T10:00:00.000Z');

test('calculates event reminders and applies the missed-event grace window', () => {
  const schedule = {
    id: 'event-1',
    startAt: '2026-08-22T10:10:00.000Z',
    endAt: '2026-08-22T11:00:00.000Z',
    reminderMinutesBefore: 15
  };
  assert.equal(eventReminderAt(schedule), Date.parse('2026-08-22T09:55:00.000Z'));
  assert.equal(eventReminderDue(schedule, now), true);
  assert.equal(eventReminderDue({ ...schedule, startAt: '2026-08-22T08:00:00.000Z', endAt: '2026-08-22T09:00:00.000Z' }, now), false);
});

test('does not remind an all-day event unless its reminder is at the start of the day', () => {
  const schedule = { id: 'day', allDay: true, startAt: '2026-08-22T00:00:00.000Z', endAt: '2026-08-23T00:00:00.000Z', reminderMinutesBefore: 10 };
  assert.equal(eventReminderDue(schedule, now), false);
  assert.equal(eventReminderDue({ ...schedule, reminderMinutesBefore: 0 }, now), false);
});

test('collects event, todo reminder and overdue candidates with separate stable keys', () => {
  const candidates = collectReminderCandidates({
    now,
    schedules: [{ id: 'event', startAt: '2026-08-22T10:05:00.000Z', endAt: '2026-08-22T11:00:00.000Z', reminderMinutesBefore: 10 }],
    todos: [{ id: 'todo', status: 'open', dueAt: '2026-08-22T09:00:00.000Z', reminderMode: 'at-due', reminderAt: '2026-08-22T09:00:00.000Z' }]
  });
  assert.deepEqual(candidates.map((item) => item.type), ['event', 'todo', 'todo']);
  assert.notEqual(candidates[1].key, candidates[2].key);
  const seen = new Set();
  assert.equal(suppressDuplicate(seen, candidates[0].key), false);
  assert.equal(suppressDuplicate(seen, candidates[0].key), true);
});

test('respects separate event and todo notification switches', () => {
  const candidates = collectReminderCandidates({
    now,
    settings: { eventNotifications: false, todoNotifications: false },
    schedules: [{ id: 'event', startAt: '2026-08-22T10:05:00.000Z', endAt: '2026-08-22T11:00:00.000Z', reminderMinutesBefore: 10 }],
    todos: [{ id: 'todo', status: 'open', dueAt: '2026-08-22T09:00:00.000Z', reminderMode: 'at-due', reminderAt: '2026-08-22T09:00:00.000Z' }]
  });
  assert.deepEqual(candidates, []);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  closeStaleAttendanceRecords,
  normalizeAttendance,
  normalizeFocusSession,
  normalizeMetadataField,
  parseNaturalLanguageSchedule,
  parseNaturalLanguageSchedules,
  saveAttendance,
  saveFocusSession,
  saveNote,
  saveSchedule
} = require('../src/workbench-core');

test('parses Chinese relative date, day part and a multi-hour range', () => {
  const parsed = parseNaturalLanguageSchedule('明天下午3点到5点组会 !!', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '组会');
  assert.equal(parsed.priority, 'medium');
  assert.equal(parsed.deadline, false);
  const start = new Date(parsed.startAt);
  const end = new Date(parsed.endAt);
  assert.equal(start.getDate(), 23);
  assert.equal(start.getHours(), 15);
  assert.equal(end.getHours(), 17);
  assert.ok(parsed.matches.some((match) => match.text.includes('3点到5点')));
});

test('removes the connector between a relative date and its clock phrase', () => {
  const parsed = parseNaturalLanguageSchedule('明天的下午四点去污水厂采样', new Date(2026, 7, 22, 10, 0));
  const start = new Date(parsed.startAt);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '去污水厂采样');
  assert.equal(start.getDate(), 23);
  assert.equal(start.getHours(), 16);
  assert.equal(start.getMinutes(), 0);
});

test('splits multiple explicitly timed clauses and inherits their date', () => {
  const parsed = parseNaturalLanguageSchedules('明天上午八点去采样，下午五点去洗澡', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.schedules.length, 2);
  assert.deepEqual(parsed.schedules.map((item) => item.title), ['去采样', '去洗澡']);
  assert.deepEqual(parsed.schedules.map((item) => new Date(item.startAt).getHours()), [8, 17]);
  assert.deepEqual(parsed.schedules.map((item) => new Date(item.startAt).getDate()), [23, 23]);
  assert.ok(parsed.matches.some((match) => match.text.includes('下午')));
});

test('marks urgent deadline text and gives a one-hour default duration', () => {
  const parsed = parseNaturalLanguageSchedule('后天早上九点截止提交初稿 紧急', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.deadline, true);
  assert.equal(new Date(parsed.startAt).getHours(), 9);
  assert.equal(Date.parse(parsed.endAt) - Date.parse(parsed.startAt), 60 * 60_000);
});

test('uses compact priority tags and defaults untagged capture to green', () => {
  const now = new Date(2026, 7, 22, 10, 0);
  const high = parseNaturalLanguageSchedule('今天下午六点处理样品 #1', now);
  const medium = parseNaturalLanguageSchedule('明天上午九点写稿 ＃2', now);
  const low = parseNaturalLanguageSchedule('后天下午三点复盘 #3', now);
  const defaultLow = parseNaturalLanguageSchedule('今天下午四点读文献', now);
  assert.equal(high.priority, 'high');
  assert.equal(medium.priority, 'medium');
  assert.equal(low.priority, 'low');
  assert.equal(defaultLow.priority, 'low');
  assert.equal(high.title, '处理样品');
  assert.ok(high.matches.some((match) => match.text === '#1'));
});

test('creates and updates schedules without losing reminder state unnecessarily', () => {
  const now = '2026-08-22T01:00:00.000Z';
  const initial = saveSchedule([], {
    title: '跑样',
    startAt: '2026-08-23T01:00:00.000Z',
    endAt: '2026-08-23T02:00:00.000Z',
    priority: 'low',
    deadline: true
  }, now, () => 'schedule-1');
  const reminded = [{ ...initial[0], remindedAt: '2026-08-23T01:00:00.000Z' }];
  const updated = saveSchedule(reminded, { ...reminded[0], title: '继续跑样' }, '2026-08-22T02:00:00.000Z');
  assert.equal(updated[0].title, '继续跑样');
  assert.equal(updated[0].remindedAt, reminded[0].remindedAt);
});

test('notes preserve typed metadata and metadata fields support custom selects', () => {
  const field = normalizeMetadataField({ id: 'method', name: '实验方法', type: 'select', options: ['LC-MS/MS', 'LC-MS/MS', 'GC-MS'] });
  assert.deepEqual(field.options, ['LC-MS/MS', 'GC-MS']);
  const notes = saveNote([], { content: '今天完成质控', metadata: { method: 'LC-MS/MS', reviewed: true } }, '2026-08-22T02:00:00.000Z', () => 'note-1');
  assert.equal(notes[0].title, '今天完成质控');
  assert.equal(notes[0].metadata.reviewed, true);
});

test('attendance supports multiple work segments per day and validates clock order', () => {
  const created = saveAttendance([], {
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:00:00.000Z',
    clockOutAt: '2026-08-22T09:30:00.000Z'
  }, '2026-08-22T10:00:00.000Z', () => 'attendance-1');
  const second = saveAttendance(created, {
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:15:00.000Z',
    clockOutAt: '2026-08-22T03:00:00.000Z',
    appUsage: { WINWORD: 480 }
  }, '2026-08-22T11:00:00.000Z', () => 'attendance-2');
  assert.equal(second.length, 2);
  assert.equal(second[0].id, 'attendance-2');
  assert.equal(second[0].appUsage.WINWORD, 480);
  const updated = saveAttendance(second, {
    id: 'attendance-1',
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:10:00.000Z',
    clockOutAt: '2026-08-22T09:30:00.000Z'
  }, '2026-08-22T12:00:00.000Z');
  assert.equal(updated.length, 2);
  assert.equal(updated.find((item) => item.id === 'attendance-1').clockInAt, '2026-08-22T01:10:00.000Z');
  assert.throws(() => normalizeAttendance({
    date: '2026-08-22',
    clockInAt: '2026-08-22T09:00:00.000Z',
    clockOutAt: '2026-08-22T08:00:00.000Z'
  }), /下班时间必须晚于上班时间/);
});

test('closes an unfinished previous-day attendance segment at local midnight', () => {
  const records = [{
    id: 'attendance-stale',
    date: '2026-08-22',
    clockInAt: new Date(2026, 7, 22, 9, 0).toISOString(),
    clockOutAt: null,
    appUsage: { chrome: 120 },
    createdAt: new Date(2026, 7, 22, 9, 0).toISOString(),
    updatedAt: new Date(2026, 7, 22, 9, 0).toISOString()
  }];
  const now = new Date(2026, 7, 23, 9, 0);
  const result = closeStaleAttendanceRecords(records, now, now.toISOString());
  assert.equal(result.changed, true);
  assert.equal(result.records[0].clockOutAt, new Date(2026, 7, 23, 0, 0).toISOString());
  assert.deepEqual(result.records[0].appUsage, { chrome: 120 });
  assert.equal(result.records[0].updatedAt, now.toISOString());
  assert.equal(closeStaleAttendanceRecords(result.records, now).changed, false);
});

test('focus sessions retain local app usage and validate their time range', () => {
  const sessions = saveFocusSession([], {
    startedAt: '2026-08-22T01:00:00.000Z',
    endedAt: '2026-08-22T01:25:00.000Z',
    plannedMinutes: 25,
    status: 'completed',
    appUsage: { chrome: 600, WINWORD: 420 }
  }, '2026-08-22T01:25:00.000Z', () => 'focus-1');
  assert.equal(sessions[0].id, 'focus-1');
  assert.equal(sessions[0].appUsage.chrome, 600);
  assert.equal(sessions[0].plannedMinutes, 25);
  assert.throws(() => normalizeFocusSession({
    startedAt: '2026-08-22T02:00:00.000Z',
    endedAt: '2026-08-22T01:00:00.000Z'
  }), /结束时间无效/);
});

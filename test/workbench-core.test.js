'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMetadataField,
  parseNaturalLanguageSchedule,
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

test('marks urgent deadline text and gives a one-hour default duration', () => {
  const parsed = parseNaturalLanguageSchedule('后天早上九点截止提交初稿 紧急', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.deadline, true);
  assert.equal(new Date(parsed.startAt).getHours(), 9);
  assert.equal(Date.parse(parsed.endAt) - Date.parse(parsed.startAt), 60 * 60_000);
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

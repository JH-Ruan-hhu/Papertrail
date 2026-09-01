'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteCountdown, normalizeCountdown, saveCountdown } = require('../src/countdown-core');

test('creates and edits an independent countdown', () => {
  const created = saveCountdown([], {
    title: '论文返修截止',
    targetAt: '2026-09-20T10:00:00.000Z'
  }, '2026-08-31T10:00:00.000Z', () => 'countdown-1');
  assert.equal(created.countdown.id, 'countdown-1');
  assert.equal(created.countdown.title, '论文返修截止');
  const edited = saveCountdown(created.countdowns, {
    id: 'countdown-1',
    title: '提交返修稿',
    targetAt: '2026-09-21T12:00:00.000Z'
  }, '2026-09-01T10:00:00.000Z');
  assert.equal(edited.countdowns.length, 1);
  assert.equal(edited.countdown.title, '提交返修稿');
  assert.equal(edited.countdown.createdAt, '2026-08-31T10:00:00.000Z');
});

test('normalizes and deletes countdowns without involving todos or schedules', () => {
  assert.equal(normalizeCountdown({ title: '', targetAt: 'bad' }), null);
  const normalized = normalizeCountdown({ id: 'ddl', title: ' DDL ', targetAt: '2026-09-15T08:00:00Z' });
  assert.equal(normalized.title, 'DDL');
  assert.deepEqual(deleteCountdown([normalized], 'ddl'), []);
  assert.throws(() => deleteCountdown([normalized], 'missing'), /找不到/);
});

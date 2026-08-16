'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { importantChanges } = require('../src/notification-core');

test('marks status changes and completed reviews as important', () => {
  const previous = { status: { raw: 3, label: '审稿中' }, counts: { accepted: 1, completed: 0 } };
  const current = { status: { raw: 4, label: '所需审稿已完成' }, counts: { accepted: 1, completed: 1 } };
  assert.deepEqual(importantChanges(previous, current), [
    '状态：审稿中 → 所需审稿已完成',
    '收到新的审稿回复：0 → 1'
  ]);
});

test('marks new production milestones as important', () => {
  const previous = {
    kind: 'production',
    productionEvents: [{ id: 'received', dateText: '20 Jun 2026', label: '已进入出版流程' }]
  };
  const current = {
    kind: 'production',
    productionEvents: [
      { id: 'proofsAvailable', dateText: '6 Jul 2026', label: '校样已到，请及时检查' },
      { id: 'received', dateText: '20 Jun 2026', label: '已进入出版流程' }
    ]
  };
  assert.deepEqual(importantChanges(previous, current), ['校样已到，请及时检查']);
});

test('ignores unchanged review progress', () => {
  const snapshot = { status: { raw: 3, label: '审稿中' }, counts: { accepted: 1, completed: 0 } };
  assert.deepEqual(importantChanges(snapshot, structuredClone(snapshot)), []);
});

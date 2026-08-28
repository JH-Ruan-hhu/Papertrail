'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema8To9 } = require('../src/migration-core');

test('migrates schema 8 daily notes by local date without changing standalone notes', () => {
  const source = {
    version: 8,
    notes: [
      {
        id: 'daily-late',
        kind: 'daily',
        dateKey: '2026-08-24',
        title: '2026年8月24日',
        entries: [{ id: 'entry-b', createdAt: '2026-08-24T09:00:00.000Z', content: '后写内容' }]
      },
      {
        id: 'daily-early',
        kind: 'daily',
        dateKey: '2026-08-24',
        title: '2026年8月24日',
        entries: [{ id: 'entry-a', createdAt: '2026-08-24T08:00:00.000Z', content: '先写内容' }]
      },
      {
        id: 'standalone-1',
        kind: 'standalone',
        title: '自定义研究标题',
        content: '第一行仍然是正文\n第二行也是正文',
        metadata: { topic: '实验' }
      }
    ]
  };
  const result = migrateSchema8To9(source, { fallbackAt: '2026-08-24T00:00:00.000Z' });
  assert.equal(result.data.version, 9);
  assert.equal(result.data.notes.filter((note) => note.kind === 'daily').length, 1);
  const daily = result.data.notes.find((note) => note.kind === 'daily');
  assert.deepEqual(daily.entries, []);
  assert.equal(daily.content, '<p>先写内容</p><p><br></p><p>后写内容</p>');
  assert.deepEqual(daily.attachments, []);
  const standalone = result.data.notes.find((note) => note.id === 'standalone-1');
  assert.equal(standalone.title, '自定义研究标题');
  assert.equal(standalone.content, source.notes[2].content);
  assert.deepEqual(standalone.metadata, { topic: '实验' });
});

test('schema 9 migration is idempotent and rejects future versions', () => {
  const source = { version: 9, notes: [{ id: 'n1', kind: 'daily', dateKey: '2026-08-24', content: '同一条' }] };
  const first = migrateSchema8To9(source, { fallbackAt: '2026-08-24T00:00:00.000Z' });
  const second = migrateSchema8To9(first.data, { fallbackAt: '2026-08-24T00:00:00.000Z' });
  assert.deepEqual(second.data, first.data);
  assert.equal(second.changed, false);
  assert.throws(() => migrateSchema8To9({ version: 10, notes: [] }), /更高版本/);
});

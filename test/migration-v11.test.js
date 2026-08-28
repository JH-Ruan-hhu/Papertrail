'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema10To11 } = require('../src/migration-core');

function image(id, storedName) {
  return { id, storedName, originalName: storedName, mimeType: 'image/png', size: 12, createdAt: '2026-08-28T01:00:00.000Z' };
}

test('schema 11 turns legacy daily entries into one editable rich document', () => {
  const source = {
    version: 10,
    notes: [{
      id: 'daily-1', kind: 'daily', dateKey: '2026-08-28', title: '2026年8月28日',
      content: '旧版派生正文', metadata: { project: 'PFAS' }, revision: 7,
      createdAt: '2026-08-28T01:00:00.000Z', updatedAt: '2026-08-28T03:00:00.000Z',
      attachments: [image('a', 'a.png')],
      entries: [
        { id: 'third', createdAt: '2026-08-28T03:00:00.000Z', content: '<ul><li>第三段</li></ul>', attachments: [image('a', 'a.png')] },
        { id: 'first', createdAt: '2026-08-28T01:00:00.000Z', content: '<p><strong>第一段</strong></p>', attachments: [] },
        { id: 'second', createdAt: '2026-08-28T02:00:00.000Z', content: '<p><img data-note-attachment="b"></p>', attachments: [image('b', 'b.png')] }
      ]
    }]
  };
  const result = migrateSchema10To11(source);
  const note = result.data.notes[0];
  assert.equal(result.data.version, 11);
  assert.deepEqual(note.entries, []);
  assert.ok(note.content.indexOf('第一段') < note.content.indexOf('data-note-attachment="b"'));
  assert.ok(note.content.indexOf('data-note-attachment="b"') < note.content.indexOf('第三段'));
  assert.equal((note.content.match(/<p><br><\/p>/g) || []).length, 2);
  assert.deepEqual(note.attachments.map((item) => item.id), ['a', 'b']);
  assert.deepEqual(note.metadata, { project: 'PFAS' });
  assert.equal(note.revision, 7);
  assert.equal(note.createdAt, '2026-08-28T01:00:00.000Z');
  assert.equal(note.updatedAt, '2026-08-28T03:00:00.000Z');
});

test('schema 11 migration is idempotent and does not append legacy entries twice', () => {
  const first = migrateSchema10To11({ version: 10, notes: [{ kind: 'daily', dateKey: '2026-08-28', entries: [{ content: '唯一正文' }] }] });
  const second = migrateSchema10To11(first.data);
  assert.equal(second.changed, false);
  assert.deepEqual(second.data, first.data);
  assert.equal((second.data.notes[0].content.match(/唯一正文/g) || []).length, 1);
  assert.throws(() => migrateSchema10To11({ version: 12, notes: [] }), /更高版本/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/store');
const { normalizeNoteAttachment } = require('../src/workbench-core');

test('attachment metadata stays controlled and data-directory copies include attachments', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-attachments-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'papertrail-data.json');
  const store = new JsonStore(sourcePath);
  store.load();
  const attachment = normalizeNoteAttachment({ id: 'image-1', storedName: 'safe-image.png', originalName: '原图.png', mimeType: 'image/png', size: 4 }, 0, new Date(0).toISOString());
  assert.throws(() => normalizeNoteAttachment({ storedName: '../outside.png', mimeType: 'image/png' }), /无效/);
  fs.writeFileSync(path.join(store.attachmentsDirectory, attachment.storedName), Buffer.from([1, 2, 3, 4]));
  store.setNotes([{ id: 'note-1', kind: 'standalone', title: '图片', content: '正文', attachments: [attachment], entries: [], metadata: {}, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }]);
  const target = path.join(directory, 'moved', 'papertrail-data.json');
  store.copyTo(target);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(target), 'attachments', attachment.storedName)), Buffer.from([1, 2, 3, 4]));
  assert.throws(() => store.copyTo(target), /已经存在/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./fixtures/v1.4.16-workspace.json');
const { JsonStore } = require('../src/store');
const { mergeImportedJobApplications } = require('../src/job-core');

test('v1.4.16 records survive load, settings write and reopen without losing business data', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-v1416-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'workspace.json');
  fs.writeFileSync(file, JSON.stringify(fixture));
  const store = new JsonStore(file);
  store.load();
  store.updateSettings({ refreshMinutes: 720 });
  const reopened = new JsonStore(file);
  reopened.load();
  for (const key of ['schedules', 'todos', 'notes', 'jobApplications', 'papers', 'countdowns', 'metadataFields', 'attendance', 'focusSessions', 'extensionFixture']) {
    assert.deepEqual(reopened.data[key], fixture[key], key);
  }
  assert.equal(reopened.listTodos()[0].dueAt, null);
  assert.equal(reopened.listNotes()[0].revision, 3);
  assert.equal(reopened.listJobApplications()[0].workflow.stages[1].name, '学术报告');
});

test('v1.4.16 job JSON import is idempotent and preserves custom stages', () => {
  const result = mergeImportedJobApplications(fixture.jobApplications, JSON.parse(JSON.stringify(fixture.jobApplications)));
  assert.deepEqual(result.jobs, fixture.jobApplications);
});

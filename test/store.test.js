'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JsonStore } = require('../src/store');

function validPaper(id = 'paper-1') {
  return {
    id,
    paperKey: `key-${id}`,
    source: 'elsevier',
    trackingSecret: 'encrypted-secret',
    addedAt: '2026-01-01T00:00:00.000Z',
    lastCheckedAt: '2026-01-02T00:00:00.000Z',
    lastError: null,
    snapshot: {
      kind: 'review',
      title: 'A paper',
      journal: 'A journal',
      status: { raw: 3, label: '审稿中', tone: 'blue' },
      counts: { invited: 1, accepted: 0, completed: 0 }
    },
    history: [{ checkedAt: '2026-01-02T00:00:00.000Z', status: { raw: 3 }, changes: ['首次记录'] }]
  };
}

test('persists settings and papers atomically', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  const store = new JsonStore(filePath);
  store.load();
  assert.equal(store.getSettings().refreshOnStartup, true);
  assert.equal(store.getSettings().stickyNoteShortcut, 'CommandOrControl+Alt+N');
  assert.equal(store.getSettings().scheduleWidgetEnabled, false);
  store.updateSettings({ refreshMinutes: 720, stickyNoteShortcut: 'CommandOrControl+Alt+B', scheduleWidgetEnabled: true });
  store.addPaper(validPaper());

  const reloaded = new JsonStore(filePath);
  reloaded.load();
  assert.equal(reloaded.getSettings().refreshMinutes, 720);
  assert.equal(reloaded.getSettings().stickyNoteShortcut, 'CommandOrControl+Alt+B');
  assert.equal(reloaded.getSettings().scheduleWidgetEnabled, true);
  assert.equal(reloaded.findPaper('paper-1').paperKey, 'key-paper-1');
  assert.equal(fs.existsSync(`${filePath}.tmp`), false);
});

test('updates and removes a paper', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new JsonStore(path.join(directory, 'data.json'));
  store.load();
  store.addPaper({ ...validPaper(), value: 1 });
  store.updatePaper('paper-1', (paper) => ({ ...paper, value: 2 }));
  assert.equal(store.findPaper('paper-1').value, 2);
  store.removePaper('paper-1');
  assert.equal(store.listPapers().length, 0);
});

test('persists attendance records in the local store', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-attendance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  const store = new JsonStore(filePath);
  store.load();
  store.setAttendance([{
    id: 'attendance-1',
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:00:00.000Z',
    clockOutAt: '2026-08-22T09:00:00.000Z',
    createdAt: '2026-08-22T01:00:00.000Z',
    updatedAt: '2026-08-22T09:00:00.000Z'
  }]);
  const reloaded = new JsonStore(filePath);
  reloaded.load();
  assert.equal(reloaded.listAttendance().length, 1);
  assert.equal(reloaded.listAttendance()[0].date, '2026-08-22');
});

test('persists focus sessions and foreground app usage', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-focus-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  const store = new JsonStore(filePath);
  store.load();
  store.setFocusSessions([{
    id: 'focus-1',
    startedAt: '2026-08-22T01:00:00.000Z',
    endedAt: '2026-08-22T01:50:00.000Z',
    plannedMinutes: 50,
    status: 'completed',
    appUsage: { WINWORD: 1800 },
    suppressNotifications: true,
    notificationsSuppressed: true,
    notificationRestore: null,
    notificationRestoredAt: '2026-08-22T01:50:00.000Z',
    notificationError: null,
    createdAt: '2026-08-22T01:00:00.000Z',
    updatedAt: '2026-08-22T01:50:00.000Z'
  }]);
  const reloaded = new JsonStore(filePath);
  reloaded.load();
  assert.equal(reloaded.listFocusSessions()[0].appUsage.WINWORD, 1800);
});

test('copies current data to a new storage location without deleting the original', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-move-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalPath = path.join(directory, 'original', 'papertrail-data.json');
  const targetPath = path.join(directory, 'new-location', 'papertrail-data.json');
  const store = new JsonStore(originalPath);
  store.load();
  store.addPaper(validPaper());

  store.copyTo(targetPath);

  const relocated = new JsonStore(targetPath);
  relocated.load();
  assert.equal(relocated.findPaper('paper-1').paperKey, 'key-paper-1');
  assert.equal(fs.existsSync(originalPath), true);
  assert.throws(() => store.copyTo(targetPath), /已经存在/);
});

test('persists unread state, read state, archive and restore', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-state-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'papertrail-data.json');
  const store = new JsonStore(filePath);
  store.load();
  store.addPaper({
    ...validPaper(),
    importantUpdates: [{
      id: 'update-1', occurredAt: '2026-01-03T00:00:00.000Z',
      content: '收到新的审稿回复', isRead: false, readAt: null
    }],
    archivedAt: '2026-01-04T00:00:00.000Z'
  });

  const reloaded = new JsonStore(filePath);
  reloaded.load();
  assert.equal(reloaded.findPaper('paper-1').importantUpdates[0].isRead, false);
  assert.equal(reloaded.findPaper('paper-1').archivedAt, '2026-01-04T00:00:00.000Z');
  reloaded.updatePaper('paper-1', (paper) => ({
    ...paper,
    archivedAt: null,
    importantUpdates: paper.importantUpdates.map((update) => ({ ...update, isRead: true, readAt: '2026-01-05T00:00:00.000Z' }))
  }));
  const finalStore = new JsonStore(filePath);
  finalStore.load();
  assert.equal(finalStore.findPaper('paper-1').archivedAt, null);
  assert.equal(finalStore.findPaper('paper-1').importantUpdates[0].isRead, true);
});

test('refuses corrupt data without overwriting it', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-corrupt-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'papertrail-data.json');
  fs.writeFileSync(filePath, '{broken-json', 'utf8');
  const store = new JsonStore(filePath);
  assert.throws(() => store.load(), /无法解析，未写入任何内容/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), '{broken-json');
});

test('does not overwrite the original file when workflow migration fails', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-migration-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'papertrail-data.json');
  const original = JSON.stringify({
    version: 2,
    settings: {},
    papers: [{ ...validPaper(), tasks: [{ id: 'broken', type: 'revision', dueAt: 'not-a-date' }] }]
  });
  fs.writeFileSync(filePath, original, 'utf8');
  const store = new JsonStore(filePath);
  assert.throws(() => store.load(), /截止任务缺少有效截止时间/);
  assert.equal(fs.readFileSync(filePath, 'utf8'), original);
});

test('backs up the source schema before the first current-schema write and keeps unknown root fields', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'papertrail-store-v8-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'papertrail-data.json');
  const original = {
    version: 7,
    settings: { scheduleWidgetEnabled: true },
    papers: [],
    schedules: [{ id: 'event-1', title: '组会', startAt: '2026-08-25T01:00:00.000Z', endAt: '2026-08-25T02:00:00.000Z' }],
    notes: [],
    metadataFields: [],
    attendance: [],
    focusSessions: [],
    unknownRoot: { retained: true }
  };
  fs.writeFileSync(filePath, JSON.stringify(original), 'utf8');
  const store = new JsonStore(filePath);
  store.load();
  const migrated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const backups = fs.readdirSync(directory).filter((name) => name.startsWith('papertrail-data.pre-v7.') && name.endsWith('.json'));
  assert.equal(migrated.version, 11);
  assert.deepEqual(migrated.jobApplications, []);
  assert.deepEqual(migrated.unknownRoot, original.unknownRoot);
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, backups[0]), 'utf8')), original);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  migrateData,
  retryDelayMs,
  applyRefreshFailure,
  applyRefreshSuccess,
  appendImportantUpdates,
  markUpdatesRead,
  unreadCount,
  setArchived,
  actionState,
  filterAndSortPapers,
  buildPaperExport
} = require('../src/paper-core');
const { DEFAULT_SETTINGS } = require('../src/store');

function paper(overrides = {}) {
  return {
    id: 'paper-1',
    paperKey: 'key-1',
    source: 'elsevier',
    trackingSecret: 'ENCRYPTED-TRACKING-SECRET',
    addedAt: '2026-01-01T00:00:00.000Z',
    lastAttemptAt: '2026-01-05T00:00:00.000Z',
    lastSuccessfulAt: '2026-01-05T00:00:00.000Z',
    lastError: null,
    failureStreak: 0,
    nextRetryAt: null,
    archivedAt: null,
    snapshot: {
      kind: 'review',
      title: 'Water treatment manuscript',
      journal: 'Water Research',
      status: { raw: 3, label: '审稿中', tone: 'blue' },
      latestRevision: 1,
      counts: { invited: 2, accepted: 1, completed: 0 },
      productionEvents: []
    },
    history: [{ checkedAt: '2026-01-05T00:00:00.000Z', status: { raw: 3 }, changes: ['首次记录'] }],
    importantUpdates: [],
    ...overrides
  };
}

test('migrates 0.4.x data without treating a failed attempt as a success', () => {
  const legacy = paper({
    lastAttemptAt: undefined,
    lastSuccessfulAt: undefined,
    failureStreak: undefined,
    nextRetryAt: undefined,
    archivedAt: undefined,
    importantUpdates: undefined,
    lastCheckedAt: '2026-01-08T00:00:00.000Z',
    lastError: 'network failed'
  });
  const { data, changed } = migrateData({ version: 1, settings: {}, papers: [legacy] }, DEFAULT_SETTINGS);
  assert.equal(changed, true);
  assert.equal(data.version, 2);
  assert.equal(data.papers[0].lastAttemptAt, '2026-01-08T00:00:00.000Z');
  assert.equal(data.papers[0].lastSuccessfulAt, '2026-01-05T00:00:00.000Z');
  assert.equal(data.papers[0].failureStreak, 1);
  assert.equal(data.papers[0].nextRetryAt, '2026-01-08T00:15:00.000Z');
  assert.deepEqual(data.papers[0].importantUpdates, []);
});

test('creates unread updates and marking read preserves their content', () => {
  const withUpdate = appendImportantUpdates(
    paper(),
    ['收到新的审稿回复：0 → 1'],
    '2026-01-06T00:00:00.000Z',
    () => 'update-1'
  );
  assert.equal(unreadCount(withUpdate), 1);
  const read = markUpdatesRead(withUpdate, '2026-01-07T00:00:00.000Z');
  assert.equal(unreadCount(read), 0);
  assert.equal(read.importantUpdates[0].content, '收到新的审稿回复：0 → 1');
  assert.equal(read.importantUpdates[0].readAt, '2026-01-07T00:00:00.000Z');
});

test('failed refresh keeps the last success and backs off 15 minutes, one hour, then normal interval', () => {
  const first = applyRefreshFailure(paper(), 'offline', '2026-01-05T01:00:00.000Z', 360);
  assert.equal(first.lastSuccessfulAt, '2026-01-05T00:00:00.000Z');
  assert.equal(first.nextRetryAt, '2026-01-05T01:15:00.000Z');
  const second = applyRefreshFailure(first, 'offline', '2026-01-05T01:15:00.000Z', 360);
  assert.equal(second.nextRetryAt, '2026-01-05T02:15:00.000Z');
  const third = applyRefreshFailure(second, 'offline', '2026-01-05T02:15:00.000Z', 360);
  assert.equal(third.nextRetryAt, '2026-01-05T08:15:00.000Z');
  assert.equal(retryDelayMs(3, 360), 6 * 60 * 60_000);
});

test('successful refresh clears failure state and restores normal scheduling state', () => {
  const failed = applyRefreshFailure(paper(), 'offline', '2026-01-05T01:00:00.000Z', 360);
  const success = applyRefreshSuccess(
    failed,
    failed.snapshot,
    '2026-01-05T01:10:00.000Z',
    failed.history,
    failed.importantUpdates,
    '2026-01-05T01:09:00.000Z'
  );
  assert.equal(success.lastAttemptAt, '2026-01-05T01:09:00.000Z');
  assert.equal(success.lastSuccessfulAt, '2026-01-05T01:10:00.000Z');
  assert.equal(success.failureStreak, 0);
  assert.equal(success.nextRetryAt, null);
  assert.equal(success.lastError, null);
});

test('archives and restores without removing history or credentials', () => {
  const archived = setArchived(paper(), true, '2026-01-08T00:00:00.000Z');
  assert.equal(archived.archivedAt, '2026-01-08T00:00:00.000Z');
  assert.equal(archived.trackingSecret, 'ENCRYPTED-TRACKING-SECRET');
  assert.equal(archived.history.length, 1);
  const restored = setArchived(archived, false);
  assert.equal(restored.archivedAt, null);
  assert.equal(restored.history.length, 1);
});

test('sorts unread or actionable papers first and searches title, journal and production reference', () => {
  const ordinary = paper({ id: 'ordinary', addedAt: '2026-03-01T00:00:00.000Z' });
  const unread = appendImportantUpdates(
    paper({ id: 'unread', addedAt: '2026-01-01T00:00:00.000Z' }),
    ['状态变化'],
    '2026-02-01T00:00:00.000Z'
  );
  const actionable = paper({ id: 'action', needsAction: true, addedAt: '2025-01-01T00:00:00.000Z' });
  assert.deepEqual(filterAndSortPapers([ordinary, unread, actionable]).map((item) => item.id), ['unread', 'action', 'ordinary']);
  assert.equal(filterAndSortPapers([ordinary], { query: 'water research' }).length, 1);
  const production = paper({ id: 'prod', articleReference: 'ENPO_128847', title: 'Other', journal: 'Other' });
  assert.equal(filterAndSortPapers([production], { query: '128847' })[0].id, 'prod');
});

test('uses action-oriented status semantics for author work and completed publication', () => {
  const proofs = paper({
    source: 'elsevier-production',
    snapshot: { kind: 'production', status: { raw: 'production:proofsAvailable' }, productionEvents: [{ id: 'proofsAvailable', date: 10 }] }
  });
  assert.deepEqual(actionState(proofs), { category: 'action', label: '校样已到，请检查', tone: 'amber', needsAction: true, canArchive: false });
  const published = paper({
    source: 'elsevier-production',
    snapshot: { kind: 'production', status: { raw: 'production:finalArticleOnline' }, productionEvents: [{ id: 'finalArticleOnline', date: 20 }] }
  });
  assert.equal(actionState(published).label, '正式版本已上线，可以归档');
  assert.equal(actionState(published).canArchive, true);
});

test('exports Markdown and CSV without tracking or author-query credentials', () => {
  const sensitive = paper({
    maskedTrackingUrl: 'https://track.authorhub.elsevier.com/?uuid=••••4c1d',
    authorFirstName: 'SecretName',
    history: [{
      checkedAt: '2026-01-05T00:00:00.000Z',
      status: { raw: 3 },
      changes: ['参考 https://track.authorhub.elsevier.com/?uuid=FULL_SECRET_UUID_123456 与 3e1fe3f4-b6b2-451e-a9f1-145410724c1d']
    }]
  });
  for (const format of ['markdown', 'csv']) {
    const output = buildPaperExport(sensitive, format);
    assert.doesNotMatch(output, /ENCRYPTED-TRACKING-SECRET|FULL_SECRET_UUID_123456|SecretName|3e1fe3f4-b6b2-451e-a9f1-145410724c1d/);
    assert.doesNotMatch(output, /track\.authorhub\.elsevier\.com/);
    assert.match(output, /Water treatment manuscript/);
  }
});

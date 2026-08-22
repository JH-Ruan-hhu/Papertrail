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
  linkJourney,
  unlinkJourney,
  actionState,
  filterAndSortPapers,
  buildPaperExport,
  saveTask,
  completeTask,
  deleteTask,
  taskUrgency,
  tasksNeedingNotification,
  markTaskReminded,
  saveRevisionRound,
  deleteRevisionRound,
  updatePaperDetails
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
  assert.equal(data.version, 4);
  assert.equal(data.papers[0].lastAttemptAt, '2026-01-08T00:00:00.000Z');
  assert.equal(data.papers[0].lastSuccessfulAt, '2026-01-05T00:00:00.000Z');
  assert.equal(data.papers[0].failureStreak, 1);
  assert.equal(data.papers[0].nextRetryAt, '2026-01-08T00:15:00.000Z');
  assert.deepEqual(data.papers[0].importantUpdates, []);
  assert.equal(data.papers[0].journeyId, null);
  assert.deepEqual(data.papers[0].tasks, []);
  assert.deepEqual(data.papers[0].revisionRounds, []);
  assert.deepEqual(data.papers[0].details, {
    manuscriptId: null, handlingEditor: null, currentContact: null, dispositionNote: null, notes: null
  });
});

test('creates, completes, reopens and deletes deadline tasks with overdue evaluation', () => {
  const created = saveTask(paper(), {
    type: 'revision', title: '提交 R1 修回稿', dueAt: '2026-02-01T00:00:00.000Z'
  }, '2026-01-01T00:00:00.000Z', () => 'task-1');
  assert.equal(created.tasks[0].id, 'task-1');
  assert.equal(taskUrgency(created.tasks[0], '2026-02-02T00:00:00.000Z').state, 'overdue');
  const completed = completeTask(created, 'task-1', true, '2026-01-20T00:00:00.000Z');
  assert.equal(completed.tasks[0].completedAt, '2026-01-20T00:00:00.000Z');
  const reopened = completeTask(completed, 'task-1', false, '2026-01-21T00:00:00.000Z');
  assert.equal(reopened.tasks[0].completedAt, null);
  assert.equal(deleteTask(reopened, 'task-1').tasks.length, 0);
});

test('notifies once before a deadline and once again after it becomes overdue', () => {
  const withTask = saveTask(paper(), {
    type: 'proof', dueAt: '2026-01-03T00:00:00.000Z'
  }, '2026-01-01T00:00:00.000Z', () => 'task-1');
  const dueSoon = tasksNeedingNotification([withTask], '2026-01-02T00:00:00.000Z');
  assert.equal(dueSoon[0].urgency.state, 'due-soon');
  const reminded = markTaskReminded(withTask, 'task-1', 'due-soon', '2026-01-02T00:00:00.000Z');
  assert.equal(tasksNeedingNotification([reminded], '2026-01-02T12:00:00.000Z').length, 0);
  assert.equal(tasksNeedingNotification([reminded], '2026-01-04T00:00:00.000Z')[0].urgency.state, 'overdue');
});

test('manages revision rounds and supplemental manuscript details', () => {
  const detailed = updatePaperDetails(paper(), {
    manuscriptId: 'WR-26-001', handlingEditor: 'Dr. Editor', currentContact: 'Corresponding Author',
    dispositionNote: 'Transferred once', notes: 'Local note'
  });
  const withRound = saveRevisionRound(detailed, {
    round: 1, decisionType: 'Major revision', status: 'pending-revision',
    requestedAt: '2026-01-10T00:00:00.000Z', dueAt: '2026-02-10T00:00:00.000Z'
  }, '2026-01-10T00:00:00.000Z', () => 'revision-1');
  assert.equal(withRound.revisionRounds[0].round, 1);
  assert.equal(withRound.details.handlingEditor, 'Dr. Editor');
  const submitted = saveRevisionRound(withRound, {
    ...withRound.revisionRounds[0], status: 'waiting-decision', submittedAt: '2026-02-01T00:00:00.000Z'
  }, '2026-02-01T00:00:00.000Z');
  assert.equal(submitted.revisionRounds[0].status, 'waiting-decision');
  assert.equal(deleteRevisionRound(submitted, 'revision-1').revisionRounds.length, 0);
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

test('links multiple submissions into one journey and safely unlinks a member', () => {
  const first = paper({ id: 'first', journeyId: null, snapshot: { ...paper().snapshot, journal: 'Journal A' } });
  const second = paper({ id: 'second', journeyId: null, snapshot: { ...paper().snapshot, journal: 'Journal B' } });
  const third = paper({ id: 'third', journeyId: null, snapshot: { ...paper().snapshot, journal: 'Journal C' } });
  const linkedPair = linkJourney([first, second, third], 'second', 'first');
  assert.equal(linkedPair.find((item) => item.id === 'first').journeyId, 'first');
  assert.equal(linkedPair.find((item) => item.id === 'second').journeyId, 'first');
  assert.equal(linkedPair.find((item) => item.id === 'third').journeyId, null);
  const linkedAll = linkJourney(linkedPair, 'third', 'second');
  assert.equal(new Set(linkedAll.map((item) => item.journeyId)).size, 1);
  const unlinked = unlinkJourney(linkedAll, 'second');
  assert.equal(unlinked.find((item) => item.id === 'second').journeyId, null);
  assert.equal(unlinked.find((item) => item.id === 'first').journeyId, 'first');
  assert.equal(unlinked.find((item) => item.id === 'third').journeyId, 'first');
  const singletonCleanup = unlinkJourney(unlinked, 'third');
  assert.equal(singletonCleanup.find((item) => item.id === 'first').journeyId, null);
  assert.equal(singletonCleanup.find((item) => item.id === 'third').journeyId, null);
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

test('prioritizes overdue and due-soon tasks ahead of other actionable papers', () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const soon = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
  const overdue = new Date(Date.now() - 60 * 60_000).toISOString();
  const papers = [
    paper({ id: 'ordinary' }),
    saveTask(paper({ id: 'future' }), { type: 'followup', dueAt: future }, new Date().toISOString(), () => 't-future'),
    saveTask(paper({ id: 'soon' }), { type: 'proof', dueAt: soon }, new Date().toISOString(), () => 't-soon'),
    saveTask(paper({ id: 'overdue' }), { type: 'revision', dueAt: overdue }, new Date().toISOString(), () => 't-overdue')
  ];
  assert.deepEqual(filterAndSortPapers(papers).map((item) => item.id), ['overdue', 'soon', 'future', 'ordinary']);
});

test('uses action-oriented status semantics for author work and completed publication', () => {
  const revision = paper({
    revisionRounds: [{ id: 'r2', round: 2, decisionType: 'Major revision', status: 'pending-revision' }]
  });
  assert.equal(actionState(revision).label, 'R2 待修回');
  assert.equal(actionState(revision).needsAction, true);
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
    }],
    details: { manuscriptId: 'ENVPOL-D-26-02738', handlingEditor: 'Editor A', notes: 'Safe local note' },
    tasks: [{ id: 't1', type: 'revision', title: '提交 R1', dueAt: '2026-02-01T00:00:00.000Z', completedAt: null }],
    revisionRounds: [{ id: 'r1', round: 1, decisionType: 'Major revision', status: 'pending-revision', dueAt: '2026-02-01T00:00:00.000Z' }],
    snapshot: { ...paper().snapshot, events: [{ id: '1', type: 'REVIEWER_COMPLETED', revision: 1, date: 1769904000, observedAt: '2026-02-01T00:00:00.000Z' }] }
  });
  for (const format of ['markdown', 'csv']) {
    const output = buildPaperExport(sensitive, format);
    assert.doesNotMatch(output, /ENCRYPTED-TRACKING-SECRET|FULL_SECRET_UUID_123456|SecretName|3e1fe3f4-b6b2-451e-a9f1-145410724c1d/);
    assert.doesNotMatch(output, /track\.authorhub\.elsevier\.com/);
    assert.match(output, /Water treatment manuscript/);
    assert.match(output, /ENVPOL-D-26-02738|提交 R1|Major revision/);
  }
});

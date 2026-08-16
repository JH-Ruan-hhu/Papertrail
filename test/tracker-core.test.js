'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTrackingInput,
  normalizeTrackerPayload,
  snapshotFingerprint,
  describeChanges,
  maskTrackingUrl,
  getStageStartedAt
} = require('../src/tracker-core');

const UUID = '3e1fe3f4-b6b2-451e-a9f1-145410724c1d';

test('accepts and canonicalizes an Elsevier tracking URL', () => {
  const result = parseTrackingInput(`https://track.authorhub.elsevier.com/?utm_source=email&uuid=${UUID}`);
  assert.equal(result.uuid, UUID);
  assert.equal(result.canonicalUrl, `https://track.authorhub.elsevier.com/?uuid=${UUID}`);
  assert.match(result.endpoint, /execute-api\.us-east-1\.amazonaws\.com\/tracker\//);
});

test('accepts a bare tracking UUID', () => {
  const result = parseTrackingInput(UUID);
  assert.equal(result.uuid, UUID);
});

test('identifies Elsevier article Share Links as non-tracking links', () => {
  assert.throws(
    () => parseTrackingInput('https://authors.elsevier.com/c/example_token'),
    /论文阅读 Share Link，不是投稿状态追踪链接/
  );
});

test('rejects lookalike and insecure tracking hosts', () => {
  assert.throws(() => parseTrackingInput(`http://track.authorhub.elsevier.com/?uuid=${UUID}`));
  assert.throws(() => parseTrackingInput(`https://track.authorhub.elsevier.com.evil.test/?uuid=${UUID}`));
  assert.throws(() => parseTrackingInput('not a url'));
});

test('normalizes reviewer events for the latest revision', () => {
  const snapshot = normalizeTrackerPayload({
    ManuscriptTitle: 'A manuscript',
    JournalName: 'A journal',
    Status: 3,
    LatestRevisionNumber: 2,
    SubmissionDate: 1700000000,
    ReviewEvents: [
      { Revision: 1, Event: 'REVIEWER_COMPLETED', Id: 1, Date: 1700000010 },
      { Revision: 2, Event: 'REVIEWER_INVITED', Id: 2, Date: 1700000020 },
      { Revision: 2, Event: 'REVIEWER_ACCEPTED', Id: 2, Date: 1700000030 },
      { Revision: 2, Event: 'REVIEWER_INVITED', Id: 3, Date: 1700000040 }
    ]
  });

  assert.equal(snapshot.title, 'A manuscript');
  assert.equal(snapshot.status.label, '审稿中');
  assert.deepEqual(snapshot.counts, { invited: 2, accepted: 1, completed: 0 });
});

test('shows an explicit label for an unknown Elsevier status code', () => {
  const snapshot = normalizeTrackerPayload({
    ManuscriptTitle: 'A manuscript', JournalName: 'A journal', Status: 999,
    LatestRevisionNumber: 0, ReviewEvents: []
  });
  assert.equal(snapshot.status.label, '未识别状态（代码 999）');
  assert.equal(snapshot.status.tone, 'neutral');
});

test('fingerprint ignores cosmetic metadata but detects progress changes', () => {
  const previous = normalizeTrackerPayload({
    ManuscriptTitle: 'Old title', Status: 8, LatestRevisionNumber: 0, ReviewEvents: []
  });
  const sameProgress = normalizeTrackerPayload({
    ManuscriptTitle: 'New title', Status: 8, LatestRevisionNumber: 0, ReviewEvents: []
  });
  assert.equal(snapshotFingerprint(previous), snapshotFingerprint(sameProgress));

  const changed = normalizeTrackerPayload({
    ManuscriptTitle: 'New title', Status: 3, LatestRevisionNumber: 0,
    ReviewEvents: [{ Revision: 0, Event: 'REVIEWER_INVITED', Id: 1 }]
  });
  assert.notEqual(snapshotFingerprint(previous), snapshotFingerprint(changed));
  assert.deepEqual(describeChanges(previous, changed), [
    '状态：编辑处理中 → 审稿中',
    '邀请审稿人：0 → 1'
  ]);
});

test('masks the secret part of the tracking URL', () => {
  const masked = maskTrackingUrl(`https://track.authorhub.elsevier.com/?uuid=${UUID}`);
  assert.equal(masked, 'https://track.authorhub.elsevier.com/?uuid=••••4c1d');
  assert.equal(masked.includes(UUID), false);
});

test('finds the latest start of the current status stage', () => {
  const history = [
    { checkedAt: '2026-01-01T00:00:00.000Z', status: { raw: 8 } },
    { checkedAt: '2026-01-05T00:00:00.000Z', status: { raw: 3 } },
    { checkedAt: '2026-01-07T00:00:00.000Z', status: { raw: 3 } }
  ];
  assert.equal(
    getStageStartedAt(history, { raw: 3 }, '2025-12-01T00:00:00.000Z'),
    '2026-01-05T00:00:00.000Z'
  );
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { jobFingerprint, matchJob, mergeRecommendations, normalizeRecommendation, priorityScore } = require('../src/job-radar-core');

test('scores direction, major, education, location and required/preferred English independently', () => {
  const base = { role: '环境工程师', category: '环境工程', city: '南京', education: { level: '硕士', mode: 'required' }, majors: ['环境工程'], requirements: { majorMode: 'required' }, english: { cet4: 'required', cet6: 'preferred' } };
  const matched = matchJob(base, { highestEducation: '硕士', major: '环境工程', cet4: true, cet6: false }, { directions: ['环境工程'], cities: ['南京'] });
  assert.equal(matched.dimensionScores.direction, 25);
  assert.equal(matched.dimensionScores.major, 20);
  assert.equal(matched.dimensionScores.education, 15);
  assert.ok(matched.dimensionScores.english > 4 && matched.dimensionScores.english < 10);
  assert.match(matched.risks.join(' '), /CET-6.*优先/);

  const required = matchJob({ ...base, english: { cet4: 'required', cet6: 'required' } }, { highestEducation: '硕士', major: '环境工程', cet4: true, cet6: false }, { directions: ['环境工程'], cities: ['南京'] });
  assert.equal(required.dimensionScores.english, 4);
  assert.match(required.risks.join(' '), /CET-6.*硬性/);

  const unknown = matchJob({ ...base, english: {} }, { highestEducation: '硕士', major: '环境工程', cet4: false, cet6: false }, { directions: ['环境工程'], cities: ['南京'] });
  assert.equal(unknown.dimensionScores.english, 10);
  assert.doesNotMatch(unknown.risks.join(' '), /CET/);
});

test('creates stable fingerprints and merges cross-source duplicates without new ids', () => {
  const first = normalizeRecommendation({ id: 'one', company: '水务集团', role: '技术支持', city: '南京', recruitmentBatch: '2027 校招', source: { id: 'a', type: 'manual' } }, '2026-09-01T00:00:00.000Z');
  const second = normalizeRecommendation({ id: 'two', company: ' 水务集团 ', role: '技术支持', city: '南京', recruitmentBatch: '2027 校招', source: { id: 'b', type: 'official' } }, '2026-09-02T00:00:00.000Z');
  assert.equal(jobFingerprint(first), jobFingerprint(second));
  const merged = mergeRecommendations([first], [second], { successfulSourceIds: ['b'], now: '2026-09-02T00:00:00.000Z' });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'one');
  assert.equal(merged[0].source.type, 'official');
  assert.equal(merged[0].sourceRefs.length, 2);
});

test('tracks NEW, UPDATED, REOPENED and closes only after two successful missing refreshes', () => {
  const first = normalizeRecommendation({ id: 'one', company: 'A', role: '环保工程师', city: '上海', source: { id: 'source-a' }, description: '旧 JD' }, '2026-09-01T00:00:00.000Z');
  assert.equal(first.state, 'NEW');
  const updated = mergeRecommendations([first], [{ ...first, description: '新 JD', updatedAt: '2026-09-02T00:00:00.000Z' }], { successfulSourceIds: ['source-a'], now: '2026-09-02T00:00:00.000Z' })[0];
  assert.equal(updated.state, 'UPDATED');
  assert.equal(updated.snapshots.length, 1);
  const missingOnce = mergeRecommendations([updated], [], { successfulSourceIds: ['source-a'], now: '2026-09-03T00:00:00.000Z' })[0];
  assert.notEqual(missingOnce.state, 'CLOSED');
  const closed = mergeRecommendations([missingOnce], [], { successfulSourceIds: ['source-a'], now: '2026-09-04T00:00:00.000Z' })[0];
  assert.equal(closed.state, 'CLOSED');
  const reopened = mergeRecommendations([closed], [{ ...first, updatedAt: '2026-09-05T00:00:00.000Z' }], { successfulSourceIds: ['source-a'], now: '2026-09-05T00:00:00.000Z' })[0];
  assert.equal(reopened.state, 'REOPENED');
  assert.ok(priorityScore(reopened, { score: 90 }, new Date('2026-09-05T00:00:00.000Z')) > 60);
});

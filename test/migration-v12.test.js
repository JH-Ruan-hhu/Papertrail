'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema11To12 } = require('../src/migration-core');

test('schema 11 to 12 preserves jobApplications and adds lightweight Job Radar data', () => {
  const jobApplications = [{ id: 'job-1', company: '环境科技', role: '工程师', appliedAt: null, custom: { keep: true } }];
  const result = migrateSchema11To12({ version: 11, jobApplications, unknownRoot: 'keep' });
  assert.equal(result.data.version, 12);
  assert.deepEqual(result.data.jobApplications, jobApplications);
  assert.equal(result.data.unknownRoot, 'keep');
  assert.deepEqual(result.data.jobRadar.sources, []);
  assert.deepEqual(result.data.jobRadar.hiddenFingerprints, []);
});

test('schema 12 migration is idempotent and rejects malformed radar data', () => {
  const first = migrateSchema11To12({ version: 11, jobApplications: [] });
  const second = migrateSchema11To12(first.data);
  assert.equal(second.changed, false);
  assert.throws(() => migrateSchema11To12({ version: 11, jobRadar: [] }), /求职雷达/);
});

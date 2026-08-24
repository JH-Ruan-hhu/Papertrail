'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema9To10 } = require('../src/migration-core');

test('schema 10 adds and normalizes local job applications without losing root data', () => {
  const source = {
    version: 9,
    unknownRoot: { retained: true },
    jobApplications: [{
      id: 'job-1',
      company: ' 水务集团 ',
      role: '环境工程师',
      status: 'written-1',
      sourceUrl: 'https://jobs.example.com/1',
      createdAt: '2026-08-24T00:00:00.000Z'
    }]
  };
  const result = migrateSchema9To10(source, { fallbackAt: '2026-08-24T00:00:00.000Z' });
  assert.equal(result.data.version, 10);
  assert.equal(result.data.jobApplications[0].company, '水务集团');
  assert.equal(result.data.jobApplications[0].status, 'written-1');
  assert.deepEqual(result.data.unknownRoot, source.unknownRoot);
});

test('schema 10 migration is idempotent and rejects unsafe shapes', () => {
  const first = migrateSchema9To10({ version: 9, jobApplications: [] });
  const second = migrateSchema9To10(first.data);
  assert.equal(second.changed, false);
  assert.deepEqual(second.data, first.data);
  assert.throws(() => migrateSchema9To10({ version: 11, jobApplications: [] }), /更高版本/);
  assert.throws(() => migrateSchema9To10({ version: 9, jobApplications: {} }), /求职记录列表格式无效/);
});

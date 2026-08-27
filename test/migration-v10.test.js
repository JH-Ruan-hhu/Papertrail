'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateSchema9To10 } = require('../src/migration-core');
const { migrateData } = require('../src/paper-core');

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
  assert.equal(result.data.jobApplications[0].status, 'active');
  assert.equal(result.data.jobApplications[0].workflow.stages.find((stage) => stage.id === result.data.jobApplications[0].workflow.currentStageId).name, '测评');
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

test('current schema keeps legacy job records untouched until that record is saved', () => {
  const legacyJob = {
    id: 'job-legacy',
    company: '旧单位',
    role: '旧岗位',
    status: 'submitted',
    location: '南京',
    appliedAt: '2026-08-14T00:00:00.000Z',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    revision: 1
  };
  const source = {
    version: 10,
    settings: { refreshMinutes: 360 },
    papers: [],
    schedules: [],
    todos: [],
    notes: [],
    metadataFields: [],
    attendance: [],
    focusSessions: [],
    jobApplications: [legacyJob],
    unknownRoot: { retained: true }
  };
  const result = migrateData(source, source.settings);
  assert.equal(result.changed, false);
  assert.strictEqual(result.data.jobApplications[0], legacyJob);
  assert.deepEqual(result.data.unknownRoot, source.unknownRoot);
});

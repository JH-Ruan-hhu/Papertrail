'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  JOB_STATUSES,
  deleteJobApplication,
  nextJobStatus,
  normalizeJobApplication,
  saveJobApplication
} = require('../src/job-core');

test('normalizes a local job application and constrains its source URL', () => {
  const job = normalizeJobApplication({
    id: 'job-1',
    company: '  环境科技公司  ',
    role: '研发工程师',
    status: 'interview',
    sourceUrl: 'https://jobs.example.com/role?id=1',
    createdAt: '2026-08-24T00:00:00.000Z'
  });
  assert.equal(job.company, '环境科技公司');
  assert.equal(job.status, 'interview');
  assert.equal(job.sourceUrl, 'https://jobs.example.com/role?id=1');
  assert.equal(normalizeJobApplication({ sourceUrl: 'file:///secret' }).sourceUrl, null);
});

test('creates, advances, updates and deletes job applications', () => {
  const now = '2026-08-24T08:00:00.000Z';
  let jobs = saveJobApplication([], { company: '水务集团', role: '环境工程师', status: 'pending' }, now, () => 'job-1');
  assert.equal(jobs[0].id, 'job-1');
  assert.equal(jobs[0].appliedAt, null);
  jobs = saveJobApplication(jobs, { ...jobs[0], status: 'submitted' }, '2026-08-25T08:00:00.000Z');
  assert.equal(jobs[0].status, 'submitted');
  assert.equal(jobs[0].appliedAt, '2026-08-25T08:00:00.000Z');
  assert.equal(jobs[0].revision, 2);
  assert.equal(nextJobStatus('submitted'), 'written-1');
  assert.equal(nextJobStatus('offer'), null);
  assert.deepEqual(JOB_STATUSES, ['pending', 'submitted', 'written-1', 'written-2', 'interview', 'offer']);
  assert.deepEqual(deleteJobApplication(jobs, 'job-1'), []);
});

test('rejects incomplete records, unsupported URLs and missing deletes', () => {
  assert.throws(() => saveJobApplication([], { company: '', role: '工程师' }), /单位名称和岗位名称/);
  assert.throws(() => saveJobApplication([], { company: '公司', role: '工程师', sourceUrl: 'javascript:alert(1)' }), /http 或 https/);
  assert.throws(() => deleteJobApplication([], 'missing'), /找不到/);
});

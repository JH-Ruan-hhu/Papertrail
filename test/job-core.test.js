'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_WORKFLOW_STAGES,
  JOB_LIFECYCLE_STATUSES,
  deleteJobApplication,
  jobDeadlineReminderDue,
  mergeImportedJobApplications,
  moveWorkflowStage,
  normalizeJobApplication,
  removeWorkflowStage,
  renameWorkflowStage,
  saveJobApplication
} = require('../src/job-core');

test('normalizes a local job application with an independent lifecycle and workflow', () => {
  const job = normalizeJobApplication({
    id: 'job-1',
    company: '  环境科技公司  ',
    role: '研发工程师',
    companyType: '科技公司',
    city: '南京',
    deadline: '2026-09-30',
    priority: 'high',
    pinned: true,
    status: 'active',
    nextFollowUpAt: '2026-08-28',
    workflow: {
      stages: [{ id: 'apply', name: '投递' }, { id: 'screen', name: '网测' }, { id: 'final', name: '终面' }],
      currentStageId: 'screen',
      timeline: [{ stageId: 'apply', date: '2026-08-14' }, { stageId: 'screen', date: '2026-08-28' }]
    },
    annualSalaryWan: '41.14',
    sourceUrl: 'https://jobs.example.com/role?id=1',
    createdAt: '2026-08-24T00:00:00.000Z'
  });
  assert.equal(job.company, '环境科技公司');
  assert.equal(job.status, 'active');
  assert.deepEqual(JOB_LIFECYCLE_STATUSES, ['preparing', 'active', 'paused', 'closed']);
  assert.equal(job.companyType, '科技公司');
  assert.equal(job.city, '南京');
  assert.equal(job.location, '南京');
  assert.equal(job.priority, 'high');
  assert.equal(job.pinned, true);
  assert.equal(job.workflow.currentStageId, 'screen');
  assert.deepEqual(job.workflow.stages.map((stage) => stage.id), ['apply', 'screen', 'final']);
  assert.equal(job.workflow.timeline[1].stageId, 'screen');
  assert.equal(job.annualSalaryWan, 41.1);
  assert.equal(job.sourceUrl, 'https://jobs.example.com/role?id=1');
  assert.equal(normalizeJobApplication({ sourceUrl: 'file:///secret' }).sourceUrl, null);
  assert.equal(normalizeJobApplication({ company: '单位', role: '岗位' }).pinned, false);
});

test('maps legacy stage statuses without forcing a startup rewrite', () => {
  const cases = [
    ['submitted', '投递', 'active'],
    ['written-1', '测评', 'active'],
    ['written-2', '二面', 'active'],
    ['interview', '面试', 'active'],
    ['offer', 'Offer', 'closed']
  ];
  for (const [status, stageName, lifecycle] of cases) {
    const job = normalizeJobApplication({ company: '单位', role: '岗位', status, appliedAt: '2026-08-14' });
    const current = job.workflow.stages.find((stage) => stage.id === job.workflow.currentStageId);
    assert.equal(current.name, stageName);
    assert.equal(job.status, lifecycle);
  }
  const empty = normalizeJobApplication({ company: '单位', role: '岗位', workflow: { stages: [], currentStageId: 'missing' } });
  assert.deepEqual(empty.workflow.stages, DEFAULT_WORKFLOW_STAGES);
  assert.deepEqual(DEFAULT_WORKFLOW_STAGES.map((stage) => stage.name), ['投递', '测评', '一面', '二面', '三面', '终面', 'Offer']);
  assert.equal(empty.workflow.currentStageId, DEFAULT_WORKFLOW_STAGES[0].id);
});

test('creates, updates and deletes workflow stages while keeping the current stage valid', () => {
  const now = '2026-08-24T08:00:00.000Z';
  let jobs = saveJobApplication([], { company: '水务集团', role: '环境工程师', status: 'preparing' }, now, () => 'job-1');
  assert.equal(jobs[0].id, 'job-1');
  assert.equal(jobs[0].status, 'preparing');
  assert.equal(jobs[0].appliedAt, null);
  const custom = {
    stages: [{ id: 'phone', name: '电话沟通' }, { id: 'case', name: '案例题' }, { id: 'offer', name: 'Offer' }],
    currentStageId: 'case',
    timeline: [{ stageId: 'phone', date: '2026-08-25' }, { stageId: 'case', date: '2026-08-26' }]
  };
  jobs = saveJobApplication(jobs, { ...jobs[0], status: 'active', workflow: custom }, '2026-08-25T08:00:00.000Z');
  assert.equal(jobs[0].status, 'active');
  assert.equal(jobs[0].appliedAt, '2026-08-25T08:00:00.000Z');
  assert.equal(jobs[0].workflow.currentStageId, 'case');
  assert.equal(jobs[0].revision, 2);
  jobs = saveJobApplication(jobs, { ...jobs[0], pinned: true }, '2026-08-25T09:00:00.000Z');
  assert.equal(jobs[0].pinned, true);
  assert.equal(jobs[0].revision, 3);
  const renamed = renameWorkflowStage(jobs[0].workflow, 'case', '技术面');
  assert.equal(renamed.stages[1].name, '技术面');
  const moved = moveWorkflowStage(renamed, 'case', 'up');
  assert.deepEqual(moved.stages.map((stage) => stage.id), ['case', 'phone', 'offer']);
  const removed = removeWorkflowStage(moved, 'case');
  assert.equal(removed.currentStageId, 'phone');
  assert.equal(removed.timeline.some((item) => item.stageId === 'case'), false);
  assert.deepEqual(deleteJobApplication(jobs, 'job-1'), []);
});

test('rejects incomplete records, unsupported URLs and missing deletes', () => {
  assert.throws(() => saveJobApplication([], { company: '', role: '工程师' }), /单位名称和岗位名称/);
  assert.throws(() => saveJobApplication([], { company: '公司', role: '工程师', sourceUrl: 'javascript:alert(1)' }), /http 或 https/);
  assert.throws(() => saveJobApplication([], { company: '公司', role: '工程师', annualSalaryWan: '-1' }), /预估年薪/);
  assert.throws(() => deleteJobApplication([], 'missing'), /找不到/);
});

test('keeps salary, workflow and legacy compatibility through a JSON export/import round trip', () => {
  const original = normalizeJobApplication({
    id: 'job-export-1',
    company: '水环境公司',
    role: '研发工程师',
    companyType: '科技公司',
    city: '上海',
    deadline: '2026-12-31',
    status: 'active',
    priority: 'high',
    pinned: true,
    annualSalaryWan: 38.6,
    notes: '等待面试',
    workflow: {
      stages: [{ id: 'apply', name: '投递' }, { id: 'interview', name: '一面' }],
      currentStageId: 'interview',
      timeline: [{ stageId: 'apply', date: '2026-08-30' }]
    },
    createdAt: '2026-08-30T00:00:00.000Z'
  });
  const exported = JSON.stringify({
    format: 'papertrail-job-applications',
    version: 1,
    jobApplications: [original]
  });
  const imported = normalizeJobApplication(JSON.parse(exported).jobApplications[0]);
  assert.equal(imported.annualSalaryWan, 38.6);
  assert.equal(imported.status, 'active');
  assert.equal(imported.pinned, true);
  assert.equal(imported.deadline, original.deadline);
  assert.deepEqual(imported.workflow, original.workflow);
});

test('reminds once on the day before an open job deadline and resets after the date changes', () => {
  const job = normalizeJobApplication({
    id: 'deadline-job', company: '环境公司', role: '研发工程师', status: 'active', deadline: '2026-09-01'
  });
  assert.equal(jobDeadlineReminderDue(job, new Date(2026, 7, 31, 9, 0)), true);
  assert.equal(jobDeadlineReminderDue(job, new Date(2026, 7, 30, 23, 59)), false);
  assert.equal(jobDeadlineReminderDue({ ...job, status: 'closed' }, new Date(2026, 7, 31, 9, 0)), false);
  assert.equal(jobDeadlineReminderDue({ ...job, deadlineReminderSentAt: '2026-08-31T01:00:00.000Z' }, new Date(2026, 7, 31, 9, 0)), false);

  const updated = saveJobApplication([{
    ...job, deadlineReminderSentAt: '2026-08-31T01:00:00.000Z', revision: 1
  }], { ...job, deadline: '2026-09-02', revision: 1 }, '2026-08-31T02:00:00.000Z');
  assert.equal(updated[0].deadlineReminderSentAt, null);
});

test('merges exported jobs by stable id without duplicating repeated imports', () => {
  const local = normalizeJobApplication({
    id: 'local-only', company: '本地公司', role: '本地岗位', status: 'active',
    createdAt: '2026-08-30T01:00:00.000Z', updatedAt: '2026-08-30T01:00:00.000Z'
  });
  const exported = {
    id: 'remote-stable-id', company: '异地公司', role: '研发岗位', status: 'active',
    annualSalaryWan: 36, createdAt: '2026-08-30T02:00:00.000Z', updatedAt: '2026-08-30T02:00:00.000Z'
  };
  const first = mergeImportedJobApplications([local], [exported], '2026-08-30T03:00:00.000Z', () => 'generated-id');
  assert.deepEqual({ added: first.added, updated: first.updated, skipped: first.skipped }, { added: 1, updated: 0, skipped: 0 });
  assert.equal(first.jobs.find((job) => job.company === '异地公司').id, 'remote-stable-id');
  assert.ok(first.jobs.some((job) => job.id === 'local-only'));
  const repeated = mergeImportedJobApplications(first.jobs, [exported], '2026-08-30T04:00:00.000Z', () => 'unused-id');
  assert.deepEqual({ added: repeated.added, updated: repeated.updated, skipped: repeated.skipped }, { added: 0, updated: 0, skipped: 1 });
  assert.equal(repeated.jobs.filter((job) => job.id === 'remote-stable-id').length, 1);
});

test('updates only newer imported jobs and keeps newer local edits', () => {
  const local = normalizeJobApplication({
    id: 'shared-id', company: '公司', role: '本地新岗位', status: 'active', revision: 3,
    createdAt: '2026-08-30T01:00:00.000Z', updatedAt: '2026-08-30T05:00:00.000Z'
  });
  const older = mergeImportedJobApplications([local], [{
    ...local, role: '旧导出岗位', revision: 2, updatedAt: '2026-08-30T04:00:00.000Z'
  }], '2026-08-30T06:00:00.000Z');
  assert.equal(older.jobs[0].role, '本地新岗位');
  assert.equal(older.skipped, 1);
  const newer = mergeImportedJobApplications([local], [{
    ...local, role: '异地更新岗位', revision: 4, updatedAt: '2026-08-30T06:00:00.000Z'
  }], '2026-08-30T07:00:00.000Z');
  assert.equal(newer.jobs[0].role, '异地更新岗位');
  assert.equal(newer.updated, 1);
  assert.equal(newer.jobs[0].id, 'shared-id');
});

test('marks appliedAt only when a preparing application becomes active', () => {
  const createdAt = '2026-09-02T01:00:00.000Z';
  const preparing = saveJobApplication([], { company: '环境科技', role: '工程师', status: 'preparing', appliedAt: null }, createdAt, () => 'job-radar')[0];
  assert.equal(preparing.status, 'preparing');
  assert.equal(preparing.appliedAt, null);
  const appliedAt = '2026-09-03T02:00:00.000Z';
  const active = saveJobApplication([preparing], { ...preparing, status: 'active', appliedAt: null }, appliedAt)[0];
  assert.equal(active.status, 'active');
  assert.equal(active.appliedAt, appliedAt);
});

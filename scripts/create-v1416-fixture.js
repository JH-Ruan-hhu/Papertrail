'use strict';
// Run only against the v1.4.16 baseline. All records below are synthetic.
const fs = require('node:fs');
const path = require('node:path');
const { migrateData } = require('../src/paper-core');
const { DEFAULT_SETTINGS } = require('../src/store');
const at = '2026-09-05T01:15:00.000Z';
const raw = {
  version: 11, settings: { ...DEFAULT_SETTINGS },
  papers: [{ id: 'paper-fixture', paperKey: 'fixture', trackingSecret: 'synthetic-encrypted-fixture', addedAt: at, snapshot: { title: 'Synthetic migration paper', journal: 'Fixture Journal', status: { raw: 3, label: '审稿中' } }, history: [], details: { manuscriptId: 'TEST-001' } }],
  schedules: [{ id: 'schedule-fixture', title: '旧十五分钟日程', startAt: at, endAt: '2026-09-05T02:45:00.000Z', priority: 'high', sourceRef: { kind: 'todo', id: 'todo-fixture' }, createdAt: at, updatedAt: at }],
  todos: [{ id: 'todo-fixture', title: '无时间待办', dueAt: null, status: 'open', createdAt: at, updatedAt: at }],
  notes: [{ id: 'note-fixture', kind: 'daily', dateKey: '2026-09-05', title: '实验记录', content: '<p><strong>保留格式</strong></p>', revision: 3, metadata: { project: 'PFAS' }, attachments: [], createdAt: at, updatedAt: at }],
  jobApplications: [{ id: 'job-fixture', company: '示例单位', role: '研究员', city: '南京', status: 'active', deadline: '2026-09-08', workflow: { stages: [{ id: 'apply', name: '投递' }, { id: 'custom', name: '学术报告' }], currentStageId: 'custom', timeline: [{ stageId: 'apply', date: '2026-09-01' }] }, createdAt: at, updatedAt: at }],
  countdowns: [{ id: 'countdown-fixture', title: '投稿倒计时', targetDate: '2026-10-01' }],
  metadataFields: [], attendance: [], focusSessions: [], extensionFixture: { preserve: true }
};
const output = path.join(__dirname, '../test/fixtures/v1.4.16-workspace.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(migrateData(raw, DEFAULT_SETTINGS).data, null, 2) + '\n');


'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { JobRadarService, validateSourceUrl } = require('../src/job-radar-service');

function setup(fetchText = async () => '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-radar-'));
  const store = {
    filePath: path.join(directory, 'papertrail-data.json'),
    value: undefined,
    getJobRadar() { return this.value; },
    setJobRadar(value) { this.value = value; return value; }
  };
  const applications = [];
  const service = new JobRadarService({ store, fetchText, openExternal: async () => true, addApplication: (input) => { applications.push(input); return { id: 'application-1', ...input }; } });
  return { directory, store, service, applications };
}

test('validates source URLs and recovers a corrupt cache safely', () => {
  assert.throws(() => validateSourceUrl('file:///tmp/jobs'), /http\/https/);
  assert.throws(() => validateSourceUrl('javascript:alert(1)'), /http\/https/);
  const initial = setup();
  fs.writeFileSync(path.join(initial.directory, 'job-radar-cache.json'), '{broken', 'utf8');
  const recovered = new JobRadarService({ store: initial.store, fetchText: async () => '', openExternal: async () => true, addApplication: () => null });
  assert.equal(recovered.getSummary().recoveredFromCorruption, true);
  assert.deepEqual(recovered.list({ minimumMatchScore: 0 }), []);
});

test('adds a recommendation to applications as preparing with appliedAt null', () => {
  const { service, applications } = setup();
  const job = { id: 'radar-1', fingerprint: 'job:1', company: '环境科技', role: '应用工程师', city: '南京', sourceUrl: 'https://example.com/job', source: { id: 'source-1' }, state: 'NEW', discoveredAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  service.cache.save({ ...service.cache.data, recommendations: [job] });
  service.addToApplications('radar-1');
  assert.equal(applications[0].status, 'preparing');
  assert.equal(applications[0].appliedAt, null);
  assert.equal(applications[0].sourceUrl, 'https://example.com/job');
});

test('keeps cached jobs when remote fetching fails and marks the cache stale', async () => {
  const { service } = setup(async () => { throw new Error('offline'); });
  service.saveSource({ id: 'source-1', name: '官网', type: 'official', url: 'https://example.com/jobs' });
  service.cache.save({ ...service.cache.data, recommendations: [{ id: 'radar-1', fingerprint: 'job:1', company: 'A', role: 'B', source: { id: 'source-1' }, state: 'NEW', discoveredAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] });
  const result = await service.refresh();
  assert.equal(result.failedSources, 1);
  assert.equal(service.cache.data.recommendations.length, 1);
  assert.equal(service.cache.data.refreshState.stale, true);
});

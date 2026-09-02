'use strict';

const path = require('node:path');
const { JobRadarCacheStore } = require('./job-radar-store');
const { matchJob, mergeRecommendations, normalizeRecommendation, priorityScore } = require('./job-radar-core');
const sourceRegistry = require('./job-sources/registry');

const DEFAULT_RADAR = Object.freeze({
  profile: { highestEducation: '', major: '', cet4: false, cet6: false, otherConditions: [] },
  preferences: { directions: [], cities: [], industries: [], companyPreferences: [], minimumMatchScore: 70 },
  followedCompanies: [],
  sources: [],
  savedApplications: [],
  hiddenFingerprints: [],
  lastRefreshAt: null
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function id(prefix = 'radar') { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`; }
function nowIso() { return new Date().toISOString(); }

function validateSourceUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('请输入有效的 http/https 招聘页面 URL。'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('岗位源仅支持 http/https URL。');
  if (parsed.username || parsed.password) throw new Error('岗位源 URL 不能包含登录凭据。');
  return parsed.toString();
}

function normalizedRadar(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...clone(DEFAULT_RADAR),
    ...source,
    profile: { ...clone(DEFAULT_RADAR.profile), ...(source.profile || {}) },
    preferences: { ...clone(DEFAULT_RADAR.preferences), ...(source.preferences || {}) },
    followedCompanies: Array.isArray(source.followedCompanies) ? source.followedCompanies : [],
    sources: Array.isArray(source.sources) ? source.sources : [],
    savedApplications: Array.isArray(source.savedApplications) ? source.savedApplications : [],
    hiddenFingerprints: Array.isArray(source.hiddenFingerprints) ? source.hiddenFingerprints : []
  };
}

class JobRadarService {
  constructor({ store, fetchText, openExternal, addApplication }) {
    this.store = store;
    this.fetchText = fetchText;
    this.openExternal = openExternal;
    this.addApplication = addApplication;
    this.cache = new JobRadarCacheStore(path.join(path.dirname(store.filePath), 'job-radar-cache.json'));
    this.cache.load();
  }

  radar() { return normalizedRadar(this.store.getJobRadar()); }

  saveRadar(updater) {
    const current = this.radar();
    const next = normalizedRadar(updater(clone(current)) || current);
    this.store.setJobRadar(next);
    return next;
  }

  enriched(job, radar = this.radar(), now = new Date()) {
    const profileConfigured = Boolean(
      radar.profile.highestEducation || radar.profile.major
      || radar.preferences.directions?.length || radar.preferences.cities?.length
      || radar.preferences.industries?.length || radar.preferences.companyPreferences?.length
    );
    const match = profileConfigured
      ? matchJob(job, radar.profile, radar.preferences)
      : { score: 0, level: 'low', reasons: ['请先设置求职偏好'], risks: [], dimensionScores: { direction: 0, major: 0, education: 0, english: 0, location: 0, industry: 0, company: 0, other: 0 } };
    return { ...job, match: { ...match, priorityScore: priorityScore(job, match, now) } };
  }

  getSummary() {
    const radar = this.radar();
    const now = new Date();
    const jobs = this.cache.data.recommendations.map((job) => this.enriched(job, radar, now));
    const today = now.toISOString().slice(0, 10);
    const due = jobs.filter((job) => {
      const timestamp = Date.parse(job.deadline);
      return Number.isFinite(timestamp) && timestamp >= now.getTime() && timestamp - now.getTime() <= 3 * 86_400_000;
    }).length;
    return {
      todayNew: jobs.filter((job) => String(job.discoveredAt || '').slice(0, 10) === today && job.state !== 'CLOSED').length,
      highMatch: jobs.filter((job) => job.match.score >= 85 && job.state !== 'CLOSED').length,
      dueSoon: due,
      followedCompanies: radar.followedCompanies.filter((company) => company.status !== 'paused').length,
      lastRefreshAt: radar.lastRefreshAt,
      refreshState: this.cache.data.refreshState,
      recoveredFromCorruption: this.cache.recoveredFromCorruption
    };
  }

  list(filters = {}) {
    const radar = this.radar();
    const minimum = Number(filters.minimumMatchScore ?? radar.preferences.minimumMatchScore ?? 70);
    const hidden = new Set(radar.hiddenFingerprints);
    const query = String(filters.query || '').trim().toLocaleLowerCase('zh-CN');
    const jobs = this.cache.data.recommendations
      .filter((job) => !hidden.has(job.fingerprint))
      .map((job) => this.enriched(job, radar))
      .filter((job) => filters.includeClosed || job.state !== 'CLOSED')
      .filter((job) => job.match.score >= minimum)
      .filter((job) => !filters.category || job.category === filters.category)
      .filter((job) => !filters.city || job.city === filters.city)
      .filter((job) => !filters.source || (job.source?.id || job.source?.name) === filters.source)
      .filter((job) => !filters.education || String(job.education?.level || job.education || '').includes(filters.education))
      .filter((job) => !filters.english || job.english?.cet4 === filters.english || job.english?.cet6 === filters.english)
      .filter((job) => !filters.batch || job.recruitmentBatch === filters.batch)
      .filter((job) => !query || `${job.company} ${job.role} ${job.city} ${job.category} ${job.description}`.toLocaleLowerCase('zh-CN').includes(query));
    const sort = filters.sort || 'recommended';
    jobs.sort((left, right) => {
      if (sort === 'match') return right.match.score - left.match.score;
      if (sort === 'latest') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (sort === 'deadline') return (Date.parse(left.deadline) || Infinity) - (Date.parse(right.deadline) || Infinity);
      return right.match.priorityScore - left.match.priorityScore;
    });
    return jobs;
  }

  get(jobId) { return this.list({ minimumMatchScore: 0, includeClosed: true }).find((job) => job.id === String(jobId)) || null; }
  getProfile() { const radar = this.radar(); return { profile: radar.profile, preferences: radar.preferences, followedCompanies: radar.followedCompanies, sources: radar.sources, savedApplications: radar.savedApplications }; }
  saveProfile(input = {}) {
    const radar = this.saveRadar((draft) => {
      draft.profile = { ...draft.profile, ...(input.profile || {}) };
      draft.preferences = { ...draft.preferences, ...(input.preferences || {}) };
      draft.preferences.minimumMatchScore = Math.max(0, Math.min(100, Number(draft.preferences.minimumMatchScore ?? 70)));
      return draft;
    });
    return { profile: radar.profile, preferences: radar.preferences, followedCompanies: radar.followedCompanies, sources: radar.sources, savedApplications: radar.savedApplications };
  }

  saveSource(input = {}) {
    const url = validateSourceUrl(input.url);
    let saved;
    const radar = this.saveRadar((draft) => {
      const existing = input.id ? draft.sources.find((source) => source.id === String(input.id)) : null;
      saved = {
        ...existing,
        id: existing?.id || id('source'),
        name: String(input.name || existing?.name || new URL(url).hostname).trim().slice(0, 100),
        type: ['official', 'campus', 'manual', 'provider'].includes(input.type) ? input.type : (existing?.type || 'manual'),
        url,
        provider: String(input.provider || existing?.provider || 'generic-jsonld'),
        enabled: input.enabled !== false,
        status: existing?.status || 'needs-check',
        lastSuccessAt: existing?.lastSuccessAt || null,
        lastAttemptAt: existing?.lastAttemptAt || null,
        foundCount: Number(existing?.foundCount) || 0,
        error: existing?.error || null
      };
      draft.sources = [saved, ...draft.sources.filter((source) => source.id !== saved.id)];
      return draft;
    });
    return saved;
  }

  deleteSource(sourceId) {
    this.saveRadar((draft) => { draft.sources = draft.sources.filter((source) => source.id !== String(sourceId)); return draft; });
    return true;
  }

  followCompany(input = {}) {
    let saved;
    this.saveRadar((draft) => {
      const companyId = String(input.id || '') || id('company');
      saved = { id: companyId, name: String(input.name || '').trim(), industry: String(input.industry || '').trim(), url: input.url ? validateSourceUrl(input.url) : '', status: input.status === 'paused' ? 'paused' : 'active', lastCheckedAt: input.lastCheckedAt || null };
      if (!saved.name) throw new Error('请输入企业名称。');
      draft.followedCompanies = [saved, ...draft.followedCompanies.filter((company) => company.id !== companyId)];
      return draft;
    });
    return saved;
  }

  unfollowCompany(companyId) { this.saveRadar((draft) => { draft.followedCompanies = draft.followedCompanies.filter((company) => company.id !== String(companyId)); return draft; }); return true; }

  markSeen(jobId) {
    const at = nowIso();
    this.cache.save({ ...this.cache.data, recommendations: this.cache.data.recommendations.map((job) => job.id === String(jobId) ? { ...job, seenAt: at } : job) });
    return true;
  }

  setHidden(fingerprint, hidden = true) {
    this.saveRadar((draft) => {
      const values = new Set(draft.hiddenFingerprints);
      hidden ? values.add(String(fingerprint)) : values.delete(String(fingerprint));
      draft.hiddenFingerprints = [...values];
      return draft;
    });
    return true;
  }

  addToApplications(jobId) {
    const job = this.get(jobId);
    if (!job) throw new Error('找不到这个推荐岗位。');
    const application = this.addApplication({ company: job.company, role: job.role, city: job.city, deadline: job.deadline, sourceUrl: job.sourceUrl, status: 'preparing', appliedAt: null });
    this.saveRadar((draft) => { if (!draft.savedApplications.includes(job.fingerprint)) draft.savedApplications.push(job.fingerprint); return draft; });
    return application;
  }

  openSource(jobId) {
    const job = this.get(jobId);
    if (!job?.sourceUrl) throw new Error('该岗位没有可打开的官网链接。');
    return this.openExternal(validateSourceUrl(job.sourceUrl));
  }

  async refresh(request = {}) {
    const radar = this.radar();
    const sources = radar.sources.filter((source) => source.enabled !== false && (!request.sourceId || source.id === request.sourceId));
    const startedAt = nowIso();
    this.cache.save({ ...this.cache.data, refreshState: { status: 'refreshing', startedAt, stale: false, error: null } });
    const incoming = [];
    const successfulSourceIds = [];
    const sourceResults = { ...this.cache.data.sourceResults };
    const sourceUpdates = new Map();
    for (const source of sources) {
      const attemptAt = nowIso();
      try {
        const html = await this.fetchText(validateSourceUrl(source.url));
        const provider = sourceRegistry.get(source.provider);
        const jobs = provider.parse(html, { source: { id: source.id, name: source.name, type: source.type, url: source.url, confidence: source.type === 'official' ? 95 : 70 }, url: source.url, now: attemptAt });
        incoming.push(...jobs);
        successfulSourceIds.push(source.id);
        sourceResults[source.id] = { status: 'ok', at: attemptAt, count: jobs.length };
        sourceUpdates.set(source.id, { status: 'ok', lastAttemptAt: attemptAt, lastSuccessAt: attemptAt, foundCount: jobs.length, error: null });
      } catch (error) {
        sourceResults[source.id] = { status: 'error', at: attemptAt, error: error.message };
        sourceUpdates.set(source.id, { status: 'error', lastAttemptAt: attemptAt, error: error.message });
      }
    }
    const recommendations = mergeRecommendations(this.cache.data.recommendations, incoming, { successfulSourceIds, now: nowIso() });
    const failed = sources.length - successfulSourceIds.length;
    const finishedAt = nowIso();
    this.cache.save({ ...this.cache.data, recommendations, sourceResults, refreshState: { status: failed && !successfulSourceIds.length ? 'error' : 'idle', stale: failed > 0, finishedAt, error: failed ? `${failed} 个岗位源刷新失败，已保留旧缓存。` : null } });
    this.saveRadar((draft) => {
      draft.sources = draft.sources.map((source) => ({ ...source, ...(sourceUpdates.get(source.id) || {}) }));
      draft.lastRefreshAt = finishedAt;
      return draft;
    });
    return { ...this.getSummary(), refreshedSources: successfulSourceIds.length, failedSources: failed };
  }

  async importUrl(input) {
    const source = this.saveSource(typeof input === 'string' ? { url: input } : input);
    const result = await this.refresh({ sourceId: source.id });
    return { source, result };
  }
}

module.exports = { JobRadarService, DEFAULT_RADAR, normalizedRadar, validateSourceUrl };

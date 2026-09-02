'use strict';

const DIMENSION_WEIGHTS = Object.freeze({
  direction: 25,
  major: 20,
  education: 15,
  english: 10,
  location: 10,
  industry: 10,
  company: 5,
  other: 5
});

const REQUIREMENT_MODES = new Set(['required', 'preferred', 'not-mentioned']);

function text(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function folded(value) {
  return text(value).toLocaleLowerCase('zh-CN');
}

function list(value) {
  return (Array.isArray(value) ? value : text(value).split(/[、,，;；/|]/))
    .map(text)
    .filter(Boolean);
}

function mode(value) {
  return REQUIREMENT_MODES.has(value) ? value : 'not-mentioned';
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function jobFingerprint(job = {}) {
  const source = folded(job.source?.id || job.source?.name || job.source || 'source');
  const externalId = folded(job.externalId || job.externalJobId);
  if (externalId) return `external:${source}:${externalId}`;
  const identity = [job.company, job.role, job.city, job.recruitmentBatch].map(folded).join('|');
  return `job:${stableHash(identity)}`;
}

function overlap(left, right) {
  const targets = list(right).map(folded);
  return list(left).some((candidate) => targets.some((target) => target.includes(folded(candidate)) || folded(candidate).includes(target)));
}

function requirementScore({ requirementMode = 'not-mentioned', matched = false, weight, label, reasons, risks }) {
  const normalizedMode = mode(requirementMode);
  if (normalizedMode === 'not-mentioned') return weight;
  if (matched) {
    reasons.push(`${label}符合岗位${normalizedMode === 'required' ? '硬性要求' : '优先条件'}`);
    return weight;
  }
  if (normalizedMode === 'preferred') {
    risks.push(`${label}未满足岗位优先条件`);
    return Math.round(weight * 0.55 * 10) / 10;
  }
  risks.push(`${label}不满足岗位硬性要求`);
  return 0;
}

function educationRank(value) {
  const normalized = folded(value);
  if (/博士|phd|doctor/.test(normalized)) return 4;
  if (/硕士|研究生|master/.test(normalized)) return 3;
  if (/本科|学士|bachelor/.test(normalized)) return 2;
  if (/专科|大专|associate/.test(normalized)) return 1;
  return 0;
}

function matchJob(job = {}, profile = {}, preferences = {}) {
  const reasons = [];
  const risks = [];
  const dimensionScores = {};
  const requirement = job.requirements || {};
  const directionTargets = list(preferences.directions || preferences.targetDirections);
  const cityTargets = list(preferences.cities || preferences.targetCities);
  const industryTargets = list(preferences.industries || preferences.targetIndustries);
  const companyTargets = list(preferences.companies || preferences.companyPreferences);

  dimensionScores.direction = directionTargets.length
    ? (overlap(directionTargets, [job.category, job.role]) ? DIMENSION_WEIGHTS.direction : 0)
    : DIMENSION_WEIGHTS.direction;
  if (directionTargets.length && dimensionScores.direction) reasons.push('岗位方向符合目标');
  else if (directionTargets.length) risks.push('岗位方向与目标偏好不一致');

  const majors = list(job.majors || requirement.majors);
  dimensionScores.major = requirementScore({
    requirementMode: requirement.majorMode || (majors.length ? 'required' : 'not-mentioned'),
    matched: !majors.length || overlap([profile.major], majors),
    weight: DIMENSION_WEIGHTS.major,
    label: '专业', reasons, risks
  });

  const requiredEducation = job.education?.level || job.education || requirement.education;
  dimensionScores.education = requirementScore({
    requirementMode: job.education?.mode || requirement.educationMode || (requiredEducation ? 'required' : 'not-mentioned'),
    matched: !requiredEducation || educationRank(profile.highestEducation) >= educationRank(requiredEducation),
    weight: DIMENSION_WEIGHTS.education,
    label: '学历', reasons, risks
  });

  const english = job.english || requirement.english || {};
  const cet4Score = requirementScore({
    requirementMode: english.cet4 || english.cet4Mode,
    matched: profile.cet4 === true,
    weight: DIMENSION_WEIGHTS.english * 0.4,
    label: 'CET-4', reasons, risks
  });
  const cet6Score = requirementScore({
    requirementMode: english.cet6 || english.cet6Mode,
    matched: profile.cet6 === true,
    weight: DIMENSION_WEIGHTS.english * 0.6,
    label: 'CET-6', reasons, risks
  });
  dimensionScores.english = cet4Score + cet6Score;

  dimensionScores.location = cityTargets.length
    ? (overlap(cityTargets, [job.city]) ? DIMENSION_WEIGHTS.location : 0)
    : DIMENSION_WEIGHTS.location;
  if (cityTargets.length && dimensionScores.location) reasons.push('工作地点符合目标城市');
  else if (cityTargets.length) risks.push('工作地点不在目标城市');

  dimensionScores.industry = industryTargets.length
    ? (overlap(industryTargets, [job.industry]) ? DIMENSION_WEIGHTS.industry : 0)
    : DIMENSION_WEIGHTS.industry;
  if (industryTargets.length && dimensionScores.industry) reasons.push('行业方向符合偏好');

  dimensionScores.company = companyTargets.length
    ? (overlap(companyTargets, [job.company]) ? DIMENSION_WEIGHTS.company : Math.round(DIMENSION_WEIGHTS.company * 0.6 * 10) / 10)
    : DIMENSION_WEIGHTS.company;
  if (companyTargets.length && dimensionScores.company === DIMENSION_WEIGHTS.company) reasons.push('属于偏好企业');

  const otherConditions = list(requirement.other || job.otherConditions);
  const profileConditions = list(profile.otherConditions);
  dimensionScores.other = requirementScore({
    requirementMode: requirement.otherMode || (otherConditions.length ? 'required' : 'not-mentioned'),
    matched: !otherConditions.length || otherConditions.every((condition) => overlap([condition], profileConditions)),
    weight: DIMENSION_WEIGHTS.other,
    label: '其他条件', reasons, risks
  });

  const score = Math.max(0, Math.min(100, Math.round(Object.values(dimensionScores).reduce((sum, value) => sum + value, 0))));
  const level = score >= 85 ? 'high' : score >= 70 ? 'medium-high' : 'low';
  return { score, level, reasons: reasons.slice(0, 6), risks: risks.slice(0, 6), dimensionScores };
}

function freshnessScore(job, now = new Date()) {
  const updatedAt = Date.parse(job.updatedAt || job.discoveredAt);
  if (!Number.isFinite(updatedAt)) return 0;
  const days = Math.max(0, (now.getTime() - updatedAt) / 86_400_000);
  return Math.max(0, Math.round((100 - Math.min(100, days * 8)) * 10) / 10);
}

function deadlineUrgency(job, now = new Date()) {
  const deadline = Date.parse(job.deadline);
  if (!Number.isFinite(deadline) || deadline < now.getTime()) return 0;
  const days = (deadline - now.getTime()) / 86_400_000;
  if (days <= 3) return 100;
  if (days <= 7) return 75;
  if (days <= 14) return 50;
  return 20;
}

function priorityScore(job, match = job.match || { score: 0 }, now = new Date()) {
  const sourceConfidence = Math.max(0, Math.min(100, Number(job.source?.confidence ?? job.sourceConfidence ?? 60)));
  return Math.round((Number(match.score || 0) * 0.7 + freshnessScore(job, now) * 0.15 + deadlineUrgency(job, now) * 0.1 + sourceConfidence * 0.05) * 10) / 10;
}

function normalizeRecommendation(input = {}, now = new Date().toISOString()) {
  const source = typeof input.source === 'object' && input.source ? { ...input.source } : { name: text(input.source) || '手动添加', type: 'manual' };
  const job = {
    id: text(input.id) || `radar_${stableHash(`${now}|${input.company}|${input.role}|${Math.random()}`)}`,
    externalId: text(input.externalId || input.externalJobId) || null,
    company: text(input.company) || '未命名企业',
    role: text(input.role) || '未命名岗位',
    city: text(input.city),
    recruitmentBatch: text(input.recruitmentBatch),
    category: text(input.category),
    education: input.education || null,
    majors: list(input.majors),
    english: input.english && typeof input.english === 'object' ? { ...input.english } : {},
    industry: text(input.industry),
    source,
    sourceRefs: Array.isArray(input.sourceRefs) ? input.sourceRefs : [source],
    sourceUrl: text(input.sourceUrl || source.url),
    deadline: text(input.deadline) || null,
    description: text(input.description),
    requirements: input.requirements && typeof input.requirements === 'object' ? { ...input.requirements } : {},
    discoveredAt: text(input.discoveredAt) || now,
    updatedAt: text(input.updatedAt) || now,
    lastSeenAt: text(input.lastSeenAt) || now,
    seenAt: text(input.seenAt) || null,
    state: ['NEW', 'UPDATED', 'REOPENED', 'CLOSED'].includes(input.state) ? input.state : 'NEW',
    missingRefreshes: Math.max(0, Number(input.missingRefreshes) || 0),
    snapshots: Array.isArray(input.snapshots) ? input.snapshots.slice(-10) : []
  };
  job.fingerprint = text(input.fingerprint) || jobFingerprint(job);
  return job;
}

function snapshotOf(job) {
  return {
    at: job.updatedAt,
    description: job.description,
    deadline: job.deadline,
    city: job.city,
    education: job.education,
    english: job.english,
    state: job.state
  };
}

function mergeRecommendations(existing = [], incoming = [], { successfulSourceIds = [], now = new Date().toISOString() } = {}) {
  const byFingerprint = new Map(existing.map((item) => [item.fingerprint || jobFingerprint(item), normalizeRecommendation(item, now)]));
  const seen = new Set();
  for (const raw of incoming) {
    const candidate = normalizeRecommendation(raw, now);
    const current = byFingerprint.get(candidate.fingerprint);
    seen.add(candidate.fingerprint);
    if (!current) {
      byFingerprint.set(candidate.fingerprint, candidate);
      continue;
    }
    const changed = ['description', 'deadline', 'city', 'education', 'english'].some((key) => JSON.stringify(current[key]) !== JSON.stringify(candidate[key]));
    const wasClosed = current.state === 'CLOSED';
    const officialFirst = [current.source, candidate.source].sort((a, b) => (a.type === 'official' ? -1 : 0) - (b.type === 'official' ? -1 : 0))[0];
    byFingerprint.set(candidate.fingerprint, {
      ...current,
      ...candidate,
      id: current.id,
      discoveredAt: current.discoveredAt,
      seenAt: current.seenAt,
      source: officialFirst,
      sourceRefs: [...(current.sourceRefs || []), ...(candidate.sourceRefs || [])].filter((ref, index, refs) => refs.findIndex((item) => (item.id || item.url || item.name) === (ref.id || ref.url || ref.name)) === index),
      state: wasClosed ? 'REOPENED' : changed ? 'UPDATED' : current.state === 'NEW' ? 'NEW' : current.state,
      missingRefreshes: 0,
      snapshots: changed ? [...(current.snapshots || []), snapshotOf(current)].slice(-10) : current.snapshots
    });
  }
  for (const [fingerprint, job] of byFingerprint) {
    if (seen.has(fingerprint)) continue;
    const sourceId = job.source?.id || job.source?.name;
    if (!successfulSourceIds.includes(sourceId)) continue;
    const missingRefreshes = (job.missingRefreshes || 0) + 1;
    byFingerprint.set(fingerprint, { ...job, missingRefreshes, state: missingRefreshes >= 2 ? 'CLOSED' : job.state });
  }
  return [...byFingerprint.values()];
}

const api = { DIMENSION_WEIGHTS, jobFingerprint, matchJob, priorityScore, normalizeRecommendation, mergeRecommendations };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.YanjiJobRadarCore = api;

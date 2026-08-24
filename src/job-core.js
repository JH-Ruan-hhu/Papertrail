'use strict';

const JOB_STATUSES = Object.freeze([
  'pending',
  'submitted',
  'written-1',
  'written-2',
  'interview',
  'offer'
]);

const JOB_STATUS_LABELS = Object.freeze({
  pending: '待投递',
  submitted: '已投递',
  'written-1': '一轮笔试',
  'written-2': '二轮笔试',
  interview: '面试',
  offer: 'Offer'
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function isoDate(value, fallback = null) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
}

function safeSourceUrl(value) {
  const source = cleanText(value, 2048);
  if (!source) return null;
  try {
    const parsed = new URL(source);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function annualSalaryWan(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000
    ? Math.round(parsed * 10) / 10
    : null;
}

function normalizeJobApplication(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  const input = asObject(value);
  if (!input) throw new Error(`第 ${index + 1} 条求职记录格式无效。`);
  const createdAt = isoDate(input.createdAt, fallbackAt);
  const status = JOB_STATUSES.includes(input.status) ? input.status : 'pending';
  return {
    id: cleanText(input.id, 200) || `job-${index + 1}`,
    company: cleanText(input.company, 200) || '未命名单位',
    role: cleanText(input.role, 300) || '未命名岗位',
    status,
    location: cleanText(input.location, 200) || null,
    annualSalaryWan: annualSalaryWan(input.annualSalaryWan),
    sourceUrl: safeSourceUrl(input.sourceUrl),
    contact: cleanText(input.contact, 300) || null,
    appliedAt: isoDate(input.appliedAt),
    nextActionAt: isoDate(input.nextActionAt),
    notes: cleanText(input.notes, 10_000) || null,
    createdAt,
    updatedAt: isoDate(input.updatedAt, createdAt),
    revision: Math.max(0, Number(input.revision) || 0)
  };
}

function saveJobApplication(list, input, now = new Date().toISOString(), makeId = () => `job-${Date.now()}`) {
  const source = asObject(input) || {};
  const company = cleanText(source.company, 200);
  const role = cleanText(source.role, 300);
  if (!company || !role) throw new Error('请填写单位名称和岗位名称。');
  if (source.sourceUrl && !safeSourceUrl(source.sourceUrl)) throw new Error('招聘链接必须是有效的 http 或 https 地址。');
  if (source.annualSalaryWan != null && source.annualSalaryWan !== '' && annualSalaryWan(source.annualSalaryWan) == null) {
    throw new Error('预估年薪需填写 0 至 10000 之间的万元数值。');
  }
  const existing = source.id ? list.find((item) => item.id === String(source.id)) : null;
  if (source.id && !existing) throw new Error('找不到这条求职记录。');
  const status = JOB_STATUSES.includes(source.status) ? source.status : (existing?.status || 'pending');
  const candidate = normalizeJobApplication({
    ...existing,
    ...source,
    company,
    role,
    status,
    id: existing?.id || makeId(),
    appliedAt: source.appliedAt || existing?.appliedAt || (status === 'pending' ? null : now),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    revision: Math.max(0, Number(existing?.revision) || 0) + 1
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function deleteJobApplication(list, id) {
  const target = list.find((item) => item.id === String(id || ''));
  if (!target) throw new Error('找不到这条求职记录。');
  return list.filter((item) => item.id !== target.id);
}

function nextJobStatus(status) {
  const index = JOB_STATUSES.indexOf(status);
  return index >= 0 && index < JOB_STATUSES.length - 1 ? JOB_STATUSES[index + 1] : null;
}

module.exports = {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  normalizeJobApplication,
  saveJobApplication,
  deleteJobApplication,
  nextJobStatus
};

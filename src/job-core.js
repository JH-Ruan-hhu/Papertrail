'use strict';

const JOB_LIFECYCLE_STATUSES = Object.freeze([
  'preparing',
  'active',
  'paused',
  'closed'
]);

const JOB_LIFECYCLE_LABELS = Object.freeze({
  preparing: '准备中',
  active: '进行中',
  paused: '暂停',
  closed: '已结束'
});

const JOB_PRIORITIES = Object.freeze(['high', 'medium', 'low']);
const JOB_PRIORITY_LABELS = Object.freeze({ high: '高', medium: '中', low: '低' });

// These names are deliberately used only when reading the pre-v1.3.1
// status-shaped records. They are not the source of truth for the new UI.
const LEGACY_STATUS_STAGE_NAMES = Object.freeze({
  submitted: '投递',
  'written-1': '测评',
  'written-2': '二面',
  interview: '面试',
  offer: 'Offer'
});

const DEFAULT_WORKFLOW_STAGES = Object.freeze([
  Object.freeze({ id: 'stage-apply', name: '投递' }),
  Object.freeze({ id: 'stage-assessment', name: '测评' }),
  Object.freeze({ id: 'stage-first-interview', name: '一面' }),
  Object.freeze({ id: 'stage-second-interview', name: '二面' }),
  Object.freeze({ id: 'stage-third-interview', name: '三面' }),
  Object.freeze({ id: 'stage-final-interview', name: '终面' }),
  Object.freeze({ id: 'stage-offer', name: 'Offer' })
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
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

function defaultWorkflow() {
  const stages = DEFAULT_WORKFLOW_STAGES.map((stage) => ({ ...stage }));
  return { stages, currentStageId: stages[0].id, timeline: [] };
}

function uniqueStageId(candidate, index, used) {
  const base = cleanText(candidate, 120) || `stage-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function stageNameForLegacyStatus(legacyStatus) {
  return LEGACY_STATUS_STAGE_NAMES[legacyStatus] || null;
}

function findLegacyStage(stages, legacyStatus) {
  const targetName = stageNameForLegacyStatus(legacyStatus);
  if (!targetName) return null;
  const exact = stages.find((stage) => stage.name === targetName);
  if (exact) return exact;
  if (legacyStatus === 'written-1') return stages.find((stage) => /测评|网测|笔试/.test(stage.name)) || null;
  if (legacyStatus === 'interview') return stages.find((stage) => /面/.test(stage.name)) || null;
  if (legacyStatus === 'offer') return stages.find((stage) => /offer/i.test(stage.name)) || stages.at(-1) || null;
  return null;
}

function normalizeWorkflow(value, legacyStatus = null, fallbackStageDate = null) {
  const source = asObject(value) || {};
  const hasCustomStages = Array.isArray(source.stages) && source.stages.length > 0;
  const rawStages = hasCustomStages ? source.stages : defaultWorkflow().stages;
  const usedIds = new Set();
  const stages = rawStages.map((rawStage, index) => {
    const stage = asObject(rawStage) || {};
    let name = cleanText(stage.name, 120) || `阶段 ${index + 1}`;
    // Keep the pre-v1.3.1 meaning visible for old interview records while
    // leaving the new default workflow's "一面" label intact.
    if (!hasCustomStages && legacyStatus === 'interview' && index === 2) name = '面试';
    return { id: uniqueStageId(stage.id, index, usedIds), name };
  });

  const stageIds = new Set(stages.map((stage) => stage.id));
  const requestedCurrent = cleanText(source.currentStageId || source.currentStage, 120);
  let currentStageId = stageIds.has(requestedCurrent) ? requestedCurrent : null;
  if (!currentStageId) currentStageId = findLegacyStage(stages, legacyStatus)?.id || stages[0].id;

  const timelineByStage = new Map();
  if (Array.isArray(source.timeline)) {
    for (const item of source.timeline) {
      const entry = asObject(item);
      const stageId = cleanText(entry?.stageId, 120);
      const date = isoDate(entry?.date);
      if (!stageIds.has(stageId) || !date) continue;
      timelineByStage.set(stageId, { stageId, date });
    }
  }
  // A new application is already a dated event even if the editor has not
  // opened the workflow section. This is also safe for old records because
  // the application date belongs to the first stage, not the current stage.
  const firstStageId = stages[0].id;
  const firstStageDate = isoDate(fallbackStageDate);
  if (!timelineByStage.has(firstStageId) && firstStageDate) {
    timelineByStage.set(firstStageId, { stageId: firstStageId, date: firstStageDate });
  }

  return {
    stages,
    currentStageId,
    timeline: stages.filter((stage) => timelineByStage.has(stage.id)).map((stage) => timelineByStage.get(stage.id))
  };
}

function lifecycleStatusFor(input, rawStatus) {
  const explicit = cleanText(input.lifecycleStatus || input.status, 80).toLowerCase();
  if (JOB_LIFECYCLE_STATUSES.includes(explicit)) return explicit;
  if (explicit === 'pending') return 'preparing';
  if (explicit === 'offer') return 'closed';
  if (Object.prototype.hasOwnProperty.call(LEGACY_STATUS_STAGE_NAMES, explicit)) return 'active';
  return rawStatus ? 'active' : 'preparing';
}

function normalizeJobApplication(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  const input = asObject(value);
  if (!input) throw new Error(`第 ${index + 1} 条求职记录格式无效。`);
  const rawStatus = cleanText(input.status, 80).toLowerCase();
  const legacyStatus = Object.prototype.hasOwnProperty.call(LEGACY_STATUS_STAGE_NAMES, rawStatus)
    ? rawStatus
    : (Object.prototype.hasOwnProperty.call(LEGACY_STATUS_STAGE_NAMES, input.legacyStatus) ? input.legacyStatus : null);
  const createdAt = isoDate(input.createdAt, fallbackAt);
  const city = cleanText(input.city ?? input.location, 200) || null;
  const nextFollowUpAt = isoDate(input.nextFollowUpAt ?? input.nextActionAt);
  const appliedAt = isoDate(input.appliedAt);
  return {
    id: cleanText(input.id, 200) || `job-${index + 1}`,
    company: cleanText(input.company, 200) || '未命名单位',
    role: cleanText(input.role, 300) || '未命名岗位',
    companyType: cleanText(input.companyType, 160) || null,
    city,
    // Keep the v1.3.1 field name as a read/write alias for existing exports.
    location: city,
    deadline: isoDate(input.deadline ?? input.deadlineAt),
    deadlineReminderSentAt: isoDate(input.deadlineReminderSentAt),
    priority: JOB_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
    pinned: input.pinned === true,
    status: lifecycleStatusFor(input, rawStatus),
    nextFollowUpAt,
    nextActionAt: nextFollowUpAt,
    notes: cleanText(input.notes, 10_000) || null,
    workflow: normalizeWorkflow(input.workflow, legacyStatus, appliedAt),
    annualSalaryWan: annualSalaryWan(input.annualSalaryWan),
    sourceUrl: safeSourceUrl(input.sourceUrl),
    contact: cleanText(input.contact, 300) || null,
    appliedAt,
    imported: input.imported === true || input.origin === 'import',
    legacyStatus,
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
  const rawStatus = cleanText(source.status || existing?.status, 80).toLowerCase();
  const becomingActive = rawStatus === 'active' && existing?.status !== 'active';
  const candidate = normalizeJobApplication({
    ...existing,
    ...source,
    company,
    role,
    status: rawStatus || 'preparing',
    id: existing?.id || makeId(),
    appliedAt: hasOwn(source, 'appliedAt')
      ? (source.appliedAt || (becomingActive ? now : null))
      : (existing?.appliedAt || (becomingActive ? now : null)),
    createdAt: existing?.createdAt || source.createdAt || now,
    updatedAt: now,
    revision: Math.max(0, Number(existing?.revision) || 0) + 1
  }, 0, now);
  if (existing && candidate.deadline !== existing.deadline) candidate.deadlineReminderSentAt = null;
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function jobDeadlineReminderDue(job, now = new Date()) {
  if (!job || job.status === 'closed' || job.deadlineReminderSentAt) return false;
  const due = new Date(job.deadline);
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(due.getTime()) || !Number.isFinite(current.getTime())) return false;
  const reminderDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1);
  return current.getFullYear() === reminderDay.getFullYear()
    && current.getMonth() === reminderDay.getMonth()
    && current.getDate() === reminderDay.getDate();
}

function deleteJobApplication(list, id) {
  const target = list.find((item) => item.id === String(id || ''));
  if (!target) throw new Error('找不到这条求职记录。');
  return list.filter((item) => item.id !== target.id);
}

function comparableImportedJob(job) {
  const { imported: _imported, ...comparable } = job;
  return JSON.stringify(comparable);
}

function mergeImportedJobApplications(list, sourceList, now = new Date().toISOString(), makeId = () => `job-${Date.now()}`) {
  if (!Array.isArray(list) || !Array.isArray(sourceList)) throw new Error('岗位导入数据格式不正确。');
  let jobs = [...list];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  sourceList.forEach((source, index) => {
    if (!asObject(source)) throw new Error(`第 ${index + 1} 条求职记录格式无效。`);
    const sourceId = cleanText(source.id, 200);
    const incoming = normalizeJobApplication({
      ...source,
      id: sourceId || makeId(),
      imported: true
    }, index, now);
    const existingIndex = jobs.findIndex((candidate) => candidate.id === incoming.id);
    if (existingIndex < 0) {
      jobs.push(incoming);
      added += 1;
      return;
    }
    const existing = normalizeJobApplication(jobs[existingIndex], existingIndex, now);
    if (comparableImportedJob(existing) === comparableImportedJob(incoming)) {
      skipped += 1;
      return;
    }
    const incomingUpdatedAt = Date.parse(incoming.updatedAt);
    const existingUpdatedAt = Date.parse(existing.updatedAt);
    const incomingIsNewer = incomingUpdatedAt > existingUpdatedAt
      || (incomingUpdatedAt === existingUpdatedAt && incoming.revision > existing.revision);
    if (!incomingIsNewer) {
      skipped += 1;
      return;
    }
    jobs[existingIndex] = {
      ...incoming,
      id: existing.id,
      revision: Math.max(existing.revision, incoming.revision)
    };
    updated += 1;
  });
  return { jobs, added, updated, skipped, count: sourceList.length };
}

function workflowStageIndex(workflow, stageId) {
  const stages = Array.isArray(workflow?.stages) ? workflow.stages : [];
  const index = stages.findIndex((stage) => stage.id === stageId);
  return index >= 0 ? index : 0;
}

function nextWorkflowStage(workflow) {
  const stages = Array.isArray(workflow?.stages) ? workflow.stages : [];
  const index = workflowStageIndex(workflow, workflow?.currentStageId);
  return stages[index + 1] || null;
}

function renameWorkflowStage(workflow, stageId, name) {
  const normalized = normalizeWorkflow(workflow);
  return normalizeWorkflow({
    ...normalized,
    stages: normalized.stages.map((stage) => stage.id === String(stageId) ? { ...stage, name } : stage)
  });
}

function moveWorkflowStage(workflow, stageId, direction) {
  const normalized = normalizeWorkflow(workflow);
  const index = normalized.stages.findIndex((stage) => stage.id === String(stageId));
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= normalized.stages.length) return normalized;
  const stages = [...normalized.stages];
  [stages[index], stages[targetIndex]] = [stages[targetIndex], stages[index]];
  return normalizeWorkflow({ ...normalized, stages });
}

function removeWorkflowStage(workflow, stageId) {
  const normalized = normalizeWorkflow(workflow);
  if (normalized.stages.length <= 1) return normalized;
  const index = normalized.stages.findIndex((stage) => stage.id === String(stageId));
  if (index < 0) return normalized;
  const stages = normalized.stages.filter((stage) => stage.id !== String(stageId));
  const currentStageId = normalized.currentStageId === String(stageId)
    ? stages[Math.min(index, stages.length - 1)].id
    : normalized.currentStageId;
  return normalizeWorkflow({
    ...normalized,
    stages,
    currentStageId,
    timeline: normalized.timeline.filter((item) => item.stageId !== String(stageId))
  });
}

function setWorkflowCurrentStage(workflow, stageId) {
  const normalized = normalizeWorkflow(workflow);
  return normalizeWorkflow({ ...normalized, currentStageId: stageId });
}

const jobCoreApi = {
  DEFAULT_WORKFLOW_STAGES,
  JOB_LIFECYCLE_LABELS,
  JOB_LIFECYCLE_STATUSES,
  JOB_PRIORITIES,
  JOB_PRIORITY_LABELS,
  LEGACY_STATUS_STAGE_NAMES,
  defaultWorkflow,
  normalizeWorkflow,
  normalizeJobApplication,
  jobDeadlineReminderDue,
  mergeImportedJobApplications,
  saveJobApplication,
  deleteJobApplication,
  workflowStageIndex,
  nextWorkflowStage,
  renameWorkflowStage,
  moveWorkflowStage,
  removeWorkflowStage,
  setWorkflowCurrentStage
};

if (typeof window !== 'undefined') window.YanjiJobCore = jobCoreApi;
if (typeof module !== 'undefined' && module.exports) module.exports = jobCoreApi;

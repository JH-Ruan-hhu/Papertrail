'use strict';

const {
  normalizeAttendance,
  normalizeFocusSession,
  normalizeMetadataField,
  normalizeNote
} = require('./workbench-core');
const { normalizeJobApplication } = require('./job-core');
const { normalizeCountdown } = require('./countdown-core');
const { DATA_VERSION, migrateSchema7To8, migrateSchema8To9, migrateSchema9To10, migrateSchema10To11 } = require('./migration-core');

const RETRY_DELAYS_MS = Object.freeze([15 * 60_000, 60 * 60_000]);
const TASK_REMINDER_LEAD_MS = 48 * 60 * 60_000;
const TASK_TYPES = Object.freeze(['revision', 'proof', 'copyright', 'followup']);
const TASK_TYPE_LABELS = Object.freeze({
  revision: '修回截止日期',
  proof: '校样截止日期',
  copyright: '版权/许可文件截止日期',
  followup: '建议催稿日期'
});
const REVISION_STATUSES = Object.freeze(['pending-revision', 'submitted', 'waiting-decision', 'completed']);
const REVISION_STATUS_LABELS = Object.freeze({
  'pending-revision': '待修回',
  submitted: '已提交',
  'waiting-decision': '等待决定',
  completed: '已完成'
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function latestDate(values, fallback = null) {
  const timestamps = values.filter(validDate).map((value) => Date.parse(value));
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : fallback;
}

function isoDate(value, fallback = null) {
  return validDate(value) ? new Date(value).toISOString() : fallback;
}

function cleanText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeDetails(value) {
  const details = asObject(value) || {};
  return {
    manuscriptId: cleanText(details.manuscriptId, 200) || null,
    handlingEditor: cleanText(details.handlingEditor, 200) || null,
    currentContact: cleanText(details.currentContact, 300) || null,
    dispositionNote: cleanText(details.dispositionNote, 4000) || null,
    notes: cleanText(details.notes, 10_000) || null
  };
}

function normalizeTask(task, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(task)) throw new Error(`第 ${index + 1} 条截止任务格式无效。`);
  const type = TASK_TYPES.includes(task.type) ? task.type : null;
  if (!type) throw new Error(`第 ${index + 1} 条截止任务类型无效。`);
  const dueAt = isoDate(task.dueAt);
  if (!dueAt) throw new Error(`第 ${index + 1} 条截止任务缺少有效截止时间。`);
  const createdAt = isoDate(task.createdAt, fallbackAt);
  const completedAt = isoDate(task.completedAt);
  const reminderStage = ['due-soon', 'overdue'].includes(task.reminderStage) ? task.reminderStage : null;
  return {
    id: cleanText(task.id, 200) || `task-${index + 1}`,
    type,
    title: cleanText(task.title, 300) || TASK_TYPE_LABELS[type],
    dueAt,
    completedAt,
    createdAt,
    updatedAt: isoDate(task.updatedAt, createdAt),
    reminderStage,
    lastRemindedAt: isoDate(task.lastRemindedAt)
  };
}

function normalizeRevisionRound(round, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(round)) throw new Error(`第 ${index + 1} 条修回轮次格式无效。`);
  const number = Number(round.round);
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    throw new Error(`第 ${index + 1} 条修回轮次编号无效。`);
  }
  const status = REVISION_STATUSES.includes(round.status) ? round.status : 'pending-revision';
  const createdAt = isoDate(round.createdAt, fallbackAt);
  return {
    id: cleanText(round.id, 200) || `revision-${number}`,
    round: number,
    decisionType: cleanText(round.decisionType, 200) || '未记录',
    requestedAt: isoDate(round.requestedAt),
    dueAt: isoDate(round.dueAt),
    submittedAt: isoDate(round.submittedAt),
    status,
    notes: cleanText(round.notes, 4000) || null,
    createdAt,
    updatedAt: isoDate(round.updatedAt, createdAt)
  };
}

function normalizeReviewEvents(snapshot, observedAt) {
  if (!Array.isArray(snapshot.events)) return [];
  return snapshot.events.filter(asObject).slice(0, 500).map((event, index) => ({
    id: cleanText(event.id, 200) || `event-${index + 1}`,
    type: cleanText(event.type, 200) || 'UNKNOWN',
    revision: Number.isFinite(Number(event.revision)) ? Number(event.revision) : 0,
    date: Number.isFinite(Number(event.date)) ? Number(event.date) : null,
    observedAt: isoDate(event.observedAt, observedAt)
  }));
}

function migratePaper(paper, index = 0) {
  if (!asObject(paper)) throw new Error(`第 ${index + 1} 条稿件记录不是有效对象。`);
  if (typeof paper.id !== 'string' || !paper.id.trim()) throw new Error(`第 ${index + 1} 条稿件记录缺少 id。`);
  if (!asObject(paper.snapshot) || !asObject(paper.snapshot.status)) {
    throw new Error(`稿件 ${paper.id} 缺少可识别的状态快照。`);
  }
  if (typeof paper.trackingSecret !== 'string' || !paper.trackingSecret) {
    throw new Error(`稿件 ${paper.id} 缺少加密追踪凭证。`);
  }

  const history = Array.isArray(paper.history)
    ? paper.history.filter(asObject).map((entry) => ({ ...entry }))
    : [];
  const addedAt = validDate(paper.addedAt)
    ? new Date(paper.addedAt).toISOString()
    : latestDate(history.map((entry) => entry.checkedAt), new Date(0).toISOString());
  const legacyCheckedAt = validDate(paper.lastCheckedAt)
    ? new Date(paper.lastCheckedAt).toISOString()
    : null;
  const historySuccessAt = latestDate(history.map((entry) => entry.checkedAt), addedAt);
  const lastError = typeof paper.lastError === 'string' && paper.lastError.trim()
    ? paper.lastError.trim()
    : null;
  const lastAttemptAt = validDate(paper.lastAttemptAt)
    ? new Date(paper.lastAttemptAt).toISOString()
    : legacyCheckedAt || historySuccessAt;
  const lastSuccessfulAt = validDate(paper.lastSuccessfulAt)
    ? new Date(paper.lastSuccessfulAt).toISOString()
    : (lastError ? historySuccessAt : legacyCheckedAt || historySuccessAt);
  const failureStreak = Number.isInteger(paper.failureStreak) && paper.failureStreak >= 0
    ? paper.failureStreak
    : (lastError ? 1 : 0);
  const nextRetryAt = validDate(paper.nextRetryAt)
    ? new Date(paper.nextRetryAt).toISOString()
    : null;
  const archivedAt = validDate(paper.archivedAt)
    ? new Date(paper.archivedAt).toISOString()
    : null;
  const journeyId = typeof paper.journeyId === 'string' && paper.journeyId.trim()
    ? paper.journeyId.trim()
    : null;
  const importantUpdates = Array.isArray(paper.importantUpdates)
    ? paper.importantUpdates.filter(asObject).map((update, updateIndex) => {
      const occurredAt = validDate(update.occurredAt)
        ? new Date(update.occurredAt).toISOString()
        : lastSuccessfulAt;
      const isRead = update.isRead === true;
      return {
        id: String(update.id || `update-${index + 1}-${updateIndex + 1}`),
        occurredAt,
        content: String(update.content || '重要状态变化'),
        isRead,
        readAt: isRead && validDate(update.readAt) ? new Date(update.readAt).toISOString() : null
      };
    })
    : [];

  const snapshot = {
    ...paper.snapshot,
    events: normalizeReviewEvents(paper.snapshot, lastSuccessfulAt)
  };
  const details = normalizeDetails(paper.details);
  const tasks = Array.isArray(paper.tasks)
    ? paper.tasks.map((task, taskIndex) => normalizeTask(task, taskIndex, addedAt))
    : [];
  const revisionRounds = Array.isArray(paper.revisionRounds)
    ? paper.revisionRounds.map((round, roundIndex) => normalizeRevisionRound(round, roundIndex, addedAt))
    : [];

  return {
    ...paper,
    addedAt,
    archivedAt,
    journeyId,
    lastAttemptAt,
    lastSuccessfulAt,
    failureStreak,
    nextRetryAt,
    lastError,
    snapshot,
    history,
    importantUpdates,
    details,
    tasks,
    revisionRounds
  };
}

function migrateData(parsed, defaultSettings) {
  const sourceVersion = Number(parsed?.version || 1);
  const v8 = sourceVersion <= 8
    ? migrateSchema7To8(parsed, { defaultSettings })
    : { data: parsed, changed: false };
  const v9 = Number(v8.data.version || 8) <= 9
    ? migrateSchema8To9(v8.data)
    : { data: v8.data, changed: false };
  const v9Version = Number(v9.data.version || 9);
  let v10;
  let shouldNormalizeJobRecords = false;
  if (v9Version <= 9) {
    v10 = migrateSchema9To10(v9.data);
    shouldNormalizeJobRecords = true;
  } else {
    if (v9Version > DATA_VERSION) throw new Error(`数据文件来自更高版本（v${v9Version}），当前研迹无法安全打开。`);
    if (v9.data.jobApplications != null && !Array.isArray(v9.data.jobApplications)) throw new Error('求职记录列表格式无效。');
    for (const [index, item] of (v9.data.jobApplications || []).entries()) {
      if (!asObject(item)) throw new Error(`第 ${index + 1} 条求职记录格式无效。`);
    }
    // v1.3.1 already stores schema 10. Keep those records in place and let
    // the renderer normalize them lazily; saving one record upgrades only
    // that record instead of rewriting the entire job collection on startup.
    v10 = { data: v9.data, changed: false };
  }
  const migrated = Number(v10.data.version || 10) <= 10
    ? migrateSchema10To11(v10.data)
    : v10;
  const source = migrated.data;
  if (source.countdowns != null && !Array.isArray(source.countdowns)) throw new Error('倒计时列表格式无效。');
  const settings = source.settings;
  const papers = (source.papers || []).map(migratePaper).map((paper) => (
    paper.lastError && !paper.nextRetryAt
      ? { ...paper, nextRetryAt: nextRetryAt(paper.lastAttemptAt, paper.failureStreak || 1, settings.refreshMinutes) }
      : paper
  ));
  const notes = (source.notes || []).map((note, index) => normalizeNote(note, index));
  const metadataFields = (source.metadataFields || []).map(normalizeMetadataField);
  const attendance = (source.attendance || []).map((record, index) => normalizeAttendance(record, index));
  const focusSessions = (source.focusSessions || []).map((session, index) => normalizeFocusSession(session, index));
  const jobApplications = shouldNormalizeJobRecords
    ? (source.jobApplications || []).map((item, index) => normalizeJobApplication(item, index))
    : (source.jobApplications || []);
  const data = {
    ...source,
    version: DATA_VERSION,
    settings,
    papers,
    schedules: source.schedules || [],
    todos: source.todos || [],
    countdowns: (source.countdowns || []).map(normalizeCountdown).filter(Boolean),
    notes,
    metadataFields,
    attendance,
    focusSessions,
    jobApplications
  };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) || v8.changed || v9.changed || migrated.changed };
}

function retryDelayMs(failureStreak, refreshMinutes = 360) {
  if (failureStreak <= RETRY_DELAYS_MS.length) {
    return RETRY_DELAYS_MS[Math.max(0, failureStreak - 1)];
  }
  const safeMinutes = Number.isFinite(Number(refreshMinutes)) ? Number(refreshMinutes) : 360;
  return Math.max(60, Math.min(1440, safeMinutes)) * 60_000;
}

function nextRetryAt(attemptedAt, failureStreak, refreshMinutes) {
  const base = validDate(attemptedAt) ? Date.parse(attemptedAt) : Date.now();
  return new Date(base + retryDelayMs(failureStreak, refreshMinutes)).toISOString();
}

function applyRefreshFailure(paper, message, attemptedAt, refreshMinutes) {
  const failureStreak = Math.max(0, Number(paper.failureStreak) || 0) + 1;
  return {
    ...paper,
    lastAttemptAt: attemptedAt,
    lastError: String(message || '同步失败。'),
    failureStreak,
    nextRetryAt: nextRetryAt(attemptedAt, failureStreak, refreshMinutes)
  };
}

function applyRefreshSuccess(paper, snapshot, successfulAt, history, importantUpdates, attemptedAt = successfulAt) {
  return {
    ...paper,
    snapshot,
    lastAttemptAt: attemptedAt,
    lastSuccessfulAt: successfulAt,
    failureStreak: 0,
    nextRetryAt: null,
    lastError: null,
    history,
    importantUpdates
  };
}

function markUpdatesRead(paper, readAt = new Date().toISOString()) {
  return {
    ...paper,
    importantUpdates: (paper.importantUpdates || []).map((update) => (
      update.isRead ? update : { ...update, isRead: true, readAt }
    ))
  };
}

function appendImportantUpdates(paper, contents, occurredAt, makeId = (_content, index) => `update-${Date.parse(occurredAt) || 0}-${index + 1}`) {
  const updates = Array.isArray(paper.importantUpdates) ? [...paper.importantUpdates] : [];
  for (const [index, content] of (contents || []).entries()) {
    updates.push({
      id: String(makeId(content, index)),
      occurredAt,
      content: String(content),
      isRead: false,
      readAt: null
    });
  }
  return { ...paper, importantUpdates: updates.slice(-200) };
}

function setArchived(paper, archived, changedAt = new Date().toISOString()) {
  return { ...paper, archivedAt: archived ? changedAt : null };
}

function linkJourney(papers, id, targetId) {
  if (id === targetId) throw new Error('不能将稿件关联到自身。');
  const paper = (papers || []).find((item) => item.id === id);
  const target = (papers || []).find((item) => item.id === targetId);
  if (!paper || !target) throw new Error('找不到需要关联的稿件。');
  const sourceJourneyId = paper.journeyId || paper.id;
  const targetJourneyId = target.journeyId || target.id;
  if (sourceJourneyId === targetJourneyId) return [...papers];
  return papers.map((item) => (
    item.id === paper.id || item.journeyId === sourceJourneyId ||
    item.id === target.id || item.journeyId === targetJourneyId
      ? { ...item, journeyId: targetJourneyId }
      : item
  ));
}

function unlinkJourney(papers, id) {
  const paper = (papers || []).find((item) => item.id === id);
  if (!paper) throw new Error('找不到这篇稿件。');
  if (!paper.journeyId) return [...papers];
  const journeyId = paper.journeyId;
  const unlinked = papers.map((item) => item.id === id ? { ...item, journeyId: null } : item);
  const remaining = unlinked.filter((item) => item.journeyId === journeyId);
  if (remaining.length !== 1) return unlinked;
  return unlinked.map((item) => item.id === remaining[0].id ? { ...item, journeyId: null } : item);
}

function unreadCount(paper) {
  return (paper.importantUpdates || []).filter((update) => !update.isRead).length;
}

function taskUrgency(task, now = new Date().toISOString(), leadMs = TASK_REMINDER_LEAD_MS) {
  if (task.completedAt) return { rank: 0, state: 'completed', label: '已完成' };
  const due = Date.parse(task.dueAt);
  const current = Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return { rank: 0, state: 'invalid', label: '日期无效' };
  if (due < current) return { rank: 3, state: 'overdue', label: '已逾期' };
  if (due - current <= leadMs) return { rank: 2, state: 'due-soon', label: '即将到期' };
  return { rank: 1, state: 'upcoming', label: '待完成' };
}

function paperTaskSummary(paper, now = new Date().toISOString()) {
  const tasks = (paper.tasks || []).filter((task) => !task.completedAt).map((task) => ({
    ...task,
    urgency: taskUrgency(task, now)
  })).sort((a, b) => b.urgency.rank - a.urgency.rank || Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return tasks[0] || null;
}

function updatePaperDetails(paper, details) {
  return { ...paper, details: normalizeDetails(details) };
}

function saveTask(paper, input, now = new Date().toISOString(), makeId = () => `task-${Date.now()}`) {
  const current = (paper.tasks || []).find((task) => task.id === input?.id);
  const normalized = normalizeTask({
    ...current,
    ...input,
    id: current?.id || makeId(),
    createdAt: current?.createdAt || now,
    updatedAt: now,
    reminderStage: current?.dueAt === isoDate(input?.dueAt) && !current?.completedAt ? current.reminderStage : null,
    lastRemindedAt: current?.dueAt === isoDate(input?.dueAt) && !current?.completedAt ? current.lastRemindedAt : null
  }, 0, now);
  const tasks = current
    ? (paper.tasks || []).map((task) => task.id === current.id ? normalized : task)
    : [...(paper.tasks || []), normalized];
  return { ...paper, tasks };
}

function completeTask(paper, id, completed = true, now = new Date().toISOString()) {
  let found = false;
  const tasks = (paper.tasks || []).map((task) => {
    if (task.id !== id) return task;
    found = true;
    return { ...task, completedAt: completed ? now : null, updatedAt: now, reminderStage: null, lastRemindedAt: null };
  });
  if (!found) throw new Error('找不到这条截止任务。');
  return { ...paper, tasks };
}

function deleteTask(paper, id) {
  const tasks = (paper.tasks || []).filter((task) => task.id !== id);
  if (tasks.length === (paper.tasks || []).length) throw new Error('找不到这条截止任务。');
  return { ...paper, tasks };
}

function tasksNeedingNotification(papers, now = new Date().toISOString(), leadMs = TASK_REMINDER_LEAD_MS) {
  const reminders = [];
  for (const paper of papers || []) {
    if (paper.archivedAt) continue;
    for (const task of paper.tasks || []) {
      const urgency = taskUrgency(task, now, leadMs);
      if (!['due-soon', 'overdue'].includes(urgency.state)) continue;
      if (task.reminderStage === urgency.state) continue;
      reminders.push({ paper, task, urgency });
    }
  }
  return reminders;
}

function markTaskReminded(paper, id, stage, remindedAt = new Date().toISOString()) {
  return {
    ...paper,
    tasks: (paper.tasks || []).map((task) => task.id === id
      ? { ...task, reminderStage: stage, lastRemindedAt: remindedAt }
      : task)
  };
}

function saveRevisionRound(paper, input, now = new Date().toISOString(), makeId = () => `revision-${Date.now()}`) {
  const current = (paper.revisionRounds || []).find((round) => round.id === input?.id);
  const normalized = normalizeRevisionRound({
    ...current,
    ...input,
    id: current?.id || makeId(),
    createdAt: current?.createdAt || now,
    updatedAt: now
  }, 0, now);
  const duplicate = (paper.revisionRounds || []).find((round) => round.round === normalized.round && round.id !== normalized.id);
  if (duplicate) throw new Error(`R${normalized.round} 已经存在。`);
  const revisionRounds = current
    ? (paper.revisionRounds || []).map((round) => round.id === current.id ? normalized : round)
    : [...(paper.revisionRounds || []), normalized];
  return { ...paper, revisionRounds: revisionRounds.sort((a, b) => a.round - b.round) };
}

function deleteRevisionRound(paper, id) {
  const revisionRounds = (paper.revisionRounds || []).filter((round) => round.id !== id);
  if (revisionRounds.length === (paper.revisionRounds || []).length) throw new Error('找不到这条修回轮次。');
  return { ...paper, revisionRounds };
}

function latestProductionEvent(snapshot) {
  const events = Array.isArray(snapshot?.productionEvents) ? snapshot.productionEvents : [];
  return [...events].sort((a, b) => {
    const aTime = Number(a?.date) || Date.parse(a?.dateText || '') || 0;
    const bTime = Number(b?.date) || Date.parse(b?.dateText || '') || 0;
    return bTime - aTime;
  })[0] || null;
}

function actionState(paper) {
  const urgentTask = paperTaskSummary(paper);
  if (urgentTask?.urgency.state === 'overdue') {
    return { category: 'overdue', label: `${urgentTask.title}已逾期`, tone: 'red', needsAction: true, canArchive: false };
  }
  if (urgentTask?.urgency.state === 'due-soon') {
    return { category: 'deadline', label: `${urgentTask.title}即将到期`, tone: 'amber', needsAction: true, canArchive: false };
  }
  if (paper.lastError) {
    return { category: 'failure', label: '同步失败，请检查连接或稍后重试', tone: 'red', needsAction: false, canArchive: false };
  }
  const latestRound = [...(paper.revisionRounds || [])].sort((a, b) => b.round - a.round)[0];
  if (latestRound?.status === 'pending-revision') {
    return { category: 'action', label: `R${latestRound.round} 待修回`, tone: 'amber', needsAction: true, canArchive: false };
  }
  if (['submitted', 'waiting-decision'].includes(latestRound?.status)) {
    return { category: 'waiting', label: `R${latestRound.round} 已提交，等待决定`, tone: 'blue', needsAction: false, canArchive: false };
  }
  const snapshot = paper.snapshot || paper;
  if (snapshot.kind === 'production' || paper.source === 'elsevier-production') {
    const event = latestProductionEvent(snapshot);
    const id = event?.id || String(snapshot.status?.raw || '').split(':')[1] || '';
    const actionLabels = {
      copyrightTransferSent: '版权与许可待完成',
      offprintOrderSent: '印刷本选项待确认',
      proofsAvailable: '校样已到，请检查'
    };
    if (actionLabels[id]) {
      return { category: 'action', label: actionLabels[id], tone: 'amber', needsAction: true, canArchive: false };
    }
    if (['finalArticleOnline', 'shareLinkSent'].includes(id)) {
      return { category: 'complete', label: '正式版本已上线，可以归档', tone: 'green', needsAction: false, canArchive: true };
    }
    if (id === 'acceptedManuscriptOnline') {
      return { category: 'waiting', label: '录用稿已上线，等待正式出版', tone: 'blue', needsAction: false, canArchive: false };
    }
    if (id === 'proofsReturned') {
      return { category: 'waiting', label: '校样已返回，等待出版商处理', tone: 'blue', needsAction: false, canArchive: false };
    }
    if (id === 'copyrightTransferReceived') {
      return { category: 'waiting', label: '版权手续已完成，等待出版商处理', tone: 'blue', needsAction: false, canArchive: false };
    }
    return { category: 'waiting', label: '等待出版商推进', tone: 'blue', needsAction: false, canArchive: false };
  }

  const raw = Number(snapshot.status?.raw);
  const states = {
    3: ['waiting', '等待审稿人回复', 'blue', false],
    4: ['waiting', '等待编辑决定', 'violet', false],
    8: ['waiting', '等待编辑处理', 'blue', false],
    11: ['action', '需要准备并提交修订稿', 'amber', true],
    23: ['waiting', '等待审稿人回复', 'blue', false],
    28: ['waiting', '等待编辑接受邀请', 'blue', false]
  };
  const state = states[raw];
  if (state) return { category: state[0], label: state[1], tone: state[2], needsAction: state[3], canArchive: false };
  return {
    category: 'unknown',
    label: snapshot.status?.label || `未识别状态（代码 ${String(snapshot.status?.raw ?? '未提供')}）`,
    tone: 'neutral',
    needsAction: false,
    canArchive: false
  };
}

function lastChangedAt(paper) {
  return latestDate([
    ...(paper.importantUpdates || []).map((update) => update.occurredAt),
    ...(paper.history || []).map((entry) => entry.checkedAt),
    ...(paper.tasks || []).map((task) => task.updatedAt),
    ...(paper.revisionRounds || []).map((round) => round.updatedAt),
    paper.lastSuccessfulAt,
    paper.addedAt
  ], paper.addedAt);
}

function matchesPaperSearch(paper, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('zh-CN');
  if (!needle) return true;
  return [
    paper.title || paper.snapshot?.title,
    paper.journal || paper.snapshot?.journal,
    paper.articleReference || paper.snapshot?.articleReference,
    paper.details?.manuscriptId,
    paper.details?.handlingEditor,
    paper.details?.currentContact
  ]
    .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(needle));
}

function sortPapers(papers) {
  return [...papers].sort((a, b) => {
    const aTask = paperTaskSummary(a);
    const bTask = paperTaskSummary(b);
    const aPriority = (aTask?.urgency.rank || 0) * 10 + (unreadCount(a) > 0 || a.needsAction || actionState(a).needsAction ? 1 : 0);
    const bPriority = (bTask?.urgency.rank || 0) * 10 + (unreadCount(b) > 0 || b.needsAction || actionState(b).needsAction ? 1 : 0);
    if (aPriority !== bPriority) return bPriority - aPriority;
    const changed = Date.parse(lastChangedAt(b) || 0) - Date.parse(lastChangedAt(a) || 0);
    if (changed) return changed;
    return Date.parse(b.addedAt || 0) - Date.parse(a.addedAt || 0);
  });
}

function filterAndSortPapers(papers, { query = '', view = 'all' } = {}) {
  return sortPapers((papers || []).filter((paper) => {
    if (!matchesPaperSearch(paper, query)) return false;
    if (view === 'archived') return Boolean(paper.archivedAt);
    if (view === 'important') return unreadCount(paper) > 0;
    return !paper.archivedAt;
  }));
}

function redactSensitive(value) {
  return String(value ?? '')
    .replace(/https:\/\/track\.authorhub\.elsevier\.com\/?\?[^\s)\]]+/gi, '[已移除追踪链接]')
    .replace(/https:\/\/authors\.elsevier\.com\/tracking\/article\/details\.do\?[^\s)\]]+/gi, '[已移除作者查询链接]')
    .replace(/uuid\s*=\s*[A-Za-z0-9_-]{8,200}/gi, 'uuid=[已移除]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[已移除标识符]')
    .replace(/\b(aid|jid|surname)=([^&\s]+)/gi, '$1=[已移除]');
}

function exportRows(paper) {
  const snapshot = paper.snapshot || paper;
  const details = normalizeDetails(paper.details);
  const status = actionState(paper).label;
  const rows = [
    ['基本信息', '', `标题：${snapshot.title || '未命名稿件'}`],
    ['基本信息', '', `期刊：${snapshot.journal || '未知期刊'}`],
    ['基本信息', '', `当前状态：${status}`]
  ];
  if (snapshot.articleReference) rows.push(['关键日期', '', `生产编号：${snapshot.articleReference}`]);
  if (details.manuscriptId) rows.push(['补充信息', '', `Manuscript ID：${details.manuscriptId}`]);
  if (details.handlingEditor) rows.push(['补充信息', '', `处理编辑：${details.handlingEditor}`]);
  if (details.currentContact) rows.push(['补充信息', '', `当前投稿联系人：${details.currentContact}`]);
  if (details.dispositionNote) rows.push(['备注', '', `拒稿/转投/接收备注：${details.dispositionNote}`]);
  if (details.notes) rows.push(['备注', '', `自定义备注：${details.notes}`]);
  if (snapshot.doi) rows.push(['基本信息', '', `DOI：${snapshot.doi}`]);
  if (snapshot.submissionDate) rows.push(['关键日期', snapshot.submissionDate, '首次投稿']);
  if (snapshot.acceptedDate) rows.push(['关键日期', snapshot.acceptedDate, '文章接收']);
  if (paper.lastSuccessfulAt) rows.push(['关键日期', paper.lastSuccessfulAt, '研迹最近成功同步']);
  for (const entry of paper.history || []) {
    const details = Array.isArray(entry.changes) && entry.changes.length
      ? entry.changes.join('；')
      : entry.status?.label || '状态记录';
    rows.push(['状态历史', entry.checkedAt || '', details]);
  }
  for (const round of paper.revisionRounds || []) {
    const dates = [
      round.requestedAt ? `要求修回 ${round.requestedAt}` : '',
      round.dueAt ? `截止 ${round.dueAt}` : '',
      round.submittedAt ? `实际提交 ${round.submittedAt}` : ''
    ].filter(Boolean).join('；');
    rows.push([
      '修回轮次',
      round.requestedAt || round.submittedAt || round.dueAt || '',
      `R${round.round} · ${round.decisionType} · ${REVISION_STATUS_LABELS[round.status] || round.status}${dates ? `；${dates}` : ''}${round.notes ? `；备注：${round.notes}` : ''}`
    ]);
  }
  for (const task of paper.tasks || []) {
    rows.push([
      '截止任务',
      task.dueAt,
      `${task.title} · ${task.completedAt ? `已完成（${task.completedAt}）` : taskUrgency(task).label}`
    ]);
  }
  for (const event of snapshot.events || []) {
    const publisherTime = event.date ? new Date(Number(event.date) * 1000).toISOString() : '未提供';
    rows.push([
      '审稿事件',
      publisherTime === '未提供' ? event.observedAt || '' : publisherTime,
      `R${event.revision} · ${event.type || 'UNKNOWN'} · 出版商时间：${publisherTime} · 本地首次观察：${event.observedAt || '未记录'}`
    ]);
  }
  for (const event of snapshot.productionEvents || []) {
    rows.push(['出版事件', event.dateText || '', event.label || event.sourceLabel || '出版进展']);
  }
  return rows.map((row) => row.map(redactSensitive));
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildPaperExport(paper, format) {
  const rows = exportRows(paper);
  if (format === 'csv') {
    return ['类别,日期,内容', ...rows.map((row) => row.map(csvCell).join(','))].join('\r\n');
  }
  if (format !== 'markdown') throw new Error('不支持的导出格式。');
  const snapshot = paper.snapshot || paper;
  const details = normalizeDetails(paper.details);
  const lines = [
    `# ${redactSensitive(snapshot.title || '未命名稿件')}`,
    '',
    `- 期刊：${redactSensitive(snapshot.journal || '未知期刊')}`,
    `- 当前状态：${redactSensitive(actionState(paper).label)}`,
    `- Manuscript ID：${redactSensitive(details.manuscriptId || '未填写')}`,
    `- 处理编辑：${redactSensitive(details.handlingEditor || '未填写')}`,
    `- 当前投稿联系人：${redactSensitive(details.currentContact || '未填写')}`,
    `- 生产编号：${redactSensitive(snapshot.articleReference || '不适用')}`,
    `- DOI：${redactSensitive(snapshot.doi || '尚未分配')}`,
    `- 最近成功同步：${redactSensitive(paper.lastSuccessfulAt || '尚未记录')}`,
    '',
    '## 时间线',
    ''
  ];
  for (const [category, date, content] of rows.filter((row) => !row[2].startsWith('标题：') && !row[2].startsWith('期刊：') && !row[2].startsWith('当前状态：') && !row[2].startsWith('生产编号：'))) {
    lines.push(`- ${date || '日期未提供'} · **${category}** · ${content}`);
  }
  return lines.join('\n');
}

module.exports = {
  DATA_VERSION,
  RETRY_DELAYS_MS,
  TASK_REMINDER_LEAD_MS,
  TASK_TYPES,
  TASK_TYPE_LABELS,
  REVISION_STATUSES,
  REVISION_STATUS_LABELS,
  migratePaper,
  migrateData,
  retryDelayMs,
  nextRetryAt,
  applyRefreshFailure,
  applyRefreshSuccess,
  markUpdatesRead,
  appendImportantUpdates,
  setArchived,
  linkJourney,
  unlinkJourney,
  unreadCount,
  taskUrgency,
  paperTaskSummary,
  updatePaperDetails,
  saveTask,
  completeTask,
  deleteTask,
  tasksNeedingNotification,
  markTaskReminded,
  saveRevisionRound,
  deleteRevisionRound,
  actionState,
  lastChangedAt,
  matchesPaperSearch,
  sortPapers,
  filterAndSortPapers,
  redactSensitive,
  buildPaperExport
};

'use strict';

const DATA_VERSION = 2;
const RETRY_DELAYS_MS = Object.freeze([15 * 60_000, 60 * 60_000]);

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
    history,
    importantUpdates
  };
}

function migrateData(parsed, defaultSettings) {
  if (!asObject(parsed)) throw new Error('数据文件根节点必须是对象。');
  if (parsed.version != null && (!Number.isInteger(parsed.version) || parsed.version < 1)) {
    throw new Error('数据文件版本号无效。');
  }
  if (Number(parsed.version || 1) > DATA_VERSION) {
    throw new Error(`数据文件来自更高版本（v${parsed.version}），当前 PaperTrail 无法安全打开。`);
  }
  if (parsed.settings != null && !asObject(parsed.settings)) throw new Error('设置数据格式无效。');
  if (parsed.papers != null && !Array.isArray(parsed.papers)) throw new Error('稿件列表格式无效。');

  const settings = { ...defaultSettings, ...(parsed.settings || {}) };
  const papers = (parsed.papers || []).map(migratePaper).map((paper) => (
    paper.lastError && !paper.nextRetryAt
      ? { ...paper, nextRetryAt: nextRetryAt(paper.lastAttemptAt, paper.failureStreak || 1, settings.refreshMinutes) }
      : paper
  ));
  const data = {
    version: DATA_VERSION,
    settings,
    papers
  };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) };
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

function latestProductionEvent(snapshot) {
  const events = Array.isArray(snapshot?.productionEvents) ? snapshot.productionEvents : [];
  return [...events].sort((a, b) => {
    const aTime = Number(a?.date) || Date.parse(a?.dateText || '') || 0;
    const bTime = Number(b?.date) || Date.parse(b?.dateText || '') || 0;
    return bTime - aTime;
  })[0] || null;
}

function actionState(paper) {
  if (paper.lastError) {
    return { category: 'failure', label: '同步失败，请检查连接或稍后重试', tone: 'red', needsAction: false, canArchive: false };
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
    paper.articleReference || paper.snapshot?.articleReference
  ]
    .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(needle));
}

function sortPapers(papers) {
  return [...papers].sort((a, b) => {
    const aPriority = unreadCount(a) > 0 || a.needsAction || actionState(a).needsAction ? 1 : 0;
    const bPriority = unreadCount(b) > 0 || b.needsAction || actionState(b).needsAction ? 1 : 0;
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
  const status = actionState(paper).label;
  const rows = [
    ['基本信息', '', `标题：${snapshot.title || '未命名稿件'}`],
    ['基本信息', '', `期刊：${snapshot.journal || '未知期刊'}`],
    ['基本信息', '', `当前状态：${status}`]
  ];
  if (snapshot.articleReference) rows.push(['关键日期', '', `生产编号：${snapshot.articleReference}`]);
  if (snapshot.doi) rows.push(['基本信息', '', `DOI：${snapshot.doi}`]);
  if (snapshot.submissionDate) rows.push(['关键日期', snapshot.submissionDate, '首次投稿']);
  if (snapshot.acceptedDate) rows.push(['关键日期', snapshot.acceptedDate, '文章接收']);
  if (paper.lastSuccessfulAt) rows.push(['关键日期', paper.lastSuccessfulAt, 'PaperTrail 最近成功同步']);
  for (const entry of paper.history || []) {
    const details = Array.isArray(entry.changes) && entry.changes.length
      ? entry.changes.join('；')
      : entry.status?.label || '状态记录';
    rows.push(['状态历史', entry.checkedAt || '', details]);
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
  const lines = [
    `# ${redactSensitive(snapshot.title || '未命名稿件')}`,
    '',
    `- 期刊：${redactSensitive(snapshot.journal || '未知期刊')}`,
    `- 当前状态：${redactSensitive(actionState(paper).label)}`,
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
  actionState,
  lastChangedAt,
  matchesPaperSearch,
  sortPapers,
  filterAndSortPapers,
  redactSensitive,
  buildPaperExport
};

'use strict';

const { contextBridge } = require('electron');

const now = Date.now();
const todayAt = (hour, minute = 0) => new Date(new Date().setHours(hour, minute, 0, 0)).toISOString();
const tomorrowAt = (hour, minute = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};
const todayKey = new Date().toLocaleDateString('en-CA');
const smokeWorkflow = (prefix, names, currentIndex, dates = {}) => {
  const stages = names.map((name, index) => ({ id: `${prefix}-${index + 1}`, name }));
  return {
    stages,
    currentStageId: stages[Math.max(0, Math.min(currentIndex, stages.length - 1))].id,
    timeline: Object.entries(dates).map(([index, date]) => ({ stageId: stages[Number(index)].id, date }))
  };
};
const mockPaper = {
  id: 'demo-paper',
  source: 'elsevier',
  title: 'Adaptive peer review workflows for distributed research teams',
  journal: 'Journal of Research Systems',
  status: { raw: 3, label: '审稿中', tone: 'blue' },
  latestRevision: 1,
  submissionDate: Math.floor((now - 42 * 86_400_000) / 1000),
  sourceUpdatedAt: Math.floor(now / 1000),
  counts: { invited: 4, accepted: 2, completed: 1 },
  addedAt: new Date(now - 15 * 86_400_000).toISOString(),
  archivedAt: null,
  lastAttemptAt: new Date(now - 8 * 60_000).toISOString(),
  lastSuccessfulAt: new Date(now - 8 * 60_000).toISOString(),
  failureStreak: 0,
  nextRetryAt: null,
  observedStageStartedAt: new Date(now - 9 * 86_400_000).toISOString(),
  lastChangedAt: new Date(now - 9 * 86_400_000).toISOString(),
  needsAction: false,
  unreadCount: 2,
  importantUpdates: [
    { id: 'update-1', occurredAt: new Date(now - 9 * 86_400_000).toISOString(), content: '状态：编辑处理中 → 审稿中', isRead: false, readAt: null },
    { id: 'update-2', occurredAt: new Date(now - 8 * 60_000).toISOString(), content: '收到新的审稿回复：0 → 1', isRead: false, readAt: null }
  ],
  maskedTrackingUrl: 'https://track.authorhub.elsevier.com/?uuid=••••4c1d',
  lastError: null,
  history: [
    {
      checkedAt: new Date(now - 15 * 86_400_000).toISOString(),
      status: { raw: 8, label: '编辑处理中', tone: 'amber' },
      latestRevision: 1,
      counts: { invited: 0, accepted: 0, completed: 0 },
      changes: ['首次记录']
    },
    {
      checkedAt: new Date(now - 9 * 86_400_000).toISOString(),
      status: { raw: 3, label: '审稿中', tone: 'blue' },
      latestRevision: 1,
      counts: { invited: 4, accepted: 2, completed: 1 },
      changes: ['状态：编辑处理中 → 审稿中', '邀请审稿人：0 → 4']
    }
  ]
};

const productionPaper = {
  id: 'demo-production-paper',
  source: 'elsevier-production',
  kind: 'production',
  title: 'Digital infrastructure and territorial heterogeneity in quality-of-life outcomes',
  journal: 'Socio-Economic Planning Sciences',
  status: { raw: 'production:shareLinkSent:4 Aug 2026', label: '正式版本已上线，可以归档', tone: 'green' },
  latestRevision: 0,
  submissionDate: Math.floor((now - 74 * 86_400_000) / 1000),
  sourceUpdatedAt: Math.floor(now / 1000),
  counts: { invited: 0, accepted: 0, completed: 0 },
  articleReference: 'SEPS_102545',
  correspondingAuthor: 'Gianluca Monturano',
  firstAuthor: 'Angela Bergantino',
  acceptedDate: '19 Jun 2026',
  doi: '10.1016/j.seps.2026.102545',
  statusComment: 'Proofs available for checking',
  productionEvents: [
    { id: 'shareLinkSent', label: '免费分享链接已发送', dateText: '4 Aug 2026' },
    { id: 'finalArticleOnline', label: '正式版本已上线', dateText: '4 Aug 2026' },
    { id: 'proofsReturned', label: '校样修改已返回', dateText: '2 Aug 2026' },
    { id: 'proofsAvailable', label: '校样已到，请及时检查', dateText: '30 Jul 2026' },
    { id: 'acceptedManuscriptOnline', label: '录用稿已上线', dateText: '30 Jul 2026' },
    { id: 'offprintOrderReceived', label: '印刷本选项已完成', dateText: '30 Jul 2026' },
    { id: 'copyrightTransferReceived', label: '版权与许可表已完成', dateText: '29 Jul 2026' },
    { id: 'copyrightTransferSent', label: '版权与许可表待完成', dateText: '29 Jul 2026' },
    { id: 'received', label: '已进入出版流程', dateText: '20 Jun 2026' }
  ],
  addedAt: new Date(now - 21 * 86_400_000).toISOString(),
  archivedAt: null,
  lastAttemptAt: new Date(now - 3 * 60_000).toISOString(),
  lastSuccessfulAt: new Date(now - 3 * 60_000).toISOString(),
  failureStreak: 0,
  nextRetryAt: null,
  observedStageStartedAt: new Date(now - 3 * 86_400_000).toISOString(),
  lastChangedAt: new Date(now - 3 * 60_000).toISOString(),
  needsAction: false,
  canArchive: true,
  unreadCount: 0,
  importantUpdates: [],
  maskedTrackingUrl: 'Elsevier Production · SEPS_102545',
  lastError: null,
  history: [
    {
      checkedAt: new Date(now - 21 * 86_400_000).toISOString(),
      status: { raw: 'production:received', label: '已进入出版流程', tone: 'green' },
      latestRevision: 0,
      counts: { invited: 0, accepted: 0, completed: 0 },
      changes: ['首次记录出版进展']
    },
    {
      checkedAt: new Date(now - 3 * 86_400_000).toISOString(),
      status: { raw: 'production:proofsAvailable', label: '校样已到，请及时检查', tone: 'green' },
      latestRevision: 0,
      counts: { invited: 0, accepted: 0, completed: 0 },
      changes: ['校样已到，请及时检查']
    }
  ]
};

const archivedPaper = {
  ...productionPaper,
  id: 'demo-archived-paper',
  title: 'Recovered resources from advanced water treatment residuals',
  articleReference: 'WATRES_20416',
  archivedAt: new Date(now - 2 * 86_400_000).toISOString(),
  unreadCount: 0,
  importantUpdates: []
};

const previousSubmissionPaper = {
  ...mockPaper,
  id: 'demo-previous-submission',
  journal: 'Environmental Process Letters',
  status: { raw: 4, label: '等待编辑决定', tone: 'violet' },
  submissionDate: Math.floor((now - 160 * 86_400_000) / 1000),
  addedAt: new Date(now - 120 * 86_400_000).toISOString(),
  archivedAt: new Date(now - 70 * 86_400_000).toISOString(),
  journeyId: 'demo-submission-journey',
  unreadCount: 0,
  importantUpdates: []
};
const journeyMockPaper = { ...mockPaper, journeyId: 'demo-submission-journey' };
const smokePapers = process.env.PAPERTRAIL_EMPTY_SMOKE === '1'
  ? []
  : (process.env.PAPERTRAIL_JOURNEY_SMOKE === '1'
      ? [journeyMockPaper, previousSubmissionPaper, productionPaper, archivedPaper]
      : [mockPaper, productionPaper, archivedPaper]);
let smokeWorkspace = {
  schedules: [
    {
      id: 'schedule-today',
      title: '整理实验结果图',
      startAt: new Date(new Date().setHours(9, 30, 0, 0)).toISOString(),
      endAt: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(),
      priority: 'high',
      deadline: true,
      completedAt: null,
      remindedAt: null,
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 86_400_000).toISOString()
    },
    {
      id: 'schedule-afternoon',
      title: '文献组会',
      startAt: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(),
      endAt: new Date(new Date().setHours(16, 30, 0, 0)).toISOString(),
      priority: 'medium',
      deadline: false,
      completedAt: null,
      remindedAt: null,
      createdAt: new Date(now - 86_400_000).toISOString(),
      updatedAt: new Date(now - 86_400_000).toISOString()
    }
  ],
  todos: [
    {
      id: 'todo-today',
      title: '核对质控回收率',
      notes: '整理今天的实验记录',
      dueAt: todayAt(14, 30),
      reminderAt: todayAt(14, 30),
      reminderMode: 'at-due',
      priority: 'high',
      status: 'open',
      completedAt: null,
      createdAt: todayAt(8, 0),
      updatedAt: todayAt(8, 0)
    },
    {
      id: 'todo-inbox',
      title: '补充方法学说明',
      notes: '',
      dueAt: null,
      reminderAt: null,
      reminderMode: 'none',
      priority: 'medium',
      status: 'open',
      completedAt: null,
      createdAt: todayAt(8, 10),
      updatedAt: todayAt(8, 10)
    }
  ],
  notes: [
    { id: 'note-1', title: 'PFAS 方法学想法', content: '下一轮实验需要同步核对回收率与基质效应。', metadata: { topic: '实验' }, pinned: false, createdAt: new Date(now - 7200_000).toISOString(), updatedAt: new Date(now - 3600_000).toISOString() }
  ],
  metadataFields: [{ id: 'topic', name: '类型', type: 'select', options: ['实验', '文献', '写作'] }],
  attendance: [
    { id: 'attendance-morning', date: todayKey, clockInAt: todayAt(8, 45), clockOutAt: todayAt(12, 5), appUsage: { WINWORD: 1620, chrome: 840 }, createdAt: todayAt(8, 45), updatedAt: todayAt(12, 5) },
    { id: 'attendance-afternoon', date: todayKey, clockInAt: todayAt(13, 20), clockOutAt: todayAt(17, 35), appUsage: { Zotero: 1320, WINWORD: 780 }, createdAt: todayAt(13, 20), updatedAt: todayAt(17, 35) },
    { id: 'attendance-midnight', date: todayKey, clockInAt: todayAt(18, 0), clockOutAt: tomorrowAt(0, 0), appUsage: { WINWORD: 5400 }, createdAt: todayAt(18, 0), updatedAt: tomorrowAt(0, 0) }
  ],
  focusSessions: [
    { id: 'focus-today', startedAt: todayAt(10, 0), endedAt: todayAt(10, 50), plannedMinutes: 50, status: 'completed', appUsage: { WINWORD: 1260, chrome: 980, Zotero: 510 }, suppressNotifications: true, notificationsSuppressed: true, notificationRestore: null, notificationRestoredAt: todayAt(10, 50), notificationError: null, createdAt: todayAt(10, 0), updatedAt: todayAt(10, 50) }
  ],
  jobApplications: [
    { id: 'job-submitted-2', company: '江河环境研究院', role: '水环境研发工程师', lifecycleStatus: 'preparing', status: 'preparing', companyType: '研究院', city: '南京', location: '南京', deadline: new Date(now + 6 * 86_400_000).toISOString(), priority: 'high', annualSalaryWan: 32, sourceUrl: 'https://jobs.example.com/1', contact: '官网', appliedAt: todayAt(8, 0), nextFollowUpAt: todayAt(19, 0), nextActionAt: todayAt(19, 0), notes: '等待筛选反馈', createdAt: todayAt(8, 0), updatedAt: todayAt(8, 0), workflow: smokeWorkflow('submitted-2', ['投递', '测评', '一面', '二面', '三面', '终面', 'Offer'], 1, { 0: todayAt(8, 0), 1: todayAt(12, 0) }), revision: 1 },
    { id: 'job-written-1', company: '蓝源科技', role: '环境咨询顾问', lifecycleStatus: 'active', status: 'active', companyType: '企业', city: '上海', location: '上海', deadline: new Date(now + 14 * 86_400_000).toISOString(), priority: 'medium', sourceUrl: null, contact: null, appliedAt: todayAt(8, 5), nextFollowUpAt: null, nextActionAt: null, notes: null, createdAt: todayAt(8, 5), updatedAt: todayAt(8, 5), workflow: smokeWorkflow('written-1', ['投递', '电话沟通', '案例题'], 1, { 0: todayAt(8, 5) }), revision: 1 },
    { id: 'job-written-2', company: '城市水务集团', role: '研发专员', lifecycleStatus: 'active', status: 'active', companyType: '国企', city: '苏州', location: '苏州', deadline: null, priority: 'low', sourceUrl: null, contact: null, appliedAt: todayAt(8, 10), nextFollowUpAt: null, nextActionAt: null, notes: null, createdAt: todayAt(8, 10), updatedAt: todayAt(8, 10), workflow: smokeWorkflow('written-2', ['申请', '笔试', '技术面', '主管面', 'Offer'], 2, { 0: todayAt(8, 10), 1: todayAt(10, 0) }), revision: 1 },
    { id: 'job-submitted-1', company: '清研检测', role: 'LC-MS/MS 分析工程师', lifecycleStatus: 'active', status: 'active', companyType: '检测机构', city: '杭州', location: '杭州', deadline: new Date(now + 30 * 86_400_000).toISOString(), priority: 'medium', sourceUrl: null, contact: '招聘平台', appliedAt: todayAt(9, 0), nextFollowUpAt: null, nextActionAt: null, notes: '等待筛选反馈', createdAt: todayAt(8, 15), updatedAt: todayAt(9, 0), workflow: smokeWorkflow('submitted-1', ['投递', '测评', '一面', '二面', '三面', '终面', 'Offer'], 0, { 0: todayAt(9, 0) }), revision: 1 },
    { id: 'job-interview-1', company: '生态规划院', role: '环境科研岗', lifecycleStatus: 'active', status: 'active', companyType: '事业单位', city: '南京', location: '南京', deadline: new Date(now + 3 * 86_400_000).toISOString(), priority: 'high', sourceUrl: null, contact: 'HR', appliedAt: todayAt(9, 10), nextFollowUpAt: todayAt(16, 0), nextActionAt: todayAt(16, 0), notes: '准备科研项目陈述', createdAt: todayAt(8, 20), updatedAt: todayAt(9, 10), workflow: smokeWorkflow('interview-1', ['投递', '网测', '初筛', '一面', '二面', '终面', '背调', 'Offer'], 3, { 0: todayAt(9, 10), 1: todayAt(11, 0), 2: todayAt(13, 0), 3: todayAt(15, 0) }), revision: 1 },
    { id: 'job-offer-1', company: '水安全中心', role: '技术研究员', lifecycleStatus: 'closed', status: 'closed', companyType: '事业单位', city: '无锡', location: '无锡', deadline: null, priority: 'medium', annualSalaryWan: 41.1, sourceUrl: null, contact: '邮件', appliedAt: todayAt(9, 20), nextFollowUpAt: null, nextActionAt: null, notes: '评估入职时间', createdAt: todayAt(8, 25), updatedAt: todayAt(9, 20), workflow: smokeWorkflow('offer-1', ['投递', '测评', '一面', '二面', '三面', '终面', 'Offer'], 6, { 0: todayAt(9, 20), 1: todayAt(10, 20), 2: todayAt(11, 20), 3: todayAt(13, 20), 4: todayAt(14, 20), 5: todayAt(15, 20), 6: todayAt(17, 20) }), revision: 1 }
  ]
};
let smokeUpdateState = {
  status: 'idle',
  currentVersion: '1.3.0',
  latestVersion: null,
  releaseDate: null,
  percent: null,
  portable: false,
  message: '仅在你点击检查时连接 GitHub Releases。'
};

contextBridge.exposeInMainWorld('paperTrail', {
  getWorkspace: async () => smokeWorkspace,
  getTodayWidgetData: async () => smokeWorkspace,
  onTodayWidgetChanged: () => {},
  completeTodo: async (id) => {
    let updated = null;
    smokeWorkspace.todos = (smokeWorkspace.todos || []).map((todo) => {
      if (todo.id !== id) return todo;
      updated = { ...todo, status: 'completed', completedAt: new Date().toISOString() };
      return updated;
    });
    return updated;
  },
  parseSchedule: async (input) => {
    const text = String(input || '');
    if (text.includes('，')) {
      const schedules = [
        { valid: true, title: '去采样', startAt: new Date(now + 86_400_000).toISOString(), endAt: new Date(now + 90_000_000).toISOString(), priority: 'low', deadline: false, matches: [] },
        { valid: true, title: '去洗澡', startAt: new Date(now + 118_800_000).toISOString(), endAt: new Date(now + 122_400_000).toISOString(), priority: 'low', deadline: false, matches: [] }
      ];
      const matches = ['明天', '上午八点', '下午五点'].map((token) => ({ start: text.indexOf(token), end: text.indexOf(token) + token.length, text: token })).filter((match) => match.start >= 0);
      return { ...schedules[0], title: '去采样；去洗澡', schedules, matches };
    }
    const matches = ['明天', '下午 3 点到 5 点', '#1'].map((token) => ({ start: text.indexOf(token), end: text.indexOf(token) + token.length, text: token })).filter((match) => match.start >= 0);
    const parsed = { valid: true, title: '组会', startAt: new Date(now + 86_400_000).toISOString(), endAt: new Date(now + 90_000_000).toISOString(), priority: /#1/.test(text) ? 'high' : 'low', deadline: false, matches };
    return { ...parsed, schedules: [parsed] };
  },
  saveSchedule: async (input) => {
    document.body.dataset.savedScheduleCount = String(Number(document.body.dataset.savedScheduleCount || 0) + 1);
    document.body.dataset.lastSavedSchedule = JSON.stringify(input);
    return input;
  },
  createScheduledTodo: async (input) => {
    const todo = { ...input.todo, id: `todo-scheduled-${Date.now()}`, status: 'open', updatedAt: new Date().toISOString() };
    const schedule = { ...input.schedule, id: `schedule-linked-${Date.now()}`, sourceRef: { type: 'todo', id: todo.id } };
    smokeWorkspace.todos = [todo, ...(smokeWorkspace.todos || [])];
    smokeWorkspace.schedules = [schedule, ...(smokeWorkspace.schedules || [])];
    document.body.dataset.createdScheduledTodo = JSON.stringify({ todo, schedule });
    return { todo, schedule };
  },
  deleteSchedule: async () => true,
  completeSchedule: async () => true,
  showScheduleWidget: async () => ({ attached: true }),
  closeScheduleWidget: async () => { document.body.dataset.closeRequested = 'true'; return true; },
  openScheduleWidgetMain: async () => { document.body.dataset.openMainRequested = 'true'; return true; },
  saveNote: async (input) => {
    const existing = (smokeWorkspace.notes || []).find((item) => item.id === input?.id);
    const saved = {
      ...existing,
      ...input,
      id: existing?.id || `note-smoke-${Date.now()}`,
      title: input?.title || existing?.title || '未命名笔记',
      content: input?.content || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: Number(existing?.revision || 0) + 1
    };
    smokeWorkspace.notes = [saved, ...smokeWorkspace.notes.filter((item) => item.id !== saved.id)];
    return saved;
  },
  saveTodo: async (input) => {
    const todo = { ...input, id: input?.id || 'todo-new', status: input?.status || 'open', updatedAt: new Date().toISOString() };
    smokeWorkspace.todos = [todo, ...(smokeWorkspace.todos || []).filter((item) => item.id !== todo.id)];
    return todo;
  },
  parseTodo: async (input) => ({ valid: true, title: String(input || '').replace(/明天.*?点半?/u, '').trim(), dueAt: null, reminderMode: 'none', priority: 'medium' }),
  deleteTodo: async (id) => { smokeWorkspace.todos = smokeWorkspace.todos.filter((todo) => todo.id !== id); return true; },
  reopenTodo: async (id) => {
    let updated = null;
    smokeWorkspace.todos = (smokeWorkspace.todos || []).map((todo) => {
      if (todo.id !== id) return todo;
      updated = { ...todo, status: 'open', completedAt: null };
      return updated;
    });
    return updated;
  },
  cancelTodo: async () => true,
  snoozeTodo: async () => true,
  scheduleTodo: async () => true,
  convertTodoToSchedule: async () => true,
  getLinkedSchedules: async () => [],
  addNoteAttachment: async () => ({ id: 'smoke-wide-image', storedName: 'smoke-wide.png', originalName: 'wide-workbench-image.png', mimeType: 'image/png', size: 2048, createdAt: new Date().toISOString() }),
  getNoteAttachment: async () => ({ mimeType: 'image/svg+xml', dataUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1600" height="240" viewBox="0 0 1600 240"%3E%3Crect width="1600" height="240" fill="%235874c8"/%3E%3C/svg%3E' }),
  deleteNoteAttachment: async () => true,
  deleteNoteIfEmpty: async (id) => {
    const note = (smokeWorkspace.notes || []).find((item) => item.id === id);
    const empty = Boolean(note) && !String(note.content || '').replace(/<[^>]*>/g, '').trim() && !(note.attachments || []).length;
    if (empty) smokeWorkspace.notes = smokeWorkspace.notes.filter((item) => item.id !== id);
    return empty;
  },
  getStickyNote: async (id) => (smokeWorkspace.notes || []).find((note) => note.id === id) || null,
  closeSticky: async () => { document.body.dataset.closeRequested = 'true'; return true; },
  setStickyAlwaysOnTop: async () => true,
  deleteNote: async () => { document.body.dataset.deletedNoteCount = String(Number(document.body.dataset.deletedNoteCount || 0) + 1); return true; },
  openStickyNote: async () => true,
  createStickyNote: async () => ({ id: 'new-sticky-note', title: '便笺', content: '' }),
  saveJobApplication: async (input) => {
    const existing = (smokeWorkspace.jobApplications || []).find((item) => item.id === input?.id);
    const saved = {
      ...existing,
      ...input,
      id: existing?.id || `job-smoke-${Date.now()}`,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: Number(existing?.revision || 0) + 1
    };
    smokeWorkspace.jobApplications = [saved, ...smokeWorkspace.jobApplications.filter((item) => item.id !== saved.id)];
    return saved;
  },
  deleteJobApplication: async (id) => { smokeWorkspace.jobApplications = smokeWorkspace.jobApplications.filter((item) => item.id !== id); return true; },
  importJobApplications: async () => ({ canceled: true }),
  exportJobApplications: async () => ({ canceled: true }),
  exportJobApplicationImages: async () => ({ canceled: true }),
  saveMetadataFields: async (fields) => fields,
  clockAttendance: async () => smokeWorkspace.attendance[0],
  saveAttendance: async (input) => input,
  deleteAttendance: async () => true,
  getFocusState: async () => smokeWorkspace.focusSessions,
  startFocus: async (input) => {
    smokeWorkspace.focusSessions = [{ id: 'focus-active', startedAt: new Date().toISOString(), endedAt: null, plannedMinutes: input.plannedMinutes, status: 'active', appUsage: {}, suppressNotifications: input.suppressNotifications, notificationsSuppressed: input.suppressNotifications, notificationRestore: null, notificationRestoredAt: null, notificationError: null }, ...smokeWorkspace.focusSessions];
    return smokeWorkspace.focusSessions;
  },
  stopFocus: async () => {
    smokeWorkspace.focusSessions = smokeWorkspace.focusSessions.map((session) => session.status === 'active' ? { ...session, status: 'stopped', endedAt: new Date().toISOString() } : session);
    return smokeWorkspace.focusSessions;
  },
  openExternal: async () => true,
  showCapture: async () => true,
  hideCapture: async () => { document.body.dataset.hideRequested = 'true'; return true; },
  setCaptureContentState: () => {},
  submitCapture: async (input) => { document.body.dataset.captureSubmitted = JSON.stringify(input); return input; },
  listPapers: async () => smokePapers,
  addPaper: async (payload) => payload?.mode === 'author' ? productionPaper : mockPaper,
  refreshPaper: async () => mockPaper,
  refreshAll: async () => [{ id: mockPaper.id, ok: true, paper: mockPaper }],
  markPaperRead: async () => mockPaper,
  markAllRead: async () => ({ changed: 1 }),
  archivePaper: async () => mockPaper,
  restorePaper: async () => archivedPaper,
  linkPaperJourney: async () => [mockPaper, productionPaper, archivedPaper],
  unlinkPaperJourney: async () => [mockPaper, productionPaper, archivedPaper],
  exportPaper: async () => ({ canceled: false, filePath: 'C:\\Users\\Demo\\Documents\\timeline.md' }),
  removePaper: async () => true,
  openTrackingPage: async () => true,
  getSettings: async () => ({
    autoRefresh: true,
    refreshOnStartup: true,
    refreshMinutes: 360,
    notifications: true,
    closeToTray: true,
    startAtLogin: false,
    autoCheckUpdates: true,
    quickCaptureShortcut: 'CommandOrControl+Shift+Space',
    stickyNoteShortcut: 'CommandOrControl+Alt+N',
    appVersion: '1.0.0',
    dataDirectory: 'C:\\Users\\Demo\\Documents\\Yanji Data',
    backupCount: 1,
    backupFiles: ['C:\\Users\\Demo\\Documents\\Yanji Old\\papertrail-data.json'],
    isDefaultDataDirectory: false
  }),
  updateSettings: async (settings) => settings,
  chooseDataDirectory: async () => ({
    canceled: false,
    settings: {
      autoRefresh: true,
      refreshOnStartup: true,
      refreshMinutes: 360,
      notifications: true,
      closeToTray: true,
      startAtLogin: false,
      appVersion: '1.0.0',
      dataDirectory: 'D:\\Research\\Yanji',
      backupCount: 1,
      backupFiles: ['C:\\Users\\Demo\\Documents\\Yanji Data\\papertrail-data.json'],
      isDefaultDataDirectory: false
    }
  }),
  deleteDataBackups: async () => ({
    canceled: false,
    deletedCount: 1,
    settings: {
      autoRefresh: true,
      refreshOnStartup: true,
      refreshMinutes: 360,
      notifications: true,
      closeToTray: true,
      startAtLogin: false,
      appVersion: '1.0.0',
      dataDirectory: 'D:\\Research\\Yanji',
      backupCount: 0,
      backupFiles: [],
      isDefaultDataDirectory: false
    }
  }),
  getUpdateState: async () => smokeUpdateState,
  checkForUpdates: async () => {
    smokeUpdateState = {
      ...smokeUpdateState,
      status: 'available',
      latestVersion: '1.3.1',
      releaseDate: '2026-08-17T00:00:00.000Z',
      message: '发现新版本 1.3.1，可立即下载。'
    };
    return smokeUpdateState;
  },
  downloadUpdate: async () => {
    smokeUpdateState = {
      ...smokeUpdateState,
      status: 'downloaded',
      percent: 100,
      message: '更新已安全下载，点击后将重启并安装。'
    };
    return smokeUpdateState;
  },
  installUpdate: async () => true,
  openUpdateReleasePage: async () => true,
  copyText: async () => true,
  setModalWindowState: async () => true,
  onPapersChanged: () => () => {},
  onRefreshState: () => () => {},
  onUpdateState: () => () => {}
  ,onSettingsChanged: () => () => {}
  ,onWorkspaceChanged: () => () => {}
  ,onWorkspaceNavigate: () => () => {}
  ,onFocusChanged: () => () => {}
  ,onCaptureFocus: () => () => {}
});

'use strict';

const { contextBridge } = require('electron');

const now = Date.now();
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

contextBridge.exposeInMainWorld('paperTrail', {
  listPapers: async () => [mockPaper, productionPaper, archivedPaper],
  addPaper: async (payload) => payload?.mode === 'author' ? productionPaper : mockPaper,
  refreshPaper: async () => mockPaper,
  refreshAll: async () => [{ id: mockPaper.id, ok: true, paper: mockPaper }],
  markPaperRead: async () => mockPaper,
  markAllRead: async () => ({ changed: 1 }),
  archivePaper: async () => mockPaper,
  restorePaper: async () => archivedPaper,
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
    appVersion: '0.5.0',
    dataDirectory: 'C:\\Users\\Demo\\Documents\\PaperTrail Data',
    backupCount: 1,
    backupFiles: ['C:\\Users\\Demo\\Documents\\PaperTrail Old\\papertrail-data.json'],
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
      appVersion: '0.5.0',
      dataDirectory: 'D:\\Research\\PaperTrail',
      backupCount: 1,
      backupFiles: ['C:\\Users\\Demo\\Documents\\PaperTrail Data\\papertrail-data.json'],
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
      appVersion: '0.5.0',
      dataDirectory: 'D:\\Research\\PaperTrail',
      backupCount: 0,
      backupFiles: [],
      isDefaultDataDirectory: false
    }
  }),
  copyText: async () => true,
  setModalWindowState: async () => true,
  onPapersChanged: () => () => {},
  onRefreshState: () => () => {}
});

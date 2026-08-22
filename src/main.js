'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  safeStorage,
  screen,
  shell,
  Tray
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { JsonStore } = require('./store');
const {
  parseTrackingInput,
  normalizeTrackerPayload,
  snapshotFingerprint,
  describeChanges,
  maskTrackingUrl,
  getStageStartedAt,
  mergeObservedReviewEvents
} = require('./tracker-core');
const {
  buildProductionTrackingUrl,
  validateProductionTrackingUrl,
  extractProductionSnapshot
} = require('./production-core');
const { importantChanges } = require('./notification-core');
const {
  normalizeMetadataField,
  parseNaturalLanguageSchedule,
  saveAttendance,
  saveFocusSession,
  saveNote,
  saveSchedule
} = require('./workbench-core');
const {
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
  sortPapers,
  buildPaperExport,
  paperTaskSummary,
  updatePaperDetails,
  saveTask,
  completeTask,
  deleteTask,
  tasksNeedingNotification,
  markTaskReminded,
  saveRevisionRound,
  deleteRevisionRound
} = require('./paper-core');
const {
  createInitialUpdateState,
  nextUpdateState
} = require('./update-core');

const APP_NAME = '研迹 · 科研工作台';
const MAX_HISTORY = 100;
const FETCH_TIMEOUT_MS = 20_000;
const DATA_FILE_NAME = 'papertrail-data.json';
const STORAGE_POINTER_NAME = 'papertrail-storage.json';
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RELEASES_URL = 'https://github.com/JH-Ruan-hhu/Papertrail/releases/latest';
const DEFAULT_QUICK_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+Space';
const DEFAULT_STICKY_NOTE_SHORTCUT = 'CommandOrControl+Alt+N';
const TITLE_BAR_NORMAL = Object.freeze({ color: '#eaf5fb', symbolColor: '#35566b', height: 38 });
const TITLE_BAR_MODAL = Object.freeze({ color: '#9dabb6', symbolColor: '#f5fbfe', height: 38 });

let mainWindow;
let tray;
let store;
let scheduler;
let isQuitting = false;
let coldStartRefreshStarted = false;
let updateState;
let updaterInitialized = false;
let quickCaptureWindow;
let scheduleWidgetWindow;
let quickCaptureHasContent = false;
let focusTimer;
let focusSampler;
let focusRecoveryProcess;
let focusSamplerBuffer = '';
let focusUsageLive = {};
let focusLastSampleAt = 0;
let focusLastPersistAt = 0;
let attendanceUsageLive = {};
let attendanceLastPersistAt = 0;
let lastBackupCleanupAt = 0;
const stickyWindows = new Map();
const deadlineWindows = new Map();
const refreshingIds = new Set();

function encryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows 安全存储暂不可用，无法安全保存投稿链接。');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows 安全存储暂不可用，无法读取投稿链接。');
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

function paperKey(uuid) {
  return crypto.createHash('sha256').update(uuid).digest('hex');
}

function compactSnapshot(snapshot, observedAt = new Date().toISOString(), previousSnapshot = null) {
  const events = mergeObservedReviewEvents(previousSnapshot?.events, snapshot.events, observedAt);
  return {
    kind: snapshot.kind || 'review',
    title: snapshot.title,
    journal: snapshot.journal,
    status: snapshot.status,
    latestRevision: snapshot.latestRevision,
    submissionDate: snapshot.submissionDate,
    sourceUpdatedAt: snapshot.sourceUpdatedAt,
    counts: snapshot.counts,
    articleReference: snapshot.articleReference || null,
    correspondingAuthor: snapshot.correspondingAuthor || null,
    firstAuthor: snapshot.firstAuthor || null,
    acceptedDate: snapshot.acceptedDate || null,
    doi: snapshot.doi || null,
    statusComment: snapshot.statusComment || null,
    productionEvents: Array.isArray(snapshot.productionEvents) ? snapshot.productionEvents.slice(0, 100) : [],
    events: events.slice(-500)
  };
}

function serializePaper(paper) {
  const observedStageStartedAt = getStageStartedAt(
    paper.history,
    paper.snapshot.status,
    paper.addedAt
  );
  const action = actionState(paper);
  const urgentTask = paperTaskSummary(paper);
  return {
    id: paper.id,
    source: paper.source,
    kind: paper.snapshot.kind || 'review',
    title: paper.snapshot.title,
    journal: paper.snapshot.journal,
    status: { ...paper.snapshot.status, label: action.label, tone: action.tone },
    sourceStatus: paper.snapshot.status,
    actionCategory: action.category,
    needsAction: action.needsAction,
    canArchive: action.canArchive,
    latestRevision: paper.snapshot.latestRevision,
    submissionDate: paper.snapshot.submissionDate,
    sourceUpdatedAt: paper.snapshot.sourceUpdatedAt,
    counts: paper.snapshot.counts,
    articleReference: paper.snapshot.articleReference || null,
    correspondingAuthor: paper.snapshot.correspondingAuthor || null,
    firstAuthor: paper.snapshot.firstAuthor || null,
    acceptedDate: paper.snapshot.acceptedDate || null,
    doi: paper.snapshot.doi || null,
    statusComment: paper.snapshot.statusComment || null,
    productionEvents: paper.snapshot.productionEvents || [],
    reviewEvents: paper.snapshot.events || [],
    details: paper.details || {},
    tasks: paper.tasks || [],
    revisionRounds: paper.revisionRounds || [],
    urgentTask,
    addedAt: paper.addedAt,
    archivedAt: paper.archivedAt || null,
    journeyId: paper.journeyId || null,
    lastAttemptAt: paper.lastAttemptAt || null,
    lastSuccessfulAt: paper.lastSuccessfulAt || null,
    failureStreak: Number(paper.failureStreak) || 0,
    nextRetryAt: paper.nextRetryAt || null,
    observedStageStartedAt,
    lastChangedAt: lastChangedAt(paper),
    maskedTrackingUrl: paper.maskedTrackingUrl,
    lastError: paper.lastError || null,
    history: Array.isArray(paper.history) ? paper.history : [],
    importantUpdates: Array.isArray(paper.importantUpdates) ? paper.importantUpdates : [],
    unreadCount: unreadCount(paper)
  };
}

function listSerializedPapers() {
  return sortPapers(store.listPapers().map(serializePaper));
}

function storagePointerPath() {
  return path.join(app.getPath('userData'), STORAGE_POINTER_NAME);
}

function defaultDataFilePath() {
  return path.join(app.getPath('userData'), DATA_FILE_NAME);
}

function readStoragePointer() {
  try {
    const pointer = JSON.parse(fs.readFileSync(storagePointerPath(), 'utf8'));
    return {
      dataDirectory: String(pointer?.dataDirectory || ''),
      backupFiles: Array.isArray(pointer?.backupFiles) ? pointer.backupFiles.map(String) : [],
      backupCreatedAt: pointer?.backupCreatedAt && typeof pointer.backupCreatedAt === 'object'
        ? pointer.backupCreatedAt
        : {}
    };
  } catch {
    return { dataDirectory: '', backupFiles: [], backupCreatedAt: {} };
  }
}

function configuredDataFilePath() {
  const pointer = readStoragePointer();
  const candidate = path.join(pointer.dataDirectory, DATA_FILE_NAME);
  if (path.isAbsolute(pointer.dataDirectory) && fs.existsSync(candidate)) return candidate;
  return defaultDataFilePath();
}

function normalizeBackupFiles(candidates, currentFile = store?.filePath) {
  const currentPath = currentFile ? path.resolve(currentFile) : '';
  return [...new Set((candidates || []).map((candidate) => {
    try { return path.resolve(String(candidate)); } catch { return ''; }
  }))].filter((candidate) => {
    try {
      return candidate &&
        path.isAbsolute(candidate) &&
        path.basename(candidate).toLowerCase() === DATA_FILE_NAME &&
        candidate !== currentPath &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function knownBackupFiles() {
  const pointer = readStoragePointer();
  return normalizeBackupFiles([...pointer.backupFiles, defaultDataFilePath()]);
}

function writeStoragePointer(
  directory,
  backupFiles = knownBackupFiles(),
  currentFile = path.join(directory, DATA_FILE_NAME),
  backupCreatedAt = readStoragePointer().backupCreatedAt
) {
  const pointerPath = storagePointerPath();
  const temporaryPath = `${pointerPath}.tmp`;
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  const normalizedBackups = normalizeBackupFiles(backupFiles, currentFile);
  const timestamps = {};
  for (const backupFile of normalizedBackups) {
    timestamps[backupFile] = isoBackupDate(backupCreatedAt?.[backupFile]) || new Date().toISOString();
  }
  fs.writeFileSync(temporaryPath, JSON.stringify({
    dataDirectory: directory,
    backupFiles: normalizedBackups,
    backupCreatedAt: timestamps
  }, null, 2), 'utf8');
  fs.renameSync(temporaryPath, pointerPath);
}

function isoBackupDate(value) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function cleanupExpiredBackups(now = new Date()) {
  lastBackupCleanupAt = now.getTime();
  const pointer = readStoragePointer();
  const backups = knownBackupFiles();
  const retained = [];
  const dates = {};
  let deletedCount = 0;
  for (const backupFile of backups) {
    const createdAt = isoBackupDate(pointer.backupCreatedAt?.[backupFile]) || now.toISOString();
    if (now.getTime() - Date.parse(createdAt) < BACKUP_RETENTION_MS) {
      retained.push(backupFile);
      dates[backupFile] = createdAt;
      continue;
    }
    try {
      if (path.resolve(backupFile) === path.resolve(store.filePath)) continue;
      if (path.basename(backupFile).toLowerCase() !== DATA_FILE_NAME) continue;
      fs.unlinkSync(backupFile);
      deletedCount += 1;
    } catch {
      retained.push(backupFile);
      dates[backupFile] = createdAt;
    }
  }
  writeStoragePointer(path.dirname(store.filePath), retained, store.filePath, dates);
  return deletedCount;
}

function settingsForRenderer() {
  const dataDirectory = path.dirname(store.filePath);
  const backupFiles = knownBackupFiles();
  const pointer = readStoragePointer();
  return {
    ...store.getSettings(),
    appVersion: app.getVersion(),
    dataDirectory,
    backupCount: backupFiles.length,
    backupFiles,
    backupExpiresAt: backupFiles.map((file) => ({
      file,
      expiresAt: new Date(Date.parse(isoBackupDate(pointer.backupCreatedAt?.[file]) || new Date().toISOString()) + BACKUP_RETENTION_MS).toISOString()
    })),
    isDefaultDataDirectory: path.resolve(dataDirectory) === path.resolve(path.dirname(defaultDataFilePath()))
  };
}

function setModalTitleBar(active) {
  if (
    process.platform === 'win32' &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    typeof mainWindow.setTitleBarOverlay === 'function'
  ) {
    mainWindow.setTitleBarOverlay(active ? TITLE_BAR_MODAL : TITLE_BAR_NORMAL);
  }
}

function isPortableBuild() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR);
}

function updateStateForRenderer() {
  if (!updateState) {
    updateState = createInitialUpdateState({
      currentVersion: app.getVersion(),
      packaged: app.isPackaged,
      portable: isPortableBuild()
    });
  }
  return { ...updateState };
}

function broadcastUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updates:state', updateStateForRenderer());
  }
}

function setUpdateState(event, payload) {
  updateState = nextUpdateState(updateStateForRenderer(), event, payload);
  broadcastUpdateState();
  return updateStateForRenderer();
}

function setupAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;
  updateState = createInitialUpdateState({
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortableBuild()
  });
  if (updateState.status === 'unavailable') return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => setUpdateState('checking'));
  autoUpdater.on('update-available', (info) => setUpdateState('available', info));
  autoUpdater.on('update-not-available', (info) => setUpdateState('not-available', info));
  autoUpdater.on('download-progress', (progress) => setUpdateState('download-progress', progress));
  autoUpdater.on('update-downloaded', (info) => setUpdateState('downloaded', info));
  autoUpdater.on('error', (error) => setUpdateState('error', { error }));
}

async function checkForAppUpdate() {
  const current = updateStateForRenderer();
  if (current.status === 'unavailable') return current;
  if (current.status === 'checking' || current.status === 'downloading') return current;
  try {
    const result = await autoUpdater.checkForUpdates();
    if (updateState.status === 'checking' && result?.updateInfo) {
      setUpdateState(result.isUpdateAvailable ? 'available' : 'not-available', result.updateInfo);
    }
    return updateStateForRenderer();
  } catch (error) {
    if (updateState.status !== 'error') setUpdateState('error', { error });
    throw new Error(updateState.message);
  }
}

async function downloadAppUpdate() {
  const current = updateStateForRenderer();
  if (current.status !== 'available') throw new Error('请先检查并确认存在新版本。');
  try {
    setUpdateState('download-start');
    await autoUpdater.downloadUpdate();
    return updateStateForRenderer();
  } catch (error) {
    if (updateState.status !== 'error') setUpdateState('error', { error });
    throw new Error(updateState.message);
  }
}

function installDownloadedUpdate() {
  if (updateStateForRenderer().status !== 'downloaded') {
    throw new Error('更新尚未下载完成。');
  }
  isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
}

async function openUpdateReleasePage() {
  await shell.openExternal(RELEASES_URL);
  return true;
}

async function chooseDataDirectory(request = {}) {
  let selectedDirectory;
  if (request?.confirmedExisting && request?.selectedDirectory) {
    selectedDirectory = path.resolve(String(request.selectedDirectory));
  } else {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择研迹数据存储文件夹',
      defaultPath: path.dirname(store.filePath),
      buttonLabel: '使用此文件夹',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true, settings: settingsForRenderer() };
    }
    selectedDirectory = path.resolve(result.filePaths[0]);
  }
  const targetFile = path.join(selectedDirectory, DATA_FILE_NAME);
  if (path.resolve(targetFile) === path.resolve(store.filePath)) {
    return { canceled: false, settings: settingsForRenderer() };
  }

  const previousDataFile = path.resolve(store.filePath);
  let nextStore;
  if (fs.existsSync(targetFile) && !request?.confirmedExisting) {
    return {
      canceled: false,
      requiresConfirmation: true,
      selectedDirectory,
      settings: settingsForRenderer()
    };
  }
  if (fs.existsSync(targetFile)) {
    nextStore = new JsonStore(targetFile);
    nextStore.load();
  } else {
    store.copyTo(targetFile);
    nextStore = new JsonStore(targetFile);
    nextStore.load();
  }

  const nextBackups = normalizeBackupFiles([...knownBackupFiles(), previousDataFile], targetFile);
  writeStoragePointer(selectedDirectory, nextBackups, targetFile);
  store = nextStore;
  updateLoginItemSetting(store.getSettings().startAtLogin);
  broadcastPapers();
  return { canceled: false, settings: settingsForRenderer() };
}

async function deleteDataBackups(confirmed = false) {
  const backupFiles = knownBackupFiles();
  if (!backupFiles.length) {
    return { canceled: false, deletedCount: 0, settings: settingsForRenderer() };
  }
  if (!confirmed) {
    return {
      canceled: false,
      requiresConfirmation: true,
      backupCount: backupFiles.length,
      settings: settingsForRenderer()
    };
  }

  const failed = [];
  let deletedCount = 0;
  for (const backupFile of backupFiles) {
    try {
      if (path.resolve(backupFile) === path.resolve(store.filePath)) continue;
      fs.unlinkSync(backupFile);
      deletedCount += 1;
    } catch {
      failed.push(backupFile);
    }
  }
  writeStoragePointer(path.dirname(store.filePath), failed);
  if (failed.length) throw new Error(`已删除 ${deletedCount} 份备份，另有 ${failed.length} 份无法删除。`);
  return { canceled: false, deletedCount, settings: settingsForRenderer() };
}

function broadcastPapers() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('papers:changed', listSerializedPapers());
  }
}

function workspaceForRenderer() {
  const activeAttendance = activeAttendanceRecord();
  return {
    schedules: [...store.listSchedules()].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    notes: [...store.listNotes()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    metadataFields: store.listMetadataFields(),
    attendance: [...store.listAttendance()]
      .map((record) => record.id === activeAttendance?.id ? { ...record, appUsage: { ...attendanceUsageLive } } : record)
      .sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.clockInAt) - Date.parse(a.clockInAt)),
    focusSessions: focusSessionsForRenderer()
  };
}

function broadcastWorkspace() {
  const workspace = workspaceForRenderer();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:changed', workspace);
  }
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.webContents.send('workspace:changed', workspace);
  }
  for (const window of stickyWindows.values()) {
    if (!window.isDestroyed()) window.webContents.send('workspace:changed', workspace);
  }
  if (scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) {
    scheduleWidgetWindow.webContents.send('workspace:changed', workspace);
  }
  return workspace;
}

function saveWorkspaceSchedule(input) {
  const schedules = saveSchedule(
    store.listSchedules(),
    input,
    new Date().toISOString(),
    () => crypto.randomUUID()
  );
  store.setSchedules(schedules);
  broadcastWorkspace();
  return schedules.find((item) => item.id === String(input?.id || '')) || schedules[0];
}

function deleteWorkspaceSchedule(id) {
  const schedules = store.listSchedules();
  if (!schedules.some((item) => item.id === id)) throw new Error('找不到这条日程。');
  store.setSchedules(schedules.filter((item) => item.id !== id));
  broadcastWorkspace();
  return true;
}

function setWorkspaceScheduleCompleted(id, completed) {
  const schedule = store.listSchedules().find((item) => item.id === id);
  if (!schedule) throw new Error('找不到这条日程。');
  return saveWorkspaceSchedule({
    ...schedule,
    completedAt: completed ? new Date().toISOString() : null
  });
}

function saveWorkspaceNote(input) {
  const notes = saveNote(
    store.listNotes(),
    input,
    new Date().toISOString(),
    () => crypto.randomUUID()
  );
  store.setNotes(notes);
  broadcastWorkspace();
  return notes.find((item) => item.id === String(input?.id || '')) || notes[0];
}

function deleteWorkspaceNote(id) {
  const notes = store.listNotes();
  if (!notes.some((item) => item.id === id)) throw new Error('找不到这条笔记。');
  store.setNotes(notes.filter((item) => item.id !== id));
  const sticky = stickyWindows.get(id);
  if (sticky && !sticky.isDestroyed()) sticky.close();
  stickyWindows.delete(id);
  broadcastWorkspace();
  return true;
}

function saveMetadataFields(input) {
  if (!Array.isArray(input)) throw new Error('元数据字段格式不正确。');
  const fields = input.slice(0, 50).map((field, index) => normalizeMetadataField({
    ...field,
    id: field?.id || crypto.randomUUID()
  }, index));
  store.setMetadataFields(fields);
  broadcastWorkspace();
  return fields;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function saveWorkspaceAttendance(input) {
  const before = store.listAttendance();
  const existing = input?.id ? before.find((item) => item.id === String(input.id)) : null;
  const activeOther = before.find((item) => !item.clockOutAt && item.id !== String(input?.id || ''));
  if (!input?.clockOutAt && activeOther) throw new Error('已有一段工作正在计时，请先下班打卡。');
  const closingActive = Boolean(existing && !existing.clockOutAt && input?.clockOutAt);
  if (closingActive) persistAttendanceUsage();
  const prepared = closingActive ? { ...input, appUsage: { ...attendanceUsageLive } } : input;
  let createdId = null;
  const attendance = saveAttendance(
    before,
    prepared,
    new Date().toISOString(),
    () => { createdId = crypto.randomUUID(); return createdId; }
  );
  store.setAttendance(attendance);
  const saved = attendance.find((item) => item.id === String(input?.id || ''))
    || attendance.find((item) => item.id === createdId)
    || attendance[0];
  if (!saved.clockOutAt) {
    attendanceUsageLive = { ...(saved.appUsage || {}) };
    attendanceLastPersistAt = Date.now();
    startFocusSampler();
  } else if (closingActive) {
    attendanceUsageLive = {};
    stopUsageSamplerIfIdle();
  }
  broadcastWorkspace();
  return saved;
}

function clockWorkspaceAttendance(action) {
  const now = new Date();
  const records = store.listAttendance();
  const openRecord = records.find((item) => !item.clockOutAt);
  if (action === 'in') {
    if (openRecord) throw new Error('当前已有一段工作正在计时，请先下班打卡。');
    const record = saveWorkspaceAttendance({ date: localDateKey(now), clockInAt: now.toISOString(), clockOutAt: null, appUsage: {} });
    attendanceUsageLive = {};
    attendanceLastPersistAt = Date.now();
    startFocusSampler();
    return record;
  }
  if (action === 'out') {
    if (!openRecord) throw new Error('当前没有进行中的上班记录。');
    const record = saveWorkspaceAttendance({ ...openRecord, appUsage: attendanceUsageLive, clockOutAt: now.toISOString() });
    return record;
  }
  throw new Error('不支持的打卡操作。');
}

function deleteWorkspaceAttendance(id) {
  const attendance = store.listAttendance();
  const target = attendance.find((item) => item.id === id);
  if (!target) throw new Error('找不到这条打卡记录。');
  store.setAttendance(attendance.filter((item) => item.id !== id));
  if (!target.clockOutAt) {
    attendanceUsageLive = {};
    stopUsageSamplerIfIdle();
  }
  broadcastWorkspace();
  return true;
}

const TOAST_POLICY_KEY = 'HKCU\\Software\\Policies\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';
const TOAST_POLICY_VALUE = 'NoToastApplicationNotification';

function activeAttendanceRecord() {
  return store.listAttendance().find((record) => !record.clockOutAt) || null;
}

function activeFocusSession() {
  return store.listFocusSessions().find((session) => session.status === 'active' && !session.endedAt) || null;
}

function focusSessionsForRenderer() {
  const active = activeFocusSession();
  return [...store.listFocusSessions()]
    .map((session) => session.id === active?.id ? { ...session, appUsage: { ...focusUsageLive } } : session)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function broadcastFocus() {
  const focusSessions = focusSessionsForRenderer();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('focus:changed', focusSessions);
  return focusSessions;
}

function runWindowsCommand(file, args) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ code: -1, stdout, stderr, error }));
    child.on('close', (code) => resolve({ code: Number(code), stdout, stderr }));
  });
}

function parseToastPolicyOutput(output) {
  const match = String(output || '').match(/NoToastApplicationNotification\s+REG_DWORD\s+0x([0-9a-f]+)/i);
  return match ? { existed: true, value: Number.parseInt(match[1], 16) } : { existed: false, value: null };
}

async function readToastPolicy() {
  const result = await runWindowsCommand('reg.exe', ['query', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE]);
  return result.code === 0 ? parseToastPolicyOutput(result.stdout) : { existed: false, value: null };
}

async function suppressWindowsToasts() {
  if (process.platform !== 'win32') return { supported: false, restore: null };
  const previous = await readToastPolicy();
  if (previous.existed && previous.value === 1) {
    return { supported: true, restore: { ...previous, changed: false } };
  }
  const result = await runWindowsCommand('reg.exe', ['add', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE, '/t', 'REG_DWORD', '/d', '1', '/f']);
  if (result.code !== 0) throw new Error('Windows 勿扰设置未能启用，请检查当前账户策略权限。');
  return { supported: true, restore: { ...previous, changed: true } };
}

async function restoreWindowsToasts(session) {
  const restore = session?.notificationRestore;
  if (process.platform !== 'win32' || !restore?.changed || session.notificationRestoredAt) return;
  const current = await readToastPolicy();
  if (!current.existed || current.value !== 1) return;
  const args = restore.existed
    ? ['add', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE, '/t', 'REG_DWORD', '/d', String(restore.value ?? 0), '/f']
    : ['delete', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE, '/f'];
  const result = await runWindowsCommand('reg.exe', args);
  if (result.code !== 0) throw new Error('Windows 通知设置未能自动恢复，请在“系统 > 通知”中检查。');
}

function restoreWindowsToastsSync(session) {
  const restore = session?.notificationRestore;
  if (process.platform !== 'win32' || !restore?.changed || session.notificationRestoredAt) return true;
  const query = spawnSync('reg.exe', ['query', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE], { windowsHide: true, encoding: 'utf8' });
  const current = query.status === 0 ? parseToastPolicyOutput(query.stdout) : { existed: false, value: null };
  if (!current.existed || current.value !== 1) return true;
  const args = restore.existed
    ? ['add', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE, '/t', 'REG_DWORD', '/d', String(restore.value ?? 0), '/f']
    : ['delete', TOAST_POLICY_KEY, '/v', TOAST_POLICY_VALUE, '/f'];
  return spawnSync('reg.exe', args, { windowsHide: true }).status === 0;
}

function startFocusRecovery(session) {
  const restore = session?.notificationRestore;
  if (process.platform !== 'win32' || !restore?.changed) return;
  const remainingSeconds = Math.max(1, Math.ceil((Date.parse(session.startedAt) + session.plannedMinutes * 60_000 - Date.now()) / 1000));
  const restoreCommand = restore.existed
    ? `Set-ItemProperty -LiteralPath '${TOAST_POLICY_KEY.replace('HKCU\\', 'HKCU:\\')}' -Name '${TOAST_POLICY_VALUE}' -Type DWord -Value ${Number(restore.value ?? 0)}`
    : `Remove-ItemProperty -LiteralPath '${TOAST_POLICY_KEY.replace('HKCU\\', 'HKCU:\\')}' -Name '${TOAST_POLICY_VALUE}' -ErrorAction SilentlyContinue`;
  const script = `Start-Sleep -Seconds ${remainingSeconds}; $current = (Get-ItemProperty -LiteralPath '${TOAST_POLICY_KEY.replace('HKCU\\', 'HKCU:\\')}' -Name '${TOAST_POLICY_VALUE}' -ErrorAction SilentlyContinue).'${TOAST_POLICY_VALUE}'; if ($current -eq 1) { ${restoreCommand} }`;
  focusRecoveryProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
    windowsHide: true,
    detached: true,
    stdio: 'ignore'
  });
  focusRecoveryProcess.unref();
}

function persistFocusUsage() {
  const active = activeFocusSession();
  if (!active) return;
  const sessions = saveFocusSession(store.listFocusSessions(), { ...active, appUsage: focusUsageLive }, new Date().toISOString());
  store.setFocusSessions(sessions);
  focusLastPersistAt = Date.now();
}

function persistAttendanceUsage() {
  const active = activeAttendanceRecord();
  if (!active) return;
  const attendance = saveAttendance(store.listAttendance(), { ...active, appUsage: attendanceUsageLive }, new Date().toISOString());
  store.setAttendance(attendance);
  attendanceLastPersistAt = Date.now();
}

function handleFocusSample(line) {
  const [pidText, ...nameParts] = String(line || '').trim().split('|');
  const pid = Number(pidText);
  const processName = nameParts.join('|').trim();
  const now = Date.now();
  const elapsedSeconds = focusLastSampleAt ? Math.max(1, Math.min(10, Math.round((now - focusLastSampleAt) / 1000))) : 5;
  focusLastSampleAt = now;
  if (!pid || !processName || app.getAppMetrics().some((metric) => metric.pid === pid)) return;
  if (activeFocusSession()) {
    focusUsageLive[processName] = (focusUsageLive[processName] || 0) + elapsedSeconds;
    if (now - focusLastPersistAt >= 30_000) persistFocusUsage();
  }
  if (activeAttendanceRecord()) {
    attendanceUsageLive[processName] = (attendanceUsageLive[processName] || 0) + elapsedSeconds;
    if (now - attendanceLastPersistAt >= 30_000) persistAttendanceUsage();
  }
  broadcastWorkspace();
}

function startFocusSampler() {
  if (process.platform !== 'win32' || focusSampler) return;
  const script = `Add-Type @'\nusing System;\nusing System.Runtime.InteropServices;\npublic static class YanjiFocusNative {\n  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\n  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);\n}\n'@\nwhile ($true) {\n  $handle = [YanjiFocusNative]::GetForegroundWindow()\n  [uint32]$foregroundPid = 0\n  [void][YanjiFocusNative]::GetWindowThreadProcessId($handle, [ref]$foregroundPid)\n  try { $process = Get-Process -Id $foregroundPid -ErrorAction Stop; Write-Output (\"$foregroundPid|\" + $process.ProcessName) } catch {}\n  Start-Sleep -Seconds 5\n}`;
  focusSamplerBuffer = '';
  focusLastSampleAt = 0;
  focusSampler = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore']
  });
  focusSampler.stdout.on('data', (chunk) => {
    focusSamplerBuffer += chunk.toString();
    const lines = focusSamplerBuffer.split(/\r?\n/);
    focusSamplerBuffer = lines.pop() || '';
    lines.forEach(handleFocusSample);
  });
  focusSampler.on('close', () => { focusSampler = null; });
}

function stopFocusRuntime() {
  if (focusTimer) clearInterval(focusTimer);
  focusTimer = null;
  if (focusRecoveryProcess) focusRecoveryProcess.kill();
  focusRecoveryProcess = null;
}

function stopUsageSamplerIfIdle(force = false) {
  if (!force && (activeFocusSession() || activeAttendanceRecord())) return;
  if (focusSampler) focusSampler.kill();
  focusSampler = null;
  focusSamplerBuffer = '';
  focusLastSampleAt = 0;
}

function startFocusRuntime(session) {
  stopFocusRuntime();
  focusUsageLive = { ...(session.appUsage || {}) };
  focusLastPersistAt = Date.now();
  startFocusSampler();
  startFocusRecovery(session);
  focusTimer = setInterval(() => {
    const active = activeFocusSession();
    if (!active) return stopFocusRuntime();
    const target = Date.parse(active.startedAt) + active.plannedMinutes * 60_000;
    if (Date.now() >= target) finishFocusSession('completed').catch(() => {});
    else broadcastFocus();
  }, 1000);
}

async function startFocusSession(input) {
  if (activeFocusSession()) throw new Error('已有一段专注正在进行。');
  const plannedMinutes = Math.max(5, Math.min(180, Math.round(Number(input?.plannedMinutes) || 50)));
  const now = new Date().toISOString();
  let sessions = saveFocusSession(store.listFocusSessions(), {
    startedAt: now,
    plannedMinutes,
    status: 'active',
    appUsage: {},
    suppressNotifications: input?.suppressNotifications !== false
  }, now, () => crypto.randomUUID());
  store.setFocusSessions(sessions);
  let session = sessions[0];
  if (session.suppressNotifications) {
    try {
      const suppression = await suppressWindowsToasts();
      session = { ...session, notificationsSuppressed: suppression.supported, notificationRestore: suppression.restore, notificationError: suppression.supported ? null : '当前系统不支持自动勿扰。' };
    } catch (error) {
      session = { ...session, notificationsSuppressed: false, notificationError: error.message || 'Windows 勿扰设置未能启用。' };
    }
    sessions = saveFocusSession(store.listFocusSessions(), session, new Date().toISOString());
    store.setFocusSessions(sessions);
    session = sessions.find((item) => item.id === session.id);
  }
  startFocusRuntime(session);
  broadcastWorkspace();
  return focusSessionsForRenderer();
}

async function finishFocusSession(status = 'stopped') {
  const active = activeFocusSession();
  if (!active) return focusSessionsForRenderer();
  persistFocusUsage();
  stopFocusRuntime();
  let notificationError = active.notificationError;
  let notificationRestoredAt = active.notificationRestoredAt;
  try {
    await restoreWindowsToasts(active);
    notificationRestoredAt = new Date().toISOString();
  } catch (error) {
    notificationError = error.message || 'Windows 通知设置未能自动恢复。';
  }
  const sessions = saveFocusSession(store.listFocusSessions(), {
    ...active,
    appUsage: focusUsageLive,
    status: status === 'completed' ? 'completed' : 'stopped',
    endedAt: new Date().toISOString(),
    notificationRestoredAt,
    notificationError
  }, new Date().toISOString());
  store.setFocusSessions(sessions);
  focusUsageLive = {};
  stopUsageSamplerIfIdle();
  broadcastWorkspace();
  return focusSessionsForRenderer();
}

function resumeFocusRuntime() {
  const active = activeFocusSession();
  if (!active) return;
  const target = Date.parse(active.startedAt) + active.plannedMinutes * 60_000;
  if (Date.now() >= target) finishFocusSession('completed').catch(() => {});
  else startFocusRuntime(active);
}

function resumeAttendanceRuntime() {
  const active = activeAttendanceRecord();
  if (!active) return;
  attendanceUsageLive = { ...(active.appUsage || {}) };
  attendanceLastPersistAt = Date.now();
  startFocusSampler();
}

function createQuickCaptureWindow() {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) return quickCaptureWindow;
  quickCaptureWindow = new BrowserWindow({
    width: 720,
    height: 250,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  quickCaptureWindow.loadFile(path.join(__dirname, 'renderer', 'capture.html'));
  quickCaptureWindow.on('blur', () => {
    setTimeout(() => {
      if (quickCaptureWindow && !quickCaptureWindow.isDestroyed() && quickCaptureWindow.isVisible() && !quickCaptureHasContent) {
        quickCaptureWindow.hide();
      }
    }, 0);
  });
  quickCaptureWindow.on('closed', () => { quickCaptureWindow = null; });
  return quickCaptureWindow;
}

function toggleQuickCapture() {
  const window = createQuickCaptureWindow();
  if (window.isVisible()) {
    window.hide();
    return;
  }
  window.center();
  window.show();
  window.focus();
  window.webContents.send('capture:focus');
}

function registerWorkbenchShortcuts(settings = store?.getSettings(), { allowFallback = false } = {}) {
  globalShortcut.unregisterAll();
  const registrations = [
    ['quickCaptureShortcut', DEFAULT_QUICK_CAPTURE_SHORTCUT, toggleQuickCapture],
    ['stickyNoteShortcut', DEFAULT_STICKY_NOTE_SHORTCUT, createNewStickyNote]
  ];
  const registered = {};
  for (const [key, fallback, handler] of registrations) {
    const requested = String(settings?.[key] || fallback).trim();
    let shortcut = requested;
    if (!globalShortcut.register(shortcut, handler)) {
      if (!allowFallback || requested === fallback || !globalShortcut.register(fallback, handler)) {
        globalShortcut.unregisterAll();
        return null;
      }
      shortcut = fallback;
    }
    registered[key] = shortcut;
  }
  return registered;
}

function openStickyNote(noteId) {
  const id = String(noteId || '');
  const note = store.listNotes().find((item) => item.id === id);
  if (!note) throw new Error('找不到这条笔记。');
  const existing = stickyWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return true;
  }
  const window = new BrowserWindow({
    width: 380,
    height: 440,
    minWidth: 300,
    minHeight: 260,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#f5fbff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  stickyWindows.set(id, window);
  window.loadFile(path.join(__dirname, 'renderer', 'sticky.html'), { query: { id } });
  window.on('closed', () => stickyWindows.delete(id));
  return true;
}

function createNewStickyNote() {
  const now = new Date();
  const note = saveWorkspaceNote({
    title: `便笺 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`,
    content: ''
  });
  openStickyNote(note.id);
  return note;
}

function nativeWindowHandleValue(window) {
  const handle = window.getNativeWindowHandle();
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString();
  return BigInt(handle.readUInt32LE(0)).toString();
}

async function attachWindowToDesktop(window, targetSize) {
  if (process.platform !== 'win32') return false;
  const script = String.raw`
$ChildHandle = [UInt64]::Parse($env:YANJI_DESKTOP_CHILD_HANDLE)
$TargetWidth = [Int32]::Parse($env:YANJI_DESKTOP_CHILD_WIDTH)
$TargetHeight = [Int32]::Parse($env:YANJI_DESKTOP_CHILD_HEIGHT)
$source = @'
using System;
using System.Runtime.InteropServices;

public static class YanjiDesktopHost {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  private struct RECT { public int Left, Top, Right, Bottom; }

  [StructLayout(LayoutKind.Sequential)]
  private struct POINT { public int X, Y; }

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string title);

  [DllImport("user32.dll")]
  private static extern IntPtr GetShellWindow();

  [DllImport("user32.dll", SetLastError = true)]
  private static extern IntPtr SetParent(IntPtr child, IntPtr parent);

  [DllImport("user32.dll")]
  private static extern IntPtr GetParent(IntPtr child);

  [DllImport("user32.dll")]
  private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  private static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)]
  private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);

  [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)]
  private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)]
  private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int index, IntPtr value);

  [DllImport("user32.dll", EntryPoint = "SetWindowLong", SetLastError = true)]
  private static extern IntPtr SetWindowLong32(IntPtr hWnd, int index, IntPtr value);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);

  private static IntPtr GetStyle(IntPtr hWnd) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, -16) : GetWindowLong32(hWnd, -16);
  }

  private static void SetStyle(IntPtr hWnd, IntPtr value) {
    if (IntPtr.Size == 8) SetWindowLongPtr64(hWnd, -16, value);
    else SetWindowLong32(hWnd, -16, value);
  }

  private static IntPtr GetExtendedStyle(IntPtr hWnd) {
    return IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, -20) : GetWindowLong32(hWnd, -20);
  }

  private static void SetExtendedStyle(IntPtr hWnd, IntPtr value) {
    if (IntPtr.Size == 8) SetWindowLongPtr64(hWnd, -20, value);
    else SetWindowLong32(hWnd, -20, value);
  }

  private static IntPtr FindIconHost() {
    IntPtr host = IntPtr.Zero;
    EnumWindows(delegate(IntPtr candidate, IntPtr state) {
      if (FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) {
        host = candidate;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return host != IntPtr.Zero ? host : GetShellWindow();
  }

  public static int Attach(UInt64 childValue, int targetWidth, int targetHeight) {
    IntPtr child = new IntPtr(unchecked((long)childValue));
    IntPtr host = FindIconHost();
    if (child == IntPtr.Zero) return 11;
    if (host == IntPtr.Zero) return 12;
    if (targetWidth <= 0 || targetHeight <= 0) return 13;

    RECT rect;
    if (!GetWindowRect(child, out rect)) return 2;
    POINT origin = new POINT { X = rect.Left, Y = rect.Top };
    ScreenToClient(host, ref origin);

    long style = GetStyle(child).ToInt64();
    const long nativeFrame = 0x00C00000L | 0x00040000L | 0x00080000L | 0x00020000L | 0x00010000L;
    style = (style & ~0x80000000L & ~nativeFrame) | 0x40000000L;
    SetStyle(child, new IntPtr(style));
    long extendedStyle = GetExtendedStyle(child).ToInt64();
    const long extendedFrame = 0x00000100L | 0x00000200L | 0x00020000L;
    SetExtendedStyle(child, new IntPtr(extendedStyle & ~extendedFrame));
    SetParent(child, host);
    if (GetParent(child) != host) return 3;

    const uint flags = 0x0010 | 0x0020 | 0x0040;
    return SetWindowPos(child, IntPtr.Zero, origin.X, origin.Y, targetWidth, targetHeight, flags) ? 0 : 4;
  }
}
'@
Add-Type -TypeDefinition $source
$attachResult = [YanjiDesktopHost]::Attach($ChildHandle, $TargetWidth, $TargetHeight)
Write-Output "YANJI_DESKTOP_RESULT=$attachResult"
if ($attachResult -eq 0) { Write-Output 'YANJI_DESKTOP_ATTACHED'; exit 0 }
exit 1
`;
  const result = await new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      script
    ], {
      windowsHide: true,
      env: {
        ...process.env,
        YANJI_DESKTOP_CHILD_HANDLE: nativeWindowHandleValue(window),
        YANJI_DESKTOP_CHILD_WIDTH: String(targetSize.width),
        YANJI_DESKTOP_CHILD_HEIGHT: String(targetSize.height)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ status: null, signal: 'TIMEOUT', stdout, stderr, error: new Error('desktop attach timed out') });
    }, 8_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ status: null, signal: null, stdout, stderr, error }));
    child.on('close', (status, signal) => finish({ status, signal, stdout, stderr }));
  });
  const attached = result.status === 0 && result.stdout.includes('YANJI_DESKTOP_ATTACHED');
  if (!attached && process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
    console.warn(`DESKTOP_WIDGET_NATIVE_DIAGNOSTIC ${JSON.stringify({ handle: nativeWindowHandleValue(window), status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message })}`);
  }
  return attached;
}

async function showScheduleWidget() {
  if (scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) {
    scheduleWidgetWindow.showInactive();
    return { attached: Boolean(scheduleWidgetWindow.yanjiDesktopAttached) };
  }
  const { workArea } = screen.getPrimaryDisplay();
  const width = 360;
  const height = 480;
  const window = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + 24,
    show: false,
    frame: false,
    thickFrame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#eaf5fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  scheduleWidgetWindow = window;
  window.on('closed', () => {
    if (scheduleWidgetWindow === window) scheduleWidgetWindow = null;
  });
  await window.loadFile(path.join(__dirname, 'renderer', 'schedule-widget.html'));
  window.yanjiDesktopAttached = await attachWindowToDesktop(window, { width, height });
  if (window.yanjiDesktopAttached) {
    await new Promise((resolve) => setTimeout(resolve, 80));
  } else {
    window.setSize(width, height);
  }
  window.showInactive();
  return { attached: window.yanjiDesktopAttached };
}

function showScheduleNotification(schedule) {
  if (!store.getSettings().notifications || !Notification.isSupported()) return;
  const notification = new Notification({
    title: schedule.priority === 'medium' ? '重要日程已到时间' : '日程提醒',
    body: schedule.title,
    urgency: schedule.priority === 'medium' ? 'critical' : 'normal',
    icon: path.join(__dirname, '..', 'build', 'icon.png')
  });
  notification.on('click', () => {
    showMainWindow();
    mainWindow?.webContents.send('workspace:navigate', 'schedule');
  });
  notification.show();
}

function showDeadlineWindow(schedule) {
  const existing = deadlineWindows.get(schedule.id);
  if (existing && [...existing].some((window) => !window.isDestroyed())) return;
  const urgent = schedule.priority === 'high';
  const displays = urgent ? screen.getAllDisplays() : [screen.getDisplayNearestPoint(screen.getCursorScreenPoint())];
  const windows = new Set();
  deadlineWindows.set(schedule.id, windows);
  displays.forEach((display, index) => {
    const bounds = display.bounds;
    const window = new BrowserWindow({
      ...(urgent ? bounds : { width: 620, height: 380 }),
      show: false,
      frame: false,
      fullscreen: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: !urgent,
      minimizable: false,
      maximizable: false,
      backgroundColor: urgent ? '#332735' : '#f3cf8f',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    window.yanjiDeadlineId = schedule.id;
    windows.add(window);
    window.loadFile(path.join(__dirname, 'renderer', 'deadline.html'));
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('deadline:show', schedule);
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.show();
      if (index === 0) window.focus();
    });
    window.on('closed', () => {
      windows.delete(window);
      if (!windows.size) deadlineWindows.delete(schedule.id);
    });
  });
}

function dismissDeadlineWindows(id) {
  const windows = deadlineWindows.get(id);
  if (!windows) return;
  for (const window of [...windows]) if (!window.isDestroyed()) window.close();
  deadlineWindows.delete(id);
}

function runWorkspaceReminders(now = new Date()) {
  const due = store.listSchedules().filter((schedule) => (
    schedule.deadline &&
    !schedule.completedAt &&
    !schedule.remindedAt &&
    Date.parse(schedule.startAt) <= now.getTime()
  ));
  if (!due.length) return [];
  let schedules = store.listSchedules();
  for (const schedule of due) {
    if (schedule.priority === 'high' || schedule.priority === 'medium') showDeadlineWindow(schedule);
    if (schedule.priority !== 'high') showScheduleNotification(schedule);
    schedules = schedules.map((item) => item.id === schedule.id
      ? { ...item, remindedAt: now.toISOString(), updatedAt: now.toISOString() }
      : item);
  }
  store.setSchedules(schedules);
  broadcastWorkspace();
  return due;
}

function broadcastRefreshState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('refresh:state', { ids: [...refreshingIds] });
  }
}

async function fetchTrackerSnapshot(trackingUrl) {
  const { endpoint } = parseTrackingInput(trackingUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await net.fetch(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-cache'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('没有找到该稿件，请检查追踪链接是否完整或已失效。');
      }
      throw new Error(`Elsevier 追踪服务暂时不可用（HTTP ${response.status}）。`);
    }
    return normalizeTrackerPayload(await response.json());
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('连接 Elsevier 超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProductionSnapshot(trackingUrl) {
  const safeUrl = validateProductionTrackingUrl(trackingUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await net.fetch(safeUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'cache-control': 'no-cache'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Elsevier 出版追踪服务暂时不可用（HTTP ${response.status}）。`);
    }
    return extractProductionSnapshot(await response.text());
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('连接 Elsevier 出版追踪服务超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function notifyChange(paper, changes) {
  const settings = store.getSettings();
  if (!settings.notifications || !Notification.isSupported() || changes.length === 0) return;
  const body = changes.slice(0, 3).join('\n');
  const notification = new Notification({
    title: `${paper.snapshot.title} 有新进展`,
    body,
    silent: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    timeoutType: 'never'
  });
  notification.on('click', async () => {
    showMainWindow();
    try {
      const trackingUrl = decryptSecret(paper.trackingSecret);
      if (paper.source === 'elsevier-production') validateProductionTrackingUrl(trackingUrl);
      else parseTrackingInput(trackingUrl);
      await shell.openExternal(trackingUrl);
    } catch {
      // The app is still brought forward if the external page cannot be opened.
    }
  });
  notification.show();
}

async function addReviewPaper(trackingInput) {
  const parsed = parseTrackingInput(trackingInput);
  const key = paperKey(parsed.uuid);
  if (store.findByKey(key)) {
    throw new Error('这篇稿件已经在追踪列表中。');
  }

  const now = new Date().toISOString();
  const snapshot = compactSnapshot(await fetchTrackerSnapshot(parsed.canonicalUrl), now);
  const paper = {
    id: crypto.randomUUID(),
    paperKey: key,
    source: 'elsevier',
    trackingSecret: encryptSecret(parsed.canonicalUrl),
    maskedTrackingUrl: maskTrackingUrl(parsed.canonicalUrl),
    addedAt: now,
    archivedAt: null,
    lastAttemptAt: now,
    lastSuccessfulAt: now,
    failureStreak: 0,
    nextRetryAt: null,
    lastError: null,
    snapshot,
    details: {},
    tasks: [],
    revisionRounds: [],
    importantUpdates: [],
    history: [{
      checkedAt: now,
      status: snapshot.status,
      latestRevision: snapshot.latestRevision,
      counts: snapshot.counts,
      changes: ['首次记录']
    }]
  };
  store.addPaper(paper);
  broadcastPapers();
  return serializePaper(paper);
}

async function addProductionPaper(authorInput) {
  const parsed = buildProductionTrackingUrl(authorInput);
  const key = paperKey(`production:${parsed.journalId}:${parsed.articleId}:${parsed.lastName.toLowerCase()}`);
  if (store.findByKey(key)) {
    throw new Error('这篇文章已经在追踪列表中。');
  }

  const now = new Date().toISOString();
  const snapshot = compactSnapshot(await fetchProductionSnapshot(parsed.url), now);
  const paper = {
    id: crypto.randomUUID(),
    paperKey: key,
    source: 'elsevier-production',
    authorFirstName: parsed.firstName || null,
    trackingSecret: encryptSecret(parsed.url),
    maskedTrackingUrl: `Elsevier Production · ${snapshot.articleReference || parsed.reference}`,
    addedAt: now,
    archivedAt: null,
    lastAttemptAt: now,
    lastSuccessfulAt: now,
    failureStreak: 0,
    nextRetryAt: null,
    lastError: null,
    snapshot,
    details: {},
    tasks: [],
    revisionRounds: [],
    importantUpdates: [],
    history: [{
      checkedAt: now,
      status: snapshot.status,
      latestRevision: 0,
      counts: snapshot.counts,
      changes: ['首次记录出版进展']
    }]
  };
  store.addPaper(paper);
  broadcastPapers();
  return serializePaper(paper);
}

async function addPaper(input) {
  if (input && typeof input === 'object' && input.mode === 'author') {
    return addProductionPaper(input);
  }
  const trackingInput = input && typeof input === 'object' ? input.trackingUrl : input;
  return addReviewPaper(trackingInput);
}

async function refreshPaper(id, { notify = true } = {}) {
  if (refreshingIds.has(id)) {
    const existing = store.findPaper(id);
    return existing ? serializePaper(existing) : null;
  }
  let paper = store.findPaper(id);
  if (!paper) throw new Error('找不到这篇稿件。');

  refreshingIds.add(id);
  broadcastRefreshState();
  const attemptedAt = new Date().toISOString();
  paper = store.updatePaper(id, (current) => ({ ...current, lastAttemptAt: attemptedAt }));
  try {
    const trackingUrl = decryptSecret(paper.trackingSecret);
    const rawLatest = await (
      paper.source === 'elsevier-production'
        ? fetchProductionSnapshot(trackingUrl)
        : fetchTrackerSnapshot(trackingUrl)
    );
    const successfulAt = new Date().toISOString();
    const latest = compactSnapshot(rawLatest, successfulAt, paper.snapshot);
    const previousFingerprint = snapshotFingerprint(paper.snapshot);
    const latestFingerprint = snapshotFingerprint(latest);
    const changes = describeChanges(paper.snapshot, latest);
    const notificationChanges = importantChanges(paper.snapshot, latest, changes);
    const updated = store.updatePaper(id, (current) => {
      const history = Array.isArray(current.history) ? [...current.history] : [];
      if (previousFingerprint !== latestFingerprint) {
        history.push({
          checkedAt: successfulAt,
          status: latest.status,
          latestRevision: latest.latestRevision,
          counts: latest.counts,
          changes: changes.length ? changes : ['稿件信息已更新']
        });
      }
      const withUpdates = previousFingerprint !== latestFingerprint
        ? appendImportantUpdates(current, notificationChanges, successfulAt, () => crypto.randomUUID())
        : current;
      return applyRefreshSuccess(
        withUpdates,
        latest,
        successfulAt,
        history.slice(-MAX_HISTORY),
        withUpdates.importantUpdates,
        attemptedAt
      );
    });
    if (notify && previousFingerprint !== latestFingerprint && notificationChanges.length) {
      notifyChange(updated, notificationChanges);
    }
    return serializePaper(updated);
  } catch (error) {
    const message = error?.message || '刷新失败。';
    store.updatePaper(id, (current) => applyRefreshFailure(
      current,
      message,
      attemptedAt,
      store.getSettings().refreshMinutes
    ));
    throw new Error(message);
  } finally {
    refreshingIds.delete(id);
    broadcastRefreshState();
    broadcastPapers();
  }
}

async function refreshAll({ notify = true } = {}) {
  const results = [];
  for (const paper of store.listPapers().filter((item) => !item.archivedAt)) {
    try {
      results.push({ id: paper.id, ok: true, paper: await refreshPaper(paper.id, { notify }) });
    } catch (error) {
      results.push({ id: paper.id, ok: false, error: error.message });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return results;
}

function validateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('设置格式不正确。');
  }
  const allowed = {};
  for (const key of ['autoRefresh', 'refreshOnStartup', 'notifications', 'closeToTray', 'startAtLogin', 'autoCheckUpdates']) {
    if (key in patch) allowed[key] = Boolean(patch[key]);
  }
  for (const key of ['quickCaptureShortcut', 'stickyNoteShortcut']) {
    if (!(key in patch)) continue;
    const shortcut = String(patch[key] || '').trim();
    if (!shortcut || shortcut.length > 100) throw new Error('快捷键格式不正确。');
    allowed[key] = shortcut;
  }
  if ('refreshMinutes' in patch) {
    const minutes = Number(patch.refreshMinutes);
    if (!Number.isInteger(minutes) || minutes < 60 || minutes > 1440) {
      throw new Error('自动刷新间隔必须在 60–1440 分钟之间。');
    }
    allowed.refreshMinutes = minutes;
  }
  return allowed;
}

function updateLoginItemSetting(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled,
    args: enabled ? ['--hidden'] : []
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#edf7fc',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR_NORMAL,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    if (coldStartRefreshStarted || !store.getSettings().refreshOnStartup) return;
    coldStartRefreshStarted = true;
    setTimeout(() => refreshAll({ notify: true }).catch(() => {}), 900);
  });
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) mainWindow.show();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting && store.getSettings().closeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
    } else if (!isQuitting) {
      isQuitting = true;
    }
  });
}

function createTrayIcon() {
  return nativeImage
    .createFromPath(path.join(__dirname, '..', 'build', 'icon.png'))
    .resize({ width: 20, height: 20, quality: 'best' });
}

function createTray() {
  const icon = createTrayIcon();
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开研迹', click: showMainWindow },
    { label: '刷新全部稿件', click: () => refreshAll().catch(() => {}) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

async function runScheduledRefresh() {
  const settings = store.getSettings();
  if (!settings.autoRefresh) return;
  const threshold = settings.refreshMinutes * 60 * 1000;
  for (const paper of store.listPapers().filter((item) => !item.archivedAt)) {
    const dueAt = paper.lastError && paper.nextRetryAt
      ? Date.parse(paper.nextRetryAt)
      : Date.parse(paper.lastAttemptAt || paper.lastSuccessfulAt || 0) + threshold;
    if (!Number.isFinite(dueAt) || Date.now() >= dueAt) {
      try {
        await refreshPaper(paper.id, { notify: true });
      } catch {
        // The error is persisted on the paper and shown in the dashboard.
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function deadlineNotificationBody(task, urgency) {
  const due = new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(task.dueAt));
  return urgency.state === 'overdue'
    ? `${task.title}已逾期，截止时间为 ${due}`
    : `${task.title}将在 ${due} 到期`;
}

function runDeadlineReminders() {
  if (!store.getSettings().notifications || !Notification.isSupported()) return [];
  const now = new Date().toISOString();
  const reminders = tasksNeedingNotification(store.listPapers(), now);
  for (const { paper, task, urgency } of reminders) {
    const notification = new Notification({
      title: `${urgency.state === 'overdue' ? '任务已逾期' : '任务即将到期'} · ${paper.snapshot.title}`,
      body: deadlineNotificationBody(task, urgency),
      silent: false,
      icon: path.join(__dirname, '..', 'build', 'icon.png')
    });
    notification.on('click', showMainWindow);
    notification.show();
    store.updatePaper(paper.id, (current) => markTaskReminded(current, task.id, urgency.state, now));
  }
  if (reminders.length) broadcastPapers();
  return reminders;
}

async function runScheduledWork() {
  runDeadlineReminders();
  runWorkspaceReminders();
  if (Date.now() - lastBackupCleanupAt >= 24 * 60 * 60_000) cleanupExpiredBackups();
  await runScheduledRefresh();
}

function mutatePaper(id, mutation) {
  const updated = store.updatePaper(id, mutation);
  broadcastPapers();
  return serializePaper(updated);
}

function savePaperDetails(id, details) {
  return mutatePaper(id, (paper) => updatePaperDetails(paper, details));
}

function savePaperTask(id, input) {
  return mutatePaper(id, (paper) => saveTask(paper, input, new Date().toISOString(), () => crypto.randomUUID()));
}

function setPaperTaskCompleted(id, taskId, completed) {
  return mutatePaper(id, (paper) => completeTask(paper, taskId, completed));
}

function removePaperTask(id, taskId) {
  return mutatePaper(id, (paper) => deleteTask(paper, taskId));
}

function savePaperRevision(id, input) {
  return mutatePaper(id, (paper) => saveRevisionRound(paper, input, new Date().toISOString(), () => crypto.randomUUID()));
}

function removePaperRevision(id, revisionId) {
  return mutatePaper(id, (paper) => deleteRevisionRound(paper, revisionId));
}

function markPaperRead(id) {
  const updated = store.updatePaper(id, (paper) => markUpdatesRead(paper));
  broadcastPapers();
  return serializePaper(updated);
}

function markAllRead() {
  let changed = 0;
  for (const paper of store.listPapers()) {
    if (!unreadCount(paper)) continue;
    store.updatePaper(paper.id, (current) => markUpdatesRead(current));
    changed += 1;
  }
  if (changed) broadcastPapers();
  return { changed };
}

function setPaperArchived(id, archived) {
  const updated = store.updatePaper(id, (paper) => setArchived(paper, archived));
  broadcastPapers();
  return serializePaper(updated);
}

function linkPaperJourney(id, targetId) {
  const linked = linkJourney(store.listPapers(), id, targetId);
  for (const next of linked) {
    const current = store.findPaper(next.id);
    if (current?.journeyId !== next.journeyId) {
      store.updatePaper(next.id, (item) => ({ ...item, journeyId: next.journeyId || null }));
    }
  }
  broadcastPapers();
  return listSerializedPapers();
}

function unlinkPaperJourney(id) {
  const unlinked = unlinkJourney(store.listPapers(), id);
  for (const next of unlinked) {
    const current = store.findPaper(next.id);
    if (current?.journeyId !== next.journeyId) {
      store.updatePaper(next.id, (item) => ({ ...item, journeyId: next.journeyId || null }));
    }
  }
  broadcastPapers();
  return listSerializedPapers();
}

async function exportPaper(id, format) {
  const paper = store.findPaper(id);
  if (!paper) throw new Error('找不到这篇稿件。');
  if (!['markdown', 'csv'].includes(format)) throw new Error('不支持的导出格式。');
  const extension = format === 'markdown' ? 'md' : 'csv';
  const safeTitle = String(paper.snapshot?.title || 'Yanji-timeline')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 80);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: `导出${format === 'markdown' ? ' Markdown' : ' CSV'} 时间线`,
    defaultPath: path.join(app.getPath('documents'), `${safeTitle}.${extension}`),
    filters: [{ name: format === 'markdown' ? 'Markdown' : 'CSV', extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const content = buildPaperExport(paper, format);
  fs.writeFileSync(result.filePath, format === 'csv' ? `\uFEFF${content}` : content, 'utf8');
  return { canceled: false, filePath: result.filePath };
}

function registerIpc() {
  ipcMain.handle('workspace:get', () => workspaceForRenderer());
  ipcMain.handle('schedules:parse', (_event, input) => parseNaturalLanguageSchedule(input, new Date()));
  ipcMain.handle('schedules:save', (_event, input) => saveWorkspaceSchedule(input));
  ipcMain.handle('schedules:delete', (_event, id) => deleteWorkspaceSchedule(String(id)));
  ipcMain.handle('schedules:complete', (_event, id, completed) => setWorkspaceScheduleCompleted(String(id), Boolean(completed)));
  ipcMain.handle('schedule-widget:show', () => showScheduleWidget());
  ipcMain.handle('schedule-widget:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
  ipcMain.handle('schedule-widget:open-main', () => {
    showMainWindow();
    mainWindow?.webContents.send('workspace:navigate', 'schedule');
    return true;
  });
  ipcMain.handle('notes:save', (_event, input) => saveWorkspaceNote(input));
  ipcMain.handle('notes:delete', (_event, id) => deleteWorkspaceNote(String(id)));
  ipcMain.handle('notes:open-sticky', (_event, id) => openStickyNote(String(id)));
  ipcMain.handle('notes:create-sticky', () => createNewStickyNote());
  ipcMain.handle('metadata:save-fields', (_event, fields) => saveMetadataFields(fields));
  ipcMain.handle('attendance:clock', (_event, action) => clockWorkspaceAttendance(String(action || '')));
  ipcMain.handle('attendance:save', (_event, input) => saveWorkspaceAttendance(input));
  ipcMain.handle('attendance:delete', (_event, id) => deleteWorkspaceAttendance(String(id)));
  ipcMain.handle('focus:get-state', () => focusSessionsForRenderer());
  ipcMain.handle('focus:start', (_event, input) => startFocusSession(input));
  ipcMain.handle('focus:stop', () => finishFocusSession('stopped'));
  ipcMain.handle('capture:show', () => {
    toggleQuickCapture();
    return true;
  });
  ipcMain.handle('capture:hide', (event) => {
    quickCaptureHasContent = false;
    BrowserWindow.fromWebContents(event.sender)?.hide();
    return true;
  });
  ipcMain.on('capture:content-state', (_event, hasContent) => {
    quickCaptureHasContent = Boolean(hasContent);
  });
  ipcMain.handle('capture:submit', (_event, input) => {
    if (input?.mode === 'note') {
      return { mode: 'note', item: saveWorkspaceNote({ content: String(input.content || '') }) };
    }
    const parsed = parseNaturalLanguageSchedule(input?.content, new Date());
    if (!parsed.valid) throw new Error('没有识别到可创建的日程。');
    return { mode: 'schedule', item: saveWorkspaceSchedule(parsed) };
  });
  ipcMain.handle('sticky:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
  ipcMain.handle('sticky:set-always-on-top', (event, enabled) => {
    BrowserWindow.fromWebContents(event.sender)?.setAlwaysOnTop(Boolean(enabled), 'floating');
    return true;
  });
  ipcMain.handle('deadline:dismiss', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.yanjiDeadlineId) dismissDeadlineWindows(window.yanjiDeadlineId);
    else window?.close();
    return true;
  });
  ipcMain.handle('papers:list', () => listSerializedPapers());
  ipcMain.handle('papers:add', (_event, input) => addPaper(input));
  ipcMain.handle('papers:refresh', (_event, id) => refreshPaper(String(id)));
  ipcMain.handle('papers:refresh-all', () => refreshAll());
  ipcMain.handle('papers:mark-read', (_event, id) => markPaperRead(String(id)));
  ipcMain.handle('papers:mark-all-read', () => markAllRead());
  ipcMain.handle('papers:archive', (_event, id) => setPaperArchived(String(id), true));
  ipcMain.handle('papers:restore', (_event, id) => setPaperArchived(String(id), false));
  ipcMain.handle('papers:link-journey', (_event, id, targetId) => linkPaperJourney(String(id), String(targetId)));
  ipcMain.handle('papers:unlink-journey', (_event, id) => unlinkPaperJourney(String(id)));
  ipcMain.handle('papers:export', (_event, id, format) => exportPaper(String(id), String(format)));
  ipcMain.handle('papers:update-details', (_event, id, details) => savePaperDetails(String(id), details));
  ipcMain.handle('tasks:save', (_event, id, input) => savePaperTask(String(id), input));
  ipcMain.handle('tasks:complete', (_event, id, taskId, completed) => setPaperTaskCompleted(String(id), String(taskId), Boolean(completed)));
  ipcMain.handle('tasks:delete', (_event, id, taskId) => removePaperTask(String(id), String(taskId)));
  ipcMain.handle('revisions:save', (_event, id, input) => savePaperRevision(String(id), input));
  ipcMain.handle('revisions:delete', (_event, id, revisionId) => removePaperRevision(String(id), String(revisionId)));
  ipcMain.handle('papers:remove', (_event, id) => {
    const paperId = String(id);
    const paper = store.findPaper(paperId);
    if (!paper) throw new Error('找不到这篇稿件。');
    if (!paper.archivedAt) throw new Error('请先归档稿件，再永久删除本地记录。');
    const journeyId = paper.journeyId || null;
    store.removePaper(paperId);
    if (journeyId) {
      const remaining = store.listPapers().filter((item) => item.journeyId === journeyId);
      if (remaining.length === 1) {
        store.updatePaper(remaining[0].id, (current) => ({ ...current, journeyId: null }));
      }
    }
    broadcastPapers();
    return true;
  });
  ipcMain.handle('papers:open-tracking', async (_event, id) => {
    const paper = store.findPaper(String(id));
    if (!paper) throw new Error('找不到这篇稿件。');
    const trackingUrl = decryptSecret(paper.trackingSecret);
    if (paper.source === 'elsevier-production') validateProductionTrackingUrl(trackingUrl);
    else parseTrackingInput(trackingUrl);
    await shell.openExternal(trackingUrl);
    return true;
  });
  ipcMain.handle('settings:get', () => settingsForRenderer());
  ipcMain.handle('settings:update', (_event, patch) => {
    const validated = validateSettings(patch);
    if ('quickCaptureShortcut' in validated || 'stickyNoteShortcut' in validated) {
      const previousSettings = store.getSettings();
      const registered = registerWorkbenchShortcuts({ ...previousSettings, ...validated });
      if (!registered) {
        registerWorkbenchShortcuts(previousSettings, { allowFallback: true });
        throw new Error('快捷键无效、重复或已被其他软件占用，请更换后重试。');
      }
    }
    const updated = store.updateSettings(validated);
    updateLoginItemSetting(updated.startAtLogin);
    return settingsForRenderer();
  });
  ipcMain.handle('settings:choose-data-directory', (_event, request) => chooseDataDirectory(request));
  ipcMain.handle('settings:delete-data-backups', (_event, confirmed) => deleteDataBackups(Boolean(confirmed)));
  ipcMain.handle('updates:get-state', () => updateStateForRenderer());
  ipcMain.handle('updates:check', () => checkForAppUpdate());
  ipcMain.handle('updates:download', () => downloadAppUpdate());
  ipcMain.handle('updates:install', () => installDownloadedUpdate());
  ipcMain.handle('updates:open-release-page', () => openUpdateReleasePage());
  ipcMain.handle('system:copy-text', (_event, text) => {
    const value = String(text || '').trim();
    if (!value || value.length > 2048) throw new Error('复制内容无效。');
    clipboard.writeText(value);
    return true;
  });
  ipcMain.handle('system:open-external', async (_event, value) => {
    let url;
    try { url = new URL(String(value || '')); } catch { throw new Error('文章链接无效。'); }
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('不支持打开这个链接。');
    await shell.openExternal(url.toString());
    return true;
  });
  ipcMain.handle('window:set-modal-state', (_event, active) => {
    setModalTitleBar(Boolean(active));
    return true;
  });
}

if (process.env.YANJI_QA_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.YANJI_QA_USER_DATA));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    try {
      app.setAppUserModelId('io.papertrail.desktop');
      store = new JsonStore(configuredDataFilePath());
      store.load();
      cleanupExpiredBackups();
      setupAutoUpdater();
      registerIpc();
      createWindow();
      createTray();
      updateLoginItemSetting(store.getSettings().startAtLogin);
      const registeredShortcuts = registerWorkbenchShortcuts(store.getSettings(), { allowFallback: true });
      if (registeredShortcuts) {
        const current = store.getSettings();
        const changed = Object.fromEntries(Object.entries(registeredShortcuts).filter(([key, value]) => current[key] !== value));
        if (Object.keys(changed).length) store.updateSettings(changed);
      }
      scheduler = setInterval(() => runScheduledWork().catch(() => {}), 60_000);
      setTimeout(runDeadlineReminders, 1500);
      setTimeout(runWorkspaceReminders, 1800);
      resumeFocusRuntime();
      resumeAttendanceRuntime();
      if (store.getSettings().autoCheckUpdates) {
        setTimeout(() => checkForAppUpdate().catch(() => {}), 4000);
      }
      if (process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
        const result = await showScheduleWidget();
        const bounds = scheduleWidgetWindow.getBounds();
        const [contentWidth, contentHeight] = scheduleWidgetWindow.getContentSize();
        console.log(`DESKTOP_WIDGET_ATTACH_OK ${JSON.stringify({ attached: result.attached, contentWidth, contentHeight, outerWidth: bounds.width, outerHeight: bounds.height, alwaysOnTop: scheduleWidgetWindow.isAlwaysOnTop(), skipTaskbar: true })}`);
        if (!result.attached || contentWidth !== 360 || contentHeight !== 480 || scheduleWidgetWindow.isAlwaysOnTop()) {
          throw new Error('桌面日程组件没有按 3:4 非置顶桌面层模式打开。');
        }
        try {
          const image = await scheduleWidgetWindow.webContents.capturePage();
          fs.writeFileSync(path.resolve(process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT), image.toPNG());
        } catch (error) {
          console.warn(`DESKTOP_WIDGET_CAPTURE_SKIPPED ${error?.message || error}`);
        }
        isQuitting = true;
        setTimeout(() => app.quit(), 120);
      }
    } catch (error) {
      if (process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
        console.error(`DESKTOP_WIDGET_ATTACH_FAILED ${error?.stack || error}`);
        isQuitting = true;
        app.exit(1);
        return;
      }
      dialog.showErrorBox('研迹无法安全打开数据', error?.message || '数据文件损坏或格式不受支持。');
      isQuitting = true;
      app.quit();
    }
  });
}

app.on('activate', showMainWindow);
app.on('before-quit', () => {
  isQuitting = true;
  if (scheduler) clearInterval(scheduler);
  const active = store && activeFocusSession();
  if (active) {
    persistFocusUsage();
    stopFocusRuntime();
    const restored = restoreWindowsToastsSync(active);
    store.setFocusSessions(saveFocusSession(store.listFocusSessions(), {
      ...active,
      appUsage: focusUsageLive,
      status: 'stopped',
      endedAt: new Date().toISOString(),
      notificationRestoredAt: restored ? new Date().toISOString() : active.notificationRestoredAt,
      notificationError: restored ? active.notificationError : '退出时未能恢复 Windows 通知设置。'
    }, new Date().toISOString()));
  }
  if (store && activeAttendanceRecord()) persistAttendanceUsage();
  stopUsageSamplerIfIdle(true);
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (isQuitting || !store?.getSettings().closeToTray || !tray)) {
    isQuitting = true;
    app.quit();
  }
});

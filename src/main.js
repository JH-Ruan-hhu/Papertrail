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
let autoUpdater = null;
let updaterLoadError = null;
try {
  if (process.env.YANJI_DISABLE_UPDATER === '1') throw new Error('Updater disabled for startup recovery verification.');
  ({ autoUpdater } = require('electron-updater'));
} catch (error) {
  updaterLoadError = error;
  console.error('[updater] Failed to load electron-updater:', error);
}
const { JsonStore, DEFAULT_SETTINGS } = require('./store');
const { readStoragePointer: readStoragePointerState, resolveStorageState } = require('./storage-core');
const { createPlanningService } = require('./planning-service');
const { collectReminderCandidates, normalizeReminderPayload, reminderPresentation } = require('./reminder-core');
const { desktopWidgetPresentation } = require('./desktop-widget-core');
const { parseNaturalLanguageTodo } = require('./todo-core');
const { deleteJobApplication, saveJobApplication } = require('./job-core');
const { resolveStableUserDataPath } = require('./user-data-path');
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
  closeStaleAttendanceRecords,
  normalizeMetadataField,
  normalizeNote,
  noteBodyHasContent,
  NOTE_ATTACHMENT_MIMES,
  parseNaturalLanguageSchedules,
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
  migrateData,
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
  isNotPublishedError,
  nextUpdateState
} = require('./update-core');

const APP_NAME = '研迹 · 科研工作台';
const APP_ID = 'io.papertrail.desktop';
const BUILD_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'build')
  : path.join(__dirname, '..', 'build');
const APP_ICON_PNG_PATH = path.join(BUILD_DIR, 'icon.png');
const APP_ICON_PATH = process.platform === 'win32' ? path.join(BUILD_DIR, 'icon.ico') : APP_ICON_PNG_PATH;

function createAppWindowIcon() {
  const image = nativeImage.createFromPath(APP_ICON_PATH);
  return image.isEmpty() ? APP_ICON_PATH : image;
}
const MAX_HISTORY = 100;
const FETCH_TIMEOUT_MS = 20_000;
const DATA_FILE_NAME = 'papertrail-data.json';
const STORAGE_POINTER_NAME = 'papertrail-storage.json';
const ATTACHMENTS_DIRECTORY_NAME = 'attachments';
const MAX_NOTE_ATTACHMENT_SIZE = 12 * 1024 * 1024;
const MAX_NOTE_ATTACHMENTS_TOTAL = 50 * 1024 * 1024;
const BACKUP_RETENTION_MS = 30 * 24 * 60 * 60_000;
const RELEASES_URL = 'https://github.com/JH-Ruan-hhu/Papertrail/releases/latest';
const DEFAULT_QUICK_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+Space';
const DEFAULT_STICKY_NOTE_SHORTCUT = 'CommandOrControl+Alt+N';
const TITLE_BAR_NORMAL = Object.freeze({ color: '#eaf5fb', symbolColor: '#35566b', height: 38 });
const TITLE_BAR_MODAL = Object.freeze({ color: '#9dabb6', symbolColor: '#f5fbfe', height: 38 });

let mainWindow;
let mainWindowReleaseTimer;
let tray;
let store;
let planningService;
let scheduler;
let isQuitting = false;
let coldStartRefreshStarted = false;
let updateState;
let updaterInitialized = false;
let quickCaptureWindow;
let scheduleWidgetWindow;
let desktopIconReservation;
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

function noteAttachmentsDirectory() {
  return store?.attachmentsDirectory || path.join(path.dirname(store.filePath), ATTACHMENTS_DIRECTORY_NAME);
}

function safeStoredAttachmentPath(storedName) {
  const name = String(storedName || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(name)) throw new Error('附件引用无效。');
  const root = path.resolve(noteAttachmentsDirectory());
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) throw new Error('附件引用无效。');
  return target;
}

function noteAttachmentExtension(mimeType) {
  return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[mimeType] || null;
}

function detectImageMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function noteAttachmentBytes(note) {
  return (note?.attachments || []).reduce((total, attachment) => total + Math.max(0, Number(attachment.size) || 0), 0);
}

function readStoragePointer() {
  return readStoragePointerState(storagePointerPath());
}

function storagePointerValue() {
  const pointer = readStoragePointer();
  if (pointer.state === 'corrupt') throw new Error(pointer.error);
  return pointer.value;
}

function configuredStorageState() {
  return resolveStorageState({
    pointerPath: storagePointerPath(),
    defaultFilePath: defaultDataFilePath(),
    dataFileName: DATA_FILE_NAME
  });
}

function storageRecoveryMessage(state) {
  if (state.state === 'pointer-corrupt') {
    return `存储位置记录无法解析。为避免误建空数据库，研迹没有回退到默认目录。\n\n${state.error || storagePointerPath()}`;
  }
  if (state.state === 'custom-missing-data') {
    return `已配置的数据目录存在，但其中没有 ${DATA_FILE_NAME}。为避免产生第二套空数据，研迹已暂停初始化。\n\n${state.configuredDirectory}`;
  }
  return `已配置的数据目录当前不可访问。请重新连接磁盘后重试，或明确选择其他数据。研迹没有创建新的空数据库。\n\n${state.configuredDirectory || state.error || ''}`;
}

function validateRecoveryDataFile(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  migrateData(parsed, DEFAULT_SETTINGS);
  return path.resolve(filePath);
}

async function selectExistingRecoveryDirectory() {
  const result = await dialog.showOpenDialog({
    title: '选择包含研迹数据的文件夹',
    buttonLabel: '使用此数据目录',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selectedDirectory = path.resolve(result.filePaths[0]);
  const selectedFile = path.join(selectedDirectory, DATA_FILE_NAME);
  validateRecoveryDataFile(selectedFile);
  writeStoragePointer(selectedDirectory, [], selectedFile, {});
  return configuredStorageState();
}

async function restoreBackupForRecovery() {
  const result = await dialog.showOpenDialog({
    title: '打开研迹 JSON 备份',
    buttonLabel: '从此备份恢复',
    filters: [{ name: '研迹 JSON 数据', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const sourceFile = validateRecoveryDataFile(result.filePaths[0]);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const recoveredDirectory = path.join(app.getPath('userData'), 'recovered-data', stamp);
  const recoveredFile = path.join(recoveredDirectory, DATA_FILE_NAME);
  fs.mkdirSync(recoveredDirectory, { recursive: true });
  fs.copyFileSync(sourceFile, recoveredFile, fs.constants.COPYFILE_EXCL);
  writeStoragePointer(recoveredDirectory, [], recoveredFile, {});
  return configuredStorageState();
}

async function recoverStorageLocation(initialState) {
  let state = initialState;
  while (!['default', 'custom-valid'].includes(state.state)) {
    const response = await dialog.showMessageBox({
      type: 'warning',
      title: '研迹需要恢复数据位置',
      message: '为保护原数据，研迹已暂停数据初始化',
      detail: storageRecoveryMessage(state),
      buttons: ['重试', '选择新的数据目录', '打开备份', '退出'],
      defaultId: 0,
      cancelId: 3,
      noLink: true
    });
    if (response.response === 3) return null;
    try {
      if (response.response === 0) state = configuredStorageState();
      if (response.response === 1) state = await selectExistingRecoveryDirectory() || state;
      if (response.response === 2) state = await restoreBackupForRecovery() || state;
    } catch (error) {
      dialog.showErrorBox('所选数据无法安全打开', error?.message || '请选择包含有效研迹数据的目录或备份。');
    }
  }
  return state;
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
  const pointer = storagePointerValue();
  return normalizeBackupFiles([...pointer.backupFiles, defaultDataFilePath()]);
}

function writeStoragePointer(
  directory,
  backupFiles = knownBackupFiles(),
  currentFile = path.join(directory, DATA_FILE_NAME),
  backupCreatedAt = storagePointerValue().backupCreatedAt
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
  const pointer = storagePointerValue();
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
  const pointer = storagePointerValue();
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
      portable: isPortableBuild(),
      updaterAvailable: Boolean(autoUpdater)
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

function initializeUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;
  updateState = createInitialUpdateState({
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortableBuild(),
    updaterAvailable: Boolean(autoUpdater)
  });
  if (updateState.status === 'unavailable') return;
  if (!autoUpdater) {
    console.error('[updater] Automatic updates are unavailable:', updaterLoadError);
    return;
  }

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
  if (!autoUpdater) return current;
  if (current.status === 'unavailable') return current;
  if (current.status === 'checking' || current.status === 'downloading') return current;
  try {
    const result = await autoUpdater.checkForUpdates();
    if (updateState.status === 'checking' && result?.updateInfo) {
      setUpdateState(result.isUpdateAvailable ? 'available' : 'not-available', result.updateInfo);
    }
    return updateStateForRenderer();
  } catch (error) {
    if (isNotPublishedError(error)) {
      setUpdateState('not-published', { error });
      return updateStateForRenderer();
    }
    if (updateState.status !== 'error') setUpdateState('error', { error });
    throw new Error(updateState.message);
  }
}

async function downloadAppUpdate() {
  if (!autoUpdater) throw new Error('自动更新组件不可用，请前往 GitHub Releases 手动更新。');
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
  if (!autoUpdater) throw new Error('自动更新组件不可用，请前往 GitHub Releases 手动更新。');
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
  fs.mkdirSync(nextStore.attachmentsDirectory, { recursive: true });

  const nextBackups = normalizeBackupFiles([...knownBackupFiles(), previousDataFile], targetFile);
  writeStoragePointer(selectedDirectory, nextBackups, targetFile);
  store = nextStore;
  planningService = createPlanningService({
    store,
    makeId: () => crypto.randomUUID(),
    onWorkspaceChanged: () => broadcastWorkspace()
  });
  updateLoginItemSetting(store.getSettings().startAtLogin);
  broadcastPapers();
  broadcastWorkspace();
  return { canceled: false, restartRequired: true, settings: settingsForRenderer() };
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

function todayWidgetForRenderer() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const settings = store.getSettings();
  const schedules = store.listSchedules()
    .filter((item) => {
      const start = Date.parse(item.startAt);
      const end = Date.parse(item.endAt || item.startAt);
      return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd.getTime() && end > dayStart.getTime();
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
    .map((item) => ({
      id: item.id,
      title: item.title,
      startAt: item.startAt,
      endAt: item.endAt,
      allDay: Boolean(item.allDay),
      priority: item.priority,
      sourceRef: item.sourceRef || null
    }));
  const todos = store.listTodos()
    .filter((item) => item.status === 'open' && (!item.dueAt || localDateKey(new Date(item.dueAt)) === localDateKey(now)))
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY) - (b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY))
    .slice(0, 12)
    .map((item) => ({ id: item.id, title: item.title, dueAt: item.dueAt, priority: item.priority, status: item.status }));
  return {
    date: localDateKey(now),
    schedules: settings.widgetShowSchedules !== false ? schedules : [],
    todos: settings.widgetShowTodos !== false ? todos : [],
    showCompletedTodos: settings.widgetShowCompletedTodos === true
  };
}

function workspaceForRenderer() {
  const activeAttendance = activeAttendanceRecord();
  return {
    schedules: [...store.listSchedules()].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    todos: [...store.listTodos()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    notes: [...store.listNotes()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    metadataFields: store.listMetadataFields(),
    attendance: [...store.listAttendance()]
      .map((record) => record.id === activeAttendance?.id ? { ...record, appUsage: { ...attendanceUsageLive } } : record)
      .sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.clockInAt) - Date.parse(a.clockInAt)),
    focusSessions: focusSessionsForRenderer(),
    jobApplications: [...store.listJobApplications()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  };
}

function broadcastWorkspace() {
  const workspace = workspaceForRenderer();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:changed', workspace);
  }
  if (scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) {
    scheduleWidgetWindow.webContents.send('today-widget:changed', todayWidgetForRenderer());
  }
  return workspace;
}

function broadcastSettings() {
  const settings = settingsForRenderer();
  for (const window of [mainWindow, quickCaptureWindow, scheduleWidgetWindow, ...stickyWindows.values()]) {
    if (window && !window.isDestroyed()) window.webContents.send('settings:changed', settings);
  }
  return settings;
}

function getPlanningService() {
  if (!planningService) throw new Error('规划服务尚未准备好，请稍后重试。');
  return planningService;
}

function saveWorkspaceSchedule(input) {
  if (planningService) return getPlanningService().saveSchedule(input);
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
  if (planningService) return getPlanningService().deleteSchedule(id);
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
  const requested = input && typeof input === 'object' ? { ...input } : {};
  const now = new Date().toISOString();
  const notes = store.listNotes();
  const existing = requested.id ? notes.find((item) => item.id === String(requested.id)) : null;
  if (requested.id && !existing) throw new Error('找不到这条笔记。');
  if (existing && requested.revision != null && Number(requested.revision) !== Number(existing.revision || 0)) {
    throw new Error('这条笔记已在其他窗口更新，请重新载入后再保存。');
  }

  // New quick captures and empty sticky notes are always attached to the
  // local-day record. The single-process lookup makes dateKey de-duplication
  // atomic across the main editor, sticky note and quick capture windows.
  if (!existing && requested.kind !== 'standalone') {
    const dateKey = requested.dateKey || localDateKey(new Date(now));
    const daily = notes.find((item) => item.kind === 'daily' && item.dateKey === dateKey);
    if (daily) {
      if (String(requested.content || '').length || (requested.attachments || []).length) {
        const entry = {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          content: String(requested.content || '').slice(0, 100_000),
          attachments: Array.isArray(requested.attachments) ? requested.attachments : []
        };
        const updated = normalizeNote({
          ...daily,
          entries: [...(daily.entries || []), entry],
          content: [...(daily.entries || []).map((item) => item.content), entry.content].filter(Boolean).join('\n\n'),
          updatedAt: now,
          revision: Number(daily.revision || 0) + 1
        }, 0, now);
        store.setNotes(notes.map((item) => item.id === daily.id ? updated : item));
        broadcastWorkspace();
        return updated;
      }
      return daily;
    }
    requested.kind = 'daily';
    requested.dateKey = dateKey;
    requested.title = requested.title || `${dateKey.slice(0, 4)}年${Number(dateKey.slice(5, 7))}月${Number(dateKey.slice(8, 10))}日`;
  }

  const savedNotes = saveNote(notes, {
    ...requested,
    revision: Number(existing?.revision || 0)
  }, now, () => crypto.randomUUID());
  const saved = savedNotes.find((item) => item.id === String(requested.id || savedNotes[0].id)) || savedNotes[0];
  store.setNotes(savedNotes);
  broadcastWorkspace();
  return saved;
}

function deleteWorkspaceNote(id) {
  const notes = store.listNotes();
  const target = notes.find((item) => item.id === id);
  if (!target) throw new Error('找不到这条笔记。');
  const staged = [];
  try {
    for (const attachment of target.attachments || []) {
      const source = safeStoredAttachmentPath(attachment.storedName);
      if (!fs.existsSync(source)) continue;
      const temporary = `${source}.delete-${crypto.randomUUID()}`;
      fs.renameSync(source, temporary);
      staged.push({ source, temporary });
    }
    store.setNotes(notes.filter((item) => item.id !== id));
  } catch (error) {
    for (const item of staged.reverse()) {
      try { if (fs.existsSync(item.temporary)) fs.renameSync(item.temporary, item.source); } catch { /* preserve the recoverable staged file */ }
    }
    throw new Error(`笔记删除失败，原记录仍保留：${error.message}`);
  }
  for (const item of staged) {
    try { fs.unlinkSync(item.temporary); } catch { /* orphaned delete staging remains recoverable */ }
  }
  const sticky = stickyWindows.get(id);
  if (sticky && !sticky.isDestroyed()) sticky.close();
  stickyWindows.delete(id);
  broadcastWorkspace();
  return true;
}

function deleteWorkspaceNoteIfEmpty(id) {
  const note = store.listNotes().find((item) => item.id === String(id || ''));
  if (!note || noteBodyHasContent(note)) return false;
  deleteWorkspaceNote(note.id);
  return true;
}

function saveWorkspaceJobApplication(input) {
  const requested = input && typeof input === 'object' ? { ...input } : {};
  const jobs = store.listJobApplications();
  const existing = requested.id ? jobs.find((item) => item.id === String(requested.id)) : null;
  if (requested.id && !existing) throw new Error('找不到这条求职记录。');
  if (existing && requested.revision != null && Number(requested.revision) !== Number(existing.revision || 0)) {
    throw new Error('这条求职记录已在其他窗口更新，请重新载入后再保存。');
  }
  const now = new Date().toISOString();
  const savedJobs = saveJobApplication(jobs, requested, now, () => crypto.randomUUID());
  const saved = savedJobs.find((item) => item.id === String(requested.id || savedJobs[0].id)) || savedJobs[0];
  store.setJobApplications(savedJobs);
  broadcastWorkspace();
  return saved;
}

function deleteWorkspaceJobApplication(id) {
  const jobs = deleteJobApplication(store.listJobApplications(), id);
  store.setJobApplications(jobs);
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

function saveWorkspaceTodo(input) {
  return getPlanningService().saveTodo(input);
}

function reconcileStaleAttendance(now = new Date()) {
  const before = store.listAttendance();
  const result = closeStaleAttendanceRecords(before, now, now.toISOString());
  if (!result.changed) return false;
  store.setAttendance(result.records);
  if (!result.records.some((record) => !record.clockOutAt)) {
    attendanceUsageLive = {};
    stopUsageSamplerIfIdle();
  }
  return true;
}

async function addNoteAttachment(noteId) {
  const id = String(noteId || '');
  const note = store.listNotes().find((item) => item.id === id);
  if (!note) throw new Error('请先保存笔记，再添加图片。');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '添加笔记图片',
    buttonLabel: '添加图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const sourcePath = path.resolve(result.filePaths[0]);
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_NOTE_ATTACHMENT_SIZE) {
    throw new Error(`图片大小必须在 1 字节至 ${Math.round(MAX_NOTE_ATTACHMENT_SIZE / 1024 / 1024)} MB 之间。`);
  }
  const bytes = fs.readFileSync(sourcePath);
  const mimeType = detectImageMime(bytes);
  const extension = noteAttachmentExtension(mimeType);
  if (!mimeType || !NOTE_ATTACHMENT_MIMES.includes(mimeType) || !extension) throw new Error('图片格式或文件签名无效，仅支持 PNG、JPEG、WebP、GIF。');
  if (noteAttachmentBytes(note) + stat.size > MAX_NOTE_ATTACHMENTS_TOTAL) {
    throw new Error(`单条笔记图片总大小不能超过 ${Math.round(MAX_NOTE_ATTACHMENTS_TOTAL / 1024 / 1024)} MB。`);
  }
  fs.mkdirSync(noteAttachmentsDirectory(), { recursive: true });
  const attachment = {
    id: crypto.randomUUID(),
    storedName: `${crypto.randomUUID()}.${extension}`,
    originalName: path.basename(sourcePath).slice(0, 240),
    mimeType,
    size: stat.size,
    createdAt: new Date().toISOString()
  };
  const target = safeStoredAttachmentPath(attachment.storedName);
  fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
  try {
    const updatedAt = new Date().toISOString();
    const updated = normalizeNote({
      ...note,
      attachments: [...(note.attachments || []), attachment],
      updatedAt,
      revision: Number(note.revision || 0) + 1
    }, 0, updatedAt);
    store.setNotes(store.listNotes().map((item) => item.id === note.id ? updated : item));
    broadcastWorkspace();
    return attachment;
  } catch (error) {
    try { fs.unlinkSync(target); } catch { /* leave no renderer-visible reference */ }
    throw error;
  }
}

function getNoteAttachment(noteId, attachmentId) {
  const note = store.listNotes().find((item) => item.id === String(noteId || ''));
  const attachment = note?.attachments?.find((item) => item.id === String(attachmentId || ''));
  if (!note || !attachment) throw new Error('找不到这张笔记图片。');
  const bytes = fs.readFileSync(safeStoredAttachmentPath(attachment.storedName));
  return { mimeType: attachment.mimeType, dataUrl: `data:${attachment.mimeType};base64,${bytes.toString('base64')}` };
}

function deleteNoteAttachment(noteId, attachmentId) {
  const notes = store.listNotes();
  const note = notes.find((item) => item.id === String(noteId || ''));
  const attachment = note?.attachments?.find((item) => item.id === String(attachmentId || ''));
  if (!note || !attachment) throw new Error('找不到这张笔记图片。');
  const source = safeStoredAttachmentPath(attachment.storedName);
  const temporary = `${source}.delete-${crypto.randomUUID()}`;
  if (fs.existsSync(source)) fs.renameSync(source, temporary);
  try {
    const updatedAt = new Date().toISOString();
    const updated = normalizeNote({
      ...note,
      attachments: (note.attachments || []).filter((item) => item.id !== attachment.id),
      entries: (note.entries || []).map((entry) => ({ ...entry, attachments: (entry.attachments || []).filter((item) => item.id !== attachment.id) })),
      updatedAt,
      revision: Number(note.revision || 0) + 1
    }, 0, updatedAt);
    store.setNotes(notes.map((item) => item.id === note.id ? updated : item));
  } catch (error) {
    try { if (fs.existsSync(temporary)) fs.renameSync(temporary, source); } catch { /* retain staged file for recovery */ }
    throw new Error(`图片删除失败，笔记仍保留：${error.message}`);
  }
  try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* recoverable orphan */ }
  broadcastWorkspace();
  return true;
}

function saveWorkspaceAttendance(input) {
  if (!input?.clockOutAt) reconcileStaleAttendance();
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
  const reconciled = reconcileStaleAttendance(now);
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
    if (!openRecord) {
      if (reconciled) broadcastWorkspace();
      throw new Error('当前没有进行中的上班记录。');
    }
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
    height: 222,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: createAppWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: true
    }
  });
  quickCaptureWindow.loadFile(path.join(__dirname, 'renderer', 'capture.html'), { query: { appearance: store.getSettings().appearanceTheme } });
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

async function focusStickyWindow(window) {
  if (!window || window.isDestroyed()) return;
  window.show();
  window.focus();
  if (typeof window.webContents.focus === 'function') window.webContents.focus();
  if (!window.webContents.isLoading()) window.webContents.send('sticky:focus');
}

async function openStickyNote(noteId) {
  const id = String(noteId || '');
  const note = store.listNotes().find((item) => item.id === id);
  if (!note) throw new Error('找不到这条笔记。');
  const existing = stickyWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    await focusStickyWindow(existing);
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
    icon: createAppWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  stickyWindows.set(id, window);
  await window.loadFile(path.join(__dirname, 'renderer', 'sticky.html'), { query: { id, appearance: store.getSettings().appearanceTheme } });
  await focusStickyWindow(window);
  window.on('closed', () => {
    stickyWindows.delete(id);
    try { deleteWorkspaceNoteIfEmpty(id); } catch (error) { console.warn(`[研迹] 空便笺清理失败: ${error.message}`); }
  });
  return true;
}

async function createNewStickyNote() {
  const now = new Date();
  const note = saveWorkspaceNote({ kind: 'daily', dateKey: localDateKey(now), content: '' });
  await openStickyNote(note.id);
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

  [DllImport("gdi32.dll", SetLastError = true)]
  private static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int widthEllipse, int heightEllipse);

  [DllImport("user32.dll", SetLastError = true)]
  private static extern int SetWindowRgn(IntPtr hWnd, IntPtr region, bool redraw);

  [DllImport("gdi32.dll")]
  private static extern bool DeleteObject(IntPtr value);

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
    if (!SetWindowPos(child, IntPtr.Zero, origin.X, origin.Y, targetWidth, targetHeight, flags)) return 4;
    IntPtr region = CreateRoundRectRgn(0, 0, targetWidth + 1, targetHeight + 1, 40, 40);
    if (region == IntPtr.Zero) return 5;
    if (SetWindowRgn(child, region, true) == 0) {
      DeleteObject(region);
      return 6;
    }
    return 0;
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

function desktopIconHelperPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'windows-desktop-icons.ps1');
  return path.join(__dirname, 'windows-desktop-icons.ps1');
}

function runDesktopIconHelper(operation, extraEnv = {}, { synchronous = false } = {}) {
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', desktopIconHelperPath()];
  const options = {
    windowsHide: true,
    env: { ...process.env, YANJI_DESKTOP_ICON_OPERATION: operation, ...extraEnv },
    encoding: 'utf8'
  };
  if (synchronous) return spawnSync('powershell.exe', args, { ...options, timeout: 8_000 });
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
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
      finish({ status: null, signal: 'TIMEOUT', stdout, stderr, error: new Error(`desktop icon ${operation} timed out`) });
    }, 8_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ status: null, signal: null, stdout, stderr, error }));
    child.on('close', (status, signal) => finish({ status, signal, stdout, stderr }));
  });
}

async function reserveDesktopIcons(window) {
  if (process.platform !== 'win32' || process.env.YANJI_DESKTOP_WIDGET_NO_ICON_REFLOW || process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) return { reserved: true, movedIcons: 0, snapshot: null };
  const result = await runDesktopIconHelper('reserve', { YANJI_DESKTOP_CHILD_HANDLE: nativeWindowHandleValue(window) });
  const match = String(result.stdout || '').match(/YANJI_DESKTOP_RESERVATION=([^\r\n]+)/);
  if (result.status !== 0 || !match) {
    console.warn(`[研迹] 桌面图标占位失败: ${String(result.stderr || result.error?.message || 'unknown').trim()}`);
    return { reserved: false, movedIcons: 0, snapshot: null };
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const movedIcons = decoded.includes('|') && decoded.split('|')[1] ? decoded.split('|')[1].split(';').filter(Boolean).length : 0;
  return { reserved: true, movedIcons, snapshot: match[1] };
}

async function restoreDesktopIcons() {
  const snapshot = desktopIconReservation;
  desktopIconReservation = null;
  if (!snapshot || process.platform !== 'win32') return true;
  const result = await runDesktopIconHelper('restore', { YANJI_DESKTOP_ICON_SNAPSHOT: snapshot });
  if (result.status !== 0) console.warn(`[研迹] 桌面图标位置恢复失败: ${String(result.stderr || result.error?.message || result.status).trim()}`);
  return result.status === 0;
}

function restoreDesktopIconsSync() {
  const snapshot = desktopIconReservation;
  desktopIconReservation = null;
  if (!snapshot || process.platform !== 'win32') return true;
  const result = runDesktopIconHelper('restore', { YANJI_DESKTOP_ICON_SNAPSHOT: snapshot }, { synchronous: true });
  return result.status === 0;
}

async function showScheduleWidget() {
  if (scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) {
    if (!scheduleWidgetWindow.isVisible()) scheduleWidgetWindow.showInactive();
    return desktopWidgetPresentation({
      attached: Boolean(scheduleWidgetWindow.yanjiDesktopAttached),
      reserved: Boolean(scheduleWidgetWindow.yanjiDesktopReserved),
      movedIcons: Number(scheduleWidgetWindow.yanjiMovedDesktopIcons) || 0,
      attempts: scheduleWidgetWindow.yanjiDesktopDiagnostic?.attempts || 0,
      supported: process.platform === 'win32'
    });
  }
  const display = screen.getPrimaryDisplay();
  const { workArea, scaleFactor } = display;
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
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    icon: createAppWindowIcon(),
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
    restoreDesktopIcons().catch(() => {});
    if (scheduleWidgetWindow === window) scheduleWidgetWindow = null;
  });
  await window.loadFile(path.join(__dirname, 'renderer', 'schedule-widget.html'), { query: { appearance: store.getSettings().appearanceTheme } });
  const targetSize = {
    width: Math.round(width * scaleFactor),
    height: Math.round(height * scaleFactor)
  };
  let attached = false;
  const diagnostics = [];
  for (let attempt = 1; attempt <= 3 && !attached; attempt += 1) {
    attached = await attachWindowToDesktop(window, targetSize);
    if (!attached) {
      diagnostics.push(`attempt-${attempt}-failed`);
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  window.yanjiDesktopAttached = attached;
  const reservation = attached ? await reserveDesktopIcons(window) : { reserved: false, movedIcons: 0, snapshot: null };
  desktopIconReservation = reservation.snapshot;
  window.yanjiDesktopReserved = reservation.reserved;
  window.yanjiMovedDesktopIcons = reservation.movedIcons;
  const widgetPresentation = desktopWidgetPresentation({ attached, reserved: reservation.reserved, movedIcons: reservation.movedIcons, attempts: diagnostics.length, supported: process.platform === 'win32' });
  window.yanjiDesktopDiagnostic = widgetPresentation.diagnostic;
  if (attached) {
    window.webContents.setZoomFactor(scaleFactor);
    await new Promise((resolve) => setTimeout(resolve, 80));
  } else {
    if (process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
      console.warn(`DESKTOP_WIDGET_STATE ${JSON.stringify(window.yanjiDesktopDiagnostic)}`);
    }
    window.close();
    return widgetPresentation;
  }
  window.showInactive();
  return widgetPresentation;
}

function showScheduleNotification(schedule) {
  if (!store.getSettings().notifications || !Notification.isSupported()) return;
  const notification = new Notification({
    title: schedule.priority === 'medium' ? '重要日程已到时间' : '日程提醒',
    body: schedule.title,
    urgency: schedule.priority === 'medium' ? 'critical' : 'normal',
    icon: APP_ICON_PNG_PATH
  });
  notification.on('click', () => {
    showMainWindow();
    mainWindow?.webContents.send('workspace:navigate', 'schedule');
  });
  notification.show();
}

function showDeadlineWindow(item, kind = 'todo', level = 'reminder') {
  const payload = normalizeReminderPayload(item, kind, level);
  const existing = deadlineWindows.get(payload.id);
  if (existing && [...existing].some((window) => !window.isDestroyed())) return;
  const urgent = payload.priority === 'high';
  const displays = urgent ? screen.getAllDisplays() : [screen.getDisplayNearestPoint(screen.getCursorScreenPoint())];
  const windows = new Set();
  deadlineWindows.set(payload.id, windows);
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
      icon: createAppWindowIcon(),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    window.yanjiDeadlineId = payload.id;
    window.yanjiDeadlineKind = kind;
    windows.add(window);
    window.loadFile(path.join(__dirname, 'renderer', 'deadline.html'), { query: { appearance: store.getSettings().appearanceTheme } });
    window.webContents.once('did-finish-load', () => {
      window.webContents.send('deadline:show', payload);
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      window.show();
      if (index === 0) window.focus();
    });
    window.on('closed', () => {
      windows.delete(window);
      if (!windows.size) deadlineWindows.delete(payload.id);
    });
  });
}

function dismissDeadlineWindows(id) {
  const windows = deadlineWindows.get(id);
  if (!windows) return;
  for (const window of [...windows]) if (!window.isDestroyed()) window.close();
  deadlineWindows.delete(id);
}

function showTodoNotification(todo, level = 'reminder') {
  if (!store.getSettings().notifications || !store.getSettings().todoNotifications || !Notification.isSupported()) return;
  const payload = normalizeReminderPayload(todo, 'todo', level);
  const overdue = payload.overdue;
  const dueText = payload.scheduledAt
    ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(payload.scheduledAt))
    : '无截止时间';
  const notification = new Notification({
    title: overdue ? '待办已逾期' : '待办提醒',
    body: `${payload.title}${overdue ? ' 已逾期' : ` · ${dueText}`}`,
    urgency: payload.priority === 'high' ? 'critical' : 'normal',
    icon: APP_ICON_PNG_PATH
  });
  notification.on('click', () => {
    showMainWindow();
    mainWindow?.webContents.send('workspace:navigate', { page: 'todos', todoId: payload.id });
  });
  notification.show();
}

function stickyNoteForRenderer(noteId) {
  const id = String(noteId || '');
  const note = store.listNotes().find((item) => item.id === id);
  if (!note) return null;
  const latestEntry = note.kind === 'daily' ? note.entries?.at(-1) : null;
  return {
    id: note.id,
    title: note.title,
    content: latestEntry?.content ?? note.content,
    entryId: latestEntry?.id || null,
    revision: note.revision || 0,
    kind: note.kind
  };
}

function runWorkspaceReminders(now = new Date()) {
  const candidates = collectReminderCandidates({
    schedules: store.listSchedules(),
    todos: store.listTodos(),
    now,
    settings: store.getSettings()
  });
  if (!candidates.length) return [];
  for (const candidate of candidates) {
    if (candidate.type === 'event') {
      const presentation = reminderPresentation(candidate.item, 'schedule');
      if (presentation === 'fullscreen' || presentation === 'overlay') showDeadlineWindow(candidate.item, 'schedule');
      else showScheduleNotification(candidate.item);
      store.updateWorkspace((workspace) => {
        workspace.schedules = workspace.schedules.map((item) => item.id === candidate.item.id
          ? { ...item, reminderSentAt: now.toISOString(), updatedAt: now.toISOString() }
          : item);
        return workspace;
      });
      continue;
    }
    const todo = candidate.item;
    if (reminderPresentation(todo, 'todo') === 'fullscreen') showDeadlineWindow(todo, 'todo', candidate.level);
    else showTodoNotification(todo, candidate.level);
    store.updateWorkspace((workspace) => {
      workspace.todos = workspace.todos.map((item) => item.id === todo.id
        ? {
            ...item,
            ...(candidate.level === 'overdue' ? { overdueNotifiedAt: now.toISOString() } : { reminderSentAt: now.toISOString(), snoozedUntil: null }),
            updatedAt: now.toISOString()
          }
        : item);
      return workspace;
    });
  }
  broadcastWorkspace();
  return candidates;
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
    icon: APP_ICON_PNG_PATH,
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
  for (const key of [
    'autoRefresh', 'refreshOnStartup', 'notifications', 'closeToTray', 'startAtLogin', 'autoCheckUpdates',
    'todayWidgetEnabled', 'scheduleWidgetEnabled', 'widgetShowSchedules', 'widgetShowTodos',
    'widgetShowCompletedTodos', 'eventNotifications', 'todoNotifications'
  ]) {
    if (key in patch) allowed[key] = Boolean(patch[key]);
  }
  if (allowed.notifications === false) {
    allowed.eventNotifications = false;
    allowed.todoNotifications = false;
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
  if ('appearanceTheme' in patch) {
    const theme = String(patch.appearanceTheme || '').trim();
    if (!['liquid-glass', 'classic'].includes(theme)) throw new Error('外观主题不受支持。');
    allowed.appearanceTheme = theme;
  }
  if ('defaultEventReminderMinutes' in patch) {
    const minutes = patch.defaultEventReminderMinutes == null ? null : Number(patch.defaultEventReminderMinutes);
    if (![null, 0, 5, 10, 15, 30, 60, 1440].includes(minutes)) throw new Error('日程提醒时间不受支持。');
    allowed.defaultEventReminderMinutes = minutes;
  }
  if ('defaultTodoReminderMode' in patch) {
    const mode = String(patch.defaultTodoReminderMode || 'none');
    if (!['none', 'at-due', '15m-before', '1h-before', '1d-before', 'custom'].includes(mode)) throw new Error('待办提醒方式不受支持。');
    allowed.defaultTodoReminderMode = mode;
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
    show: !process.argv.includes('--hidden'),
    backgroundColor: '#edf7fc',
    title: APP_NAME,
    icon: createAppWindowIcon(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR_NORMAL,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      backgroundThrottling: true
    }
  });

  mainWindow.setIcon(createAppWindowIcon());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { appearance: store.getSettings().appearanceTheme } });
  mainWindow.webContents.once('did-finish-load', () => {
    const startsHidden = process.argv.includes('--hidden');
    if (!startsHidden) {
      if (!mainWindow.isMaximized()) mainWindow.maximize();
      mainWindow.show();
    } else {
      scheduleHiddenMainWindowRelease();
    }
    if (coldStartRefreshStarted || !store.getSettings().refreshOnStartup) return;
    coldStartRefreshStarted = true;
    setTimeout(() => refreshAll({ notify: true }).catch(() => {}), 900);
  });
  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      if (!mainWindow.isMaximized()) mainWindow.maximize();
      mainWindow.show();
    }
  });
  mainWindow.on('close', (event) => {
    const widgetKeepsHostAlive = Boolean(scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) || store.getSettings().todayWidgetEnabled === true;
    if (!isQuitting && tray && (store.getSettings().closeToTray || widgetKeepsHostAlive)) {
      event.preventDefault();
      mainWindow.hide();
      mainWindow.webContents.setAudioMuted(true);
      scheduleHiddenMainWindowRelease();
    } else if (!isQuitting) {
      isQuitting = true;
    }
  });
  mainWindow.on('closed', () => {
    clearTimeout(mainWindowReleaseTimer);
    mainWindowReleaseTimer = null;
    mainWindow = null;
  });
}

function scheduleHiddenMainWindowRelease() {
  clearTimeout(mainWindowReleaseTimer);
  const candidate = mainWindow;
  mainWindowReleaseTimer = setTimeout(() => {
    mainWindowReleaseTimer = null;
    if (!isQuitting && candidate && !candidate.isDestroyed() && !candidate.isVisible()) candidate.destroy();
  }, 30_000);
  mainWindowReleaseTimer.unref?.();
}

function createTrayIcon() {
  return nativeImage
    .createFromPath(APP_ICON_PNG_PATH)
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
  clearTimeout(mainWindowReleaseTimer);
  mainWindowReleaseTimer = null;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.webContents.setAudioMuted(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isMaximized()) mainWindow.maximize();
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
      icon: APP_ICON_PNG_PATH
    });
    notification.on('click', showMainWindow);
    notification.show();
    store.updatePaper(paper.id, (current) => markTaskReminded(current, task.id, urgency.state, now));
  }
  if (reminders.length) broadcastPapers();
  return reminders;
}

async function runScheduledWork() {
  if (reconcileStaleAttendance()) broadcastWorkspace();
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
  ipcMain.handle('workspace:get', () => {
    reconcileStaleAttendance();
    return workspaceForRenderer();
  });
  ipcMain.handle('today-widget:get-data', () => todayWidgetForRenderer());
  ipcMain.handle('schedules:parse', (_event, input) => parseNaturalLanguageSchedules(input, new Date()));
  ipcMain.handle('schedules:save', (_event, input) => getPlanningService().saveSchedule(input));
  ipcMain.handle('schedules:delete', (_event, id) => deleteWorkspaceSchedule(String(id)));
  ipcMain.handle('schedules:complete', (_event, id, completed) => setWorkspaceScheduleCompleted(String(id), Boolean(completed)));
  ipcMain.handle('schedules:convert-to-todo', (_event, id, input) => getPlanningService().convertScheduleToTodo(String(id), input || {}));
  ipcMain.handle('schedules:detach', (_event, id) => getPlanningService().detachSchedule(String(id)));
  ipcMain.handle('todos:parse', (_event, input) => parseNaturalLanguageTodo(input, new Date()));
  ipcMain.handle('todos:save', (_event, input) => getPlanningService().saveTodo(input));
  ipcMain.handle('todos:delete', (_event, id) => getPlanningService().deleteTodo(String(id)));
  ipcMain.handle('todos:complete', (_event, id) => getPlanningService().completeTodo(String(id)));
  ipcMain.handle('todos:reopen', (_event, id) => getPlanningService().reopenTodo(String(id)));
  ipcMain.handle('todos:cancel', (_event, id) => getPlanningService().cancelTodo(String(id)));
  ipcMain.handle('todos:snooze', (_event, id, until) => getPlanningService().snoozeTodo(String(id), until));
  ipcMain.handle('todos:get-linked-schedules', (_event, id) => getPlanningService().getLinkedSchedules(String(id)));
  ipcMain.handle('todos:schedule', (_event, id, input) => getPlanningService().scheduleTodo(String(id), input || {}));
  ipcMain.handle('todos:convert-to-schedule', (_event, id, input) => getPlanningService().convertTodoToSchedule(String(id), input || {}));
  ipcMain.handle('schedule-widget:show', async () => {
    const result = await showScheduleWidget();
    store.updateSettings({ todayWidgetEnabled: result.attached, scheduleWidgetEnabled: result.attached });
    broadcastSettings();
    return result;
  });
  ipcMain.handle('schedule-widget:close', (event) => {
    store.updateSettings({ todayWidgetEnabled: false, scheduleWidgetEnabled: false });
    broadcastSettings();
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
  ipcMain.handle('notes:delete-if-empty', (_event, id) => deleteWorkspaceNoteIfEmpty(String(id)));
  ipcMain.handle('notes:add-attachment', (_event, id) => addNoteAttachment(String(id)));
  ipcMain.handle('notes:get-attachment', (_event, id, attachmentId) => getNoteAttachment(String(id), String(attachmentId)));
  ipcMain.handle('notes:delete-attachment', (_event, id, attachmentId) => deleteNoteAttachment(String(id), String(attachmentId)));
  ipcMain.handle('notes:open-sticky', (_event, id) => openStickyNote(String(id)));
  ipcMain.handle('notes:get-sticky', (_event, id) => stickyNoteForRenderer(String(id)));
  ipcMain.handle('notes:create-sticky', () => createNewStickyNote());
  ipcMain.handle('jobs:save', (_event, input) => saveWorkspaceJobApplication(input));
  ipcMain.handle('jobs:delete', (_event, id) => deleteWorkspaceJobApplication(String(id)));
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
    if (input?.mode === 'todo') {
      const parsed = parseNaturalLanguageTodo(input?.content, new Date());
      if (!parsed.valid) throw new Error(parsed.warning || '没有识别到可创建的待办。');
      const item = getPlanningService().saveTodo(parsed);
      return { mode: 'todo', item };
    }
    const parsed = parseNaturalLanguageSchedules(input?.content, new Date());
    if (!parsed.valid) throw new Error('没有识别到可创建的日程。');
    const items = parsed.schedules.map((schedule) => saveWorkspaceSchedule(schedule));
    return { mode: 'schedule', item: items[0], items };
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
  ipcMain.handle('deadline:snooze', (event, until) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.yanjiDeadlineKind === 'todo') {
      const result = getPlanningService().snoozeTodo(window.yanjiDeadlineId, until);
      dismissDeadlineWindows(window.yanjiDeadlineId);
      return result;
    }
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
  ipcMain.handle('settings:update', async (_event, patch) => {
    const validated = validateSettings(patch);
    const previousSettings = store.getSettings();
    if ('quickCaptureShortcut' in validated || 'stickyNoteShortcut' in validated) {
      const registered = registerWorkbenchShortcuts({ ...previousSettings, ...validated });
      if (!registered) {
        registerWorkbenchShortcuts(previousSettings, { allowFallback: true });
        throw new Error('快捷键无效、重复或已被其他软件占用，请更换后重试。');
      }
    }
    let updated = store.updateSettings(validated);
    const widgetSettingChanged = 'todayWidgetEnabled' in validated
      && Boolean(previousSettings.todayWidgetEnabled) !== Boolean(validated.todayWidgetEnabled);
    if (widgetSettingChanged && validated.todayWidgetEnabled) {
      const result = await showScheduleWidget();
      if (!result.attached) updated = store.updateSettings({ todayWidgetEnabled: false, scheduleWidgetEnabled: false });
    } else if (widgetSettingChanged && scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) {
      scheduleWidgetWindow.close();
    }
    updateLoginItemSetting(updated.startAtLogin);
    broadcastSettings();
    if (Object.keys(validated).some((key) => ['todayWidgetEnabled', 'scheduleWidgetEnabled', 'widgetShowSchedules', 'widgetShowTodos', 'widgetShowCompletedTodos'].includes(key))) broadcastWorkspace();
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
  ipcMain.handle('system:restart-app', () => {
    isQuitting = true;
    app.relaunch();
    app.exit(0);
    return true;
  });
  ipcMain.handle('window:set-modal-state', (_event, active) => {
    setModalTitleBar(Boolean(active));
    return true;
  });
}

if (process.env.YANJI_QA_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.YANJI_QA_USER_DATA));
} else {
  app.setPath('userData', resolveStableUserDataPath(app.getPath('appData')));
}

// Set the Windows identity before the single-instance lock and before any
// BrowserWindow exists, so taskbar grouping resolves the packaged Yanji icon
// instead of inheriting Electron's executable identity.
app.setName('研迹');
app.setAppUserModelId(APP_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(async () => {
    try {
      const resolvedStorage = await recoverStorageLocation(configuredStorageState());
      if (!resolvedStorage) {
        isQuitting = true;
        app.quit();
        return;
      }
      store = new JsonStore(resolvedStorage.filePath);
      store.load();
      planningService = createPlanningService({
        store,
        makeId: () => crypto.randomUUID(),
        onWorkspaceChanged: () => broadcastWorkspace()
      });
      reconcileStaleAttendance();
      cleanupExpiredBackups();
      initializeUpdater();
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
      if ((store.getSettings().todayWidgetEnabled || store.getSettings().scheduleWidgetEnabled) && !process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
        setTimeout(() => showScheduleWidget().catch(() => {}), 900);
      }
      if (process.env.YANJI_DESKTOP_WIDGET_SMOKE_OUTPUT) {
        const result = await showScheduleWidget();
        mainWindow.close();
        await new Promise((resolve) => setTimeout(resolve, 120));
        const persistsWithoutMainWindow = !mainWindow.isVisible() && Boolean(scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed() && scheduleWidgetWindow.isVisible());
        const bounds = scheduleWidgetWindow.getBounds();
        const [contentWidth, contentHeight] = scheduleWidgetWindow.getContentSize();
        const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
        const layout = await scheduleWidgetWindow.webContents.executeJavaScript(`(() => { const close = document.getElementById('closeWidgetButton').getBoundingClientRect(); const footer = document.querySelector('footer').getBoundingClientRect(); return { innerWidth, innerHeight, closeRight: close.right, footerBottom: footer.bottom }; })()`);
        const expectedWidth = Math.round(360 * scaleFactor);
        const expectedHeight = Math.round(480 * scaleFactor);
        console.log(`DESKTOP_WIDGET_ATTACH_OK ${JSON.stringify({ attached: result.attached, reserved: result.reserved, movedIcons: result.movedIcons, persistsWithoutMainWindow, scaleFactor, contentWidth, contentHeight, outerWidth: bounds.width, outerHeight: bounds.height, layout, alwaysOnTop: scheduleWidgetWindow.isAlwaysOnTop(), skipTaskbar: true })}`);
        if (!result.attached || !result.reserved || !persistsWithoutMainWindow || contentWidth !== expectedWidth || contentHeight !== expectedHeight || Math.abs(layout.innerWidth - 360) > 1 || Math.abs(layout.innerHeight - 480) > 1 || layout.closeRight > layout.innerWidth || layout.footerBottom > layout.innerHeight || scheduleWidgetWindow.isAlwaysOnTop()) {
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
  restoreDesktopIconsSync();
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
  const widgetKeepsHostAlive = Boolean(scheduleWidgetWindow && !scheduleWidgetWindow.isDestroyed()) || store?.getSettings().todayWidgetEnabled === true;
  if (process.platform !== 'darwin' && (isQuitting || (!store?.getSettings().closeToTray && !widgetKeepsHostAlive) || !tray)) {
    isQuitting = true;
    app.quit();
  }
});

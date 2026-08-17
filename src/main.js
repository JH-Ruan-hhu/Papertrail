'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  safeStorage,
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

const APP_NAME = 'PaperTrail';
const MAX_HISTORY = 100;
const FETCH_TIMEOUT_MS = 20_000;
const DATA_FILE_NAME = 'papertrail-data.json';
const STORAGE_POINTER_NAME = 'papertrail-storage.json';
const RELEASES_URL = 'https://github.com/JH-Ruan-hhu/Papertrail/releases/latest';
const TITLE_BAR_NORMAL = Object.freeze({ color: '#f2f5f9', symbolColor: '#526071', height: 42 });
const TITLE_BAR_MODAL = Object.freeze({ color: '#747e8b', symbolColor: '#e8edf4', height: 42 });

let mainWindow;
let tray;
let store;
let scheduler;
let isQuitting = false;
let coldStartRefreshStarted = false;
let updateState;
let updaterInitialized = false;
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
      backupFiles: Array.isArray(pointer?.backupFiles) ? pointer.backupFiles.map(String) : []
    };
  } catch {
    return { dataDirectory: '', backupFiles: [] };
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
  currentFile = path.join(directory, DATA_FILE_NAME)
) {
  const pointerPath = storagePointerPath();
  const temporaryPath = `${pointerPath}.tmp`;
  fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify({
    dataDirectory: directory,
    backupFiles: normalizeBackupFiles(backupFiles, currentFile)
  }, null, 2), 'utf8');
  fs.renameSync(temporaryPath, pointerPath);
}

function settingsForRenderer() {
  const dataDirectory = path.dirname(store.filePath);
  const backupFiles = knownBackupFiles();
  return {
    ...store.getSettings(),
    appVersion: app.getVersion(),
    dataDirectory,
    backupCount: backupFiles.length,
    backupFiles,
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

async function chooseDataDirectory() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 PaperTrail 数据存储文件夹',
    defaultPath: path.dirname(store.filePath),
    buttonLabel: '使用此文件夹',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true, settings: settingsForRenderer() };
  }

  const selectedDirectory = path.resolve(result.filePaths[0]);
  const targetFile = path.join(selectedDirectory, DATA_FILE_NAME);
  if (path.resolve(targetFile) === path.resolve(store.filePath)) {
    return { canceled: false, settings: settingsForRenderer() };
  }

  const previousDataFile = path.resolve(store.filePath);
  let nextStore;
  if (fs.existsSync(targetFile)) {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: '发现已有 PaperTrail 数据',
      message: '所选文件夹中已有 PaperTrail 数据，是否切换到这份数据？',
      detail: '当前使用的数据不会被删除，仍会保留在原文件夹中。',
      buttons: ['使用已有数据', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    });
    if (choice.response !== 0) {
      return { canceled: true, settings: settingsForRenderer() };
    }
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

async function deleteDataBackups() {
  const backupFiles = knownBackupFiles();
  if (!backupFiles.length) {
    return { canceled: false, deletedCount: 0, settings: settingsForRenderer() };
  }
  const choice = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '删除旧数据备份',
    message: `确定删除 ${backupFiles.length} 份旧数据备份吗？`,
    detail: `${backupFiles.join('\n')}\n\n当前正在使用的数据不会被删除，此操作无法撤销。`,
    buttons: ['取消', '删除备份'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (choice.response !== 1) {
    return { canceled: true, deletedCount: 0, settings: settingsForRenderer() };
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
  for (const key of ['autoRefresh', 'refreshOnStartup', 'notifications', 'closeToTray', 'startAtLogin']) {
    if (key in patch) allowed[key] = Boolean(patch[key]);
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
    backgroundColor: '#f3f6fb',
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
    { label: '打开 PaperTrail', click: showMainWindow },
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
  const safeTitle = String(paper.snapshot?.title || 'PaperTrail-timeline')
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
    const updated = store.updateSettings(validateSettings(patch));
    updateLoginItemSetting(updated.startAtLogin);
    return settingsForRenderer();
  });
  ipcMain.handle('settings:choose-data-directory', () => chooseDataDirectory());
  ipcMain.handle('settings:delete-data-backups', () => deleteDataBackups());
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
  ipcMain.handle('window:set-modal-state', (_event, active) => {
    setModalTitleBar(Boolean(active));
    return true;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    try {
      app.setAppUserModelId('io.papertrail.desktop');
      store = new JsonStore(configuredDataFilePath());
      store.load();
      setupAutoUpdater();
      registerIpc();
      createWindow();
      createTray();
      updateLoginItemSetting(store.getSettings().startAtLogin);
      scheduler = setInterval(() => runScheduledWork().catch(() => {}), 60_000);
      setTimeout(runDeadlineReminders, 1500);
    } catch (error) {
      dialog.showErrorBox('PaperTrail 无法安全打开数据', error?.message || '数据文件损坏或格式不受支持。');
      isQuitting = true;
      app.quit();
    }
  });
}

app.on('activate', showMainWindow);
app.on('before-quit', () => {
  isQuitting = true;
  if (scheduler) clearInterval(scheduler);
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (isQuitting || !store?.getSettings().closeToTray || !tray)) {
    isQuitting = true;
    app.quit();
  }
});

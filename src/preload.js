'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paperTrail', {
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  parseSchedule: (input) => ipcRenderer.invoke('schedules:parse', input),
  saveSchedule: (input) => ipcRenderer.invoke('schedules:save', input),
  deleteSchedule: (id) => ipcRenderer.invoke('schedules:delete', id),
  completeSchedule: (id, completed) => ipcRenderer.invoke('schedules:complete', id, completed),
  saveNote: (input) => ipcRenderer.invoke('notes:save', input),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  openStickyNote: (id) => ipcRenderer.invoke('notes:open-sticky', id),
  saveMetadataFields: (fields) => ipcRenderer.invoke('metadata:save-fields', fields),
  clockAttendance: (action) => ipcRenderer.invoke('attendance:clock', action),
  saveAttendance: (input) => ipcRenderer.invoke('attendance:save', input),
  deleteAttendance: (id) => ipcRenderer.invoke('attendance:delete', id),
  getFocusState: () => ipcRenderer.invoke('focus:get-state'),
  startFocus: (input) => ipcRenderer.invoke('focus:start', input),
  stopFocus: () => ipcRenderer.invoke('focus:stop'),
  getBingWallpaper: () => ipcRenderer.invoke('wallpaper:get'),
  showCapture: () => ipcRenderer.invoke('capture:show'),
  hideCapture: () => ipcRenderer.invoke('capture:hide'),
  setCaptureContentState: (hasContent) => ipcRenderer.send('capture:content-state', Boolean(hasContent)),
  submitCapture: (input) => ipcRenderer.invoke('capture:submit', input),
  closeSticky: () => ipcRenderer.invoke('sticky:close'),
  setStickyAlwaysOnTop: (enabled) => ipcRenderer.invoke('sticky:set-always-on-top', enabled),
  dismissDeadline: () => ipcRenderer.invoke('deadline:dismiss'),
  listPapers: () => ipcRenderer.invoke('papers:list'),
  addPaper: (payload) => ipcRenderer.invoke('papers:add', payload),
  refreshPaper: (id) => ipcRenderer.invoke('papers:refresh', id),
  refreshAll: () => ipcRenderer.invoke('papers:refresh-all'),
  markPaperRead: (id) => ipcRenderer.invoke('papers:mark-read', id),
  markAllRead: () => ipcRenderer.invoke('papers:mark-all-read'),
  archivePaper: (id) => ipcRenderer.invoke('papers:archive', id),
  restorePaper: (id) => ipcRenderer.invoke('papers:restore', id),
  linkPaperJourney: (id, targetId) => ipcRenderer.invoke('papers:link-journey', id, targetId),
  unlinkPaperJourney: (id) => ipcRenderer.invoke('papers:unlink-journey', id),
  exportPaper: (id, format) => ipcRenderer.invoke('papers:export', id, format),
  updatePaperDetails: (id, details) => ipcRenderer.invoke('papers:update-details', id, details),
  saveTask: (id, input) => ipcRenderer.invoke('tasks:save', id, input),
  completeTask: (id, taskId, completed) => ipcRenderer.invoke('tasks:complete', id, taskId, completed),
  deleteTask: (id, taskId) => ipcRenderer.invoke('tasks:delete', id, taskId),
  saveRevision: (id, input) => ipcRenderer.invoke('revisions:save', id, input),
  deleteRevision: (id, revisionId) => ipcRenderer.invoke('revisions:delete', id, revisionId),
  removePaper: (id) => ipcRenderer.invoke('papers:remove', id),
  openTrackingPage: (id) => ipcRenderer.invoke('papers:open-tracking', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseDataDirectory: (request) => ipcRenderer.invoke('settings:choose-data-directory', request),
  deleteDataBackups: (confirmed = false) => ipcRenderer.invoke('settings:delete-data-backups', Boolean(confirmed)),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openUpdateReleasePage: () => ipcRenderer.invoke('updates:open-release-page'),
  copyText: (text) => ipcRenderer.invoke('system:copy-text', text),
  setModalWindowState: (active) => ipcRenderer.invoke('window:set-modal-state', Boolean(active)),
  onPapersChanged: (callback) => {
    const listener = (_event, papers) => callback(papers);
    ipcRenderer.on('papers:changed', listener);
    return () => ipcRenderer.removeListener('papers:changed', listener);
  },
  onRefreshState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('refresh:state', listener);
    return () => ipcRenderer.removeListener('refresh:state', listener);
  },
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onWorkspaceChanged: (callback) => {
    const listener = (_event, workspace) => callback(workspace);
    ipcRenderer.on('workspace:changed', listener);
    return () => ipcRenderer.removeListener('workspace:changed', listener);
  },
  onWorkspaceNavigate: (callback) => {
    const listener = (_event, page) => callback(page);
    ipcRenderer.on('workspace:navigate', listener);
    return () => ipcRenderer.removeListener('workspace:navigate', listener);
  },
  onFocusChanged: (callback) => {
    const listener = (_event, sessions) => callback(sessions);
    ipcRenderer.on('focus:changed', listener);
    return () => ipcRenderer.removeListener('focus:changed', listener);
  },
  onCaptureFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('capture:focus', listener);
    return () => ipcRenderer.removeListener('capture:focus', listener);
  },
  onDeadlineShow: (callback) => {
    const listener = (_event, schedule) => callback(schedule);
    ipcRenderer.on('deadline:show', listener);
    return () => ipcRenderer.removeListener('deadline:show', listener);
  }
});

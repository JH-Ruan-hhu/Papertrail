'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paperTrail', {
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  getTodayWidgetData: () => ipcRenderer.invoke('today-widget:get-data'),
  parseSchedule: (input) => ipcRenderer.invoke('schedules:parse', input),
  saveSchedule: (input) => ipcRenderer.invoke('schedules:save', input),
  deleteSchedule: (id) => ipcRenderer.invoke('schedules:delete', id),
  convertScheduleToTodo: (id, input) => ipcRenderer.invoke('schedules:convert-to-todo', id, input),
  detachSchedule: (id) => ipcRenderer.invoke('schedules:detach', id),
  parseTodo: (input) => ipcRenderer.invoke('todos:parse', input),
  saveTodo: (input) => ipcRenderer.invoke('todos:save', input),
  deleteTodo: (id) => ipcRenderer.invoke('todos:delete', id),
  completeTodo: (id) => ipcRenderer.invoke('todos:complete', id),
  reopenTodo: (id) => ipcRenderer.invoke('todos:reopen', id),
  cancelTodo: (id) => ipcRenderer.invoke('todos:cancel', id),
  snoozeTodo: (id, until) => ipcRenderer.invoke('todos:snooze', id, until),
  getLinkedSchedules: (id) => ipcRenderer.invoke('todos:get-linked-schedules', id),
  scheduleTodo: (id, input) => ipcRenderer.invoke('todos:schedule', id, input),
  convertTodoToSchedule: (id, input) => ipcRenderer.invoke('todos:convert-to-schedule', id, input),
  showScheduleWidget: () => ipcRenderer.invoke('schedule-widget:show'),
  closeScheduleWidget: () => ipcRenderer.invoke('schedule-widget:close'),
  openScheduleWidgetMain: () => ipcRenderer.invoke('schedule-widget:open-main'),
  saveNote: (input) => ipcRenderer.invoke('notes:save', input),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  deleteNoteIfEmpty: (id) => ipcRenderer.invoke('notes:delete-if-empty', id),
  addNoteAttachment: (id) => ipcRenderer.invoke('notes:add-attachment', id),
  getNoteAttachment: (id, attachmentId) => ipcRenderer.invoke('notes:get-attachment', id, attachmentId),
  deleteNoteAttachment: (id, attachmentId) => ipcRenderer.invoke('notes:delete-attachment', id, attachmentId),
  openStickyNote: (id) => ipcRenderer.invoke('notes:open-sticky', id),
  getStickyNote: (id) => ipcRenderer.invoke('notes:get-sticky', id),
  createStickyNote: () => ipcRenderer.invoke('notes:create-sticky'),
  saveJobApplication: (input) => ipcRenderer.invoke('jobs:save', input),
  deleteJobApplication: (id) => ipcRenderer.invoke('jobs:delete', id),
  saveMetadataFields: (fields) => ipcRenderer.invoke('metadata:save-fields', fields),
  clockAttendance: (action) => ipcRenderer.invoke('attendance:clock', action),
  saveAttendance: (input) => ipcRenderer.invoke('attendance:save', input),
  deleteAttendance: (id) => ipcRenderer.invoke('attendance:delete', id),
  getFocusState: () => ipcRenderer.invoke('focus:get-state'),
  startFocus: (input) => ipcRenderer.invoke('focus:start', input),
  stopFocus: () => ipcRenderer.invoke('focus:stop'),
  showCapture: () => ipcRenderer.invoke('capture:show'),
  hideCapture: () => ipcRenderer.invoke('capture:hide'),
  setCaptureContentState: (hasContent) => ipcRenderer.send('capture:content-state', Boolean(hasContent)),
  submitCapture: (input) => ipcRenderer.invoke('capture:submit', input),
  closeSticky: () => ipcRenderer.invoke('sticky:close'),
  setStickyAlwaysOnTop: (enabled) => ipcRenderer.invoke('sticky:set-always-on-top', enabled),
  dismissDeadline: () => ipcRenderer.invoke('deadline:dismiss'),
  snoozeDeadline: (until) => ipcRenderer.invoke('deadline:snooze', until),
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
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  restartApp: () => ipcRenderer.invoke('system:restart-app'),
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
  onTodayWidgetChanged: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('today-widget:changed', listener);
    return () => ipcRenderer.removeListener('today-widget:changed', listener);
  },
  onSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.removeListener('settings:changed', listener);
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
  onStickyFocus: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('sticky:focus', listener);
    return () => ipcRenderer.removeListener('sticky:focus', listener);
  },
  onDeadlineShow: (callback) => {
    const listener = (_event, schedule) => callback(schedule);
    ipcRenderer.on('deadline:show', listener);
    return () => ipcRenderer.removeListener('deadline:show', listener);
  },
  // Namespaced aliases mirror the v1.1 contract while the flat methods above
  // preserve the existing PaperTrail renderer API.
  todos: {
    parse: (input) => ipcRenderer.invoke('todos:parse', input),
    save: (input) => ipcRenderer.invoke('todos:save', input),
    delete: (id) => ipcRenderer.invoke('todos:delete', id),
    setCompleted: (id, completed = true) => ipcRenderer.invoke(completed ? 'todos:complete' : 'todos:reopen', id),
    setCancelled: (id, cancelled = true) => ipcRenderer.invoke(cancelled ? 'todos:cancel' : 'todos:reopen', id),
    schedule: (id, input) => ipcRenderer.invoke('todos:schedule', id, input),
    convertToSchedule: (id, input) => ipcRenderer.invoke('todos:convert-to-schedule', id, input),
    getLinkedSchedules: (id) => ipcRenderer.invoke('todos:get-linked-schedules', id)
  },
  schedules: {
    convertToTodo: (id, input) => ipcRenderer.invoke('schedules:convert-to-todo', id, input)
  }
});

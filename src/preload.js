'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paperTrail', {
  listPapers: () => ipcRenderer.invoke('papers:list'),
  addPaper: (payload) => ipcRenderer.invoke('papers:add', payload),
  refreshPaper: (id) => ipcRenderer.invoke('papers:refresh', id),
  refreshAll: () => ipcRenderer.invoke('papers:refresh-all'),
  markPaperRead: (id) => ipcRenderer.invoke('papers:mark-read', id),
  markAllRead: () => ipcRenderer.invoke('papers:mark-all-read'),
  archivePaper: (id) => ipcRenderer.invoke('papers:archive', id),
  restorePaper: (id) => ipcRenderer.invoke('papers:restore', id),
  exportPaper: (id, format) => ipcRenderer.invoke('papers:export', id, format),
  removePaper: (id) => ipcRenderer.invoke('papers:remove', id),
  openTrackingPage: (id) => ipcRenderer.invoke('papers:open-tracking', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  chooseDataDirectory: () => ipcRenderer.invoke('settings:choose-data-directory'),
  deleteDataBackups: () => ipcRenderer.invoke('settings:delete-data-backups'),
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
  }
});

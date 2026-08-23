'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DATA_VERSION, migrateData } = require('./paper-core');

const DEFAULT_SETTINGS = Object.freeze({
  autoRefresh: true,
  refreshOnStartup: true,
  refreshMinutes: 360,
  notifications: true,
  closeToTray: true,
  startAtLogin: false,
  autoCheckUpdates: true,
  // Kept in the defaults as a read-compatibility marker; Schema 8 stores
  // todayWidgetEnabled and getSettings exposes the old name as an alias.
  scheduleWidgetEnabled: false,
  todayWidgetEnabled: false,
  widgetShowSchedules: true,
  widgetShowTodos: true,
  widgetShowCompletedTodos: false,
  appearanceTheme: 'liquid-glass',
  eventNotifications: true,
  todoNotifications: true,
  defaultEventReminderMinutes: 10,
  defaultTodoReminderMode: 'at-due',
  quickCaptureShortcut: 'CommandOrControl+Shift+Space',
  stickyNoteShortcut: 'CommandOrControl+Alt+N'
});

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    const initialSettings = { ...DEFAULT_SETTINGS };
    delete initialSettings.scheduleWidgetEnabled;
    this.data = {
      version: DATA_VERSION,
      settings: initialSettings,
      papers: [],
      schedules: [],
      todos: [],
      notes: [],
      metadataFields: [],
      attendance: [],
      focusSessions: []
    };
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.save();
      return this.data;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (error) {
      throw new Error(`研迹数据文件无法解析，未写入任何内容。请检查或恢复备份：${error.message}`);
    }
    let migrated;
    try {
      migrated = migrateData(parsed, DEFAULT_SETTINGS);
    } catch (error) {
      throw new Error(`研迹数据结构损坏或不受支持，未写入任何内容：${error.message}`);
    }
    this.data = migrated.data;
    const sourceVersion = Number(parsed.version || 1);
    if (migrated.changed) {
      if (sourceVersion < DATA_VERSION) this.createMigrationBackup();
      this.save();
    }
    return this.data;
  }

  createMigrationBackup() {
    const parsedPath = path.parse(this.filePath);
    const base = `${parsedPath.name}.pre-v8`;
    let backupPath = path.join(parsedPath.dir, `${base}.${Date.now()}.json`);
    let suffix = 2;
    while (fs.existsSync(backupPath)) backupPath = path.join(parsedPath.dir, `${base}.${Date.now()}.${suffix++}.json`);
    try {
      // A failed backup must stop migration before the original is replaced.
      fs.writeFileSync(backupPath, fs.readFileSync(this.filePath), { flag: 'wx' });
      console.info('[研迹] Schema 8 迁移前备份已创建: ' + backupPath);
    } catch (error) {
      throw new Error(`Schema 8 迁移前备份失败，原数据未修改：${error.message}`);
    }
    return backupPath;
  }

  save(nextData = this.data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(nextData, null, 2), 'utf8');
    fs.renameSync(tempPath, this.filePath);
    this.data = nextData;
  }

  copyTo(filePath) {
    const targetPath = path.resolve(filePath);
    if (targetPath === path.resolve(this.filePath)) return targetPath;
    if (fs.existsSync(targetPath)) {
      throw new Error('所选位置已经存在研迹数据文件。');
    }
    const copy = new JsonStore(targetPath);
    copy.data = JSON.parse(JSON.stringify(this.data));
    copy.save();
    return targetPath;
  }

  getSettings() {
    return {
      ...this.data.settings,
      scheduleWidgetEnabled: this.data.settings.todayWidgetEnabled ?? this.data.settings.scheduleWidgetEnabled ?? false
    };
  }

  updateSettings(patch) {
    const next = { ...this.data.settings, ...patch };
    if ('scheduleWidgetEnabled' in patch && !('todayWidgetEnabled' in patch)) next.todayWidgetEnabled = Boolean(patch.scheduleWidgetEnabled);
    delete next.scheduleWidgetEnabled;
    this.data.settings = next;
    this.save();
    return this.getSettings();
  }

  updateWorkspace(updater) {
    const draft = JSON.parse(JSON.stringify(this.data));
    const next = updater(draft) || draft;
    if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error('工作区更新结果无效。');
    this.save(next);
    return this.data;
  }

  commitWorkspace(updater) {
    return this.updateWorkspace(updater);
  }

  listPapers() {
    return this.data.papers;
  }

  findPaper(id) {
    return this.data.papers.find((paper) => paper.id === id);
  }

  findByKey(paperKey) {
    return this.data.papers.find((paper) => paper.paperKey === paperKey);
  }

  addPaper(paper) {
    this.data.papers.unshift(paper);
    this.save();
    return paper;
  }

  updatePaper(id, updater) {
    const index = this.data.papers.findIndex((paper) => paper.id === id);
    if (index < 0) throw new Error('找不到这篇稿件。');
    const updated = updater({ ...this.data.papers[index] });
    this.data.papers[index] = updated;
    this.save();
    return updated;
  }

  removePaper(id) {
    const before = this.data.papers.length;
    this.data.papers = this.data.papers.filter((paper) => paper.id !== id);
    if (this.data.papers.length === before) throw new Error('找不到这篇稿件。');
    this.save();
  }

  listSchedules() {
    return this.data.schedules;
  }

  setSchedules(schedules) {
    this.data.schedules = schedules;
    this.save();
    return this.data.schedules;
  }

  listTodos() {
    return this.data.todos;
  }

  setTodos(todos) {
    this.data.todos = todos;
    this.save();
    return this.data.todos;
  }

  listNotes() {
    return this.data.notes;
  }

  setNotes(notes) {
    this.data.notes = notes;
    this.save();
    return this.data.notes;
  }

  listMetadataFields() {
    return this.data.metadataFields;
  }

  setMetadataFields(fields) {
    this.data.metadataFields = fields;
    this.save();
    return this.data.metadataFields;
  }

  listAttendance() {
    return this.data.attendance;
  }

  setAttendance(attendance) {
    this.data.attendance = attendance;
    this.save();
    return this.data.attendance;
  }

  listFocusSessions() {
    return this.data.focusSessions;
  }

  setFocusSessions(focusSessions) {
    this.data.focusSessions = focusSessions;
    this.save();
    return this.data.focusSessions;
  }
}

module.exports = { JsonStore, DEFAULT_SETTINGS };

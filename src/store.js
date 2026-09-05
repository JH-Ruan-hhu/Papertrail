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
  // Kept in the defaults as a read-compatibility marker; Schema 9 stores
  // todayWidgetEnabled and getSettings exposes the old name as an alias.
  scheduleWidgetEnabled: false,
  todayWidgetEnabled: false,
  widgetShowSchedules: true,
  widgetShowTodos: true,
  widgetShowCompletedTodos: false,
  appearanceTheme: 'liquid-glass',
  homeBannerImageMode: 'bing',
  homeBannerBingInitialized: true,
  homeBannerFetchedOn: '',
  homeBannerImageCredit: '',
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
    this.attachmentsDirectory = path.join(path.dirname(filePath), 'attachments');
    const initialSettings = { ...DEFAULT_SETTINGS };
    delete initialSettings.scheduleWidgetEnabled;
    this.data = {
      version: DATA_VERSION,
      settings: initialSettings,
      papers: [],
      schedules: [],
      todos: [],
      countdowns: [],
      notes: [],
      metadataFields: [],
      attendance: [],
      focusSessions: [],
      jobApplications: []
    };
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.mkdirSync(this.attachmentsDirectory, { recursive: true });
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
      if (sourceVersion < DATA_VERSION) this.createMigrationBackup(sourceVersion);
      this.save();
    }
    return this.data;
  }

  createMigrationBackup(sourceVersion = 1) {
    const parsedPath = path.parse(this.filePath);
    const safeSourceVersion = Number.isInteger(Number(sourceVersion)) && Number(sourceVersion) > 0 ? Number(sourceVersion) : 1;
    const base = `${parsedPath.name}.pre-v${safeSourceVersion}`;
    let backupPath = path.join(parsedPath.dir, `${base}.${Date.now()}.json`);
    let suffix = 2;
    while (fs.existsSync(backupPath)) backupPath = path.join(parsedPath.dir, `${base}.${Date.now()}.${suffix++}.json`);
    try {
      // A failed backup must stop migration before the original is replaced.
      fs.writeFileSync(backupPath, fs.readFileSync(this.filePath), { flag: 'wx' });
      console.info(`[研迹] Schema ${safeSourceVersion} 迁移前备份已创建: ${backupPath}`);
    } catch (error) {
      throw new Error(`Schema ${safeSourceVersion} 迁移前备份失败，原数据未修改：${error.message}`);
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
    const targetAttachments = path.join(path.dirname(targetPath), 'attachments');
    if (fs.existsSync(targetAttachments)) throw new Error('所选位置已经存在研迹附件目录。');
    const copy = new JsonStore(targetPath);
    copy.data = JSON.parse(JSON.stringify(this.data));
    try {
      copy.save();
      if (fs.existsSync(this.attachmentsDirectory)) fs.cpSync(this.attachmentsDirectory, targetAttachments, { recursive: true, errorOnExist: true });
      else fs.mkdirSync(targetAttachments, { recursive: true });
    } catch (error) {
      try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* keep the original usable */ }
      try { if (fs.existsSync(targetAttachments)) fs.rmSync(targetAttachments, { recursive: true, force: true }); } catch { /* best effort cleanup */ }
      throw new Error(`研迹数据与附件复制失败，原目录未修改：${error.message}`);
    }
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

  listCountdowns() {
    return this.data.countdowns || [];
  }

  setCountdowns(countdowns) {
    this.data.countdowns = countdowns;
    this.save();
    return this.data.countdowns;
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

  listJobApplications() {
    return this.data.jobApplications;
  }

  setJobApplications(jobApplications) {
    this.data.jobApplications = jobApplications;
    this.save();
    return this.data.jobApplications;
  }
}

module.exports = { JsonStore, DEFAULT_SETTINGS };

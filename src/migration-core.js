'use strict';

const { normalizeTodo } = require('./todo-core');
const { appendHtmlDocumentBlock, mergeLegacyDailyEntries, normalizeNote, normalizeSchedule } = require('./workbench-core');
const { normalizeJobApplication } = require('./job-core');

const SCHEMA_8_VERSION = 8;
const SCHEMA_9_VERSION = 9;
const SCHEMA_10_VERSION = 10;
const DATA_VERSION = 11;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function isoDate(value, fallback = null) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uniqueTodoId(existingIds, baseId) {
  let id = baseId;
  let suffix = 2;
  while (existingIds.has(id)) id = `${baseId}_${suffix++}`;
  existingIds.add(id);
  return id;
}

function oneHourAfter(value) {
  const start = Date.parse(value);
  return Number.isFinite(start) ? new Date(start + 60 * 60_000).toISOString() : null;
}

function cleanTitle(value, fallback) {
  const title = String(value || '').trim().slice(0, 200);
  return title || fallback;
}

function normalizeSettings(source, defaults) {
  const input = asObject(source) || {};
  const safeDefaults = asObject(defaults) || {};
  const settings = { ...safeDefaults, ...input };
  settings.todayWidgetEnabled = input.todayWidgetEnabled ?? input.scheduleWidgetEnabled ?? safeDefaults.todayWidgetEnabled ?? false;
  settings.widgetShowSchedules = input.widgetShowSchedules !== false;
  settings.widgetShowTodos = input.widgetShowTodos !== false;
  settings.widgetShowCompletedTodos = input.widgetShowCompletedTodos === true;
  settings.appearanceTheme = input.appearanceTheme === 'classic' ? 'classic' : (input.appearanceTheme === 'liquid-glass' ? 'liquid-glass' : (safeDefaults.appearanceTheme || 'liquid-glass'));
  settings.eventNotifications = input.eventNotifications !== false;
  settings.todoNotifications = input.todoNotifications !== false;
  const allowedEventReminders = new Set([null, 0, 5, 10, 15, 30, 60, 1440]);
  settings.defaultEventReminderMinutes = allowedEventReminders.has(input.defaultEventReminderMinutes)
    ? input.defaultEventReminderMinutes
    : safeDefaults.defaultEventReminderMinutes ?? 10;
  const allowedTodoModes = new Set(['none', 'at-due', '15m-before', '1h-before', '1d-before', 'custom']);
  settings.defaultTodoReminderMode = allowedTodoModes.has(input.defaultTodoReminderMode)
    ? input.defaultTodoReminderMode
    : safeDefaults.defaultTodoReminderMode ?? 'at-due';
  delete settings.scheduleWidgetEnabled;
  return settings;
}

function migrateSchema7To8(parsed, { defaultSettings, fallbackAt = new Date(0).toISOString() } = {}) {
  if (!asObject(parsed)) throw new Error('数据文件根节点必须是对象。');
  if (parsed.version != null && (!Number.isInteger(parsed.version) || parsed.version < 1)) throw new Error('数据文件版本号无效。');
  if (Number(parsed.version || 1) > SCHEMA_8_VERSION) throw new Error(`数据文件来自更高版本（v${parsed.version}），当前研迹无法安全打开。`);
  for (const [key, label] of [
    ['settings', '设置'],
    ['papers', '稿件'],
    ['schedules', '日程'],
    ['todos', '待办'],
    ['notes', '笔记'],
    ['metadataFields', '笔记元数据字段'],
    ['attendance', '打卡记录'],
    ['focusSessions', '专注记录']
  ]) {
    if (parsed[key] == null) continue;
    const expectedArray = ['papers', 'schedules', 'todos', 'notes', 'metadataFields', 'attendance', 'focusSessions'].includes(key);
    if (expectedArray && !Array.isArray(parsed[key])) throw new Error(`${label}列表格式无效。`);
    if (!expectedArray && !asObject(parsed[key])) throw new Error(`${label}数据格式无效。`);
  }

  const settings = normalizeSettings(parsed.settings, defaultSettings);
  const sourceTodos = Array.isArray(parsed.todos) ? parsed.todos : [];
  const todos = [];
  const normalizedTodoIds = new Set();
  for (const [index, sourceTodo] of sourceTodos.entries()) {
    const normalized = normalizeTodo({
      ...(asObject(sourceTodo) || {}),
      title: cleanTitle(sourceTodo?.title, '未命名待办 ' + (index + 1))
    }, index, fallbackAt);
    let id = normalized.id;
    let suffix = 2;
    while (normalizedTodoIds.has(id)) id = `${normalized.id}_${suffix++}`;
    normalizedTodoIds.add(id);
    todos.push(id === normalized.id ? normalized : { ...normalized, id });
  }
  const todoIds = new Set(todos.map((todo) => todo.id));
  const schedules = [];
  for (const [index, source] of (parsed.schedules || []).entries()) {
    const schedule = asObject(source);
    if (!schedule) throw new Error(`第 ${index + 1} 条日程格式无效。`);
    const oldCompletedAt = isoDate(schedule.completedAt) || isoDate(schedule.legacy?.completedAt);
    const oldRemindedAt = isoDate(schedule.remindedAt) || isoDate(schedule.legacy?.remindedAt);
    const wasDeadline = Boolean(schedule.deadline || schedule.legacy?.deadline);
    if (wasDeadline) {
      const baseId = `todo_${String(schedule.id || `schedule-${index + 1}`).trim()}`;
      const id = uniqueTodoId(todoIds, baseId);
      const migratedTodo = normalizeTodo({
        id,
        title: cleanTitle(schedule.title, '未命名待办 ' + (index + 1)),
        notes: typeof schedule.notes === 'string' ? schedule.notes : '',
        status: oldCompletedAt ? 'completed' : 'open',
        priority: schedule.priority,
        dueAt: schedule.startAt,
        reminderMode: 'at-due',
        reminderAt: schedule.startAt,
        reminderSentAt: oldRemindedAt,
        completedAt: oldCompletedAt,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
        legacy: {
          ...(asObject(schedule.legacy) || {}),
          migratedFrom: 'schedule',
          scheduleId: schedule.id || null,
          deadline: true,
          sourceType: 'schedule-deadline',
          sourceId: schedule.id || null,
          migratedFromVersion: 7
        }
      }, todos.length, fallbackAt);
      // Keep the legacy reminder marker even when the old deadline had already
      // been completed; it is useful for an audit and prevents a duplicate
      // notification immediately after migration.
      if (oldRemindedAt) migratedTodo.reminderSentAt = oldRemindedAt;
      todos.push(migratedTodo);
      continue;
    }
    schedules.push(normalizeSchedule({
      ...schedule,
      title: cleanTitle(schedule.title, '未命名日程 ' + (index + 1)),
      endAt: schedule.endAt || oneHourAfter(schedule.startAt)
    }, index, fallbackAt));
  }

  const validTodoIds = new Set(todos.map((todo) => todo.id));
  const linkedSchedules = schedules.map((schedule) => {
    const sourceRef = asObject(schedule.sourceRef);
    if (!sourceRef || sourceRef.type !== 'todo' || !validTodoIds.has(String(sourceRef.id || ''))) {
      return { ...schedule, sourceRef: null };
    }
    return { ...schedule, sourceRef: { type: 'todo', id: String(sourceRef.id) } };
  });

  // Spread the original root first so future harmless top-level metadata is not
  // silently lost during migration. Known collections below are authoritative.
  const data = {
    ...clone(parsed),
    version: SCHEMA_8_VERSION,
    settings,
    schedules: linkedSchedules,
    todos,
    papers: Array.isArray(parsed.papers) ? parsed.papers : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    metadataFields: Array.isArray(parsed.metadataFields) ? parsed.metadataFields : [],
    attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
    focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : []
  };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) };
}

function mergeDailyNotes(notes) {
  const merged = [];
  const byDate = new Map();
  const ordered = [...notes].sort((left, right) => (
    left.kind === 'daily' && right.kind === 'daily' && left.dateKey === right.dateKey
      ? Date.parse(left.createdAt) - Date.parse(right.createdAt) || String(left.id).localeCompare(String(right.id))
      : 0
  ));
  for (const note of ordered) {
    if (note.kind !== 'daily') {
      merged.push(note);
      continue;
    }
    const existing = byDate.get(note.dateKey);
    if (!existing) {
      byDate.set(note.dateKey, note);
      merged.push(note);
      continue;
    }
    existing.attachments = [...(existing.attachments || []), ...(note.attachments || [])]
      .filter((attachment, index, list) => list.findIndex((item) => item.id === attachment.id) === index);
    existing.content = appendHtmlDocumentBlock(existing.content, note.content);
    existing.entries = [];
    existing.metadata = { ...(existing.metadata || {}), ...(note.metadata || {}) };
    existing.updatedAt = [existing.updatedAt, note.updatedAt].filter(Boolean).sort().at(-1) || existing.updatedAt;
    existing.revision = Math.max(Number(existing.revision) || 0, Number(note.revision) || 0);
  }
  return merged;
}

function migrateSchema8To9(parsed, { fallbackAt = new Date(0).toISOString() } = {}) {
  if (!asObject(parsed)) throw new Error('数据文件根节点必须是对象。');
  if (parsed.version != null && (!Number.isInteger(parsed.version) || parsed.version < 1)) throw new Error('数据文件版本号无效。');
  if (Number(parsed.version || SCHEMA_8_VERSION) > SCHEMA_9_VERSION) throw new Error(`数据文件来自更高版本（v${parsed.version}），当前研迹无法安全打开。`);
  if (parsed.notes != null && !Array.isArray(parsed.notes)) throw new Error('笔记列表格式无效。');
  const notes = mergeDailyNotes((parsed.notes || []).map((note, index) => {
    if (note?.kind !== 'daily') return normalizeNote(note, index, fallbackAt);
    const merged = mergeLegacyDailyEntries(note.entries, note.content, note.attachments, note.createdAt || fallbackAt);
    return normalizeNote({ ...note, content: merged.content, attachments: merged.attachments, entries: [] }, index, fallbackAt);
  }));
  const data = {
    ...clone(parsed),
    version: SCHEMA_9_VERSION,
    notes
  };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) };
}

function migrateSchema9To10(parsed, { fallbackAt = new Date(0).toISOString() } = {}) {
  if (!asObject(parsed)) throw new Error('数据文件根节点必须是对象。');
  if (parsed.version != null && (!Number.isInteger(parsed.version) || parsed.version < 1)) throw new Error('数据文件版本号无效。');
  if (Number(parsed.version || SCHEMA_9_VERSION) > SCHEMA_10_VERSION) throw new Error(`数据文件来自更高版本（v${parsed.version}），当前研迹无法安全打开。`);
  if (parsed.jobApplications != null && !Array.isArray(parsed.jobApplications)) throw new Error('求职记录列表格式无效。');
  const jobApplications = (parsed.jobApplications || []).map((item, index) => normalizeJobApplication(item, index, fallbackAt));
  const data = {
    ...clone(parsed),
    version: SCHEMA_10_VERSION,
    jobApplications
  };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) };
}

function migrateSchema10To11(parsed, { fallbackAt = new Date(0).toISOString() } = {}) {
  if (!asObject(parsed)) throw new Error('数据文件根节点必须是对象。');
  if (parsed.version != null && (!Number.isInteger(parsed.version) || parsed.version < 1)) throw new Error('数据文件版本号无效。');
  if (Number(parsed.version || SCHEMA_10_VERSION) > DATA_VERSION) throw new Error(`数据文件来自更高版本（v${parsed.version}），当前研迹无法安全打开。`);
  if (parsed.notes != null && !Array.isArray(parsed.notes)) throw new Error('笔记列表格式无效。');
  const notes = mergeDailyNotes((parsed.notes || []).map((note, index) => {
    if (note?.kind !== 'daily') return normalizeNote(note, index, fallbackAt);
    const merged = mergeLegacyDailyEntries(note.entries, note.content, note.attachments, note.createdAt || fallbackAt);
    return normalizeNote({ ...note, content: merged.content, attachments: merged.attachments, entries: [] }, index, fallbackAt);
  }));
  const data = { ...clone(parsed), version: DATA_VERSION, notes };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(parsed) };
}

module.exports = {
  DATA_VERSION,
  SCHEMA_8_VERSION,
  SCHEMA_9_VERSION,
  SCHEMA_10_VERSION,
  migrateSchema7To8,
  migrateSchema8To9,
  migrateSchema9To10,
  migrateSchema10To11,
  normalizeSettings
};

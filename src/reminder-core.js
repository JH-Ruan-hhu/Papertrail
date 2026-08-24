'use strict';

const { needsOverdueNotification, needsReminder } = require('./todo-core');

function cleanReminderText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/https?:\/\/\S+/gi, '链接')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 240);
}

function normalizeReminderPayload(item, kind = 'todo', level = 'reminder') {
  const source = item && typeof item === 'object' ? item : {};
  const reminderKind = kind === 'schedule' ? 'schedule' : 'todo';
  const scheduledAt = reminderKind === 'todo' ? source.dueAt || null : source.startAt || null;
  const overdue = level === 'overdue' || (reminderKind === 'todo' && source.status === 'open' && scheduledAt && Date.parse(scheduledAt) < Date.now());
  return {
    kind: reminderKind,
    level: level === 'overdue' ? 'overdue' : 'reminder',
    id: source.id ? String(source.id) : null,
    title: cleanReminderText(source.title, reminderKind === 'todo' ? '未命名待办' : '未命名日程'),
    notesPreview: cleanReminderText(source.notes || source.note || '', ''),
    priority: ['high', 'medium', 'low'].includes(source.priority) ? source.priority : 'low',
    scheduledAt,
    overdue: Boolean(overdue)
  };
}

const EVENT_REMINDER_GRACE_MS = 15 * 60_000;

function asTime(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function eventReminderAt(schedule) {
  const start = asTime(schedule?.startAt);
  if (start == null) return null;
  const minutes = schedule?.reminderMinutesBefore;
  if (minutes == null) return null;
  const safeMinutes = Number(minutes);
  if (!Number.isFinite(safeMinutes) || safeMinutes < 0) return null;
  return start - safeMinutes * 60_000;
}

function eventReminderDue(schedule, now = new Date(), graceMs = EVENT_REMINDER_GRACE_MS) {
  if (!schedule || schedule.reminderSentAt) return false;
  const start = asTime(schedule.startAt);
  const end = asTime(schedule.endAt);
  const current = asTime(now);
  const reminderAt = eventReminderAt(schedule);
  if (start == null || end == null || current == null || reminderAt == null) return false;
  if (schedule.allDay) {
    if (Number(schedule.reminderMinutesBefore) !== 0) return false;
    return current >= reminderAt && current <= reminderAt + graceMs;
  }
  if (current < reminderAt) return false;
  // A missed reminder should not surface hours later after a computer wakes.
  if (current > start + graceMs) return false;
  return true;
}

function todoReminderDue(todo, now = new Date()) {
  return needsReminder(todo, now);
}

function todoOverdueNotificationDue(todo, now = new Date()) {
  return needsOverdueNotification(todo, now);
}

function eventReminderNotificationDue(schedule, now = new Date()) {
  return eventReminderDue(schedule, now);
}

function buildReminderKey(type, id, occurrence = '') {
  const safeType = String(type || 'reminder').replace(/[^a-z0-9_-]/gi, '_');
  const safeId = String(id || '').replace(/[^a-z0-9_-]/gi, '_');
  return `${safeType}:${safeId}:${String(occurrence || '')}`;
}

function suppressDuplicate(seen, key) {
  if (!seen || typeof seen.has !== 'function' || typeof seen.add !== 'function') return false;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

function collectReminderCandidates({ schedules = [], todos = [], now = new Date(), settings = {} } = {}) {
  if (settings.notifications === false) return [];
  const candidates = [];
  if (settings.eventNotifications !== false) {
    for (const schedule of schedules) {
      if (eventReminderDue(schedule, now)) candidates.push({ type: 'event', item: schedule, key: buildReminderKey('event', schedule.id, schedule.startAt) });
    }
  }
  if (settings.todoNotifications !== false) {
    for (const todo of todos) {
      if (todoReminderDue(todo, now)) candidates.push({ type: 'todo', level: 'reminder', item: todo, key: buildReminderKey('todo-reminder', todo.id, todo.reminderAt) });
      if (todoOverdueNotificationDue(todo, now)) candidates.push({ type: 'todo', level: 'overdue', item: todo, key: buildReminderKey('todo-overdue', todo.id, todo.dueAt) });
    }
  }
  return candidates;
}

module.exports = {
  EVENT_REMINDER_GRACE_MS,
  buildReminderKey,
  collectReminderCandidates,
  eventReminderAt,
  eventReminderDue,
  eventReminderNotificationDue,
  normalizeReminderPayload,
  suppressDuplicate,
  todoOverdueNotificationDue,
  todoReminderDue
};

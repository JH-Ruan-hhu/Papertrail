'use strict';

const { TIME_NUMBER_PATTERN, chineseNumber, parseMinuteToken } = require('./natural-time');

// Todo is deliberately independent from the schedule model. A todo is an
// outcome with an optional deadline; a schedule is a time block used to do it.
const TODO_PRIORITIES = Object.freeze(['high', 'medium', 'low']);
const TODO_STATUSES = Object.freeze(['open', 'completed', 'cancelled']);
const TODO_REMINDER_MODES = Object.freeze(['none', 'at-due', '15m-before', '1h-before', '1d-before', 'custom']);
const TODO_REMINDER_OFFSETS_MS = Object.freeze({
  'at-due': 0,
  '15m-before': 15 * 60_000,
  '1h-before': 60 * 60_000,
  '1d-before': 24 * 60 * 60_000
});
const PRIORITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2 });
const WEEKDAYS = Object.freeze({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 });

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isoDate(value, fallback = null) {
  return validDate(value) ? new Date(value).toISOString() : fallback;
}

function localDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function atLocalDate(year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  const candidate = new Date(year, month - 1, day, hour, minute, second, millisecond);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
    ? candidate
    : null;
}

function endOfLocalDay(date) {
  const value = date instanceof Date ? date : new Date(date);
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function addLocalDays(date, days) {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + days);
  return value;
}

function resolveHour(hour, dayPart = '') {
  let value = Number(hour);
  if (!Number.isFinite(value)) return null;
  if (['下午', '傍晚', '晚上', '今晚'].includes(dayPart) && value < 12) value += 12;
  if (dayPart === '中午' && value < 11) value += 12;
  if (dayPart === '凌晨' && value === 12) value = 0;
  if (value < 0 || value > 23) return null;
  return value;
}

function parseClock(rawHour, rawMinute, dayPart = '') {
  const hour = resolveHour(chineseNumber(rawHour), dayPart);
  const minute = rawMinute ? parseMinuteToken(rawMinute) : 0;
  if (hour == null || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDateExpression(text, baseDate) {
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const relative = [
    ['大后天', 3],
    ['后天', 2],
    ['明天', 1],
    ['今天', 0],
    ['今晚', 0]
  ].find(([token]) => text.includes(token));
  if (relative) return { date: addLocalDays(base, relative[1]), token: relative[0], explicit: true };

  const fullYearSlash = text.match(/(?<!\d)(20\d{2})\/(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (fullYearSlash) {
    const date = atLocalDate(Number(fullYearSlash[1]), Number(fullYearSlash[2]), Number(fullYearSlash[3]), 12);
    return date
      ? { date, token: fullYearSlash[0], explicit: true }
      : { invalid: true, token: fullYearSlash[0], explicit: true };
  }

  const yearMonthDay = text.match(/(?<!\d)(20\d{2})年(\d{1,2})月(\d{1,2})(?:日|号)?/);
  if (yearMonthDay) {
    const date = atLocalDate(Number(yearMonthDay[1]), Number(yearMonthDay[2]), Number(yearMonthDay[3]), 12);
    return date
      ? { date, token: yearMonthDay[0], explicit: true }
      : { invalid: true, token: yearMonthDay[0], explicit: true };
  }

  const monthDay = text.match(/(?<!\d)(\d{1,2})月(\d{1,2})(?:日|号)?/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    let year = base.getFullYear();
    let date = atLocalDate(year, month, day, 12);
    if (!date) return { invalid: true, token: monthDay[0], explicit: true };
    if (date < addLocalDays(base, -1)) {
      year += 1;
      date = atLocalDate(year, month, day, 12);
    }
    return { date, token: monthDay[0], explicit: true };
  }

  const slashDate = text.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    let date = atLocalDate(base.getFullYear(), month, day, 12);
    if (!date) return { invalid: true, token: slashDate[0], explicit: true };
    if (date < addLocalDays(base, -1)) date = atLocalDate(base.getFullYear() + 1, month, day, 12);
    return { date, token: slashDate[0], explicit: true };
  }

  // A bare day such as “2号晚上” means the next occurrence of that day in
  // the current or following month. Consume an optional “前” so deadline
  // wording leaves a clean task title.
  const dayOnly = text.match(/(?<![\d月])(\d{1,2})\s*(?:日|号)(?:前)?(?=$|[^\d])/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let year = base.getFullYear();
    let month = base.getMonth() + 1;
    let date = atLocalDate(year, month, day, 12);
    if (!date) return { invalid: true, token: dayOnly[0].trim(), explicit: true };
    if (date < addLocalDays(base, -1)) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      date = atLocalDate(year, month, day, 12);
      if (!date) return { invalid: true, token: dayOnly[0].trim(), explicit: true };
    }
    return { date, token: dayOnly[0].trim(), explicit: true };
  }

  const week = text.match(/(下周|下星期|本周|本星期|这周|这星期|周|星期)([一二三四五六日天])/);
  if (week) {
    const target = WEEKDAYS[week[2]];
    const current = base.getDay() || 7;
    let offset = (target - current + 7) % 7;
    if (/^下/.test(week[1])) offset += 7;
    if (/^(周|星期)/.test(week[1]) && offset === 0 && /前|截止|之前/.test(text)) offset = 0;
    const date = addLocalDays(base, offset);
    return { date, token: week[0], explicit: true };
  }

  return { date: base, token: '', explicit: false };
}

function parseNaturalLanguageTodo(input, base = new Date()) {
  const original = cleanText(input, 4000);
  if (!original) {
    return {
      valid: false,
      title: '',
      matches: [],
      warning: null,
      meta: {
        hasExplicitDate: false,
        hasExplicitTime: false,
        detectedRange: false,
        warnings: [],
        explicitDate: false,
        explicitTime: false,
        timeRange: false
      }
    };
  }
  const baseDate = base instanceof Date ? base : new Date(base);
  const dateResult = parseDateExpression(original, baseDate);
  if (dateResult.invalid) {
    return {
      valid: false,
      title: original,
      matches: [{ start: original.indexOf(dateResult.token), end: original.indexOf(dateResult.token) + dateResult.token.length, text: dateResult.token }],
      warning: '日期无效，请检查日期后再保存。',
      meta: {
        hasExplicitDate: true,
        hasExplicitTime: false,
        detectedRange: false,
        warnings: ['日期无效，请检查日期后再保存。'],
        explicitDate: true,
        explicitTime: false,
        timeRange: false
      }
    };
  }

  const dayPartMatch = original.match(/凌晨|早上|上午|中午|下午|傍晚|晚上|今晚/);
  const dayPart = dayPartMatch?.[0] || '';
  const numberPattern = TIME_NUMBER_PATTERN;
  const rangePattern = new RegExp(`(?:${dayPart || '凌晨|早上|上午|中午|下午|傍晚|晚上|今晚'})?\\s*(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)?\\s*(?:到|至|[-–—~～])\\s*(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚)?\\s*(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)?`);
  const singlePattern = new RegExp(`(凌晨|早上|上午|中午|下午|傍晚|晚上|今晚)?\\s*(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)`);
  const range = original.match(rangePattern);
  const single = range ? null : original.match(singlePattern);
  const startClock = range
    ? parseClock(range[1], range[2], dayPart)
    : single
      ? parseClock(single[2], single[3], single[1] || dayPart)
      : null;
  const endClock = range ? parseClock(range[4], range[5], range[3] || dayPart) : null;
  const explicitTime = Boolean(startClock);
  const timeRange = Boolean(range && endClock);
  const timeToken = range?.[0] || single?.[0] || '';
  const priorityMatch = original.match(/[＃#]([123])\b/);
  const priority = priorityMatch ? ({ 1: 'high', 2: 'medium', 3: 'low' })[priorityMatch[1]] : 'medium';
  const hasDate = dateResult.explicit || ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '今晚'].includes(dayPart);
  let dueAt = null;
  let warning = null;
  if (hasDate) {
    if (explicitTime) {
      const start = new Date(dateResult.date);
      start.setHours(startClock.hour, startClock.minute, 0, 0);
      let due = new Date(start);
      if (endClock) {
        due = new Date(dateResult.date);
        due.setHours(endClock.hour, endClock.minute, 0, 0);
        if (due <= start) due.setDate(due.getDate() + 1);
        warning = '检测到时间段，已将结束时间作为截止时间。';
      }
      dueAt = due.toISOString();
    } else {
      dueAt = endOfLocalDay(dateResult.date).toISOString();
    }
  }

  const tokens = [dateResult.token, dayPartMatch?.[0], timeToken, priorityMatch?.[0]].filter(Boolean);
  let title = original;
  for (const token of [...new Set(tokens)].sort((a, b) => b.length - a.length)) title = title.replace(token, ' ');
  title = title
    .replace(/[＃#][123]\b/g, ' ')
    .replace(/(?:截止|截至|到期|ddl|deadline)\s*$/i, ' ')
    .replace(/(?:之前|以前|前)\s*$/g, ' ')
    .replace(/^\s*(?:截止|截至|到期|之前|以前|前)\s*/g, ' ')
    .replace(/[的于]\s+(?=(?:上午|下午|晚上|今晚|凌晨))/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) title = original;

  const matches = [];
  for (const token of [...new Set(tokens)]) {
    const index = original.indexOf(token);
    if (index >= 0) matches.push({ start: index, end: index + token.length, text: token });
  }
  matches.sort((a, b) => a.start - b.start);
  return {
    valid: true,
    title,
    notes: '',
    status: 'open',
    priority,
    dueAt,
    reminderMode: dueAt ? 'at-due' : 'none',
    reminderAt: dueAt,
    matches,
    warning,
    meta: {
      hasExplicitDate: hasDate,
      hasExplicitTime: explicitTime,
      detectedRange: timeRange,
      warnings: warning ? [warning] : [],
      // Compatibility aliases for the first v1.1 renderer pass.
      explicitDate: hasDate,
      explicitTime,
      timeRange,
      dateToken: dateResult.token || null,
      timeToken: timeToken || null
    }
  };
}

function calculateReminderAt(dueAt, reminderMode, customReminderAt = null) {
  if (!validDate(dueAt) || !TODO_REMINDER_MODES.includes(reminderMode) || reminderMode === 'none') return null;
  if (reminderMode === 'custom') return isoDate(customReminderAt);
  const offset = TODO_REMINDER_OFFSETS_MS[reminderMode];
  return Number.isFinite(offset) ? new Date(Date.parse(dueAt) - offset).toISOString() : null;
}

function normalizeTodo(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条待办格式无效。`);
  const title = cleanText(value.title, 200);
  if (!title) throw new Error('待办标题不能为空。');
  const createdAt = isoDate(value.createdAt, fallbackAt);
  const updatedAt = isoDate(value.updatedAt, createdAt);
  const dueAt = isoDate(value.dueAt);
  let status = TODO_STATUSES.includes(value.status) ? value.status : 'open';
  let reminderMode = TODO_REMINDER_MODES.includes(value.reminderMode) ? value.reminderMode : 'none';
  let reminderAt = isoDate(value.reminderAt);
  let completedAt = status === 'completed' ? isoDate(value.completedAt, updatedAt) : null;
  if (status !== 'completed') completedAt = null;
  if (status === 'cancelled') completedAt = null;
  if (!dueAt || status !== 'open') {
    reminderMode = 'none';
    reminderAt = null;
  } else {
    reminderAt = calculateReminderAt(dueAt, reminderMode, reminderAt);
    if (reminderMode === 'custom' && !reminderAt) reminderMode = 'none';
  }
  const legacy = asObject(value.legacy) ? { ...value.legacy } : {};
  const knownKeys = new Set([
    'id', 'title', 'notes', 'status', 'priority', 'dueAt', 'reminderMode', 'reminderAt',
    'reminderSentAt', 'overdueNotifiedAt', 'completedAt', 'createdAt', 'updatedAt',
    'snoozedUntil', 'legacy'
  ]);
  for (const [key, item] of Object.entries(value)) {
    if (!knownKeys.has(key)) legacy[key] = item;
  }
  return {
    id: cleanText(value.id, 200) || `todo-${index + 1}`,
    title,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, 10_000) : '',
    status,
    priority: TODO_PRIORITIES.includes(value.priority) ? value.priority : 'medium',
    dueAt,
    reminderMode,
    reminderAt,
    reminderSentAt: status === 'open' && dueAt ? isoDate(value.reminderSentAt) : null,
    overdueNotifiedAt: status === 'open' && dueAt ? isoDate(value.overdueNotifiedAt) : null,
    completedAt,
    createdAt,
    updatedAt,
    snoozedUntil: status === 'open' && dueAt ? isoDate(value.snoozedUntil) : null,
    legacy
  };
}

function saveTodo(list, input, now = new Date().toISOString(), makeId = () => `todo-${Date.now()}`) {
  const existing = input?.id ? (list || []).find((item) => item.id === String(input.id)) : null;
  const nextDueAt = Object.prototype.hasOwnProperty.call(input || {}, 'dueAt') ? input.dueAt : existing?.dueAt;
  const nextReminderMode = Object.prototype.hasOwnProperty.call(input || {}, 'reminderMode') ? input.reminderMode : existing?.reminderMode;
  const nextReminderAt = Object.prototype.hasOwnProperty.call(input || {}, 'reminderAt') ? input.reminderAt : existing?.reminderAt;
  const nextStatus = Object.prototype.hasOwnProperty.call(input || {}, 'status') ? input.status : existing?.status;
  const reminderChanged = !existing
    || existing.dueAt !== nextDueAt
    || existing.reminderMode !== nextReminderMode
    || existing.reminderAt !== nextReminderAt
    || existing.status !== nextStatus;
  const candidate = normalizeTodo({
    ...existing,
    ...input,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    reminderSentAt: reminderChanged ? null : existing.reminderSentAt,
    overdueNotifiedAt: reminderChanged ? null : existing.overdueNotifiedAt
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...(list || [])];
}

function completeTodo(todo, completed = true, now = new Date().toISOString()) {
  const next = { ...todo, status: completed ? 'completed' : 'open', completedAt: completed ? now : null, updatedAt: now };
  if (completed) {
    next.reminderSentAt = null;
    next.overdueNotifiedAt = null;
  } else {
    next.reminderSentAt = null;
    next.overdueNotifiedAt = null;
  }
  return normalizeTodo(next, 0, now);
}

function reopenTodo(todo, now = new Date().toISOString()) {
  return completeTodo({ ...todo, status: 'open' }, false, now);
}

function cancelTodo(todo, now = new Date().toISOString()) {
  return normalizeTodo({ ...todo, status: 'cancelled', completedAt: null, updatedAt: now }, 0, now);
}

function isOverdue(todo, now = new Date()) {
  return todo?.status === 'open' && validDate(todo.dueAt) && Date.parse(todo.dueAt) < (now instanceof Date ? now.getTime() : Date.parse(now));
}

function isDueToday(todo, now = new Date()) {
  return todo?.status !== 'cancelled' && validDate(todo.dueAt) && localDateKey(todo.dueAt) === localDateKey(now);
}

function isUpcoming(todo, now = new Date(), days = 7) {
  if (todo?.status !== 'open' || !validDate(todo.dueAt) || isDueToday(todo, now)) return false;
  const start = new Date(now instanceof Date ? now : now);
  const end = addLocalDays(start, days + 1);
  return Date.parse(todo.dueAt) >= start.getTime() && Date.parse(todo.dueAt) < end.getTime();
}

function todoPriorityRank(todo) {
  return PRIORITY_RANK[todo?.priority] ?? PRIORITY_RANK.medium;
}

function sortTodos(list, now = new Date()) {
  return [...(list || [])].sort((a, b) => {
    const aOverdue = isOverdue(a, now) ? 0 : 1;
    const bOverdue = isOverdue(b, now) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const priority = todoPriorityRank(a) - todoPriorityRank(b);
    if (priority) return priority;
    const aDue = validDate(a.dueAt) ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
    const bDue = validDate(b.dueAt) ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0);
  });
}

function matchesTodoSearch(todo, query) {
  const needle = String(query || '').trim().toLocaleLowerCase('zh-CN');
  if (!needle) return true;
  return `${todo?.title || ''}\n${todo?.notes || ''}`.toLocaleLowerCase('zh-CN').includes(needle);
}

function filterTodos(list, { view = 'today', query = '', now = new Date(), showAllCompleted = false } = {}) {
  const todos = (list || []).filter((todo) => matchesTodoSearch(todo, query));
  if (view === 'inbox') return sortTodos(todos.filter((todo) => todo.status === 'open' && !todo.dueAt), now);
  if (view === 'today') return sortTodos(todos.filter((todo) => todo.status === 'open' && (isDueToday(todo, now) || isOverdue(todo, now))), now);
  if (view === 'upcoming') return sortTodos(todos.filter((todo) => isUpcoming(todo, now)), now);
  if (view === 'completed') {
    const completed = todos.filter((todo) => todo.status === 'completed').sort((a, b) => Date.parse(b.completedAt || 0) - Date.parse(a.completedAt || 0));
    const current = now instanceof Date ? now.getTime() : Date.parse(now);
    return showAllCompleted ? completed : completed.filter((todo) => current - Date.parse(todo.completedAt || 0) <= 30 * 86_400_000);
  }
  if (view === 'cancelled') return todos.filter((todo) => todo.status === 'cancelled').sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  return sortTodos(todos.filter((todo) => todo.status !== 'cancelled'), now);
}

function groupTodos(list, { view = 'today', now = new Date() } = {}) {
  const groups = new Map();
  for (const todo of filterTodos(list, { view, now })) {
    let label = '未来';
    if (view === 'inbox' || !todo.dueAt) label = '无日期';
    else if (isOverdue(todo, now)) label = '逾期';
    else if (isDueToday(todo, now)) label = '今天';
    else if (view === 'upcoming') {
      const days = Math.round((new Date(todo.dueAt).setHours(12, 0, 0, 0) - new Date(now).setHours(12, 0, 0, 0)) / 86_400_000);
      label = days <= 1 ? '明天' : days <= 7 ? '本周' : '稍后';
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(todo);
  }
  return [...groups.entries()].map(([label, todos]) => ({ label, todos }));
}

function needsReminder(todo, now = new Date()) {
  if (todo?.status !== 'open' || !todo.dueAt || todo.reminderMode === 'none' || todo.reminderSentAt) return false;
  const snoozedUntil = Date.parse(todo.snoozedUntil || '');
  const reminderAt = Date.parse(todo.reminderAt || '');
  if (!Number.isFinite(reminderAt)) return false;
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (Number.isFinite(snoozedUntil) && current < snoozedUntil) return false;
  return current >= reminderAt;
}

function needsOverdueNotification(todo, now = new Date()) {
  return isOverdue(todo, now) && !todo.overdueNotifiedAt;
}

function markReminderSent(todo, sentAt = new Date().toISOString()) {
  return { ...todo, reminderSentAt: sentAt, snoozedUntil: null, updatedAt: sentAt };
}

function markOverdueNotified(todo, sentAt = new Date().toISOString()) {
  return { ...todo, overdueNotifiedAt: sentAt, updatedAt: sentAt };
}

function snoozeTodo(todo, until, now = new Date().toISOString()) {
  const nowMs = Date.parse(now);
  const snoozedUntil = typeof until === 'number'
    ? new Date((Number.isFinite(nowMs) ? nowMs : Date.now()) + until).toISOString()
    : isoDate(until);
  if (!snoozedUntil) throw new Error('稍后提醒时间无效。');
  return normalizeTodo({ ...todo, snoozedUntil, reminderSentAt: null, updatedAt: now }, 0, now);
}

module.exports = {
  TODO_PRIORITIES,
  TODO_REMINDER_MODES,
  TODO_STATUSES,
  addLocalDays,
  calculateReminderAt,
  cancelTodo,
  completeTodo,
  endOfLocalDay,
  filterTodos,
  groupTodos,
  isDueToday,
  isOverdue,
  isUpcoming,
  localDateKey,
  markOverdueNotified,
  markReminderSent,
  matchesTodoSearch,
  needsOverdueNotification,
  needsReminder,
  normalizeTodo,
  parseNaturalLanguageTodo,
  reopenTodo,
  saveTodo,
  snoozeTodo,
  sortTodos
};

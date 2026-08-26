'use strict';

const { TIME_NUMBER_PATTERN, parseMinuteToken } = require('./natural-time');

const SCHEDULE_PRIORITIES = Object.freeze(['high', 'medium', 'low']);
const SCHEDULE_REMINDER_MINUTES = Object.freeze([null, 0, 5, 10, 15, 30, 60, 1440]);
const METADATA_TYPES = Object.freeze(['text', 'select', 'checkbox']);
const ATTENDANCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FOCUS_STATUSES = Object.freeze(['active', 'completed', 'stopped']);
const NOTE_KINDS = Object.freeze(['daily', 'standalone']);
const NOTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_ATTACHMENT_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function cleanText(value, maxLength = 4000) {
  return String(value || '').trim().slice(0, maxLength);
}

function isoDate(value, fallback = null) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function localDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

function atLocalTime(parts, hour, minute = 0) {
  return new Date(parts.year, parts.month, parts.day, hour, minute, 0, 0);
}

function addLocalDays(date, count) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + count);
  return result;
}

function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function noteDateLabel(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return '今日日记';
  return `${year}年${month}月${day}日`;
}

function normalizeNoteAttachment(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 个笔记附件格式无效。`);
  const mimeType = NOTE_ATTACHMENT_MIMES.includes(value.mimeType) ? value.mimeType : null;
  const storedName = cleanText(value.storedName, 240);
  if (!mimeType || !storedName || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(storedName)) {
    throw new Error(`第 ${index + 1} 个笔记附件元数据无效。`);
  }
  const size = Math.max(0, Math.min(12 * 1024 * 1024, Math.round(Number(value.size) || 0)));
  return {
    id: cleanText(value.id, 200) || `attachment-${index + 1}`,
    storedName,
    originalName: cleanText(value.originalName, 240) || storedName,
    mimeType,
    size,
    createdAt: isoDate(value.createdAt, fallbackAt)
  };
}

function normalizeNoteEntry(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条笔记内容格式无效。`);
  const createdAt = isoDate(value.createdAt, fallbackAt);
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.slice(0, 40).map((item, attachmentIndex) => normalizeNoteAttachment(item, attachmentIndex, createdAt))
    : [];
  return {
    id: cleanText(value.id, 200) || `entry-${index + 1}`,
    title: cleanText(value.title, 80) || new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(createdAt)),
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt),
    content: String(value.content || '').slice(0, 100_000),
    attachments
  };
}

function composeNoteContent(entries = [], fallback = '') {
  const values = entries.map((entry) => String(entry?.content || '')).filter((value) => value.length > 0);
  return values.length ? values.join('\n\n') : String(fallback || '').slice(0, 100_000);
}

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.includes('十')) {
    const [left, right] = value.split('十');
    return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0);
  }
  return digits[value];
}

function resolveHour(hour, dayPart) {
  let resolved = Number(hour);
  if (!Number.isFinite(resolved)) return null;
  if ((dayPart === '下午' || dayPart === '傍晚' || dayPart === '晚上') && resolved < 12) resolved += 12;
  if (dayPart === '中午' && resolved < 11) resolved += 12;
  if (dayPart === '凌晨' && resolved === 12) resolved = 0;
  return Math.max(0, Math.min(23, resolved));
}

function defaultHour(dayPart) {
  return ({ 凌晨: 1, 早上: 8, 上午: 9, 中午: 12, 下午: 15, 傍晚: 18, 晚上: 20 })[dayPart] ?? 9;
}

function resolveDate(text, baseDate) {
  const relative = [
    ['大后天', 3],
    ['后天', 2],
    ['明天', 1],
    ['今天', 0]
  ].find(([token]) => text.includes(token));
  if (relative) return { date: addLocalDays(baseDate, relative[1]), token: relative[0] };

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const candidate = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12);
    if (candidate.getMonth() === Number(isoMatch[2]) - 1) return { date: candidate, token: isoMatch[0] };
  }

  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/);
  if (monthDay) {
    let year = baseDate.getFullYear();
    let candidate = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]), 12);
    if (candidate < addLocalDays(baseDate, -1)) candidate = new Date(year + 1, Number(monthDay[1]) - 1, Number(monthDay[2]), 12);
    return { date: candidate, token: monthDay[0] };
  }

  const slashDate = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slashDate) {
    let candidate = new Date(baseDate.getFullYear(), Number(slashDate[1]) - 1, Number(slashDate[2]), 12);
    if (candidate < addLocalDays(baseDate, -1)) candidate.setFullYear(candidate.getFullYear() + 1);
    return { date: candidate, token: slashDate[0] };
  }

  // A bare day such as “28号” means the next occurrence of that calendar
  // day. Include a following “前” in the consumed token so deadline wording
  // like “28日前完成测评” keeps the title “完成测评”, not “前完成测评”.
  const dayOnly = text.match(/(?<![\d月])(\d{1,2})\s*(?:日|号)(?:前)?(?=$|[^\d])/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let candidate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day, 12);
    if (candidate.getDate() !== day) return { date: baseDate, token: '' };
    if (candidate < addLocalDays(baseDate, -1)) candidate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, day, 12);
    if (candidate.getDate() === day) return { date: candidate, token: dayOnly[0].trim() };
  }

  return { date: baseDate, token: '' };
}

function parseClock(rawHour, rawMinute, dayPart) {
  const hour = resolveHour(chineseNumber(rawHour), dayPart);
  if (hour == null) return null;
  let minute = rawMinute ? parseMinuteToken(rawMinute) : 0;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;
  return { hour, minute };
}

function parseNaturalLanguageSchedule(input, base = new Date()) {
  const original = cleanText(input, 2000);
  if (!original) return { valid: false, title: '', matches: [] };

  const baseDate = base instanceof Date ? base : new Date(base);
  const resolvedDate = resolveDate(original, baseDate);
  const dayPartMatch = original.match(/凌晨|早上|上午|中午|下午|傍晚|晚上/);
  const dayPart = dayPartMatch?.[0] || '';
  const numberPattern = TIME_NUMBER_PATTERN;
  const rangePattern = new RegExp(`(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)?\\s*(?:到|至|[-–—~～])\\s*(凌晨|早上|上午|中午|下午|傍晚|晚上)?\\s*(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)?`);
  const singlePattern = new RegExp(`(凌晨|早上|上午|中午|下午|傍晚|晚上)?\\s*(${numberPattern})(?:[:：点时](半|${numberPattern})?分?)`);

  const range = original.match(rangePattern);
  let startClock;
  let endClock;
  let timeToken = '';
  if (range) {
    startClock = parseClock(range[1], range[2], dayPart);
    const endPart = range[3] || dayPart;
    endClock = parseClock(range[4], range[5], endPart);
    timeToken = range[0];
  } else {
    const single = original.match(singlePattern);
    if (single) {
      startClock = parseClock(single[2], single[3], single[1] || dayPart);
      timeToken = single[0];
    } else {
      startClock = { hour: defaultHour(dayPart), minute: 0 };
      timeToken = dayPart;
    }
  }

  if (!startClock) return { valid: false, title: original, matches: [] };
  const dateParts = localDateParts(resolvedDate.date);
  const start = atLocalTime(dateParts, startClock.hour, startClock.minute);
  let end;
  if (endClock) {
    end = atLocalTime(dateParts, endClock.hour, endClock.minute);
    if (end <= start) end.setDate(end.getDate() + 1);
  } else {
    end = new Date(start.getTime() + 60 * 60_000);
  }

  const priorityTag = original.match(/[＃#]([123])\b/);
  let priority = priorityTag ? ({ 1: 'high', 2: 'medium', 3: 'low' })[priorityTag[1]] : 'low';
  if (!priorityTag && /!!!|紧急|最高|红色/.test(original)) priority = 'high';
  else if (!priorityTag && /!!|重要|黄色/.test(original)) priority = 'medium';
  const deadline = /deadline|截止|到期|ddl/i.test(original) || /前$/.test(resolvedDate.token);

  const tokens = [resolvedDate.token, dayPart, timeToken].filter(Boolean);
  let title = original;
  for (const token of [...new Set(tokens)].sort((a, b) => b.length - a.length)) {
    title = title.replace(token, ' ');
  }
  title = title
    .replace(/!!!|!!/g, ' ')
    .replace(/[＃#][123]\b/g, ' ')
    .replace(/\b(deadline|ddl)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^的\s*/, '');
  if (!title) title = '新日程';

  const matches = [];
  for (const token of [...new Set([...tokens, priorityTag?.[0]].filter(Boolean))]) {
    const index = original.indexOf(token);
    if (index >= 0) matches.push({ start: index, end: index + token.length, text: token });
  }
  matches.sort((a, b) => a.start - b.start);

  const parsed = {
    valid: true,
    title,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    priority,
    matches,
    meta: {
      explicitDate: Boolean(resolvedDate.token),
      explicitTime: Boolean(timeToken && /\d|点|时|:|：/.test(timeToken)),
      timeRange: Boolean(endClock),
      dateToken: resolvedDate.token || null,
      timeToken: timeToken || null
    }
  };
  // Kept as a non-enumerable compatibility getter for v1.0 renderer/tests.
  // Schema 8 never persists Deadline semantics on a schedule.
  Object.defineProperty(parsed, 'deadline', { value: deadline, enumerable: false, configurable: true });
  return parsed;
}

function hasExplicitScheduleTime(parsed) {
  return Boolean(parsed?.matches?.some((match) => /今天|明天|后天|大后天|凌晨|早上|上午|中午|下午|傍晚|晚上|月|日|号|点|时|[:：/]|^20\d{2}-/.test(match.text)));
}

function splitScheduleClauses(input) {
  const text = cleanText(input, 2000);
  const separator = /[，,；;。\n]+|\s*(?:然后|接着|之后)\s*/g;
  const clauses = [];
  let cursor = 0;
  for (const match of text.matchAll(separator)) {
    const raw = text.slice(cursor, match.index);
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (value) clauses.push({ value, start: cursor + leading });
    cursor = match.index + match[0].length;
  }
  const raw = text.slice(cursor);
  const leading = raw.length - raw.trimStart().length;
  const value = raw.trim();
  if (value) clauses.push({ value, start: cursor + leading });
  return { text, clauses };
}

function parseNaturalLanguageSchedules(input, base = new Date()) {
  const { text, clauses } = splitScheduleClauses(input);
  const fallback = () => {
    const parsed = parseNaturalLanguageSchedule(text, base);
    return { ...parsed, schedules: parsed.valid ? [parsed] : [] };
  };
  if (clauses.length < 2) return fallback();
  const schedules = [];
  const matches = [];
  let inheritedDate = base instanceof Date ? base : new Date(base);
  for (const clause of clauses) {
    const parsed = parseNaturalLanguageSchedule(clause.value, inheritedDate);
    if (!parsed.valid || !hasExplicitScheduleTime(parsed)) return fallback();
    schedules.push(parsed);
    inheritedDate = new Date(parsed.startAt);
    matches.push(...parsed.matches.map((match) => ({ ...match, start: match.start + clause.start, end: match.end + clause.start })));
  }
  return {
    ...schedules[0],
    title: schedules.map((schedule) => schedule.title).join('；'),
    schedules,
    matches: matches.sort((a, b) => a.start - b.start)
  };
}

function normalizeSchedule(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条日程格式无效。`);
  const sourceStartAt = isoDate(value.startAt);
  const sourceEndAt = isoDate(value.endAt);
  const allDay = Boolean(value.allDay);
  let startAt = sourceStartAt;
  let endAt = sourceEndAt;
  if (allDay && sourceStartAt) {
    const startDate = new Date(sourceStartAt);
    startAt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).toISOString();
    endAt = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1).toISOString();
  }
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) {
    throw new Error(`第 ${index + 1} 条日程时间范围无效。`);
  }
  const createdAt = isoDate(value.createdAt, fallbackAt);
  const legacy = asObject(value.legacy) ? { ...value.legacy } : {};
  const knownKeys = new Set([
    'id', 'title', 'startAt', 'endAt', 'allDay', 'priority', 'reminderMinutesBefore',
    'reminderSentAt', 'sourceRef', 'createdAt', 'updatedAt', 'legacy',
    'deadline', 'completedAt', 'remindedAt'
  ]);
  for (const [key, item] of Object.entries(value)) {
    if (!knownKeys.has(key)) legacy[key] = item;
  }
  if (value.deadline !== undefined) legacy.deadline = Boolean(value.deadline);
  if (value.completedAt) legacy.completedAt = isoDate(value.completedAt);
  if (value.remindedAt) legacy.remindedAt = isoDate(value.remindedAt);
  // `remindedAt` was a Schema 7 deadline marker. Keep it in `legacy`, but do
  // not treat it as a Schema 8 event reminder for an ordinary time block.
  const reminderSentAt = isoDate(value.reminderSentAt);
  const sourceRef = asObject(value.sourceRef) && value.sourceRef.type === 'todo' && String(value.sourceRef.id || '').trim()
    ? { type: 'todo', id: String(value.sourceRef.id).trim() }
    : null;
  const reminderMinutesBefore = SCHEDULE_REMINDER_MINUTES.includes(value.reminderMinutesBefore)
    ? value.reminderMinutesBefore
    : SCHEDULE_REMINDER_MINUTES.includes(Number(value.reminderMinutesBefore))
      ? Number(value.reminderMinutesBefore)
      : null;
  const schedule = {
    id: cleanText(value.id, 200) || `schedule-${index + 1}`,
    title: cleanText(value.title, 500) || '未命名日程',
    startAt,
    endAt,
    allDay,
    priority: SCHEDULE_PRIORITIES.includes(value.priority) ? value.priority : 'low',
    reminderMinutesBefore,
    reminderSentAt,
    sourceRef,
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt),
    legacy
  };
  Object.defineProperties(schedule, {
    deadline: { value: Boolean(value.deadline || legacy.deadline), enumerable: false, configurable: true, writable: true },
    completedAt: { value: isoDate(value.completedAt || legacy.completedAt), enumerable: false, configurable: true, writable: true },
    remindedAt: { value: reminderSentAt, enumerable: false, configurable: true, writable: true }
  });
  return schedule;
}

function normalizeMetadataField(value, index = 0) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 个元数据字段格式无效。`);
  const type = METADATA_TYPES.includes(value.type) ? value.type : 'text';
  const options = type === 'select'
    ? [...new Set((Array.isArray(value.options) ? value.options : []).map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, 30)
    : [];
  return {
    id: cleanText(value.id, 200) || `metadata-${index + 1}`,
    name: cleanText(value.name, 100) || `字段 ${index + 1}`,
    type,
    options
  };
}

function normalizeNote(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条笔记格式无效。`);
  const createdAt = isoDate(value.createdAt, fallbackAt);
  const rawMetadata = asObject(value.metadata) || {};
  const metadata = {};
  for (const [key, fieldValue] of Object.entries(rawMetadata).slice(0, 100)) {
    metadata[cleanText(key, 200)] = typeof fieldValue === 'boolean'
      ? fieldValue
      : cleanText(fieldValue, 2000);
  }
  const kind = NOTE_KINDS.includes(value.kind) ? value.kind : 'standalone';
  const dateKey = kind === 'daily' && NOTE_DATE_PATTERN.test(String(value.dateKey || ''))
    ? String(value.dateKey)
    : kind === 'daily' ? localDateKey(createdAt) : null;
  const sourceEntries = Array.isArray(value.entries)
    ? value.entries.slice(0, 200).map((entry, entryIndex) => normalizeNoteEntry(entry, entryIndex, createdAt))
    : [];
  const content = String(value.content || '').slice(0, 100_000);
  const entries = sourceEntries.length
    ? sourceEntries
    : (kind === 'daily' && content ? [normalizeNoteEntry({
        id: value.entryId,
        createdAt,
        updatedAt: value.updatedAt || createdAt,
        content,
        attachments: value.attachments
      }, 0, createdAt)] : []);
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.slice(0, 40).map((item, attachmentIndex) => normalizeNoteAttachment(item, attachmentIndex, createdAt))
    : entries.flatMap((entry) => entry.attachments || []).slice(0, 40);
  const composedContent = kind === 'daily' ? composeNoteContent(entries, content) : content;
  return {
    id: cleanText(value.id, 200) || `note-${index + 1}`,
    kind,
    dateKey,
    title: cleanText(value.title, 300) || (kind === 'daily' ? noteDateLabel(dateKey) : '未命名笔记'),
    content: composedContent,
    entries,
    attachments,
    metadata,
    pinned: Boolean(value.pinned),
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt),
    revision: Math.max(0, Math.floor(Number(value.revision) || 0))
  };
}

function normalizeAttendance(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条打卡记录格式无效。`);
  const clockInAt = isoDate(value.clockInAt);
  const clockOutAt = isoDate(value.clockOutAt);
  const derivedDate = clockInAt
    ? `${new Date(clockInAt).getFullYear()}-${String(new Date(clockInAt).getMonth() + 1).padStart(2, '0')}-${String(new Date(clockInAt).getDate()).padStart(2, '0')}`
    : '';
  const date = ATTENDANCE_DATE_PATTERN.test(String(value.date || '')) ? String(value.date) : derivedDate;
  if (!date || !clockInAt) throw new Error(`第 ${index + 1} 条打卡记录缺少有效日期或上班时间。`);
  if (clockOutAt && Date.parse(clockOutAt) <= Date.parse(clockInAt)) {
    throw new Error(`第 ${index + 1} 条打卡记录的下班时间必须晚于上班时间。`);
  }
  const createdAt = isoDate(value.createdAt, fallbackAt);
  const appUsage = {};
  if (asObject(value.appUsage)) {
    for (const [name, seconds] of Object.entries(value.appUsage).slice(0, 100)) {
      const safeName = cleanText(name, 100);
      const safeSeconds = Math.max(0, Math.min(31_536_000, Math.round(Number(seconds) || 0)));
      if (safeName && safeSeconds) appUsage[safeName] = safeSeconds;
    }
  }
  return {
    id: cleanText(value.id, 200) || `attendance-${index + 1}`,
    date,
    clockInAt,
    clockOutAt,
    appUsage,
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt)
  };
}

function closeStaleAttendanceRecords(list, now = new Date(), updatedAt = now.toISOString()) {
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let changed = false;
  const records = list.map((record) => {
    if (record.clockOutAt || String(record.date || '') >= todayKey) return record;
    const [year, month, day] = String(record.date).split('-').map(Number);
    const localMidnight = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    const clockInMs = Date.parse(record.clockInAt);
    const closeAtMs = Math.max(localMidnight.getTime(), clockInMs + 60_000);
    changed = true;
    return {
      ...record,
      clockOutAt: new Date(closeAtMs).toISOString(),
      updatedAt
    };
  });
  return { records, changed };
}

function normalizeFocusSession(value, index = 0, fallbackAt = new Date(0).toISOString()) {
  if (!asObject(value)) throw new Error(`第 ${index + 1} 条专注记录格式无效。`);
  const startedAt = isoDate(value.startedAt);
  if (!startedAt) throw new Error(`第 ${index + 1} 条专注记录缺少有效开始时间。`);
  const plannedMinutes = Math.max(5, Math.min(180, Math.round(Number(value.plannedMinutes) || 25)));
  const endedAt = isoDate(value.endedAt);
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) throw new Error(`第 ${index + 1} 条专注记录的结束时间无效。`);
  const appUsage = {};
  if (asObject(value.appUsage)) {
    for (const [name, seconds] of Object.entries(value.appUsage).slice(0, 100)) {
      const safeName = cleanText(name, 100);
      const safeSeconds = Math.max(0, Math.min(31_536_000, Math.round(Number(seconds) || 0)));
      if (safeName && safeSeconds) appUsage[safeName] = safeSeconds;
    }
  }
  const restore = asObject(value.notificationRestore);
  const notificationRestore = restore ? {
    existed: Boolean(restore.existed),
    value: Number.isInteger(Number(restore.value)) ? Number(restore.value) : null,
    changed: Boolean(restore.changed)
  } : null;
  const createdAt = isoDate(value.createdAt, fallbackAt);
  return {
    id: cleanText(value.id, 200) || `focus-${index + 1}`,
    startedAt,
    endedAt,
    plannedMinutes,
    status: FOCUS_STATUSES.includes(value.status) ? value.status : (endedAt ? 'completed' : 'active'),
    appUsage,
    suppressNotifications: value.suppressNotifications !== false,
    notificationsSuppressed: Boolean(value.notificationsSuppressed),
    notificationRestore,
    notificationRestoredAt: isoDate(value.notificationRestoredAt),
    notificationError: cleanText(value.notificationError, 500) || null,
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt)
  };
}

function saveSchedule(list, input, now = new Date().toISOString(), makeId = () => `schedule-${Date.now()}`) {
  const existing = input?.id ? list.find((item) => item.id === String(input.id)) : null;
  const hasInput = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);
  const nextStartAt = hasInput('startAt') ? input.startAt : existing?.startAt;
  const nextEndAt = hasInput('endAt') ? input.endAt : existing?.endAt;
  const nextAllDay = hasInput('allDay') ? input.allDay : existing?.allDay;
  const nextPriority = hasInput('priority') ? input.priority : existing?.priority;
  const requestedReminderMinutes = hasInput('reminderMinutesBefore') ? input.reminderMinutesBefore : existing?.reminderMinutesBefore;
  const nextReminderMinutes = requestedReminderMinutes == null && ['high', 'medium'].includes(nextPriority)
    ? 0
    : requestedReminderMinutes;
  const sameReminderIdentity = Boolean(existing
    && existing.startAt === nextStartAt
    && existing.endAt === nextEndAt
    && existing.allDay === Boolean(nextAllDay)
    && existing.reminderMinutesBefore === nextReminderMinutes);
  const requestedReminder = input?.reminderSentAt ?? null;
  const candidate = normalizeSchedule({
    ...existing,
    ...input,
    reminderMinutesBefore: nextReminderMinutes,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    reminderSentAt: sameReminderIdentity ? (existing.reminderSentAt || requestedReminder) : requestedReminder
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function saveNote(list, input, now = new Date().toISOString(), makeId = () => `note-${Date.now()}`) {
  const existing = input?.id ? list.find((item) => item.id === String(input.id)) : null;
  const next = {
    ...existing,
    ...input,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    revision: Math.max(0, Number(existing?.revision) || 0) + 1
  };
  if (existing?.kind === 'daily' && input && Object.prototype.hasOwnProperty.call(input, 'content')) {
    const entryId = String(input.entryId || existing.entries?.at(-1)?.id || '');
    const entries = (existing.entries || []).map((entry) => entry.id === entryId
      ? { ...entry, content: String(input.content || '').slice(0, 100_000), updatedAt: now, attachments: input.attachments || entry.attachments || [] }
      : entry);
    next.entries = entries;
    next.content = composeNoteContent(entries, input.content);
  }
  const candidate = normalizeNote(next, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function noteBodyHasContent(note) {
  if (!note) return false;
  if ((note.attachments || []).length) return true;
  const visible = String(note.content || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
    .replace(/&[A-Za-z0-9#]+;/g, 'x')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return Boolean(visible);
}

function saveAttendance(list, input, now = new Date().toISOString(), makeId = () => `attendance-${Date.now()}`) {
  const existing = input?.id ? list.find((item) => item.id === String(input.id)) : null;
  const candidate = normalizeAttendance({
    ...existing,
    ...input,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function saveFocusSession(list, input, now = new Date().toISOString(), makeId = () => `focus-${Date.now()}`) {
  const existing = input?.id ? list.find((item) => item.id === String(input.id)) : null;
  const candidate = normalizeFocusSession({
    ...existing,
    ...input,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

module.exports = {
  METADATA_TYPES,
  NOTE_ATTACHMENT_MIMES,
  NOTE_KINDS,
  SCHEDULE_PRIORITIES,
  SCHEDULE_REMINDER_MINUTES,
  closeStaleAttendanceRecords,
  normalizeAttendance,
  normalizeFocusSession,
  normalizeMetadataField,
  normalizeNoteAttachment,
  normalizeNoteEntry,
  normalizeNote,
  noteBodyHasContent,
  composeNoteContent,
  localDateKey,
  noteDateLabel,
  normalizeSchedule,
  parseNaturalLanguageSchedule,
  parseNaturalLanguageSchedules,
  saveAttendance,
  saveFocusSession,
  saveNote,
  saveSchedule
};

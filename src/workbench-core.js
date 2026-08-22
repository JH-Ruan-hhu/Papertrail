'use strict';

const SCHEDULE_PRIORITIES = Object.freeze(['high', 'medium', 'low']);
const METADATA_TYPES = Object.freeze(['text', 'select', 'checkbox']);
const ATTENDANCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FOCUS_STATUSES = Object.freeze(['active', 'completed', 'stopped']);

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

  return { date: baseDate, token: '' };
}

function parseClock(rawHour, rawMinute, dayPart) {
  const hour = resolveHour(chineseNumber(rawHour), dayPart);
  if (hour == null) return null;
  let minute = rawMinute ? chineseNumber(rawMinute) : 0;
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
  const numberPattern = '[0-9零〇一二两三四五六七八九十]{1,3}';
  const rangePattern = new RegExp(`(${numberPattern})(?:[:：点时](${numberPattern})?分?)?\\s*(?:到|至|[-–—~～])\\s*(凌晨|早上|上午|中午|下午|傍晚|晚上)?\\s*(${numberPattern})(?:[:：点时](${numberPattern})?分?)?`);
  const singlePattern = new RegExp(`(凌晨|早上|上午|中午|下午|傍晚|晚上)?\\s*(${numberPattern})(?:[:：点时](${numberPattern})?分?)`);

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
  const deadline = /deadline|截止|到期|ddl/i.test(original);

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

  return {
    valid: true,
    title,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    priority,
    deadline,
    matches
  };
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
  const startAt = isoDate(value.startAt);
  const endAt = isoDate(value.endAt);
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) {
    throw new Error(`第 ${index + 1} 条日程时间范围无效。`);
  }
  const createdAt = isoDate(value.createdAt, fallbackAt);
  return {
    id: cleanText(value.id, 200) || `schedule-${index + 1}`,
    title: cleanText(value.title, 500) || '未命名日程',
    startAt,
    endAt,
    priority: SCHEDULE_PRIORITIES.includes(value.priority) ? value.priority : 'low',
    deadline: Boolean(value.deadline),
    completedAt: isoDate(value.completedAt),
    remindedAt: isoDate(value.remindedAt),
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt)
  };
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
  const content = String(value.content || '').slice(0, 100_000);
  return {
    id: cleanText(value.id, 200) || `note-${index + 1}`,
    title: cleanText(value.title, 300) || cleanText(content.split(/\r?\n/)[0], 80) || '未命名笔记',
    content,
    metadata,
    pinned: Boolean(value.pinned),
    createdAt,
    updatedAt: isoDate(value.updatedAt, createdAt)
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
  const candidate = normalizeSchedule({
    ...existing,
    ...input,
    id: existing?.id || makeId(),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    remindedAt: existing && existing.startAt === input.startAt ? existing.remindedAt : null
  }, 0, now);
  return existing
    ? list.map((item) => item.id === candidate.id ? candidate : item)
    : [candidate, ...list];
}

function saveNote(list, input, now = new Date().toISOString(), makeId = () => `note-${Date.now()}`) {
  const existing = input?.id ? list.find((item) => item.id === String(input.id)) : null;
  const candidate = normalizeNote({
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
  SCHEDULE_PRIORITIES,
  normalizeAttendance,
  normalizeFocusSession,
  normalizeMetadataField,
  normalizeNote,
  normalizeSchedule,
  parseNaturalLanguageSchedule,
  parseNaturalLanguageSchedules,
  saveAttendance,
  saveFocusSession,
  saveNote,
  saveSchedule
};

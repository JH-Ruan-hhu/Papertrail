'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  appendDailyNoteContent,
  appendHtmlDocumentBlock,
  closeStaleAttendanceRecords,
  normalizeAttendance,
  normalizeFocusSession,
  normalizeMetadataField,
  mergeLegacyDailyEntries,
  noteBodyHasContent,
  parseNaturalLanguageSchedule,
  parseNaturalLanguageSchedules,
  saveAttendance,
  saveFocusSession,
  saveNote,
  saveSchedule,
  wordCountFromNoteHtml
} = require('../src/workbench-core');

test('parses Chinese relative date, day part and a multi-hour range', () => {
  const parsed = parseNaturalLanguageSchedule('明天下午3点到5点组会 !!', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '组会');
  assert.equal(parsed.priority, 'medium');
  assert.equal(parsed.deadline, false);
  const start = new Date(parsed.startAt);
  const end = new Date(parsed.endAt);
  assert.equal(start.getDate(), 23);
  assert.equal(start.getHours(), 15);
  assert.equal(end.getHours(), 17);
  assert.ok(parsed.matches.some((match) => match.text.includes('3点到5点')));
});

test('removes the connector between a relative date and its clock phrase', () => {
  const parsed = parseNaturalLanguageSchedule('明天的下午四点去污水厂采样', new Date(2026, 7, 22, 10, 0));
  const start = new Date(parsed.startAt);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '去污水厂采样');
  assert.equal(start.getDate(), 23);
  assert.equal(start.getHours(), 16);
  assert.equal(start.getMinutes(), 0);
});

test('parses a bare day-of-month and removes the full deadline token from the title', () => {
  const now = new Date(2026, 7, 26, 10, 0);
  const bareDay = parseNaturalLanguageSchedule('28号', now);
  const deadline = parseNaturalLanguageSchedule('28日前完成基恩士测评', now);
  assert.equal(new Date(bareDay.startAt).getDate(), 28);
  assert.equal(bareDay.meta.explicitDate, true);
  assert.equal(new Date(deadline.startAt).getDate(), 28);
  assert.equal(deadline.title, '完成基恩士测评');
  assert.equal(deadline.deadline, true);
});

test('splits multiple explicitly timed clauses and inherits their date', () => {
  const parsed = parseNaturalLanguageSchedules('明天上午八点去采样，下午五点去洗澡', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.schedules.length, 2);
  assert.deepEqual(parsed.schedules.map((item) => item.title), ['去采样', '去洗澡']);
  assert.deepEqual(parsed.schedules.map((item) => new Date(item.startAt).getHours()), [8, 17]);
  assert.deepEqual(parsed.schedules.map((item) => new Date(item.startAt).getDate()), [23, 23]);
  assert.ok(parsed.matches.some((match) => match.text.includes('下午')));
});

test('marks urgent deadline text and gives a one-hour default duration', () => {
  const parsed = parseNaturalLanguageSchedule('后天早上九点截止提交初稿 紧急', new Date(2026, 7, 22, 10, 0));
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.deadline, true);
  assert.equal(new Date(parsed.startAt).getHours(), 9);
  assert.equal(Date.parse(parsed.endAt) - Date.parse(parsed.startAt), 60 * 60_000);
});

test('high and medium schedules default to an at-time reminder', () => {
  const high = saveSchedule([], {
    title: '全屏提醒',
    startAt: '2026-08-24T06:40:00.000Z',
    endAt: '2026-08-24T07:40:00.000Z',
    priority: 'high'
  }, '2026-08-24T06:00:00.000Z', () => 'high-reminder');
  const medium = saveSchedule([], {
    title: '置顶提醒',
    startAt: '2026-08-24T08:00:00.000Z',
    endAt: '2026-08-24T09:00:00.000Z',
    priority: 'medium',
    reminderMinutesBefore: null
  }, '2026-08-24T06:00:00.000Z', () => 'medium-reminder');
  assert.equal(high[0].reminderMinutesBefore, 0);
  assert.equal(medium[0].reminderMinutesBefore, 0);
});

test('uses compact priority tags and defaults untagged capture to green', () => {
  const now = new Date(2026, 7, 22, 10, 0);
  const high = parseNaturalLanguageSchedule('今天下午六点处理样品 #1', now);
  const medium = parseNaturalLanguageSchedule('明天上午九点写稿 ＃2', now);
  const low = parseNaturalLanguageSchedule('后天下午三点复盘 #3', now);
  const defaultLow = parseNaturalLanguageSchedule('今天下午四点读文献', now);
  assert.equal(high.priority, 'high');
  assert.equal(medium.priority, 'medium');
  assert.equal(low.priority, 'low');
  assert.equal(defaultLow.priority, 'low');
  assert.equal(high.title, '处理样品');
  assert.ok(high.matches.some((match) => match.text === '#1'));
});

test('creates and updates schedules without importing the legacy deadline reminder marker', () => {
  const now = '2026-08-22T01:00:00.000Z';
  const initial = saveSchedule([], {
    title: '跑样',
    startAt: '2026-08-23T01:00:00.000Z',
    endAt: '2026-08-23T02:00:00.000Z',
    priority: 'low',
    deadline: true
  }, now, () => 'schedule-1');
  const reminded = [{ ...initial[0], remindedAt: '2026-08-23T01:00:00.000Z' }];
  const updated = saveSchedule(reminded, { ...reminded[0], title: '继续跑样' }, '2026-08-22T02:00:00.000Z');
  assert.equal(updated[0].title, '继续跑样');
  assert.equal(updated[0].reminderSentAt, null);
  assert.equal(updated[0].legacy.remindedAt, '2026-08-23T01:00:00.000Z');
});

test('resets an event reminder when its time or reminder lead changes', () => {
  const saved = saveSchedule([], {
    id: 'event-1',
    title: '组会',
    startAt: '2026-08-23T01:00:00.000Z',
    endAt: '2026-08-23T02:00:00.000Z',
    reminderMinutesBefore: 10,
    reminderSentAt: '2026-08-22T10:00:00.000Z'
  }, '2026-08-22T11:00:00.000Z');
  const updated = saveSchedule(saved, { id: 'event-1', title: '组会改期', startAt: '2026-08-23T01:00:00.000Z', endAt: '2026-08-23T02:00:00.000Z', reminderMinutesBefore: 30 }, '2026-08-22T12:00:00.000Z');
  assert.equal(updated[0].reminderSentAt, null);
});

test('allows an edited schedule to turn its reminder off explicitly', () => {
  const original = saveSchedule([], {
    id: 'reminder-off',
    title: '关闭提醒',
    startAt: '2026-08-23T09:00:00.000Z',
    endAt: '2026-08-23T10:00:00.000Z',
    reminderMinutesBefore: 15,
    reminderSentAt: '2026-08-23T08:45:00.000Z'
  }, '2026-08-22T10:00:00.000Z');
  const changed = saveSchedule(original, {
    id: 'reminder-off',
    title: '关闭提醒',
    startAt: '2026-08-23T09:00:00.000Z',
    endAt: '2026-08-23T10:00:00.000Z',
    reminderMinutesBefore: null
  }, '2026-08-22T11:00:00.000Z');
  assert.equal(changed[0].reminderMinutesBefore, null);
  assert.equal(changed[0].reminderSentAt, null);
});

test('notes preserve typed metadata and metadata fields support custom selects', () => {
  const field = normalizeMetadataField({ id: 'method', name: '实验方法', type: 'select', options: ['LC-MS/MS', 'LC-MS/MS', 'GC-MS'] });
  assert.deepEqual(field.options, ['LC-MS/MS', 'GC-MS']);
  const notes = saveNote([], { kind: 'daily', dateKey: '2026-08-22', content: '今天完成质控', metadata: { method: 'LC-MS/MS', reviewed: true } }, '2026-08-22T02:00:00.000Z', () => 'note-1');
  assert.equal(notes[0].title, '2026年8月22日');
  assert.deepEqual(notes[0].entries, []);
  assert.equal(notes[0].metadata.reviewed, true);
});

test('first and second quick captures create one daily document with one natural blank line', () => {
  const first = appendDailyNoteContent([], {
    dateKey: '2026-08-28',
    content: '即写即走的第一段'
  }, '2026-08-28T01:00:00.000Z', () => 'daily-1');
  const second = appendDailyNoteContent(first.notes, {
    dateKey: '2026-08-28',
    content: '<p><strong>第二段</strong></p>'
  }, '2026-08-28T02:00:00.000Z');
  assert.equal(second.notes.length, 1);
  assert.equal(second.note.id, 'daily-1');
  assert.equal(second.note.revision, 2);
  assert.equal(second.note.content, '<p>即写即走的第一段</p><p><br></p><p><strong>第二段</strong></p>');
  assert.deepEqual(second.note.entries, []);
});

test('document append normalizes boundary whitespace and preserves rich blocks', () => {
  const combined = appendHtmlDocumentBlock(
    '<p><b>第一段</b></p><p><br></p><p><br></p>',
    '<p><br></p><ol><li><u>第二段</u></li></ol>'
  );
  assert.equal(combined, '<p><b>第一段</b></p><p><br></p><ol><li><u>第二段</u></li></ol>');
  assert.equal(appendHtmlDocumentBlock(combined, '<p><br></p>'), combined);
});

test('replacing a full daily document can edit early text without losing later text', () => {
  const original = appendDailyNoteContent([], { dateKey: '2026-08-28', content: '<p>第一段</p><p><br></p><p>第二段</p>' }, '2026-08-28T01:00:00.000Z', () => 'daily-1');
  const saved = saveNote(original.notes, {
    id: 'daily-1',
    content: '<p>修改后的第一段</p><p><br></p><p>第二段</p>',
    revision: 1
  }, '2026-08-28T02:00:00.000Z');
  assert.match(saved[0].content, /修改后的第一段/);
  assert.match(saved[0].content, /第二段/);
  assert.deepEqual(saved[0].entries, []);
});

test('legacy entries merge chronologically and flatten attachments by id', () => {
  const imageA = { id: 'image-a', storedName: 'a.png', originalName: 'a.png', mimeType: 'image/png', size: 10, createdAt: '2026-08-28T01:00:00.000Z' };
  const imageB = { id: 'image-b', storedName: 'b.png', originalName: 'b.png', mimeType: 'image/png', size: 20, createdAt: '2026-08-28T02:00:00.000Z' };
  const merged = mergeLegacyDailyEntries([
    { id: 'late', createdAt: '2026-08-28T03:00:00.000Z', content: '<ul><li>第三段</li></ul>', attachments: [imageA] },
    { id: 'early', createdAt: '2026-08-28T01:00:00.000Z', content: '<p><b>第一段</b></p>', attachments: [imageA] },
    { id: 'middle', createdAt: '2026-08-28T02:00:00.000Z', content: '<p><img data-note-attachment="image-b"></p>', attachments: [imageB] }
  ]);
  assert.ok(merged.content.indexOf('第一段') < merged.content.indexOf('image-b'));
  assert.ok(merged.content.indexOf('image-b') < merged.content.indexOf('第三段'));
  assert.deepEqual(merged.attachments.map((item) => item.id), ['image-a', 'image-b']);
});

test('stale document revision is rejected without replacing newer content', () => {
  const current = [saveNote([], { kind: 'daily', dateKey: '2026-08-28', content: '<p>数据库新版</p>' }, '2026-08-28T01:00:00.000Z', () => 'daily-1')[0]];
  assert.equal(current[0].revision, 1);
  assert.throws(() => saveNote(current, { id: 'daily-1', revision: 0, content: '<p>旧客户端覆盖</p>' }), (error) => error.code === 'NOTE_REVISION_CONFLICT');
  assert.equal(current[0].content, '<p>数据库新版</p>');
});

test('atomic append always uses the newest stored document', () => {
  const stored = [saveNote([], { kind: 'daily', dateKey: '2026-08-28', content: '<p>revision 11 正文</p>', revision: 10 }, '2026-08-28T01:00:00.000Z', () => 'daily-1')[0]];
  stored[0].revision = 11;
  const result = appendDailyNoteContent(stored, { dateKey: '2026-08-28', content: '后台追加' }, '2026-08-28T02:00:00.000Z');
  assert.equal(result.note.revision, 12);
  assert.match(result.note.content, /revision 11 正文/);
  assert.match(result.note.content, /后台追加/);
});

test('rich note markup and attachment placeholders survive full-document save', () => {
  const content = '<p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除线</s></p><ol><li>编号</li></ol><ul><li>项目</li></ul><p><img data-note-attachment="image-a"></p>';
  const image = { id: 'image-a', storedName: 'a.png', originalName: 'a.png', mimeType: 'image/png', size: 10, createdAt: '2026-08-28T01:00:00.000Z' };
  const note = saveNote([], { kind: 'daily', dateKey: '2026-08-28', content, attachments: [image] }, '2026-08-28T01:00:00.000Z', () => 'daily-1')[0];
  assert.equal(note.content, content);
  assert.equal(note.attachments[0].id, 'image-a');
  assert.equal(noteBodyHasContent({ content: '<p><img data-note-attachment="image-a"></p>', attachments: [] }), true);
  assert.ok(wordCountFromNoteHtml(content) >= 13);
});

test('detects empty rich note bodies while preserving text and image notes', () => {
  assert.equal(noteBodyHasContent({ content: '<p><br></p>&nbsp;\u200B', attachments: [] }), false);
  assert.equal(noteBodyHasContent({ title: '只有标题', content: '', attachments: [] }), false);
  assert.equal(noteBodyHasContent({ content: '<p>实验记录</p>', attachments: [] }), true);
  assert.equal(noteBodyHasContent({ content: '', attachments: [{ id: 'image-1' }] }), true);
});

test('attendance supports multiple work segments per day and validates clock order', () => {
  const created = saveAttendance([], {
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:00:00.000Z',
    clockOutAt: '2026-08-22T09:30:00.000Z'
  }, '2026-08-22T10:00:00.000Z', () => 'attendance-1');
  const second = saveAttendance(created, {
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:15:00.000Z',
    clockOutAt: '2026-08-22T03:00:00.000Z',
    appUsage: { WINWORD: 480 }
  }, '2026-08-22T11:00:00.000Z', () => 'attendance-2');
  assert.equal(second.length, 2);
  assert.equal(second[0].id, 'attendance-2');
  assert.equal(second[0].appUsage.WINWORD, 480);
  const updated = saveAttendance(second, {
    id: 'attendance-1',
    date: '2026-08-22',
    clockInAt: '2026-08-22T01:10:00.000Z',
    clockOutAt: '2026-08-22T09:30:00.000Z'
  }, '2026-08-22T12:00:00.000Z');
  assert.equal(updated.length, 2);
  assert.equal(updated.find((item) => item.id === 'attendance-1').clockInAt, '2026-08-22T01:10:00.000Z');
  assert.throws(() => normalizeAttendance({
    date: '2026-08-22',
    clockInAt: '2026-08-22T09:00:00.000Z',
    clockOutAt: '2026-08-22T08:00:00.000Z'
  }), /下班时间必须晚于上班时间/);
});

test('closes an unfinished previous-day attendance segment at local midnight', () => {
  const records = [{
    id: 'attendance-stale',
    date: '2026-08-22',
    clockInAt: new Date(2026, 7, 22, 9, 0).toISOString(),
    clockOutAt: null,
    appUsage: { chrome: 120 },
    createdAt: new Date(2026, 7, 22, 9, 0).toISOString(),
    updatedAt: new Date(2026, 7, 22, 9, 0).toISOString()
  }];
  const now = new Date(2026, 7, 23, 9, 0);
  const result = closeStaleAttendanceRecords(records, now, now.toISOString());
  assert.equal(result.changed, true);
  assert.equal(result.records[0].clockOutAt, new Date(2026, 7, 23, 0, 0).toISOString());
  assert.deepEqual(result.records[0].appUsage, { chrome: 120 });
  assert.equal(result.records[0].updatedAt, now.toISOString());
  assert.equal(closeStaleAttendanceRecords(result.records, now).changed, false);
});

test('focus sessions retain local app usage and validate their time range', () => {
  const sessions = saveFocusSession([], {
    startedAt: '2026-08-22T01:00:00.000Z',
    endedAt: '2026-08-22T01:25:00.000Z',
    plannedMinutes: 25,
    status: 'completed',
    appUsage: { chrome: 600, WINWORD: 420 }
  }, '2026-08-22T01:25:00.000Z', () => 'focus-1');
  assert.equal(sessions[0].id, 'focus-1');
  assert.equal(sessions[0].appUsage.chrome, 600);
  assert.equal(sessions[0].plannedMinutes, 25);
  assert.throws(() => normalizeFocusSession({
    startedAt: '2026-08-22T02:00:00.000Z',
    endedAt: '2026-08-22T01:00:00.000Z'
  }), /结束时间无效/);
});

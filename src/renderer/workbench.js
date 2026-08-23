'use strict';

const workbenchApi = window.paperTrail;
const wb = {
  page: 'home',
  workspace: { schedules: [], notes: [], metadataFields: [], attendance: [], focusSessions: [] },
  selectedDate: new Date(),
  attendanceWeekStart: null,
  editingNote: null,
  scheduleRecognition: null,
  scheduleRecognitionRequest: 0,
  usageRange: 'day'
};

const pageTitles = Object.freeze({ home: '主页', schedule: '日程', attendance: '打卡', notes: '笔记', submissions: '投稿管理', settings: '设置' });
const SCHEDULE_DRAFT_KEY = 'yanji.scheduleDraft.v1';
const priorityLabels = Object.freeze({ high: '最高', medium: '重要', low: '普通' });
const UI_ICON_PATHS = Object.freeze({
  check: '<path d="m6 12 4 4 8-9"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  note: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M15 3.5v4h4M9 12h6M9 16h4"/>',
  external: '<path d="M13 5h6v6M19 5l-8 8"/><path d="M17 13v6H5V7h6"/>'
});

function uiIcon(name, className = 'ui-icon') {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${UI_ICON_PATHS[name] || ''}</svg>`;
}

function wbEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfWeek(date = new Date()) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function sameDay(value, date) {
  return localDateKey(new Date(value)) === localDateKey(date);
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

function formatUpdated(value) {
  const elapsed = Date.now() - Date.parse(value);
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

function attendanceElapsedMs(record, now = Date.now()) {
  if (!record?.clockInAt) return 0;
  const end = record.clockOutAt ? Date.parse(record.clockOutAt) : now;
  return Math.max(0, end - Date.parse(record.clockInAt));
}

function showWorkbenchToast(message, tone = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${tone}`;
  clearTimeout(showWorkbenchToast.timer);
  showWorkbenchToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function openWorkbenchDialog(dialog) {
  dialog.showModal();
  workbenchApi.setModalWindowState(true).catch(() => {});
}

function closeWorkbenchDialog(dialog) {
  dialog.close();
  const anyOpen = [...document.querySelectorAll('dialog')].some((item) => item.open);
  workbenchApi.setModalWindowState(anyOpen).catch(() => {});
}

function switchWorkbenchPage(page) {
  if (!pageTitles[page]) return;
  wb.page = page;
  document.querySelectorAll('[data-workbench-page]').forEach((button) => button.classList.toggle('active', button.dataset.workbenchPage === page));
  document.querySelectorAll('[data-page]').forEach((section) => { section.hidden = section.dataset.page !== page; });
  if (page === 'schedule') renderTimeline();
  if (page === 'attendance') renderAttendance();
  if (page === 'notes') renderNotes();
}

function renderClock() {
  const now = new Date();
  const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  document.getElementById('topbarClock').textContent = clock;
  renderHomeAttendance();
  renderFocus();
}

function schedulesForDay(date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  return wb.workspace.schedules
    .filter((schedule) => Date.parse(schedule.startAt) < dayEnd.getTime() && Date.parse(schedule.endAt) > dayStart.getTime())
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

function scheduleTimeForDay(schedule, date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);
  const start = new Date(Math.max(Date.parse(schedule.startAt), dayStart.getTime()));
  const end = new Date(Math.min(Date.parse(schedule.endAt), dayEnd.getTime()));
  return {
    label: `${Date.parse(schedule.startAt) < dayStart.getTime() ? '00:00' : formatTime(start)}–${Date.parse(schedule.endAt) > dayEnd.getTime() ? '24:00' : formatTime(end)}`,
    spansDay: !sameDay(schedule.startAt, new Date(schedule.endAt))
  };
}

function renderHome() {
  const today = new Date();
  const labels = ['昨天', '今天', '明天', '后天'];
  const overview = labels.map((label, index) => {
    const date = addDays(today, index - 1);
    const events = schedulesForDay(date);
    const items = events.slice(0, 3).map((item) => `<button class="day-mini-event tone-${item.priority}" data-edit-schedule="${wbEscape(item.id)}" type="button"><time>${formatTime(item.startAt)}</time><span>${wbEscape(item.title)}</span></button>`).join('');
    return `<article class="day-card ${index === 1 ? 'today' : ''}"><header><div><strong>${label}</strong><span>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date)}</span></div><b>${events.length}</b></header><div>${items || '<p class="empty-mini">暂时没有安排</p>'}${events.length > 3 ? `<small>还有 ${events.length - 3} 项</small>` : ''}</div></article>`;
  }).join('');
  document.getElementById('homeDayOverview').innerHTML = overview;
  renderHomeProgress();

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const focus = schedulesForDay(today)
    .filter((item) => !item.completedAt)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || Date.parse(a.startAt) - Date.parse(b.startAt))
    .slice(0, 5);
  document.getElementById('todayFocusList').innerHTML = focus.length ? focus.map((item) => `<button class="focus-row" data-edit-schedule="${wbEscape(item.id)}" type="button"><span class="priority-dot ${item.priority}"></span><time>${formatTime(item.startAt)}</time><div><strong>${wbEscape(item.title)}</strong><small>${item.deadline ? 'Deadline · ' : ''}${priorityLabels[item.priority]}优先级</small></div><i>${uiIcon('chevron')}</i></button>`).join('') : `<div class="workbench-empty"><span class="empty-line-icon">${uiIcon('check')}</span><p>今天还没有安排，给自己留一点从容。</p></div>`;

  const notes = wb.workspace.notes.slice(0, 3);
  document.getElementById('latestNotes').innerHTML = notes.length ? notes.map((note) => `<button class="latest-note" data-edit-note="${wbEscape(note.id)}" type="button"><strong>${wbEscape(note.title)}</strong><p>${wbEscape(note.content.slice(0, 90) || '空白笔记')}</p><span>${formatUpdated(note.updatedAt)}</span></button>`).join('') : `<div class="workbench-empty"><span class="empty-line-icon">${uiIcon('note')}</span><p>还没有笔记，先记下一条想法吧。</p></div>`;
  document.getElementById('navScheduleCount').textContent = String(wb.workspace.schedules.filter((item) => !item.completedAt && Date.parse(item.startAt) >= Date.now() - 86_400_000).length);
  document.getElementById('navNoteCount').textContent = String(wb.workspace.notes.length);
  document.getElementById('navAttendanceCount').textContent = String(new Set(wb.workspace.attendance.filter((item) => item.date >= localDateKey(startOfWeek(new Date()))).map((item) => item.date)).size);
  renderHomeAttendance();
}

function renderHomeAttendance() {
  const button = document.getElementById('homeClockButton');
  if (!button || !wb.workspace) return;
  const todayKey = localDateKey(new Date());
  const openRecord = wb.workspace.attendance.find((item) => !item.clockOutAt && item.date === todayKey);
  button.textContent = openRecord ? '下班打卡' : '上班打卡';
  button.dataset.clockAction = openRecord ? 'out' : 'in';
  button.classList.toggle('is-clocked-in', Boolean(openRecord));
  button.setAttribute('aria-pressed', String(Boolean(openRecord)));
  button.title = openRecord ? '结束当前工作并下班打卡' : '开始工作并上班打卡';
  button.setAttribute('aria-label', openRecord ? '结束当前工作并下班打卡' : '开始工作并上班打卡');
}

function renderHomeProgress() {
  const today = new Date();
  const todaySchedules = schedulesForDay(today);
  const completed = todaySchedules.filter((item) => item.completedAt).length;
  const total = todaySchedules.length;
  const rate = total ? Math.round(completed / total * 100) : 0;
  const focusMs = (wb.workspace.focusSessions || [])
    .filter((session) => sameDay(session.startedAt, today))
    .reduce((sum, session) => sum + focusSessionElapsedMs(session), 0);
  const todayAttendance = wb.workspace.attendance.filter((record) => record.date === localDateKey(today));
  const attendanceMs = todayAttendance.reduce((sum, record) => sum + attendanceElapsedMs(record), 0);
  const attendanceLabel = todayAttendance.some((record) => !record.clockOutAt)
    ? `已工作 ${formatDuration(attendanceMs)}`
    : attendanceMs ? `今日工作 ${formatDuration(attendanceMs)}` : '尚未打卡';
  const headline = total ? `今天进度推进了 ${completed} / ${total} 项` : '今天进度推进了 0 项';
  const subline = total ? `完成率 ${rate}% · ${total - completed ? `还有 ${total - completed} 项待完成` : '今天安排已全部完成'} · ${attendanceLabel}` : `完成率 0% · ${attendanceLabel}`;
  document.getElementById('homeProgressHeadline').textContent = headline;
  document.getElementById('homeProgressSubline').textContent = subline;
  document.getElementById('homeProgressScheduleCount').textContent = String(total);
  document.getElementById('homeProgressCompletedCount').textContent = String(completed);
  document.getElementById('homeProgressRate').textContent = `${rate}%`;
  document.getElementById('homeProgressRateBar').style.width = `${rate}%`;
  document.getElementById('homeProgressFocus').textContent = String(Math.round(focusMs / 60_000));
}

function renderTodaySchedule() {
  const today = new Date();
  const events = schedulesForDay(today);
  const completed = events.filter((item) => item.completedAt).length;
  const rate = events.length ? Math.round(completed / events.length * 100) : 0;
  document.getElementById('todayScheduleTitle').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(today);
  document.getElementById('todayScheduleSubtitle').textContent = events.length ? `${events.length} 项安排 · 完成率 ${rate}%` : '今天还没有安排，先写下一件重要的事';
  document.getElementById('todayScheduleProgress').textContent = `${completed} / ${events.length}`;
  document.getElementById('todayScheduleList').innerHTML = events.length ? events.map((item) => {
    const timing = scheduleTimeForDay(item, today);
    return `<article class="today-schedule-item tone-${item.priority} ${item.completedAt ? 'completed' : ''}"><button class="today-schedule-check" data-complete-schedule="${wbEscape(item.id)}" data-completed="${Boolean(item.completedAt)}" type="button" aria-label="${item.completedAt ? '恢复' : '完成'}${wbEscape(item.title)}">${item.completedAt ? uiIcon('check') : ''}</button><time>${timing.label}</time><div><strong>${wbEscape(item.title)}</strong><small>${item.deadline ? 'Deadline · ' : ''}${priorityLabels[item.priority]}优先级${timing.spansDay ? ' · 跨日' : ''}</small></div><button class="today-schedule-edit" data-edit-schedule="${wbEscape(item.id)}" type="button">编辑</button></article>`;
  }).join('') : '<div class="today-schedule-empty"><span>今日</span><p>还没有安排，给今天留下一件最重要的事</p></div>';
}

function renderTimeline() {
  const selected = wb.selectedDate;
  renderTodaySchedule();
  const rangeStart = addDays(selected, -2);
  const rangeEnd = addDays(selected, 4);
  document.getElementById('timelineDate').textContent = `${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(rangeStart)} — ${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(rangeEnd)}`;
  document.getElementById('timelineDateSubtitle').textContent = `${sameDay(selected, new Date()) ? '今天前两天至后四天' : '所选日期前两天至后四天'} · 点击日期查看并编辑安排`;
  document.getElementById('scheduleBoard').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(rangeStart, index);
    const dateKey = localDateKey(date);
    const events = schedulesForDay(date);
    const cards = events.map((item) => {
      const timing = scheduleTimeForDay(item, date);
      return `<article class="schedule-board-card tone-${item.priority} ${item.completedAt ? 'completed' : ''}"><button class="schedule-card-main" data-edit-schedule="${wbEscape(item.id)}" type="button"><time>${timing.label}</time><strong>${wbEscape(item.title)}</strong><span>${priorityLabels[item.priority]}${item.deadline ? ' · Deadline' : ''}${timing.spansDay ? ' · 跨日' : ''}</span></button><button class="schedule-board-check" data-complete-schedule="${wbEscape(item.id)}" data-completed="${Boolean(item.completedAt)}" type="button" aria-label="${item.completedAt ? '恢复' : '完成'}${wbEscape(item.title)}">${item.completedAt ? uiIcon('check') : '完成'}</button></article>`;
    }).join('');
    return `<section class="schedule-board-column ${sameDay(date, new Date()) ? 'today' : ''} ${sameDay(date, selected) ? 'selected' : ''}" data-board-date="${dateKey}"><button class="schedule-board-heading" data-select-schedule-date="${dateKey}" type="button"><span>${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}</span><strong>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)}</strong><b>${events.length}</b></button><div class="schedule-board-cards">${cards || '<p class="schedule-board-empty">暂无安排</p>'}</div><button class="schedule-board-add" data-add-schedule-date="${dateKey}" type="button">＋ 新建日程</button></section>`;
  }).join('');
  const boardShell = document.querySelector('.schedule-board-shell');
  const selectedColumn = document.querySelector('#scheduleBoard .schedule-board-column.selected');
  if (boardShell && selectedColumn) {
    boardShell.scrollLeft = Math.max(0, selectedColumn.offsetLeft - (boardShell.clientWidth - selectedColumn.clientWidth) / 2);
  }
}

function averageClock(records, key) {
  const values = records
    .map((record) => record[key])
    .filter(Boolean)
    .map((value) => {
      const date = new Date(value);
      return date.getHours() * 60 + date.getMinutes();
    });
  if (!values.length) return '--';
  const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return `${String(Math.floor(average / 60) % 24).padStart(2, '0')}:${String(average % 60).padStart(2, '0')}`;
}

function renderAttendance() {
  if (!wb.attendanceWeekStart) wb.attendanceWeekStart = startOfWeek(new Date());
  const weekStart = wb.attendanceWeekStart;
  const weekEnd = addDays(weekStart, 6);
  document.getElementById('attendanceWeekTitle').textContent = `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(weekStart)} — ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(weekEnd)}`;
  document.getElementById('attendanceGanttHours').innerHTML = '<span></span>' + Array.from({ length: 9 }, (_, index) => `<time>${String(index * 3).padStart(2, '0')}:00</time>`).join('');
  const weekRecords = wb.workspace.attendance.filter((record) => record.date >= localDateKey(weekStart) && record.date <= localDateKey(weekEnd));
  const totalMs = weekRecords.reduce((sum, record) => sum + (record.clockOutAt ? Date.parse(record.clockOutAt) - Date.parse(record.clockInAt) : (record.date === localDateKey(new Date()) ? Date.now() - Date.parse(record.clockInAt) : 0)), 0);
  document.getElementById('attendanceDays').textContent = `${new Set(weekRecords.map((record) => record.date)).size} 天`;
  document.getElementById('attendanceTotal').textContent = formatDuration(totalMs);
  document.getElementById('attendanceAverageStart').textContent = averageClock(weekRecords, 'clockInAt');
  document.getElementById('attendanceAverageEnd').textContent = averageClock(weekRecords, 'clockOutAt');
  const weekday = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  document.getElementById('attendanceGanttRows').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = localDateKey(date);
    const records = weekRecords.filter((item) => item.date === dateKey).sort((a, b) => Date.parse(a.clockInAt) - Date.parse(b.clockInAt));
    const isToday = dateKey === localDateKey(new Date());
    const bars = records.map((record, recordIndex) => {
      const start = new Date(record.clockInAt);
      const end = record.clockOutAt ? new Date(record.clockOutAt) : (isToday ? new Date() : new Date(start));
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = record.clockOutAt || isToday ? Math.max(startMinutes + 8, Math.min(1440, end.getHours() * 60 + end.getMinutes())) : startMinutes + 8;
      const left = startMinutes / 1440 * 100;
      const width = Math.max(.6, (endMinutes - startMinutes) / 1440 * 100);
      const label = record.clockOutAt ? `${formatTime(record.clockInAt)}–${formatTime(record.clockOutAt)}` : `${formatTime(record.clockInAt)}–进行中`;
      return `<button class="attendance-bar ${record.clockOutAt ? '' : 'open'}" style="left:${left}%;width:${width}%;top:${8 + recordIndex * 25}px" data-edit-attendance="${wbEscape(record.id)}" type="button"><span>${label}</span></button>`;
    }).join('');
    return `<div class="attendance-gantt-row ${isToday ? 'today' : ''}" style="min-height:${Math.max(56, 16 + records.length * 25)}px"><div class="attendance-day"><strong>${weekday[index]}</strong><small>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)}${records.length > 1 ? ` · ${records.length} 段` : ''}</small></div><div class="attendance-row-track">${Array.from({ length: 8 }, () => '<i></i>').join('')}${bars}</div></div>`;
  }).join('');
  renderAttendanceUsage();
  renderFocus();
}

function renderAttendanceUsage() {
  const list = document.getElementById('focusUsageList');
  if (!list) return;
  const today = new Date();
  const rangeStart = wb.usageRange === 'week' ? localDateKey(startOfWeek(today)) : localDateKey(today);
  const rangeEnd = wb.usageRange === 'week' ? localDateKey(addDays(startOfWeek(today), 6)) : localDateKey(today);
  const usage = {};
  for (const record of wb.workspace.attendance.filter((item) => item.date >= rangeStart && item.date <= rangeEnd)) {
    for (const [name, seconds] of Object.entries(record.appUsage || {})) usage[name] = (usage[name] || 0) + seconds;
  }
  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const total = entries.reduce((sum, [, seconds]) => sum + seconds, 0);
  const max = Math.max(1, ...entries.map(([, seconds]) => seconds));
  document.getElementById('focusUsageTotal').textContent = `${wb.usageRange === 'week' ? '本周' : '今天'} ${formatDuration(total * 1000)}`;
  document.querySelectorAll('[data-usage-range]').forEach((button) => button.classList.toggle('active', button.dataset.usageRange === wb.usageRange));
  list.innerHTML = entries.length
    ? entries.map(([name, seconds]) => `<div class="focus-usage-row"><div><strong>${wbEscape(name)}</strong><time>${formatDuration(seconds * 1000)}</time></div><span><i style="width:${Math.max(3, seconds / max * 100)}%"></i></span></div>`).join('')
    : `<p class="focus-usage-empty">${wb.usageRange === 'week' ? '本周' : '今天'}还没有打卡期间的应用记录</p>`;
}

function focusSessionElapsedMs(session, now = Date.now()) {
  const started = Date.parse(session.startedAt);
  const ended = session.endedAt ? Date.parse(session.endedAt) : now;
  return Math.max(0, Math.min(ended - started, session.plannedMinutes * 60_000));
}

function renderFocus() {
  const timer = document.getElementById('focusTimeRemaining');
  if (!timer) return;
  const sessions = wb.workspace.focusSessions || [];
  const active = sessions.find((session) => session.status === 'active' && !session.endedAt);
  const todaySessions = sessions.filter((session) => sameDay(session.startedAt, new Date()));
  const todayMs = todaySessions.reduce((sum, session) => sum + focusSessionElapsedMs(session), 0);
  document.getElementById('focusTodaySummary').textContent = `今日 ${formatDuration(todayMs)}`;

  const duration = document.getElementById('focusDuration');
  const suppress = document.getElementById('focusSuppressNotifications');
  const startButton = document.getElementById('startFocusButton');
  const stopButton = document.getElementById('stopFocusButton');
  const caption = document.getElementById('focusTimerCaption');
  const notificationStatus = document.getElementById('focusNotificationStatus');
  const plannedMinutes = active?.plannedMinutes || Number(duration.value) || 50;
  const elapsedMs = active ? focusSessionElapsedMs(active) : 0;
  const remainingSeconds = Math.max(0, Math.ceil((plannedMinutes * 60_000 - elapsedMs) / 1000));
  timer.textContent = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  caption.textContent = active ? '正在专注' : '准备专注';
  document.getElementById('focusRing').style.setProperty('--focus-progress', `${active ? Math.min(1, elapsedMs / (plannedMinutes * 60_000)) * 360 : 0}deg`);
  duration.disabled = Boolean(active);
  document.querySelectorAll('[data-focus-minutes]').forEach((button) => {
    button.disabled = Boolean(active);
    button.classList.toggle('active', Number(button.dataset.focusMinutes) === Number(duration.value));
  });
  suppress.disabled = Boolean(active);
  startButton.hidden = Boolean(active);
  stopButton.hidden = !active;
  if (active?.notificationError) notificationStatus.textContent = active.notificationError;
  else if (active?.notificationsSuppressed) notificationStatus.textContent = '其他软件通知已暂停，计时结束后自动恢复';
  else if (active && !active.suppressNotifications) notificationStatus.textContent = '本次专注未暂停 Windows 通知';
  else notificationStatus.textContent = '仅在计时期间生效，结束后自动恢复';

  renderHomeProgress();
}

function openAttendanceEditor(record = null) {
  const date = record ? dateFromKey(record.date) : new Date();
  const start = record ? new Date(record.clockInAt) : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0);
  const end = record?.clockOutAt ? new Date(record.clockOutAt) : null;
  document.getElementById('attendanceId').value = record?.id || '';
  document.getElementById('attendanceDate').value = record?.date || localDateKey(date);
  document.getElementById('attendanceStartTime').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  document.getElementById('attendanceEndTime').value = end ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : '';
  document.getElementById('attendanceDialogTitle').textContent = record ? '修改打卡' : '补录打卡';
  document.getElementById('deleteAttendanceButton').hidden = !record;
  document.getElementById('attendanceError').textContent = '';
  openWorkbenchDialog(document.getElementById('attendanceDialog'));
}

async function saveAttendanceFromEditor() {
  const error = document.getElementById('attendanceError');
  error.textContent = '';
  const date = document.getElementById('attendanceDate').value;
  const startTime = document.getElementById('attendanceStartTime').value;
  const endTime = document.getElementById('attendanceEndTime').value;
  if (!date || !startTime) {
    error.textContent = '请选择日期和上班时间。';
    return;
  }
  const clockInAt = new Date(`${date}T${startTime}:00`);
  let clockOutAt = null;
  if (endTime) {
    clockOutAt = new Date(`${date}T${endTime}:00`);
    if (clockOutAt <= clockInAt) clockOutAt = new Date(clockOutAt.getTime() + 86_400_000);
  }
  try {
    await workbenchApi.saveAttendance({
      id: document.getElementById('attendanceId').value || undefined,
      date,
      clockInAt: clockInAt.toISOString(),
      clockOutAt: clockOutAt?.toISOString() || null
    });
    wb.attendanceWeekStart = startOfWeek(dateFromKey(date));
    closeWorkbenchDialog(document.getElementById('attendanceDialog'));
    showWorkbenchToast('打卡记录已保存。');
  } catch (exception) {
    error.textContent = exception.message || '打卡记录保存失败。';
  }
}

function openScheduleEditor(schedule = null) {
  const dialog = document.getElementById('scheduleDialog');
  const defaultStart = new Date(wb.selectedDate);
  const now = new Date();
  defaultStart.setHours(sameDay(wb.selectedDate, now) ? Math.min(23, now.getHours() + 1) : 9, 0, 0, 0);
  let draft = null;
  if (!schedule) {
    try { draft = JSON.parse(localStorage.getItem(SCHEDULE_DRAFT_KEY) || 'null'); } catch { draft = null; }
  }
  const start = schedule ? new Date(schedule.startAt) : draft?.date && draft?.startTime ? new Date(`${draft.date}T${draft.startTime}:00`) : defaultStart;
  const end = schedule ? new Date(schedule.endAt) : draft?.date && draft?.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : new Date(start.getTime() + 60 * 60_000);
  document.getElementById('scheduleId').value = schedule?.id || '';
  document.getElementById('scheduleTitle').value = schedule?.title || draft?.title || '';
  document.getElementById('scheduleDate').value = localDateKey(start);
  document.getElementById('scheduleStartTime').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  document.getElementById('scheduleEndTime').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  document.querySelector(`input[name="schedulePriority"][value="${schedule?.priority || draft?.priority || 'low'}"]`).checked = true;
  document.getElementById('scheduleDeadline').checked = Boolean(schedule?.deadline || draft?.deadline);
  wb.scheduleRecognition = !schedule && draft?.recognition?.input === draft?.title ? draft.recognition : null;
  wb.scheduleRecognitionRequest += 1;
  document.getElementById('scheduleRecognition').hidden = true;
  document.getElementById('scheduleRecognition').textContent = '';
  if (wb.scheduleRecognition?.parsed) {
    const parsed = wb.scheduleRecognition.parsed;
    document.getElementById('scheduleRecognition').textContent = parsed.schedules?.length > 1
      ? `将创建 ${parsed.schedules.length} 条日程：${parsed.schedules.map((item) => `${formatTime(item.startAt)} ${item.title}`).join('；')}`
      : `已恢复草稿：${draft.date} ${draft.startTime}–${draft.endTime}`;
    document.getElementById('scheduleRecognition').hidden = false;
  }
  document.getElementById('scheduleDialogTitle').textContent = schedule ? '编辑日程' : '新建日程';
  document.getElementById('deleteScheduleButton').hidden = !schedule;
  document.getElementById('scheduleError').textContent = '';
  openWorkbenchDialog(dialog);
  setTimeout(() => document.getElementById('scheduleTitle').focus(), 20);
}

function captureScheduleDraft() {
  const title = document.getElementById('scheduleTitle').value;
  return {
    title,
    date: document.getElementById('scheduleDate').value,
    startTime: document.getElementById('scheduleStartTime').value,
    endTime: document.getElementById('scheduleEndTime').value,
    priority: document.querySelector('input[name="schedulePriority"]:checked')?.value || 'low',
    deadline: document.getElementById('scheduleDeadline').checked,
    recognition: wb.scheduleRecognition?.input === title.trim() ? wb.scheduleRecognition : null
  };
}

function closeScheduleEditorPreservingDraft() {
  const dialog = document.getElementById('scheduleDialog');
  if (!document.getElementById('scheduleId').value) {
    localStorage.setItem(SCHEDULE_DRAFT_KEY, JSON.stringify(captureScheduleDraft()));
    showWorkbenchToast('日程草稿已保留。');
  }
  closeWorkbenchDialog(dialog);
}

function cancelScheduleEditor() {
  if (!document.getElementById('scheduleId').value) localStorage.removeItem(SCHEDULE_DRAFT_KEY);
  closeWorkbenchDialog(document.getElementById('scheduleDialog'));
}

function clearScheduleDraft() {
  localStorage.removeItem(SCHEDULE_DRAFT_KEY);
}

function parsedScheduleHasTemporalMatch(parsed) {
  return Boolean(parsed?.matches?.some((match) => /今天|明天|后天|大后天|凌晨|早上|上午|中午|下午|傍晚|晚上|月|日|号|点|时|[:：/]|^20\d{2}-/.test(match.text)));
}

async function recognizeScheduleEditorInput() {
  const titleInput = document.getElementById('scheduleTitle');
  const recognition = document.getElementById('scheduleRecognition');
  const input = titleInput.value.trim();
  const request = ++wb.scheduleRecognitionRequest;
  if (document.getElementById('scheduleId').value || !input) {
    wb.scheduleRecognition = null;
    recognition.hidden = true;
    recognition.textContent = '';
    return null;
  }
  try {
    const parsed = await workbenchApi.parseSchedule(input);
    if (request !== wb.scheduleRecognitionRequest || titleInput.value.trim() !== input) return null;
    if (!parsed?.valid || !parsedScheduleHasTemporalMatch(parsed)) {
      wb.scheduleRecognition = null;
      recognition.hidden = true;
      recognition.textContent = '';
      return null;
    }
    const start = new Date(parsed.startAt);
    const end = new Date(parsed.endAt);
    document.getElementById('scheduleDate').value = localDateKey(start);
    document.getElementById('scheduleStartTime').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    document.getElementById('scheduleEndTime').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    document.querySelector(`input[name="schedulePriority"][value="${parsed.priority}"]`).checked = true;
    document.getElementById('scheduleDeadline').checked = Boolean(parsed.deadline);
    wb.scheduleRecognition = { input, parsed };
    recognition.textContent = parsed.schedules?.length > 1
      ? `将创建 ${parsed.schedules.length} 条日程：${parsed.schedules.map((item) => `${formatTime(item.startAt)} ${item.title}`).join('；')}`
      : `已识别：${localDateKey(start)} ${formatTime(start)}–${formatTime(end)} · 保存为“${parsed.title}”`;
    recognition.hidden = false;
    return wb.scheduleRecognition;
  } catch (_error) {
    if (request === wb.scheduleRecognitionRequest) {
      wb.scheduleRecognition = null;
      recognition.hidden = true;
      recognition.textContent = '';
    }
    return null;
  }
}

async function saveScheduleFromEditor() {
  const error = document.getElementById('scheduleError');
  error.textContent = '';
  const scheduleId = document.getElementById('scheduleId').value;
  const inputTitle = document.getElementById('scheduleTitle').value.trim();
  if (!scheduleId && inputTitle && wb.scheduleRecognition?.input !== inputTitle) await recognizeScheduleEditorInput();
  const recognizedTitle = wb.scheduleRecognition?.input === inputTitle ? wb.scheduleRecognition.parsed.title : inputTitle;
  const recognizedSchedules = wb.scheduleRecognition?.input === inputTitle ? wb.scheduleRecognition.parsed.schedules || [] : [];
  const date = document.getElementById('scheduleDate').value;
  const startTime = document.getElementById('scheduleStartTime').value;
  const endTime = document.getElementById('scheduleEndTime').value;
  const startAt = new Date(`${date}T${startTime}:00`);
  let endAt = new Date(`${date}T${endTime}:00`);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  try {
    if (!scheduleId && recognizedSchedules.length > 1) {
      for (const schedule of recognizedSchedules) await workbenchApi.saveSchedule(schedule);
      wb.selectedDate = new Date(recognizedSchedules[0].startAt);
      clearScheduleDraft();
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast(`已创建 ${recognizedSchedules.length} 条日程。`);
      return;
    }
    await workbenchApi.saveSchedule({
      id: scheduleId || undefined,
      title: recognizedTitle,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      priority: document.querySelector('input[name="schedulePriority"]:checked').value,
      deadline: document.getElementById('scheduleDeadline').checked
    });
    wb.selectedDate = dateFromKey(date);
    if (!scheduleId) clearScheduleDraft();
    closeWorkbenchDialog(document.getElementById('scheduleDialog'));
    showWorkbenchToast('日程已保存。');
  } catch (exception) {
    error.textContent = exception.message || '日程保存失败。';
  }
}

function metadataValueText(note) {
  return Object.values(note.metadata || {}).filter((value) => value !== false && value !== '').join(' ');
}

function renderNotes() {
  const query = document.getElementById('noteSearch').value.trim().toLowerCase();
  const notes = wb.workspace.notes.filter((note) => `${note.title} ${note.content} ${metadataValueText(note)}`.toLowerCase().includes(query));
  document.getElementById('notesGrid').innerHTML = notes.length ? notes.map((note) => {
    const metadata = wb.workspace.metadataFields.filter((field) => note.metadata?.[field.id] !== undefined && note.metadata[field.id] !== '' && note.metadata[field.id] !== false).slice(0, 3);
    return `<article class="note-card" data-edit-note="${wbEscape(note.id)}"><header><span>${formatUpdated(note.updatedAt)}</span><button data-sticky-note="${wbEscape(note.id)}" type="button">置顶</button></header><h3>${wbEscape(note.title)}</h3><p>${wbEscape(note.content.slice(0, 220) || '空白笔记')}</p><footer>${metadata.map((field) => `<span>${wbEscape(field.name)} · ${wbEscape(note.metadata[field.id] === true ? '是' : note.metadata[field.id])}</span>`).join('')}</footer></article>`;
  }).join('') : '<div class="workbench-empty notes-empty"><span>✎</span><h3>还没有笔记</h3><p>新建一条笔记，或用全局快捷键随手记录。</p></div>';
}

function renderNoteMetadata(note) {
  const container = document.getElementById('noteMetadataFields');
  const fields = wb.workspace.metadataFields;
  container.innerHTML = fields.length ? fields.map((field) => {
    const value = note?.metadata?.[field.id];
    if (field.type === 'checkbox') return `<label class="metadata-input-row checkbox-row"><span>${wbEscape(field.name)}</span><input data-metadata-value="${wbEscape(field.id)}" data-type="checkbox" type="checkbox" ${value === true ? 'checked' : ''}></label>`;
    if (field.type === 'select') return `<label class="metadata-input-row"><span>${wbEscape(field.name)}</span><select data-metadata-value="${wbEscape(field.id)}" data-type="select"><option value="">未选择</option>${field.options.map((option) => `<option value="${wbEscape(option)}" ${value === option ? 'selected' : ''}>${wbEscape(option)}</option>`).join('')}</select></label>`;
    return `<label class="metadata-input-row"><span>${wbEscape(field.name)}</span><input data-metadata-value="${wbEscape(field.id)}" data-type="text" value="${wbEscape(value || '')}" placeholder="填写${wbEscape(field.name)}"></label>`;
  }).join('') : '<div class="metadata-empty">还没有字段。点击下方按钮添加文本、选择框或复选框。</div>';
  const populated = fields.filter((field) => note?.metadata?.[field.id] !== undefined && note.metadata[field.id] !== '' && note.metadata[field.id] !== false).length;
  document.getElementById('metadataSummary').textContent = fields.length ? `${fields.length} 个字段，已填写 ${populated} 个` : '尚未设置属性字段';
}

function openNoteEditor(note = null) {
  wb.editingNote = note;
  document.getElementById('noteId').value = note?.id || '';
  document.getElementById('noteTitle').value = note?.title || '';
  document.getElementById('noteContent').value = note?.content || '';
  document.getElementById('noteDialogTitle').textContent = note ? '编辑笔记' : '新建笔记';
  document.getElementById('deleteNoteButton').hidden = !note;
  document.getElementById('openStickyFromEditorButton').hidden = !note;
  document.getElementById('noteMetadataPanel').hidden = true;
  document.getElementById('noteError').textContent = '';
  renderNoteMetadata(note || { metadata: {} });
  openWorkbenchDialog(document.getElementById('noteDialog'));
  setTimeout(() => (note ? document.getElementById('noteContent') : document.getElementById('noteTitle')).focus(), 20);
}

function readNoteMetadata() {
  const metadata = {};
  document.querySelectorAll('[data-metadata-value]').forEach((input) => {
    metadata[input.dataset.metadataValue] = input.dataset.type === 'checkbox' ? input.checked : input.value;
  });
  return metadata;
}

async function saveNoteFromEditor() {
  try {
    const note = await workbenchApi.saveNote({
      id: document.getElementById('noteId').value || undefined,
      title: document.getElementById('noteTitle').value,
      content: document.getElementById('noteContent').value,
      metadata: readNoteMetadata()
    });
    wb.editingNote = note;
    closeWorkbenchDialog(document.getElementById('noteDialog'));
    showWorkbenchToast('笔记已保存。');
  } catch (exception) {
    document.getElementById('noteError').textContent = exception.message || '笔记保存失败。';
  }
}

function renderMetadataManager() {
  const list = document.getElementById('metadataFieldList');
  list.innerHTML = wb.workspace.metadataFields.map((field) => metadataFieldRowHtml(field)).join('');
}

function metadataFieldRowHtml(field = {}) {
  const options = Array.isArray(field.options) ? field.options : [];
  return `<div class="metadata-field-row" data-field-id="${wbEscape(field.id || '')}"><input data-field-name value="${wbEscape(field.name || '')}" placeholder="字段名称"><select data-field-type><option value="text" ${field.type === 'text' ? 'selected' : ''}>文本</option><option value="select" ${field.type === 'select' ? 'selected' : ''}>选择框</option><option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>复选框</option></select><div class="metadata-options-editor" ${field.type !== 'select' ? 'hidden' : ''}><div data-option-chips>${options.map((option, index) => `<span>${wbEscape(option)}<button data-remove-option="${index}" type="button" aria-label="删除选项">×</button></span>`).join('')}</div><div class="metadata-option-entry"><input data-option-draft placeholder="输入选项后按 Enter"><button data-add-option type="button">添加</button></div><input data-field-options type="hidden" value="${wbEscape(options.join('\n'))}"></div><button data-remove-field type="button">删除</button></div>`;
}

function updateMetadataOptions(row, values) {
  const options = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].slice(0, 50);
  row.querySelector('[data-field-options]').value = options.join('\n');
  row.querySelector('[data-option-chips]').innerHTML = options.map((option, index) => `<span>${wbEscape(option)}<button data-remove-option="${index}" type="button" aria-label="删除选项">×</button></span>`).join('');
}

function addMetadataOption(row) {
  const draft = row.querySelector('[data-option-draft]');
  const additions = draft.value.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean);
  if (!additions.length) return;
  const existing = row.querySelector('[data-field-options]').value.split('\n').filter(Boolean);
  updateMetadataOptions(row, [...existing, ...additions]);
  draft.value = '';
  draft.focus();
}

function openMetadataManager() {
  renderMetadataManager();
  document.getElementById('metadataError').textContent = '';
  openWorkbenchDialog(document.getElementById('metadataDialog'));
}

async function saveMetadataManager() {
  const fields = [...document.querySelectorAll('.metadata-field-row')].map((row) => ({
    id: row.dataset.fieldId || undefined,
    name: row.querySelector('[data-field-name]').value,
    type: row.querySelector('[data-field-type]').value,
    options: row.querySelector('[data-field-options]').value.split('\n').map((item) => item.trim()).filter(Boolean)
  }));
  try {
    wb.workspace.metadataFields = await workbenchApi.saveMetadataFields(fields);
    closeWorkbenchDialog(document.getElementById('metadataDialog'));
    if (document.getElementById('noteDialog').open) renderNoteMetadata(wb.editingNote || { metadata: readNoteMetadata() });
    showWorkbenchToast('元数据字段已更新。');
  } catch (exception) {
    document.getElementById('metadataError').textContent = exception.message || '字段保存失败。';
  }
}

async function refreshWorkspace(workspace = null) {
  wb.workspace = workspace || await workbenchApi.getWorkspace();
  wb.workspace.attendance ||= [];
  wb.workspace.focusSessions ||= [];
  renderHome();
  if (wb.page === 'schedule') renderTimeline();
  if (wb.page === 'attendance') renderAttendance();
  if (wb.page === 'notes') renderNotes();
}

function bindWorkbenchEvents() {
  document.querySelectorAll('[data-workbench-page]').forEach((button) => button.addEventListener('click', () => switchWorkbenchPage(button.dataset.workbenchPage)));
  document.querySelectorAll('[data-go-page]').forEach((button) => button.addEventListener('click', () => switchWorkbenchPage(button.dataset.goPage)));
  document.getElementById('quickScheduleButton').addEventListener('click', () => openScheduleEditor());
  document.getElementById('quickNoteButton').addEventListener('click', () => openNoteEditor());
  document.getElementById('addScheduleButton').addEventListener('click', () => openScheduleEditor());
  document.getElementById('scheduleTodayButton').addEventListener('click', () => { wb.selectedDate = new Date(); renderTimeline(); });
  document.getElementById('previousDayButton').addEventListener('click', () => { wb.selectedDate = addDays(wb.selectedDate, -1); renderTimeline(); });
  document.getElementById('nextDayButton').addEventListener('click', () => { wb.selectedDate = addDays(wb.selectedDate, 1); renderTimeline(); });
  document.getElementById('saveScheduleButton').addEventListener('click', saveScheduleFromEditor);
  document.getElementById('closeScheduleButton').addEventListener('click', closeScheduleEditorPreservingDraft);
  document.getElementById('cancelScheduleButton').addEventListener('click', cancelScheduleEditor);
  document.getElementById('scheduleDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeScheduleEditorPreservingDraft();
  });
  document.getElementById('scheduleDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    closeScheduleEditorPreservingDraft();
  });
  document.getElementById('deleteScheduleButton').addEventListener('click', async () => {
    const id = document.getElementById('scheduleId').value;
    const accepted = id && await window.yanjiConfirm({ title: '删除日程', message: '这条日程将从时间轴中移除，此操作无法撤销', confirmText: '删除日程', tone: 'danger' });
    if (accepted) {
      await workbenchApi.deleteSchedule(id);
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast('日程已删除');
    }
  });
  document.getElementById('homeClockButton').addEventListener('click', async (event) => {
    const recordId = event.currentTarget.dataset.editAttendance;
    if (recordId) return openAttendanceEditor(wb.workspace.attendance.find((item) => item.id === recordId));
    const action = event.currentTarget.dataset.clockAction;
    if (!action) return;
    event.currentTarget.disabled = true;
    try {
      const record = await workbenchApi.clockAttendance(action);
      if (!record?.id) throw new Error('打卡记录保存失败');
      const records = wb.workspace.attendance || [];
      wb.workspace.attendance = action === 'in'
        ? [record, ...records.filter((item) => item.id !== record?.id)]
        : records.map((item) => item.id === record?.id ? { ...item, ...record } : item);
      renderHome();
      if (wb.page === 'attendance') renderAttendance();
      showWorkbenchToast(action === 'in' ? '上班打卡成功。' : '下班打卡成功。');
    } catch (exception) {
      showWorkbenchToast(exception.message || '打卡失败。', 'error');
    } finally {
      event.currentTarget.disabled = false;
    }
  });
  document.getElementById('attendanceTodayButton').addEventListener('click', () => { wb.attendanceWeekStart = startOfWeek(new Date()); renderAttendance(); });
  document.getElementById('previousAttendanceWeek').addEventListener('click', () => { wb.attendanceWeekStart = addDays(wb.attendanceWeekStart || startOfWeek(new Date()), -7); renderAttendance(); });
  document.getElementById('nextAttendanceWeek').addEventListener('click', () => { wb.attendanceWeekStart = addDays(wb.attendanceWeekStart || startOfWeek(new Date()), 7); renderAttendance(); });
  document.getElementById('addAttendanceButton').addEventListener('click', () => openAttendanceEditor());
  document.getElementById('saveAttendanceButton').addEventListener('click', saveAttendanceFromEditor);
  document.getElementById('deleteAttendanceButton').addEventListener('click', async () => {
    const id = document.getElementById('attendanceId').value;
    const accepted = id && await window.yanjiConfirm({ title: '删除打卡记录', message: '这一天的上下班时间将被删除，此操作无法撤销', confirmText: '删除记录', tone: 'danger' });
    if (!accepted) return;
    await workbenchApi.deleteAttendance(id);
    wb.workspace.attendance = wb.workspace.attendance.filter((item) => item.id !== id);
    closeWorkbenchDialog(document.getElementById('attendanceDialog'));
    renderHome();
    if (wb.page === 'attendance') renderAttendance();
    showWorkbenchToast('打卡记录已删除');
  });
  document.querySelectorAll('[data-focus-minutes]').forEach((button) => button.addEventListener('click', () => {
    document.getElementById('focusDuration').value = button.dataset.focusMinutes;
    renderFocus();
  }));
  document.querySelectorAll('[data-usage-range]').forEach((button) => button.addEventListener('click', () => {
    wb.usageRange = button.dataset.usageRange;
    renderAttendanceUsage();
  }));
  document.getElementById('startFocusButton').addEventListener('click', async () => {
    const suppressNotifications = document.getElementById('focusSuppressNotifications').checked;
    if (suppressNotifications) {
      const accepted = await window.yanjiConfirm({
        title: '开始专注并暂停通知',
        message: '计时期间，研迹会暂时关闭其他应用的 Windows 横幅通知，并在结束后恢复原设置。系统级提示仍可能出现。',
        confirmText: '开始专注'
      });
      if (!accepted) return;
    }
    const button = document.getElementById('startFocusButton');
    button.disabled = true;
    try {
      wb.workspace.focusSessions = await workbenchApi.startFocus({ plannedMinutes: Number(document.getElementById('focusDuration').value), suppressNotifications });
      renderFocus();
      showWorkbenchToast('专注计时已开始。');
    } catch (exception) {
      showWorkbenchToast(exception.message || '无法开始专注。', 'error');
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('stopFocusButton').addEventListener('click', async () => {
    const accepted = await window.yanjiConfirm({ title: '结束本次专注', message: '已记录的专注时间与应用使用情况会保留。', confirmText: '结束专注' });
    if (!accepted) return;
    try {
      wb.workspace.focusSessions = await workbenchApi.stopFocus();
      renderFocus();
      showWorkbenchToast('专注已结束，Windows 通知设置已恢复。');
    } catch (exception) {
      showWorkbenchToast(exception.message || '结束专注失败。', 'error');
    }
  });
  document.getElementById('addNoteButton').addEventListener('click', () => openNoteEditor());
  document.getElementById('noteSearch').addEventListener('input', renderNotes);
  document.getElementById('notesGrid').addEventListener('contextmenu', async (event) => {
    const noteCard = event.target.closest('[data-edit-note]');
    if (!noteCard) return;
    event.preventDefault();
    const note = wb.workspace.notes.find((item) => item.id === noteCard.dataset.editNote);
    if (!note) return;
    const accepted = await window.yanjiConfirm({ title: '删除笔记', message: `“${note.title}”及其元数据将被删除，此操作无法撤销`, confirmText: '删除笔记', tone: 'danger' });
    if (!accepted) return;
    await workbenchApi.deleteNote(note.id);
    showWorkbenchToast('笔记已删除');
  });
  document.getElementById('saveNoteButton').addEventListener('click', saveNoteFromEditor);
  document.getElementById('deleteNoteButton').addEventListener('click', async () => {
    const id = document.getElementById('noteId').value;
    const accepted = id && await window.yanjiConfirm({ title: '删除笔记', message: '这条笔记及其元数据将被删除，此操作无法撤销', confirmText: '删除笔记', tone: 'danger' });
    if (accepted) {
      await workbenchApi.deleteNote(id);
      closeWorkbenchDialog(document.getElementById('noteDialog'));
      showWorkbenchToast('笔记已删除');
    }
  });
  document.getElementById('toggleNoteMetadataButton').addEventListener('click', () => {
    const panel = document.getElementById('noteMetadataPanel');
    panel.hidden = !panel.hidden;
  });
  document.getElementById('openStickyFromEditorButton').addEventListener('click', () => workbenchApi.openStickyNote(document.getElementById('noteId').value));
  document.getElementById('manageMetadataButton').addEventListener('click', openMetadataManager);
  document.getElementById('openMetadataManagerButton').addEventListener('click', openMetadataManager);
  document.getElementById('addMetadataFieldButton').addEventListener('click', () => {
    const template = document.createElement('template');
    template.innerHTML = metadataFieldRowHtml({ type: 'text', options: [] });
    const row = template.content.firstElementChild;
    document.getElementById('metadataFieldList').append(row);
    row.querySelector('[data-field-name]').focus();
  });
  document.getElementById('metadataFieldList').addEventListener('change', (event) => {
    if (event.target.matches('[data-field-type]')) event.target.closest('.metadata-field-row').querySelector('.metadata-options-editor').hidden = event.target.value !== 'select';
  });
  document.getElementById('metadataFieldList').addEventListener('click', (event) => {
    const row = event.target.closest('.metadata-field-row');
    if (!row) return;
    if (event.target.matches('[data-remove-field]')) row.remove();
    if (event.target.matches('[data-add-option]')) addMetadataOption(row);
    if (event.target.matches('[data-remove-option]')) {
      const options = row.querySelector('[data-field-options]').value.split('\n').filter(Boolean);
      options.splice(Number(event.target.dataset.removeOption), 1);
      updateMetadataOptions(row, options);
    }
  });
  document.getElementById('metadataFieldList').addEventListener('keydown', (event) => {
    if (event.target.matches('[data-option-draft]') && event.key === 'Enter') {
      event.preventDefault();
      addMetadataOption(event.target.closest('.metadata-field-row'));
    }
  });
  document.getElementById('saveMetadataButton').addEventListener('click', saveMetadataManager);
  let scheduleRecognitionTimer;
  let scheduleTitleComposing = false;
  document.getElementById('scheduleTitle').addEventListener('compositionstart', () => { scheduleTitleComposing = true; });
  document.getElementById('scheduleTitle').addEventListener('compositionend', () => {
    scheduleTitleComposing = false;
    clearTimeout(scheduleRecognitionTimer);
    scheduleRecognitionTimer = setTimeout(recognizeScheduleEditorInput, 120);
  });
  document.getElementById('scheduleTitle').addEventListener('input', (event) => {
    if (event.isComposing || scheduleTitleComposing) return;
    clearTimeout(scheduleRecognitionTimer);
    scheduleRecognitionTimer = setTimeout(recognizeScheduleEditorInput, 260);
  });
  document.getElementById('noteDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeWorkbenchDialog(event.currentTarget);
  });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeWorkbenchDialog(document.getElementById(button.dataset.closeDialog))));
  document.body.addEventListener('click', async (event) => {
    const selectedDateTarget = event.target.closest('[data-select-schedule-date]');
    if (selectedDateTarget) {
      wb.selectedDate = dateFromKey(selectedDateTarget.dataset.selectScheduleDate);
      return renderTimeline();
    }
    const addForDateTarget = event.target.closest('[data-add-schedule-date]');
    if (addForDateTarget) {
      wb.selectedDate = dateFromKey(addForDateTarget.dataset.addScheduleDate);
      return openScheduleEditor();
    }
    const attendanceTarget = event.target.closest('[data-edit-attendance]');
    if (attendanceTarget?.dataset.editAttendance) return openAttendanceEditor(wb.workspace.attendance.find((item) => item.id === attendanceTarget.dataset.editAttendance));
    const completeTarget = event.target.closest('[data-complete-schedule]');
    if (completeTarget) return workbenchApi.completeSchedule(completeTarget.dataset.completeSchedule, completeTarget.dataset.completed !== 'true');
    const scheduleTarget = event.target.closest('[data-edit-schedule]');
    if (scheduleTarget) return openScheduleEditor(wb.workspace.schedules.find((item) => item.id === scheduleTarget.dataset.editSchedule));
    const stickyTarget = event.target.closest('[data-sticky-note]');
    if (stickyTarget) { event.stopPropagation(); return workbenchApi.openStickyNote(stickyTarget.dataset.stickyNote); }
    const noteTarget = event.target.closest('[data-edit-note]');
    if (noteTarget) return openNoteEditor(wb.workspace.notes.find((item) => item.id === noteTarget.dataset.editNote));
  });
  document.getElementById('openQuickCaptureButton').addEventListener('click', () => workbenchApi.showCapture());
  document.getElementById('createStickyNoteButton').addEventListener('click', () => workbenchApi.createStickyNote());
  document.getElementById('openScheduleWidgetButton').addEventListener('click', async () => {
    try {
      const result = await workbenchApi.showScheduleWidget();
      showWorkbenchToast(result?.attached ? '当日日程已放到桌面图标层。' : '桌面层连接失败，已打开普通桌面卡片。', result?.attached ? 'success' : 'error');
    } catch (error) {
      showWorkbenchToast(error?.message || '无法打开桌面日程。', 'error');
    }
  });
}

async function initializeWorkbench() {
  bindWorkbenchEvents();
  renderClock();
  setInterval(renderClock, 15_000);
  const settings = await workbenchApi.getSettings().catch(() => null);
  if (settings?.quickCaptureShortcut) document.getElementById('shortcutTip').textContent = settings.quickCaptureShortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
  if (settings?.stickyNoteShortcut) document.getElementById('stickyShortcutTip').textContent = settings.stickyNoteShortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
  await refreshWorkspace();
  workbenchApi.onWorkspaceChanged(refreshWorkspace);
  workbenchApi.onWorkspaceNavigate(switchWorkbenchPage);
  workbenchApi.onFocusChanged((sessions) => {
    wb.workspace.focusSessions = sessions || [];
    renderFocus();
  });
  switchWorkbenchPage('home');
}

initializeWorkbench().catch((error) => showWorkbenchToast(error.message || '工作台加载失败。', 'error'));

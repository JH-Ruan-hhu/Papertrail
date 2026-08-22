'use strict';

const workbenchApi = window.paperTrail;
const wb = {
  page: 'home',
  workspace: { schedules: [], notes: [], metadataFields: [], attendance: [], focusSessions: [] },
  selectedDate: new Date(),
  attendanceWeekStart: null,
  editingNote: null
};

const pageTitles = Object.freeze({ home: '主页', schedule: '日程', attendance: '打卡', notes: '笔记', submissions: '投稿管理', settings: '设置' });
const priorityLabels = Object.freeze({ high: '最高', medium: '重要', low: '普通' });
const dailyQuotes = Object.freeze([
  '千里之行，始于足下。——《道德经》',
  '不积跬步，无以至千里。——《荀子》',
  '锲而不舍，金石可镂。——《荀子》',
  '学而不思则罔，思而不学则殆。——《论语》',
  '博学之，审问之，慎思之，明辨之，笃行之。——《礼记》',
  '知之者不如好之者，好之者不如乐之者。——《论语》',
  '纸上得来终觉浅，绝知此事要躬行。——陆游',
  '业精于勤，荒于嬉；行成于思，毁于随。——韩愈'
]);

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
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  document.getElementById('topbarClock').textContent = clock;
  document.getElementById('homeFeatureClock').textContent = clock;
  document.getElementById('heroDate').textContent = date;
  document.getElementById('homeGreeting').textContent = now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好';
  const localDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000;
  document.getElementById('dailyQuote').textContent = dailyQuotes[Math.abs(Math.floor(localDay)) % dailyQuotes.length];
  renderHomeAttendance();
  renderFocus();
}

function schedulesForDay(date) {
  return wb.workspace.schedules.filter((schedule) => sameDay(schedule.startAt, date));
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

  const priorityRank = { high: 0, medium: 1, low: 2 };
  const focus = schedulesForDay(today)
    .filter((item) => !item.completedAt)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || Date.parse(a.startAt) - Date.parse(b.startAt))
    .slice(0, 5);
  document.getElementById('todayFocusList').innerHTML = focus.length ? focus.map((item) => `<button class="focus-row" data-edit-schedule="${wbEscape(item.id)}" type="button"><span class="priority-dot ${item.priority}"></span><time>${formatTime(item.startAt)}</time><div><strong>${wbEscape(item.title)}</strong><small>${item.deadline ? 'Deadline · ' : ''}${priorityLabels[item.priority]}优先级</small></div><i>›</i></button>`).join('') : '<div class="workbench-empty"><span>✓</span><p>今天还没有安排，给自己留一点从容。</p></div>';

  const notes = wb.workspace.notes.slice(0, 3);
  document.getElementById('latestNotes').innerHTML = notes.length ? notes.map((note) => `<button class="latest-note" data-edit-note="${wbEscape(note.id)}" type="button"><strong>${wbEscape(note.title)}</strong><p>${wbEscape(note.content.slice(0, 90) || '空白笔记')}</p><span>${formatUpdated(note.updatedAt)}</span></button>`).join('') : '<div class="workbench-empty"><span>✦</span><p>还没有笔记，先记下一条想法吧。</p></div>';
  document.getElementById('navScheduleCount').textContent = String(wb.workspace.schedules.filter((item) => !item.completedAt && Date.parse(item.startAt) >= Date.now() - 86_400_000).length);
  document.getElementById('navNoteCount').textContent = String(wb.workspace.notes.length);
  document.getElementById('navAttendanceCount').textContent = String(wb.workspace.attendance.filter((item) => item.date >= localDateKey(startOfWeek(new Date()))).length);
  renderHomeAttendance();
}

function renderHomeAttendance() {
  const status = document.getElementById('homeAttendanceStatus');
  if (!status || !wb.workspace) return;
  const detail = document.getElementById('homeAttendanceDetail');
  const duration = document.getElementById('homeAttendanceDuration');
  const button = document.getElementById('homeClockButton');
  const bar = document.getElementById('homeAttendanceBar');
  const record = wb.workspace.attendance.find((item) => item.date === localDateKey(new Date()));
  button.dataset.clockAction = '';
  button.dataset.editAttendance = '';
  bar.style.left = '0%';
  bar.style.width = '0%';
  if (!record) {
    status.textContent = '尚未打卡';
    detail.textContent = '开始今天的工作时记录上班时间';
    duration.textContent = '--';
    button.textContent = '上班打卡';
    button.dataset.clockAction = 'in';
    return;
  }
  const start = new Date(record.clockInAt);
  const end = record.clockOutAt ? new Date(record.clockOutAt) : new Date();
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = Math.max(startMinutes, Math.min(1440, end.getHours() * 60 + end.getMinutes()));
  bar.style.left = `${startMinutes / 1440 * 100}%`;
  bar.style.width = `${Math.max(0.5, (endMinutes - startMinutes) / 1440 * 100)}%`;
  duration.textContent = formatDuration(end - start);
  if (!record.clockOutAt) {
    status.textContent = '工作中';
    detail.textContent = `${formatTime(record.clockInAt)} 上班，正在累计工作时间`;
    button.textContent = '下班打卡';
    button.dataset.clockAction = 'out';
  } else {
    status.textContent = '今日已完成';
    detail.textContent = `${formatTime(record.clockInAt)}–${formatTime(record.clockOutAt)}`;
    button.textContent = '修改记录';
    button.dataset.editAttendance = record.id;
  }
}

function renderTimeline() {
  const selected = wb.selectedDate;
  document.getElementById('timelineDate').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(selected);
  const distance = Math.round((dateFromKey(localDateKey(selected)) - dateFromKey(localDateKey(new Date()))) / 86_400_000);
  document.getElementById('timelineDateSubtitle').textContent = distance === 0 ? '今天' : distance === 1 ? '明天' : distance === -1 ? '昨天' : distance > 0 ? `${distance} 天后` : `${Math.abs(distance)} 天前`;
  document.getElementById('timelineHours').innerHTML = Array.from({ length: 24 }, (_, hour) => `<span>${String(hour).padStart(2, '0')}:00</span>`).join('');
  const events = schedulesForDay(selected);
  const track = document.getElementById('timelineTrack');
  track.innerHTML = `<div class="timeline-grid">${Array.from({ length: 24 }, () => '<i></i>').join('')}</div>${events.map((item, index) => {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const duration = Math.max(30, Math.min(1440 - startMinutes, (end - start) / 60_000));
    const left = startMinutes / 1440 * 100;
    const width = duration / 1440 * 100;
    return `<button class="timeline-event tone-${item.priority} ${item.completedAt ? 'completed' : ''}" style="left:${left}%;width:${width}%;top:${18 + (index % 4) * 66}px" data-edit-schedule="${wbEscape(item.id)}" type="button"><strong>${wbEscape(item.title)}</strong><span>${formatTime(item.startAt)}–${formatTime(item.endAt)}</span></button>`;
  }).join('')}`;
  const currentLine = track.querySelector('.current-time-line');
  if (currentLine) currentLine.remove();
  if (sameDay(new Date(), selected)) {
    const now = new Date();
    const line = document.createElement('div');
    line.className = 'current-time-line';
    line.style.left = `${(now.getHours() * 60 + now.getMinutes()) / 1440 * 100}%`;
    track.append(line);
  }
  document.getElementById('agendaSummary').textContent = `${events.length} 项安排`;
  document.getElementById('agendaList').innerHTML = events.length ? events.map((item) => `<article class="agenda-row ${item.completedAt ? 'completed' : ''}"><button class="agenda-check" data-complete-schedule="${wbEscape(item.id)}" data-completed="${Boolean(item.completedAt)}" type="button">${item.completedAt ? '✓' : ''}</button><time>${formatTime(item.startAt)}<small>${formatTime(item.endAt)}</small></time><span class="priority-bar ${item.priority}"></span><div><strong>${wbEscape(item.title)}</strong><small>${item.deadline ? 'Deadline · ' : ''}${priorityLabels[item.priority]}优先级</small></div><button class="agenda-edit" data-edit-schedule="${wbEscape(item.id)}" type="button">编辑</button></article>`).join('') : '<div class="workbench-empty large"><span>24</span><p>这一天还没有安排。时间轴是空的，也是可以自由决定的。</p></div>';
  requestAnimationFrame(() => {
    const earliestHour = events.length
      ? Math.min(...events.map((item) => new Date(item.startAt).getHours()))
      : (sameDay(new Date(), selected) ? new Date().getHours() : 9);
    document.getElementById('timelineScroll').scrollLeft = Math.max(0, (earliestHour - 1) * 90);
  });
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
  document.getElementById('attendanceDays').textContent = `${weekRecords.length} 天`;
  document.getElementById('attendanceTotal').textContent = formatDuration(totalMs);
  document.getElementById('attendanceAverageStart').textContent = averageClock(weekRecords, 'clockInAt');
  document.getElementById('attendanceAverageEnd').textContent = averageClock(weekRecords, 'clockOutAt');
  const weekday = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  document.getElementById('attendanceGanttRows').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = localDateKey(date);
    const record = weekRecords.find((item) => item.date === dateKey);
    const isToday = dateKey === localDateKey(new Date());
    let bar = '';
    if (record) {
      const start = new Date(record.clockInAt);
      const end = record.clockOutAt ? new Date(record.clockOutAt) : (isToday ? new Date() : new Date(start));
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = record.clockOutAt || isToday ? Math.max(startMinutes + 8, Math.min(1440, end.getHours() * 60 + end.getMinutes())) : startMinutes + 8;
      const left = startMinutes / 1440 * 100;
      const width = Math.max(.6, (endMinutes - startMinutes) / 1440 * 100);
      const label = record.clockOutAt ? `${formatTime(record.clockInAt)}–${formatTime(record.clockOutAt)}` : `${formatTime(record.clockInAt)}–进行中`;
      bar = `<button class="attendance-bar ${record.clockOutAt ? '' : 'open'}" style="left:${left}%;width:${width}%" data-edit-attendance="${wbEscape(record.id)}" type="button"><span>${label}</span></button>`;
    }
    return `<div class="attendance-gantt-row ${isToday ? 'today' : ''}"><div class="attendance-day"><strong>${weekday[index]}</strong><small>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)}</small></div><div class="attendance-row-track">${Array.from({ length: 8 }, () => '<i></i>').join('')}${bar}</div></div>`;
  }).join('');
  renderFocus();
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
  suppress.disabled = Boolean(active);
  startButton.hidden = Boolean(active);
  stopButton.hidden = !active;
  if (active?.notificationError) notificationStatus.textContent = active.notificationError;
  else if (active?.notificationsSuppressed) notificationStatus.textContent = '其他软件通知已暂停，计时结束后自动恢复';
  else if (active && !active.suppressNotifications) notificationStatus.textContent = '本次专注未暂停 Windows 通知';
  else notificationStatus.textContent = '仅在计时期间生效，结束后自动恢复';

  const usage = {};
  for (const session of todaySessions) {
    for (const [name, seconds] of Object.entries(session.appUsage || {})) usage[name] = (usage[name] || 0) + seconds;
  }
  const usageEntries = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const usageTotal = usageEntries.reduce((sum, [, seconds]) => sum + seconds, 0);
  const usageMax = Math.max(1, ...usageEntries.map(([, seconds]) => seconds));
  document.getElementById('focusUsageTotal').textContent = formatDuration(usageTotal * 1000);
  document.getElementById('focusUsageList').innerHTML = usageEntries.length
    ? usageEntries.map(([name, seconds]) => `<div class="focus-usage-row"><div><strong>${wbEscape(name)}</strong><time>${formatDuration(seconds * 1000)}</time></div><span><i style="width:${Math.max(3, seconds / usageMax * 100)}%"></i></span></div>`).join('')
    : '<p class="focus-usage-empty">开始专注后自动统计</p>';
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
  const start = schedule ? new Date(schedule.startAt) : defaultStart;
  const end = schedule ? new Date(schedule.endAt) : new Date(start.getTime() + 60 * 60_000);
  document.getElementById('scheduleId').value = schedule?.id || '';
  document.getElementById('scheduleTitle').value = schedule?.title || '';
  document.getElementById('scheduleDate').value = localDateKey(start);
  document.getElementById('scheduleStartTime').value = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  document.getElementById('scheduleEndTime').value = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  document.querySelector(`input[name="schedulePriority"][value="${schedule?.priority || 'low'}"]`).checked = true;
  document.getElementById('scheduleDeadline').checked = Boolean(schedule?.deadline);
  document.getElementById('scheduleDialogTitle').textContent = schedule ? '编辑日程' : '新建日程';
  document.getElementById('deleteScheduleButton').hidden = !schedule;
  document.getElementById('scheduleError').textContent = '';
  openWorkbenchDialog(dialog);
  setTimeout(() => document.getElementById('scheduleTitle').focus(), 20);
}

async function saveScheduleFromEditor() {
  const error = document.getElementById('scheduleError');
  error.textContent = '';
  const date = document.getElementById('scheduleDate').value;
  const startTime = document.getElementById('scheduleStartTime').value;
  const endTime = document.getElementById('scheduleEndTime').value;
  const startAt = new Date(`${date}T${startTime}:00`);
  let endAt = new Date(`${date}T${endTime}:00`);
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  try {
    await workbenchApi.saveSchedule({
      id: document.getElementById('scheduleId').value || undefined,
      title: document.getElementById('scheduleTitle').value,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      priority: document.querySelector('input[name="schedulePriority"]:checked').value,
      deadline: document.getElementById('scheduleDeadline').checked
    });
    wb.selectedDate = dateFromKey(date);
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
  list.innerHTML = wb.workspace.metadataFields.map((field) => `<div class="metadata-field-row" data-field-id="${wbEscape(field.id)}"><input data-field-name value="${wbEscape(field.name)}" placeholder="字段名称"><select data-field-type><option value="text" ${field.type === 'text' ? 'selected' : ''}>文本</option><option value="select" ${field.type === 'select' ? 'selected' : ''}>选择框</option><option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>复选框</option></select><input data-field-options value="${wbEscape(field.options.join('，'))}" placeholder="选项，用逗号分隔" ${field.type !== 'select' ? 'hidden' : ''}><button data-remove-field type="button">删除</button></div>`).join('');
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
    options: row.querySelector('[data-field-options]').value.split(/[，,]/).map((item) => item.trim()).filter(Boolean)
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

async function loadWallpaper() {
  const wallpaper = await workbenchApi.getBingWallpaper().catch(() => null);
  const image = document.getElementById('bingWallpaper');
  if (!wallpaper?.url) {
    image.removeAttribute('src');
    document.getElementById('wallpaperCredit').textContent = '离线专注模式';
    return;
  }
  image.src = wallpaper.url;
  document.getElementById('wallpaperCredit').textContent = wallpaper.copyright;
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
  document.getElementById('addScheduleButton').addEventListener('click', () => openScheduleEditor());
  document.getElementById('scheduleTodayButton').addEventListener('click', () => { wb.selectedDate = new Date(); renderTimeline(); });
  document.getElementById('previousDayButton').addEventListener('click', () => { wb.selectedDate = addDays(wb.selectedDate, -1); renderTimeline(); });
  document.getElementById('nextDayButton').addEventListener('click', () => { wb.selectedDate = addDays(wb.selectedDate, 1); renderTimeline(); });
  document.getElementById('saveScheduleButton').addEventListener('click', saveScheduleFromEditor);
  document.getElementById('deleteScheduleButton').addEventListener('click', async () => {
    const id = document.getElementById('scheduleId').value;
    const accepted = id && await window.yanjiConfirm({ title: '删除日程', message: '这条日程将从时间轴中移除，此操作无法撤销。', confirmText: '删除日程', tone: 'danger' });
    if (accepted) {
      await workbenchApi.deleteSchedule(id);
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast('日程已删除。');
    }
  });
  document.getElementById('homeClockButton').addEventListener('click', async (event) => {
    const recordId = event.currentTarget.dataset.editAttendance;
    if (recordId) return openAttendanceEditor(wb.workspace.attendance.find((item) => item.id === recordId));
    const action = event.currentTarget.dataset.clockAction;
    if (!action) return;
    event.currentTarget.disabled = true;
    try {
      await workbenchApi.clockAttendance(action);
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
    const accepted = id && await window.yanjiConfirm({ title: '删除打卡记录', message: '这一天的上下班时间将被删除，此操作无法撤销。', confirmText: '删除记录', tone: 'danger' });
    if (!accepted) return;
    await workbenchApi.deleteAttendance(id);
    closeWorkbenchDialog(document.getElementById('attendanceDialog'));
    showWorkbenchToast('打卡记录已删除。');
  });
  document.getElementById('focusDuration').addEventListener('change', renderFocus);
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
  document.getElementById('saveNoteButton').addEventListener('click', saveNoteFromEditor);
  document.getElementById('deleteNoteButton').addEventListener('click', async () => {
    const id = document.getElementById('noteId').value;
    const accepted = id && await window.yanjiConfirm({ title: '删除笔记', message: '这条笔记及其元数据将被删除，此操作无法撤销。', confirmText: '删除笔记', tone: 'danger' });
    if (accepted) {
      await workbenchApi.deleteNote(id);
      closeWorkbenchDialog(document.getElementById('noteDialog'));
      showWorkbenchToast('笔记已删除。');
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
    const row = document.createElement('div');
    row.className = 'metadata-field-row';
    row.innerHTML = '<input data-field-name placeholder="字段名称"><select data-field-type><option value="text">文本</option><option value="select">选择框</option><option value="checkbox">复选框</option></select><input data-field-options placeholder="选项，用逗号分隔" hidden><button data-remove-field type="button">删除</button>';
    document.getElementById('metadataFieldList').append(row);
    row.querySelector('input').focus();
  });
  document.getElementById('metadataFieldList').addEventListener('change', (event) => {
    if (event.target.matches('[data-field-type]')) event.target.closest('.metadata-field-row').querySelector('[data-field-options]').hidden = event.target.value !== 'select';
  });
  document.getElementById('metadataFieldList').addEventListener('click', (event) => { if (event.target.matches('[data-remove-field]')) event.target.closest('.metadata-field-row').remove(); });
  document.getElementById('saveMetadataButton').addEventListener('click', saveMetadataManager);
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => closeWorkbenchDialog(document.getElementById(button.dataset.closeDialog))));
  document.body.addEventListener('click', async (event) => {
    const attendanceTarget = event.target.closest('[data-edit-attendance]');
    if (attendanceTarget?.dataset.editAttendance) return openAttendanceEditor(wb.workspace.attendance.find((item) => item.id === attendanceTarget.dataset.editAttendance));
    const scheduleTarget = event.target.closest('[data-edit-schedule]');
    if (scheduleTarget) return openScheduleEditor(wb.workspace.schedules.find((item) => item.id === scheduleTarget.dataset.editSchedule));
    const completeTarget = event.target.closest('[data-complete-schedule]');
    if (completeTarget) return workbenchApi.completeSchedule(completeTarget.dataset.completeSchedule, completeTarget.dataset.completed !== 'true');
    const stickyTarget = event.target.closest('[data-sticky-note]');
    if (stickyTarget) { event.stopPropagation(); return workbenchApi.openStickyNote(stickyTarget.dataset.stickyNote); }
    const noteTarget = event.target.closest('[data-edit-note]');
    if (noteTarget) return openNoteEditor(wb.workspace.notes.find((item) => item.id === noteTarget.dataset.editNote));
  });
  document.getElementById('openQuickCaptureButton').addEventListener('click', () => workbenchApi.showCapture());
}

async function initializeWorkbench() {
  bindWorkbenchEvents();
  renderClock();
  setInterval(renderClock, 15_000);
  const settings = await workbenchApi.getSettings().catch(() => null);
  if (settings?.quickCaptureShortcut) document.getElementById('shortcutTip').textContent = settings.quickCaptureShortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
  await Promise.all([refreshWorkspace(), loadWallpaper()]);
  workbenchApi.onWorkspaceChanged(refreshWorkspace);
  workbenchApi.onWorkspaceNavigate(switchWorkbenchPage);
  workbenchApi.onFocusChanged((sessions) => {
    wb.workspace.focusSessions = sessions || [];
    renderFocus();
  });
  switchWorkbenchPage('home');
}

initializeWorkbench().catch((error) => showWorkbenchToast(error.message || '工作台加载失败。', 'error'));

'use strict';

const workbenchApi = window.paperTrail;
const wb = {
  page: 'home',
  workspace: { schedules: [], notes: [], metadataFields: [] },
  selectedDate: new Date(),
  editingNote: null
};

const pageTitles = Object.freeze({ home: '主页', schedule: '日程', notes: '笔记', submissions: '投稿管理' });
const priorityLabels = Object.freeze({ high: '最高', medium: '重要', low: '普通' });

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
  document.getElementById('workbenchPageTitle').textContent = pageTitles[page];
  if (page === 'schedule') renderTimeline();
  if (page === 'notes') renderNotes();
}

function renderClock() {
  const now = new Date();
  const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const date = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  document.getElementById('topbarClock').textContent = clock;
  document.getElementById('topbarDate').textContent = date;
  document.getElementById('heroClock').textContent = clock;
  document.getElementById('heroDate').textContent = date;
  document.getElementById('homeGreeting').textContent = now.getHours() < 11 ? '早上好' : now.getHours() < 14 ? '中午好' : now.getHours() < 18 ? '下午好' : '晚上好';
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

  const focus = schedulesForDay(today).filter((item) => !item.completedAt).slice(0, 5);
  document.getElementById('todayFocusList').innerHTML = focus.length ? focus.map((item) => `<button class="focus-row" data-edit-schedule="${wbEscape(item.id)}" type="button"><span class="priority-dot ${item.priority}"></span><time>${formatTime(item.startAt)}</time><div><strong>${wbEscape(item.title)}</strong><small>${item.deadline ? 'Deadline · ' : ''}${priorityLabels[item.priority]}优先级</small></div><i>›</i></button>`).join('') : '<div class="workbench-empty"><span>✓</span><p>今天还没有安排，给自己留一点从容。</p></div>';

  const notes = wb.workspace.notes.slice(0, 3);
  document.getElementById('latestNotes').innerHTML = notes.length ? notes.map((note) => `<button class="latest-note" data-edit-note="${wbEscape(note.id)}" type="button"><strong>${wbEscape(note.title)}</strong><p>${wbEscape(note.content.slice(0, 90) || '空白笔记')}</p><span>${formatUpdated(note.updatedAt)}</span></button>`).join('') : '<div class="workbench-empty"><span>✦</span><p>还没有笔记，先记下一条想法吧。</p></div>';
  document.getElementById('navScheduleCount').textContent = String(wb.workspace.schedules.filter((item) => !item.completedAt && Date.parse(item.startAt) >= Date.now() - 86_400_000).length);
  document.getElementById('navNoteCount').textContent = String(wb.workspace.notes.length);
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
    return `<article class="note-card" data-edit-note="${wbEscape(note.id)}"><header><span>${formatUpdated(note.updatedAt)}</span><button data-sticky-note="${wbEscape(note.id)}" type="button" title="悬浮便笺">⌖</button></header><h3>${wbEscape(note.title)}</h3><p>${wbEscape(note.content.slice(0, 220) || '空白笔记')}</p><footer>${metadata.map((field) => `<span>${wbEscape(field.name)} · ${wbEscape(note.metadata[field.id] === true ? '是' : note.metadata[field.id])}</span>`).join('')}</footer></article>`;
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
  list.innerHTML = wb.workspace.metadataFields.map((field) => `<div class="metadata-field-row" data-field-id="${wbEscape(field.id)}"><input data-field-name value="${wbEscape(field.name)}" placeholder="字段名称"><select data-field-type><option value="text" ${field.type === 'text' ? 'selected' : ''}>文本</option><option value="select" ${field.type === 'select' ? 'selected' : ''}>选择框</option><option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>复选框</option></select><input data-field-options value="${wbEscape(field.options.join('，'))}" placeholder="选项，用逗号分隔" ${field.type !== 'select' ? 'hidden' : ''}><button data-remove-field type="button">×</button></div>`).join('');
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
  renderHome();
  if (wb.page === 'schedule') renderTimeline();
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
    if (id && confirm('确定删除这条日程吗？')) {
      await workbenchApi.deleteSchedule(id);
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast('日程已删除。');
    }
  });
  document.getElementById('addNoteButton').addEventListener('click', () => openNoteEditor());
  document.getElementById('noteSearch').addEventListener('input', renderNotes);
  document.getElementById('saveNoteButton').addEventListener('click', saveNoteFromEditor);
  document.getElementById('deleteNoteButton').addEventListener('click', async () => {
    const id = document.getElementById('noteId').value;
    if (id && confirm('确定删除这条笔记吗？')) {
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
    row.innerHTML = '<input data-field-name placeholder="字段名称"><select data-field-type><option value="text">文本</option><option value="select">选择框</option><option value="checkbox">复选框</option></select><input data-field-options placeholder="选项，用逗号分隔" hidden><button data-remove-field type="button">×</button>';
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
  switchWorkbenchPage('home');
}

initializeWorkbench().catch((error) => showWorkbenchToast(error.message || '工作台加载失败。', 'error'));

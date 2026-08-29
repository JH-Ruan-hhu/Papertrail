'use strict';

const workbenchApi = window.paperTrail;
const wb = {
  page: 'home',
  settings: {},
  pendingTodoId: null,
  convertingTodoId: null,
  editingScheduleTodoId: null,
  workspace: { schedules: [], todos: [], notes: [], metadataFields: [], attendance: [], focusSessions: [], jobApplications: [] },
  selectedDate: new Date(),
  attendanceWeekStart: null,
  editingNote: null,
  scheduleRecognition: null,
  scheduleRecognitionRequest: 0,
  usageRange: 'day',
  noteSaveTimer: null,
  noteSavePromise: null,
  noteDirty: false,
  noteEditGeneration: 0,
  noteSelection: null,
  noteAttachmentMutation: false,
  previewingNoteImage: null,
  scheduleDraftTimer: null,
  pendingScheduleHighlightId: null,
  jobQuickFilter: 'all',
  jobSort: 'priorityProgress',
  jobSortDirection: 'desc',
  editingJobWorkflow: null,
  noteConflict: false
};

function syncViewportDensity() {
  const viewport = window.visualViewport;
  const width = Math.max(1, Math.round(viewport?.width || window.innerWidth));
  const height = Math.max(1, Math.round(viewport?.height || window.innerHeight));
  const density = height <= 760 ? 'ultra-compact' : height <= 900 ? 'compact' : 'roomy';
  document.documentElement.dataset.viewportDensity = density;
  document.documentElement.dataset.viewportWidth = width <= 1040 ? 'narrow' : 'wide';
  document.documentElement.style.setProperty('--viewport-width', `${width}px`);
  document.documentElement.style.setProperty('--viewport-height', `${height}px`);
}

syncViewportDensity();
window.addEventListener('resize', syncViewportDensity, { passive: true });
window.addEventListener('resize', () => requestAnimationFrame(fitHomeDayCards), { passive: true });
window.visualViewport?.addEventListener('resize', syncViewportDensity, { passive: true });

const pageTitles = Object.freeze({ home: '首页', todos: '待办', schedule: '日程', attendance: '打卡', notes: '笔记', jobs: '求职', submissions: '投稿', settings: '设置' });
const SCHEDULE_DRAFT_KEY = 'yanji.scheduleDraft.v1';
const DAILY_PLAN_KEY = 'yanji.dailyPlanShown.v1';
const priorityLabels = Object.freeze({ high: '最高', medium: '重要', low: '普通' });
const jobPriorityRanks = Object.freeze({ high: 0, medium: 1, low: 2 });
const JOB_LIFECYCLE_OPTIONS = Object.freeze([
  ['preparing', '准备中'],
  ['active', '进行中'],
  ['paused', '暂停'],
  ['closed', '已结束']
]);
const JOB_PRIORITY_OPTIONS = Object.freeze([
  ['high', '高'],
  ['medium', '中'],
  ['low', '低']
]);
const JOB_QUICK_FILTER_OPTIONS = Object.freeze([
  ['all', '全部岗位'],
  ['today-added', '今天新增'],
  ['awaiting-review', '待评估'],
  ['high-priority', '高优先级'],
  ['due-soon', '快截止'],
  ['submitted', '已投递'],
  ['interviewing', '面试中'],
  ['follow-up', '待跟进'],
  ['incomplete', '未完成'],
  ['imported', '历史导入'],
  ['has-notes', '有备注'],
  ['closed', '已结束']
]);
const DEFAULT_JOB_WORKFLOW_STAGES = Object.freeze([
  Object.freeze({ id: 'stage-apply', name: '投递' }),
  Object.freeze({ id: 'stage-assessment', name: '测评' }),
  Object.freeze({ id: 'stage-first-interview', name: '一面' }),
  Object.freeze({ id: 'stage-second-interview', name: '二面' }),
  Object.freeze({ id: 'stage-third-interview', name: '三面' }),
  Object.freeze({ id: 'stage-final-interview', name: '终面' }),
  Object.freeze({ id: 'stage-offer', name: 'Offer' })
]);
const HOME_JOB_FUNNEL_OPTIONS = Object.freeze([
  ['submitted', '已投递'],
  ['assessment', '测评'],
  ['interview', '面试'],
  ['offer', 'Offer']
]);
const UI_ICON_PATHS = Object.freeze({
  check: '<path d="m6 12 4 4 8-9"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  note: '<path d="M6 3.5h9l3 3v14H6z"/><path d="M15 3.5v4h4M9 12h6M9 16h4"/>',
  external: '<path d="M13 5h6v6M19 5l-8 8"/><path d="M17 13v6H5V7h6"/>',
  eye: '<path d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5Z"/><circle cx="12" cy="12" r="2"/>',
  trash: '<path d="M5 7h14M9 7V4h6v3M7 7l.8 13h8.4L17 7M10 11v5M14 11v5"/>',
  upload: '<path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5"/>',
  download: '<path d="M12 4v12M8 12l4 4 4-4M5 19h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'
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
  toast.textContent = String(message ?? '').replace(/[。]+$/g, '');
  toast.className = `toast show ${tone}`;
  clearTimeout(showWorkbenchToast.timer);
  showWorkbenchToast.timer = setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function openWorkbenchDialog(dialog) {
  if (dialog?.open) return;
  window.YanjiMotion?.animateDialog(dialog);
  dialog.showModal();
  workbenchApi.setModalWindowState(true).catch(() => {});
}

function closeWorkbenchDialog(dialog) {
  const finish = () => {
    const anyOpen = [...document.querySelectorAll('dialog')].some((item) => item.open);
    workbenchApi.setModalWindowState(anyOpen).catch(() => {});
  };
  if (window.YanjiMotion?.closeDialog) return window.YanjiMotion.closeDialog(dialog, finish);
  if (dialog?.open) dialog.close();
  finish();
  return Promise.resolve(true);
}

function switchWorkbenchPage(page, { animate = false } = {}) {
  if (!pageTitles[page]) return;
  const previousPage = wb.page;
  if (wb.page === 'notes' && document.getElementById('noteDialog')?.open) persistNoteDraftLocally();
  if (document.getElementById('scheduleDialog')?.open) flushScheduleDraft();
  window.YanjiTodoView?.flushDraft?.();
  wb.page = page;
  document.querySelectorAll('[data-workbench-page]').forEach((button) => button.classList.toggle('active', button.dataset.workbenchPage === page));
  const sections = [...document.querySelectorAll('[data-page]')];
  sections.forEach((section) => {
    section.classList.remove('page-entering');
    section.hidden = section.dataset.page !== page;
  });
  if (page === 'schedule') renderTimeline();
  if (page === 'todos') window.YanjiTodoView?.render();
  if (page === 'attendance') renderAttendance();
  if (page === 'notes') renderNotes();
  if (page === 'jobs') renderJobs();
  const activeSection = sections.find((section) => section.dataset.page === page);
  if (animate && activeSection && (previousPage !== page || page === 'home')) {
    window.YanjiMotion?.enterPage(activeSection, { force: page === 'home' });
  }
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
    .map((schedule) => {
      if (schedule.repeat !== 'daily') return schedule;
      const sourceStart = new Date(schedule.startAt);
      const sourceEnd = new Date(schedule.endAt);
      const sourceDay = new Date(sourceStart.getFullYear(), sourceStart.getMonth(), sourceStart.getDate());
      if (dayStart < sourceDay) return null;
      const occurrenceStart = new Date(dayStart);
      occurrenceStart.setHours(sourceStart.getHours(), sourceStart.getMinutes(), sourceStart.getSeconds(), sourceStart.getMilliseconds());
      return {
        ...schedule,
        startAt: occurrenceStart.toISOString(),
        endAt: new Date(occurrenceStart.getTime() + (sourceEnd.getTime() - sourceStart.getTime())).toISOString(),
        occurrenceKey: localDateKey(dayStart)
      };
    })
    .filter((schedule) => schedule && Date.parse(schedule.startAt) < dayEnd.getTime() && Date.parse(schedule.endAt) > dayStart.getTime())
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
  const labels = ['今天', '明天', '后天', '三天后'];
  const overview = labels.map((label, index) => {
    const date = addDays(today, index);
    const events = schedulesForDay(date);
    const items = events.map((item) => `<button class="day-mini-event tone-${item.priority}" data-day-event="${wbEscape(item.id)}" data-edit-schedule="${wbEscape(item.id)}" type="button"><time>${formatTime(item.startAt)}</time><span>${wbEscape(item.title)}</span></button>`).join('');
    return `<article class="day-card ${index === 0 ? 'today' : ''}"><header><div><strong>${label}</strong><span>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(date)}</span></div><b>${events.length}</b></header><div>${items || '<p class="empty-mini">暂时没有安排</p>'}<small class="day-more" hidden></small></div></article>`;
  }).join('');
  document.getElementById('homeDayOverview').innerHTML = overview;
  requestAnimationFrame(fitHomeDayCards);
  renderHomeProgress();

  const notes = wb.workspace.notes.slice(0, 3);
  document.getElementById('latestNotes').innerHTML = notes.length ? notes.map((note) => `<button class="latest-note" data-edit-note="${wbEscape(note.id)}" type="button"><strong>${wbEscape(note.title)}</strong><p>${wbEscape(notePlainText(note.content).slice(0, 72) || '空白笔记')}</p><span>${formatUpdated(note.updatedAt)}</span></button>`).join('') : `<div class="workbench-empty"><span class="empty-line-icon">${uiIcon('note')}</span><p>还没有笔记，先记下一条想法吧。</p></div>`;
  document.getElementById('navScheduleCount').textContent = String(wb.workspace.schedules.filter((item) => Date.parse(item.startAt) >= Date.now() - 86_400_000).length);
  document.getElementById('navTodoCount').textContent = String(wb.workspace.todos.filter((item) => item.status === 'open').length);
  document.getElementById('navNoteCount').textContent = String(wb.workspace.notes.length);
  document.getElementById('navJobCount').textContent = String(wb.workspace.jobApplications.filter((item) => item.status !== 'closed').length);
  document.getElementById('navAttendanceCount').textContent = String(new Set(wb.workspace.attendance.filter((item) => item.date >= localDateKey(startOfWeek(new Date()))).map((item) => item.date)).size);
  renderHomeJobs();
  renderHomeCommandCards(today);
  renderHomeAttendance();
}

function jobMeterClass(value, maximum) {
  if (!value || !maximum) return 'job-width-0';
  const percentage = Math.max(5, Math.min(100, Math.round(value / maximum * 20) * 5));
  return `job-width-${percentage}`;
}

function jobDateLabel(value, options = { month: 'numeric', day: 'numeric' }) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date(value));
}

function localDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localDateKey(date) : '';
}

function dateInputToIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function defaultJobWorkflow() {
  const stages = DEFAULT_JOB_WORKFLOW_STAGES.map((stage) => ({ ...stage }));
  return { stages, currentStageId: stages[0].id, timeline: [] };
}

function clientJobWorkflow(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawStages = Array.isArray(source.stages) && source.stages.length ? source.stages : defaultJobWorkflow().stages;
  const used = new Set();
  const stages = rawStages.map((rawStage, index) => {
    const stage = rawStage && typeof rawStage === 'object' ? rawStage : {};
    const baseId = String(stage.id || `stage-${index + 1}`).trim().slice(0, 120) || `stage-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (used.has(id)) id = `${baseId}-${suffix++}`;
    used.add(id);
    return { id, name: String(stage.name || `阶段 ${index + 1}`).trim().slice(0, 120) || `阶段 ${index + 1}` };
  });
  const stageIds = new Set(stages.map((stage) => stage.id));
  const timelineByStage = new Map();
  if (Array.isArray(source.timeline)) {
    source.timeline.forEach((item) => {
      const stageId = String(item?.stageId || '').trim();
      if (!stageIds.has(stageId) || !item?.date || !Number.isFinite(Date.parse(item.date))) return;
      timelineByStage.set(stageId, { stageId, date: new Date(item.date).toISOString() });
    });
  }
  const currentStageId = stageIds.has(source.currentStageId) ? source.currentStageId : stages[0].id;
  return {
    stages,
    currentStageId,
    timeline: stages.filter((stage) => timelineByStage.has(stage.id)).map((stage) => timelineByStage.get(stage.id))
  };
}

function cloneJobWorkflow(value) {
  return JSON.parse(JSON.stringify(clientJobWorkflow(value)));
}

function canonicalJobStage(stage) {
  const id = String(stage?.id || '');
  const name = String(stage?.name || '').trim();
  const aliases = {
    'stage-apply': /^(投递|申请)$/,
    'stage-assessment': /^(测评|网测|笔试|在线测评)$/,
    'stage-first-interview': /^(一面|初面|第一轮面试)$/,
    'stage-second-interview': /^(二面|第二轮面试)$/,
    'stage-third-interview': /^(三面|第三轮面试)$/,
    'stage-final-interview': /^(终面|最终面试)$/,
    'stage-offer': /^offer$/i
  };
  if (id === 'stage-online-test') return DEFAULT_JOB_WORKFLOW_STAGES[1];
  return DEFAULT_JOB_WORKFLOW_STAGES.find((candidate) => candidate.id === id || aliases[candidate.id]?.test(name)) || null;
}

function workflowForStagePicker(value) {
  const source = clientJobWorkflow(value);
  const remappedIds = new Map();
  const claimedCanonicalIds = new Set();
  const stages = [];
  source.stages.forEach((stage) => {
    const canonical = canonicalJobStage(stage);
    if (canonical && !claimedCanonicalIds.has(canonical.id)) {
      claimedCanonicalIds.add(canonical.id);
      remappedIds.set(stage.id, canonical.id);
      stages.push({ ...canonical });
      return;
    }
    if (!canonical) stages.push({ ...stage, legacy: true });
  });
  const applyStage = stages.find((stage) => stage.id === 'stage-apply') || { ...DEFAULT_JOB_WORKFLOW_STAGES[0] };
  const offerStage = stages.find((stage) => stage.id === 'stage-offer') || { ...DEFAULT_JOB_WORKFLOW_STAGES.at(-1) };
  stages.splice(0, stages.length, applyStage, ...stages.filter((stage) => !['stage-apply', 'stage-offer'].includes(stage.id)), offerStage);
  const stageIds = new Set(stages.map((stage) => stage.id));
  const mappedCurrentId = remappedIds.get(source.currentStageId) || source.currentStageId;
  const timeline = source.timeline.map((item) => ({ ...item, stageId: remappedIds.get(item.stageId) || item.stageId }))
    .filter((item, index, list) => stageIds.has(item.stageId) && list.findIndex((candidate) => candidate.stageId === item.stageId) === index);
  return { stages, currentStageId: stageIds.has(mappedCurrentId) ? mappedCurrentId : stages[0].id, timeline };
}

function jobWorkflowStageIndex(job) {
  const workflow = clientJobWorkflow(job?.workflow);
  const index = workflow.stages.findIndex((stage) => stage.id === workflow.currentStageId);
  return index >= 0 ? index : 0;
}

function jobCurrentStage(job) {
  const workflow = clientJobWorkflow(job?.workflow);
  return workflow.stages[jobWorkflowStageIndex({ ...job, workflow })] || workflow.stages[0];
}

function jobTimelineDate(workflow, stageId) {
  return workflow.timeline.find((item) => item.stageId === stageId)?.date || null;
}

function jobDateWithinNextDays(value, now = new Date(), days = 7) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return timestamp >= start && timestamp <= start + days * 86_400_000;
}

function jobLifecycleCounts(jobs) {
  return Object.fromEntries(JOB_LIFECYCLE_OPTIONS.map(([status]) => [status, jobs.filter((item) => item.status === status).length]));
}

function jobReachedFunnelStage(job, category) {
  const workflow = clientJobWorkflow(job?.workflow);
  const reached = workflow.stages.slice(0, jobWorkflowStageIndex({ ...job, workflow }) + 1);
  if (category === 'submitted') return reached.some((stage) => /投递|申请/.test(stage.name));
  if (category === 'assessment') return reached.some((stage) => /测评|网测|笔试/.test(stage.name));
  if (category === 'interview') return reached.some((stage) => /面试|[一二三四五六七八九终]面/.test(stage.name));
  if (category === 'offer') return reached.some((stage) => /offer/i.test(stage.name));
  return true;
}

function jobFunnelCounts(jobs) {
  const counts = Object.fromEntries(HOME_JOB_FUNNEL_OPTIONS.map(([key]) => [key, 0]));
  jobs.forEach((job) => {
    HOME_JOB_FUNNEL_OPTIONS.forEach(([category]) => { counts[category] += jobReachedFunnelStage(job, category) ? 1 : 0; });
  });
  return counts;
}

function jobMatchesQuickFilter(job, filter, now = new Date()) {
  const currentStage = jobCurrentStage(job);
  switch (filter) {
    case 'today-added': return sameDay(job.createdAt, now);
    case 'awaiting-review': return job.status === 'preparing';
    case 'high-priority': return job.priority === 'high';
    case 'due-soon': return jobDateWithinNextDays(job.deadline, now, 7);
    case 'submitted': return jobWorkflowStageIndex(job) === 0;
    case 'interviewing': return /面/.test(currentStage?.name || '');
    case 'follow-up': return job.status !== 'closed' && jobDateWithinNextDays(job.nextFollowUpAt, now, 7);
    case 'incomplete': return job.status !== 'closed';
    case 'imported': return job.imported === true;
    case 'has-notes': return Boolean(job.notes);
    case 'closed': return job.status === 'closed';
    case 'funnel-submitted': return jobReachedFunnelStage(job, 'submitted');
    case 'funnel-assessment': return jobReachedFunnelStage(job, 'assessment');
    case 'funnel-interview': return jobReachedFunnelStage(job, 'interview');
    case 'funnel-offer': return jobReachedFunnelStage(job, 'offer');
    default: return true;
  }
}

function jobQuickFilterCounts(jobs, now = new Date()) {
  return Object.fromEntries(JOB_QUICK_FILTER_OPTIONS.map(([filter]) => [filter, jobs.filter((job) => jobMatchesQuickFilter(job, filter, now)).length]));
}

function sortJobs(jobs) {
  const sorted = [...jobs];
  const direction = wb.jobSortDirection === 'asc' ? 1 : -1;
  const textValue = (job) => `${job.company || ''} ${job.role || ''}`;
  const roleValue = (job) => String(job.role || '');
  const progressValue = (job) => {
    const workflow = clientJobWorkflow(job.workflow);
    const maximum = Math.max(1, workflow.stages.length - 1);
    return jobWorkflowStageIndex({ ...job, workflow }) / maximum;
  };
  const dateValue = (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  sorted.sort((left, right) => {
    if (wb.jobSort === 'priorityProgress') {
      const priority = (jobPriorityRanks[left.priority] ?? 1) - (jobPriorityRanks[right.priority] ?? 1);
      if (priority) return wb.jobSortDirection === 'desc' ? priority : -priority;
      const progress = progressValue(left) - progressValue(right);
      if (progress) return wb.jobSortDirection === 'desc' ? -progress : progress;
      const role = roleValue(left).localeCompare(roleValue(right), 'zh-CN', { sensitivity: 'base', numeric: true });
      return role || String(left.company || '').localeCompare(String(right.company || ''), 'zh-CN', { sensitivity: 'base', numeric: true });
    }
    let comparison = 0;
    if (wb.jobSort === 'company') comparison = textValue(left).localeCompare(textValue(right), 'zh-CN');
    else if (wb.jobSort === 'createdAt') comparison = dateValue(left.createdAt) - dateValue(right.createdAt);
    else if (wb.jobSort === 'deadline') comparison = dateValue(left.deadline) - dateValue(right.deadline);
    else if (wb.jobSort === 'nextFollowUpAt') comparison = dateValue(left.nextFollowUpAt) - dateValue(right.nextFollowUpAt);
    else comparison = dateValue(left.updatedAt) - dateValue(right.updatedAt);
    return comparison ? comparison * direction : textValue(left).localeCompare(textValue(right), 'zh-CN');
  });
  return sorted;
}

function renderHomeJobs() {
  const container = document.getElementById('homeJobSummary');
  if (!container) return;
  const jobs = wb.workspace.jobApplications || [];
  if (!jobs.length) {
    container.innerHTML = '<div class="home-job-empty"><p>还没有求职记录</p><button class="button compact secondary" data-add-job="preparing" type="button">添加第一个岗位</button></div>';
    return;
  }
  const counts = jobFunnelCounts(jobs);
  const maximum = Math.max(1, ...Object.values(counts));
  container.innerHTML = HOME_JOB_FUNNEL_OPTIONS.map(([stage, label]) => `<button class="home-job-row" data-go-page="jobs" data-job-home-filter="${stage}" type="button"><span>${label}</span><i><b class="${jobMeterClass(counts[stage], maximum)}"></b></i><strong>${counts[stage]}</strong></button>`).join('');
}

function renderJobQuickFilters(jobs, now = new Date()) {
  const container = document.getElementById('jobQuickFilters');
  if (!container) return;
  const counts = jobQuickFilterCounts(jobs, now);
  container.innerHTML = JOB_QUICK_FILTER_OPTIONS.map(([filter, label]) => `<button class="job-quick-filter${wb.jobQuickFilter === filter ? ' active' : ''}" data-job-quick-filter="${filter}" type="button">${label}<b>${counts[filter]}</b></button>`).join('');
}

function renderJobCityFilter(jobs) {
  const select = document.getElementById('jobCityFilter');
  if (!select) return;
  const current = select.value;
  const cities = [...new Set(jobs.map((job) => job.city || job.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  select.innerHTML = `<option value="all">（不限）</option>${cities.map((city) => `<option value="${wbEscape(city)}">${wbEscape(city)}</option>`).join('')}`;
  select.value = cities.includes(current) ? current : 'all';
}

function jobWorkflowTrackHtml(job) {
  const workflow = clientJobWorkflow(job.workflow);
  const currentIndex = jobWorkflowStageIndex({ ...job, workflow });
  const currentStage = workflow.stages[currentIndex] || workflow.stages[0];
  const stageCount = workflow.stages.length;
  const progress = stageCount > 1 ? Math.round((currentIndex / (stageCount - 1)) * 10000) / 100 : 0;
  const stages = workflow.stages.map((stage, index) => {
    const state = index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'pending';
    const date = jobTimelineDate(workflow, stage.id);
    return `<div class="job-flow-stage ${state}" aria-current="${state === 'current' ? 'step' : 'false'}"><span class="job-flow-node" aria-hidden="true"></span><span class="job-flow-name">${wbEscape(stage.name)}</span><span class="job-flow-date">${date ? wbEscape(jobDateLabel(date, { month: '2-digit', day: '2-digit' })) : '未记录'}</span></div>`;
  }).join('');
  return `<div class="job-workflow-track-shell" aria-label="招聘流程，共 ${stageCount} 个阶段，当前为 ${wbEscape(currentStage?.name || '未设置')}"><div class="job-workflow-track" data-job-stage-count="${stageCount}" style="--stage-count: ${stageCount}; --job-progress: ${progress}%">${stages}</div></div>`;
}

function jobStatusOptions(selected) {
  return JOB_LIFECYCLE_OPTIONS.map(([status, label]) => `<option value="${status}"${selected === status ? ' selected' : ''}>${label}</option>`).join('');
}

function jobPriorityOptions(selected) {
  return JOB_PRIORITY_OPTIONS.map(([priority, label]) => `<option value="${priority}"${selected === priority ? ' selected' : ''}>${label}</option>`).join('');
}

function jobRowHtml(job) {
  const city = job.city || job.location || '';
  const deadline = job.deadline ? jobDateLabel(job.deadline, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '—';
  const deadlineClass = jobDateWithinNextDays(job.deadline, new Date(), 7) ? ' is-soon' : (Date.parse(job.deadline) < Date.now() ? ' is-overdue' : '');
  const currentStage = jobCurrentStage(job);
  return `<article class="job-position job-row-status-${wbEscape(job.status)}" data-job-id="${wbEscape(job.id)}" tabindex="0" aria-label="${wbEscape(job.company)} · ${wbEscape(job.role)}"><div class="job-position-main"><div class="job-company-cell"><div class="job-company-line"><div><strong>${wbEscape(job.company)}</strong><span>${wbEscape(job.role)}</span></div></div></div><div class="job-type-cell">${wbEscape(job.companyType || '—')}</div><div class="job-city-cell">${wbEscape(city || '—')}</div><div class="job-deadline-cell${deadlineClass}">${deadline}</div><label class="job-inline-control job-status-cell"><span class="sr-only">${wbEscape(job.company)}状态</span><select data-job-field="status" data-job-id="${wbEscape(job.id)}" aria-label="${wbEscape(job.company)}状态">${jobStatusOptions(job.status)}</select></label><label class="job-inline-control job-priority-cell"><span class="sr-only">${wbEscape(job.company)}优先级</span><span class="job-priority-dot priority-${wbEscape(job.priority)}" aria-hidden="true"></span><select data-job-field="priority" data-job-id="${wbEscape(job.id)}" aria-label="${wbEscape(job.company)}优先级">${jobPriorityOptions(job.priority)}</select></label><label class="job-inline-control job-follow-cell"><span class="sr-only">${wbEscape(job.company)}下次跟进</span><input data-job-field="nextFollowUpAt" data-job-id="${wbEscape(job.id)}" type="date" value="${wbEscape(localDateInputValue(job.nextFollowUpAt))}" aria-label="${wbEscape(job.company)}下次跟进日期"></label><label class="job-inline-control job-notes-cell"><span class="sr-only">${wbEscape(job.company)}备注</span><input data-job-field="notes" data-job-id="${wbEscape(job.id)}" type="text" value="${wbEscape(job.notes || '')}" placeholder="备注" aria-label="${wbEscape(job.company)}备注"></label><div class="job-position-actions"><button class="job-row-action" data-edit-job="${wbEscape(job.id)}" type="button">${uiIcon('eye')}<span>详情</span></button><button class="job-row-action danger" data-delete-job="${wbEscape(job.id)}" type="button" aria-label="删除 ${wbEscape(job.company)} ${wbEscape(job.role)}">${uiIcon('trash')}</button></div></div>${jobWorkflowTrackHtml({ ...job, currentStage })}</article>`;
}

function renderJobs() {
  const jobs = wb.workspace.jobApplications || [];
  const now = new Date();
  const query = document.getElementById('jobSearch')?.value.trim().toLowerCase() || '';
  const statusFilter = document.getElementById('jobStatusFilter')?.value || 'all';
  const priorityFilter = document.getElementById('jobPriorityFilter')?.value || 'all';
  renderJobCityFilter(jobs);
  const cityFilter = document.getElementById('jobCityFilter')?.value || 'all';
  renderJobQuickFilters(jobs, now);

  const todayAdded = jobs.filter((job) => sameDay(job.createdAt, now)).length;
  const todayApplied = jobs.filter((job) => sameDay(job.appliedAt, now)).length;
  const awaitingReview = jobs.filter((job) => job.status === 'preparing').length;
  const dueSoon = jobs.filter((job) => jobDateWithinNextDays(job.deadline, now, 7)).length;
  const inProgress = jobs.filter((job) => job.status === 'active').length;
  document.getElementById('jobTotalJobs').textContent = String(jobs.length);
  document.getElementById('jobTodayAdded').textContent = String(todayAdded);
  document.getElementById('jobTodayApplied').textContent = String(todayApplied);
  document.getElementById('jobAwaitingReview').textContent = String(awaitingReview);
  document.getElementById('jobDueSoon').textContent = String(dueSoon);
  document.getElementById('jobInProgress').textContent = String(inProgress);
  document.getElementById('jobTodayLabel').textContent = `${localDateKey(now)} · Offer 职来`;

  const visible = sortJobs(jobs.filter((job) => {
    const searchable = `${job.company} ${job.role} ${job.companyType || ''} ${job.city || job.location || ''} ${job.contact || ''} ${job.notes || ''} ${jobCurrentStage(job)?.name || ''}`.toLowerCase();
    return (statusFilter === 'all' || job.status === statusFilter)
      && (priorityFilter === 'all' || job.priority === priorityFilter)
      && (cityFilter === 'all' || (job.city || job.location || '') === cityFilter)
      && (wb.jobQuickFilter === 'all' || jobMatchesQuickFilter(job, wb.jobQuickFilter, now))
      && searchable.includes(query);
  }));
  document.getElementById('jobResultSummary').textContent = `${visible.length} / ${jobs.length} 个岗位`;
  document.getElementById('jobSortDirectionButton').textContent = wb.jobSortDirection === 'asc' ? '↑ 升序' : '↓ 降序';
  document.getElementById('jobBoard').innerHTML = visible.length
    ? visible.map(jobRowHtml).join('')
    : `<div class="job-list-empty"><span>${jobs.length ? '⌕' : '＋'}</span><strong>${jobs.length ? '没有符合条件的岗位' : '还没有岗位记录'}</strong><p>${jobs.length ? '试试清空搜索或调整筛选条件。' : '添加第一条岗位，开始记录每一次机会。'}</p>${jobs.length ? '' : '<button class="button secondary" data-add-job="preparing" type="button">添加岗位</button>'}</div>`;
  window.YanjiMotion?.animateJobList(document.getElementById('jobBoard'));
}

function renderWorkflowEditor(workflow = wb.editingJobWorkflow) {
  const editor = document.getElementById('jobWorkflowEditor');
  if (!editor) return;
  wb.editingJobWorkflow = workflowForStagePicker(workflow || defaultJobWorkflow());
  const currentId = wb.editingJobWorkflow.currentStageId;
  const selectedById = new Map(wb.editingJobWorkflow.stages.map((stage) => [stage.id, stage]));
  const selectedStages = wb.editingJobWorkflow.stages;
  const unselectedStages = DEFAULT_JOB_WORKFLOW_STAGES.slice(1, -1).filter((stage) => !selectedById.has(stage.id));
  const options = [selectedStages[0], ...selectedStages.slice(1, -1), ...unselectedStages, selectedStages.at(-1)].filter(Boolean);
  editor.innerHTML = options.map((stage) => {
    const selected = selectedById.has(stage.id);
    const required = ['stage-apply', 'stage-offer'].includes(stage.id);
    const current = selected && stage.id === currentId;
    const date = selected ? jobTimelineDate(wb.editingJobWorkflow, stage.id) : null;
    const legacy = !DEFAULT_JOB_WORKFLOW_STAGES.some((candidate) => candidate.id === stage.id);
    const selectedIndex = selectedStages.findIndex((candidate) => candidate.id === stage.id);
    const canMoveUp = selected && selectedIndex > 1;
    const canMoveDown = selected && selectedIndex > 0 && selectedIndex < selectedStages.length - 2;
    return `<div class="job-stage-option${selected ? ' is-selected' : ''}${legacy ? ' is-legacy' : ''}" data-workflow-stage-option data-stage-id="${wbEscape(stage.id)}" data-stage-name="${wbEscape(stage.name)}"><label class="job-stage-toggle"><input data-workflow-stage-enabled type="checkbox"${selected ? ' checked' : ''}${required ? ' disabled' : ''}><span aria-hidden="true">${selected ? '✓' : ''}</span><strong>${wbEscape(stage.name)}</strong>${required ? '<small>固定</small>' : (legacy ? '<small>旧版阶段</small>' : '<small>可选</small>')}</label><div class="job-stage-order" aria-label="调整 ${wbEscape(stage.name)} 顺序"><button type="button" data-move-workflow-stage="up"${canMoveUp ? '' : ' disabled'} aria-label="上移 ${wbEscape(stage.name)}">↑</button><button type="button" data-move-workflow-stage="down"${canMoveDown ? '' : ' disabled'} aria-label="下移 ${wbEscape(stage.name)}">↓</button></div><label class="job-stage-date"><span>日期</span><input data-workflow-stage-date type="date" value="${wbEscape(localDateInputValue(date))}"${selected ? '' : ' disabled'}></label><label class="job-stage-current"><input data-workflow-set-current type="radio" name="jobCurrentStage"${current ? ' checked' : ''}${selected ? '' : ' disabled'}><span>${current ? '当前阶段' : '设为当前'}</span></label></div>`;
  }).join('');
}

function moveWorkflowEditorStage(stageId, direction) {
  const workflow = readWorkflowEditor();
  const index = workflow.stages.findIndex((stage) => stage.id === stageId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index <= 0 || target <= 0 || target >= workflow.stages.length - 1) return;
  [workflow.stages[index], workflow.stages[target]] = [workflow.stages[target], workflow.stages[index]];
  renderWorkflowEditor(workflow);
}

function readWorkflowEditor() {
  const rows = [...document.querySelectorAll('#jobWorkflowEditor [data-workflow-stage-option]')];
  const stages = [];
  const timeline = [];
  let currentStageId = null;
  rows.forEach((row) => {
    if (!row.querySelector('[data-workflow-stage-enabled]')?.checked) return;
    const stage = { id: row.dataset.stageId, name: row.dataset.stageName };
    stages.push(stage);
    const date = dateInputToIso(row.querySelector('[data-workflow-stage-date]')?.value);
    if (date) timeline.push({ stageId: stage.id, date });
    if (row.querySelector('[data-workflow-set-current]')?.checked) currentStageId = stage.id;
  });
  const workflow = { stages, currentStageId: currentStageId || stages[0]?.id, timeline };
  wb.editingJobWorkflow = workflow;
  return workflow;
}

function openJobEditor(job = null, initialStatus = 'preparing') {
  const dialog = document.getElementById('jobDialog');
  document.getElementById('jobForm').reset();
  document.getElementById('jobId').value = job?.id || '';
  document.getElementById('jobDialogTitle').textContent = job ? '编辑求职岗位' : '添加求职岗位';
  document.getElementById('jobCompany').value = job?.company || '';
  document.getElementById('jobRole').value = job?.role || '';
  document.getElementById('jobCompanyType').value = job?.companyType || '';
  document.getElementById('jobCity').value = job?.city || job?.location || '';
  dialog.dataset.initialStatus = JOB_LIFECYCLE_OPTIONS.some(([status]) => status === initialStatus) ? initialStatus : 'preparing';
  document.getElementById('jobPriority').value = job?.priority || 'medium';
  document.getElementById('jobAnnualSalaryWan').value = job?.annualSalaryWan || '';
  document.getElementById('jobAppliedAt').value = localDateInputValue(job?.appliedAt);
  document.getElementById('jobContact').value = job?.contact || '';
  document.getElementById('jobNotes').value = job?.notes || '';
  document.getElementById('jobError').textContent = '';
  document.getElementById('deleteJobButton').hidden = !job;
  dialog.dataset.revision = String(job?.revision ?? '');
  wb.editingJobWorkflow = cloneJobWorkflow(job?.workflow || defaultJobWorkflow());
  renderWorkflowEditor(wb.editingJobWorkflow);
  openWorkbenchDialog(dialog);
  requestAnimationFrame(() => document.getElementById('jobCompany').focus());
}

async function saveJobFromEditor() {
  const error = document.getElementById('jobError');
  const city = document.getElementById('jobCity').value;
  const id = document.getElementById('jobId').value || undefined;
  const existing = wb.workspace.jobApplications.find((item) => item.id === id);
  const nextFollowUpAt = existing?.nextFollowUpAt || existing?.nextActionAt || null;
  const payload = {
    id,
    company: document.getElementById('jobCompany').value,
    role: document.getElementById('jobRole').value,
    companyType: document.getElementById('jobCompanyType').value,
    city,
    location: city,
    deadline: existing?.deadline || null,
    priority: document.getElementById('jobPriority').value,
    status: existing?.status || document.getElementById('jobDialog').dataset.initialStatus || 'preparing',
    annualSalaryWan: document.getElementById('jobAnnualSalaryWan').value,
    appliedAt: dateInputToIso(document.getElementById('jobAppliedAt').value),
    nextFollowUpAt,
    nextActionAt: nextFollowUpAt,
    workflow: readWorkflowEditor(),
    contact: document.getElementById('jobContact').value,
    notes: document.getElementById('jobNotes').value,
    revision: document.getElementById('jobDialog').dataset.revision || undefined
  };
  try {
    const saved = await workbenchApi.saveJobApplication(payload);
    wb.workspace.jobApplications = [saved, ...wb.workspace.jobApplications.filter((item) => item.id !== saved.id)];
    wb.editingJobWorkflow = null;
    closeWorkbenchDialog(document.getElementById('jobDialog'));
    renderHome();
    if (wb.page === 'jobs') renderJobs();
    showWorkbenchToast('求职记录已保存');
  } catch (exception) {
    error.textContent = exception.message || '求职记录保存失败。';
  }
}

async function saveJobInlineField(id, field, value) {
  const current = wb.workspace.jobApplications.find((item) => item.id === id);
  if (!current) return;
  const patch = {};
  if (field === 'nextFollowUpAt') {
    patch.nextFollowUpAt = dateInputToIso(value);
    patch.nextActionAt = patch.nextFollowUpAt;
  } else if (field === 'notes') {
    patch.notes = value;
  } else {
    patch[field] = value;
  }
  try {
    const saved = await workbenchApi.saveJobApplication({ ...current, ...patch, revision: current.revision });
    wb.workspace.jobApplications = wb.workspace.jobApplications.map((item) => item.id === saved.id ? saved : item);
    renderHome();
    renderJobs();
    showWorkbenchToast('岗位信息已更新');
  } catch (exception) {
    showWorkbenchToast(exception.message || '岗位信息更新失败。', 'error');
  }
}

async function deleteJobById(id) {
  const job = wb.workspace.jobApplications.find((item) => item.id === id);
  if (!job) return false;
  const accepted = await window.yanjiConfirm({ title: '删除求职记录', message: `“${job.company} · ${job.role}”将被永久删除，此操作无法撤销`, confirmText: '删除记录', tone: 'danger' });
  if (!accepted) return false;
  try {
    await workbenchApi.deleteJobApplication(id);
    wb.workspace.jobApplications = wb.workspace.jobApplications.filter((item) => item.id !== id);
    const dialog = document.getElementById('jobDialog');
    if (dialog.open && document.getElementById('jobId').value === id) closeWorkbenchDialog(dialog);
    renderHome();
    if (wb.page === 'jobs') renderJobs();
    showWorkbenchToast('求职记录已删除');
    return true;
  } catch (exception) {
    const error = document.getElementById('jobError');
    if (document.getElementById('jobDialog').open && document.getElementById('jobId').value === id) error.textContent = exception.message || '删除失败。';
    else showWorkbenchToast(exception.message || '删除失败。', 'error');
    return false;
  }
}

async function importJobRecords() {
  try {
    const result = await workbenchApi.importJobApplications();
    if (result?.canceled) return;
    wb.workspace.jobApplications = result.jobApplications || wb.workspace.jobApplications;
    renderHome();
    renderJobs();
    showWorkbenchToast(`已导入 ${result.count || 0} 个岗位`);
  } catch (exception) {
    showWorkbenchToast(exception.message || '岗位导入失败。', 'error');
  }
}

async function exportJobRecords() {
  try {
    const result = await workbenchApi.exportJobApplications();
    if (!result?.canceled) showWorkbenchToast(`已导出 ${result.count || 0} 个岗位`);
  } catch (exception) {
    showWorkbenchToast(exception.message || '岗位导出失败。', 'error');
  }
}

function fitHomeDayCards() {
  document.querySelectorAll('#homeDayOverview .day-card').forEach((card) => {
    const body = card.querySelector(':scope > div');
    const events = [...card.querySelectorAll('[data-day-event]')];
    const more = card.querySelector('.day-more');
    if (!body || !more) return;
    events.forEach((event) => { event.hidden = false; });
    more.hidden = true;
    if (body.scrollHeight <= body.clientHeight) return;
    more.hidden = false;
    let hidden = 0;
    for (let index = events.length - 1; index >= 0 && body.scrollHeight > body.clientHeight; index -= 1) {
      events[index].hidden = true;
      hidden += 1;
    }
    more.textContent = hidden ? `还有 ${hidden} 项` : '';
    more.hidden = hidden === 0;
  });
}

function linkedTodoForSchedule(schedule) {
  return schedule?.sourceRef?.type === 'todo'
    ? wb.workspace.todos.find((todo) => todo.id === schedule.sourceRef.id) || null
    : null;
}

function localDateTimeInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function renderHomeCommandCards(today = new Date()) {
  const events = schedulesForDay(today);
  const todos = wb.workspace.todos || [];
  const openTodos = todos.filter((todo) => todo.status === 'open' && todo.dueAt && (sameDay(todo.dueAt, today) || Date.parse(todo.dueAt) < Date.now()));
  const completedTodos = todos.filter((todo) => todo.status === 'completed' && sameDay(todo.completedAt, today));
  const visibleTodos = [...openTodos, ...completedTodos].slice(0, 4);
  const next = events.find((item) => Date.parse(item.endAt || item.startAt) >= Date.now()) || events[0];
  document.getElementById('homeNextEventTitle').textContent = next ? next.title : (openTodos[0]?.title || '今天还没有安排');
  document.getElementById('homeNextEventMeta').textContent = next ? `${next.allDay ? '全天' : formatTime(next.startAt)} · ${priorityLabels[next.priority]}优先级` : openTodos[0] ? '来自今日待办 · 现在开始也来得及' : '添加一条日程，让今天有下一步';
  document.getElementById('homeTodayScheduleList').innerHTML = events.slice(0, 4).map((item) => `<button class="home-today-row" data-edit-schedule="${wbEscape(item.id)}" type="button"><time>${item.allDay ? '全天' : formatTime(item.startAt)}</time><strong>${wbEscape(item.title)}</strong></button>`).join('') || '<p class="empty-mini">今天还没有日程</p>';
  document.getElementById('homeTodayTodoList').innerHTML = visibleTodos.map((todo) => `<div class="home-today-row home-todo-row tone-${todo.priority} ${todo.status === 'completed' ? 'is-completed' : ''}"><button class="home-todo-check" data-home-todo-action="${todo.status === 'completed' ? 'reopen' : 'complete'}" data-home-todo-id="${wbEscape(todo.id)}" type="button" aria-label="${todo.status === 'completed' ? '重新打开' : '完成'}${wbEscape(todo.title)}">${todo.status === 'completed' ? uiIcon('check') : ''}</button><button class="home-todo-title" data-edit-todo="${wbEscape(todo.id)}" type="button"><strong>${wbEscape(todo.title)}</strong></button></div>`).join('') || '<p class="empty-mini">今天还没有待办</p>';
  const total = openTodos.length + completedTodos.length;
  const rate = total ? Math.round(completedTodos.length / total * 100) : 0;
  const progress = document.getElementById('homeTodoProgress');
  progress.style.setProperty('--todo-progress-scale', String(rate / 100));
  progress.querySelector('span').textContent = `${rate}% 完成`;
}

function renderHomeAttendance() {
  const button = document.getElementById('homeClockButton');
  if (!button || !wb.workspace) return;
  const todayKey = localDateKey(new Date());
  const openRecord = wb.workspace.attendance.find((item) => !item.clockOutAt && item.date === todayKey);
  const todayRecords = wb.workspace.attendance.filter((item) => item.date === todayKey);
  const elapsed = todayRecords.reduce((sum, item) => sum + attendanceElapsedMs(item), 0);
  button.textContent = openRecord ? '下班打卡' : '上班打卡';
  button.dataset.clockAction = openRecord ? 'out' : 'in';
  button.classList.toggle('is-clocked-in', Boolean(openRecord));
  button.setAttribute('aria-pressed', String(Boolean(openRecord)));
  button.title = openRecord ? '结束当前工作并下班打卡' : '开始工作并上班打卡';
  button.setAttribute('aria-label', openRecord ? '结束当前工作并下班打卡' : '开始工作并上班打卡');
  const status = document.getElementById('homeAttendanceStatus');
  const meta = document.getElementById('homeAttendanceMeta');
  if (status) status.textContent = openRecord ? '正在工作' : elapsed ? '今日已记录' : '尚未打卡';
  if (meta) meta.textContent = elapsed ? `${openRecord ? '已工作' : '累计工作'} ${formatDuration(elapsed)}` : '记录今天的工作时段';
}

function renderHomeProgress() {
  const today = new Date();
  const todayTodos = (wb.workspace.todos || []).filter((item) => item.status !== 'cancelled' && (item.dueAt ? sameDay(item.dueAt, today) || (item.status === 'completed' && sameDay(item.completedAt, today)) : false));
  const completed = todayTodos.filter((item) => item.status === 'completed').length;
  const total = todayTodos.length;
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
  const subline = total ? `完成率 ${rate}% · ${total - completed ? `还有 ${total - completed} 项待完成` : '今天待办已全部完成'} · ${attendanceLabel}` : `完成率 0% · ${attendanceLabel}`;
  document.getElementById('homeProgressHeadline').textContent = headline;
  document.getElementById('homeProgressSubline').textContent = subline;
  document.getElementById('homeProgressScheduleCount').textContent = String(total);
  document.getElementById('homeProgressCompletedCount').textContent = String(completed);
  document.getElementById('homeProgressRate').textContent = `${rate}%`;
  document.getElementById('homeProgressRateBar').style.transform = `scaleX(${rate / 100})`;
  document.getElementById('homeProgressFocus').textContent = String(Math.round(focusMs / 60_000));
}

function closeDailyPlanDialog() {
  const dialog = document.getElementById('dailyPlanDialog');
  if (dialog?.open) closeWorkbenchDialog(dialog);
}

function maybeShowDailyPlan() {
  const promptMode = new URLSearchParams(location.search).get('dailyPrompt');
  if (promptMode === '0') return;
  const todayKey = localDateKey(new Date());
  try {
    if (promptMode !== 'force' && localStorage.getItem(DAILY_PLAN_KEY) === todayKey) return;
    localStorage.setItem(DAILY_PLAN_KEY, todayKey);
  } catch { /* A failed preference write must not block the workbench. */ }
  const todayTodos = (wb.workspace.todos || []).filter((todo) => todo.status === 'open' && todo.dueAt && (sameDay(todo.dueAt, new Date()) || Date.parse(todo.dueAt) < Date.now()));
  document.getElementById('dailyPlanSummary').textContent = todayTodos.length
    ? `今天已有 ${todayTodos.length} 项待办。再确认一件最重要的结果，让今天更聚焦。`
    : '把要完成的结果写成待办，研迹会把它放进今天的进度里。';
  document.getElementById('createDailyTodoButton').textContent = todayTodos.length ? '再添加一项' : '写下今日待办';
  openWorkbenchDialog(document.getElementById('dailyPlanDialog'));
}

function renderTimeline() {
  const selected = wb.selectedDate;
  const rangeStart = addDays(selected, -2);
  const rangeEnd = addDays(selected, 5);
  document.getElementById('timelineDate').textContent = `${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(rangeStart)} — ${new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(rangeEnd)}`;
  document.getElementById('timelineDateSubtitle').textContent = `${sameDay(selected, new Date()) ? '今天前两天至后五天' : '所选日期前两天至后五天'} · 点击日期查看并编辑安排`;
  document.getElementById('scheduleBoard').innerHTML = Array.from({ length: 8 }, (_, index) => {
    const date = addDays(rangeStart, index);
    const dateKey = localDateKey(date);
    const events = schedulesForDay(date);
    const cards = events.map((item) => {
      const timing = scheduleTimeForDay(item, date);
      const linkedTodo = linkedTodoForSchedule(item);
      const linkedLabel = linkedTodo
        ? (linkedTodo.status === 'completed' ? '关联待办已完成' : `来自待办：${linkedTodo.title}`)
        : '';
      const linkedButton = linkedTodo ? `<button class="schedule-card-linked-todo" data-open-linked-todo="${wbEscape(linkedTodo.id)}" type="button">${wbEscape(linkedLabel)}</button>` : '';
      return `<article class="schedule-board-card tone-${item.priority}" data-schedule-card="${wbEscape(item.id)}"><button class="schedule-card-main" data-edit-schedule="${wbEscape(item.id)}" type="button"><time>${item.allDay ? '全天' : timing.label}</time><strong>${wbEscape(item.title)}</strong><span>${priorityLabels[item.priority]}${item.repeat === 'daily' ? ' · 每天' : ''}${timing.spansDay ? ' · 跨日' : ''}</span></button>${linkedButton}</article>`;
    }).join('');
    return `<section class="schedule-board-column ${sameDay(date, new Date()) ? 'today' : ''} ${sameDay(date, selected) ? 'selected' : ''}" data-board-date="${dateKey}"><button class="schedule-board-heading" data-select-schedule-date="${dateKey}" type="button"><span>${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)}</span><strong>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)}</strong><b>${events.length}</b></button><div class="schedule-board-cards">${cards || '<p class="schedule-board-empty">暂无安排</p>'}</div><button class="schedule-board-add" data-add-schedule-date="${dateKey}" type="button">＋ 新建日程</button></section>`;
  }).join('');
  const boardShell = document.querySelector('.schedule-board-shell');
  const selectedColumn = document.querySelector('#scheduleBoard .schedule-board-column.selected');
  if (boardShell && selectedColumn) {
    boardShell.scrollLeft = Math.max(0, selectedColumn.offsetLeft - (boardShell.clientWidth - selectedColumn.clientWidth) / 2);
  }
  if (wb.pendingScheduleHighlightId) {
    const added = document.querySelector(`[data-schedule-card="${CSS.escape(wb.pendingScheduleHighlightId)}"]`);
    if (added) {
      window.YanjiMotion?.animateStateChange(added, 'schedule-item-added', 840);
      wb.pendingScheduleHighlightId = null;
    }
  }
}

function changeScheduleDate(nextDate) {
  const next = new Date(nextDate);
  const direction = next < wb.selectedDate ? 'previous' : 'next';
  wb.selectedDate = next;
  const board = document.getElementById('scheduleBoard');
  if (window.YanjiMotion?.transitionSchedule) window.YanjiMotion.transitionSchedule(board, direction, renderTimeline);
  else renderTimeline();
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
      return `<button class="attendance-bar ${record.clockOutAt ? '' : 'open'}" data-attendance-left="${left}" data-attendance-width="${width}" data-attendance-top="${8 + recordIndex * 25}" data-edit-attendance="${wbEscape(record.id)}" type="button"><span>${label}</span></button>`;
    }).join('');
    return `<div class="attendance-gantt-row ${isToday ? 'today' : ''}" data-attendance-row-height="${Math.max(56, 16 + records.length * 25)}"><div class="attendance-day"><strong>${weekday[index]}</strong><small>${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)}${records.length > 1 ? ` · ${records.length} 段` : ''}</small></div><div class="attendance-row-track">${Array.from({ length: 8 }, () => '<i></i>').join('')}${bars}</div></div>`;
  }).join('');
  document.querySelectorAll('#attendanceGanttRows .attendance-gantt-row').forEach((row) => {
    row.style.minHeight = `${Number(row.dataset.attendanceRowHeight)}px`;
  });
  document.querySelectorAll('#attendanceGanttRows .attendance-bar').forEach((bar) => {
    bar.style.left = `${Number(bar.dataset.attendanceLeft)}%`;
    bar.style.width = `${Number(bar.dataset.attendanceWidth)}%`;
    bar.style.top = `${Number(bar.dataset.attendanceTop)}px`;
  });
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
    ? entries.map(([name, seconds], index) => {
      const width = Math.max(5, Math.min(100, Math.round((seconds / max) * 20) * 5));
      return `<div class="focus-usage-row usage-tone-${(index % 8) + 1}"><div><strong>${wbEscape(name)}</strong><time>${formatDuration(seconds * 1000)}</time></div><span><i class="usage-width-${width}" aria-hidden="true"></i></span></div>`;
    }).join('')
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

function openScheduleEditor(schedule = null, sourceTodo = null, options = {}) {
  const dialog = document.getElementById('scheduleDialog');
  const convertingTodoId = options.convertTodoId || null;
  wb.convertingTodoId = convertingTodoId;
  const convertingTodo = convertingTodoId ? wb.workspace.todos.find((todo) => todo.id === convertingTodoId) : null;
  const defaultStart = new Date(wb.selectedDate);
  const now = new Date();
  defaultStart.setHours(sameDay(wb.selectedDate, now) ? Math.min(23, now.getHours() + 1) : 9, 0, 0, 0);
  let draft = null;
  if (!schedule && !convertingTodo) {
    try { draft = JSON.parse(localStorage.getItem(SCHEDULE_DRAFT_KEY) || 'null'); } catch { draft = null; }
  }
  const start = schedule
    ? new Date(schedule.startAt)
    : convertingTodo?.dueAt
      ? new Date(convertingTodo.dueAt)
      : draft?.date && draft?.startTime
        ? new Date(`${draft.date}T${draft.startTime}:00`)
        : defaultStart;
  const end = schedule ? new Date(schedule.endAt) : draft?.date && draft?.endTime ? new Date(`${draft.date}T${draft.endTime}:00`) : new Date(start.getTime() + 60 * 60_000);
  document.getElementById('scheduleId').value = schedule?.id || '';
  const pendingTodo = convertingTodo ? null : sourceTodo || (wb.pendingTodoId ? wb.workspace.todos.find((todo) => todo.id === wb.pendingTodoId) : null);
  document.getElementById('scheduleTitle').value = schedule?.title || convertingTodo?.title || draft?.title || pendingTodo?.title || '';
  document.getElementById('scheduleDate').value = localDateKey(start);
  const allDay = Boolean(schedule?.allDay || draft?.allDay);
  document.getElementById('scheduleAllDayInput').checked = allDay;
  document.getElementById('scheduleRepeatDailyInput').checked = schedule?.repeat === 'daily' || draft?.repeat === 'daily';
  document.getElementById('scheduleStartTime').value = convertingTodo ? '' : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  document.getElementById('scheduleEndTime').value = convertingTodo ? '' : `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  document.querySelectorAll('.schedule-time-field').forEach((field) => field.classList.toggle('is-hidden', allDay));
  const reminder = convertingTodo ? 'null' : schedule?.reminderMinutesBefore == null ? (draft?.reminderMinutesBefore ?? (wb.settings.defaultEventReminderMinutes == null ? 'null' : String(wb.settings.defaultEventReminderMinutes))) : String(schedule.reminderMinutesBefore);
  document.getElementById('scheduleReminderSelect').value = reminder;
  document.querySelector(`input[name="schedulePriority"][value="${schedule?.priority || convertingTodo?.priority || draft?.priority || pendingTodo?.priority || 'low'}"]`).checked = true;
  const linkedTodo = schedule?.sourceRef?.type === 'todo' ? wb.workspace.todos.find((todo) => todo.id === schedule.sourceRef.id) : pendingTodo;
  wb.editingScheduleTodoId = linkedTodo?.id || null;
  wb.pendingTodoId = null;
  document.getElementById('scheduleLinkedTodoPanel').hidden = !linkedTodo;
  document.getElementById('scheduleLinkedTodoTitle').textContent = linkedTodo?.title || '';
  wb.scheduleRecognition = !schedule && !convertingTodo && draft && draft.recognition?.input === draft.title ? draft.recognition : null;
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
  document.getElementById('scheduleDialogTitle').textContent = schedule ? '编辑日程' : convertingTodo ? '待办转为日程' : '新建日程';
  document.getElementById('deleteScheduleButton').hidden = !schedule;
  document.getElementById('convertScheduleButton').hidden = !schedule || Boolean(schedule.sourceRef);
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
    allDay: document.getElementById('scheduleAllDayInput').checked,
    repeat: document.getElementById('scheduleRepeatDailyInput').checked ? 'daily' : null,
    reminderMinutesBefore: document.getElementById('scheduleReminderSelect').value === 'null' ? null : Number(document.getElementById('scheduleReminderSelect').value),
    recognition: wb.scheduleRecognition?.input === title.trim() ? wb.scheduleRecognition : null
  };
}

function closeScheduleEditorPreservingDraft() {
  const dialog = document.getElementById('scheduleDialog');
  if (!document.getElementById('scheduleId').value) {
    flushScheduleDraft();
    showWorkbenchToast('日程草稿已保留。');
  }
  closeWorkbenchDialog(dialog);
  wb.editingScheduleTodoId = null;
  wb.convertingTodoId = null;
}

function cancelScheduleEditor() {
  clearTimeout(wb.scheduleDraftTimer);
  if (!document.getElementById('scheduleId').value) localStorage.removeItem(SCHEDULE_DRAFT_KEY);
  closeWorkbenchDialog(document.getElementById('scheduleDialog'));
  wb.editingScheduleTodoId = null;
  wb.convertingTodoId = null;
}

function clearScheduleDraft() {
  clearTimeout(wb.scheduleDraftTimer);
  wb.scheduleDraftTimer = null;
  localStorage.removeItem(SCHEDULE_DRAFT_KEY);
}

function flushScheduleDraft() {
  clearTimeout(wb.scheduleDraftTimer);
  wb.scheduleDraftTimer = null;
  const dialog = document.getElementById('scheduleDialog');
  if (dialog?.open && !document.getElementById('scheduleId').value) {
    localStorage.setItem(SCHEDULE_DRAFT_KEY, JSON.stringify(captureScheduleDraft()));
  }
}

function scheduleConflicts(candidate) {
  if (candidate.allDay) return [];
  const start = Date.parse(candidate.startAt);
  const end = Date.parse(candidate.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  return wb.workspace.schedules.filter((item) => {
    if (item.id === candidate.id || item.allDay) return false;
    const otherStart = Date.parse(item.startAt);
    const otherEnd = Date.parse(item.endAt);
    return Number.isFinite(otherStart) && Number.isFinite(otherEnd) && start < otherEnd && end > otherStart;
  });
}

async function confirmScheduleConflict(candidate) {
  const conflict = scheduleConflicts(candidate)[0];
  if (!conflict) return true;
  return window.yanjiConfirm({
    title: '日程时间冲突',
    message: `该时间段与“${conflict.title}”重叠。仍然保存吗`,
    confirmText: '仍然保存'
  });
}

function resetScheduleConversionContext() {
  wb.editingScheduleTodoId = null;
  wb.convertingTodoId = null;
}

function openScheduleConvertDialog(schedule) {
  if (!schedule || schedule.sourceRef) return;
  document.getElementById('convertScheduleId').value = schedule.id;
  document.getElementById('convertScheduleTodoTitle').value = schedule.title;
  document.getElementById('convertScheduleTodoDueAt').value = localDateTimeInputValue(schedule.startAt);
  document.getElementById('convertScheduleTodoPriority').value = schedule.priority || 'medium';
  document.getElementById('convertScheduleTodoReminder').value = 'at-due';
  document.querySelector('input[name="scheduleConvertMode"][value="keep-schedule"]').checked = true;
  document.getElementById('scheduleConvertError').textContent = '';
  const dialog = document.getElementById('scheduleConvertDialog');
  window.YanjiMotion?.animateDialog(dialog);
  dialog.showModal();
  workbenchApi.setModalWindowState(true).catch(() => {});
  setTimeout(() => document.getElementById('convertScheduleTodoTitle').focus(), 20);
}

function closeScheduleConvertDialog() {
  const dialog = document.getElementById('scheduleConvertDialog');
  if (dialog.open) closeWorkbenchDialog(dialog);
}

async function saveScheduleConversion() {
  const error = document.getElementById('scheduleConvertError');
  error.textContent = '';
  const id = document.getElementById('convertScheduleId').value;
  const title = document.getElementById('convertScheduleTodoTitle').value.trim();
  const dueValue = document.getElementById('convertScheduleTodoDueAt').value;
  if (!title || !dueValue) {
    error.textContent = '请填写待办标题和截止时间';
    return;
  }
  try {
    await workbenchApi.convertScheduleToTodo(id, {
      title,
      dueAt: new Date(dueValue).toISOString(),
      priority: document.getElementById('convertScheduleTodoPriority').value,
      reminderMode: document.getElementById('convertScheduleTodoReminder').value,
      mode: document.querySelector('input[name="scheduleConvertMode"]:checked')?.value || 'keep-schedule'
    });
    closeScheduleConvertDialog();
    const scheduleDialog = document.getElementById('scheduleDialog');
    if (scheduleDialog.open) closeWorkbenchDialog(scheduleDialog);
    resetScheduleConversionContext();
    showWorkbenchToast('日程已转换为待办');
  } catch (exception) {
    error.textContent = exception.message || '转换失败';
  }
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
    document.getElementById('scheduleAllDayInput').checked = false;
    document.getElementById('scheduleReminderSelect').value = 'null';
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
  const allDay = document.getElementById('scheduleAllDayInput').checked;
  if (!date || (!allDay && (!startTime || !endTime))) {
    error.textContent = allDay ? '请选择日期' : '请选择日期、开始时间和结束时间';
    return;
  }
  let endAt = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${endTime}:00`);
  const startAt = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${startTime}:00`);
  if (allDay) endAt = new Date(startAt.getTime() + 86_400_000);
  else if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
    error.textContent = '时间格式无效';
    return;
  }
  try {
    if (!scheduleId && !wb.convertingTodoId && recognizedSchedules.length > 1) {
      for (const schedule of recognizedSchedules) {
        const repeatedSchedule = { ...schedule, repeat: document.getElementById('scheduleRepeatDailyInput').checked ? 'daily' : null };
        if (!await confirmScheduleConflict(repeatedSchedule)) return;
        await workbenchApi.saveSchedule(repeatedSchedule);
      }
      wb.selectedDate = new Date(recognizedSchedules[0].startAt);
      clearScheduleDraft();
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast(`已创建 ${recognizedSchedules.length} 条日程。`);
      return;
    }
    const payload = {
      id: scheduleId || undefined,
      title: recognizedTitle,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      repeat: document.getElementById('scheduleRepeatDailyInput').checked ? 'daily' : null,
      priority: document.querySelector('input[name="schedulePriority"]:checked').value,
      reminderMinutesBefore: document.getElementById('scheduleReminderSelect').value === 'null' ? null : Number(document.getElementById('scheduleReminderSelect').value),
      sourceRef: wb.editingScheduleTodoId ? { type: 'todo', id: wb.editingScheduleTodoId } : null
    };
    if (wb.convertingTodoId) {
      const linkedCount = wb.workspace.schedules.filter((item) => item.sourceRef?.type === 'todo' && item.sourceRef.id === wb.convertingTodoId).length;
      if (linkedCount) {
        const accepted = await window.yanjiConfirm({
          title: '待办已有执行时间块',
          message: `该待办已有 ${linkedCount} 个关联日程。转换后，这些日程会保留但解除关联`,
          confirmText: '继续转换'
        });
        if (!accepted) return;
      }
      await workbenchApi.convertTodoToSchedule(wb.convertingTodoId, payload);
      wb.selectedDate = dateFromKey(date);
      closeWorkbenchDialog(document.getElementById('scheduleDialog'));
      showWorkbenchToast('待办已转换为日程');
      resetScheduleConversionContext();
      return;
    }
    if (!await confirmScheduleConflict(payload)) return;
    const savedSchedule = await workbenchApi.saveSchedule(payload);
    wb.selectedDate = dateFromKey(date);
    if (!scheduleId && savedSchedule?.id) {
      wb.pendingScheduleHighlightId = savedSchedule.id;
      renderTimeline();
    }
    if (!scheduleId) clearScheduleDraft();
    closeWorkbenchDialog(document.getElementById('scheduleDialog'));
    showWorkbenchToast('日程已保存。');
    resetScheduleConversionContext();
  } catch (exception) {
    error.textContent = exception.message || '日程保存失败。';
  }
}

function metadataValueText(note) {
  return Object.values(note.metadata || {}).filter((value) => value !== false && value !== '').join(' ');
}

const NOTE_ALLOWED_TAGS = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'I', 'IMG', 'LI', 'OL', 'P', 'S', 'SPAN', 'STRIKE', 'STRONG', 'U', 'UL']);
const NOTE_ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

function noteContentLooksRich(value) {
  return /<(?:a|b|br|div|em|i|img|li|ol|p|s|span|strike|strong|u|ul)(?:\s|\/?>)/i.test(String(value || ''));
}

function noteSourceHtml(value) {
  const source = String(value || '');
  return noteContentLooksRich(source) ? source : wbEscape(source).replace(/\r\n?|\n/g, '<br>');
}

function sanitizeNoteHtml(value) {
  const root = document.createElement('div');
  root.innerHTML = noteSourceHtml(value);
  const clean = (parent) => {
    [...parent.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }
      const tag = child.tagName;
      if (!NOTE_ALLOWED_TAGS.has(tag)) {
        const fragment = document.createDocumentFragment();
        while (child.firstChild) fragment.appendChild(child.firstChild);
        child.replaceWith(fragment);
        clean(parent);
        return;
      }
      [...child.attributes].forEach((attribute) => {
        const allowed = tag === 'IMG' && ['alt', 'data-note-attachment'].includes(attribute.name);
        if (!allowed) child.removeAttribute(attribute.name);
      });
      if (tag === 'A') child.removeAttribute('href');
      if (tag === 'IMG') {
        const id = child.getAttribute('data-note-attachment') || '';
        if (!NOTE_ATTACHMENT_ID_PATTERN.test(id)) {
          child.remove();
          return;
        }
        // The renderer hydrates local images from the attachment store. Never
        // persist a data URL or an arbitrary source inside the note body.
        child.removeAttribute('src');
      }
      clean(child);
    });
  };
  clean(root);
  return root.innerHTML;
}

function noteContentToEditorHtml(content, attachments = []) {
  const root = document.createElement('div');
  root.innerHTML = sanitizeNoteHtml(content);
  const available = new Map((attachments || []).map((attachment) => [String(attachment.id), attachment]));
  const referenced = new Set();
  root.querySelectorAll('img[data-note-attachment]').forEach((image) => {
    const id = image.dataset.noteAttachment;
    if (!available.has(id)) {
      image.remove();
      return;
    }
    referenced.add(id);
    image.classList.add('note-inline-image');
    image.alt = image.alt || available.get(id).originalName || '笔记图片';
    image.removeAttribute('src');
  });
  // Older 1.1.2 notes stored images in a separate attachment list. Bring
  // those images into the text flow once, so reopening a note does not hide
  // them in a second panel.
  for (const [id, attachment] of available) {
    if (referenced.has(id)) continue;
    const paragraph = document.createElement('p');
    const image = document.createElement('img');
    image.className = 'note-inline-image';
    image.dataset.noteAttachment = id;
    image.alt = attachment.originalName || '笔记图片';
    paragraph.appendChild(image);
    root.appendChild(paragraph);
  }
  return root.innerHTML;
}

function notePlainText(value) {
  const root = document.createElement('div');
  root.innerHTML = sanitizeNoteHtml(value);
  const blockTags = new Set(['DIV', 'LI', 'P']);
  const read = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'IMG') return '[图片]';
    const text = [...node.childNodes].map(read).join('');
    return blockTags.has(node.tagName) ? `${text}\n` : text;
  };
  return read(root).replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function readNoteEditorContent() {
  const editor = document.getElementById('noteContent');
  return sanitizeNoteHtml(editor?.innerHTML || '').slice(0, 100_000);
}

function renderNotes() {
  const query = document.getElementById('noteSearch').value.trim().toLowerCase();
  const notes = wb.workspace.notes.filter((note) => `${note.title} ${notePlainText(note.content)} ${metadataValueText(note)}`.toLowerCase().includes(query));
  document.getElementById('notesGrid').innerHTML = notes.length ? notes.map((note) => {
    const metadata = wb.workspace.metadataFields.filter((field) => note.metadata?.[field.id] !== undefined && note.metadata[field.id] !== '' && note.metadata[field.id] !== false).slice(0, 6);
    const words = window.YanjiNoteEditor?.wordCount(note.content) || 0;
    return `<article class="note-card note-document-card" data-edit-note="${wbEscape(note.id)}"><header><span>${formatUpdated(note.updatedAt)}</span><button data-sticky-note="${wbEscape(note.id)}" type="button">便笺</button></header><h3>${wbEscape(note.title)}</h3><p>${wbEscape(notePlainText(note.content).slice(0, 260) || '空白文档')}</p><footer><span>${words} 字</span><div class="note-metadata-tiles">${metadata.map((field, index) => `<span class="note-metadata-tile tone-${(index % 6) + 1}"><small>${wbEscape(field.name)}</small><b>${wbEscape(note.metadata[field.id] === true ? '是' : note.metadata[field.id])}</b></span>`).join('')}</div></footer></article>`;
  }).join('') : '<div class="workbench-empty notes-empty"><span>✎</span><h3>还没有笔记</h3><p>新建一条笔记，或用全局快捷键随手记录。</p></div>';
  const today = localDateKey(new Date());
  document.getElementById('addNoteButton').textContent = wb.workspace.notes.some((note) => note.kind === 'daily' && note.dateKey === today) ? '继续写今天' : '新建笔记';
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

function readNoteDraft() {
  try { return JSON.parse(localStorage.getItem('yanji.noteDraft.v1') || 'null'); } catch { return null; }
}

function noteEditorHasContent() {
  const editor = document.getElementById('noteContent');
  return Boolean(
    document.getElementById('noteTitle').value.trim()
    || editor?.textContent.trim()
    || editor?.querySelector('img[data-note-attachment]')
  );
}

function noteEditorPayload() {
  const referencedAttachmentIds = new Set([...document.querySelectorAll('#noteContent img[data-note-attachment]')].map((image) => image.dataset.noteAttachment));
  return {
    id: document.getElementById('noteId').value || undefined,
    kind: wb.editingNote?.kind || 'daily',
    dateKey: wb.editingNote?.dateKey || localDateKey(new Date()),
    title: document.getElementById('noteTitle').value,
    content: readNoteEditorContent(),
    metadata: readNoteMetadata(),
    attachments: (wb.editingNote?.attachments || []).filter((attachment) => referencedAttachmentIds.has(String(attachment.id))),
    revision: wb.editingNote?.revision
  };
}

function persistNoteDraftLocally() {
  if (!noteEditorHasContent()) return;
  const payload = noteEditorPayload();
  localStorage.setItem('yanji.noteDraft.v1', JSON.stringify({
    id: payload.id || '',
    title: payload.title,
    content: payload.content,
    metadata: payload.metadata,
    attachments: []
  }));
}

function clearNoteDraftLocally() {
  localStorage.removeItem('yanji.noteDraft.v1');
}

async function hydrateInlineNoteImages(note = wb.editingNote) {
  const editor = document.getElementById('noteContent');
  if (!editor || !note?.id) return;
  const attachments = new Map((note.attachments || []).map((attachment) => [String(attachment.id), attachment]));
  const images = [...editor.querySelectorAll('img[data-note-attachment]')];
  await Promise.all(images.map(async (image) => {
    const attachment = attachments.get(image.dataset.noteAttachment);
    if (!attachment) {
      image.remove();
      return;
    }
    try {
      const result = await workbenchApi.getNoteAttachment(note.id, attachment.id);
      if (!image.isConnected || document.getElementById('noteContent') !== editor || !result?.dataUrl) return;
      image.src = result.dataUrl;
      image.alt = image.alt || attachment.originalName || '笔记图片';
      image.classList.remove('is-missing');
    } catch {
      if (!image.isConnected) return;
      image.alt = `${attachment.originalName || '笔记图片'}（图片不可用）`;
      image.classList.add('is-missing');
    }
  }));
}

function rememberNoteEditorSelection() {
  const editor = document.getElementById('noteContent');
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) wb.noteSelection = range.cloneRange();
}

function restoreNoteEditorSelection() {
  const editor = document.getElementById('noteContent');
  if (!editor) return null;
  const selection = window.getSelection();
  if (wb.noteSelection && editor.contains(wb.noteSelection.commonAncestorContainer)) {
    selection.removeAllRanges();
    selection.addRange(wb.noteSelection);
    return wb.noteSelection;
  }
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function refreshNoteFormatButtons() {
  document.querySelectorAll('[data-note-command]').forEach((button) => {
    let active = false;
    try { active = document.queryCommandState(button.dataset.noteCommand); } catch { active = false; }
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function applyNoteFormat(command) {
  const editor = document.getElementById('noteContent');
  if (!editor) return;
  editor.focus();
  restoreNoteEditorSelection();
  document.execCommand(command, false, null);
  rememberNoteEditorSelection();
  refreshNoteFormatButtons();
  queueNoteAutoSave();
}

function insertInlineNoteAttachment(attachment, dataUrl) {
  const editor = document.getElementById('noteContent');
  if (!editor || !attachment?.id) return;
  editor.focus();
  const range = restoreNoteEditorSelection();
  if (!range) return;
  range.deleteContents();
  const imageBlock = document.createElement('div');
  const image = document.createElement('img');
  image.className = 'note-inline-image';
  image.dataset.noteAttachment = attachment.id;
  image.alt = attachment.originalName || '笔记图片';
  if (dataUrl) image.src = dataUrl;
  imageBlock.appendChild(image);
  range.insertNode(imageBlock);
  const trailingLine = document.createElement('div');
  trailingLine.appendChild(document.createElement('br'));
  imageBlock.parentNode.insertBefore(trailingLine, imageBlock.nextSibling);
  const caret = document.createRange();
  caret.setStart(trailingLine, 0);
  caret.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(caret);
  wb.noteSelection = caret.cloneRange();
  queueNoteAutoSave();
}

function openNoteImagePreview(src, alt = '图片预览') {
  const dialog = document.getElementById('noteImagePreviewDialog');
  const image = document.getElementById('noteImagePreview');
  if (!dialog || !image || !src) return;
  image.src = src;
  image.alt = alt;
  document.getElementById('noteImagePreviewTitle').textContent = alt || '图片预览';
  document.getElementById('removeNoteImageButton').hidden = !wb.previewingNoteImage?.attachmentId;
  openWorkbenchDialog(dialog);
}

function queueNoteAutoSave() {
  wb.noteDirty = true;
  wb.noteEditGeneration += 1;
  persistNoteDraftLocally();
  document.getElementById('noteSaveHint').textContent = '有未保存更改';
  window.YanjiNoteEditor?.updateDocumentStatus(document.getElementById('noteContent'), wb.editingNote);
  clearTimeout(wb.noteSaveTimer);
  wb.noteSaveTimer = setTimeout(() => flushNoteEditor({ silent: true }), 550);
}

async function flushNoteEditor({ silent = false } = {}) {
  const dialog = document.getElementById('noteDialog');
  if (!dialog?.open || !wb.noteDirty || !noteEditorHasContent()) return wb.editingNote;
  if (wb.noteSavePromise) return wb.noteSavePromise;
  const generation = wb.noteEditGeneration;
  const payload = noteEditorPayload();
  wb.noteSavePromise = (async () => {
    try {
      const note = await workbenchApi.saveNote(payload);
      wb.editingNote = note;
      document.getElementById('noteId').value = note.id;
      wb.noteConflict = false;
      document.getElementById('deleteNoteButton').hidden = false;
      document.getElementById('openStickyFromEditorButton').hidden = false;
      document.getElementById('addNoteImageButton').disabled = false;
      if (generation === wb.noteEditGeneration) {
        wb.noteDirty = false;
        clearNoteDraftLocally();
        document.getElementById('noteSaveHint').textContent = '已保存';
      }
      window.YanjiNoteEditor?.updateDocumentStatus(document.getElementById('noteContent'), note);
      const noteIndex = wb.workspace.notes.findIndex((item) => item.id === note.id);
      if (noteIndex >= 0) wb.workspace.notes.splice(noteIndex, 1, note);
      else wb.workspace.notes.unshift(note);
      renderNotes();
      renderHome();
      return note;
    } catch (error) {
      if (/其他窗口更新|重新载入/.test(error.message || '')) wb.noteConflict = true;
      document.getElementById('noteError').textContent = error.message || '笔记保存失败，草稿仍保留。';
      document.getElementById('noteSaveHint').textContent = '保存失败，草稿仍保留';
      if (!silent) throw error;
      return null;
    } finally {
      wb.noteSavePromise = null;
    }
  })();
  return wb.noteSavePromise;
}

async function openNoteEditor(note = null) {
  const todayKey = localDateKey(new Date());
  const todayDaily = !note ? wb.workspace.notes.find((item) => item.kind === 'daily' && item.dateKey === todayKey) : null;
  let targetNote = note || todayDaily || null;
  if (!targetNote) {
    targetNote = await workbenchApi.saveNote({ kind: 'daily', dateKey: todayKey, content: '' });
    wb.workspace.notes.unshift(targetNote);
  }
  const savedDraft = readNoteDraft();
  const draft = savedDraft && String(savedDraft.id || '') === String(targetNote.id || '') ? savedDraft : null;
  wb.editingNote = targetNote;
  wb.noteConflict = false;
  wb.noteSelection = null;
  wb.previewingNoteImage = null;
  document.getElementById('noteId').value = targetNote.id || '';
  const titleInput = document.getElementById('noteTitle');
  titleInput.value = draft?.title ?? targetNote.title ?? '';
  titleInput.hidden = targetNote.kind === 'daily';
  titleInput.readOnly = targetNote.kind === 'daily';
  const documentTitle = document.getElementById('noteDocumentTitle');
  documentTitle.textContent = targetNote.title;
  documentTitle.hidden = targetNote.kind !== 'daily';
  document.getElementById('noteContent').innerHTML = noteContentToEditorHtml(draft?.content ?? targetNote.content ?? '', targetNote.attachments || []);
  document.getElementById('noteDialogTitle').textContent = targetNote.kind === 'daily' ? '今日文档' : '编辑笔记';
  document.getElementById('deleteNoteButton').hidden = false;
  document.getElementById('openStickyFromEditorButton').hidden = false;
  document.getElementById('addNoteImageButton').disabled = false;
  window.YanjiNoteEditor?.restoreInspector();
  document.getElementById('noteError').textContent = '';
  document.getElementById('noteSaveHint').textContent = draft ? '已恢复未保存草稿' : '已保存';
  setNoteEditorFullscreen(false);
  renderNoteMetadata(targetNote ? { ...targetNote, metadata: draft?.metadata ?? targetNote.metadata } : { metadata: draft?.metadata || {} });
  window.YanjiNoteEditor?.updateDocumentStatus(document.getElementById('noteContent'), targetNote);
  wb.noteDirty = Boolean(draft);
  clearTimeout(wb.noteSaveTimer);
  const dialog = document.getElementById('noteDialog');
  openWorkbenchDialog(dialog);
  setTimeout(() => {
    window.YanjiNoteEditor?.placeCaretAtEnd(document.getElementById('noteContent'));
    hydrateInlineNoteImages(targetNote).catch(() => {});
  }, 20);
}

function setNoteEditorFullscreen(enabled) {
  const dialog = document.getElementById('noteDialog');
  const button = document.getElementById('toggleNoteFullscreenButton');
  const active = Boolean(enabled);
  const before = dialog.getBoundingClientRect();
  dialog.getAnimations().forEach((animation) => animation.cancel());
  dialog.firstElementChild?.getAnimations().forEach((animation) => animation.cancel());
  dialog.classList.toggle('is-workspace-fullscreen', active);
  button.setAttribute('aria-pressed', String(active));
  button.textContent = active ? '退出全屏' : '全屏编辑';
  if (!dialog.open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const after = dialog.getBoundingClientRect();
  const scaleX = before.width && after.width ? before.width / after.width : 1;
  const scaleY = before.height && after.height ? before.height / after.height : 1;
  dialog.firstElementChild?.animate([
    { transform: `translate3d(${before.left - after.left}px, ${before.top - after.top}px, 0) scale(${scaleX}, ${scaleY})` },
    { transform: 'translate3d(0, 0, 0) scale(1)' }
  ], { duration: 240, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
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
    wb.noteDirty = true;
    wb.noteEditGeneration += 1;
    const note = await flushNoteEditor();
    wb.editingNote = note;
    const deleted = note?.id ? await workbenchApi.deleteNoteIfEmpty(note.id) : false;
    closeWorkbenchDialog(document.getElementById('noteDialog'));
    showWorkbenchToast(deleted ? '空白笔记已自动删除' : '笔记已保存。');
  } catch (exception) {
    document.getElementById('noteError').textContent = exception.message || '笔记保存失败。';
  }
}

async function closeNoteEditorSafely(dialog) {
  clearTimeout(wb.noteSaveTimer);
  if (wb.noteDirty) {
    const saved = await flushNoteEditor({ silent: true });
    if (!saved || wb.noteDirty) {
      persistNoteDraftLocally();
      document.getElementById('noteError').textContent ||= '笔记尚未保存，已保留本地草稿；解决保存问题后再关闭。';
      return false;
    }
  }
  if (wb.editingNote?.id) await workbenchApi.deleteNoteIfEmpty(wb.editingNote.id).catch(() => false);
  clearNoteDraftLocally();
  if (dialog.open) closeWorkbenchDialog(dialog);
  return true;
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
  const nextWorkspace = workspace || await workbenchApi.getWorkspace();
  const noteDialog = document.getElementById('noteDialog');
  if (noteDialog?.open && wb.editingNote?.id) {
    const latest = nextWorkspace.notes?.find((note) => note.id === wb.editingNote.id);
    if (!wb.noteSavePromise && !wb.noteAttachmentMutation && latest && Number(latest.revision || 0) > Number(wb.editingNote.revision || 0)) {
      const editor = document.getElementById('noteContent');
      if (!wb.noteDirty) {
        wb.editingNote = latest;
        editor.innerHTML = noteContentToEditorHtml(latest.content, latest.attachments);
        hydrateInlineNoteImages(latest).catch(() => {});
        document.getElementById('noteSaveHint').textContent = '已同步其他窗口的更新';
      } else {
        const suffix = window.YanjiNoteEditor?.appendedSuffix(wb.editingNote.content, latest.content);
        if (suffix !== null) {
          editor.insertAdjacentHTML('beforeend', sanitizeNoteHtml(suffix));
          wb.editingNote = latest;
          hydrateInlineNoteImages(latest).catch(() => {});
          persistNoteDraftLocally();
          document.getElementById('noteSaveHint').textContent = '已合并其他窗口的追加内容';
        } else {
          wb.noteConflict = true;
          document.getElementById('noteError').textContent = '检测到这份文档已在其他窗口修改。当前草稿不会覆盖新版本；请复制草稿后重新载入。';
          document.getElementById('noteSaveHint').textContent = '存在版本冲突';
        }
      }
      window.YanjiNoteEditor?.updateDocumentStatus(editor, wb.editingNote);
    }
  }
  wb.workspace = nextWorkspace;
  wb.workspace.todos ||= [];
  wb.workspace.attendance ||= [];
  wb.workspace.focusSessions ||= [];
  wb.workspace.jobApplications ||= [];
  renderHome();
  window.YanjiTodoView?.setWorkspace(wb.workspace);
  if (wb.page === 'schedule') renderTimeline();
  if (wb.page === 'todos') window.YanjiTodoView?.render();
  if (wb.page === 'attendance') renderAttendance();
  if (wb.page === 'notes') renderNotes();
  if (wb.page === 'jobs') renderJobs();
}

function bindWorkbenchEvents() {
  document.querySelectorAll('[data-workbench-page]').forEach((button) => button.addEventListener('click', (event) => {
    switchWorkbenchPage(button.dataset.workbenchPage, { animate: event.detail > 0 });
  }));
  document.querySelectorAll('[data-go-page]').forEach((button) => button.addEventListener('click', () => switchWorkbenchPage(button.dataset.goPage)));
  document.getElementById('quickScheduleButton').addEventListener('click', () => openScheduleEditor());
  document.getElementById('quickNoteButton').addEventListener('click', () => openNoteEditor());
  document.getElementById('addScheduleButton').addEventListener('click', () => openScheduleEditor());
  document.getElementById('addJobButton').addEventListener('click', () => openJobEditor());
  document.getElementById('saveJobButton').addEventListener('click', saveJobFromEditor);
  document.getElementById('cancelJobButton').addEventListener('click', () => closeWorkbenchDialog(document.getElementById('jobDialog')));
  document.getElementById('jobSearch').addEventListener('input', renderJobs);
  document.getElementById('jobStatusFilter').addEventListener('change', renderJobs);
  document.getElementById('jobPriorityFilter').addEventListener('change', renderJobs);
  document.getElementById('jobCityFilter').addEventListener('change', renderJobs);
  document.getElementById('jobSortFilter').addEventListener('change', (event) => { wb.jobSort = event.target.value; renderJobs(); });
  document.getElementById('jobSortDirectionButton').addEventListener('click', () => {
    wb.jobSortDirection = wb.jobSortDirection === 'asc' ? 'desc' : 'asc';
    renderJobs();
  });
  document.getElementById('jobQuickFilters').addEventListener('click', (event) => {
    const filter = event.target.closest('[data-job-quick-filter]')?.dataset.jobQuickFilter;
    if (!filter) return;
    wb.jobQuickFilter = filter;
    if (filter === 'closed') document.getElementById('jobStatusFilter').value = 'closed';
    else if (filter === 'all') document.getElementById('jobStatusFilter').value = 'all';
    else document.getElementById('jobStatusFilter').value = 'all';
    renderJobs();
  });
  document.getElementById('jobBoard').addEventListener('change', (event) => {
    const control = event.target.closest('[data-job-field]');
    if (!control) return;
    saveJobInlineField(control.dataset.jobId, control.dataset.jobField, control.value);
  });
  document.getElementById('deleteJobButton').addEventListener('click', () => deleteJobById(document.getElementById('jobId').value));
  document.getElementById('importJobsButton').addEventListener('click', importJobRecords);
  document.getElementById('exportJobsButton').addEventListener('click', exportJobRecords);
  document.getElementById('jobSettingsButton').addEventListener('click', () => switchWorkbenchPage('settings'));
  document.getElementById('resetJobWorkflowButton').addEventListener('click', () => {
    wb.editingJobWorkflow = defaultJobWorkflow();
    document.getElementById('jobError').textContent = '';
    renderWorkflowEditor(wb.editingJobWorkflow);
  });
  document.getElementById('jobWorkflowEditor').addEventListener('change', (event) => {
    const row = event.target.closest('[data-workflow-stage-option]');
    if (!row) return;
    const workflow = readWorkflowEditor();
    if (event.target.matches('[data-workflow-stage-enabled], [data-workflow-set-current]')) renderWorkflowEditor(workflow);
  });
  document.getElementById('jobWorkflowEditor').addEventListener('click', (event) => {
    const button = event.target.closest('[data-move-workflow-stage]');
    const row = button?.closest('[data-workflow-stage-option]');
    if (!button || !row) return;
    moveWorkflowEditorStage(row.dataset.stageId, button.dataset.moveWorkflowStage);
  });
  document.getElementById('jobDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeWorkbenchDialog(event.currentTarget); });
  document.getElementById('jobDialog').addEventListener('cancel', (event) => { event.preventDefault(); closeWorkbenchDialog(event.currentTarget); });
  document.getElementById('dismissDailyPlanButton').addEventListener('click', closeDailyPlanDialog);
  document.getElementById('createDailyTodoButton').addEventListener('click', () => {
    closeDailyPlanDialog();
    const dueAt = new Date();
    dueAt.setHours(18, 0, 0, 0);
    window.YanjiTodoView?.openCreateDialog({ dueAt: dueAt.toISOString(), priority: 'medium' });
  });
  document.getElementById('dailyPlanDialog').addEventListener('cancel', (event) => { event.preventDefault(); closeDailyPlanDialog(); });
  window.YanjiTodoView?.init();
  document.getElementById('scheduleTodayButton').addEventListener('click', () => changeScheduleDate(new Date()));
  document.getElementById('previousDayButton').addEventListener('click', () => changeScheduleDate(addDays(wb.selectedDate, -1)));
  document.getElementById('nextDayButton').addEventListener('click', () => changeScheduleDate(addDays(wb.selectedDate, 1)));
  document.getElementById('saveScheduleButton').addEventListener('click', saveScheduleFromEditor);
  window.addEventListener('yanji:todo-schedule', (event) => {
    wb.pendingTodoId = event.detail?.id || null;
    switchWorkbenchPage('schedule');
    openScheduleEditor(null, event.detail || null);
  });
  window.addEventListener('yanji:todo-convert', (event) => {
    const todoId = event.detail?.id;
    if (!todoId) return;
    wb.pendingTodoId = null;
    switchWorkbenchPage('schedule');
    openScheduleEditor(null, null, { convertTodoId: todoId });
  });
  document.getElementById('scheduleAllDayInput').addEventListener('change', (event) => document.querySelectorAll('.schedule-time-field').forEach((field) => field.classList.toggle('is-hidden', event.target.checked)));
  document.getElementById('scheduleDetachTodoButton').addEventListener('click', async () => {
    const id = document.getElementById('scheduleId').value;
    if (!id) return;
    try { await workbenchApi.detachSchedule(id); closeWorkbenchDialog(document.getElementById('scheduleDialog')); showWorkbenchToast('已解除待办关联'); } catch (error) { document.getElementById('scheduleError').textContent = error.message || '解除关联失败'; }
  });
  document.getElementById('convertScheduleButton').addEventListener('click', () => {
    const id = document.getElementById('scheduleId').value;
    openScheduleConvertDialog(wb.workspace.schedules.find((item) => item.id === id));
  });
  document.getElementById('saveScheduleConvertButton').addEventListener('click', saveScheduleConversion);
  document.getElementById('cancelScheduleConvertButton').addEventListener('click', closeScheduleConvertDialog);
  document.getElementById('scheduleConvertDialog').addEventListener('cancel', (event) => { event.preventDefault(); closeScheduleConvertDialog(); });
  document.getElementById('scheduleConvertDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeScheduleConvertDialog(); });
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
      resetScheduleConversionContext();
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
    if (wb.usageRange === button.dataset.usageRange) return;
    wb.usageRange = button.dataset.usageRange;
    renderAttendanceUsage();
    window.YanjiMotion?.animateTab(document.getElementById('focusUsageList'));
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
  document.getElementById('toggleNoteMetadataButton').addEventListener('click', () => window.YanjiNoteEditor?.toggleInspector());
  document.getElementById('noteTitle').addEventListener('input', queueNoteAutoSave);
  document.getElementById('toggleNoteFullscreenButton').addEventListener('click', () => {
    setNoteEditorFullscreen(!document.getElementById('noteDialog').classList.contains('is-workspace-fullscreen'));
    document.getElementById('noteContent').focus();
  });
  const noteEditor = document.getElementById('noteContent');
  document.querySelector('.note-paper-scroll')?.addEventListener('wheel', (event) => window.YanjiNoteEditor?.handleZoomWheel(event), { passive: false });
  noteEditor.addEventListener('input', queueNoteAutoSave);
  noteEditor.addEventListener('mouseup', rememberNoteEditorSelection);
  noteEditor.addEventListener('keyup', rememberNoteEditorSelection);
  document.querySelector('.note-format-tools')?.addEventListener('mousedown', (event) => {
    if (event.target.closest('[data-note-command]')) event.preventDefault();
  });
  document.querySelector('.note-format-tools')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-note-command]');
    if (button) applyNoteFormat(button.dataset.noteCommand);
  });
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && noteEditor.contains(selection.anchorNode)) {
      rememberNoteEditorSelection();
      refreshNoteFormatButtons();
    }
  });
  noteEditor.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if ((event.key === 'Enter' || event.key.toLowerCase() === 's') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      wb.noteDirty = true;
      wb.noteEditGeneration += 1;
      flushNoteEditor().catch(() => {});
      return;
    }
    if (window.YanjiListEditing?.applyContentEditableListEditing(noteEditor, event)) {
      event.preventDefault();
    }
  });
  noteEditor.addEventListener('click', async (event) => {
    const image = event.target.closest('img[data-note-attachment]');
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    const attachmentId = image.dataset.noteAttachment;
    const attachment = (wb.editingNote?.attachments || []).find((item) => String(item.id) === String(attachmentId));
    let src = image.currentSrc || image.src;
    if (!src && attachment && wb.editingNote?.id) {
      try { src = (await workbenchApi.getNoteAttachment(wb.editingNote.id, attachment.id))?.dataUrl; } catch { /* show no preview when the file is unavailable */ }
    }
    if (!src) return;
    wb.previewingNoteImage = { attachmentId, noteId: wb.editingNote?.id || '', alt: image.alt || attachment?.originalName || '笔记图片' };
    openNoteImagePreview(src, wb.previewingNoteImage.alt);
  });
  document.getElementById('noteDialog').addEventListener('input', (event) => {
    if (event.target.matches('[data-metadata-value]')) queueNoteAutoSave();
  });
  document.getElementById('noteDialog').addEventListener('change', (event) => {
    if (event.target.matches('[data-metadata-value]')) queueNoteAutoSave();
  });
  document.getElementById('addNoteImageButton').addEventListener('click', async () => {
    try {
      wb.noteAttachmentMutation = true;
      rememberNoteEditorSelection();
      if (!document.getElementById('noteId').value) {
        document.getElementById('noteError').textContent = '请先保存笔记，再插入图片。';
        return;
      }
      const id = document.getElementById('noteId').value;
      const attachment = await workbenchApi.addNoteAttachment(id);
      if (!attachment) return;
      wb.editingNote = { ...(wb.editingNote || {}), attachments: [...(wb.editingNote?.attachments || []), attachment], revision: Number(wb.editingNote?.revision || 0) + 1 };
      const image = await workbenchApi.getNoteAttachment(id, attachment.id);
      insertInlineNoteAttachment(attachment, image?.dataUrl);
      document.getElementById('noteSaveHint').textContent = '图片已插入，正在保存…';
    } catch (error) {
      document.getElementById('noteError').textContent = error.message || '图片添加失败';
    } finally {
      wb.noteAttachmentMutation = false;
    }
  });
  document.getElementById('removeNoteImageButton').addEventListener('click', async () => {
    const preview = wb.previewingNoteImage;
    const noteId = document.getElementById('noteId').value;
    if (!preview?.attachmentId || !noteId) return;
    try {
      wb.noteAttachmentMutation = true;
      await workbenchApi.deleteNoteAttachment(noteId, preview.attachmentId);
      const image = [...noteEditor.querySelectorAll('img[data-note-attachment]')].find((item) => item.dataset.noteAttachment === preview.attachmentId);
      image?.remove();
      wb.editingNote = { ...wb.editingNote, attachments: (wb.editingNote?.attachments || []).filter((item) => String(item.id) !== String(preview.attachmentId)), revision: Number(wb.editingNote?.revision || 0) + 1 };
      wb.previewingNoteImage = null;
      queueNoteAutoSave();
      closeWorkbenchDialog(document.getElementById('noteImagePreviewDialog'));
      document.getElementById('noteSaveHint').textContent = '图片已删除，正在保存…';
    } catch (error) {
      document.getElementById('noteError').textContent = error.message || '图片删除失败';
    } finally {
      wb.noteAttachmentMutation = false;
    }
  });
  document.getElementById('openStickyFromEditorButton').addEventListener('click', async () => {
    try {
      if (wb.noteDirty) {
        showWorkbenchToast('请先保存当前修改，再打开便笺。');
        return;
      }
      await workbenchApi.openStickyNote(document.getElementById('noteId').value);
    } catch (error) {
      document.getElementById('noteError').textContent = error.message || '无法打开悬浮便笺';
    }
  });
  document.getElementById('cancelNoteButton').addEventListener('click', async () => {
    await closeNoteEditorSafely(document.getElementById('noteDialog'));
  });
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
  document.querySelectorAll('#scheduleDialog input, #scheduleDialog select').forEach((input) => input.addEventListener('input', () => {
    clearTimeout(wb.scheduleDraftTimer);
    wb.scheduleDraftTimer = setTimeout(() => {
      if (document.getElementById('scheduleDialog').open && !document.getElementById('scheduleId').value) localStorage.setItem(SCHEDULE_DRAFT_KEY, JSON.stringify(captureScheduleDraft()));
    }, 350);
  }));
  document.getElementById('noteDialog').addEventListener('cancel', (event) => {
    event.preventDefault();
    const dialog = event.currentTarget;
    if (dialog.classList.contains('is-workspace-fullscreen')) {
      setNoteEditorFullscreen(false);
      return;
    }
    closeNoteEditorSafely(dialog).catch(() => {});
  });
  document.getElementById('noteDialog').addEventListener('close', () => setNoteEditorFullscreen(false));
  document.getElementById('noteImagePreviewDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeWorkbenchDialog(event.currentTarget);
  });
  document.getElementById('noteImagePreviewDialog').addEventListener('close', () => {
    wb.previewingNoteImage = null;
    document.getElementById('noteImagePreview').removeAttribute('src');
  });
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.closeDialog === 'noteDialog') return;
    closeWorkbenchDialog(document.getElementById(button.dataset.closeDialog));
  }));
  window.addEventListener('blur', () => {
    if (document.getElementById('noteDialog')?.open) persistNoteDraftLocally();
    if (document.getElementById('scheduleDialog')?.open) flushScheduleDraft();
    window.YanjiTodoView?.flushDraft?.();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      if (document.getElementById('noteDialog')?.open) persistNoteDraftLocally();
      if (document.getElementById('scheduleDialog')?.open) flushScheduleDraft();
      window.YanjiTodoView?.flushDraft?.();
    }
  });
  document.body.addEventListener('click', async (event) => {
    const homeJobFilter = event.target.closest('[data-job-home-filter]');
    if (homeJobFilter) {
      switchWorkbenchPage('jobs');
      wb.jobQuickFilter = `funnel-${homeJobFilter.dataset.jobHomeFilter}`;
      document.getElementById('jobStatusFilter').value = 'all';
      return renderJobs();
    }
    const addJobTarget = event.target.closest('[data-add-job]');
    if (addJobTarget) return openJobEditor(null, addJobTarget.dataset.addJob);
    const deleteJobTarget = event.target.closest('[data-delete-job]');
    if (deleteJobTarget) return deleteJobById(deleteJobTarget.dataset.deleteJob);
    const sourceJobTarget = event.target.closest('[data-open-job-source]');
    if (sourceJobTarget) return workbenchApi.openExternal(sourceJobTarget.dataset.openJobSource);
    const editJobTarget = event.target.closest('[data-edit-job]');
    if (editJobTarget) return openJobEditor(wb.workspace.jobApplications.find((item) => item.id === editJobTarget.dataset.editJob));
    const selectedDateTarget = event.target.closest('[data-select-schedule-date]');
    if (selectedDateTarget) {
      return changeScheduleDate(dateFromKey(selectedDateTarget.dataset.selectScheduleDate));
    }
    const addForDateTarget = event.target.closest('[data-add-schedule-date]');
    if (addForDateTarget) {
      wb.selectedDate = dateFromKey(addForDateTarget.dataset.addScheduleDate);
      return openScheduleEditor();
    }
    const attendanceTarget = event.target.closest('[data-edit-attendance]');
    if (attendanceTarget?.dataset.editAttendance) return openAttendanceEditor(wb.workspace.attendance.find((item) => item.id === attendanceTarget.dataset.editAttendance));
    const linkedTodoTarget = event.target.closest('[data-open-linked-todo]');
    if (linkedTodoTarget?.dataset.openLinkedTodo) return window.YanjiTodoView?.openEditDialog(wb.workspace.todos.find((todo) => todo.id === linkedTodoTarget.dataset.openLinkedTodo));
    const scheduleTarget = event.target.closest('[data-edit-schedule]');
    if (scheduleTarget) return openScheduleEditor(wb.workspace.schedules.find((item) => item.id === scheduleTarget.dataset.editSchedule));
    const todoTarget = event.target.closest('[data-edit-todo]');
    if (todoTarget) return window.YanjiTodoView?.openEditDialog(wb.workspace.todos.find((item) => item.id === todoTarget.dataset.editTodo));
    const homeTodoAction = event.target.closest('[data-home-todo-action]');
    if (homeTodoAction) {
      try {
        const id = homeTodoAction.dataset.homeTodoId;
        const updated = homeTodoAction.dataset.homeTodoAction === 'reopen'
          ? await workbenchApi.reopenTodo(id)
          : await workbenchApi.completeTodo(id);
        wb.workspace.todos = wb.workspace.todos.map((todo) => todo.id === updated.id ? updated : todo);
        renderHome();
        window.YanjiTodoView?.setWorkspace(wb.workspace);
        showWorkbenchToast(updated.status === 'completed' ? '今日待办已完成' : '待办已重新打开');
      } catch (error) {
        showWorkbenchToast(error.message || '待办状态更新失败', 'error');
      }
      return;
    }
    const stickyTarget = event.target.closest('[data-sticky-note]');
    if (stickyTarget) { event.stopPropagation(); return workbenchApi.openStickyNote(stickyTarget.dataset.stickyNote); }
    const noteTarget = event.target.closest('[data-edit-note]');
    if (noteTarget) return openNoteEditor(wb.workspace.notes.find((item) => item.id === noteTarget.dataset.editNote), noteTarget);
  });
  document.body.addEventListener('keydown', (event) => {
    const card = event.target.closest('.job-position');
    if (!card || event.target !== card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openJobEditor(wb.workspace.jobApplications.find((item) => item.id === card.dataset.jobId));
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
  setInterval(() => {
    if (document.visibilityState === 'visible') renderClock();
  }, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') renderClock();
  });
  const settings = await workbenchApi.getSettings().catch(() => null);
  wb.settings = settings || {};
  if (settings?.quickCaptureShortcut) document.getElementById('shortcutTip').textContent = settings.quickCaptureShortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
  if (settings?.stickyNoteShortcut) document.getElementById('stickyShortcutTip').textContent = settings.stickyNoteShortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
  await refreshWorkspace();
  workbenchApi.onWorkspaceChanged(refreshWorkspace);
  workbenchApi.onSettingsChanged((settings) => { wb.settings = settings || wb.settings; });
  workbenchApi.onWorkspaceNavigate((target) => {
    const page = typeof target === 'string' ? target : target?.page;
    if (!page) return;
    switchWorkbenchPage(page);
    if (page === 'todos' && target?.todoId) {
      setTimeout(() => window.YanjiTodoView?.openEditDialog(wb.workspace.todos.find((todo) => todo.id === target.todoId)), 0);
    }
  });
  workbenchApi.onFocusChanged((sessions) => {
    wb.workspace.focusSessions = sessions || [];
    renderFocus();
  });
  switchWorkbenchPage('home');
  maybeShowDailyPlan();
}

window.showWorkbenchToast = showWorkbenchToast;
initializeWorkbench().catch((error) => showWorkbenchToast(error.message || '工作台加载失败。', 'error'));

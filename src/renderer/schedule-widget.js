'use strict';

const api = window.paperTrail;
let workspace = { schedules: [] };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function schedulesForToday() {
  const dayStart = startOfDay(new Date());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return workspace.schedules
    .filter((item) => {
      const start = new Date(item.startAt);
      const end = new Date(item.endAt || item.startAt);
      return start < dayEnd && end > dayStart;
    })
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

function timeForToday(item) {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(item.startAt);
  const end = new Date(item.endAt || item.startAt);
  const clippedStart = start < today ? today : start;
  const clippedEnd = end > tomorrow ? tomorrow : end;
  const formatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const endLabel = clippedEnd >= tomorrow ? '24:00' : formatter.format(clippedEnd);
  return {
    start: formatter.format(clippedStart),
    end: endLabel,
    spansDay: start < today || end > tomorrow
  };
}

function render() {
  const now = new Date();
  document.getElementById('dateDay').textContent = String(now.getDate()).padStart(2, '0');
  document.getElementById('dateWeekday').textContent = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now);
  document.getElementById('dateFull').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(now);
  const schedules = schedulesForToday();
  const completed = schedules.filter((item) => item.completedAt).length;
  document.getElementById('widgetProgress').textContent = `${completed} / ${schedules.length}`;
  document.getElementById('widgetScheduleList').innerHTML = schedules.length ? schedules.map((item) => {
    const timing = timeForToday(item);
    const priority = item.priority === 'high' ? '最高优先级' : item.priority === 'medium' ? '重要' : '普通';
    return `<article class="widget-item tone-${escapeHtml(item.priority)} ${item.completedAt ? 'completed' : ''}"><time>${timing.start}<br>${timing.end}</time><div class="widget-item-copy"><strong>${escapeHtml(item.title)}</strong><span>${priority}${item.deadline ? ' · Deadline' : ''}${timing.spansDay ? ' · 跨日' : ''}</span></div><button class="widget-check" data-complete-schedule="${escapeHtml(item.id)}" data-completed="${Boolean(item.completedAt)}" type="button" aria-label="${item.completedAt ? '恢复' : '完成'}${escapeHtml(item.title)}">${item.completedAt ? '✓' : ''}</button></article>`;
  }).join('') : '<div class="widget-empty">今天还没有安排。<br>打开研迹新建一项日程吧。</div>';
}

async function refresh(nextWorkspace) {
  workspace = nextWorkspace || await api.getWorkspace();
  render();
}

document.getElementById('widgetScheduleList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-complete-schedule]');
  if (!button) return;
  button.disabled = true;
  try {
    await api.completeSchedule(button.dataset.completeSchedule, button.dataset.completed !== 'true');
    await refresh();
  } finally {
    button.disabled = false;
  }
});
document.getElementById('closeWidgetButton').addEventListener('click', () => api.closeScheduleWidget());
document.getElementById('openMainButton').addEventListener('click', () => api.openScheduleWidgetMain());
api.onWorkspaceChanged(refresh);
refresh();

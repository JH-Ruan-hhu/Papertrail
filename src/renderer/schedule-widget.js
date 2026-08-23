'use strict';

const api = window.paperTrail;
let workspace = { schedules: [], todos: [] };

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }

// Kept as a pure helper for the desktop smoke test and older integrations.
function schedulesForToday() {
  const dayStart = startOfDay(new Date());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return (workspace.schedules || []).filter((item) => {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt || item.startAt);
    return start < dayEnd && end > dayStart;
  }).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
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
  return { start: item.allDay ? '全天' : formatter.format(clippedStart), end: item.allDay ? '' : clippedEnd >= tomorrow ? '24:00' : formatter.format(clippedEnd), spansDay: start < today || end > tomorrow };
}

function render() {
  const now = new Date();
  document.getElementById('dateDay').textContent = String(now.getDate()).padStart(2, '0');
  document.getElementById('dateWeekday').textContent = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(now);
  document.getElementById('dateFull').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(now);
  const schedules = schedulesForToday();
  const todos = (workspace.todos || []).filter((todo) => todo.status === 'open');
  document.getElementById('widgetProgress').textContent = `${(workspace.todos || []).filter((todo) => todo.status === 'completed').length} / ${(workspace.todos || []).length}`;
  document.getElementById('widgetScheduleList').innerHTML = schedules.length ? schedules.map((item) => {
    const timing = timeForToday(item);
    const priority = item.priority === 'high' ? '最高优先级' : item.priority === 'medium' ? '重要' : '普通';
    return `<article class="widget-item tone-${escapeHtml(item.priority)}"><time>${timing.start}${timing.end ? `–${timing.end}` : ''}</time><div class="widget-item-copy"><strong>${escapeHtml(item.title)}</strong><span>${priority}${item.sourceRef ? ' · 已关联待办' : ''}${timing.spansDay ? ' · 跨日' : ''}</span></div></article>`;
  }).join('') : '<div class="widget-empty">今天还没有日程。<br>打开研迹新建一项时间块吧。</div>';
  document.getElementById('widgetTodoList').innerHTML = todos.length ? todos.slice(0, 5).map((todo) => `<label class="widget-todo-item"><input type="checkbox" data-complete-todo="${escapeHtml(todo.id)}"><span>${escapeHtml(todo.title)}</span></label>`).join('') : '';
}

async function refresh(nextWorkspace) {
  workspace = nextWorkspace || await api.getTodayWidgetData();
  render();
}

document.getElementById('widgetTodoList').addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-complete-todo]');
  if (!checkbox) return;
  checkbox.disabled = true;
  try { await api.completeTodo(checkbox.dataset.completeTodo); await refresh(); } finally { checkbox.disabled = false; }
});
document.getElementById('closeWidgetButton').addEventListener('click', () => api.closeScheduleWidget());
document.getElementById('openMainButton').addEventListener('click', () => api.openScheduleWidgetMain());
api.onTodayWidgetChanged(refresh);
refresh();

'use strict';
const api = window.paperTrail;
function dismiss() { api.dismissDeadline(); }
api.onDeadlineShow((schedule) => {
  document.body.classList.toggle('medium', schedule.priority === 'medium');
  document.getElementById('deadlineTitle').textContent = schedule.reminderKind === 'todo' ? '待办提醒' : schedule.title;
  document.getElementById('deadlineTime').textContent = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(schedule.dueAt || schedule.startAt));
});
document.getElementById('snoozeButton')?.addEventListener('click', () => api.snoozeDeadline(15 * 60_000));
document.getElementById('dismissButton').addEventListener('click', dismiss);
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === 'Escape') dismiss(); });

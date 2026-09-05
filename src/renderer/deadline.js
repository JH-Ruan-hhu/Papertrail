'use strict';
const api = window.paperTrail;
function dismiss() { api.dismissDeadline(); }
api.onDeadlineShow((schedule) => {
  const isTodo = schedule.kind === 'todo';
  const overdue = Boolean(schedule.overdue || schedule.level === 'overdue');
  document.body.classList.toggle('medium', schedule.priority !== 'high');
  document.getElementById('deadlineTitle').textContent = isTodo
    ? (overdue ? `${schedule.title} 已逾期` : schedule.title)
    : schedule.title;
  const when = schedule.scheduledAt || schedule.dueAt || schedule.startAt;
  document.getElementById('deadlineTime').textContent = when ? new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(when)) : '未设置截止时间';
  const notes = document.getElementById('deadlineNotes');
  notes.textContent = schedule.notesPreview || '';
  notes.hidden = !schedule.notesPreview;
  const meta = document.getElementById('deadlineMeta');
  meta.textContent = [schedule.priority === 'high' ? '最高优先级' : schedule.priority === 'medium' ? '重要优先级' : '普通优先级', overdue ? '已逾期' : isTodo ? '待办提醒' : '日程提醒'].join(' · ');
  meta.hidden = false;
});
document.getElementById('snoozeButton')?.addEventListener('click', () => api.snoozeDeadline(10 * 60_000));
document.getElementById('dismissButton').addEventListener('click', dismiss);
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === 'Escape') dismiss(); });

'use strict';
const api = window.paperTrail;
function dismiss() { api.dismissDeadline(); }
api.onDeadlineShow((schedule) => {
  document.body.classList.toggle('medium', schedule.priority === 'medium');
  document.getElementById('deadlineTitle').textContent = schedule.title;
  document.getElementById('deadlineTime').textContent = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(schedule.startAt));
});
document.getElementById('dismissButton').addEventListener('click', dismiss);
document.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === 'Escape') dismiss(); });

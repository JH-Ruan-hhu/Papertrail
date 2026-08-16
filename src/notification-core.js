'use strict';

function importantChanges(previous, current, changes = []) {
  if (current.kind === 'production') {
    const previousIds = new Set((previous.productionEvents || []).map((event) => `${event.id}:${event.dateText}`));
    const newEvents = (current.productionEvents || []).filter((event) => !previousIds.has(`${event.id}:${event.dateText}`));
    return newEvents.slice(0, 3).map((event) => event.label);
  }

  const important = [];
  if (String(previous.status?.raw) !== String(current.status?.raw)) {
    important.push(`状态：${previous.status?.label || '未知'} → ${current.status.label}`);
  }
  if ((current.counts?.completed || 0) > (previous.counts?.completed || 0)) {
    important.push(`收到新的审稿回复：${previous.counts?.completed || 0} → ${current.counts.completed}`);
  }
  if ((current.counts?.accepted || 0) > (previous.counts?.accepted || 0)) {
    important.push(`有审稿人接受邀请：${previous.counts?.accepted || 0} → ${current.counts.accepted}`);
  }
  return important.length ? important : changes.filter((item) => item.startsWith('状态：'));
}

module.exports = { importantChanges };

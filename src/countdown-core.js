'use strict';

function isoDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizeCountdown(value, index = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const title = String(source.title || '').trim().slice(0, 120);
  const targetAt = isoDate(source.targetAt);
  if (!title || !targetAt) return null;
  const createdAt = isoDate(source.createdAt) || targetAt;
  const updatedAt = isoDate(source.updatedAt) || createdAt;
  return {
    id: String(source.id || `countdown-${index + 1}`).trim().slice(0, 160) || `countdown-${index + 1}`,
    title,
    targetAt,
    createdAt,
    updatedAt
  };
}

function saveCountdown(list, input, now = new Date().toISOString(), makeId = () => `countdown-${Date.now()}`) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const title = String(source.title || '').trim();
  if (!title) throw new Error('请填写倒计时名称。');
  if (title.length > 120) throw new Error('倒计时名称不能超过 120 个字符。');
  const targetAt = isoDate(source.targetAt);
  if (!targetAt) throw new Error('请选择有效的目标时间。');
  const id = String(source.id || '').trim();
  const existing = id ? list.find((item) => item.id === id) : null;
  if (id && !existing) throw new Error('找不到这个倒计时。');
  const saved = {
    id: existing?.id || makeId(),
    title,
    targetAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return {
    countdowns: existing ? list.map((item) => item.id === existing.id ? saved : item) : [saved, ...list],
    countdown: saved
  };
}

function deleteCountdown(list, id) {
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) throw new Error('找不到这个倒计时。');
  return next;
}

module.exports = { deleteCountdown, normalizeCountdown, saveCountdown };

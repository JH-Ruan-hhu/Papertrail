'use strict';

const TRACKER_HOST = 'track.authorhub.elsevier.com';
const ELSEVIER_SHARE_HOST = 'authors.elsevier.com';
const TRACKER_API_ORIGIN = 'https://tnlkuelk67.execute-api.us-east-1.amazonaws.com';
const STATUS_LABELS = Object.freeze({
  3: '审稿中',
  4: '所需审稿已完成',
  8: '编辑处理中',
  11: '修改后重审',
  23: '审稿中',
  28: '正在邀请编辑'
});

function parseTrackingInput(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('请输入 Elsevier 投稿追踪链接。');
  }

  let uuid;
  let canonicalUrl;

  if (/^[A-Za-z0-9_-]{16,200}$/.test(raw)) {
    uuid = raw;
    canonicalUrl = `https://${TRACKER_HOST}/?uuid=${encodeURIComponent(uuid)}`;
  } else {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('链接格式不正确，请粘贴完整的 Elsevier 追踪链接。');
    }

    if (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === ELSEVIER_SHARE_HOST &&
      /^\/c\/[A-Za-z0-9_~-]+\/?$/.test(parsed.pathname)
    ) {
      throw new Error('这是 Elsevier 论文阅读 Share Link，不是投稿状态追踪链接。请粘贴含 uuid 的 Author Hub 追踪链接。');
    }

    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== TRACKER_HOST) {
      throw new Error(`目前只支持 https://${TRACKER_HOST}/ 的投稿状态追踪链接。`);
    }

    uuid = parsed.searchParams.get('uuid');
    if (!uuid || !/^[A-Za-z0-9_-]{16,200}$/.test(uuid)) {
      throw new Error('链接中没有有效的 uuid 参数。');
    }
    canonicalUrl = `https://${TRACKER_HOST}/?uuid=${encodeURIComponent(uuid)}`;
  }

  return {
    uuid,
    canonicalUrl,
    endpoint: `${TRACKER_API_ORIGIN}/tracker/${encodeURIComponent(uuid)}`
  };
}

function asFiniteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeText(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function normalizeStatus(rawStatus) {
  const numeric = asFiniteNumber(rawStatus);
  const raw = numeric === null ? String(rawStatus ?? '未提供') : numeric;
  const label = numeric !== null && STATUS_LABELS[numeric]
    ? STATUS_LABELS[numeric]
    : `未识别状态（代码 ${normalizeText(String(rawStatus ?? ''), '未提供')}）`;

  let tone = 'neutral';
  if ([3, 23].includes(numeric)) tone = 'blue';
  if ([4].includes(numeric)) tone = 'green';
  if ([8, 28].includes(numeric)) tone = 'amber';
  if ([11].includes(numeric)) tone = 'violet';

  return { raw, label, tone };
}

function normalizeEvent(event) {
  return {
    id: normalizeText(String(event?.Id ?? ''), 'unknown'),
    type: normalizeText(event?.Event, 'UNKNOWN'),
    revision: asFiniteNumber(event?.Revision, 0),
    date: asFiniteNumber(event?.Date)
  };
}

function countReviewEvents(events, latestRevision) {
  const counts = { invited: 0, accepted: 0, completed: 0 };
  for (const event of events) {
    if (event.revision !== latestRevision) continue;
    if (event.type === 'REVIEWER_INVITED') counts.invited += 1;
    if (event.type === 'REVIEWER_ACCEPTED') counts.accepted += 1;
    if (event.type === 'REVIEWER_COMPLETED') counts.completed += 1;
  }
  return counts;
}

function normalizeTrackerPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Elsevier 返回了无法识别的数据。');
  }

  const latestRevision = asFiniteNumber(payload.LatestRevisionNumber, 0);
  const events = Array.isArray(payload.ReviewEvents)
    ? payload.ReviewEvents.map(normalizeEvent).slice(-1000)
    : [];
  const status = normalizeStatus(payload.Status);
  const counts = countReviewEvents(events, latestRevision);

  return {
    title: normalizeText(payload.ManuscriptTitle, '未命名稿件'),
    journal: normalizeText(payload.JournalName, '未知期刊'),
    status,
    latestRevision,
    submissionDate: asFiniteNumber(payload.SubmissionDate),
    sourceUpdatedAt: asFiniteNumber(payload.LastUpdated),
    counts,
    events
  };
}

function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    status: snapshot.status.raw,
    latestRevision: snapshot.latestRevision,
    counts: snapshot.counts,
    doi: snapshot.doi || null,
    productionEvents: (snapshot.productionEvents || []).map((event) => [event.id, event.dateText])
  });
}

function describeChanges(previous, current) {
  if (!previous) return ['首次记录'];
  if (current.kind === 'production') {
    const previousEvents = new Set((previous.productionEvents || []).map((event) => `${event.id}:${event.dateText}`));
    const newEvents = (current.productionEvents || [])
      .filter((event) => !previousEvents.has(`${event.id}:${event.dateText}`))
      .map((event) => event.label);
    if (newEvents.length) return newEvents;
  }
  const changes = [];
  if (String(previous.status?.raw) !== String(current.status?.raw)) {
    changes.push(`状态：${previous.status?.label || '未知'} → ${current.status.label}`);
  }
  if (previous.latestRevision !== current.latestRevision) {
    changes.push(`修订版本：${previous.latestRevision} → ${current.latestRevision}`);
  }
  for (const key of ['invited', 'accepted', 'completed']) {
    const before = previous.counts?.[key] || 0;
    const after = current.counts?.[key] || 0;
    if (before !== after) {
      const labels = { invited: '邀请审稿人', accepted: '接受审稿', completed: '完成审稿' };
      changes.push(`${labels[key]}：${before} → ${after}`);
    }
  }
  return changes;
}

function maskTrackingUrl(canonicalUrl) {
  const { uuid } = parseTrackingInput(canonicalUrl);
  const tail = uuid.slice(-4);
  return `https://${TRACKER_HOST}/?uuid=••••${tail}`;
}

function getStageStartedAt(history, currentStatus, fallback) {
  const ordered = Array.isArray(history) ? [...history].sort((a, b) => {
    return new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime();
  }) : [];
  let start = fallback;
  for (const item of ordered) {
    if (String(item.status?.raw) === String(currentStatus?.raw)) {
      if (!start) start = item.checkedAt;
    } else {
      start = null;
    }
  }
  return start || fallback;
}

module.exports = {
  TRACKER_HOST,
  ELSEVIER_SHARE_HOST,
  TRACKER_API_ORIGIN,
  parseTrackingInput,
  normalizeTrackerPayload,
  snapshotFingerprint,
  describeChanges,
  maskTrackingUrl,
  getStageStartedAt
};

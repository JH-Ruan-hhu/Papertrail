'use strict';

const PRODUCTION_HOST = 'authors.elsevier.com';
const PRODUCTION_PATH = '/tracking/article/details.do';

const PRODUCTION_EVENT_LABELS = Object.freeze({
  received: '已进入出版流程',
  copyrightTransferSent: '版权与许可表待完成',
  copyrightTransferReceived: '版权与许可表已完成',
  offprintOrderSent: '印刷本选项待确认',
  acceptedManuscriptOnline: '录用稿已上线',
  proofsAvailable: '校样已到，请及时检查',
  proofsReturned: '校样修改已返回',
  finalArticleOnline: '正式版本已上线',
  shareLinkSent: '免费分享链接已发送'
});

function normalizeProductionInput(input) {
  const reference = String(input?.reference || '').trim().toUpperCase();
  const lastName = String(input?.lastName || '').trim();
  const firstName = String(input?.firstName || '').trim();
  if (!reference) throw new Error('请输入 Production has begun 邮件中的稿件编号。');
  if (!lastName) throw new Error('请输入通讯作者的姓（Last Name）。');
  if (reference.length > 40 || lastName.length > 80 || firstName.length > 80) {
    throw new Error('作者信息过长，请检查后重试。');
  }
  if (/-(?:D|R)-\d{2}-/i.test(reference)) {
    throw new Error('这看起来是 Editorial Manager 审稿编号；作者信息查询仅适用于已接收并进入出版流程的文章。');
  }

  const separated = reference.match(/^([A-Z][A-Z0-9]{1,15})[ _-]+(E?\d{2,12})$/);
  const compact = reference.match(/^([A-Z][A-Z0-9]{1,15}?)(E?\d{3,12})$/);
  const match = separated || compact;
  if (!match) {
    throw new Error('稿件编号格式不正确。请填写 Production has begun 邮件中的 Our reference，例如 SEPS_102545。');
  }

  return {
    reference,
    journalId: match[1],
    articleId: match[2].toLowerCase(),
    lastName,
    firstName
  };
}

function buildProductionTrackingUrl(input) {
  const normalized = normalizeProductionInput(input);
  const url = new URL(`https://${PRODUCTION_HOST}${PRODUCTION_PATH}`);
  url.searchParams.set('aid', normalized.articleId);
  url.searchParams.set('jid', normalized.journalId);
  url.searchParams.set('surname', normalized.lastName);
  return { ...normalized, url: url.toString() };
}

function validateProductionTrackingUrl(input) {
  let parsed;
  try {
    parsed = new URL(String(input || ''));
  } catch {
    throw new Error('出版追踪链接格式不正确。');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname.toLowerCase() !== PRODUCTION_HOST ||
    parsed.pathname !== PRODUCTION_PATH ||
    parsed.port || parsed.username || parsed.password ||
    !parsed.searchParams.get('aid') ||
    !parsed.searchParams.get('jid') ||
    !parsed.searchParams.get('surname')
  ) {
    throw new Error('出版追踪链接不受支持。');
  }
  return parsed.toString();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTextById(html, id) {
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b[^>]*\\bid=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  );
  const match = String(html || '').match(pattern);
  return match ? decodeHtml(match[2]) : '';
}

function parseElsevierDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const timestamp = Date.parse(`${text} 00:00:00 UTC`);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function extractProductionEvents(html) {
  const events = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(String(html || '')))) {
    const cells = new Map();
    const cellPattern = /<td\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      cells.set(cellMatch[1], decodeHtml(cellMatch[2]));
    }
    for (const [id, label] of cells) {
      if (!id.endsWith('Event') || !label) continue;
      const eventId = id.slice(0, -'Event'.length);
      const dateText = cells.get(`${eventId}EventDate`) || '';
      events.push({
        id: eventId,
        label: PRODUCTION_EVENT_LABELS[eventId] || label,
        sourceLabel: label,
        dateText,
        date: parseElsevierDate(dateText)
      });
    }
  }
  return events;
}

function extractProductionSnapshot(html) {
  const title = extractTextById(html, 'articleTitle');
  if (!title) {
    throw new Error('未找到匹配的已接收文章。请核对生产稿件编号和通讯作者姓氏；审稿中的稿件不能使用此方式。');
  }

  const events = extractProductionEvents(html);
  const statusComment = [
    'finalVersionOnlineStatus',
    'acceptedManuscriptOnlineStatus',
    'proofsAvailableStatus',
    'receivedStatus'
  ].map((id) => extractTextById(html, id)).find(Boolean) || '';
  const articleReference = extractTextById(html, 'articleReference');
  if (!articleReference || (!events.length && !statusComment)) {
    throw new Error('Elsevier 出版追踪页面结构可能已变化：未读取到生产编号或进展事件，本次结果未保存。');
  }
  const latestEvent = events[0];
  const latestLabel = latestEvent?.label || statusComment || '已进入出版流程';
  const latestRaw = latestEvent
    ? `production:${latestEvent.id}:${latestEvent.dateText}`
    : `production:${latestLabel}`;

  return {
    kind: 'production',
    title,
    journal: extractTextById(html, 'journalTitle') || 'Elsevier 期刊',
    status: { raw: latestRaw, label: latestLabel, tone: 'neutral' },
    latestRevision: 0,
    submissionDate: parseElsevierDate(extractTextById(html, 'editorialReceivedDate')),
    sourceUpdatedAt: parseElsevierDate(extractTextById(html, 'lastUpdatedDate')),
    counts: { invited: 0, accepted: 0, completed: 0 },
    articleReference,
    correspondingAuthor: extractTextById(html, 'correspondingAuthorName'),
    firstAuthor: extractTextById(html, 'firstAuthorNameId'),
    acceptedDate: extractTextById(html, 'acceptedDate'),
    doi: extractTextById(html, 'doi'),
    statusComment,
    productionEvents: events
  };
}

module.exports = {
  PRODUCTION_HOST,
  PRODUCTION_PATH,
  PRODUCTION_EVENT_LABELS,
  normalizeProductionInput,
  buildProductionTrackingUrl,
  validateProductionTrackingUrl,
  decodeHtml,
  extractTextById,
  extractProductionEvents,
  extractProductionSnapshot
};

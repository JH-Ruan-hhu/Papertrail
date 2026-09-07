'use strict';

const DAILY_REPEAT_PREFIX = /^\s*[~～]\s*/;

function normalizeCaptureInput(input) {
  const raw = String(input?.content || '').replace(/\u00a0/g, ' ');
  const prefix = raw.match(DAILY_REPEAT_PREFIX)?.[0] || '';
  return {
    content: raw.slice(prefix.length).trim(),
    repeat: input?.repeat === 'daily' || prefix ? 'daily' : null,
    prefixLength: prefix.length
  };
}

module.exports = { normalizeCaptureInput };

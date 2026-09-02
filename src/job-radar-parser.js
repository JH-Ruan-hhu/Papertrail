'use strict';

const { normalizeRecommendation } = require('./job-radar-core');

function parseJobPayload(payload, context = {}) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.jobs) ? payload.jobs : [payload];
  return items.filter((item) => item && typeof item === 'object').map((item) => normalizeRecommendation({
    ...item,
    source: item.source || context.source,
    sourceUrl: item.sourceUrl || context.url
  }, context.now));
}

module.exports = { parseJobPayload };

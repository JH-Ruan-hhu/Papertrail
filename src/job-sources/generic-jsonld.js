'use strict';

const { normalizeRecommendation } = require('../job-radar-core');

function blocks(html) {
  const results = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    try {
      const parsed = JSON.parse(match[1]);
      results.push(...(Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed]));
    } catch { /* ignore invalid remote metadata */ }
  }
  return results;
}

function jobFromJsonLd(item, context) {
  if (!/JobPosting/i.test(String(item?.['@type'] || ''))) return null;
  const location = Array.isArray(item.jobLocation) ? item.jobLocation[0] : item.jobLocation;
  const address = location?.address || {};
  return normalizeRecommendation({
    externalId: item.identifier?.value || item.identifier,
    company: item.hiringOrganization?.name,
    role: item.title,
    city: address.addressLocality || address.addressRegion,
    description: String(item.description || '').replace(/<[^>]+>/g, ' '),
    deadline: item.validThrough,
    education: item.educationRequirements,
    sourceUrl: item.url || context.url,
    source: context.source,
    updatedAt: item.dateModified || item.datePosted || context.now
  }, context.now);
}

function parse(html, context = {}) {
  return blocks(html).map((item) => jobFromJsonLd(item, context)).filter(Boolean);
}

module.exports = { id: 'generic-jsonld', parse, blocks };

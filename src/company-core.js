'use strict';
const crypto = require('node:crypto');
const normalizedName = name => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const companyId = name => 'company-' + crypto.createHash('sha256').update(normalizedName(name)).digest('hex').slice(0, 24);

// Additive, independently versioned migration: retain all old job fields and IDs.
function migrateCompanies(source, now = new Date().toISOString()) {
  if (Number(source.companySchemaVersion || 0) > 1) throw new Error('公司数据来自更高版本。');
  if (source.companies != null && !Array.isArray(source.companies)) throw new Error('公司列表格式无效。');
  const companies = (source.companies || []).map(c => ({ ...c }));
  const byName = new Map(companies.map(c => [normalizedName(c.name), c]));
  const jobs = (source.jobApplications || []).map(job => {
    const name = String(job.company || '未命名单位').trim();
    let company = byName.get(normalizedName(name));
    if (!company) {
      company = { id: companyId(name), name, normalizedName: normalizedName(name), logoStatus: 'idle', createdAt: now, updatedAt: now };
      companies.push(company); byName.set(company.normalizedName, company);
    }
    return { ...job, companyId: company.id };
  });
  const data = { ...source, companySchemaVersion: 1, companies, jobApplications: jobs };
  return { data, changed: JSON.stringify(data) !== JSON.stringify(source) };
}
module.exports = { normalizedName, companyId, migrateCompanies };

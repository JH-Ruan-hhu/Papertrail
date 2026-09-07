'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function backupBeforeUpgrade(filePath, userData, version) {
  if (version !== '1.5.0' || !fs.existsSync(filePath)) return null;
  const identity = crypto.createHash('sha256').update(path.resolve(filePath)).digest('hex').slice(0, 16);
  const directory = path.join(userData, 'upgrade-backups', 'before-1.5.0-' + identity);
  const marker = path.join(directory, 'complete.json');
  if (fs.existsSync(marker)) return directory;
  const raw = fs.readFileSync(filePath);
  JSON.parse(raw.toString('utf8'));
  fs.mkdirSync(directory, {recursive:true});
  fs.writeFileSync(path.join(directory, 'papertrail-data.json'), raw);
  const attachments = path.join(path.dirname(filePath), 'attachments');
  if (fs.existsSync(attachments)) fs.cpSync(attachments, path.join(directory, 'attachments'), {recursive:true});
  const pointer = path.join(userData, 'papertrail-storage.json');
  if (fs.existsSync(pointer)) fs.copyFileSync(pointer, path.join(directory, 'papertrail-storage.json'));
  fs.writeFileSync(marker, JSON.stringify({source:filePath, version, createdAt:new Date().toISOString(), sha256:crypto.createHash('sha256').update(raw).digest('hex')}));
  return directory;
}
module.exports = {backupBeforeUpgrade};

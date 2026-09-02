'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EMPTY_CACHE = Object.freeze({ version: 1, recommendations: [], snapshots: {}, sourceResults: {}, refreshState: { status: 'idle', stale: false } });

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class JobRadarCacheStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = clone(EMPTY_CACHE);
    this.recoveredFromCorruption = false;
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) return this.data;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!parsed || !Array.isArray(parsed.recommendations)) throw new Error('缓存结构无效');
      this.data = { ...clone(EMPTY_CACHE), ...parsed };
    } catch {
      this.data = clone(EMPTY_CACHE);
      this.recoveredFromCorruption = true;
    }
    return this.data;
  }

  save(next = this.data) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(temporary, this.filePath);
    this.data = next;
    return next;
  }
}

module.exports = { JobRadarCacheStore, EMPTY_CACHE };

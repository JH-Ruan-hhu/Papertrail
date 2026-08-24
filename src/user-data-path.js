'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE_NAME = 'papertrail-data.json';
const STORAGE_POINTER_NAME = 'papertrail-storage.json';

function containsStorageEvidence(directory, existsSync = fs.existsSync) {
  return [DATA_FILE_NAME, STORAGE_POINTER_NAME]
    .some((name) => existsSync(path.join(directory, name)));
}

function resolveStableUserDataPath(appDataPath, options = {}) {
  const legacy = path.join(appDataPath, options.legacyName || 'papertrail-desktop');
  const renamed = path.join(appDataPath, options.renamedName || '研迹');
  const existsSync = options.existsSync || fs.existsSync;

  // v1.2.2 set the display name before Electron resolved userData, which
  // redirected existing installations from the legacy directory to `研迹`.
  // Prefer any legacy data or storage pointer, but retain data created by a
  // genuinely new v1.2.2 installation when no legacy evidence exists.
  if (containsStorageEvidence(legacy, existsSync)) return legacy;
  if (containsStorageEvidence(renamed, existsSync)) return renamed;
  return legacy;
}

module.exports = { containsStorageEvidence, resolveStableUserDataPath };

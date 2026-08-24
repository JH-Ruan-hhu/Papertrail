'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveStableUserDataPath } = require('../src/user-data-path');

function resolver(existing) {
  return (candidate) => existing.has(path.normalize(candidate));
}

test('prefers the legacy Electron userData directory when its storage pointer exists', () => {
  const root = path.resolve('C:/Users/test/AppData/Roaming');
  const existing = new Set([
    path.join(root, 'papertrail-desktop', 'papertrail-storage.json'),
    path.join(root, '研迹', 'papertrail-data.json')
  ].map(path.normalize));
  assert.equal(resolveStableUserDataPath(root, { existsSync: resolver(existing) }), path.join(root, 'papertrail-desktop'));
});

test('keeps data created by a new v1.2.2 installation when no legacy evidence exists', () => {
  const root = path.resolve('C:/Users/test/AppData/Roaming');
  const existing = new Set([path.normalize(path.join(root, '研迹', 'papertrail-data.json'))]);
  assert.equal(resolveStableUserDataPath(root, { existsSync: resolver(existing) }), path.join(root, '研迹'));
});

test('uses the stable legacy directory for a fresh installation', () => {
  const root = path.resolve('C:/Users/test/AppData/Roaming');
  assert.equal(resolveStableUserDataPath(root, { existsSync: () => false }), path.join(root, 'papertrail-desktop'));
});

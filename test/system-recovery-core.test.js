'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { clearSystemRecovery, readSystemRecovery, writeSystemRecovery } = require('../src/system-recovery-core');

test('persists an independent toast policy recovery record atomically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-system-recovery-'));
  const file = path.join(root, 'state', 'system-recovery.json');
  writeSystemRecovery(file, {
    changed: true,
    previousExisted: false,
    previousValue: null,
    sessionId: 'focus-1',
    recordedAt: '2026-08-26T10:00:00.000Z'
  });
  const loaded = readSystemRecovery(file);
  assert.equal(loaded.state, 'valid');
  assert.deepEqual(loaded.value.toastPolicy, {
    changed: true,
    previousExisted: false,
    previousValue: null,
    expectedValue: 1,
    sessionId: 'focus-1',
    recordedAt: '2026-08-26T10:00:00.000Z'
  });
  assert.equal(clearSystemRecovery(file), true);
  assert.equal(readSystemRecovery(file).state, 'missing');
});

test('reports corrupt recovery state instead of silently treating it as missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-system-recovery-corrupt-'));
  const file = path.join(root, 'system-recovery.json');
  fs.writeFileSync(file, '{bad', 'utf8');
  assert.equal(readSystemRecovery(file).state, 'corrupt');
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readStoragePointer, resolveStorageState } = require('../src/storage-core');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-storage-state-'));
  const defaultDirectory = path.join(root, 'default');
  fs.mkdirSync(defaultDirectory);
  return {
    root,
    pointerPath: path.join(defaultDirectory, 'papertrail-storage.json'),
    defaultFilePath: path.join(defaultDirectory, 'papertrail-data.json')
  };
}

function resolve(current) {
  return resolveStorageState({ ...current, dataFileName: 'papertrail-data.json' });
}

test('distinguishes a missing storage pointer from a corrupt pointer', () => {
  const current = fixture();
  assert.equal(readStoragePointer(current.pointerPath).state, 'missing');
  assert.equal(resolve(current).state, 'default');
  fs.writeFileSync(current.pointerPath, '{broken', 'utf8');
  assert.equal(readStoragePointer(current.pointerPath).state, 'corrupt');
  assert.equal(resolve(current).state, 'pointer-corrupt');
  assert.equal(fs.existsSync(current.defaultFilePath), false);
});

test('does not fall back when a configured custom directory is unavailable', () => {
  const current = fixture();
  const custom = path.join(current.root, 'detached-drive');
  fs.writeFileSync(current.pointerPath, JSON.stringify({ dataDirectory: custom }), 'utf8');
  const result = resolve(current);
  assert.equal(result.state, 'custom-unavailable');
  assert.equal(result.configuredDirectory, custom);
  assert.equal(fs.existsSync(current.defaultFilePath), false);
});

test('distinguishes a missing custom data file from an unavailable directory', () => {
  const current = fixture();
  const custom = path.join(current.root, 'custom');
  fs.mkdirSync(custom);
  fs.writeFileSync(current.pointerPath, JSON.stringify({ dataDirectory: custom }), 'utf8');
  assert.equal(resolve(current).state, 'custom-missing-data');
  assert.equal(fs.existsSync(current.defaultFilePath), false);
});

test('accepts valid custom data and treats an explicit default pointer as default', () => {
  const current = fixture();
  const custom = path.join(current.root, 'custom');
  fs.mkdirSync(custom);
  fs.writeFileSync(path.join(custom, 'papertrail-data.json'), '{}', 'utf8');
  fs.writeFileSync(current.pointerPath, JSON.stringify({ dataDirectory: custom }), 'utf8');
  assert.equal(resolve(current).state, 'custom-valid');
  fs.writeFileSync(current.pointerPath, JSON.stringify({ dataDirectory: path.dirname(current.defaultFilePath) }), 'utf8');
  assert.equal(resolve(current).state, 'default');
});

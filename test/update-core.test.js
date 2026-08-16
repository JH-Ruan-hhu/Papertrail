'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanVersion,
  createInitialUpdateState,
  friendlyUpdateError,
  nextUpdateState
} = require('../src/update-core');

test('normalizes release versions and disables unsupported builds', () => {
  assert.equal(cleanVersion('v0.5.2'), '0.5.2');
  assert.equal(cleanVersion('not-a-version'), null);
  assert.equal(createInitialUpdateState({ currentVersion: '0.5.2', packaged: false, portable: false }).status, 'unavailable');
  const portable = createInitialUpdateState({ currentVersion: '0.5.2', packaged: true, portable: true });
  assert.equal(portable.status, 'unavailable');
  assert.equal(portable.portable, true);
});

test('models check, download progress and install-ready states', () => {
  let state = createInitialUpdateState({ currentVersion: '0.5.2', packaged: true, portable: false });
  state = nextUpdateState(state, 'checking');
  assert.equal(state.status, 'checking');
  state = nextUpdateState(state, 'available', { version: '0.5.3', releaseDate: '2026-08-17T00:00:00.000Z' });
  assert.equal(state.status, 'available');
  assert.equal(state.latestVersion, '0.5.3');
  state = nextUpdateState(state, 'download-start');
  state = nextUpdateState(state, 'download-progress', { percent: 112, transferred: 10, total: 10 });
  assert.equal(state.percent, 100);
  state = nextUpdateState(state, 'downloaded', { version: '0.5.3' });
  assert.equal(state.status, 'downloaded');
  assert.match(state.message, /重启并安装/);
});

test('turns updater failures into short credential-safe messages', () => {
  assert.equal(
    friendlyUpdateError(new Error('HTTP 404 https://github.com/example/latest.yml?token=secret')),
    '更新服务器暂未发布可下载版本。'
  );
  const networkMessage = friendlyUpdateError(new Error('net::ERR_CONNECTION_TIMED_OUT at https://example.invalid/update'));
  assert.equal(networkMessage, '无法连接更新服务器，请检查网络后重试。');
  assert.doesNotMatch(networkMessage, /https?:\/\//);
});

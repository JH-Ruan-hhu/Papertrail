'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCaptureInput } = require('../src/capture-core');

test('leading tilde marks quick capture as daily repeat and is removed from content', () => {
  assert.deepEqual(normalizeCaptureInput({ content: '~ 明天上午九点复盘' }), {
    content: '明天上午九点复盘',
    repeat: 'daily',
    prefixLength: 2
  });
  assert.deepEqual(normalizeCaptureInput({ content: '  ～每天八点服药' }), {
    content: '每天八点服药',
    repeat: 'daily',
    prefixLength: 3
  });
});

test('quick capture keeps ordinary content non-repeating and accepts validated repeat state', () => {
  assert.deepEqual(normalizeCaptureInput({ content: ' 明天交报告 ' }), {
    content: '明天交报告',
    repeat: null,
    prefixLength: 0
  });
  assert.equal(normalizeCaptureInput({ content: '每天九点复盘', repeat: 'daily' }).repeat, 'daily');
});

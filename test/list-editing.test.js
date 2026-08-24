'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyListEditing, continuationForLine, markerForLevel, nextMarker, parseListPrefix } = require('../src/renderer/list-editing');

function textarea(value, start = value.length, end = start) {
  return {
    value,
    selectionStart: start,
    selectionEnd: end,
    setSelectionRange(nextStart, nextEnd) { this.selectionStart = nextStart; this.selectionEnd = nextEnd; },
    dispatchEvent() {}
  };
}

test('list editing recognizes common markers and cycles numeric/letter levels', () => {
  assert.equal(parseListPrefix('1. 第一项').number, 1);
  assert.equal(parseListPrefix('a) 第二项').letter, 97);
  assert.equal(parseListPrefix('- 第三项').bullet, true);
  assert.equal(nextMarker(parseListPrefix('1. 第一项')), '2.');
  assert.equal(nextMarker(parseListPrefix('a) 第二项')), 'b)');
  assert.equal(markerForLevel(1, parseListPrefix('1. 第一项'), 1), 'a)');
  assert.equal(markerForLevel(2, parseListPrefix('1. 第一项'), 1), 'A)');
});

test('Enter continues and exits lists while Tab transforms selected lines', () => {
  const continued = textarea('1. 第一项');
  assert.equal(applyListEditing(continued, { key: 'Enter' }), true);
  assert.equal(continued.value, '1. 第一项\n2. ');

  const exited = textarea('1. ');
  assert.equal(applyListEditing(exited, { key: 'Enter' }), true);
  assert.equal(exited.value, '');

  const selected = textarea('1. 第一项\n2. 第二项', 0, 17);
  assert.equal(applyListEditing(selected, { key: 'Tab' }), true);
  assert.match(selected.value, /^  a\) 第一项\n  b\) 第二项$/);
  assert.equal(applyListEditing(selected, { key: 'Tab', shiftKey: true }), true);
  assert.match(selected.value, /^1\. 第一项\n2\. 第二项$/);
  const composing = textarea('1. 中文');
  assert.equal(applyListEditing(composing, { key: 'Enter', isComposing: true }), false);
});

test('contenteditable notes derive Word-like list continuation text', () => {
  assert.deepEqual(continuationForLine('1. 第一项'), { insertion: '\n2. ', exitList: false });
  assert.deepEqual(continuationForLine('3、 第三项'), { insertion: '\n4、 ', exitList: false });
  assert.deepEqual(continuationForLine('- 项目'), { insertion: '\n- ', exitList: false });
  assert.deepEqual(continuationForLine('普通正文'), null);
});

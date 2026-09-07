'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../src/renderer/schedule-layout');
test('schedule minimum fills the available track and zoom preserves the bottom gap', () => {
  for (const height of [450, 768, 1080, 1440, 2000]) {
    assert.ok(layout.hourHeight(0, height, 98) * 16 + 98 >= height);
  }
  assert.equal(layout.bottomScroll(1600, 600, 80), 920);
  assert.equal(layout.bottomScroll(500, 600, 0), 0);
});
test('drag uses card top for every grab offset and clamps to half-hour boundaries', () => {
  for (const offset of [0, 20, 50]) assert.equal(layout.snapMinutes(220 + offset, 100, 960, offset), 600);
  assert.equal(layout.snapMinutes(-100, 100, 960, 0), 480);
  assert.equal(layout.snapMinutes(2000, 100, 960, 0), 1410);
});

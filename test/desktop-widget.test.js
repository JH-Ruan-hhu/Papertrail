'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopWidgetPresentation } = require('../src/desktop-widget-core');

test('desktop widget exposes attached and floating fallback states', () => {
  assert.deepEqual(desktopWidgetPresentation({ attached: true, attempts: 1 }), {
    attached: true,
    mode: 'attached',
    diagnostic: null
  });
  const fallback = desktopWidgetPresentation({ attached: false, attempts: 3, supported: true });
  assert.equal(fallback.mode, 'floating');
  assert.equal(fallback.diagnostic.code, 'DESKTOP_ATTACH_FAILED');
  assert.equal(fallback.diagnostic.attempts, 3);
  assert.equal(desktopWidgetPresentation({ supported: false }).diagnostic.code, 'DESKTOP_ATTACH_UNSUPPORTED');
});

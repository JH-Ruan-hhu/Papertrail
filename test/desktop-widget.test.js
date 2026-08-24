'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopWidgetPresentation } = require('../src/desktop-widget-core');

test('desktop widget exposes reserved desktop and unavailable states without a floating fallback', () => {
  assert.deepEqual(desktopWidgetPresentation({ attached: true, reserved: true, movedIcons: 2, attempts: 1 }), {
    attached: true,
    reserved: true,
    movedIcons: 2,
    mode: 'desktop',
    diagnostic: null
  });
  const fallback = desktopWidgetPresentation({ attached: false, attempts: 3, supported: true });
  assert.equal(fallback.mode, 'unavailable');
  assert.equal(fallback.diagnostic.code, 'DESKTOP_ATTACH_FAILED');
  assert.equal(fallback.diagnostic.attempts, 3);
  assert.equal(desktopWidgetPresentation({ supported: false }).diagnostic.code, 'DESKTOP_ATTACH_UNSUPPORTED');
  assert.equal(desktopWidgetPresentation({ attached: true, reserved: false }).diagnostic.code, 'DESKTOP_ICON_RESERVATION_FAILED');
});

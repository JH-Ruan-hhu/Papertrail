'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { normalizeSettings } = require('../src/migration-core');
test('retired appearance is ignored without losing other settings', () => {
  const settings = normalizeSettings({ appearanceTheme: 'liquid-glass', refreshMinutes: 720 });
  assert.equal(settings.appearanceTheme, undefined);
  assert.equal(settings.refreshMinutes, 720);
  for (const file of ['theme-bootstrap.js', 'theme-runtime.js', 'themes/liquid-glass.css']) assert.equal(fs.existsSync(`src/renderer/${file}`), false);
  const html = fs.readFileSync('src/renderer/index.html', 'utf8');
  assert.doesNotMatch(html, /appearanceTheme|theme-runtime|data-appearance/);
});

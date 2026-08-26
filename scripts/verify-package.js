'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

function findPackagedExe(unpackedDirectory) {
  const preferred = path.join(unpackedDirectory, '研迹.exe');
  if (fs.existsSync(preferred)) return preferred;
  return fs.readdirSync(unpackedDirectory)
    .filter((name) => name.toLowerCase().endsWith('.exe') && !/uninstall/i.test(name))
    .map((name) => path.join(unpackedDirectory, name))[0];
}

function main() {
  const outputRoot = path.resolve(process.argv[2] || 'outputs');
  const unpackedDirectory = path.join(outputRoot, 'win-unpacked');
  const resourcesDirectory = path.join(unpackedDirectory, 'resources');
  const asarPath = path.join(resourcesDirectory, 'app.asar');
  const exePath = findPackagedExe(unpackedDirectory);
  assert.ok(exePath && fs.statSync(exePath).isFile(), 'packaged exe 缺失。');
  assert.ok(fs.statSync(asarPath).isFile(), 'resources/app.asar 缺失。');

  const entries = new Set(asar.listPackage(asarPath).map((entry) => entry.replaceAll('\\', '/')));
  const requiredAsarEntries = [
    '/package.json',
    '/src/main.js',
    '/src/preload.js',
    '/src/renderer/index.html',
    '/src/renderer/app.js',
    '/node_modules/electron-updater/package.json',
    '/node_modules/fs-extra/package.json'
  ];
  for (const entry of requiredAsarEntries) assert.ok(entries.has(entry), `app.asar 缺少 ${entry}`);

  const packagedManifest = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
  assert.equal(packagedManifest.dependencies['electron-updater'], '6.8.9');
  assert.equal(packagedManifest.dependencies['fs-extra'], '10.1.0');
  const unpackedRoot = path.join(resourcesDirectory, 'app.asar.unpacked');
  for (const relative of ['build/icon.ico', 'build/icon.png']) {
    assert.ok(fs.statSync(path.join(unpackedRoot, relative)).isFile(), `unpacked 资源缺少 ${relative}`);
  }
  console.log(`YANJI_PACKAGE_VERIFY_OK ${JSON.stringify({
    exePath,
    asarPath,
    version: packagedManifest.version,
    dependencies: packagedManifest.dependencies,
    checkedEntries: requiredAsarEntries
  })}`);
}

try {
  main();
} catch (error) {
  console.error(`YANJI_PACKAGE_VERIFY_FAILED ${error.stack || error}`);
  process.exitCode = 1;
}

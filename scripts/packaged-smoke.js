'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function findPackagedExe(outputRoot) {
  const unpacked = path.resolve(outputRoot, 'win-unpacked');
  const preferred = path.join(unpacked, '研迹.exe');
  if (fs.existsSync(preferred)) return preferred;
  const candidate = fs.readdirSync(unpacked)
    .filter((name) => name.toLowerCase().endsWith('.exe') && !/uninstall/i.test(name))
    .map((name) => path.join(unpacked, name))[0];
  if (!candidate) throw new Error(`未在 ${unpacked} 找到 packaged exe。`);
  return candidate;
}

function launchSmoke(exePath, { disableUpdater = false } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `yanji-packaged-smoke-${disableUpdater ? 'fallback-' : ''}`));
  const resultFile = path.join(userData, 'smoke-result.json');
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, ['--smoke-test'], {
      env: {
        ...process.env,
        YANJI_QA_USER_DATA: userData,
        YANJI_SMOKE_RESULT: resultFile,
        ...(disableUpdater ? { YANJI_DISABLE_UPDATER: '1' } : {})
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`packaged smoke 超时。\n${stdout}\n${stderr}`));
    }, 30_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        assert.equal(code, 0, `packaged exe 退出码为 ${code}。\n${stdout}\n${stderr}`);
        assert.equal(fs.existsSync(resultFile), true, `未生成 smoke 标记。\n${stdout}\n${stderr}`);
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        assert.equal(result.marker, 'YANJI_SMOKE_OK');
        assert.equal(result.packaged, true);
        assert.equal(result.dataFileExists, true);
        assert.equal(result.preloadExists, true);
        assert.equal(result.browserWindowCreated, true);
        if (disableUpdater) assert.equal(result.updaterAvailable, false);
        resolve({ ...result, updaterFallback: disableUpdater });
      } catch (error) {
        reject(error);
      } finally {
        fs.rmSync(userData, { recursive: true, force: true });
      }
    });
  });
}

function launchStorageRecoverySmoke(exePath, scenario) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `yanji-storage-recovery-${scenario}-`));
  const pointerFile = path.join(userData, 'papertrail-storage.json');
  const resultFile = path.join(userData, 'storage-recovery-result.json');
  let expectedState;
  if (scenario === 'pointer-corrupt') {
    fs.writeFileSync(pointerFile, '{broken', 'utf8');
    expectedState = 'pointer-corrupt';
  } else if (scenario === 'custom-unavailable') {
    fs.writeFileSync(pointerFile, JSON.stringify({ dataDirectory: path.join(userData, 'detached-drive') }), 'utf8');
    expectedState = 'custom-unavailable';
  } else {
    const emptyCustom = path.join(userData, 'empty-custom');
    fs.mkdirSync(emptyCustom);
    fs.writeFileSync(pointerFile, JSON.stringify({ dataDirectory: emptyCustom }), 'utf8');
    expectedState = 'custom-missing-data';
  }
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, ['--smoke-test'], {
      env: { ...process.env, YANJI_QA_USER_DATA: userData, YANJI_STORAGE_RECOVERY_SMOKE_RESULT: resultFile },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`storage recovery smoke 超时：${scenario}\n${output}`));
    }, 30_000);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        assert.equal(code, 0, output);
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
        assert.equal(result.marker, 'YANJI_STORAGE_RECOVERY_REQUIRED');
        assert.equal(result.state, expectedState);
        assert.equal(result.createdDefaultDatabase, false);
        assert.equal(fs.existsSync(path.join(userData, 'papertrail-data.json')), false);
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        fs.rmSync(userData, { recursive: true, force: true });
      }
    });
  });
}

async function main() {
  const outputRoot = path.resolve(process.argv[2] || 'outputs');
  const exePath = findPackagedExe(outputRoot);
  const normal = await launchSmoke(exePath);
  const updaterFallback = await launchSmoke(exePath, { disableUpdater: true });
  const storageRecovery = {};
  for (const scenario of ['pointer-corrupt', 'custom-unavailable', 'custom-missing-data']) {
    storageRecovery[scenario] = await launchStorageRecoverySmoke(exePath, scenario);
  }
  console.log(`YANJI_PACKAGED_SMOKE_OK ${JSON.stringify({ exePath, normal, updaterFallback, storageRecovery })}`);
}

main().catch((error) => {
  console.error(`YANJI_PACKAGED_SMOKE_FAILED ${error.stack || error}`);
  process.exitCode = 1;
});

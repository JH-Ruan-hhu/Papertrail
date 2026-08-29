'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { appBuilderPath } = require('app-builder-bin');

function yamlSingleQuoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function generateUpdateMetadata(installerInput, releaseDateInput = new Date()) {
  const installerPath = path.resolve(installerInput);
  assert.ok(fs.existsSync(installerPath), `安装包不存在：${installerPath}`);

  const manifest = require(path.resolve('package.json'));
  const expectedName = `Yanji-Setup-${manifest.version}-x64.exe`;
  assert.equal(path.basename(installerPath), expectedName, `安装包名称必须为 ${expectedName}`);

  const blockmapPath = `${installerPath}.blockmap`;
  const result = spawnSync(appBuilderPath, [
    'blockmap',
    '--input', installerPath,
    '--output', blockmapPath
  ], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout || '生成 blockmap 失败。');

  const blockmapInfo = JSON.parse(result.stdout.trim());
  const installerSize = fs.statSync(installerPath).size;
  assert.equal(blockmapInfo.size, installerSize, 'blockmap 记录的安装包大小不一致。');
  assert.match(blockmapInfo.sha512, /^[A-Za-z0-9+/]+={0,2}$/, '安装包 SHA-512 无效。');

  const releaseDate = new Date(releaseDateInput);
  assert.equal(Number.isNaN(releaseDate.getTime()), false, 'releaseDate 无效。');
  const latestPath = path.join(path.dirname(installerPath), 'latest.yml');
  const yaml = [
    `version: ${manifest.version}`,
    'files:',
    `  - url: ${expectedName}`,
    `    sha512: ${blockmapInfo.sha512}`,
    `    size: ${installerSize}`,
    `path: ${expectedName}`,
    `sha512: ${blockmapInfo.sha512}`,
    `releaseDate: ${yamlSingleQuoted(releaseDate.toISOString())}`,
    ''
  ].join('\n');
  fs.writeFileSync(latestPath, yaml, 'utf8');

  return {
    installerPath,
    installerSize,
    blockmapPath,
    blockmapSize: fs.statSync(blockmapPath).size,
    latestPath,
    sha512: blockmapInfo.sha512
  };
}

if (require.main === module) {
  try {
    const installerPath = process.argv[2];
    assert.ok(installerPath, '用法：npm run metadata:update -- <signed-installer.exe>');
    console.log(`YANJI_UPDATE_METADATA_OK ${JSON.stringify(generateUpdateMetadata(installerPath))}`);
  } catch (error) {
    console.error(`YANJI_UPDATE_METADATA_FAILED ${error.stack || error}`);
    process.exitCode = 1;
  }
}

module.exports = { generateUpdateMetadata };

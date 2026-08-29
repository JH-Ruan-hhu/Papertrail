'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { generateUpdateMetadata } = require('../scripts/generate-update-metadata');

const root = path.resolve(__dirname, '..');

test('SignPath policy and workflow keep signed releases scoped and auditable', () => {
  const signingPolicy = fs.readFileSync(path.join(root, 'SIGNING_POLICY.md'), 'utf8');
  const privacyPolicy = fs.readFileSync(path.join(root, 'PRIVACY.md'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'windows-release.yml'), 'utf8');

  assert.match(signingPolicy, /Free code signing provided by \[SignPath\.io\]/);
  assert.match(signingPolicy, /certificate\s+by \[SignPath Foundation\]/);
  assert.match(signingPolicy, /manual approval/i);
  assert.match(signingPolicy, /PRIVACY\.md/);
  assert.match(privacyPolicy, /does not provide analytics,\s+telemetry/i);
  assert.match(workflow, /signpath\/github-action-submit-signing-request@[a-f0-9]{40}/);
  assert.match(workflow, /npm run metadata:update --/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /Portable artifacts are not allowed/);
  assert.doesNotMatch(workflow, /electron-builder.*portable/i);
});

test('update metadata is regenerated from the exact signed installer bytes', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yanji-signed-metadata-'));
  try {
    const version = require('../package.json').version;
    const installerName = `Yanji-Setup-${version}-x64.exe`;
    const installerPath = path.join(fixtureRoot, installerName);
    fs.writeFileSync(installerPath, Buffer.from('signed-installer-fixture\n', 'utf8'));

    const result = generateUpdateMetadata(installerPath, '2026-08-29T00:00:00.000Z');
    const latest = fs.readFileSync(result.latestPath, 'utf8');
    assert.equal(result.installerSize, fs.statSync(installerPath).size);
    assert.equal(fs.existsSync(result.blockmapPath), true);
    assert.match(latest, new RegExp(`version: ${version.replaceAll('.', '\\.')}`));
    assert.match(latest, new RegExp(`url: ${installerName.replaceAll('.', '\\.')}`));
    assert.match(latest, new RegExp(`size: ${result.installerSize}`));
    assert.match(latest, new RegExp(`sha512: ${result.sha512.replaceAll('+', '\\+').replaceAll('/', '\\/')}`));
    assert.match(latest, /releaseDate: '2026-08-29T00:00:00\.000Z'/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

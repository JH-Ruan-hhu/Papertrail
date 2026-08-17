'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('add-dialog cancel controls do not submit the required form', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html'),
    'utf8'
  );
  assert.match(html, /id="closeAddDialogButton"\s+type="button"/);
  assert.match(html, /id="cancelAddButton"\s+type="button"/);
  assert.doesNotMatch(html, /id="(?:closeAddDialogButton|cancelAddButton)"[^>]*type="submit"/);
});

test('top bar does not expose a minimize-to-tray button', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html'),
    'utf8'
  );
  assert.doesNotMatch(html, /id="hideButton"/);
  assert.doesNotMatch(html, /最小化到托盘/);
});

test('uses a sidebar layout with settings at the bottom and two add modes', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'index.html'),
    'utf8'
  );
  assert.match(html, /<aside class="sidebar">/);
  assert.match(html, /class="sidebar-bottom"[\s\S]*id="settingsButton"/);
  assert.match(html, /id="addModeLink"/);
  assert.match(html, /id="addModeAuthor"/);
  assert.match(html, /id="productionReference"/);
  assert.match(html, /id="authorLastName"/);
  assert.match(html, /Windows 重要通知/);
  assert.match(html, /id="changeDataDirectoryButton"/);
  assert.match(html, /id="dataDirectory"/);
  assert.match(html, /id="currentVersion"/);
  assert.match(html, /id="deleteBackupsButton"/);
  assert.match(html, /id="backupSummary"/);
  assert.match(html, /id="refreshOnStartup"/);
  assert.match(html, /class="settings-sidebar"/);
  assert.match(html, /data-settings-section="general"/);
  assert.match(html, /data-settings-section="notifications"/);
  assert.match(html, /data-settings-section="storage"/);
  assert.match(html, /data-settings-section="about"/);
  assert.match(html, /id="archivedNavButton"/);
  assert.match(html, /id="paperSearch"/);
  assert.match(html, /id="markAllReadButton"/);
  assert.match(html, /最近成功同步/);
  assert.match(html, /class="settings-about\b/);
  assert.match(html, /class="window-titlebar"/);
  assert.match(html, /\.\.\/\.\.\/build\/icon\.png/);
  assert.doesNotMatch(html, /例如 Zhao|例如 Bo/);
});

test('production DOI supports full-link hover and copy', () => {
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'app.js'),
    'utf8'
  );
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'styles.css'),
    'utf8'
  );
  assert.match(appJs, /data-action="copy-doi"/);
  assert.match(appJs, /https:\/\/doi\.org\//);
  assert.match(appJs, /<small>DOI<\/small>/);
  assert.doesNotMatch(appJs, /DOI · 悬浮查看，点击复制/);
  assert.match(appJs, /DOI 链接复制成功', 'success', 1000/);
  assert.match(css, /\.doi-copy-button::after/);
  assert.match(css, /top: 54px/);
});

test('settings expose backup deletion, current version and cold-start refresh', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(mainJs, /settings:delete-data-backups/);
  assert.match(mainJs, /path\.resolve\(backupFile\) === path\.resolve\(store\.filePath\)/);
  assert.match(mainJs, /refreshOnStartup/);
  assert.match(preloadJs, /deleteDataBackups/);
});

test('settings expose a main-process GitHub Release update workflow', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(html, /id="updateActionButton"/);
  assert.match(html, /id="updateProgress"[\s\S]*role="progressbar"/);
  assert.match(mainJs, /autoUpdater\.autoDownload = false/);
  assert.match(mainJs, /autoUpdater\.autoInstallOnAppQuit = false/);
  assert.match(mainJs, /updates:check/);
  assert.match(mainJs, /updates:download/);
  assert.match(mainJs, /updates:install/);
  assert.match(preloadJs, /checkForUpdates/);
  assert.match(preloadJs, /onUpdateState/);
  assert.doesNotMatch(preloadJs, /electron-updater/);
});

test('0.5.x exposes unread, archive, retry and credential-safe export actions', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(mainJs, /papers:mark-read/);
  assert.match(mainJs, /papers:mark-all-read/);
  assert.match(mainJs, /papers:archive/);
  assert.match(mainJs, /papers:restore/);
  assert.match(mainJs, /papers:export/);
  assert.match(mainJs, /lastSuccessfulAt/);
  assert.match(mainJs, /nextRetryAt/);
  assert.match(preloadJs, /markPaperRead/);
  assert.match(preloadJs, /archivePaper/);
  assert.match(preloadJs, /exportPaper/);
  assert.match(appJs, /已观察至少/);
  assert.match(appJs, /搜索标题、期刊或生产编号|articleReference/);
  assert.doesNotMatch(appJs, /检查于 \$\{escapeHtml\(relativeTime\(paper\.lastCheckedAt\)\)\}/);
});

test('keeps search in the list heading and empty refresh visibly unavailable', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  assert.match(html, /class="section-heading"[\s\S]*id="paperSearch"/);
  assert.doesNotMatch(html, /class="list-toolbar"/);
  assert.match(html, />暂无稿件</);
  assert.match(html, /id="emptyAddButton"[^>]*>添加稿件</);
  assert.match(appJs, /暂无可刷新的稿件/);
  assert.match(appJs, /hasRefreshablePapers \? '刷新全部' : '暂无可刷新'/);
  assert.match(appJs, /classList\.toggle\('spin', anyRefreshing\)/);
  assert.match(css, /\.button:disabled[^}]*cursor:\s*not-allowed/);
  assert.match(css, /\.toast[^}]*left:\s*0;[^}]*right:\s*0;/);
  assert.doesNotMatch(css, /\.toast[^}]*left:\s*var\(--sidebar-width\)/);
});

test('supports locally linking cross-journal submission journeys', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(html, /id="journeyDialog"/);
  assert.match(html, /仅关联 PaperTrail 本地记录/);
  assert.match(mainJs, /papers:link-journey/);
  assert.match(mainJs, /papers:unlink-journey/);
  assert.match(preloadJs, /linkPaperJourney/);
  assert.match(preloadJs, /unlinkPaperJourney/);
  assert.match(appJs, /跨期刊投稿历程/);
  assert.match(appJs, /投稿历程 \$\{journey\.length\} 次/);
});

test('0.6 exposes local deadlines, revision rounds, manuscript details and detailed review events', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(html, /id="workflowDialog"/);
  assert.match(html, /id="detailManuscriptId"/);
  assert.match(html, /版权\/许可文件截止日期/);
  assert.match(html, /id="revisionNumber"/);
  assert.match(mainJs, /tasks:save/);
  assert.match(mainJs, /revisions:save/);
  assert.match(mainJs, /runDeadlineReminders/);
  assert.match(preloadJs, /updatePaperDetails/);
  assert.match(preloadJs, /completeTask/);
  assert.match(appJs, /出版商时间：/);
  assert.match(appJs, /本地首次观察：/);
  assert.match(appJs, /未识别事件/);
});

test('interaction polish uses explicit motion and supports reduced motion', () => {
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'styles.css'),
    'utf8'
  );
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'app.js'),
    'utf8'
  );
  assert.match(css, /--ease-out:\s*cubic-bezier\(\.23,\s*1,\s*\.32,\s*1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.button:not\(:disabled\):active\s*\{\s*transform:\s*scale\(\.97\)/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /\.paper-card:hover[^}]*transform/);
  assert.match(appJs, /lastInputWasKeyboard/);
  assert.match(appJs, /document\.visibilityState === 'visible'/);
  assert.match(appJs, /document\.hasFocus\(\)/);
  assert.match(appJs, /classList\.add\('dialog-entering'\)/);
  assert.match(appJs, /setTimeout\(finishEntering, 60\)/);
});

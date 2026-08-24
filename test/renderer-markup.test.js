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
  assert.match(html, /允许工作台提醒/);
  assert.match(html, /id="todayWidgetEnabled"/);
  assert.match(html, /data-reminder-dependent/);
  assert.match(html, /id="changeDataDirectoryButton"/);
  assert.match(html, /id="dataDirectory"/);
  assert.match(html, /id="currentVersion"/);
  assert.match(html, /id="deleteBackupsButton"/);
  assert.match(html, /id="backupSummary"/);
  assert.match(html, /id="refreshOnStartup"/);
  assert.match(html, /class="settings-sidebar"/);
  assert.match(html, /data-settings-section="general"/);
  assert.match(html, /data-settings-section="notifications"/);
  assert.match(html, /data-settings-section="tracking"/);
  assert.match(html, /data-settings-section="storage"/);
  assert.match(html, /data-settings-section="updates"/);
  assert.match(html, /id="archivedNavButton"/);
  assert.match(html, /id="paperSearch"/);
  assert.match(html, /id="markAllReadButton"/);
  assert.match(html, /最近成功同步/);
  assert.doesNotMatch(html, /class="settings-note\b/);
  assert.match(html, /class="window-titlebar"/);
  assert.doesNotMatch(html, /\.\.\/\.\.\/build\/icon\.png/);
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
  assert.match(html, /仅关联研迹中的本地记录/);
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

test('pointer sidebar navigation rises subtly while keyboard navigation stays immediate', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  assert.match(css, /\.workbench-page\.page-entering\s*\{[^}]*workbench-page-rise 160ms var\(--ease-out\)/s);
  assert.match(css, /@keyframes workbench-page-rise\s*\{[^}]*translateY\(6px\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*workbench-page-fade 120ms/);
  assert.match(workbenchJs, /animate:\s*event\.detail\s*>\s*0/);
  assert.match(workbenchJs, /previousPage !== page/);
});

test('installer and updater use Yanji-owned simplified interfaces', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, false);
  assert.match(installer, /Page custom YanjiInstallPageCreate YanjiInstallPageLeave/);
  assert.match(installer, /立即安装/);
  assert.match(installer, /安装不会移动或清除你的科研数据/);
  assert.match(indexHtml, /class="update-journey"/);
  assert.match(indexHtml, /检查版本[\s\S]*安全下载[\s\S]*重启升级/);
  assert.match(appJs, /updateGroup\.dataset\.updateStatus = status/);
});

test('research workbench exposes home, rolling schedule board, metadata notes and quick capture', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  const layoutCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  const liquidCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'themes', 'liquid-glass.css'), 'utf8');
  const storeJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'store.js'), 'utf8');
  const scheduleWidgetHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'schedule-widget.html'), 'utf8');
  const scheduleWidgetJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'schedule-widget.js'), 'utf8');
  const scheduleWidgetCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'schedule-widget.css'), 'utf8');
  assert.match(indexHtml, /data-workbench-page="home"/);
  assert.match(indexHtml, /data-workbench-page="schedule"/);
  assert.match(indexHtml, /data-workbench-page="attendance"/);
  assert.match(indexHtml, /data-workbench-page="notes"/);
  assert.match(indexHtml, /data-workbench-page="jobs"/);
  assert.match(indexHtml, /data-workbench-page="submissions"/);
  assert.doesNotMatch(indexHtml, /id="bingWallpaper"/);
  assert.match(indexHtml, /class="home-progress-strip"[\s\S]*id="homeProgressHeadline"/);
  assert.match(indexHtml, /id="homeProgressRateBar"/);
  assert.match(indexHtml, /id="homeDayOverview"/);
  assert.match(indexHtml, /id="scheduleBoard"/);
  assert.doesNotMatch(indexHtml, /class="schedule-today-panel"|id="todayScheduleList"/);
  assert.doesNotMatch(indexHtml, /id="agendaList"/);
  assert.match(indexHtml, /id="scheduleRecognition"/);
  assert.match(indexHtml, /id="attendanceGanttRows"/);
  assert.match(indexHtml, /id="startFocusButton"/);
  assert.match(indexHtml, /id="focusUsageList"/);
  assert.match(indexHtml, /data-focus-minutes="50"/);
  assert.match(indexHtml, /id="quickNoteButton"/);
  assert.match(indexHtml, /id="createStickyNoteButton"/);
  assert.match(indexHtml, /id="openScheduleWidgetButton"/);
  assert.match(indexHtml, /id="stickyNoteShortcut"/);
  assert.match(indexHtml, /class="home-content-grid"/);
  assert.match(indexHtml, /id="notesGrid"/);
  assert.match(indexHtml, /id="noteMetadataPanel"/);
  assert.match(indexHtml, /id="noteContent"[^>]*contenteditable="true"/);
  assert.match(indexHtml, /id="addNoteImageButton"[^>]*>插入图片</);
  assert.match(indexHtml, /id="noteImagePreviewDialog"/);
  assert.match(indexHtml, /id="toggleNoteFullscreenButton"[^>]*>全屏编辑</);
  assert.match(indexHtml, /id="jobBoard"/);
  assert.match(indexHtml, /id="homeJobSummary"/);
  assert.match(indexHtml, /id="jobDialog"/);
  assert.match(workbenchJs, /insertInlineNoteAttachment/);
  assert.match(workbenchJs, /workbenchApi\.getNoteAttachment/);
  assert.match(layoutCss, /\.note-inline-image/);
  assert.match(layoutCss, /\.note-editor-modal\.is-workspace-fullscreen/);
  assert.match(indexHtml, /#1 · 多屏星空提醒/);
  assert.match(mainJs, /globalShortcut\.register/);
  assert.match(mainJs, /registerWorkbenchShortcuts/);
  assert.match(mainJs, /active \? TITLE_BAR_MODAL : TITLE_BAR_NORMAL/);
  assert.match(mainJs, /function attachWindowToDesktop/);
  assert.match(mainJs, /SHELLDLL_DefView/);
  assert.match(mainJs, /width = 360/);
  assert.match(mainJs, /height = 480/);
  assert.match(mainJs, /alwaysOnTop: false/);
  assert.match(mainJs, /skipTaskbar: true/);
  assert.match(mainJs, /thickFrame: false/);
  assert.match(mainJs, /transparent: true/);
  assert.match(mainJs, /backgroundColor: '#00000000'/);
  assert.match(mainJs, /nativeFrame = 0x00C00000L \| 0x00040000L/);
  assert.match(mainJs, /CreateRoundRectRgn\(0, 0, targetWidth \+ 1, targetHeight \+ 1, 40, 40\)/);
  assert.match(mainJs, /SetWindowRgn\(child, region, true\)/);
  assert.match(mainJs, /Math\.round\(width \* scaleFactor\)/);
  assert.match(mainJs, /Math\.round\(height \* scaleFactor\)/);
  assert.match(mainJs, /webContents\.setZoomFactor\(scaleFactor\)/);
  assert.match(mainJs, /scheduleWidgetEnabled: result\.attached/);
  assert.match(mainJs, /scheduleWidgetEnabled: false/);
  assert.match(mainJs, /getSettings\(\)\.scheduleWidgetEnabled/);
  assert.match(storeJs, /scheduleWidgetEnabled: false/);
  assert.doesNotMatch(mainJs, /scheduleWidgetWindow[\s\S]*setResizable\(true\)/);
  assert.match(mainJs, /showDeadlineWindow/);
  assert.match(mainJs, /new Notification/);
  assert.match(mainJs, /APP_ICON_PATH = process\.platform === 'win32'/);
  assert.match(mainJs, /nativeImage\.createFromPath\(APP_ICON_PATH\)/);
  assert.match(mainJs, /app\.setAppUserModelId\(APP_ID\)/);
  assert.match(mainJs, /if \(!mainWindow\.isMaximized\(\)\) mainWindow\.maximize\(\)/);
  assert.match(mainJs, /closeStaleAttendanceRecords/);
  assert.match(mainJs, /reconcileStaleAttendance/);
  assert.match(preloadJs, /showCapture/);
  assert.match(preloadJs, /createStickyNote/);
  assert.match(preloadJs, /showScheduleWidget/);
  assert.match(scheduleWidgetHtml, /id="widgetScheduleList"/);
  assert.match(scheduleWidgetHtml, /id="closeWidgetButton"/);
  assert.match(scheduleWidgetJs, /schedulesForToday/);
  assert.doesNotMatch(preloadJs, /completeSchedule/);
  assert.doesNotMatch(scheduleWidgetJs, /completeSchedule/);
  assert.match(scheduleWidgetCss, /:root[\s\S]*background: transparent/);
  assert.match(scheduleWidgetCss, /-webkit-line-clamp: 2/);
  assert.match(preloadJs, /startFocus/);
  assert.match(preloadJs, /onFocusChanged/);
  assert.match(workbenchJs, /schedule-board-column/);
  assert.match(workbenchJs, /const rangeStart = addDays\(selected, -2\)/);
  assert.match(workbenchJs, /const rangeEnd = addDays\(selected, 5\)/);
  assert.match(workbenchJs, /Array\.from\(\{ length: 8 \}/);
  assert.match(workbenchJs, /addDays\(wb\.selectedDate, -1\)/);
  assert.match(workbenchJs, /addDays\(wb\.selectedDate, 1\)/);
  assert.doesNotMatch(workbenchJs, /addDays\(wb\.selectedDate, [-]?7\)/);
  assert.match(workbenchJs, /recognizeScheduleEditorInput/);
  assert.match(workbenchJs, /workbenchApi\.parseSchedule/);
  assert.match(workbenchJs, /recognizedSchedules\.length > 1/);
  assert.match(workbenchJs, /notesGrid'\)\.addEventListener\('contextmenu'/);
  assert.match(workbenchJs, /event\.isComposing \|\| scheduleTitleComposing/);
  assert.match(indexHtml, /class="home-attendance-card"[\s\S]*id="homeClockButton"/);
  assert.match(indexHtml, /id="homeAttendanceStatus"/);
  assert.doesNotMatch(indexHtml, /class="focus-timer-panel home-focus-timer"[\s\S]*id="homeClockButton"/);
  assert.match(workbenchJs, /button\.textContent = openRecord \? '下班打卡' : '上班打卡'/);
  assert.match(workbenchJs, /button\.classList\.toggle\('is-clocked-in'/);
  assert.match(workbenchJs, /item\.date === todayKey/);
  assert.match(workbenchJs, /const record = await workbenchApi\.clockAttendance\(action\)/);
  assert.doesNotMatch(workbenchJs, /renderTodaySchedule/);
  assert.doesNotMatch(workbenchJs, /title: '删除日程'.*无法撤销。/);
  assert.doesNotMatch(workbenchJs, /title: '删除打卡记录'.*无法撤销。/);
  assert.doesNotMatch(workbenchJs, /title: '删除笔记'.*无法撤销。/);
  assert.match(liquidCss, /backdrop-filter: blur\(var\(--glass-blur\)\)/);
  assert.match(liquidCss, /prefers-reduced-transparency/);
  assert.match(liquidCss, /prefers-contrast: more/);
  assert.match(liquidCss, /Content layer/);
  assert.match(preloadJs, /saveJobApplication/);
  assert.match(mainJs, /jobs:save/);
  assert.match(mainJs, /deleteWorkspaceNoteIfEmpty/);
  assert.match(mainJs, /createAppWindowIcon/);
  assert.match(mainJs, /reserveDesktopIcons/);
  assert.match(mainJs, /restoreDesktopIconsSync/);
  assert.doesNotMatch(mainJs, /setAlwaysOnTop\(true, 'floating'\)/);
  assert.match(indexHtml, /占据桌面图标网格；关闭主窗口后仍保留/);
  assert.doesNotMatch(indexHtml, /id="closeScheduleButton"|id="closeScheduleConvertButton"|id="closeTodoButton"/);
  assert.match(indexHtml, /id="cancelScheduleButton"/);
  assert.match(indexHtml, /id="cancelTodoButton"/);
  assert.match(indexHtml, /id="cancelNoteButton"/);
  assert.match(indexHtml, /id="cancelScheduleButton"/);
  assert.match(workbenchJs, /SCHEDULE_DRAFT_KEY = 'yanji\.scheduleDraft\.v1'/);
  assert.match(workbenchJs, /closeScheduleEditorPreservingDraft/);
  assert.match(workbenchJs, /localStorage\.setItem\(SCHEDULE_DRAFT_KEY/);
  assert.match(workbenchJs, /localStorage\.removeItem\(SCHEDULE_DRAFT_KEY/);
  assert.match(workbenchJs, /scheduleDialog'\)\.addEventListener\('cancel'/);
  assert.doesNotMatch(indexHtml, /文献推荐|data-workbench-page="literature"/);
  assert.doesNotMatch(mainJs, /OpenAlex|literature:recommend|recommendLatestLiterature/);
  assert.doesNotMatch(preloadJs, /recommendLiterature|literature:recommend/);
  assert.doesNotMatch(workbenchJs, /recommendLiterature|literatureResults/);
});

test('quick capture preserves Chinese IME composition and closes empty on blur', () => {
  const captureHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'capture.html'), 'utf8');
  const captureJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'capture.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(captureHtml, /<textarea id="captureEditor"/);
  assert.match(captureHtml, /id="captureHighlights"/);
  assert.doesNotMatch(captureHtml, /contenteditable/);
  assert.match(captureJs, /compositionstart/);
  assert.match(captureJs, /event\.isComposing \|\| composing \|\| event\.keyCode === 229/);
  assert.doesNotMatch(captureJs, /editor\.innerHTML\s*=/);
  assert.match(mainJs, /quickCaptureWindow\.on\('blur'/);
  assert.match(captureHtml, /#1 红、#2 黄、#3 绿/);
});

test('settings omit promotional and explanatory introduction cards', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  assert.doesNotMatch(indexHtml, /数据只属于你|产品说明|只提醒值得关注的变化/);
  assert.doesNotMatch(indexHtml, /class="settings-note\b/);
  assert.doesNotMatch(indexHtml, /class="privacy-note"/);
});

test('job dashboard uses salary metric without a duplicate upcoming schedule panel', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(indexHtml, /id="jobMaxSalary"/);
  assert.match(indexHtml, /id="jobAnnualSalaryWan"/);
  assert.doesNotMatch(indexHtml, /job-upcoming-panel|jobUpcomingCount|>近期日程</);
});

test('settings render as a workspace page with exact horizontal tabs', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(indexHtml, /<section id="settingsDialog"[^>]*data-page="settings"/);
  assert.doesNotMatch(indexHtml, /<dialog id="settingsDialog"/);
  assert.match(indexHtml, /aria-orientation="horizontal"/);
  assert.match(appJs, /panel\.hidden = panel\.dataset\.settingsPanel !== section/);
  assert.doesNotMatch(appJs, /syncSettingsScrollSection|scrollIntoView/);
  assert.doesNotMatch(appJs, /openDialog\(elements\.settingsDialog\)/);
});

test('destructive workbench actions use the Yanji confirmation dialog', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const sharedUiJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'shared-ui.js'), 'utf8');
  assert.match(indexHtml, /id="yanjiConfirmDialog"/);
  assert.match(sharedUiJs, /window\.yanjiConfirm/);
  assert.doesNotMatch(workbenchJs, /\bconfirm\s*\(/);
});

test('hidden renderer work is throttled and the close-to-tray window is released', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  assert.match(mainJs, /backgroundThrottling:\s*true/);
  assert.match(mainJs, /scheduleHiddenMainWindowRelease\(\)/);
  assert.match(mainJs, /!candidate\.isVisible\(\)\) candidate\.destroy\(\)/);
  assert.match(appJs, /document\.visibilityState === 'visible'\) render\(\)/);
  assert.match(workbenchJs, /document\.visibilityState === 'visible'\) renderClock\(\)/);
});

test('storage location changes require a restart and legacy user data remains discoverable', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.ok(mainJs.indexOf("app.setPath('userData'") < mainJs.indexOf("app.setName('研迹')"));
  assert.match(mainJs, /resolveStableUserDataPath\(app\.getPath\('appData'\)\)/);
  assert.match(mainJs, /restartRequired:\s*true/);
  assert.match(mainJs, /system:restart-app/);
  assert.match(preloadJs, /restartApp/);
  assert.match(appJs, /title:\s*'需要重启研迹'/);
  assert.match(appJs, /confirmText:\s*'立即重启'/);
});

test('the submissions heading uses the same page header baseline as other workbench pages', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  assert.match(indexHtml, /class="workspace-header page-head-row submissions-page-head"/);
  assert.match(css, /\.submissions-page > \.page-head-row/);
});

test('packaged BrowserWindows load the unpacked Yanji taskbar icon', () => {
  const packageJson = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(packageJson, /"build\/icon\.ico"/);
  assert.match(packageJson, /"build\/icon\.png"/);
  assert.match(mainJs, /app\.isPackaged[\s\S]*app\.asar\.unpacked[\s\S]*build/);
  assert.match(mainJs, /mainWindow\.setIcon\(createAppWindowIcon\(\)\)/);
});

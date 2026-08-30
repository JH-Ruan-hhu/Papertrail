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
  const storageCoreJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage-core.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(mainJs, /settings:delete-data-backups/);
  assert.match(mainJs, /isManagedBackupPath\(backupFile/);
  assert.match(storageCoreJs, /papertrail-backup-/);
  assert.match(storageCoreJs, /samePath\(path\.dirname\(target\), root\)/);
  assert.match(mainJs, /refreshOnStartup/);
  assert.match(mainJs, /recoverSystemStateOnStartup/);
  assert.match(mainJs, /system-recovery\.json/);
  assert.match(appJs, /systemRecoveryWarning/);
  assert.match(preloadJs, /deleteDataBackups/);
});

test('settings expose a main-process GitHub Release update workflow', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(html, /id="updateActionButton"/);
  assert.match(html, /id="updateProgress"[\s\S]*role="progressbar"/);
  assert.match(html, /id="updatePromptDialog"/);
  assert.match(html, /id="updatePromptActionButton"/);
  assert.match(mainJs, /let autoUpdater = null/);
  assert.match(mainJs, /Failed to load electron-updater/);
  assert.match(mainJs, /YANJI_DISABLE_UPDATER/);
  assert.match(mainJs, /autoUpdater\.autoDownload = false/);
  assert.match(mainJs, /autoUpdater\.autoInstallOnAppQuit = false/);
  assert.match(mainJs, /updates:check/);
  assert.match(mainJs, /updates:download/);
  assert.match(mainJs, /updates:install/);
  assert.match(preloadJs, /checkForUpdates/);
  assert.match(preloadJs, /onUpdateState/);
  assert.match(appJs, /function renderUpdatePrompt/);
  assert.match(appJs, /dismissedUpdateVersion/);
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
  const tokens = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'motion-tokens.css'),
    'utf8'
  );
  const appJs = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'app.js'),
    'utf8'
  );
  const motionJs = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'motion-system.js'),
    'utf8'
  );
  assert.match(tokens, /--motion-ease-enter:\s*cubic-bezier\(\.23,\s*1,\s*\.32,\s*1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.button:not\(:disabled\):active\s*\{\s*transform:\s*scale\(\.97\)/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /\.paper-card:hover[^}]*transform/);
  assert.match(appJs, /lastInputWasKeyboard/);
  assert.match(motionJs, /document\.visibilityState !== 'visible'/);
  assert.match(motionJs, /document\.hasFocus\(\)/);
  assert.match(motionJs, /classList\.add\('dialog-entering'\)/);
  assert.match(motionJs, /function closeDialog\(/);
  assert.match(motionJs, /dialog\.classList\.add\('dialog-closing'\)/);
});

test('pointer sidebar navigation settles gently while keyboard navigation stays immediate', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-system.css'), 'utf8');
  const tokens = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-tokens.css'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  assert.match(tokens, /--motion-duration-page:\s*360ms/);
  assert.match(css, /\.workbench-page\.page-entering\s*\{[^}]*motion-page-fade var\(--motion-duration-page\)/s);
  assert.match(css, /\.workbench-page\.page-entering > \.page-head-row\s*\{[^}]*motion-heading-enter var\(--motion-duration-page\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*motion-reduced-fade var\(--motion-duration-reduced\)/);
  assert.match(workbenchJs, /animate:\s*event\.detail\s*>\s*0/);
  assert.match(workbenchJs, /previousPage !== page \|\| page === 'home'/);
  assert.match(workbenchJs, /force: page === 'home'/);
});

test('installer uses the stock electron-builder wizard while retaining upgrade safety', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.match(mainJs, /autoUpdater\.installDirectory = path\.dirname\(process\.execPath\)/);
  assert.doesNotMatch(installer, /Page custom|nsDialogs|BrandingText|MUI_BGCOLOR|立即安装|YanjiInstallPageCreate/);
  assert.match(installer, /papertrail-desktop/);
  assert.doesNotMatch(installer, /customPageAfterChangeDir|MUI_PAGE_CUSTOMFUNCTION_PRE|YanjiBeforeInstall/);
  assert.match(installer, /DeleteRegKey HKCU "\$\{UNINSTALL_REGISTRY_KEY\}"/);
  assert.match(installer, /DeleteRegKey HKLM "\$\{UNINSTALL_REGISTRY_KEY\}"/);
  assert.match(installer, /DeleteRegKey HKLM "\$\{INSTALL_REGISTRY_KEY\}"/);
  assert.match(installer, /!insertmacro setInstallModePerUser/);
  assert.match(installer, /StrCpy \$hasPerMachineInstallation "0"/);
  assert.match(installer, /StrCpy \$hasPerUserInstallation "1"/);
  assert.match(installer, /!insertmacro GetDParameter \$R0/);
  assert.match(installer, /StrCpy \$INSTDIR "\$YanjiLegacyInstallRoot\\papertrail-desktop"/);
  assert.match(installer, /stock electron-builder NSIS wizard/);
  assert.match(indexHtml, /RELEASE CENTER/);
  assert.match(indexHtml, /id="autoCheckUpdates"/);
  assert.match(indexHtml, /class="update-journey"/);
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
  assert.match(indexHtml, /id="noteImageZoomOutButton"/);
  assert.match(indexHtml, /id="noteImageZoomResetButton"/);
  assert.match(indexHtml, /id="noteImageZoomInButton"/);
  assert.match(indexHtml, /id="toggleNoteFullscreenButton"[^>]*>全屏编辑</);
  assert.match(indexHtml, /id="jobBoard"/);
  assert.match(indexHtml, /id="homeJobSummary"/);
  assert.match(indexHtml, /id="jobDialog"/);
  assert.match(workbenchJs, /insertInlineNoteAttachment/);
  assert.match(workbenchJs, /workbenchApi\.getNoteAttachment/);
  assert.match(layoutCss, /\.note-inline-image/);
  assert.match(workbenchJs, /function setNoteImagePreviewZoom/);
  assert.match(mainJs, /function exportPortableJobPreview/);
  assert.match(mainJs, /-手机预览/);
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
  assert.match(mainJs, /const TRAY_GUID = '[0-9a-f-]{36}'/);
  assert.match(mainJs, /new Tray\(icon, process\.platform === 'win32' \? TRAY_GUID : undefined\)/);
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
  assert.match(liquidCss, /Primary glass surfaces/);
  assert.match(indexHtml, /class="brand-mark"/);
  assert.match(liquidCss, /--glass-panel:/);
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

test('job dashboard uses independent lifecycle states and selectable standard workflow rails', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(indexHtml, /id="jobTotalJobs"/);
  assert.match(indexHtml, /id="jobTodayAdded"/);
  assert.match(indexHtml, /id="jobQuickFilters"/);
  assert.match(indexHtml, /id="jobWorkflowEditor"/);
  assert.match(indexHtml, /id="jobAnnualSalaryWan"/);
  assert.doesNotMatch(indexHtml, /job-upcoming-panel|jobUpcomingCount|>近期日程</);
  assert.match(indexHtml, /投递与 Offer 固定为起终点；测评和各轮面试可按岗位自由选择/);
  assert.doesNotMatch(indexHtml, /value="pending">待投递/);
  assert.match(workbenchJs, /function renderJobQuickFilters\(jobs/);
  assert.match(workbenchJs, /function readWorkflowEditor\(\)/);
  assert.match(workbenchJs, /stage-assessment[\s\S]*测评[\s\S]*stage-third-interview[\s\S]*三面/);
  assert.match(workbenchJs, /data-workflow-stage-enabled/);
  assert.match(css, /\.job-workflow-track\s*\{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/s);
  assert.match(css, /\.job-flow-stage:first-child,\s*\.job-flow-stage:last-child\s*\{[^}]*transform:\s*none/s);
  assert.doesNotMatch(indexHtml, /id="job(?:Status|Deadline|NextFollowUpAt)"/);
  assert.doesNotMatch(workbenchJs, /JOB_STATUSES|JOB_STATUS_LABELS/);
  assert.doesNotMatch(workbenchJs, /data-advance-job|function advanceJob/);
  assert.match(indexHtml, /id="addJobButton"/);
  assert.match(indexHtml, /id="importJobsButton"/);
  assert.match(indexHtml, /id="exportJobsButton"/);
  assert.match(indexHtml, /id="exportJobsImageButton"/);
  assert.match(indexHtml, /id="exportJobsButton"[^>]*>导出数据<\/button>/);
  assert.match(indexHtml, /id="exportJobsImageButton"[^>]*>导出图片<\/button>/);
  assert.match(mainJs, /ipcMain\.handle\('jobs:import'/);
  assert.match(mainJs, /ipcMain\.handle\('jobs:export'/);
  assert.match(mainJs, /ipcMain\.handle\('jobs:export-image'/);
  assert.match(preloadJs, /importJobApplications/);
  assert.match(preloadJs, /exportJobApplications/);
  assert.match(preloadJs, /exportJobApplicationImages/);
  assert.match(indexHtml, /id="dailyPlanDialog"/);
  assert.match(workbenchJs, /function maybeShowDailyPlan\(\)/);
  assert.match(workbenchJs, /localStorage\.setItem\(DAILY_PLAN_KEY, todayKey\)/);
  assert.match(workbenchJs, /openCreateDialog\(\{ dueAt: dueAt\.toISOString\(\), priority: 'medium' \}\)/);
});

test('note editor autosaves a full daily document and opens from its card', () => {
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const noteEditorJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'note-editor.js'), 'utf8');
  assert.match(workbenchJs, /有未保存更改/);
  assert.match(workbenchJs, /setTimeout\(\(\) => flushNoteEditor\(\{ silent: true \}\), 550\)/);
  assert.match(workbenchJs, /function animateNoteDialogFromCard[\s\S]*duration:\s*260[\s\S]*cubic-bezier\(0\.77, 0, 0\.175, 1\)/);
  assert.match(workbenchJs, /function openNoteEditor[\s\S]*openWorkbenchDialog\(dialog, \{ animate: !sourceCard \}\)[\s\S]*animateNoteDialogFromCard\(dialog, sourceCard\)/);
  assert.match(workbenchJs, /function closeNoteDialogToCard[\s\S]*duration:\s*220/);
  assert.match(noteEditorJs, /duration:\s*260/);
  assert.doesNotMatch(workbenchJs, /noteDialog'\)\.addEventListener\('click'/);
  assert.match(indexHtml, /class="note-paper"/);
  assert.match(indexHtml, /id="noteDocumentTitle"/);
  assert.match(indexHtml, /id="noteWordCount"/);
  assert.match(indexHtml, /id="noteMetadataPanel" class="note-inspector"/);
  assert.match(noteEditorJs, /function appendedSuffix/);
});

test('unchanged workspace broadcasts do not rebuild the visible job table', () => {
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  assert.match(workbenchJs, /const jobsChanged = JSON\.stringify\(wb\.workspace\.jobApplications \|\| \[\]\) !== JSON\.stringify\(nextWorkspace\.jobApplications \|\| \[\]\)/);
  assert.match(workbenchJs, /if \(wb\.page === 'jobs' && jobsChanged\) renderJobs\(\)/);
});

test('daily document renderer no longer exposes the legacy entry editor', () => {
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  for (const source of [workbenchJs, indexHtml]) {
    assert.doesNotMatch(source, /noteAppendMode|noteEntryId|noteDailyHistory|renderNoteDailyHistory|appendEntry/);
  }
  assert.match(workbenchJs, /noteContentToEditorHtml\(draft\?\.content \?\? targetNote\.content/);
  assert.match(mainJs, /appendWorkspaceDailyNote/);
  assert.match(mainJs, /appendDailyNoteContent\(store\.listNotes\(\)/);
  assert.match(indexHtml, /data-note-command="undo"/);
  assert.match(indexHtml, /data-note-command="redo"/);
  assert.match(indexHtml, /data-note-command="insertUnorderedList"/);
});

test('update center shows current and available versions with a local-data safety boundary', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  assert.match(indexHtml, /RELEASE CENTER/);
  assert.match(indexHtml, /id="updateTargetVersion"/);
  assert.match(indexHtml, /只替换程序文件，不移动日程、笔记、投稿或求职数据/);
  assert.match(appJs, /updateTargetVersion\.textContent/);
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
  assert.match(mainJs, /applyWindowsTaskbarIdentity\(mainWindow\)/);
  assert.match(mainJs, /window\.setAppDetails\(\{[\s\S]*appId:\s*APP_ID[\s\S]*appIconPath:\s*APP_ICON_PATH/);
});

test('global motion tokens cover routes, dialogs, tabs and reduced motion without a new dependency', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const tokens = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-tokens.css'), 'utf8');
  const motionCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-system.css'), 'utf8');
  const motionJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-system.js'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const todoViewJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'todo-view.js'), 'utf8');
  const auxiliaryPages = ['sticky.html', 'deadline.html', 'capture.html', 'schedule-widget.html']
    .map((file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', file), 'utf8'));
  assert.match(indexHtml, /motion-tokens\.css/);
  assert.match(indexHtml, /motion-system\.css/);
  assert.match(indexHtml, /motion-system\.js/);
  assert.match(indexHtml, /class="sidebar-active-indicator"/);
  assert.match(tokens, /--motion-duration-micro:\s*140ms/);
  assert.match(tokens, /--motion-duration-fast:\s*180ms/);
  assert.match(tokens, /--motion-duration-component:\s*240ms/);
  assert.match(tokens, /--motion-duration-page:\s*360ms/);
  assert.match(tokens, /--motion-duration-showcase:\s*420ms/);
  assert.match(tokens, /--motion-stagger-home:\s*50ms/);
  assert.match(tokens, /--motion-duration-progress:\s*650ms/);
  for (const html of auxiliaryPages) {
    assert.match(html, /motion-tokens\.css/);
    assert.match(html, /<body class="[^"]*\bmotion-aux-window\b[^"]*">/);
  }
  assert.match(motionCss, /\.workbench-page\.page-entering/);
  assert.match(motionCss, /\.modal\.dialog-entering/);
  assert.match(motionCss, /\.motion-tab-entering/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(motionCss, /transition:\s*transform var\(--motion-duration-progress\)/);
  assert.doesNotMatch(motionCss, /transition:\s*(?:width|height)\b/);
  assert.doesNotMatch(motionCss, /transition:\s*all\b/);
  assert.match(motionJs, /pointerInitiated/);
  assert.match(motionJs, /HOME_MATRIX_SELECTOR/);
  assert.match(motionJs, /getBoundingClientRect\(\)/);
  assert.match(motionJs, /Math\.abs\(item\.top - row\.top\) >= 40/);
  assert.match(motionJs, /--home-enter-wave/);
  assert.match(motionJs, /rowIndex \+ columnIndex/);
  assert.match(motionCss, /motion-home-card-enter var\(--motion-duration-component\)/);
  assert.match(motionCss, /var\(--home-enter-wave, 0\) \* var\(--motion-stagger-home\)/);
  assert.doesNotMatch(motionCss, /home-page[^\n]*:nth-child/);
  assert.match(motionJs, /animateList\(document\.getElementById\('todoList'\), '\.todo-card', \{ limit: 8, delay: 150 \}\)/);
  assert.match(motionCss, /--motion-index[^\n]*var\(--motion-stagger-fast\)/);
  assert.doesNotMatch(motionCss, /page-entering[^\n]*todo-card[^\n]*:nth-child/);
  assert.match(motionJs, /function animateJobList\(/);
  assert.match(motionJs, /new IntersectionObserver\(/);
  assert.match(motionJs, /observer\.unobserve\(element\)/);
  assert.match(motionJs, /rootMargin: '0px 0px -8% 0px'/);
  assert.match(workbenchJs, /YanjiMotion\?\.animateJobList\(document\.getElementById\('jobBoard'\)\)/);
  assert.match(motionCss, /\.job-position\.motion-job-pending\s*\{[^}]*opacity:\s*0/);
  assert.match(motionCss, /\.job-position\.motion-job-visible\s*\{[^}]*motion-job-row-enter/);
  assert.match(todoViewJs, /animateStateChange\(card, 'todo-completing', 280\)/);
  assert.match(motionCss, /motion-todo-check-complete 160ms/);
  assert.match(motionCss, /motion-todo-card-complete 280ms/);
  assert.match(motionJs, /function transitionSchedule\(/);
  assert.match(motionJs, /sign \* 18/);
  assert.match(workbenchJs, /function changeScheduleDate\(/);
  assert.match(workbenchJs, /pendingScheduleHighlightId/);
  assert.match(motionCss, /motion-schedule-added 840ms/);
  assert.match(motionCss, /attendance-bar[^\n]*motion-bar-grow 540ms/);
  assert.match(motionCss, /focus-usage-row i[^\n]*motion-bar-grow 420ms/);
});

test('note editor restores inspector state and wires Word-like Enter and Tab handling', () => {
  const noteEditorJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'note-editor.js'), 'utf8');
  const listEditingJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'list-editing.js'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  assert.match(noteEditorJs, /yanji\.noteInspectorOpen\.v1/);
  assert.match(noteEditorJs, /localStorage\.setItem\(INSPECTOR_STATE_KEY/);
  assert.match(workbenchJs, /YanjiNoteEditor\?\.restoreInspector\(\)/);
  assert.match(listEditingJs, /\['Enter', 'Tab'\]/);
  assert.match(listEditingJs, /execCommand\('insertParagraph'/);
  assert.match(listEditingJs, /event\.shiftKey \? 'outdent' : 'indent'/);
  assert.match(listEditingJs, /insertContentEditableText\(editor, '\\t'\)/);
  assert.match(noteEditorJs, /function handleZoomWheel\(event\)/);
  assert.match(workbenchJs, /note-paper-scroll'[\s\S]*handleZoomWheel/);
  assert.match(css, /\.note-paper\s*\{[\s\S]*?border-radius:\s*0;/);
  assert.match(css, /is-inspector-closed \.note-inspector\s*\{[^}]*display:\s*none[^}]*visibility:\s*hidden[^}]*opacity:\s*0[^}]*translateX\(100%\)/);
});

test('quick capture note submission imports and calls the daily-note append helper from workbench core', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const storageImport = mainJs.match(/const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\/storage-core'\)/)?.[1] || '';
  const workbenchImport = mainJs.match(/const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\/workbench-core'\)/)?.[1] || '';
  assert.doesNotMatch(storageImport, /appendDailyNoteContent/);
  assert.match(workbenchImport, /appendDailyNoteContent/);
  assert.match(mainJs, /function appendWorkspaceDailyNote\(input\)[\s\S]*appendDailyNoteContent\(store\.listNotes\(\)/);
  assert.match(mainJs, /ipcMain\.handle\('capture:submit'[\s\S]*input\?\.mode === 'note'[\s\S]*appendWorkspaceDailyNote\(\{ content:/);
});

test('quick capture Tab cycles through schedule, todo, note and back to schedule', () => {
  const captureJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'capture.js'), 'utf8');
  const tabBranch = captureJs.indexOf("if (event.key === 'Tab')");
  const listEditingBranch = captureJs.indexOf("window.YanjiListEditing?.applyListEditing(editor, event)");
  assert.ok(tabBranch >= 0 && listEditingBranch > tabBranch);
  assert.match(captureJs, /const modes = \['schedule', 'todo', 'note'\]/);
});

test('quick capture recognizes numbered Enter continuation before normal submission', () => {
  const captureJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'capture.js'), 'utf8');
  const continuationBranch = captureJs.indexOf("event.key === 'Enter' && !event.shiftKey && window.YanjiListEditing?.applyListEditing(editor, event)");
  const submitBranch = captureJs.indexOf("event.key === 'Enter' && (mode === 'schedule' || mode === 'todo') && !event.shiftKey");
  assert.ok(continuationBranch >= 0 && continuationBranch < submitBranch);
  assert.doesNotMatch(captureJs.slice(continuationBranch, submitBranch), /mode === 'note'/);
});

test('home page common workspace exposes the global gradient between matrices', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  assert.match(css, /\.workspace:has\(> \.home-page:not\(\[hidden\]\)\)[\s\S]*background:\s*transparent\s*!important/);
  assert.match(css, /\.workspace\s*>\s*\.home-page:not\(\[hidden\]\)[\s\S]*box-shadow:\s*none/);
});

test('v1.4.3 schedule, note, settings and attendance regressions stay wired', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const motionJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'motion-system.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'v11-layout.css'), 'utf8');
  assert.match(indexHtml, /id="scheduleRepeatDailyInput"/);
  assert.match(workbenchJs, /schedule\.repeat !== 'daily'/);
  assert.match(workbenchJs, /repeat:\s*document\.getElementById\('scheduleRepeatDailyInput'\)\.checked \? 'daily' : null/);
  assert.match(workbenchJs, /function scheduleEndTimeAfterStart\(startTime, minutes = 10\)/);
  assert.match(workbenchJs, /scheduleStartTime'\)\.addEventListener\('input'/);
  assert.match(css, /\.schedule-time-field input\[type="time"\][\s\S]*font-variant-numeric:\s*tabular-nums/);
  assert.match(motionJs, /exitAnimation\.cancel\(\)/);
  assert.match(css, /\.note-paper-scroll\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/);
  assert.match(css, /grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.settings-page \.settings-liquid-filters\s*\{[^}]*position:\s*absolute/);
  assert.match(workbenchJs, /bar\.style\.left = `\$\{Number\(bar\.dataset\.attendanceLeft\)\}%`/);
  assert.doesNotMatch(workbenchJs, /class="attendance-bar[^`]*style="left:/);
  assert.match(workbenchJs, /endTimestamp >= rowDayEnd\.getTime\(\) \? 1440/);
});

test('v1.4.9 job table and portable export use the simplified columns without losing import data', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const workbenchJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'workbench.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(indexHtml, /id="jobStatusFilter"[\s\S]*状态：不限[\s\S]*进行中[\s\S]*已结束/);
  assert.doesNotMatch(indexHtml.match(/id="jobStatusFilter"[\s\S]*?<\/select>/)?.[0] || '', /准备中|暂停/);
  assert.match(indexHtml, /优先级：不限/);
  assert.match(indexHtml, /城市：不限/);
  assert.match(indexHtml, /class="job-table-head"[\s\S]*预估年薪/);
  assert.match(indexHtml, /id="jobSettingsButton"[\s\S]*<circle cx="12" cy="12" r="3"/);
  assert.match(workbenchJs, /class="job-salary-cell"/);
  assert.match(workbenchJs, /jobs\.filter\(\(job\) => job\.status !== 'closed'\)/);
  assert.match(mainJs, /<span>预估年薪<\/span><span>状态<\/span>/);
  assert.match(mainJs, /jobApplications:\s*workspace\.jobApplications/);
  assert.match(mainJs, /annualSalaryWan/);
  assert.match(mainJs, /document\.body\.scrollHeight/);
  assert.match(mainJs, /setContentSize\(1400, captureHeight/);
});

test('release verification executes the packaged executable and inspects app.asar', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const smokeJs = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'packaged-smoke.js'), 'utf8');
  const verifyJs = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'verify-package.js'), 'utf8');
  assert.match(mainJs, /--smoke-test/);
  assert.match(mainJs, /YANJI_SMOKE_OK/);
  assert.match(smokeJs, /win-unpacked/);
  assert.match(smokeJs, /YANJI_DEVELOPMENT_SMOKE_OK/);
  assert.match(smokeJs, /updaterAvailable/);
  assert.match(smokeJs, /createdDefaultDatabase/);
  assert.match(verifyJs, /node_modules\/electron-updater\/package\.json/);
  assert.match(verifyJs, /node_modules\/fs-extra\/package\.json/);
  assert.match(verifyJs, /src\/preload\.js/);
});

test('non-critical startup services degrade without aborting core startup', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(mainJs, /async function runNonCriticalStartup/);
  assert.match(mainJs, /createWindow\(\);[\s\S]*runNonCriticalStartup\('系统托盘'/);
  assert.match(mainJs, /runNonCriticalStartup\('自动更新', initializeUpdater\)/);
  assert.match(mainJs, /runNonCriticalStartup\('Focus 运行时', resumeFocusRuntime\)/);
  assert.match(mainJs, /sampler\.on\('error'/);
  assert.match(mainJs, /recoveryProcess\.on\('error'/);
  assert.match(mainJs, /研迹核心启动失败/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectFileCache = new Map();
function readProjectFile(...segments) {
  const filePath = path.join(__dirname, '..', ...segments);
  if (!projectFileCache.has(filePath)) projectFileCache.set(filePath, fs.readFileSync(filePath, 'utf8'));
  return projectFileCache.get(filePath);
}

test('add-dialog cancel controls do not submit the required form', () => {
  const html = readProjectFile('src', 'renderer', 'index.html');
  assert.match(html, /id="closeAddDialogButton"\s+type="button"/);
  assert.match(html, /id="cancelAddButton"\s+type="button"/);
  assert.doesNotMatch(html, /id="(?:closeAddDialogButton|cancelAddButton)"[^>]*type="submit"/);
});

test('top bar does not expose a minimize-to-tray button', () => {
  const html = readProjectFile('src', 'renderer', 'index.html');
  assert.doesNotMatch(html, /id="hideButton"/);
  assert.doesNotMatch(html, /最小化到托盘/);
});

test('uses a sidebar layout with settings at the bottom and two add modes', () => {
  const html = readProjectFile('src', 'renderer', 'index.html');
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
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  const css = readProjectFile('src', 'renderer', 'styles.css');
  assert.match(appJs, /data-action="copy-doi"/);
  assert.match(appJs, /https:\/\/doi\.org\//);
  assert.match(appJs, /<small>DOI<\/small>/);
  assert.doesNotMatch(appJs, /DOI · 悬浮查看，点击复制/);
  assert.match(appJs, /DOI 链接复制成功', 'success', 1000/);
  assert.match(css, /\.doi-copy-button::after/);
  assert.match(css, /top: 54px/);
});

test('settings expose backup deletion, current version and cold-start refresh', () => {
  const mainJs = readProjectFile('src', 'main.js');
  const storageCoreJs = readProjectFile('src', 'storage-core.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  const preloadJs = readProjectFile('src', 'preload.js');
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
  const html = readProjectFile('src', 'renderer', 'index.html');
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
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
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
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
  const html = readProjectFile('src', 'renderer', 'index.html');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  const css = readProjectFile('src', 'renderer', 'styles.css');
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
  const html = readProjectFile('src', 'renderer', 'index.html');
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
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
  const html = readProjectFile('src', 'renderer', 'index.html');
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
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
  const css = readProjectFile('src', 'renderer', 'styles.css');
  const tokens = readProjectFile('src', 'renderer', 'motion-tokens.css');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  const motionJs = readProjectFile('src', 'renderer', 'motion-system.js');
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
  const css = readProjectFile('src', 'renderer', 'motion-system.css');
  const tokens = readProjectFile('src', 'renderer', 'motion-tokens.css');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  assert.match(tokens, /--motion-duration-page:\s*360ms/);
  assert.match(css, /\.workbench-page\.page-entering\s*\{[^}]*motion-page-fade var\(--motion-duration-page\)/s);
  assert.match(css, /\.workbench-page\.page-entering > \.page-head-row\s*\{[^}]*motion-heading-enter var\(--motion-duration-page\)/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*motion-reduced-fade var\(--motion-duration-reduced\)/);
  assert.match(workbenchJs, /animate:\s*event\.detail\s*>\s*0/);
  assert.match(workbenchJs, /previousPage !== page \|\| page === 'home'/);
  assert.match(workbenchJs, /force: page === 'home'/);
});

test('select pickers settle into place and respect reduced motion', () => {
  const css = readProjectFile('src', 'renderer', 'motion-system.css');
  assert.match(css, /::picker\(select\):popover-open/);
  assert.match(css, /translate3d\(0, 6px, 0\) scale\(\.97\)/);
  assert.match(css, /opacity var\(--motion-duration-fast\) var\(--motion-ease-enter\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*::picker\(select\) \{ transform: none/);
  assert.doesNotMatch(css, /::picker\(select\)[\s\S]{0,500}scale\(0\)/);
});

test('submission tracker keeps the original full-width manuscript card layout', () => {
  const html = readProjectFile('src', 'renderer', 'index.html');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  assert.match(html, /<section class="stats" aria-label="稿件统计">/);
  assert.match(html, /<div id="paperList" class="paper-list"/);
  assert.doesNotMatch(html, /submission-desk-grid|id="paperDetail"|id="reviewPaperCount"|id="productionPaperCount"/);
  assert.match(appJs, /elements\.paperList\.innerHTML = visiblePapers\.map\(renderPaper\)\.join\(''\)/);
  assert.doesNotMatch(appJs, /renderPaperRow|selectedPaperId|elements\.paperDetail/);
});

test('installer uses the stock electron-builder wizard while retaining upgrade safety', () => {
  const packageJson = JSON.parse(readProjectFile('package.json'));
  const installer = readProjectFile('build', 'installer.nsh');
  const mainJs = readProjectFile('src', 'main.js');
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
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
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const css = readProjectFile('src', 'renderer', 'styles.css');
  const layoutCss = readProjectFile('src', 'renderer', 'v11-layout.css');
  const liquidCss = readProjectFile('src', 'renderer', 'themes', 'liquid-glass.css');
  const storeJs = readProjectFile('src', 'store.js');
  const scheduleWidgetHtml = readProjectFile('src', 'renderer', 'schedule-widget.html');
  const scheduleWidgetJs = readProjectFile('src', 'renderer', 'schedule-widget.js');
  const scheduleWidgetCss = readProjectFile('src', 'renderer', 'schedule-widget.css');
  assert.match(indexHtml, /data-workbench-page="home"/);
  assert.match(indexHtml, /data-workbench-page="schedule"/);
  assert.match(indexHtml, /data-workbench-page="attendance"/);
  assert.match(indexHtml, /data-workbench-page="notes"/);
  assert.match(indexHtml, /data-workbench-page="jobs"/);
  assert.match(indexHtml, /data-workbench-page="submissions"/);
  assert.doesNotMatch(indexHtml, /id="bingWallpaper"/);
  assert.match(indexHtml, /class="home-progress-strip"[\s\S]*id="homeProgressHeadline"/);
  assert.match(indexHtml, /id="homeProgressRateBar"/);
  assert.doesNotMatch(indexHtml, /快速开始|data-home-quick-action/);
  assert.match(indexHtml, /id="homeActivityHeatmap"[\s\S]*id="homeDeadlineMatrix"/);
  assert.match(indexHtml, /class="home-today-card home-countdown-card"/);
  assert.doesNotMatch(indexHtml, /home-insight-grid[\s\S]*home-deadline-section/);
  assert.match(workbenchJs, /home-countdown-primary/);
  assert.doesNotMatch(workbenchJs, /home-countdown-secondary/);
  assert.match(workbenchJs, /function currentCountdown\(\)[\s\S]*sort\(\(a, b\) => Date\.parse\(a\.targetAt\) - Date\.parse\(b\.targetAt\)\)\[0\]/);
  assert.match(workbenchJs, /addCountdownButton[^\n]*openCountdownEditor\(currentCountdown\(\)\)/);
  assert.match(layoutCss, /\.home-deadline-title\s*\{[^}]*background:\s*linear-gradient[^}]*font-size:\s*15px[^}]*font-weight:\s*820/s);
  assert.match(layoutCss, /\.home-countdown\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center[^}]*justify-content:\s*center[^}]*font-variant-numeric:\s*tabular-nums/s);
  assert.match(layoutCss, /\.home-countdown-primary b\s*\{[^}]*font-size:\s*clamp\(52px, 5\.4vw, 68px\)[^}]*font-weight:\s*850/s);
  assert.match(layoutCss, /home-command-grid\s*\{[^}]*minmax\(126px, \.6fr\)[^}]*minmax\(0, 1\.4fr\)/s);
  assert.match(layoutCss, /home-countdown-card \.home-deadline-title\s*\{[^}]*padding-inline:\s*5px 30px[^}]*font-size:\s*13px/);
  assert.match(workbenchJs, /目标日 · [^<]*Intl\.DateTimeFormat\('zh-CN', \{ year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long' \}\)/);
  assert.match(layoutCss, /\.home-next-event-card \.next-event-content > span\s*\{[^}]*align-self:\s*end/s);
  assert.match(layoutCss, /\.home-attendance-content > span\s*\{[^}]*grid-row:\s*2[^}]*align-self:\s*end/s);
  assert.match(indexHtml, /id="addCountdownButton"[\s\S]*id="countdownDialog"[\s\S]*id="countdownTargetAt"/);
  assert.match(preloadJs, /countdowns:save/);
  assert.match(mainJs, /countdowns:save/);
  assert.match(workbenchJs, /workspace\.countdowns[\s\S]*data-edit-countdown/);
  assert.match(workbenchJs, /data-home-schedule-action[\s\S]*completeSchedule/);
  assert.match(indexHtml, /name="homeBannerImageMode" value="default"[\s\S]*value="local"[\s\S]*value="bing"/);
  assert.match(preloadJs, /settings:choose-home-banner/);
  assert.match(mainJs, /HPImageArchive\.aspx/);
  assert.match(mainJs, /initializeBingHomeBanner\(\)[\s\S]*homeBannerImageMode:\s*settings\.homeBannerImageMode === 'default' \? 'bing'/);
  assert.match(mainJs, /homeBannerFetchedOn === localDateStamp\(\)[\s\S]*bingHomeBannerRetryAfter/);
  assert.match(mainJs, /updated\.homeBannerImageMode === 'bing'[\s\S]*refreshBingHomeBanner\(\)/);
  assert.match(layoutCss, /\.home-progress-strip\.has-banner-image\s*\{[^}]*rgba\(249,251,255,\.92\)[^}]*rgba\(246,249,253,\.82\)[^}]*rgba\(240,244,252,\.72\)/s);
  assert.match(layoutCss, /\.home-focus-timer \.focus-notification-option span\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(layoutCss, /\.home-top-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1\.9fr\) minmax\(350px, 1\.1fr\)/s);
  assert.match(layoutCss, /@media \(min-width: 1041px\) and \(max-height: 900px\)[\s\S]*\.home-focus-timer \.focus-notification-copy > p\s*\{[^}]*display:\s*block/s);
  assert.match(indexHtml, /未来四天[\s\S]*任务与日程按日期统一排列/);
  assert.doesNotMatch(indexHtml, /id="homeToday(?:Schedule|Todo)List"/);
  assert.match(indexHtml, /id="homeDayOverview"/);
  assert.match(indexHtml, /id="scheduleBoard"/);
  assert.doesNotMatch(indexHtml, /data-todo-view="inbox"|>收件箱\s*</);
  assert.doesNotMatch(indexHtml, /data-todo-view="upcoming"|>即将到来\s*</);
  assert.match(workbenchJs, /Number\(Boolean\(a\.completedAt\)\) - Number\(Boolean\(b\.completedAt\)\)/);
  assert.doesNotMatch(indexHtml, /class="schedule-today-panel"|id="todayScheduleList"/);
  assert.doesNotMatch(indexHtml, /id="agendaList"/);
  assert.match(indexHtml, /id="scheduleRecognition"/);
  assert.match(indexHtml, /name="scheduleEntryKind" value="task"[\s\S]*name="scheduleEntryKind" value="event"/);
  assert.match(preloadJs, /createScheduledTodo:.*todos:create-scheduled/);
  assert.match(workbenchJs, /const creatingTask = !scheduleId[^;]*&& !allDay;/);
  assert.match(workbenchJs, /data-schedule-start="\$\{wbEscape\(item\.startAt\)\}"[^>]*draggable="true"/);
  assert.match(workbenchJs, /scheduleBoard\.addEventListener\('drop',[\s\S]*moveScheduleToDate/);
  assert.doesNotMatch(workbenchJs, /moveScheduleToDate[\s\S]{0,1200}wb\.selectedDate\s*=\s*targetDate/);
  assert.match(workbenchJs, /class="schedule-card-meta"[^`]*\$\{linkedButton\}/);
  assert.match(workbenchJs, /08:00–24:00/);
  assert.match(workbenchJs, /schedule-time-axis/);
  assert.match(workbenchJs, /data-schedule-top/);
  assert.match(workbenchJs, /targetMinutes = Math\.min\(23 \* 60 \+ 45/);
  assert.match(workbenchJs, /Ctrl\+滚轮缩放/);
  assert.match(workbenchJs, /scheduleHourHeight:\s*48/);
  assert.match(workbenchJs, /addEventListener\('wheel',[\s\S]*event\.ctrlKey[\s\S]*applyScheduleZoom/);
  assert.match(workbenchJs, /is-brief[\s\S]*is-compact-block[\s\S]*is-expanded-block/);
  assert.match(layoutCss, /grid-template-columns:\s*54px repeat\(7, minmax\(118px, 1fr\)\)/);
  assert.match(layoutCss, /grid-template-rows:\s*54px 44px var\(--schedule-track-height\)/);
  assert.match(layoutCss, /is-detailed-scale[^}]*time\.is-half-hour\s*\{[^}]*display:\s*block/);
  assert.match(mainJs, /todos:create-scheduled/);
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
  assert.match(preloadJs, /completeSchedule/);
  assert.doesNotMatch(scheduleWidgetJs, /completeSchedule/);
  assert.match(scheduleWidgetCss, /:root[\s\S]*background: transparent/);
  assert.match(scheduleWidgetCss, /-webkit-line-clamp: 2/);
  assert.match(preloadJs, /startFocus/);
  assert.match(preloadJs, /onFocusChanged/);
  assert.match(workbenchJs, /schedule-board-column/);
  assert.match(workbenchJs, /const rangeStart = startOfWeek\(selected\)/);
  assert.match(workbenchJs, /const rangeEnd = addDays\(rangeStart, 6\)/);
  assert.match(workbenchJs, /Array\.from\(\{ length: 7 \}/);
  assert.match(workbenchJs, /addDays\(wb\.selectedDate, -7\)/);
  assert.match(workbenchJs, /addDays\(wb\.selectedDate, 7\)/);
  assert.match(indexHtml, /aria-label="上一周"[\s\S]*aria-label="下一周"/);
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
  const captureHtml = readProjectFile('src', 'renderer', 'capture.html');
  const captureJs = readProjectFile('src', 'renderer', 'capture.js');
  const mainJs = readProjectFile('src', 'main.js');
  assert.match(captureHtml, /<textarea id="captureEditor"/);
  assert.match(captureHtml, /id="captureHighlights"/);
  assert.doesNotMatch(captureHtml, /contenteditable/);
  assert.match(captureJs, /compositionstart/);
  assert.match(captureJs, /event\.isComposing \|\| composing \|\| event\.keyCode === 229/);
  assert.doesNotMatch(captureJs, /editor\.innerHTML\s*=/);
  assert.match(mainJs, /quickCaptureWindow\.on\('blur'/);
  assert.match(captureHtml, /data-mode="item"[\s\S]*事项[\s\S]*data-mode="note"/);
  assert.doesNotMatch(captureHtml, /capture-brand|QUICK CAPTURE/);
  assert.match(captureHtml, /data-capture-state="neutral"/);
  assert.doesNotMatch(captureHtml, /motion-aux-window/);
  assert.match(captureHtml, /name="captureItemKind" value="task"[\s\S]*name="captureItemKind" value="event"/);
  assert.match(captureJs, /#1 红、#2 黄、#3 绿/);
  assert.match(captureJs, /dataset\.captureState = state/);
  assert.match(captureJs, /match\.start <= previous\.end[\s\S]*Math\.max\(previous\.end, match\.end\)/);
  assert.match(captureJs, /event\.key === 'Escape'[\s\S]*clearTimeout\(parseTimer\)[\s\S]*editor\.value = ''[\s\S]*api\.hideCapture\(\)/);
  assert.doesNotMatch(captureJs, /内容尚未保存；清空后再按 Esc 关闭/);
  assert.match(captureJs, /\[~～\][\s\S]*repeat: prefix \? 'daily' : null/);
  assert.match(mainJs, /normalizeCaptureInput\(input\)[\s\S]*repeat: capture\.repeat/);
});

test('settings omit promotional and explanatory introduction cards', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  assert.doesNotMatch(indexHtml, /数据只属于你|产品说明|只提醒值得关注的变化/);
  assert.doesNotMatch(indexHtml, /class="settings-note\b/);
  assert.doesNotMatch(indexHtml, /class="privacy-note"/);
});

test('job dashboard uses independent lifecycle states and selectable standard workflow rails', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  assert.match(indexHtml, /<script src="\.\.\/job-core\.js"><\/script>[\s\S]*<script src="workbench\.js"><\/script>/);
  assert.match(workbenchJs, /window\.YanjiJobCore/);
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
  assert.doesNotMatch(indexHtml, /id="job(?:Status|NextFollowUpAt)"/);
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
  assert.match(workbenchJs, /const todayTodos = \(wb\.workspace\.todos \|\| \[\]\)\.filter[\s\S]*if \(todayTodos\.length\) return;[\s\S]*localStorage\.setItem\(DAILY_PLAN_KEY, todayKey\)/);
  assert.match(workbenchJs, /localStorage\.setItem\(DAILY_PLAN_KEY, todayKey\)/);
  assert.match(workbenchJs, /openCreateDialog\(\{ dueAt: dueAt\.toISOString\(\), priority: 'medium' \}\)/);
});

test('note editor autosaves a full daily document and opens from its card', () => {
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const noteEditorJs = readProjectFile('src', 'renderer', 'note-editor.js');
  assert.match(workbenchJs, /有未保存更改/);
  assert.match(workbenchJs, /setTimeout\(\(\) => flushNoteEditor\(\{ silent: true \}\), 550\)/);
  assert.match(workbenchJs, /function animateNoteDialogFromCard[\s\S]*duration:\s*260[\s\S]*cubic-bezier\(0\.77, 0, 0\.175, 1\)/);
  assert.match(workbenchJs, /function openNoteEditor[\s\S]*openWorkbenchDialog\(dialog, \{ animate: !sourceCard \}\)[\s\S]*animateNoteDialogFromCard\(dialog, sourceCard\)/);
  assert.match(workbenchJs, /function closeNoteDialogToCard[\s\S]*duration:\s*220/);
  assert.match(noteEditorJs, /duration:\s*260/);
  assert.match(workbenchJs, /noteDialog\.addEventListener\('pointerdown'[\s\S]*event\.target === event\.currentTarget[\s\S]*noteDialog\.addEventListener\('click'[\s\S]*notePointerStartedOnBackdrop && event\.target === event\.currentTarget[\s\S]*closeNoteEditorSafely\(event\.currentTarget\)/);
  assert.match(workbenchJs, /noteDialog'\)\.addEventListener\('keydown'[\s\S]*event\.ctrlKey \|\| event\.metaKey[\s\S]*event\.key !== 'Enter'[\s\S]*saveNoteFromEditor\(\)/);
  assert.match(indexHtml, /class="note-paper"/);
  assert.match(indexHtml, /id="noteDocumentTitle"/);
  assert.match(indexHtml, /id="noteWordCount"/);
  assert.match(indexHtml, /id="noteMetadataPanel" class="note-inspector"/);
  assert.match(noteEditorJs, /function appendedSuffix/);
});

test('unchanged workspace broadcasts do not rebuild the visible job table', () => {
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  assert.match(workbenchJs, /const jobsChanged = JSON\.stringify\(wb\.workspace\.jobApplications \|\| \[\]\) !== JSON\.stringify\(nextWorkspace\.jobApplications \|\| \[\]\)/);
  assert.match(workbenchJs, /if \(wb\.page === 'jobs' && jobsChanged\) renderJobs\(\)/);
});

test('daily document renderer no longer exposes the legacy entry editor', () => {
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const mainJs = readProjectFile('src', 'main.js');
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
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  assert.match(indexHtml, /RELEASE CENTER/);
  assert.match(indexHtml, /id="updateTargetVersion"/);
  assert.match(indexHtml, /只替换程序文件，不移动日程、笔记、投稿或求职数据/);
  assert.match(appJs, /updateTargetVersion\.textContent/);
});

test('settings render as a workspace page with exact horizontal tabs', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  assert.match(indexHtml, /<section id="settingsDialog"[^>]*data-page="settings"/);
  assert.doesNotMatch(indexHtml, /<dialog id="settingsDialog"/);
  assert.match(indexHtml, /aria-orientation="horizontal"/);
  assert.match(appJs, /panel\.hidden = panel\.dataset\.settingsPanel !== section/);
  assert.doesNotMatch(appJs, /syncSettingsScrollSection|scrollIntoView/);
  assert.doesNotMatch(appJs, /openDialog\(elements\.settingsDialog\)/);
});

test('destructive workbench actions use the Yanji confirmation dialog', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const sharedUiJs = readProjectFile('src', 'renderer', 'shared-ui.js');
  assert.match(indexHtml, /id="yanjiConfirmDialog"/);
  assert.match(sharedUiJs, /window\.yanjiConfirm/);
  assert.doesNotMatch(workbenchJs, /\bconfirm\s*\(/);
});

test('hidden renderer work is throttled and the close-to-tray window is released', () => {
  const mainJs = readProjectFile('src', 'main.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  assert.match(mainJs, /backgroundThrottling:\s*true/);
  assert.match(mainJs, /scheduleHiddenMainWindowRelease\(\)/);
  assert.match(mainJs, /!candidate\.isVisible\(\)\) candidate\.destroy\(\)/);
  assert.match(appJs, /document\.visibilityState === 'visible'\) render\(\)/);
  assert.match(workbenchJs, /document\.visibilityState === 'visible'\) renderClock\(\)/);
});

test('storage location changes require a restart and legacy user data remains discoverable', () => {
  const mainJs = readProjectFile('src', 'main.js');
  const preloadJs = readProjectFile('src', 'preload.js');
  const appJs = readProjectFile('src', 'renderer', 'app.js');
  assert.ok(mainJs.indexOf("app.setPath('userData'") < mainJs.indexOf("app.setName('研迹')"));
  assert.match(mainJs, /resolveStableUserDataPath\(app\.getPath\('appData'\)\)/);
  assert.match(mainJs, /restartRequired:\s*true/);
  assert.match(mainJs, /system:restart-app/);
  assert.match(preloadJs, /restartApp/);
  assert.match(appJs, /title:\s*'需要重启研迹'/);
  assert.match(appJs, /confirmText:\s*'立即重启'/);
});

test('the submissions heading uses the same page header baseline as other workbench pages', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
  assert.match(indexHtml, /class="workspace-header page-head-row submissions-page-head"/);
  assert.match(css, /\.submissions-page > \.page-head-row/);
});

test('packaged BrowserWindows load the unpacked Yanji taskbar icon', () => {
  const packageJson = readProjectFile('package.json');
  const mainJs = readProjectFile('src', 'main.js');
  assert.match(packageJson, /"build\/icon\.ico"/);
  assert.match(packageJson, /"build\/icon\.png"/);
  assert.match(mainJs, /app\.isPackaged[\s\S]*app\.asar\.unpacked[\s\S]*build/);
  assert.match(mainJs, /applyWindowsTaskbarIdentity\(mainWindow\)/);
  assert.match(mainJs, /window\.setAppDetails\(\{[\s\S]*appId:\s*APP_ID[\s\S]*appIconPath:\s*APP_ICON_PATH/);
});

test('global motion tokens cover routes, dialogs, tabs and reduced motion without a new dependency', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const tokens = readProjectFile('src', 'renderer', 'motion-tokens.css');
  const motionCss = readProjectFile('src', 'renderer', 'motion-system.css');
  const motionJs = readProjectFile('src', 'renderer', 'motion-system.js');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const todoViewJs = readProjectFile('src', 'renderer', 'todo-view.js');
  const auxiliaryPages = ['sticky.html', 'deadline.html', 'schedule-widget.html']
    .map((file) => readProjectFile('src', 'renderer', file));
  const captureHtml = readProjectFile('src', 'renderer', 'capture.html');
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
  assert.match(captureHtml, /motion-tokens\.css/);
  assert.doesNotMatch(captureHtml, /motion-aux-window/);
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

test('deadline window offers a ten-minute same-item snooze without relabeling an exact reminder as overdue', () => {
  const deadlineHtml = readProjectFile('src', 'renderer', 'deadline.html');
  const deadlineJs = readProjectFile('src', 'renderer', 'deadline.js');
  const reminderCore = readProjectFile('src', 'reminder-core.js');
  const mainJs = readProjectFile('src', 'main.js');
  assert.match(deadlineHtml, /10 分钟后提醒/);
  assert.match(deadlineJs, /10 \* 60_000/);
  assert.match(reminderCore, /const overdue = level === 'overdue'/);
  assert.match(mainJs, /yanjiDeadlineKind === 'schedule'[\s\S]*snoozedUntil/);
});

test('note editor restores inspector state and wires Word-like Enter and Tab handling', () => {
  const noteEditorJs = readProjectFile('src', 'renderer', 'note-editor.js');
  const listEditingJs = readProjectFile('src', 'renderer', 'list-editing.js');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
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
  const mainJs = readProjectFile('src', 'main.js');
  const storageImport = mainJs.match(/const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\/storage-core'\)/)?.[1] || '';
  const workbenchImport = mainJs.match(/const\s*\{([\s\S]*?)\}\s*=\s*require\('\.\/workbench-core'\)/)?.[1] || '';
  assert.doesNotMatch(storageImport, /appendDailyNoteContent/);
  assert.match(workbenchImport, /appendDailyNoteContent/);
  assert.match(mainJs, /function appendWorkspaceDailyNote\(input\)[\s\S]*appendDailyNoteContent\(store\.listNotes\(\)/);
  assert.match(mainJs, /ipcMain\.handle\('capture:submit'[\s\S]*input\?\.mode === 'note'[\s\S]*appendWorkspaceDailyNote\(\{ content:/);
});

test('quick capture Tab cycles between item and note modes', () => {
  const captureJs = readProjectFile('src', 'renderer', 'capture.js');
  const tabBranch = captureJs.indexOf("if (event.key === 'Tab')");
  const listEditingBranch = captureJs.indexOf("window.YanjiListEditing?.applyListEditing(editor, event)");
  assert.ok(tabBranch >= 0 && listEditingBranch > tabBranch);
  assert.match(captureJs, /const modes = \['item', 'note'\]/);
});

test('quick capture recognizes numbered Enter continuation before normal submission', () => {
  const captureJs = readProjectFile('src', 'renderer', 'capture.js');
  const continuationBranch = captureJs.indexOf("event.key === 'Enter' && !event.shiftKey && window.YanjiListEditing?.applyListEditing(editor, event)");
  const submitBranch = captureJs.indexOf("event.key === 'Enter' && mode === 'item' && !event.shiftKey");
  assert.ok(continuationBranch >= 0 && continuationBranch < submitBranch);
  assert.doesNotMatch(captureJs.slice(continuationBranch, submitBranch), /mode === 'note'/);
});

test('home page common workspace exposes the global gradient between matrices', () => {
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
  assert.match(css, /\.workspace:has\(> \.home-page:not\(\[hidden\]\)\)[\s\S]*background:\s*transparent\s*!important/);
  assert.match(css, /\.workspace\s*>\s*\.home-page:not\(\[hidden\]\)[\s\S]*box-shadow:\s*none/);
});

test('home job pipeline uses four visually distinct stage colors', () => {
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
  assert.match(css, /home-job-summary \.home-job-row:nth-child\(1\)[^}]*#4f8df5[^}]*#2f68d8/);
  assert.match(css, /home-job-summary \.home-job-row:nth-child\(2\)[^}]*#f2b24d[^}]*#d97a28/);
  assert.match(css, /home-job-summary \.home-job-row:nth-child\(3\)[^}]*#b06adf[^}]*#7b4bc1/);
  assert.match(css, /home-job-summary \.home-job-row:nth-child\(4\)[^}]*#42b99a[^}]*#23836f/);
});

test('v1.4.3 schedule, note, settings and attendance regressions stay wired', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const motionJs = readProjectFile('src', 'renderer', 'motion-system.js');
  const css = readProjectFile('src', 'renderer', 'v11-layout.css');
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
  assert.match(css, /\.job-compact-filters\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.job-compact-filters label:nth-child\(4\) select\s*\{[^}]*width:\s*138px/);
  assert.match(css, /\.job-compact-filters select\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.schedule-board-shell\s*\{[^}]*overflow:\s*auto[^}]*scrollbar-width:\s*none/);
  assert.match(css, /\.schedule-board-shell::\-webkit-scrollbar\s*\{[^}]*width:\s*0[^}]*height:\s*0/);
  assert.match(workbenchJs, /attendance-bar attendance-day-tone-\$\{index\}/);
  assert.equal((css.match(/\.attendance-page \.attendance-bar\.attendance-day-tone-\d/g) || []).length, 7);
  assert.match(workbenchJs, /bar\.style\.left = `\$\{Number\(bar\.dataset\.attendanceLeft\)\}%`/);
  assert.doesNotMatch(workbenchJs, /class="attendance-bar[^`]*style="left:/);
  assert.match(workbenchJs, /endTimestamp >= rowDayEnd\.getTime\(\) \? 1440/);
});

test('v1.4.9 job table and portable export use the simplified columns without losing import data', () => {
  const indexHtml = readProjectFile('src', 'renderer', 'index.html');
  const workbenchJs = readProjectFile('src', 'renderer', 'workbench.js');
  const mainJs = readProjectFile('src', 'main.js');
  assert.match(indexHtml, /id="jobStatusFilter"[\s\S]*状态：不限[\s\S]*进行中[\s\S]*已结束/);
  assert.doesNotMatch(indexHtml.match(/id="jobStatusFilter"[\s\S]*?<\/select>/)?.[0] || '', /准备中|暂停/);
  assert.match(indexHtml, /优先级：不限/);
  assert.match(indexHtml, /城市：不限/);
  assert.match(indexHtml, /class="job-table-head"[\s\S]*预估年薪/);
  assert.match(indexHtml, /class="job-table-head"[\s\S]*截止日期/);
  assert.match(indexHtml, /id="jobDeadline"/);
  assert.match(indexHtml, /id="jobSettingsButton"[\s\S]*<circle cx="12" cy="12" r="3"/);
  assert.match(workbenchJs, /class="job-salary-cell"/);
  assert.match(workbenchJs, /jobs\.filter\(\(job\) => job\.status !== 'closed'\)/);
  assert.match(workbenchJs, /const closedDifference = Number\(left\.status === 'closed'\) - Number\(right\.status === 'closed'\);[\s\S]*if \(closedDifference\) return closedDifference;/);
  assert.match(workbenchJs, /class="job-closed-divider"[^>]*><span>已结束 · 保留记录<\/span>/);
  assert.match(readProjectFile('src', 'renderer', 'v11-layout.css'), /\.job-position\.job-row-status-closed[\s\S]*background:\s*#fafafa/);
  assert.match(mainJs, /<span>预估年薪<\/span><span>截止日期<\/span><span>状态<\/span>/);
  assert.match(mainJs, /JPG 图片/);
  assert.match(mainJs, /image\.toJPEG\(92\)/);
  assert.match(mainJs, /runJobDeadlineReminders/);
  assert.match(mainJs, /jobApplications:\s*workspace\.jobApplications/);
  assert.match(mainJs, /annualSalaryWan/);
  assert.match(mainJs, /document\.body\.scrollHeight/);
  assert.match(mainJs, /setContentSize\(1400, captureHeight/);
});

test('release verification executes the packaged executable and inspects app.asar', () => {
  const mainJs = readProjectFile('src', 'main.js');
  const smokeJs = readProjectFile('scripts', 'packaged-smoke.js');
  const verifyJs = readProjectFile('scripts', 'verify-package.js');
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
  const mainJs = readProjectFile('src', 'main.js');
  assert.match(mainJs, /async function runNonCriticalStartup/);
  assert.match(mainJs, /createWindow\(\);[\s\S]*runNonCriticalStartup\('系统托盘'/);
  assert.match(mainJs, /runNonCriticalStartup\('自动更新', initializeUpdater\)/);
  assert.match(mainJs, /runNonCriticalStartup\('Focus 运行时', resumeFocusRuntime\)/);
  assert.match(mainJs, /sampler\.on\('error'/);
  assert.match(mainJs, /recoveryProcess\.on\('error'/);
  assert.match(mainJs, /研迹核心启动失败/);
});

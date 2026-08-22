'use strict';

// Electron can outlive the parent shell briefly on Windows. Ignore a closed
// diagnostic pipe so a successful visual smoke test never opens an error box.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (error?.code !== 'EPIPE') throw error;
  });
}

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
app.setPath('userData', path.join(__dirname, '..', 'work', 'smoke-data-1.0.0'));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: Number(process.env.PAPERTRAIL_SMOKE_WIDTH) || 1180,
    height: Number(process.env.PAPERTRAIL_SMOKE_HEIGHT) || 780,
    show: false,
    backgroundColor: '#edf7fc',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#eaf5fb', symbolColor: '#35566b', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'smoke-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 700));
  const captureStablePage = async (output) => {
    window.webContents.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 90));
    await window.webContents.capturePage();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const image = await window.webContents.capturePage();
    fs.writeFileSync(output, image.toPNG());
  };
  if (process.env.PAPERTRAIL_EMPTY_SMOKE === '1') {
    const emptyResult = await window.webContents.executeJavaScript(`
      (() => {
        const refresh = document.getElementById('refreshAllButton');
        const search = document.getElementById('paperSearch');
        const heading = document.querySelector('.section-heading');
        showToast('全部稿件刷新完成。');
        const toastRect = document.getElementById('toast').getBoundingClientRect();
        return {
          emptyTitle: document.querySelector('#emptyState h3').textContent === '暂无稿件',
          addLabel: document.getElementById('emptyAddButton').textContent === '添加稿件',
          refreshDisabled: refresh.disabled,
          refreshNotSpinning: !refresh.classList.contains('spin'),
          refreshLabel: refresh.querySelector('span').textContent === '暂无可刷新',
          refreshHint: refresh.title === '暂无可刷新的稿件',
          refreshCursor: getComputedStyle(refresh).cursor === 'not-allowed',
          searchInsideHeading: heading.contains(search),
          toastCentered: Math.abs((toastRect.left + toastRect.width / 2) - innerWidth / 2) <= 1,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!Object.entries(emptyResult).every(([key, value]) => key === 'horizontalOverflow' ? value === false : value === true)) {
      throw new Error(`Empty dashboard smoke test failed: ${JSON.stringify(emptyResult)}`);
    }
    console.log(`EMPTY_DASHBOARD_SMOKE_OK ${JSON.stringify(emptyResult)}`);
    if (process.env.PAPERTRAIL_EMPTY_OUTPUT) {
      await captureStablePage(process.env.PAPERTRAIL_EMPTY_OUTPUT);
    }
    window.destroy();
    app.quit();
    return;
  }
  if (process.env.PAPERTRAIL_JOURNEY_SMOKE === '1') {
    const journeyResult = await window.webContents.executeJavaScript(`
      (() => {
        const card = document.querySelector('[data-paper-id="demo-paper"]');
        card.querySelector('[data-action="history"]').click();
        const expandedCard = document.querySelector('[data-paper-id="demo-paper"]');
        const rows = expandedCard.querySelectorAll('.submission-journey li');
        const badge = expandedCard.querySelector('.journey-badge');
        const linkButton = expandedCard.querySelector('[data-action="link-journey"]');
        linkButton.click();
        const dialog = document.getElementById('journeyDialog');
        const result = {
          journeyRows: rows.length === 2,
          currentRow: expandedCard.querySelectorAll('.submission-journey li.is-current').length === 1,
          badgeLabel: badge?.textContent === '投稿历程 2 次',
          dialogOpened: dialog.open,
          candidateOptions: document.getElementById('journeyTarget').options.length === 2,
          localOnlyCopy: dialog.textContent.includes('仅关联研迹中的本地记录'),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
        dialog.close();
        return result;
      })()
    `);
    if (!Object.entries(journeyResult).every(([key, value]) => key === 'horizontalOverflow' ? value === false : value === true)) {
      throw new Error(`Journey smoke test failed: ${JSON.stringify(journeyResult)}`);
    }
    console.log(`JOURNEY_SMOKE_OK ${JSON.stringify(journeyResult)}`);
    if (process.env.PAPERTRAIL_JOURNEY_OUTPUT) {
      await captureStablePage(process.env.PAPERTRAIL_JOURNEY_OUTPUT);
    }
    window.destroy();
    app.quit();
    return;
  }
  const dialogResult = await window.webContents.executeJavaScript(`
    (() => {
      const addButton = document.getElementById('addButton');
      const dialog = document.getElementById('addDialog');
      const minimizeRemoved = document.getElementById('hideButton') === null;

      addButton.click();
      const openedForCancel = dialog.open;
      document.getElementById('cancelAddButton').click();
      const closedByCancel = !dialog.open;

      addButton.click();
      const openedForClose = dialog.open;
      document.getElementById('closeAddDialogButton').click();
      const closedByClose = !dialog.open;

      document.getElementById('settingsButton').click();
      const settingsPage = document.getElementById('settingsDialog');
      const settingsPageVisible = !settingsPage.hidden;
      const settingsIsNotDialog = settingsPage.tagName === 'SECTION' && !settingsPage.matches('dialog');
      document.querySelector('[data-workbench-page="home"]').click();

      return { minimizeRemoved, openedForCancel, closedByCancel, openedForClose, closedByClose, settingsPageVisible, settingsIsNotDialog };
    })()
  `);
  if (!Object.values(dialogResult).every(Boolean)) {
    throw new Error(`Dialog close smoke test failed: ${JSON.stringify(dialogResult)}`);
  }
  console.log(`DIALOG_SMOKE_OK ${JSON.stringify(dialogResult)}`);
  const confirmLayoutResult = await window.webContents.executeJavaScript(`
    (async () => {
      const pending = window.yanjiConfirm({ title: '结束本次专注', message: '测试居中布局', confirmText: '结束专注' });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const dialog = document.getElementById('yanjiConfirmDialog').getBoundingClientRect();
      const actions = document.querySelector('#yanjiConfirmDialog .modal-actions').getBoundingClientRect();
      const centered = Math.abs((actions.left + actions.width / 2) - (dialog.left + dialog.width / 2)) <= 2 && getComputedStyle(document.querySelector('#yanjiConfirmDialog .modal-actions')).justifyContent === 'center';
      document.getElementById('yanjiConfirmCancel').click();
      await pending;
      return { centered };
    })()
  `);
  if (!confirmLayoutResult.centered) throw new Error(`Confirm button alignment smoke failed: ${JSON.stringify(confirmLayoutResult)}`);
  console.log(`CONFIRM_LAYOUT_OK ${JSON.stringify(confirmLayoutResult)}`);
  const settingsDraftResult = await window.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('settingsButton').click();
      document.querySelector('[data-settings-section="notifications"]').click();
      const notificationsVisible = !document.querySelector('[data-settings-panel="notifications"]').hidden;
      document.querySelector('[data-settings-section="tracking"]').click();
      const trackingVisible = !document.querySelector('[data-settings-panel="tracking"]').hidden;
      document.querySelector('[data-settings-section="storage"]').click();
      const storageVisible = !document.querySelector('[data-settings-panel="storage"]').hidden;
      const storageSelectedExactly = document.querySelector('.settings-nav-item.active')?.dataset.settingsSection === 'storage'
        && [...document.querySelectorAll('[data-settings-panel]')].filter((panel) => !panel.hidden).length === 1;
      document.querySelector('[data-settings-section="updates"]').click();
      const updatesVisible = !document.querySelector('[data-settings-panel="updates"]').hidden;
      const updateButton = document.getElementById('updateActionButton');
      const updateIdle = updateButton.textContent === '检查更新' && !updateButton.disabled;
      updateButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const updateAvailable = updateButton.textContent === '下载更新'
        && document.getElementById('updateVersionBadge').textContent === 'v1.0.1';
      updateButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const updateDownloaded = updateButton.textContent === '安装并重启'
        && document.getElementById('updateProgress').getAttribute('aria-valuenow') === '100';
      document.querySelector('[data-settings-section="general"]').click();
      const generalVisible = !document.querySelector('[data-settings-panel="general"]').hidden;
      const startAtLogin = document.getElementById('startAtLogin');
      startAtLogin.checked = true;
      document.querySelector('[data-settings-section="storage"]').click();
      document.getElementById('changeDataDirectoryButton').click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const draftPreserved = startAtLogin.checked;
      document.querySelector('[data-workbench-page="home"]').click();
      return { notificationsVisible, trackingVisible, storageVisible, storageSelectedExactly, updatesVisible, updateIdle, updateAvailable, updateDownloaded, generalVisible, draftPreserved };
    })()
  `);
  if (!Object.values(settingsDraftResult).every(Boolean)) {
    throw new Error(`Settings draft smoke test failed: ${JSON.stringify(settingsDraftResult)}`);
  }
  console.log(`SETTINGS_DRAFT_SMOKE_OK ${JSON.stringify(settingsDraftResult)}`);
  const doiCopyResult = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector('[data-action="copy-doi"]');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const toast = document.getElementById('toast');
      const shownAtTop = toast.classList.contains('show') && toast.textContent === 'DOI 链接复制成功';
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const hiddenAfterOneSecond = !toast.classList.contains('show');
      return { shownAtTop, hiddenAfterOneSecond };
    })()
  `);
  if (!Object.values(doiCopyResult).every(Boolean)) {
    throw new Error(`DOI copy smoke test failed: ${JSON.stringify(doiCopyResult)}`);
  }
  console.log(`DOI_COPY_SMOKE_OK ${JSON.stringify(doiCopyResult)}`);
  await window.webContents.executeJavaScript(`
    (() => {
      const toast = document.getElementById('toast');
      toast.style.transition = 'none';
      toast.className = 'toast';
      toast.style.opacity = '0';
    })()
  `);
  const workspaceResult = await window.webContents.executeJavaScript(`
    (() => {
      const cards = () => [...document.querySelectorAll('[data-paper-id]')].filter((card) => !card.hidden);
      document.getElementById('importantNavButton').click();
      const importantOnlyUnread = cards().length === 1 && cards()[0].dataset.paperId === 'demo-paper';
      document.getElementById('archivedNavButton').click();
      const archiveOnlyArchived = cards().length === 1 && cards()[0].dataset.paperId === 'demo-archived-paper';
      const search = document.getElementById('paperSearch');
      search.value = 'WATRES_20416';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const productionReferenceSearch = cards().length === 1 && cards()[0].dataset.paperId === 'demo-archived-paper';
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('allNavButton').click();
      const activeExcludesArchived = cards().length === 2 && !cards().some((card) => card.dataset.paperId === 'demo-archived-paper');
      return { importantOnlyUnread, archiveOnlyArchived, productionReferenceSearch, activeExcludesArchived };
    })()
  `);
  if (!Object.values(workspaceResult).every(Boolean)) {
    throw new Error(`Workspace view smoke test failed: ${JSON.stringify(workspaceResult)}`);
  }
  console.log(`WORKSPACE_VIEW_SMOKE_OK ${JSON.stringify(workspaceResult)}`);
  if (process.env.PAPERTRAIL_MODAL_OUTPUT) {
    await window.webContents.executeJavaScript(`
      document.getElementById('addButton').click();
      document.getElementById('addModeAuthor').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 240));
    const addDialogVisual = await window.webContents.executeJavaScript(`
      (() => {
        const dialog = document.getElementById('addDialog');
        const style = getComputedStyle(dialog);
        return { open: dialog.open, className: dialog.className, opacity: style.opacity, transform: style.transform };
      })()
    `);
    if (!addDialogVisual.open || Number(addDialogVisual.opacity) < 0.99) {
      throw new Error(`Add dialog visual state failed: ${JSON.stringify(addDialogVisual)}`);
    }
    console.log(`ADD_DIALOG_VISUAL_OK ${JSON.stringify(addDialogVisual)}`);
    await captureStablePage(process.env.PAPERTRAIL_MODAL_OUTPUT);
    await window.webContents.executeJavaScript(`document.getElementById('addDialog').close()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (process.env.PAPERTRAIL_SETTINGS_OUTPUT) {
    await window.webContents.executeJavaScript(`document.getElementById('settingsButton').click()`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    const settingsPageVisual = await window.webContents.executeJavaScript(`
      (() => {
        const page = document.getElementById('settingsDialog');
        const rect = page.getBoundingClientRect();
        const nav = page.querySelector('.settings-nav').getBoundingClientRect();
        const active = page.querySelector('.settings-nav-item.active');
        const firstPanel = page.querySelector('[data-settings-panel="general"]').getBoundingClientRect();
        const scroller = page.querySelector('.settings-scroll').getBoundingClientRect();
        return { visible: !page.hidden, tagName: page.tagName, left: rect.left, top: rect.top, navWide: nav.width > nav.height * 4, activeSection: active?.dataset.settingsSection, startsAtGeneral: firstPanel.top >= scroller.top && firstPanel.top - scroller.top < 40, panelOffset: Math.round(firstPanel.top - scroller.top), scrollTop: Math.round(page.querySelector('.settings-scroll').scrollTop), horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
      })()
    `);
    if (!settingsPageVisual.visible || settingsPageVisual.tagName !== 'SECTION' || settingsPageVisual.left < 170 || settingsPageVisual.top < 36 || !settingsPageVisual.navWide || settingsPageVisual.activeSection !== 'general' || !settingsPageVisual.startsAtGeneral || settingsPageVisual.horizontalOverflow) {
      throw new Error(`Settings page visual state failed: ${JSON.stringify(settingsPageVisual)}`);
    }
    console.log(`SETTINGS_PAGE_VISUAL_OK ${JSON.stringify(settingsPageVisual)}`);
    await captureStablePage(process.env.PAPERTRAIL_SETTINGS_OUTPUT);
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="home"]').click()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (process.env.PAPERTRAIL_UPDATE_OUTPUT) {
    await window.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.querySelector('[data-settings-section="updates"]').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 240));
    const updateDialogVisual = await window.webContents.executeJavaScript(`
      (() => ({
        visible: !document.getElementById('settingsDialog').hidden,
        updatesVisible: !document.querySelector('[data-settings-panel="updates"]').hidden,
        updateButton: document.getElementById('updateActionButton').textContent,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth
      }))()
    `);
    if (!updateDialogVisual.visible || !updateDialogVisual.updatesVisible || updateDialogVisual.horizontalOverflow) {
      throw new Error(`Update settings visual state failed: ${JSON.stringify(updateDialogVisual)}`);
    }
    console.log(`UPDATE_SETTINGS_VISUAL_OK ${JSON.stringify(updateDialogVisual)}`);
    await captureStablePage(process.env.PAPERTRAIL_UPDATE_OUTPUT);
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="home"]').click()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (process.env.PAPERTRAIL_SMOKE_OUTPUT) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="submissions"]').click(); document.getElementById('allNavButton').click(); window.scrollTo(0, 0)`);
    await captureStablePage(process.env.PAPERTRAIL_SMOKE_OUTPUT);
  }
  if (process.env.PAPERTRAIL_IMPORTANT_OUTPUT) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="submissions"]').click(); document.getElementById('importantNavButton').click(); window.scrollTo(0, 0)`);
    const importantLayout = await window.webContents.executeJavaScript(`
      (() => {
        const rect = (element) => {
          const value = element.getBoundingClientRect();
          return { left: Math.round(value.left), width: Math.round(value.width) };
        };
        return {
          viewport: innerWidth,
          workspace: rect(document.querySelector('.workspace')),
          stats: rect(document.querySelector('.stats')),
          articles: [...document.querySelectorAll('.stats article')].map(rect),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (importantLayout.horizontalOverflow || importantLayout.articles.some((article) => article.left < importantLayout.workspace.left)) {
      throw new Error(`Important layout overflow: ${JSON.stringify(importantLayout)}`);
    }
    console.log(`IMPORTANT_LAYOUT_OK ${JSON.stringify(importantLayout)}`);
    await captureStablePage(process.env.PAPERTRAIL_IMPORTANT_OUTPUT);
  }
  if (process.env.PAPERTRAIL_ARCHIVED_OUTPUT) {
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="submissions"]').click(); document.getElementById('archivedNavButton').click(); window.scrollTo(0, 0)`);
    await captureStablePage(process.env.PAPERTRAIL_ARCHIVED_OUTPUT);
  }
  if (process.env.PAPERTRAIL_TIMELINE_OUTPUT) {
    await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-workbench-page="submissions"]').click();
        document.getElementById('allNavButton').click();
        const card = document.querySelector('[data-paper-id="demo-production-paper"]');
        card.querySelector('[data-action="history"]').click();
        document.querySelector('[data-paper-id="demo-production-paper"]').scrollIntoView({ block: 'start' });
        window.scrollBy(0, -55);
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await captureStablePage(process.env.PAPERTRAIL_TIMELINE_OUTPUT);
  }
  if (process.env.PAPERTRAIL_NARROW_OUTPUT) {
    window.setSize(800, 600);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await window.webContents.executeJavaScript(`
      document.getElementById('allNavButton').click();
      const expanded = document.querySelector('.history-panel:not([hidden])');
      if (expanded) expanded.closest('[data-paper-id]').querySelector('[data-action="history"]').click();
      window.scrollTo(0, 0);
    `);
    await captureStablePage(process.env.PAPERTRAIL_NARROW_OUTPUT);
    window.setSize(Number(process.env.PAPERTRAIL_SMOKE_WIDTH) || 1180, Number(process.env.PAPERTRAIL_SMOKE_HEIGHT) || 780);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  if (process.env.WORKBENCH_SCHEDULE_OUTPUT) {
    const scheduleResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="schedule"]').click();
        window.scrollTo(0, 0);
        const localKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
        const today = new Date();
        const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
        const fourDaysLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4);
        const boardDates = [...document.querySelectorAll('#scheduleBoard .schedule-board-column')].map((column) => column.dataset.boardDate);
        const shellRect = document.querySelector('.schedule-board-shell').getBoundingClientRect();
        const cards = [...document.querySelectorAll('#scheduleBoard .schedule-board-card')];
        const intersectsBoard = cards.some((card) => {
          const rect = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
            && rect.width > 0 && rect.height > 0 && rect.right > shellRect.left && rect.left < shellRect.right;
        });
        document.getElementById('addScheduleButton').click();
        const scheduleDialog = document.getElementById('scheduleDialog');
        const draftTitle = document.getElementById('scheduleTitle');
        draftTitle.value = '后天上午十点整理草稿';
        document.getElementById('closeScheduleButton').click();
        const closePreserved = !scheduleDialog.open
          && JSON.parse(localStorage.getItem('yanji.scheduleDraft.v1')).title === '后天上午十点整理草稿'
          && !document.body.dataset.savedScheduleCount;
        document.getElementById('addScheduleButton').click();
        const closeRestored = document.getElementById('scheduleTitle').value === '后天上午十点整理草稿';
        document.getElementById('scheduleTitle').value = '遮罩关闭的草稿';
        scheduleDialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const backdropPreserved = !scheduleDialog.open
          && JSON.parse(localStorage.getItem('yanji.scheduleDraft.v1')).title === '遮罩关闭的草稿';
        document.getElementById('addScheduleButton').click();
        const backdropRestored = document.getElementById('scheduleTitle').value === '遮罩关闭的草稿';
        document.getElementById('cancelScheduleButton').click();
        const cancelDiscarded = !scheduleDialog.open && !localStorage.getItem('yanji.scheduleDraft.v1');
        document.getElementById('addScheduleButton').click();
        const scheduleTitle = document.getElementById('scheduleTitle');
        scheduleTitle.value = '明天上午八点去采样，下午五点去洗澡';
        scheduleTitle.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 360));
        const multiPreview = document.getElementById('scheduleRecognition').textContent.includes('将创建 2 条日程');
        const modalScrollbarHidden = getComputedStyle(document.getElementById('scheduleDialog')).getPropertyValue('scrollbar-width') === 'none';
        document.getElementById('saveScheduleButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          pageVisible: !document.querySelector('[data-page="schedule"]').hidden,
          dayColumns: document.querySelectorAll('#scheduleBoard .schedule-board-column').length,
          centeredSevenDays: boardDates[0] === localKey(twoDaysAgo) && boardDates[2] === localKey(today) && boardDates[6] === localKey(fourDaysLater),
          scheduleCards: cards.length,
          intersectsBoard,
          closePreserved,
          closeRestored,
          backdropPreserved,
          backdropRestored,
          cancelDiscarded,
          multiPreview,
          multiSaved: document.body.dataset.savedScheduleCount === '2',
          draftClearedAfterSave: !localStorage.getItem('yanji.scheduleDraft.v1'),
          modalScrollbarHidden,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!scheduleResult.pageVisible || scheduleResult.dayColumns !== 7 || !scheduleResult.centeredSevenDays || scheduleResult.scheduleCards < 2 || !scheduleResult.intersectsBoard || !scheduleResult.closePreserved || !scheduleResult.closeRestored || !scheduleResult.backdropPreserved || !scheduleResult.backdropRestored || !scheduleResult.cancelDiscarded || !scheduleResult.multiPreview || !scheduleResult.multiSaved || !scheduleResult.draftClearedAfterSave || !scheduleResult.modalScrollbarHidden || scheduleResult.horizontalOverflow) {
      throw new Error(`Workbench schedule smoke failed: ${JSON.stringify(scheduleResult)}`);
    }
    console.log(`WORKBENCH_SCHEDULE_OK ${JSON.stringify(scheduleResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_SCHEDULE_OUTPUT);
  }
  if (process.env.WORKBENCH_HOME_OUTPUT) {
    const homeResult = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-workbench-page="home"]').click();
        window.scrollTo(0, 0);
        const schedule = document.querySelector('.home-schedule-panel').getBoundingClientRect();
        const notes = document.querySelector('.latest-notes-panel').getBoundingClientRect();
        return {
          pageVisible: !document.querySelector('[data-page="home"]').hidden,
          focusFirst: Boolean(document.querySelector('.home-top-grid #todayFocusList')),
          focusTimerHome: Boolean(document.querySelector('.home-focus-timer #focusTimeRemaining')),
          clockInsideFocus: Boolean(document.querySelector('.home-focus-timer #homeClockButton')),
          clockOnly: !document.querySelector('.home-attendance-panel')
            && !document.getElementById('homeAttendanceStatus')
            && document.getElementById('homeClockButton')?.textContent === '上班打卡',
          quickNote: Boolean(document.getElementById('quickNoteButton')),
          fourDayCards: document.querySelectorAll('#homeDayOverview .day-card').length,
          notesRight: notes.left > schedule.left,
          aligned: Math.abs(notes.top - schedule.top) <= 1,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!Object.entries(homeResult).every(([key, value]) => key === 'fourDayCards' ? value === 4 : key === 'horizontalOverflow' ? value === false : value === true)) {
      throw new Error(`Workbench home smoke failed: ${JSON.stringify(homeResult)}`);
    }
    console.log(`WORKBENCH_HOME_OK ${JSON.stringify(homeResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await captureStablePage(process.env.WORKBENCH_HOME_OUTPUT);
  }
  if (process.env.WORKBENCH_ATTENDANCE_OUTPUT) {
    const attendanceResult = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-workbench-page="attendance"]').click();
        window.scrollTo(0, 0);
        return {
          pageVisible: !document.querySelector('[data-page="attendance"]').hidden,
          ganttRows: document.querySelectorAll('#attendanceGanttRows .attendance-gantt-row').length,
          ganttBars: document.querySelectorAll('#attendanceGanttRows .attendance-bar').length,
          appRows: document.querySelectorAll('#focusUsageList .focus-usage-row').length,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!attendanceResult.pageVisible || attendanceResult.ganttRows !== 7 || attendanceResult.ganttBars < 2 || attendanceResult.appRows < 1 || attendanceResult.horizontalOverflow) {
      throw new Error(`Workbench attendance smoke failed: ${JSON.stringify(attendanceResult)}`);
    }
    console.log(`WORKBENCH_ATTENDANCE_OK ${JSON.stringify(attendanceResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await captureStablePage(process.env.WORKBENCH_ATTENDANCE_OUTPUT);
  }
  if (process.env.WORKBENCH_NOTES_OUTPUT) {
    const notesResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="notes"]').click();
        window.scrollTo(0, 0);
        document.getElementById('manageMetadataButton').click();
        const metadataRow = document.querySelector('.metadata-field-row');
        const initialOptions = metadataRow.querySelectorAll('[data-option-chips] span').length;
        metadataRow.querySelector('[data-option-draft]').value = '方法 A';
        metadataRow.querySelector('[data-add-option]').click();
        metadataRow.querySelector('[data-option-draft]').value = '方法 B';
        metadataRow.querySelector('[data-option-draft]').dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
        const multiOptions = metadataRow.querySelectorAll('[data-option-chips] span').length === initialOptions + 2;
        document.querySelector('[data-close-dialog="metadataDialog"]').click();
        document.getElementById('quickNoteButton').click();
        const noteOpened = document.getElementById('noteDialog').open;
        document.getElementById('noteDialog').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const noteBackdropClosed = !document.getElementById('noteDialog').open;
        document.querySelector('#notesGrid .note-card').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
        const rightClickConfirmation = document.getElementById('yanjiConfirmDialog').open;
        document.getElementById('yanjiConfirmAccept').click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          pageVisible: !document.querySelector('[data-page="notes"]').hidden,
          noteCards: document.querySelectorAll('#notesGrid .note-card').length,
          metadataButton: Boolean(document.getElementById('manageMetadataButton')),
          multiOptions,
          noteOpened,
          noteBackdropClosed,
          rightClickConfirmation,
          rightClickDeleted: document.body.dataset.deletedNoteCount === '1',
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!notesResult.pageVisible || notesResult.noteCards < 1 || !notesResult.metadataButton || !notesResult.multiOptions || !notesResult.noteOpened || !notesResult.noteBackdropClosed || !notesResult.rightClickConfirmation || !notesResult.rightClickDeleted || notesResult.horizontalOverflow) {
      throw new Error(`Workbench notes smoke failed: ${JSON.stringify(notesResult)}`);
    }
    console.log(`WORKBENCH_NOTES_OK ${JSON.stringify(notesResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_NOTES_OUTPUT);
  }
  if (process.env.WORKBENCH_CAPTURE_OUTPUT) {
    window.setSize(720, 290);
    await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'capture.html'));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const captureResult = await window.webContents.executeJavaScript(`
      (async () => {
        const editor = document.getElementById('captureEditor');
        editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'liu' }));
        editor.value = 'liu';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'liu', isComposing: true }));
        editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', isComposing: true }));
        const compositionPreserved = editor.value === 'liu' && document.body.dataset.hideRequested !== 'true';
        editor.value = '明天下午 3 点到 5 点组会 #1';
        editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '明天' }));
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 180));
        const priorityRendered = document.getElementById('parseResult').textContent.includes('最高优先级');
        const highlighted = document.querySelectorAll('#captureHighlights mark').length >= 2;
        editor.value = '';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        window.dispatchEvent(new Event('blur'));
        await new Promise((resolve) => setTimeout(resolve, 20));
        const emptyBlurClosed = document.body.dataset.hideRequested === 'true';
        editor.value = '明天下午 3 点到 5 点组会 #1';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 180));
        return { compositionPreserved, priorityRendered, highlighted, emptyBlurClosed };
      })()
    `);
    if (!Object.values(captureResult).every(Boolean)) throw new Error(`Workbench capture smoke failed: ${JSON.stringify(captureResult)}`);
    console.log(`WORKBENCH_CAPTURE_OK ${JSON.stringify(captureResult)}`);
    await captureStablePage(process.env.WORKBENCH_CAPTURE_OUTPUT);
  }
  if (process.env.WORKBENCH_SCHEDULE_WIDGET_OUTPUT) {
    window.setSize(360, 480);
    await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'schedule-widget.html'));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const widgetResult = await window.webContents.executeJavaScript(`
      (() => {
        const close = document.getElementById('closeWidgetButton').getBoundingClientRect();
        const footer = document.querySelector('footer').getBoundingClientRect();
        const list = document.getElementById('widgetScheduleList').getBoundingClientRect();
        return {
          threeByFour: Math.abs((innerWidth / innerHeight) - 0.75) < 0.03,
          scheduleCards: document.querySelectorAll('#widgetScheduleList .widget-item').length,
          dateLoaded: Boolean(document.getElementById('dateDay').textContent),
          progressLoaded: document.getElementById('widgetProgress').textContent.includes(' / '),
          closeButtonNamed: document.getElementById('closeWidgetButton').getAttribute('aria-label') === '从桌面移除当日日程',
          contentFits: close.right <= innerWidth && footer.bottom <= innerHeight && list.right <= innerWidth && list.bottom <= footer.top,
          transparentRoot: getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)',
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!widgetResult.threeByFour || widgetResult.scheduleCards < 2 || !widgetResult.dateLoaded || !widgetResult.progressLoaded || !widgetResult.closeButtonNamed || !widgetResult.contentFits || !widgetResult.transparentRoot || widgetResult.horizontalOverflow) {
      throw new Error(`Workbench schedule widget smoke failed: ${JSON.stringify(widgetResult)}`);
    }
    console.log(`WORKBENCH_SCHEDULE_WIDGET_OK ${JSON.stringify(widgetResult)}`);
    await captureStablePage(process.env.WORKBENCH_SCHEDULE_WIDGET_OUTPUT);
  }
  if (process.env.WORKBENCH_STICKY_OUTPUT) {
    window.setSize(380, 440);
    await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'sticky.html'), { query: { id: 'note-1' } });
    await new Promise((resolve) => setTimeout(resolve, 160));
    const stickyResult = await window.webContents.executeJavaScript(`
      (() => ({
        titleLoaded: document.getElementById('noteTitle').value === 'PFAS 方法学想法',
        contentLoaded: document.getElementById('noteContent').value.includes('回收率与基质效应'),
        closeButtonNamed: document.getElementById('closeButton').getAttribute('aria-label') === '关闭便笺',
        paleBlue: getComputedStyle(document.body).backgroundColor === 'rgb(245, 251, 255)'
      }))()
    `);
    if (!Object.values(stickyResult).every(Boolean)) throw new Error(`Workbench sticky smoke failed: ${JSON.stringify(stickyResult)}`);
    console.log(`WORKBENCH_STICKY_OK ${JSON.stringify(stickyResult)}`);
    await captureStablePage(process.env.WORKBENCH_STICKY_OUTPUT);
  }
  if (!process.env.PAPERTRAIL_SMOKE_OUTPUT) {
    window.webContents.invalidate();
    await window.webContents.capturePage();
  }
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(`SMOKE_FAILED ${error?.stack || error}`);
  app.exit(1);
});

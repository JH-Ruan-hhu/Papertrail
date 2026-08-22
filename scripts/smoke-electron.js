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
app.setPath('userData', path.join(__dirname, '..', 'work', 'smoke-data-0.5.2'));

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: Number(process.env.PAPERTRAIL_SMOKE_WIDTH) || 1180,
    height: Number(process.env.PAPERTRAIL_SMOKE_HEIGHT) || 780,
    show: false,
    backgroundColor: '#f3f6fb',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f2f5f9', symbolColor: '#526071', height: 42 },
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
          localOnlyCopy: dialog.textContent.includes('仅关联 PaperTrail 本地记录'),
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
      const settingsDialog = document.getElementById('settingsDialog');
      const settingsOpened = settingsDialog.open;
      settingsDialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));
      const settingsClosedByBackdrop = !settingsDialog.open;

      return { minimizeRemoved, openedForCancel, closedByCancel, openedForClose, closedByClose, settingsOpened, settingsClosedByBackdrop };
    })()
  `);
  if (!Object.values(dialogResult).every(Boolean)) {
    throw new Error(`Dialog close smoke test failed: ${JSON.stringify(dialogResult)}`);
  }
  console.log(`DIALOG_SMOKE_OK ${JSON.stringify(dialogResult)}`);
  const settingsDraftResult = await window.webContents.executeJavaScript(`
    (async () => {
      document.getElementById('settingsButton').click();
      document.querySelector('[data-settings-section="notifications"]').click();
      const notificationsVisible = !document.querySelector('[data-settings-panel="notifications"]').hidden;
      document.querySelector('[data-settings-section="storage"]').click();
      const storageVisible = !document.querySelector('[data-settings-panel="storage"]').hidden;
      document.querySelector('[data-settings-section="about"]').click();
      const aboutVisible = !document.querySelector('[data-settings-panel="about"]').hidden;
      const updateButton = document.getElementById('updateActionButton');
      const updateIdle = updateButton.textContent === '检查更新' && !updateButton.disabled;
      updateButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const updateAvailable = updateButton.textContent === '下载更新'
        && document.getElementById('updateVersionBadge').textContent === 'v0.5.3';
      updateButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const updateDownloaded = updateButton.textContent === '安装并重启'
        && document.getElementById('updateProgress').getAttribute('aria-valuenow') === '100';
      document.querySelector('[data-settings-section="general"]').click();
      const generalVisible = !document.querySelector('[data-settings-panel="general"]').hidden;
      const startAtLogin = document.getElementById('startAtLogin');
      startAtLogin.checked = true;
      document.getElementById('changeDataDirectoryButton').click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const draftPreserved = startAtLogin.checked;
      document.getElementById('settingsDialog').close();
      return { notificationsVisible, storageVisible, aboutVisible, updateIdle, updateAvailable, updateDownloaded, generalVisible, draftPreserved };
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
    const settingsDialogVisual = await window.webContents.executeJavaScript(`
      (() => {
        const dialog = document.getElementById('settingsDialog');
        const style = getComputedStyle(dialog);
        return { open: dialog.open, className: dialog.className, opacity: style.opacity, transform: style.transform };
      })()
    `);
    if (!settingsDialogVisual.open || Number(settingsDialogVisual.opacity) < 0.99) {
      throw new Error(`Settings dialog visual state failed: ${JSON.stringify(settingsDialogVisual)}`);
    }
    console.log(`SETTINGS_DIALOG_VISUAL_OK ${JSON.stringify(settingsDialogVisual)}`);
    await captureStablePage(process.env.PAPERTRAIL_SETTINGS_OUTPUT);
    await window.webContents.executeJavaScript(`document.getElementById('settingsDialog').close()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (process.env.PAPERTRAIL_UPDATE_OUTPUT) {
    await window.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.querySelector('[data-settings-section="about"]').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 240));
    const updateDialogVisual = await window.webContents.executeJavaScript(`
      (() => ({
        open: document.getElementById('settingsDialog').open,
        aboutVisible: !document.querySelector('[data-settings-panel="about"]').hidden,
        updateButton: document.getElementById('updateActionButton').textContent,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth
      }))()
    `);
    if (!updateDialogVisual.open || !updateDialogVisual.aboutVisible || updateDialogVisual.horizontalOverflow) {
      throw new Error(`Update settings visual state failed: ${JSON.stringify(updateDialogVisual)}`);
    }
    console.log(`UPDATE_SETTINGS_VISUAL_OK ${JSON.stringify(updateDialogVisual)}`);
    await captureStablePage(process.env.PAPERTRAIL_UPDATE_OUTPUT);
    await window.webContents.executeJavaScript(`document.getElementById('settingsDialog').close()`);
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (process.env.PAPERTRAIL_SMOKE_OUTPUT) {
    await window.webContents.executeJavaScript(`document.getElementById('allNavButton').click(); window.scrollTo(0, 0)`);
    await captureStablePage(process.env.PAPERTRAIL_SMOKE_OUTPUT);
  }
  if (process.env.PAPERTRAIL_IMPORTANT_OUTPUT) {
    await window.webContents.executeJavaScript(`document.getElementById('importantNavButton').click(); window.scrollTo(0, 0)`);
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
    await window.webContents.executeJavaScript(`document.getElementById('archivedNavButton').click(); window.scrollTo(0, 0)`);
    await captureStablePage(process.env.PAPERTRAIL_ARCHIVED_OUTPUT);
  }
  if (process.env.PAPERTRAIL_TIMELINE_OUTPUT) {
    await window.webContents.executeJavaScript(`
      (() => {
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
  }
  if (process.env.WORKBENCH_SCHEDULE_OUTPUT) {
    const scheduleResult = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-workbench-page="schedule"]').click();
        window.scrollTo(0, 0);
        return {
          pageVisible: !document.querySelector('[data-page="schedule"]').hidden,
          hourLabels: document.querySelectorAll('#timelineHours span').length,
          timelineEvents: document.querySelectorAll('#timelineTrack .timeline-event').length,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!scheduleResult.pageVisible || scheduleResult.hourLabels !== 24 || scheduleResult.timelineEvents < 2 || scheduleResult.horizontalOverflow) {
      throw new Error(`Workbench schedule smoke failed: ${JSON.stringify(scheduleResult)}`);
    }
    console.log(`WORKBENCH_SCHEDULE_OK ${JSON.stringify(scheduleResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_SCHEDULE_OUTPUT);
  }
  if (process.env.WORKBENCH_NOTES_OUTPUT) {
    const notesResult = await window.webContents.executeJavaScript(`
      (() => {
        document.querySelector('[data-workbench-page="notes"]').click();
        window.scrollTo(0, 0);
        return {
          pageVisible: !document.querySelector('[data-page="notes"]').hidden,
          noteCards: document.querySelectorAll('#notesGrid .note-card').length,
          metadataButton: Boolean(document.getElementById('manageMetadataButton')),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!notesResult.pageVisible || notesResult.noteCards < 1 || !notesResult.metadataButton || notesResult.horizontalOverflow) {
      throw new Error(`Workbench notes smoke failed: ${JSON.stringify(notesResult)}`);
    }
    console.log(`WORKBENCH_NOTES_OK ${JSON.stringify(notesResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_NOTES_OUTPUT);
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

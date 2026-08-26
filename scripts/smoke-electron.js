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

function exitSmoke(code) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  app.exit(code);
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
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
      sandbox: false
    }
  });
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(`DID_FAIL_LOAD ${JSON.stringify({ errorCode, errorDescription, validatedURL, isMainFrame })}`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`RENDERER_GONE ${JSON.stringify(details)}`);
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), { query: { dailyPrompt: process.env.WORKBENCH_DAILY_OUTPUT ? 'force' : '0' } });
  await window.webContents.executeJavaScript(`document.documentElement.dataset.appearance = ${JSON.stringify(process.env.PAPERTRAIL_SMOKE_APPEARANCE || 'liquid-glass')}`);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const captureStablePage = async (output) => {
    const wasVisible = window.isVisible();
    if (!wasVisible) window.showInactive();
    try {
      window.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 140));
      await window.webContents.capturePage();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const image = await window.webContents.capturePage();
      fs.writeFileSync(output, image.toPNG());
    } finally {
      if (!wasVisible && !window.isDestroyed()) window.hide();
    }
  };
  if (process.env.WORKBENCH_DAILY_OUTPUT) {
    window.show();
    window.focus();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const dailyResult = await window.webContents.executeJavaScript(`
      (() => {
        const dialog = document.getElementById('dailyPlanDialog');
        if (!dialog.open) dialog.showModal();
        return {
          promptVisible: dialog.open,
          primaryAction: document.getElementById('createDailyTodoButton').textContent.length > 0,
          secondaryAction: document.getElementById('dismissDailyPlanButton').textContent.length > 0
        };
      })()
    `);
    if (!Object.values(dailyResult).every(Boolean)) throw new Error(`Daily planning smoke failed: ${JSON.stringify(dailyResult)}`);
    console.log(`WORKBENCH_DAILY_OK ${JSON.stringify(dailyResult)}`);
    await captureStablePage(process.env.WORKBENCH_DAILY_OUTPUT);
    window.destroy();
    app.quit();
    return;
  }
  if (process.env.WORKBENCH_HOME_FAST_OUTPUT) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('#homeTodayTodoList [data-home-todo-action="complete"]'))`);
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const homeInteraction = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="home"]').click();
        const checkbox = document.querySelector('#homeTodayTodoList [data-home-todo-action="complete"]');
        checkbox?.click();
        await new Promise((resolve) => setTimeout(resolve, 90));
        const completed = document.querySelector('#homeTodayTodoList .home-todo-row.is-completed');
        const titleStyle = completed ? getComputedStyle(completed.querySelector('.home-todo-title strong')) : null;
        const progressBottom = document.getElementById('homeTodoProgress').getBoundingClientRect().bottom;
        const clockBottom = document.getElementById('homeClockButton').getBoundingClientRect().bottom;
        const cardBottoms = [...document.querySelectorAll('.home-command-grid > article')].map((card) => Math.round(card.getBoundingClientRect().bottom));
        return {
          completedVisible: Boolean(completed),
          strikeThrough: Boolean(titleStyle?.textDecorationLine.includes('line-through')),
          textFaded: Number(titleStyle?.opacity) < 1,
          progressBottomAligned: Math.abs(progressBottom - clockBottom) <= 12,
          cardsBottomAligned: new Set(cardBottoms).size === 1,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!Object.entries(homeInteraction).every(([key, value]) => key === 'horizontalOverflow' ? value === false : value === true)) throw new Error(`Home interaction smoke failed: ${JSON.stringify(homeInteraction)}`);
    console.log(`WORKBENCH_HOME_INTERACTION_OK ${JSON.stringify(homeInteraction)}`);
    await captureStablePage(process.env.WORKBENCH_HOME_FAST_OUTPUT);
    window.destroy();
    app.quit();
    return;
  }
  if (process.env.WORKBENCH_NOTE_MODAL_OUTPUT) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('#notesGrid .note-card'))`);
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const draftResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="notes"]').click();
        const card = document.querySelector('#notesGrid .note-card');
        const originalCardText = card.querySelector('p').textContent;
        card.click();
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>这是尚未保存的弹窗草稿</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '草稿' }));
        const dialog = document.getElementById('noteDialog');
        await new Promise((resolve) => setTimeout(resolve, 300));
        const rect = dialog.getBoundingClientRect();
        return {
          originalCardText,
          draftDoesNotLeak: card.querySelector('p').textContent === originalCardText,
          hintShowsUnsaved: document.getElementById('noteSaveHint').textContent.includes('未保存'),
          widerEditor: rect.width >= 860,
          tallerEditor: rect.height >= 700,
          centered: Math.abs((rect.left + rect.width / 2) - innerWidth / 2) <= 2 && Math.abs((rect.top + rect.height / 2) - innerHeight / 2) <= 2,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, innerWidth, innerHeight }
        };
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await captureStablePage(process.env.WORKBENCH_NOTE_MODAL_OUTPUT);
    const savedResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.getElementById('saveNoteButton').click();
        await new Promise((resolve) => setTimeout(resolve, 120));
        return {
          closedAfterSave: !document.getElementById('noteDialog').open,
          cardUpdatedAfterSave: document.querySelector('#notesGrid .note-card p')?.textContent.includes('尚未保存的弹窗草稿')
        };
      })()
    `);
    const noteModalResult = { ...draftResult, ...savedResult };
    if (!noteModalResult.draftDoesNotLeak || !noteModalResult.hintShowsUnsaved || !noteModalResult.widerEditor || !noteModalResult.tallerEditor || !noteModalResult.centered || !noteModalResult.closedAfterSave || !noteModalResult.cardUpdatedAfterSave) throw new Error(`Note modal smoke failed: ${JSON.stringify(noteModalResult)}`);
    console.log(`WORKBENCH_NOTE_MODAL_OK ${JSON.stringify(noteModalResult)}`);
    window.destroy();
    app.quit();
    return;
  }
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
      const reminderMaster = document.getElementById('notifications');
      reminderMaster.checked = false;
      reminderMaster.dispatchEvent(new Event('change', { bubbles: true }));
      const reminderDependents = [...document.querySelectorAll('[data-reminder-dependent] input, [data-reminder-dependent] select')];
      const remindersClosedTogether = reminderDependents.every((control) => control.disabled)
        && !document.getElementById('eventNotifications').checked
        && !document.getElementById('todoNotifications').checked;
      reminderMaster.checked = true;
      reminderMaster.dispatchEvent(new Event('change', { bubbles: true }));
      const remindersStayOffWhenReenabled = reminderDependents.every((control) => !control.disabled)
        && !document.getElementById('eventNotifications').checked
        && !document.getElementById('todoNotifications').checked;
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
      state.updateStatus = await window.paperTrail.checkForUpdates();
      renderUpdateStatus();
      const updateAvailable = updateButton.textContent === '下载更新'
        && document.getElementById('updateVersionBadge').textContent === 'v1.3.1';
      state.updateStatus = await window.paperTrail.downloadUpdate();
      renderUpdateStatus();
      const updateDownloaded = updateButton.textContent === '安装并重启'
        && document.getElementById('updateProgress').getAttribute('aria-valuenow') === '100';
      document.querySelector('[data-settings-section="general"]').click();
      const generalVisible = !document.querySelector('[data-settings-panel="general"]').hidden;
      const todayOverviewSwitchVisible = document.getElementById('todayWidgetEnabled').getBoundingClientRect().height > 0;
      const widgetMaster = document.getElementById('todayWidgetEnabled');
      widgetMaster.checked = false;
      widgetMaster.dispatchEvent(new Event('change', { bubbles: true }));
      const widgetChildrenDisabled = [...document.querySelectorAll('[data-widget-dependent] input')].every((control) => control.disabled);
      const startAtLogin = document.getElementById('startAtLogin');
      startAtLogin.checked = true;
      document.querySelector('[data-settings-section="storage"]').click();
      document.getElementById('changeDataDirectoryButton').click();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const draftPreserved = startAtLogin.checked;
      document.querySelector('[data-workbench-page="home"]').click();
      return { notificationsVisible, remindersClosedTogether, remindersStayOffWhenReenabled, trackingVisible, storageVisible, storageSelectedExactly, updatesVisible, updateIdle, updateAvailable, updateDownloaded, updateButtonText: updateButton.textContent, updateBadge: document.getElementById('updateVersionBadge').textContent, updateError: document.getElementById('settingsError').textContent, generalVisible, todayOverviewSwitchVisible, widgetChildrenDisabled, draftPreserved };
    })()
  `);
  if (!settingsDraftResult.notificationsVisible || !settingsDraftResult.remindersClosedTogether || !settingsDraftResult.remindersStayOffWhenReenabled || !settingsDraftResult.trackingVisible || !settingsDraftResult.storageVisible || !settingsDraftResult.storageSelectedExactly || !settingsDraftResult.updatesVisible || !settingsDraftResult.updateIdle || !settingsDraftResult.updateAvailable || !settingsDraftResult.updateDownloaded || !settingsDraftResult.generalVisible || !settingsDraftResult.todayOverviewSwitchVisible || !settingsDraftResult.widgetChildrenDisabled || !settingsDraftResult.draftPreserved) {
    throw new Error(`Settings draft smoke test failed: ${JSON.stringify(settingsDraftResult)}`);
  }
  console.log(`SETTINGS_DRAFT_SMOKE_OK ${JSON.stringify(settingsDraftResult)}`);
  if (process.env.WORKBENCH_SETTINGS_OUTPUT) {
    await window.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.querySelector('[data-settings-section="general"]').click();
    `);
    await captureStablePage(process.env.WORKBENCH_SETTINGS_OUTPUT);
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="home"]').click()`);
  }
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
    await new Promise((resolve) => setTimeout(resolve, 160));
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
        const fiveDaysLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
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
      scheduleDialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
        const allDayInputRect = document.getElementById('scheduleAllDayInput').getBoundingClientRect();
        const allDayRowRect = document.querySelector('.schedule-all-day-row').getBoundingClientRect();
        const allDayCompact = allDayInputRect.width <= 20 && allDayInputRect.height <= 20 && allDayRowRect.height <= 48;
        document.getElementById('saveScheduleButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const result = {
          pageVisible: !document.querySelector('[data-page="schedule"]').hidden,
          todayPanelRemoved: !document.querySelector('.schedule-today-panel'),
          dayColumns: document.querySelectorAll('#scheduleBoard .schedule-board-column').length,
          centeredEightDays: boardDates[0] === localKey(twoDaysAgo) && boardDates[2] === localKey(today) && boardDates[7] === localKey(fiveDaysLater),
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
          allDayCompact,
          allDayInputWidth: Math.round(allDayInputRect.width),
          allDayInputHeight: Math.round(allDayInputRect.height),
          allDayRowHeight: Math.round(allDayRowRect.height),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
        document.querySelector('[data-workbench-page="home"]').click();
        return result;
      })()
    `);
    if (!scheduleResult.pageVisible || !scheduleResult.todayPanelRemoved || scheduleResult.dayColumns !== 8 || !scheduleResult.centeredEightDays || scheduleResult.scheduleCards < 2 || !scheduleResult.intersectsBoard || !scheduleResult.closePreserved || !scheduleResult.closeRestored || !scheduleResult.backdropPreserved || !scheduleResult.backdropRestored || !scheduleResult.cancelDiscarded || !scheduleResult.multiPreview || !scheduleResult.multiSaved || !scheduleResult.draftClearedAfterSave || !scheduleResult.modalScrollbarHidden || !scheduleResult.allDayCompact || scheduleResult.horizontalOverflow) {
      throw new Error(`Workbench schedule smoke failed: ${JSON.stringify(scheduleResult)}`);
    }
    console.log(`WORKBENCH_SCHEDULE_OK ${JSON.stringify(scheduleResult)}`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-workbench-page="schedule"]').click(); window.scrollTo(0, 0)`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_SCHEDULE_OUTPUT);
  }
  if (process.env.WORKBENCH_HOME_OUTPUT) {
    const homeResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="home"]').click();
        window.scrollTo(0, 0);
        document.querySelector('#homeTodayTodoList [data-home-todo-action="complete"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 60));
        const rect = (element) => {
          const value = element.getBoundingClientRect();
          return {
            left: value.left,
            right: value.right,
            top: value.top,
            bottom: value.bottom,
            width: value.width
          };
        };
        const homePage = document.querySelector('[data-page="home"]');
        const schedule = rect(document.querySelector('.home-schedule-panel'));
        const notes = rect(document.querySelector('.latest-notes-panel'));
        const job = rect(document.querySelector('.home-job-panel'));
        const utility = rect(document.querySelector('.home-utility-stack'));
        const progress = rect(document.querySelector('.home-progress-strip'));
        const command = rect(document.querySelector('.home-command-grid'));
        const focus = rect(document.querySelector('.home-top-grid'));
        const content = rect(document.querySelector('.home-content-grid'));
        const commandCards = [...document.querySelectorAll('.home-command-grid > article')].map(rect);
        const commandWidths = commandCards.map((card) => card.width);
        const result = {
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          homeScrollHeight: homePage.scrollHeight,
          homeClientHeight: homePage.clientHeight,
          documentScrollHeight: document.documentElement.scrollHeight,
          progressBottom: Math.round(progress.bottom),
          commandTop: Math.round(command.top),
          commandBottom: Math.round(command.bottom),
          focusTop: Math.round(focus.top),
          focusBottom: Math.round(focus.bottom),
          contentTop: Math.round(content.top),
          contentBottom: Math.round(content.bottom),
          pageVisible: !document.querySelector('[data-page="home"]').hidden,
          todayFocusRemoved: !document.getElementById('todayFocusList') && !document.body.textContent.includes('今日重点'),
          focusTimerHome: Boolean(document.querySelector('.home-focus-timer #focusTimeRemaining')),
          focusPanelCompact: document.querySelector('.home-focus-timer').getBoundingClientRect().height <= (innerHeight <= 900 ? 126 : 156),
          focusNotificationVisible: (() => {
            const option = document.querySelector('.home-focus-timer .focus-notification-option');
            const status = document.getElementById('focusNotificationStatus');
            return option?.getBoundingClientRect().height > 0 && status?.getBoundingClientRect().height > 0;
          })(),
          focusControlInline: (() => {
            const copy = document.querySelector('.home-focus-timer .focus-notification-copy')?.getBoundingClientRect();
            const button = document.getElementById('startFocusButton')?.getBoundingClientRect();
            return Boolean(copy && button && button.left > copy.left && Math.abs((copy.top + copy.bottom) / 2 - (button.top + button.bottom) / 2) <= 3);
          })(),
          clockOutsideFocus: !document.querySelector('.home-focus-timer #homeClockButton')
            && Boolean(document.querySelector('.home-attendance-card #homeClockButton')),
          attendanceStatus: Boolean(document.getElementById('homeAttendanceStatus')),
          todoCompletionVisible: (() => {
            const row = document.querySelector('#homeTodayTodoList .home-todo-row.is-completed');
            const titleStyle = row ? getComputedStyle(row.querySelector('.home-todo-title strong')) : null;
            return Boolean(row && titleStyle?.textDecorationLine.includes('line-through') && Number(titleStyle.opacity) < 1);
          })(),
          todoProgressBottomAligned: (() => {
            const progressBottom = document.getElementById('homeTodoProgress').getBoundingClientRect().bottom;
            const clockBottom = document.getElementById('homeClockButton').getBoundingClientRect().bottom;
            return Math.abs(progressBottom - clockBottom) <= 12;
          })(),
          todoCardLarger: (document.querySelector('.home-today-todo-card')?.getBoundingClientRect().width || 0)
            > (document.querySelector('.home-next-event-card')?.getBoundingClientRect().width || 0),
          commandCardsTopAligned: commandCards.every((card) => Math.abs(card.top - commandCards[0].top) <= 1),
          attendanceIndependent: Boolean(document.querySelector('.home-attendance-card')),
          quickNote: Boolean(document.getElementById('quickNoteButton')),
          fourDayCards: document.querySelectorAll('#homeDayOverview .day-card').length,
          notesRight: notes.left > schedule.left,
          aligned: Math.abs(utility.top - schedule.top) <= 1,
          fullWidthPipeline: Math.abs(job.left - content.left) <= 1 && Math.abs(job.right - content.right) <= 1,
          jobSummaryVisible: Boolean(document.querySelector('.home-job-panel #homeJobSummary .home-job-row')),
          fiveStateHomeBoard: document.querySelectorAll('#homeJobSummary .home-job-row').length === 5,
          startsToday: document.querySelector('#homeDayOverview .day-card strong')?.textContent === '今天',
          comfortableBottomInset: (() => {
            const dayCards = [...document.querySelectorAll('#homeDayOverview .day-card')].map(rect);
            const noteCards = [...document.querySelectorAll('#latestNotes > *')].map(rect);
            const dayBottom = Math.max(...dayCards.map((card) => card.bottom));
            const noteBottom = Math.max(...noteCards.map((card) => card.bottom));
            return schedule.bottom - dayBottom >= 8 && notes.bottom - noteBottom >= 8;
          })(),
          latestNotesNoScroll: (() => {
            const list = document.getElementById('latestNotes');
            return getComputedStyle(list).overflowY === 'hidden' && list.scrollWidth <= list.clientWidth;
          })(),
          navJobBelowSubmissions: (() => {
            const submission = document.querySelector('[data-workbench-page="submissions"]');
            const jobs = document.querySelector('[data-workbench-page="jobs"]');
            return submission.compareDocumentPosition(jobs) & Node.DOCUMENT_POSITION_FOLLOWING;
          })() > 0,
          homeContentFits: homePage.scrollHeight <= innerHeight && content.bottom <= innerHeight - 8,
          homeRowsAligned: command.top >= progress.bottom - 1
            && focus.top - command.bottom >= 10
            && content.top - focus.bottom >= 10,
          homeColumnsAligned: Math.abs(focus.left - content.left) <= 1
            && Math.abs(focus.right - content.right) <= 1,
          commandCardsAligned: commandCards.length === 4
            && commandCards.every((card) => Math.abs(card.top - commandCards[0].top) <= 1),
          fourDayMatrix: (() => {
            const cards = [...document.querySelectorAll('#homeDayOverview .day-card')];
            return cards.length === 4 && cards.every((card) => card.getBoundingClientRect().width > 0 && card.getBoundingClientRect().height > 0);
          })(),
          navCountReadable: (() => {
            const count = document.querySelector('.nav-item.active b');
            if (!count) return true;
            const style = getComputedStyle(count);
            return style.color !== style.backgroundColor && Number(style.fontSize.replace('px', '')) >= 10;
          })(),
          headerAligned: (() => {
            document.querySelector('[data-workbench-page="notes"]').click();
            const notesHead = document.querySelector('.notes-page .page-head-row').getBoundingClientRect();
            document.querySelector('[data-workbench-page="attendance"]').click();
            const attendanceHead = document.querySelector('.attendance-page .page-head-row').getBoundingClientRect();
            return Math.abs(notesHead.top - attendanceHead.top) <= 3;
          })(),
          scheduleWraps: (() => {
            document.querySelector('[data-workbench-page="schedule"]').click();
            const board = document.getElementById('scheduleBoard');
            return getComputedStyle(board).gridTemplateColumns.split(' ').length >= 2 && getComputedStyle(document.querySelector('.schedule-board-shell')).overflowX !== 'scroll';
          })(),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
        document.querySelector('[data-workbench-page="home"]').click();
        return result;
      })()
    `);
    const homeLayoutNumbers = new Set([
      'viewportWidth', 'viewportHeight', 'homeScrollHeight', 'homeClientHeight',
      'documentScrollHeight', 'progressBottom', 'commandTop', 'commandBottom',
      'focusTop', 'focusBottom', 'contentTop', 'contentBottom'
    ]);
    const homeSmokePassed = Object.entries(homeResult).every(([key, value]) => {
      if (homeLayoutNumbers.has(key)) return Number.isFinite(value) && value > 0;
      if (key === 'fourDayCards') return value === 4;
      if (key === 'horizontalOverflow') return value === false;
      return value === true;
    });
    if (!homeSmokePassed) {
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
          usageWidths: [...document.querySelectorAll('#focusUsageList .focus-usage-row i')].map((item) => Math.round(item.getBoundingClientRect().width)),
          usageColors: [...document.querySelectorAll('#focusUsageList .focus-usage-row i')].map((item) => getComputedStyle(item).backgroundImage),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    const usagePixelWidths = attendanceResult.usageWidths;
    const usageWidthsAreProportional = usagePixelWidths.length < 2
      || Math.max(...usagePixelWidths) - Math.min(...usagePixelWidths) >= 8;
    const usageColorsAreDistinct = attendanceResult.usageColors.length < 2 || new Set(attendanceResult.usageColors).size > 1;
    if (!attendanceResult.pageVisible || attendanceResult.ganttRows !== 7 || attendanceResult.ganttBars < 2 || attendanceResult.appRows < 1 || !usageWidthsAreProportional || !usageColorsAreDistinct || attendanceResult.horizontalOverflow) {
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
        document.querySelector('#notesGrid .note-card').click();
        const noteEditor = document.getElementById('noteContent');
        document.getElementById('toggleNoteFullscreenButton').click();
        const fullscreenDialog = document.getElementById('noteDialog');
        const fullscreenRect = fullscreenDialog.getBoundingClientRect();
        const sidebarRect = document.querySelector('.sidebar').getBoundingClientRect();
        const fullscreenExcludesSidebar = fullscreenDialog.classList.contains('is-workspace-fullscreen')
          && fullscreenRect.left >= sidebarRect.right - 1
          && fullscreenRect.right >= innerWidth - 1;
        fullscreenDialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
        const escapeOnlyExitsFullscreen = fullscreenDialog.open && !fullscreenDialog.classList.contains('is-workspace-fullscreen');
        noteEditor.innerHTML = '1. 第一项';
        const listRange = document.createRange();
        listRange.selectNodeContents(noteEditor);
        listRange.collapse(false);
        const listSelection = getSelection();
        listSelection.removeAllRanges();
        listSelection.addRange(listRange);
        noteEditor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
        const automaticNumbering = noteEditor.textContent.includes('\\n2. ');
        document.getElementById('addNoteImageButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        await flushNoteEditor();
        const savedWideNote = wb.editingNote;
        openNoteEditor(savedWideNote);
        await new Promise((resolve) => setTimeout(resolve, 80));
        const wideImage = noteEditor.querySelector('img[data-note-attachment="smoke-wide-image"]');
        const wideImagePersists = Boolean(wideImage?.src);
        const wideImageFits = Boolean(wideImage) && wideImage.getBoundingClientRect().width <= noteEditor.clientWidth;
        const wideImageOwnRow = Boolean(wideImage?.parentElement) && wideImage.parentElement.getBoundingClientRect().width >= noteEditor.clientWidth - 34;
        const serializedNote = readNoteEditorContent();
        const controlledImageSource = serializedNote.includes('data-note-attachment="smoke-wide-image"') && !serializedNote.includes('data:image');
        document.getElementById('cancelNoteButton').click();
        document.getElementById('quickNoteButton').click();
        const noteOpened = document.getElementById('noteDialog').open;
        document.getElementById('noteDialog').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 40));
        const noteBackdropKeepsEditorOpen = document.getElementById('noteDialog').open;
        document.getElementById('cancelNoteButton').click();
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
          fullscreenExcludesSidebar,
          escapeOnlyExitsFullscreen,
          automaticNumbering,
          wideImagePersists,
          wideImageFits,
          wideImageOwnRow,
          controlledImageSource,
          noteOpened,
          noteBackdropKeepsEditorOpen,
          rightClickConfirmation,
          rightClickDeleted: document.body.dataset.deletedNoteCount === '1',
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!notesResult.pageVisible || notesResult.noteCards < 1 || !notesResult.metadataButton || !notesResult.multiOptions || !notesResult.fullscreenExcludesSidebar || !notesResult.escapeOnlyExitsFullscreen || !notesResult.automaticNumbering || !notesResult.wideImagePersists || !notesResult.wideImageFits || !notesResult.wideImageOwnRow || !notesResult.controlledImageSource || !notesResult.noteOpened || !notesResult.noteBackdropKeepsEditorOpen || !notesResult.rightClickConfirmation || !notesResult.rightClickDeleted || notesResult.horizontalOverflow) {
      throw new Error(`Workbench notes smoke failed: ${JSON.stringify(notesResult)}`);
    }
    console.log(`WORKBENCH_NOTES_OK ${JSON.stringify(notesResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 240));
    await captureStablePage(process.env.WORKBENCH_NOTES_OUTPUT);
  }
  if (process.env.WORKBENCH_JOBS_OUTPUT) {
    const jobsResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="jobs"]').click();
        window.scrollTo(0, 0);
        const initialCards = document.querySelectorAll('#jobBoard .job-card').length;
        const stageHeights = [...document.querySelectorAll('#jobBoard .job-stage-column')].map((column) => Math.round(column.getBoundingClientRect().height));
        const stageWidths = [...document.querySelectorAll('#jobBoard .job-stage-column')].map((column) => Math.round(column.getBoundingClientRect().width));
        const stageColors = [...document.querySelectorAll('#jobBoard .job-stage-column')].map((column) => getComputedStyle(column).backgroundColor);
        const stageTops = [...document.querySelectorAll('#jobBoard .job-stage-column')].map((column) => Math.round(column.getBoundingClientRect().top));
        const cardAnatomy = [...document.querySelectorAll('#jobBoard .job-card')].every((card) => (
          card.querySelector('.job-card-company')
          && card.querySelector('.job-card-role')
          && card.querySelector('.job-card-location')
          && card.querySelector('.job-card-notes')
        ));
        const cardsAreEditors = [...document.querySelectorAll('#jobBoard .job-card')].every((card) => card.matches('[data-edit-job][tabindex="0"]'));
        const editButtonsRemoved = !document.querySelector('#jobBoard .job-card-actions, #jobBoard .job-card .text-button');
        const statusActionsAtTop = [...document.querySelectorAll('#jobBoard .job-status-button')].every((button) => button.closest('.job-card-top-actions'));
        const pendingRemoved = !document.querySelector('.stage-pending, [data-add-job="pending"], option[value="pending"]');
        const headerCreateOnly = Boolean(document.getElementById('addJobButton')) && !document.querySelector('#jobBoard [data-add-job]');
        const meterWidths = [...document.querySelectorAll('#jobPipelineSummary .job-pipeline-row > i > b')].map((bar) => Math.round(bar.getBoundingClientRect().width));
        document.querySelector('#jobBoard .job-card').click();
        const cardClickOpensEditor = document.getElementById('jobDialog').open;
        document.getElementById('cancelJobButton').click();
        document.getElementById('addJobButton').click();
        document.getElementById('jobCompany').value = '新增环保公司';
        document.getElementById('jobRole').value = '研发工程师';
        document.getElementById('jobStatus').value = 'submitted';
        document.getElementById('saveJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const added = document.querySelectorAll('#jobBoard .job-card').length === initialCards + 1;
        const totalBeforeStatusChange = document.getElementById('jobSubmittedCount')?.textContent;
        document.querySelector('[data-edit-job="job-submitted-1"]').click();
        document.getElementById('jobStatus').value = 'interview';
        document.getElementById('saveJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const interviewFirst = Boolean(document.querySelector('.stage-interview [data-edit-job="job-submitted-1"]'));
        document.querySelector('.stage-interview [data-edit-job="job-submitted-1"]').click();
        document.getElementById('jobStatus').value = 'written-1';
        document.getElementById('saveJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const writtenAfterInterview = Boolean(document.querySelector('.stage-written-1 [data-edit-job="job-submitted-1"]'));
        const totalAfterStatusChange = document.getElementById('jobSubmittedCount')?.textContent;
        return {
          pageVisible: !document.querySelector('[data-page="jobs"]').hidden,
          fiveStates: document.querySelectorAll('#jobBoard .job-stage-column').length === 5,
          stageColors,
          distinctStateColors: new Set(stageColors).size === 5,
          singleStageRow: new Set(stageTops).size === 1,
          cardAnatomy,
          cardsAreEditors,
          editButtonsRemoved,
          statusActionsAtTop,
          pendingRemoved,
          headerCreateOnly,
          cardClickOpensEditor,
          readableStageWidths: stageWidths.every((width) => width >= 198),
          fixedStageHeights: new Set(stageHeights).size === 1 && stageHeights[0] === 420,
          upcomingPanelRemoved: !document.querySelector('.job-upcoming-panel') && !document.getElementById('jobUpcomingCount'),
          salaryMetric: document.getElementById('jobMaxSalary')?.textContent === '41.1万',
          initialCards,
          proportionalMeters: new Set(meterWidths).size >= 2,
          added,
          totalRetained: totalBeforeStatusChange === totalAfterStatusChange && Number(totalAfterStatusChange) >= 7,
          interviewFirst,
          writtenAfterInterview,
          homeSummary: document.querySelectorAll('#homeJobSummary .home-job-row').length === 5,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!jobsResult.pageVisible || !jobsResult.fiveStates || !jobsResult.distinctStateColors || !jobsResult.singleStageRow || !jobsResult.cardAnatomy || !jobsResult.cardsAreEditors || !jobsResult.editButtonsRemoved || !jobsResult.statusActionsAtTop || !jobsResult.pendingRemoved || !jobsResult.headerCreateOnly || !jobsResult.cardClickOpensEditor || !jobsResult.readableStageWidths || !jobsResult.fixedStageHeights || !jobsResult.upcomingPanelRemoved || !jobsResult.salaryMetric || jobsResult.initialCards < 6 || !jobsResult.proportionalMeters || !jobsResult.added || !jobsResult.totalRetained || !jobsResult.interviewFirst || !jobsResult.writtenAfterInterview || !jobsResult.homeSummary || jobsResult.horizontalOverflow) {
      throw new Error(`Workbench jobs smoke failed: ${JSON.stringify(jobsResult)}`);
    }
    console.log(`WORKBENCH_JOBS_OK ${JSON.stringify(jobsResult)}`);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await captureStablePage(process.env.WORKBENCH_JOBS_OUTPUT);
  }
  if (process.env.WORKBENCH_CAPTURE_OUTPUT) {
    window.setSize(720, 222);
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
        const card = document.querySelector('.capture-card').getBoundingClientRect();
        const singleSurface = card.left === 0 && card.top === 0 && card.right === innerWidth && card.bottom === innerHeight;
        const transparentRoot = getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)'
          && getComputedStyle(document.body).backgroundImage === 'none';
        return { compositionPreserved, priorityRendered, highlighted, emptyBlurClosed, singleSurface, transparentRoot };
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
          closeButtonNamed: document.getElementById('closeWidgetButton').getAttribute('aria-label') === '从桌面移除今日概览',
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
        liquidGlass: document.documentElement.dataset.appearance === 'liquid-glass'
          && getComputedStyle(document.body).backgroundImage.includes('radial-gradient')
      }))()
    `);
    if (!Object.values(stickyResult).every(Boolean)) throw new Error(`Workbench sticky smoke failed: ${JSON.stringify(stickyResult)}`);
    console.log(`WORKBENCH_STICKY_OK ${JSON.stringify(stickyResult)}`);
    await captureStablePage(process.env.WORKBENCH_STICKY_OUTPUT);
  }
  const captureWasRequested = Object.entries(process.env).some(([key, value]) => (
    key.endsWith('_OUTPUT') && Boolean(value)
  ));
  if (!captureWasRequested) {
    window.webContents.invalidate();
    await window.webContents.capturePage();
  }
  exitSmoke(0);
}).catch((error) => {
  console.error(`SMOKE_FAILED ${error?.stack || error}`);
  exitSmoke(1);
});

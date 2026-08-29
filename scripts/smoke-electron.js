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
  if (process.env.WORKBENCH_NOTE_BEHAVIOR_OUTPUT) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('#notesGrid .note-card'))`);
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const behavior = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="notes"]').click();
        localStorage.setItem('yanji.noteInspectorOpen.v1', 'true');
        const card = document.querySelector('#notesGrid .note-card');
        card.click();
        const dialog = document.getElementById('noteDialog');
        const editor = document.getElementById('noteContent');
        const toggle = document.getElementById('toggleNoteMetadataButton');
        if (toggle.getAttribute('aria-expanded') === 'true') toggle.click();
        const closedBeforeReopen = toggle.getAttribute('aria-expanded') === 'false';
        document.getElementById('saveNoteButton').click();
        for (let attempt = 0; attempt < 20 && dialog.open; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
        document.querySelector('#notesGrid .note-card').click();
        const closedAfterReopen = toggle.getAttribute('aria-expanded') === 'false';

        editor.innerHTML = '1. 第一项';
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const enterHtml = editor.innerHTML;
        const continued = /2[.]/.test(editor.innerText);
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        const indentHtml = editor.innerHTML;
        const indentSelection = { node: getSelection().anchorNode?.nodeName, offset: getSelection().anchorOffset, value: getSelection().anchorNode?.nodeValue };
        const indented = /b[)]/.test(editor.innerText);
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        const outdentHtml = editor.innerHTML;
        const outdented = /2[.]/.test(editor.innerText);
        const paperRadius = getComputedStyle(document.querySelector('.note-paper')).borderRadius;
        const scroll = document.querySelector('.note-paper-scroll');
        scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
        const zoomLabel = document.getElementById('noteZoomLabel').textContent;
        const pageDuration = getComputedStyle(document.documentElement).getPropertyValue('--motion-duration-page').trim();
        return { closedBeforeReopen, closedAfterReopen, continued, indented, outdented, enterHtml, indentHtml, outdentHtml, indentSelection, paperRadius, zoomLabel, pageDuration };
      })()
    `);
    if (!behavior.closedBeforeReopen || !behavior.closedAfterReopen || !behavior.continued || !behavior.indented || !behavior.outdented || behavior.paperRadius !== '0px' || behavior.zoomLabel !== '110%' || behavior.pageDuration !== '360ms') {
      throw new Error(`Note behavior smoke failed: ${JSON.stringify(behavior)}`);
    }
    console.log(`WORKBENCH_NOTE_BEHAVIOR_OK ${JSON.stringify(behavior)}`);
    await captureStablePage(process.env.WORKBENCH_NOTE_BEHAVIOR_OUTPUT);
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
        localStorage.setItem('yanji.noteInspectorOpen.v1', 'true');
        const card = document.querySelector('#notesGrid .note-card');
        const originalCardText = card.querySelector('p').textContent;
        card.click();
        const editor = document.getElementById('noteContent');
        editor.innerHTML = '<p>这是尚未保存的弹窗草稿</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '草稿' }));
        const hintShowsUnsaved = document.getElementById('noteSaveHint').textContent.includes('未保存');
        const dialog = document.getElementById('noteDialog');
        await new Promise((resolve) => setTimeout(resolve, 600));
        const rect = dialog.getBoundingClientRect();
        const inspector = document.getElementById('noteMetadataPanel');
        const propertyPanelOpen = inspector.getAttribute('aria-hidden') !== 'true';
        document.getElementById('toggleNoteMetadataButton').click();
        const propertyPanelClosed = inspector.getAttribute('aria-hidden') === 'true';
        await new Promise((resolve) => setTimeout(resolve, 320));
        document.querySelector('.note-workspace-body').getAnimations().forEach((animation) => animation.finish());
        document.querySelector('.note-paper').getAnimations().forEach((animation) => animation.finish());
        const workspaceRect = document.querySelector('.note-workspace-body').getBoundingClientRect();
        const paperRect = document.querySelector('.note-paper').getBoundingClientRect();
        const inspectorStyle = getComputedStyle(inspector);
        const paperCenteredAfterClose = Math.abs((paperRect.left + paperRect.width / 2) - (workspaceRect.left + workspaceRect.width / 2)) <= 2;
        return {
          originalCardText,
          draftDoesNotLeak: card.querySelector('p').textContent === originalCardText,
          hintShowsUnsaved,
          widerEditor: rect.width >= 860,
          tallerEditor: rect.height >= 700,
          centered: Math.abs((rect.left + rect.width / 2) - innerWidth / 2) <= 2 && Math.abs((rect.top + rect.height / 2) - innerHeight / 2) <= 2,
          propertyPanelOpen,
          propertyPanelClosed,
          propertyPanelFullyHidden: inspectorStyle.display === 'none' && inspectorStyle.visibility === 'hidden' && inspectorStyle.opacity === '0' && inspectorStyle.pointerEvents === 'none',
          propertyPanelComputedState: { display: inspectorStyle.display, visibility: inspectorStyle.visibility, opacity: inspectorStyle.opacity, pointerEvents: inspectorStyle.pointerEvents },
          paperCenteredAfterClose,
          paperCenterAfterClose: paperRect.left + paperRect.width / 2,
          workspaceCenterAfterClose: workspaceRect.left + workspaceRect.width / 2,
          workspaceClassAfterClose: document.querySelector('.note-workspace-body').className,
          workspacePaddingAfterClose: getComputedStyle(document.querySelector('.note-workspace-body')).paddingRight,
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
    if (!noteModalResult.draftDoesNotLeak || !noteModalResult.hintShowsUnsaved || !noteModalResult.widerEditor || !noteModalResult.tallerEditor || !noteModalResult.centered || !noteModalResult.propertyPanelOpen || !noteModalResult.propertyPanelClosed || !noteModalResult.propertyPanelFullyHidden || !noteModalResult.paperCenteredAfterClose || !noteModalResult.closedAfterSave || !noteModalResult.cardUpdatedAfterSave) throw new Error(`Note modal smoke failed: ${JSON.stringify(noteModalResult)}`);
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
  const homeMotionResult = await window.webContents.executeJavaScript(`
    (async () => {
      const activate = (page) => document.querySelector('[data-workbench-page="' + page + '"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      activate('schedule');
      activate('home');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const selector = '.home-progress-strip, .home-next-event-card, .home-today-card:not(.home-today-todo-card), .home-today-todo-card, .home-attendance-card, .home-schedule-panel, .home-focus-timer, .latest-notes-panel, .home-job-panel';
      const cards = [...document.querySelectorAll(selector)];
      const firstWaves = cards.map((card) => Number(card.style.getPropertyValue('--home-enter-wave')));
      const firstReplay = document.querySelector('[data-page="home"]').classList.contains('home-entering');
      activate('home');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const repeatedReplay = document.querySelector('[data-page="home"]').classList.contains('home-entering');
      const waveCoordinatesMatch = cards.every((card) => Number(card.style.getPropertyValue('--home-enter-wave'))
        === Number(card.style.getPropertyValue('--home-enter-row')) + Number(card.style.getPropertyValue('--home-enter-column')));
      return {
        cardCount: cards.length,
        firstReplay,
        repeatedReplay,
        diagonalWaves: new Set(firstWaves).size < cards.length && Math.min(...firstWaves) === 0,
        waveCoordinatesMatch
      };
    })()
  `);
  if (homeMotionResult.cardCount !== 9 || !homeMotionResult.firstReplay || !homeMotionResult.repeatedReplay || !homeMotionResult.diagonalWaves || !homeMotionResult.waveCoordinatesMatch) {
    throw new Error(`Home motion smoke failed: ${JSON.stringify(homeMotionResult)}`);
  }
  console.log(`HOME_MOTION_SMOKE_OK ${JSON.stringify(homeMotionResult)}`);
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
      const updatePrompt = document.getElementById('updatePromptDialog');
      const updatePromptAvailable = updatePrompt.open
        && document.getElementById('updatePromptLatestVersion').textContent === 'v1.3.1'
        && document.getElementById('updatePromptActionButton').textContent === '立即下载';
      document.getElementById('updatePromptActionButton').click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const updateDownloaded = updateButton.textContent === '安装并重启'
        && document.getElementById('updateProgress').getAttribute('aria-valuenow') === '100';
      const updatePromptDownloaded = updatePrompt.open
        && document.getElementById('updatePromptActionButton').textContent === '安装并重启'
        && document.getElementById('updatePromptProgress').getAttribute('aria-valuenow') === '100';
      document.getElementById('dismissUpdatePromptButton').click();
      const updatePromptDismissed = !updatePrompt.open;
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
      return { notificationsVisible, remindersClosedTogether, remindersStayOffWhenReenabled, trackingVisible, storageVisible, storageSelectedExactly, updatesVisible, updateIdle, updateAvailable, updatePromptAvailable, updateDownloaded, updatePromptDownloaded, updatePromptDismissed, updateButtonText: updateButton.textContent, updateBadge: document.getElementById('updateVersionBadge').textContent, updateError: document.getElementById('settingsError').textContent, generalVisible, todayOverviewSwitchVisible, widgetChildrenDisabled, draftPreserved };
    })()
  `);
  if (!settingsDraftResult.notificationsVisible || !settingsDraftResult.remindersClosedTogether || !settingsDraftResult.remindersStayOffWhenReenabled || !settingsDraftResult.trackingVisible || !settingsDraftResult.storageVisible || !settingsDraftResult.storageSelectedExactly || !settingsDraftResult.updatesVisible || !settingsDraftResult.updateIdle || !settingsDraftResult.updateAvailable || !settingsDraftResult.updatePromptAvailable || !settingsDraftResult.updateDownloaded || !settingsDraftResult.updatePromptDownloaded || !settingsDraftResult.updatePromptDismissed || !settingsDraftResult.generalVisible || !settingsDraftResult.todayOverviewSwitchVisible || !settingsDraftResult.widgetChildrenDisabled || !settingsDraftResult.draftPreserved) {
    throw new Error(`Settings draft smoke test failed: ${JSON.stringify(settingsDraftResult)}`);
  }
  console.log(`SETTINGS_DRAFT_SMOKE_OK ${JSON.stringify(settingsDraftResult)}`);
  if (process.env.WORKBENCH_UPDATE_PROMPT_OUTPUT) {
    const updatePromptResult = await window.webContents.executeJavaScript(`
      (async () => {
        state.dismissedUpdateVersion = null;
        state.updateStatus = await window.paperTrail.checkForUpdates();
        renderUpdateStatus();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const dialog = document.getElementById('updatePromptDialog');
        const bounds = dialog.getBoundingClientRect();
        return {
          open: dialog.open,
          version: document.getElementById('updatePromptLatestVersion').textContent,
          primaryAction: document.getElementById('updatePromptActionButton').textContent,
          secondaryAction: document.getElementById('dismissUpdatePromptButton').textContent,
          safetyVisible: document.querySelector('.update-prompt-safety')?.getBoundingClientRect().height > 0,
          centered: Math.abs((bounds.left + bounds.width / 2) - innerWidth / 2) <= 2,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!updatePromptResult.open || updatePromptResult.version !== 'v1.3.1' || updatePromptResult.primaryAction !== '立即下载' || updatePromptResult.secondaryAction !== '稍后提醒' || !updatePromptResult.safetyVisible || !updatePromptResult.centered || updatePromptResult.horizontalOverflow) {
      throw new Error(`Update prompt visual smoke failed: ${JSON.stringify(updatePromptResult)}`);
    }
    console.log(`UPDATE_PROMPT_VISUAL_OK ${JSON.stringify(updatePromptResult)}`);
    await captureStablePage(process.env.WORKBENCH_UPDATE_PROMPT_OUTPUT);
    await window.webContents.executeJavaScript(`document.getElementById('dismissUpdatePromptButton').click()`);
  }
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
    window.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const scheduleResult = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('[data-workbench-page="schedule"]').click();
        window.scrollTo(0, 0);
        const localKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
        const today = new Date();
        const twoDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
        const fiveDaysLater = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
        const boardDates = [...document.querySelectorAll('#scheduleBoard .schedule-board-column')].map((column) => column.dataset.boardDate);
        const firstDateBeforeMove = boardDates[0];
        document.getElementById('nextDayButton').click();
        await new Promise((resolve) => setTimeout(resolve, 35));
        const directionalAnimationRunning = document.getElementById('scheduleBoard').getAnimations().length > 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        const firstDateAfterNext = document.querySelector('#scheduleBoard .schedule-board-column')?.dataset.boardDate;
        document.getElementById('previousDayButton').click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const directionalDateChange = firstDateAfterNext !== firstDateBeforeMove
          && document.querySelector('#scheduleBoard .schedule-board-column')?.dataset.boardDate === firstDateBeforeMove;
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
          directionalAnimationRunning,
          directionalDateChange,
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
    if (!scheduleResult.pageVisible || !scheduleResult.todayPanelRemoved || scheduleResult.dayColumns !== 8 || !scheduleResult.centeredEightDays || !scheduleResult.directionalAnimationRunning || !scheduleResult.directionalDateChange || scheduleResult.scheduleCards < 2 || !scheduleResult.intersectsBoard || !scheduleResult.closePreserved || !scheduleResult.closeRestored || !scheduleResult.backdropPreserved || !scheduleResult.backdropRestored || !scheduleResult.cancelDiscarded || !scheduleResult.multiPreview || !scheduleResult.multiSaved || !scheduleResult.draftClearedAfterSave || !scheduleResult.modalScrollbarHidden || !scheduleResult.allDayCompact || scheduleResult.horizontalOverflow) {
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
          attendanceButtonInline: (() => {
            const status = document.getElementById('homeAttendanceStatus').getBoundingClientRect();
            const button = document.getElementById('homeClockButton').getBoundingClientRect();
            const card = document.querySelector('.home-attendance-card').getBoundingClientRect();
            return button.left > status.left && button.right <= card.right && button.top >= card.top && button.bottom <= card.bottom;
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
          fourStageHomeBoard: (() => {
            const labels = [...document.querySelectorAll('#homeJobSummary .home-job-row > span')].map((item) => item.textContent.trim());
            return JSON.stringify(labels) === JSON.stringify(['已投递', '测评', '面试', 'Offer']);
          })(),
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
    window.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const attendanceResult = await window.webContents.executeJavaScript(`
      (async () => {
        const nav = document.querySelector('[data-workbench-page="attendance"]');
        nav.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        nav.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.scrollTo(0, 0);
        const attendanceEntering = document.querySelector('[data-page="attendance"]').classList.contains('attendance-entering');
        const ganttGrowRunning = [...document.querySelectorAll('#attendanceGanttRows .attendance-bar')].some((bar) => bar.getAnimations().length > 0);
        const usageGrowRunning = [...document.querySelectorAll('#focusUsageList .focus-usage-row i')].some((bar) => bar.getAnimations().length > 0);
        await new Promise((resolve) => setTimeout(resolve, 480));
        return {
          pageVisible: !document.querySelector('[data-page="attendance"]').hidden,
          attendanceEntering,
          ganttGrowRunning,
          usageGrowRunning,
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
    if (!attendanceResult.pageVisible || !attendanceResult.attendanceEntering || !attendanceResult.ganttGrowRunning || !attendanceResult.usageGrowRunning || attendanceResult.ganttRows !== 7 || attendanceResult.ganttBars < 2 || attendanceResult.appRows < 1 || !usageWidthsAreProportional || !usageColorsAreDistinct || attendanceResult.horizontalOverflow) {
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
        await new Promise((resolve) => setTimeout(resolve, 190));
        document.querySelector('#notesGrid .note-card').click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        const noteEditor = document.getElementById('noteContent');
        document.getElementById('toggleNoteFullscreenButton').click();
        const fullscreenDialog = document.getElementById('noteDialog');
        await new Promise((resolve) => setTimeout(resolve, 260));
        const fullscreenRect = fullscreenDialog.getBoundingClientRect();
        const fullscreenCoversWorkspace = fullscreenDialog.classList.contains('is-workspace-fullscreen')
          && fullscreenRect.left <= 1
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
        const automaticNumbering = noteEditor.innerText.includes('\\n2. ');
        document.getElementById('addNoteImageButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        await flushNoteEditor();
        const savedWideNote = wb.editingNote;
        document.getElementById('noteDialog').close();
        await openNoteEditor(savedWideNote);
        await new Promise((resolve) => setTimeout(resolve, 120));
        const wideImage = noteEditor.querySelector('img[data-note-attachment="smoke-wide-image"]');
        const wideImagePersists = Boolean(wideImage?.src);
        const wideImageFits = Boolean(wideImage) && wideImage.getBoundingClientRect().width <= noteEditor.clientWidth;
        const wideImageOwnRow = Boolean(wideImage?.parentElement) && wideImage.parentElement.getBoundingClientRect().width >= noteEditor.clientWidth - 34;
        const serializedNote = readNoteEditorContent();
        const controlledImageSource = serializedNote.includes('data-note-attachment="smoke-wide-image"') && !serializedNote.includes('data:image');
        document.getElementById('cancelNoteButton').click();
        await new Promise((resolve) => setTimeout(resolve, 190));
        document.getElementById('quickNoteButton').click();
        await new Promise((resolve) => setTimeout(resolve, 40));
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
          fullscreenCoversWorkspace,
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
    if (!notesResult.pageVisible || notesResult.noteCards < 1 || !notesResult.metadataButton || !notesResult.multiOptions || !notesResult.fullscreenCoversWorkspace || !notesResult.escapeOnlyExitsFullscreen || !notesResult.automaticNumbering || !notesResult.wideImagePersists || !notesResult.wideImageFits || !notesResult.wideImageOwnRow || !notesResult.controlledImageSource || !notesResult.noteOpened || !notesResult.noteBackdropKeepsEditorOpen || !notesResult.rightClickConfirmation || !notesResult.rightClickDeleted || notesResult.horizontalOverflow) {
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
        await new Promise((resolve) => setTimeout(resolve, 80));
        const rows = [...document.querySelectorAll('#jobBoard .job-position')];
        const initialRows = rows.length;
        const deferredRow = rows.find((row) => {
          const rect = row.getBoundingClientRect();
          return rect.top >= innerHeight || rect.bottom <= 0;
        });
        const deferredPending = Boolean(deferredRow?.classList.contains('motion-job-pending'));
        deferredRow?.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 700));
        const deferredRevealed = Boolean(deferredRow)
          && (deferredRow.classList.contains('motion-job-visible') || !deferredRow.classList.contains('motion-job-pending'));
        window.scrollTo(0, 0);
        const workflowLengths = rows.map((row) => row.querySelectorAll('.job-flow-stage').length);
        const rowAnatomy = rows.every((row) => (
          row.querySelector('.job-company-cell')
          && row.querySelector('.job-type-cell')
          && row.querySelector('.job-city-cell')
          && row.querySelector('.job-deadline-cell')
          && row.querySelector('[data-job-field="status"]')
          && row.querySelector('[data-job-field="priority"]')
          && row.querySelector('[data-job-field="nextFollowUpAt"]')
          && row.querySelector('[data-job-field="notes"]')
          && row.querySelector('[data-edit-job]')
          && row.querySelector('[data-delete-job]')
        ));
        const priorityDots = rows.every((row) => row.querySelector('.job-priority-dot.priority-high, .job-priority-dot.priority-medium, .job-priority-dot.priority-low'));
        const firstRow = rows[0];
        const compactInlineControls = Boolean(firstRow)
          && (firstRow.querySelector('[data-job-field="status"]')?.getBoundingClientRect().width || 0) <= 81
          && (firstRow.querySelector('[data-job-field="priority"]')?.getBoundingClientRect().width || 0) <= 49
          && (firstRow.querySelector('[data-job-field="nextFollowUpAt"]')?.getBoundingClientRect().width || 0) <= 145
          && (firstRow.querySelector('[data-job-field="notes"]')?.getBoundingClientRect().width || 0) <= 145;
        const readableTypography = Boolean(firstRow)
          && parseFloat(getComputedStyle(firstRow.querySelector('.job-company-line strong')).fontSize) >= 18
          && parseFloat(getComputedStyle(firstRow.querySelector('.job-company-line span')).fontSize) >= 15.5
          && parseFloat(getComputedStyle(document.querySelector('.job-table-head')).fontSize) >= 11
          && parseFloat(getComputedStyle(firstRow.querySelector('[data-job-field="status"]')).fontSize) >= 12
          && parseFloat(getComputedStyle(firstRow.querySelector('.job-flow-stage')).fontSize) >= 12;
        const tableShellNoOuterShadow = getComputedStyle(document.querySelector('.job-table-shell')).boxShadow === 'none';
        const dynamicWorkflow = new Set(workflowLengths).size >= 3 && workflowLengths.includes(3) && workflowLengths.includes(8);
        const railHasCurrent = rows.every((row) => row.querySelector('.job-flow-stage.current'));
        const emptyWorkflowNodes = rows.every((row) => [...row.querySelectorAll('.job-flow-node')].every((node) => node.textContent.trim() === ''));
        const endpointPairs = rows.map((row) => {
          const nodes = [...row.querySelectorAll('.job-flow-node')];
          const first = nodes[0]?.getBoundingClientRect();
          const last = nodes.at(-1)?.getBoundingClientRect();
          return [first ? Math.round(first.left + first.width / 2) : null, last ? Math.round(last.left + last.width / 2) : null];
        });
        const alignedEndpoints = endpointPairs.length > 0 && endpointPairs.every(([first, last]) => Math.abs(first - endpointPairs[0][0]) <= 1 && Math.abs(last - endpointPairs[0][1]) <= 1);
        const noLegacyStatusOptions = !document.querySelector('#jobBoard option[value="submitted"], #jobBoard option[value="written-1"], #jobBoard option[value="interview"], #jobBoard option[value="offer"]');
        const metricIds = ['jobTotalJobs', 'jobTodayAdded', 'jobTodayApplied', 'jobAwaitingReview', 'jobDueSoon', 'jobInProgress'];
        const metricsRendered = metricIds.every((id) => document.getElementById(id)?.textContent !== '');
        const metricsCompact = [...document.querySelectorAll('.job-summary-grid article')].every((card) => card.firstElementChild?.matches('strong') && card.querySelector('span'));
        const headerColumns = document.querySelectorAll('.job-table-head > span').length === 9;
        const quickFiltersRendered = document.querySelectorAll('#jobQuickFilters [data-job-quick-filter]').length >= 10;
        const headerCreateOnly = Boolean(document.getElementById('addJobButton')) && !document.querySelector('#jobBoard [data-add-job]');
        rows[0]?.querySelector('[data-edit-job]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        const detailEditorOpens = document.getElementById('jobDialog').open;
        const editorStageCount = document.querySelectorAll('#jobWorkflowEditor [data-workflow-stage-option]').length;
        document.getElementById('cancelJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 190));
        document.getElementById('addJobButton').click();
        document.getElementById('jobCompany').value = '新增环保公司';
        document.getElementById('jobRole').value = '研发工程师';
        document.getElementById('saveJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        const added = document.querySelectorAll('#jobBoard .job-position').length === initialRows + 1;
        const inlineStatus = document.querySelector('[data-job-id="job-submitted-1"][data-job-field="status"]');
        inlineStatus.value = 'paused';
        inlineStatus.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        const inlineSaved = document.querySelector('[data-job-id="job-submitted-1"][data-job-field="status"]')?.value === 'paused';
        const statusFilter = document.getElementById('jobStatusFilter');
        statusFilter.value = 'paused';
        statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        const filterWorks = document.querySelectorAll('#jobBoard .job-position').length === 1;
        statusFilter.value = 'all';
        statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        document.querySelector('[data-job-quick-filter="high-priority"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 35));
        statusFilter.value = 'active';
        statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        const combinedRows = [...document.querySelectorAll('#jobBoard .job-position')];
        const combinedFilterWorks = combinedRows.length > 0 && combinedRows.every((row) => row.querySelector('[data-job-field="status"]')?.value === 'active' && row.querySelector('[data-job-field="priority"]')?.value === 'high');
        statusFilter.value = 'all';
        statusFilter.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        document.querySelector('[data-job-quick-filter="all"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 35));
        document.querySelector('[data-job-id="job-written-1"] [data-edit-job]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 40));
        const standardStageOptions = document.querySelectorAll('#jobWorkflowEditor [data-workflow-stage-option]:not(.is-legacy)').length;
        const assessmentOption = document.querySelector('#jobWorkflowEditor [data-stage-id="stage-assessment"]');
        const assessmentCheckbox = assessmentOption?.querySelector('[data-workflow-stage-enabled]');
        assessmentCheckbox.checked = true;
        assessmentCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        const thirdInterviewOption = document.querySelector('#jobWorkflowEditor [data-stage-id="stage-third-interview"]');
        const thirdInterviewCheckbox = thirdInterviewOption?.querySelector('[data-workflow-stage-enabled]');
        thirdInterviewCheckbox.checked = true;
        thirdInterviewCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 35));
        const selectableStagesWork = document.querySelector('#jobWorkflowEditor [data-stage-id="stage-assessment"]')?.classList.contains('is-selected')
          && document.querySelector('#jobWorkflowEditor [data-stage-id="stage-third-interview"]')?.classList.contains('is-selected');
        document.querySelector('#jobWorkflowEditor [data-stage-id="stage-assessment"] [data-move-workflow-stage="down"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 35));
        const editorStageNames = [...document.querySelectorAll('#jobWorkflowEditor .job-stage-option.is-selected')].map((row) => row.dataset.stageName);
        const editableStageOrder = editorStageNames.indexOf('测评') > editorStageNames.indexOf('一面');
        document.getElementById('saveJobButton').click();
        await new Promise((resolve) => setTimeout(resolve, 90));
        const savedStageNames = [...document.querySelector('[data-job-id="job-written-1"]')?.querySelectorAll('.job-flow-name') || []].map((node) => node.textContent);
        const savedWorkflow = savedStageNames.includes('测评') && savedStageNames.includes('三面');
        document.querySelector('[data-workbench-page="home"]').click();
        await new Promise((resolve) => setTimeout(resolve, 45));
        const homeSummary = document.querySelectorAll('#homeJobSummary .home-job-row').length === 4;
        document.querySelector('[data-workbench-page="jobs"]').click();
        await new Promise((resolve) => setTimeout(resolve, 45));
        return {
          pageVisible: !document.querySelector('[data-page="jobs"]').hidden,
          initialRows,
          deferredPending,
          deferredRevealed,
          workflowLengths,
          dynamicWorkflow,
          railHasCurrent,
          emptyWorkflowNodes,
          alignedEndpoints,
          endpointPairs,
          rowAnatomy,
          priorityDots,
          compactInlineControls,
          readableTypography,
          tableShellNoOuterShadow,
          noLegacyStatusOptions,
          metricsRendered,
          metricsCompact,
          headerColumns,
          quickFiltersRendered,
          headerCreateOnly,
          detailEditorOpens,
          editorStageCount,
          added,
          inlineSaved,
          filterWorks,
          combinedFilterWorks,
          standardStageOptions,
          selectableStagesWork,
          editableStageOrder,
          savedWorkflow,
          homeSummary,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth
        };
      })()
    `);
    if (!jobsResult.pageVisible || jobsResult.initialRows < 6 || !jobsResult.deferredPending || !jobsResult.deferredRevealed || !jobsResult.dynamicWorkflow || !jobsResult.railHasCurrent || !jobsResult.emptyWorkflowNodes || !jobsResult.alignedEndpoints || !jobsResult.rowAnatomy || !jobsResult.priorityDots || !jobsResult.compactInlineControls || !jobsResult.readableTypography || !jobsResult.tableShellNoOuterShadow || !jobsResult.noLegacyStatusOptions || !jobsResult.metricsRendered || !jobsResult.metricsCompact || !jobsResult.headerColumns || !jobsResult.quickFiltersRendered || !jobsResult.headerCreateOnly || !jobsResult.detailEditorOpens || jobsResult.editorStageCount < 7 || !jobsResult.added || !jobsResult.inlineSaved || !jobsResult.filterWorks || !jobsResult.combinedFilterWorks || jobsResult.standardStageOptions !== 7 || !jobsResult.selectableStagesWork || !jobsResult.editableStageOrder || !jobsResult.savedWorkflow || !jobsResult.homeSummary || jobsResult.horizontalOverflow) {
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
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }));
        const switchedToTodo = document.querySelector('[data-mode="todo"]').classList.contains('active');
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }));
        const switchedToNote = document.querySelector('[data-mode="note"]').classList.contains('active');
        document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }));
        const switchedBackToSchedule = document.querySelector('[data-mode="schedule"]').classList.contains('active');
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
        return { compositionPreserved, priorityRendered, highlighted, switchedToTodo, switchedToNote, switchedBackToSchedule, emptyBlurClosed, singleSurface, transparentRoot };
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
    await window.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'sticky.html'), { query: { id: 'note-1', appearance: 'liquid-glass' } });
    await window.webContents.executeJavaScript(`document.documentElement.dataset.appearance = 'liquid-glass'`);
    await new Promise((resolve) => setTimeout(resolve, 160));
    const stickyResult = await window.webContents.executeJavaScript(`
      (() => ({
        titleLoaded: document.getElementById('noteTitle').value === 'PFAS 方法学想法',
        contentLoaded: document.getElementById('noteContent').textContent.includes('回收率与基质效应'),
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

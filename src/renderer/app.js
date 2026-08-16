'use strict';

const api = window.paperTrail;
const state = {
  papers: [],
  settings: null,
  refreshingIds: new Set(),
  removeId: null,
  toastTimer: null,
  addMode: 'link',
  viewMode: 'all',
  searchQuery: '',
  expandedIds: new Set(),
  settingsSection: 'general',
  lastInputWasKeyboard: false
};

const elements = {
  paperList: document.getElementById('paperList'),
  emptyState: document.getElementById('emptyState'),
  emptyTitle: document.querySelector('#emptyState h3'),
  emptyDescription: document.querySelector('#emptyState p'),
  paperCount: document.getElementById('paperCount'),
  navPaperCount: document.getElementById('navPaperCount'),
  updateCount: document.getElementById('updateCount'),
  notificationCount: document.getElementById('notificationCount'),
  archivedCount: document.getElementById('archivedCount'),
  lastCheck: document.getElementById('lastCheck'),
  pageTitle: document.getElementById('pageTitle'),
  pageSubtitle: document.getElementById('pageSubtitle'),
  listDescription: document.getElementById('listDescription'),
  allNavButton: document.getElementById('allNavButton'),
  importantNavButton: document.getElementById('importantNavButton'),
  archivedNavButton: document.getElementById('archivedNavButton'),
  monitoringStatus: document.getElementById('monitoringStatus'),
  paperSearch: document.getElementById('paperSearch'),
  markAllReadButton: document.getElementById('markAllReadButton'),
  addButton: document.getElementById('addButton'),
  emptyAddButton: document.getElementById('emptyAddButton'),
  refreshAllButton: document.getElementById('refreshAllButton'),
  settingsButton: document.getElementById('settingsButton'),
  addDialog: document.getElementById('addDialog'),
  closeAddDialogButton: document.getElementById('closeAddDialogButton'),
  cancelAddButton: document.getElementById('cancelAddButton'),
  addModeLink: document.getElementById('addModeLink'),
  addModeAuthor: document.getElementById('addModeAuthor'),
  linkModePanel: document.getElementById('linkModePanel'),
  authorModePanel: document.getElementById('authorModePanel'),
  trackingUrl: document.getElementById('trackingUrl'),
  productionReference: document.getElementById('productionReference'),
  authorLastName: document.getElementById('authorLastName'),
  authorFirstName: document.getElementById('authorFirstName'),
  addError: document.getElementById('addError'),
  confirmAddButton: document.getElementById('confirmAddButton'),
  settingsDialog: document.getElementById('settingsDialog'),
  settingsNavButtons: [...document.querySelectorAll('[data-settings-section]')],
  settingsPanels: [...document.querySelectorAll('[data-settings-panel]')],
  settingsSectionTitle: document.getElementById('settingsSectionTitle'),
  settingsSectionDescription: document.getElementById('settingsSectionDescription'),
  closeSettingsDialogButton: document.getElementById('closeSettingsDialogButton'),
  cancelSettingsButton: document.getElementById('cancelSettingsButton'),
  changeDataDirectoryButton: document.getElementById('changeDataDirectoryButton'),
  deleteBackupsButton: document.getElementById('deleteBackupsButton'),
  dataDirectory: document.getElementById('dataDirectory'),
  backupSummary: document.getElementById('backupSummary'),
  currentVersion: document.getElementById('currentVersion'),
  footerVersion: document.getElementById('footerVersion'),
  settingsError: document.getElementById('settingsError'),
  saveSettingsButton: document.getElementById('saveSettingsButton'),
  removeDialog: document.getElementById('removeDialog'),
  removePaperTitle: document.getElementById('removePaperTitle'),
  confirmRemoveButton: document.getElementById('confirmRemoveButton'),
  toast: document.getElementById('toast')
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function normalizeDoiUrl(value) {
  const doi = String(value || '').trim();
  if (!doi) return '';
  const identifier = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  return `https://doi.org/${identifier}`;
}

function getErrorMessage(error) {
  const message = String(error?.message || error || '操作失败。');
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function formatDate(value, includeTime = true) {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '—');
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short', day: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' })
  }).format(date);
}

function relativeTime(value) {
  if (!value) return '尚未检查';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function daysSince(value) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function showToast(message, type = 'success', duration = 3200) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
  state.toastTimer = setTimeout(() => { elements.toast.className = 'toast'; }, duration);
}

function renderStats() {
  const active = state.papers.filter((paper) => !paper.archivedAt);
  const archived = state.papers.filter((paper) => paper.archivedAt);
  const unread = state.papers.reduce((sum, paper) => sum + (Number(paper.unreadCount) || 0), 0);
  elements.paperCount.textContent = String(active.length);
  elements.navPaperCount.textContent = String(active.length);
  elements.archivedCount.textContent = String(archived.length);
  elements.updateCount.textContent = String(unread);
  elements.notificationCount.textContent = String(unread);
  elements.notificationCount.title = `${unread} 条未读重要更新`;
  const successes = state.papers.map((paper) => paper.lastSuccessfulAt).filter(Boolean).sort().reverse();
  elements.lastCheck.textContent = successes.length ? relativeTime(successes[0]) : '尚未成功同步';
}

function futureTime(value) {
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 60_000) return '即将';
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.ceil(hours / 24)} 天后`;
}

function renderMonitoringStatus() {
  const label = elements.monitoringStatus.querySelector('span');
  const active = state.papers.filter((paper) => !paper.archivedAt);
  elements.monitoringStatus.className = 'live-indicator';
  if (state.refreshingIds.size) {
    elements.monitoringStatus.classList.add('is-refreshing');
    label.textContent = `正在刷新 ${state.refreshingIds.size} 篇`;
    return;
  }
  const failures = active.filter((paper) => paper.lastError);
  if (!state.settings?.autoRefresh) {
    elements.monitoringStatus.classList.add('is-off');
    label.textContent = failures.length ? `自动检查已关闭 · ${failures.length} 篇上次同步失败` : '自动检查已关闭';
    return;
  }
  if (failures.length) {
    const retries = failures.map((paper) => paper.nextRetryAt).filter(Boolean).sort();
    elements.monitoringStatus.classList.add('has-failures');
    label.textContent = `${failures.length} 篇同步失败${retries.length ? `，${futureTime(retries[0])}重试` : ''}`;
    return;
  }
  if (!active.length) {
    elements.monitoringStatus.classList.add('is-off');
    label.textContent = '暂无正在追踪稿件';
    return;
  }
  const interval = (Number(state.settings?.refreshMinutes) || 360) * 60_000;
  const due = active.map((paper) => {
    if (paper.lastError && paper.nextRetryAt) return Date.parse(paper.nextRetryAt);
    return Date.parse(paper.lastAttemptAt || paper.lastSuccessfulAt || 0) + interval;
  }).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const nextCheck = futureTime(due);
  label.textContent = nextCheck === '即将' ? '自动监测中 · 即将检查' : `自动监测中 · 下次检查在 ${nextCheck}`;
}

function renderReviewHistory(paper) {
  const history = [...(paper.history || [])].reverse();
  const records = history.map((item) => {
    const description = Array.isArray(item.changes) && item.changes.length
      ? item.changes.join('；')
      : item.status?.label || '状态记录';
    return `<li><time>${escapeHtml(formatDate(item.checkedAt))}</time><span class="timeline-dot"></span><b>${escapeHtml(description)}</b></li>`;
  });
  if (paper.submissionDate) {
    records.push(`<li><time>${escapeHtml(formatDate(paper.submissionDate, false))}</time><span class="timeline-dot submission"></span><b>稿件首次提交至期刊</b></li>`);
  }
  if (!records.length) return '<p class="paper-meta">暂无历史记录</p>';
  return `<div class="timeline-scroll"><ul class="timeline">${records.join('')}</ul></div>`;
}

function renderProductionHistory(paper) {
  const records = (paper.productionEvents || []).map((event) => (
    `<li><time>${escapeHtml(event.dateText || '—')}</time><span class="timeline-dot production"></span><b>${escapeHtml(event.label)}</b></li>`
  ));
  if (paper.acceptedDate) {
    records.push(`<li><time>${escapeHtml(paper.acceptedDate)}</time><span class="timeline-dot production"></span><b>文章已接收，进入出版准备阶段</b></li>`);
  }
  if (paper.submissionDate) {
    records.push(`<li><time>${escapeHtml(formatDate(paper.submissionDate, false))}</time><span class="timeline-dot submission"></span><b>稿件首次提交至期刊</b></li>`);
  }
  records.push('<li class="timeline-note"><time>接收前</time><span class="timeline-dot muted"></span><b>Elsevier 出版页面不提供完整审稿节点；从投稿阶段添加 Author Hub 追踪链接后，PaperTrail 会在本机持续记录这些变化。</b></li>');
  return `<div class="timeline-scroll"><ul class="timeline">${records.join('')}</ul></div>`;
}

function renderReviewMetrics(paper) {
  const count = paper.counts || { invited: 0, accepted: 0, completed: 0 };
  return `<div class="paper-metrics review-metrics">
    <div class="metric"><small>阶段持续时间</small><strong class="accent">已观察至少 ${daysSince(paper.observedStageStartedAt)} 天</strong></div>
    <div class="metric"><small>邀请审稿人</small><strong>${count.invited}</strong></div>
    <div class="metric"><small>接受邀请</small><strong>${count.accepted}</strong></div>
    <div class="metric"><small>完成审稿</small><strong>${count.completed}</strong></div>
    <div class="metric"><small>投稿日期</small><strong>${escapeHtml(formatDate(paper.submissionDate, false))}</strong></div>
  </div>`;
}

function renderProductionMetrics(paper) {
  const doi = String(paper.doi || '').trim();
  const doiUrl = normalizeDoiUrl(doi);
  const doiMarkup = doiUrl
    ? `<button class="doi-copy-button" type="button" data-action="copy-doi" data-copy-text="${escapeHtml(doiUrl)}" data-tooltip="${escapeHtml(doiUrl)}" title="${escapeHtml(doiUrl)}" aria-label="复制 DOI 链接：${escapeHtml(doiUrl)}"><strong class="truncate">${escapeHtml(doi)}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button>`
    : '<strong>待分配</strong>';
  return `<div class="paper-metrics production-metrics">
    <div class="metric"><small>阶段持续时间</small><strong class="accent">已观察至少 ${daysSince(paper.observedStageStartedAt)} 天</strong></div>
    <div class="metric"><small>生产编号</small><strong>${escapeHtml(paper.articleReference || '—')}</strong></div>
    <div class="metric"><small>通讯作者</small><strong>${escapeHtml(paper.correspondingAuthor || '—')}</strong></div>
    <div class="metric"><small>接收日期</small><strong>${escapeHtml(paper.acceptedDate || '—')}</strong></div>
    <div class="metric doi-metric"><small>DOI</small>${doiMarkup}</div>
  </div>`;
}

function renderPaper(paper) {
  const refreshing = state.refreshingIds.has(paper.id);
  const production = paper.kind === 'production' || paper.source === 'elsevier-production';
  const expanded = state.expandedIds.has(paper.id);
  const unread = Number(paper.unreadCount) || 0;
  const sourceLabel = production
    ? `出版追踪 · ${paper.articleReference || 'Accepted article'}`
    : `审稿追踪 · Revision ${paper.latestRevision}`;
  const historyTitle = production ? '投稿、接收与出版时间线' : '投稿与审稿时间线';
  const history = production ? renderProductionHistory(paper) : renderReviewHistory(paper);
  const updateList = (paper.importantUpdates || []).slice().reverse().slice(0, 10).map((update) => (
    `<li class="${update.isRead ? '' : 'is-unread'}"><time>${escapeHtml(formatDate(update.occurredAt))}</time><span>${escapeHtml(update.content)}</span><b>${update.isRead ? '已读' : '未读'}</b></li>`
  )).join('');
  const failureDetail = paper.lastError
    ? `<p class="paper-error"><strong>最近同步失败</strong> · 尝试于 ${escapeHtml(relativeTime(paper.lastAttemptAt))} · ${escapeHtml(paper.lastError)}<br><span>上次成功：${escapeHtml(relativeTime(paper.lastSuccessfulAt))}；连续失败 ${paper.failureStreak} 次${paper.nextRetryAt ? `；${escapeHtml(futureTime(paper.nextRetryAt))}自动重试` : ''}</span></p>`
    : '';
  const activeActions = `<button class="text-button ${refreshing ? 'spin' : ''}" data-action="refresh" type="button" ${refreshing ? 'disabled' : ''}>${refreshing ? '刷新中…' : '刷新'}</button><button class="text-button" data-action="open" type="button">打开官方页面</button><button class="text-button" data-action="archive" type="button">归档</button>`;
  const archivedActions = '<button class="text-button" data-action="restore" type="button">恢复追踪</button><button class="text-button" data-action="open" type="button">打开官方页面</button><button class="text-button remove" data-action="remove" type="button">永久删除</button>';
  return `<article class="paper-card ${production ? 'production-card' : ''} ${paper.archivedAt ? 'archived-card' : ''} ${unread ? 'unread-card' : ''}" data-paper-id="${escapeHtml(paper.id)}">
    <div class="paper-accent"></div>
    <div class="paper-main">
      <div class="paper-top">
        <div class="paper-heading"><div class="source-row"><span class="source-icon">${production ? 'P' : 'E'}</span><span class="paper-source">${escapeHtml(sourceLabel)}</span></div><h3 class="paper-title">${escapeHtml(paper.title)}</h3><p class="paper-journal">${escapeHtml(paper.journal)}</p></div>
        <div class="badge-stack">${unread ? `<span class="unread-badge">${unread} 条未读</span>` : ''}<span class="status-badge tone-${escapeHtml(paper.status.tone)}">${escapeHtml(paper.status.label)}</span></div>
      </div>
      ${production ? renderProductionMetrics(paper) : renderReviewMetrics(paper)}
      ${failureDetail}
    </div>
    <div class="paper-actions">
      <span class="paper-meta">最后成功同步 ${escapeHtml(relativeTime(paper.lastSuccessfulAt))}${paper.lastAttemptAt && paper.lastAttemptAt !== paper.lastSuccessfulAt ? `<i>·</i> 最近尝试 ${escapeHtml(relativeTime(paper.lastAttemptAt))}` : ''}</span>
      <div class="action-group"><button class="text-button" data-action="history" type="button">${expanded ? '收起进展' : '查看进展'}</button>${unread ? '<button class="text-button unread-action" data-action="mark-read" type="button">标记已读</button>' : ''}${paper.archivedAt ? archivedActions : activeActions}</div>
    </div>
    <div class="history-panel" ${expanded ? '' : 'hidden'}><div class="history-head"><h4>${historyTitle}</h4><div><button class="text-button" data-action="export-markdown" type="button">导出 Markdown</button><button class="text-button" data-action="export-csv" type="button">导出 CSV</button></div></div>${updateList ? `<section class="important-update-list"><h5>重要更新记录</h5><ul>${updateList}</ul></section>` : ''}${history}</div>
  </article>`;
}

function matchesSearch(paper) {
  const query = state.searchQuery.trim().toLocaleLowerCase('zh-CN');
  if (!query) return true;
  return [paper.title, paper.journal, paper.articleReference]
    .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query));
}

function sortPapers(papers) {
  return [...papers].sort((a, b) => {
    const aPriority = (Number(a.unreadCount) || 0) > 0 || a.needsAction ? 1 : 0;
    const bPriority = (Number(b.unreadCount) || 0) > 0 || b.needsAction ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    const changed = Date.parse(b.lastChangedAt || 0) - Date.parse(a.lastChangedAt || 0);
    if (changed) return changed;
    return Date.parse(b.addedAt || 0) - Date.parse(a.addedAt || 0);
  });
}

function getVisiblePapers() {
  return sortPapers(state.papers.filter((paper) => {
    if (!matchesSearch(paper)) return false;
    if (state.viewMode === 'important') return (Number(paper.unreadCount) || 0) > 0;
    if (state.viewMode === 'archived') return Boolean(paper.archivedAt);
    return !paper.archivedAt;
  }));
}

function render() {
  renderStats();
  renderMonitoringStatus();
  const visiblePapers = getVisiblePapers();
  elements.paperList.hidden = visiblePapers.length === 0;
  elements.paperList.innerHTML = visiblePapers.map(renderPaper).join('');
  elements.emptyState.hidden = visiblePapers.length > 0;
  elements.emptyAddButton.hidden = state.viewMode !== 'all';
  elements.markAllReadButton.hidden = state.viewMode !== 'important' || !visiblePapers.length;
  if (state.viewMode === 'important') {
    elements.pageTitle.textContent = '重要更新';
    elements.pageSubtitle.textContent = '这里仅显示尚未阅读的重要变化';
    elements.listDescription.textContent = `${visiblePapers.length} 篇稿件，共 ${visiblePapers.reduce((sum, paper) => sum + paper.unreadCount, 0)} 条未读更新`;
    elements.emptyTitle.textContent = '没有未读重要更新';
    elements.emptyDescription.textContent = '新的状态变化、审稿回复或出版节点会出现在这里；标记已读不会删除历史。';
  } else if (state.viewMode === 'archived') {
    elements.pageTitle.textContent = '已归档';
    elements.pageSubtitle.textContent = '保留历史和凭证，但暂停自动检查';
    elements.listDescription.textContent = `${visiblePapers.length} 篇已归档稿件`;
    elements.emptyTitle.textContent = '还没有归档稿件';
    elements.emptyDescription.textContent = '已出版或暂时不需要关注的稿件可以归档，之后仍可恢复追踪。';
  } else {
    elements.pageTitle.textContent = '全部稿件';
    elements.pageSubtitle.textContent = '集中查看论文进展与下一步待办';
    elements.listDescription.textContent = `${visiblePapers.length} 篇稿件，未读或需处理的稿件优先`;
    elements.emptyTitle.textContent = '还没有追踪中的稿件';
    elements.emptyDescription.textContent = '可使用 Author Hub 链接添加审稿中的稿件，也可以通过生产稿件编号和通讯作者信息添加已接收文章。';
  }
  if (state.searchQuery && !visiblePapers.length) {
    elements.emptyTitle.textContent = '没有匹配的稿件';
    elements.emptyDescription.textContent = '请尝试搜索标题、期刊名称或生产编号中的其他关键词。';
  }
  elements.allNavButton.classList.toggle('active', state.viewMode === 'all');
  elements.importantNavButton.classList.toggle('active', state.viewMode === 'important');
  elements.archivedNavButton.classList.toggle('active', state.viewMode === 'archived');
  const anyRefreshing = state.refreshingIds.size > 0;
  elements.refreshAllButton.disabled = anyRefreshing || !state.papers.some((paper) => !paper.archivedAt);
  elements.refreshAllButton.classList.toggle('spin', anyRefreshing);
}

function setAddMode(mode) {
  state.addMode = mode;
  const linkMode = mode === 'link';
  elements.addModeLink.classList.toggle('active', linkMode);
  elements.addModeAuthor.classList.toggle('active', !linkMode);
  elements.addModeLink.setAttribute('aria-selected', String(linkMode));
  elements.addModeAuthor.setAttribute('aria-selected', String(!linkMode));
  elements.linkModePanel.hidden = !linkMode;
  elements.authorModePanel.hidden = linkMode;
  elements.addError.textContent = '';
  setTimeout(() => (linkMode ? elements.trackingUrl : elements.productionReference).focus(), 40);
}

function openAddDialog() {
  elements.addError.textContent = '';
  elements.trackingUrl.value = '';
  elements.productionReference.value = '';
  elements.authorLastName.value = '';
  elements.authorFirstName.value = '';
  setAddMode('link');
  openDialog(elements.addDialog);
}

async function addPaper() {
  let payload;
  if (state.addMode === 'link') {
    const trackingUrl = elements.trackingUrl.value.trim();
    if (!trackingUrl) {
      elements.addError.textContent = '请先粘贴 Author Hub 追踪链接。';
      elements.trackingUrl.focus();
      return;
    }
    payload = { mode: 'link', trackingUrl };
  } else {
    const reference = elements.productionReference.value.trim();
    const lastName = elements.authorLastName.value.trim();
    const firstName = elements.authorFirstName.value.trim();
    if (!reference || !lastName) {
      elements.addError.textContent = '请填写生产稿件编号和通讯作者姓氏。';
      (reference ? elements.authorLastName : elements.productionReference).focus();
      return;
    }
    payload = { mode: 'author', reference, lastName, firstName };
  }

  elements.addError.textContent = '';
  elements.confirmAddButton.disabled = true;
  elements.confirmAddButton.textContent = '正在读取…';
  try {
    await api.addPaper(payload);
    elements.addDialog.close();
    showToast(state.addMode === 'author' ? '已添加文章并保存出版进展。' : '已添加稿件并保存审稿进展。');
  } catch (error) {
    elements.addError.textContent = getErrorMessage(error);
  } finally {
    elements.confirmAddButton.disabled = false;
    elements.confirmAddButton.textContent = '读取并添加';
  }
}

function populateSettingsMetadata() {
  const settings = state.settings || {};
  const version = settings.appVersion || '0.5.0';
  const backupCount = Number(settings.backupCount || 0);
  const backupFiles = Array.isArray(settings.backupFiles) ? settings.backupFiles : [];
  elements.dataDirectory.textContent = settings.dataDirectory || '系统默认位置';
  elements.dataDirectory.title = settings.dataDirectory || '';
  elements.backupSummary.textContent = backupCount ? `共 ${backupCount} 份旧备份，可安全删除` : '暂无旧数据备份';
  elements.backupSummary.title = backupFiles.join('\n');
  elements.deleteBackupsButton.disabled = backupCount === 0;
  elements.currentVersion.textContent = version;
  elements.footerVersion.textContent = version;
}

function populateSettings() {
  const settings = state.settings;
  document.getElementById('autoRefresh').checked = settings.autoRefresh;
  document.getElementById('refreshOnStartup').checked = settings.refreshOnStartup !== false;
  document.getElementById('refreshMinutes').value = String(settings.refreshMinutes);
  document.getElementById('notifications').checked = settings.notifications;
  document.getElementById('closeToTray').checked = settings.closeToTray;
  document.getElementById('startAtLogin').checked = settings.startAtLogin;
  populateSettingsMetadata();
}

const SETTINGS_SECTION_COPY = Object.freeze({
  general: ['通用', '刷新频率、后台行为与 Windows 启动方式'],
  notifications: ['消息通知', '控制值得关注的稿件进展提醒'],
  storage: ['存储管理', '管理本地数据位置和迁移后留下的备份'],
  about: ['关于 PaperTrail', '查看版本、隐私方式和产品信息']
});

function setSettingsSection(section) {
  if (!SETTINGS_SECTION_COPY[section]) return;
  state.settingsSection = section;
  elements.settingsNavButtons.forEach((button) => {
    const active = button.dataset.settingsSection === section;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  elements.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== section;
  });
  const [title, description] = SETTINGS_SECTION_COPY[section];
  elements.settingsSectionTitle.textContent = title;
  elements.settingsSectionDescription.textContent = description;
}

async function deleteDataBackups() {
  elements.settingsError.textContent = '';
  elements.deleteBackupsButton.disabled = true;
  try {
    const result = await api.deleteDataBackups();
    if (result?.settings) {
      state.settings = result.settings;
      populateSettingsMetadata();
    }
    if (!result?.canceled) {
      showToast(result.deletedCount ? `已删除 ${result.deletedCount} 份旧数据备份。` : '没有需要删除的旧数据备份。');
    }
  } catch (error) {
    elements.settingsError.textContent = getErrorMessage(error);
    populateSettingsMetadata();
  }
}

async function changeDataDirectory() {
  elements.settingsError.textContent = '';
  elements.changeDataDirectoryButton.disabled = true;
  try {
    const result = await api.chooseDataDirectory();
    if (result?.settings) {
      state.settings = result.settings;
      populateSettingsMetadata();
    }
    if (!result?.canceled) showToast('数据存储位置已更新，原位置的数据仍保留为备份。');
  } catch (error) {
    elements.settingsError.textContent = getErrorMessage(error);
  } finally {
    elements.changeDataDirectoryButton.disabled = false;
  }
}

function syncModalTitleBar() {
  const active = [elements.addDialog, elements.settingsDialog, elements.removeDialog]
    .some((dialog) => dialog.open);
  api.setModalWindowState(active).catch(() => {});
}

function openDialog(dialog) {
  const shouldAnimate = document.visibilityState === 'visible'
    && document.hasFocus()
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    && !state.lastInputWasKeyboard;
  if (shouldAnimate) dialog.classList.add('dialog-entering');
  dialog.showModal();
  if (shouldAnimate) {
    const finishEntering = () => dialog.classList.remove('dialog-entering');
    requestAnimationFrame(() => requestAnimationFrame(finishEntering));
    setTimeout(finishEntering, 60);
  }
  syncModalTitleBar();
}

function closeOnBackdrop(event) {
  const dialog = event.currentTarget;
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) dialog.close();
}

async function saveSettings() {
  elements.settingsError.textContent = '';
  elements.saveSettingsButton.disabled = true;
  try {
    state.settings = await api.updateSettings({
      autoRefresh: document.getElementById('autoRefresh').checked,
      refreshOnStartup: document.getElementById('refreshOnStartup').checked,
      refreshMinutes: Number(document.getElementById('refreshMinutes').value),
      notifications: document.getElementById('notifications').checked,
      closeToTray: document.getElementById('closeToTray').checked,
      startAtLogin: document.getElementById('startAtLogin').checked
    });
    render();
    elements.settingsDialog.close();
    showToast('设置已保存。');
  } catch (error) {
    elements.settingsError.textContent = getErrorMessage(error);
  } finally {
    elements.saveSettingsButton.disabled = false;
  }
}

async function handlePaperAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const card = button.closest('[data-paper-id]');
  const id = card?.dataset.paperId;
  const paper = state.papers.find((item) => item.id === id);
  if (!paper) return;

  if (button.dataset.action === 'copy-doi') {
    try {
      await api.copyText(button.dataset.copyText);
      showToast('DOI 链接复制成功', 'success', 1000);
    } catch (error) {
      showToast(getErrorMessage(error), 'error');
    }
    return;
  }

  if (button.dataset.action === 'history') {
    if (state.expandedIds.has(id)) {
      state.expandedIds.delete(id);
      render();
      return;
    }
    state.expandedIds.add(id);
    render();
    if (paper.unreadCount) {
      try {
        await api.markPaperRead(id);
        showToast('已将这篇稿件的重要更新标记为已读。', 'success', 1800);
      } catch (error) {
        showToast(getErrorMessage(error), 'error');
      }
    }
    return;
  }
  if (button.dataset.action === 'remove') {
    state.removeId = id;
    elements.removePaperTitle.textContent = paper.title;
    openDialog(elements.removeDialog);
    return;
  }

  try {
    if (button.dataset.action === 'mark-read') {
      await api.markPaperRead(id);
      showToast('已标记为已读。', 'success', 1500);
    }
    if (button.dataset.action === 'archive') {
      await api.archivePaper(id);
      state.expandedIds.delete(id);
      showToast('稿件已归档，历史和凭证均已保留。');
    }
    if (button.dataset.action === 'restore') {
      await api.restorePaper(id);
      showToast('已恢复追踪。');
    }
    if (button.dataset.action === 'refresh') {
      await api.refreshPaper(id);
      showToast('同步成功。');
    }
    if (button.dataset.action === 'open') await api.openTrackingPage(id);
    if (button.dataset.action === 'export-markdown' || button.dataset.action === 'export-csv') {
      const format = button.dataset.action === 'export-markdown' ? 'markdown' : 'csv';
      const result = await api.exportPaper(id, format);
      if (!result?.canceled) showToast(`已导出 ${format === 'markdown' ? 'Markdown' : 'CSV'} 时间线。`);
    }
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
  }
}

async function removeSelectedPaper() {
  if (!state.removeId) return;
  const removeId = state.removeId;
  elements.confirmRemoveButton.disabled = true;
  try {
    await api.removePaper(removeId);
    elements.removeDialog.close();
    state.expandedIds.delete(removeId);
    showToast('本地记录已永久删除。');
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
  } finally {
    state.removeId = null;
    elements.confirmRemoveButton.disabled = false;
  }
}

async function refreshAll() {
  elements.refreshAllButton.disabled = true;
  try {
    const results = await api.refreshAll();
    const failed = results.filter((result) => !result.ok).length;
    if (failed) showToast(`${results.length - failed} 篇成功，${failed} 篇失败。`, 'error');
    else showToast('全部稿件刷新完成。');
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
  }
}

async function markAllRead() {
  elements.markAllReadButton.disabled = true;
  try {
    const result = await api.markAllRead();
    showToast(result.changed ? `已将 ${result.changed} 篇稿件标记为已读。` : '没有未读更新。');
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
  } finally {
    elements.markAllReadButton.disabled = false;
  }
}

function bindEvents() {
  document.addEventListener('keydown', () => { state.lastInputWasKeyboard = true; }, { capture: true });
  document.addEventListener('pointerdown', () => { state.lastInputWasKeyboard = false; }, { capture: true });
  elements.addButton.addEventListener('click', openAddDialog);
  elements.emptyAddButton.addEventListener('click', openAddDialog);
  elements.confirmAddButton.addEventListener('click', addPaper);
  elements.closeAddDialogButton.addEventListener('click', () => elements.addDialog.close());
  elements.cancelAddButton.addEventListener('click', () => elements.addDialog.close());
  elements.addModeLink.addEventListener('click', () => setAddMode('link'));
  elements.addModeAuthor.addEventListener('click', () => setAddMode('author'));
  [elements.trackingUrl, elements.productionReference, elements.authorLastName, elements.authorFirstName].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') addPaper();
    });
  });
  elements.refreshAllButton.addEventListener('click', refreshAll);
  elements.markAllReadButton.addEventListener('click', markAllRead);
  elements.paperList.addEventListener('click', handlePaperAction);
  elements.allNavButton.addEventListener('click', () => { state.viewMode = 'all'; render(); });
  elements.importantNavButton.addEventListener('click', () => { state.viewMode = 'important'; render(); });
  elements.archivedNavButton.addEventListener('click', () => { state.viewMode = 'archived'; render(); });
  elements.paperSearch.addEventListener('input', () => {
    state.searchQuery = elements.paperSearch.value;
    render();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      elements.paperSearch.focus();
      elements.paperSearch.select();
    }
  });
  elements.settingsButton.addEventListener('click', () => {
    elements.settingsError.textContent = '';
    populateSettings();
    setSettingsSection(state.settingsSection);
    openDialog(elements.settingsDialog);
  });
  elements.settingsNavButtons.forEach((button) => {
    button.addEventListener('click', () => setSettingsSection(button.dataset.settingsSection));
  });
  elements.closeSettingsDialogButton.addEventListener('click', () => elements.settingsDialog.close());
  elements.cancelSettingsButton.addEventListener('click', () => elements.settingsDialog.close());
  elements.changeDataDirectoryButton.addEventListener('click', changeDataDirectory);
  elements.deleteBackupsButton.addEventListener('click', deleteDataBackups);
  elements.settingsDialog.addEventListener('click', closeOnBackdrop);
  elements.addDialog.addEventListener('click', closeOnBackdrop);
  elements.saveSettingsButton.addEventListener('click', saveSettings);
  elements.confirmRemoveButton.addEventListener('click', removeSelectedPaper);
  elements.removeDialog.addEventListener('close', () => { state.removeId = null; });
  [elements.addDialog, elements.settingsDialog, elements.removeDialog].forEach((dialog) => {
    dialog.addEventListener('close', () => {
      dialog.classList.remove('dialog-entering');
      syncModalTitleBar();
    });
    dialog.addEventListener('cancel', () => setTimeout(syncModalTitleBar, 0));
  });
}

async function initialize() {
  bindEvents();
  try {
    [state.papers, state.settings] = await Promise.all([api.listPapers(), api.getSettings()]);
    populateSettingsMetadata();
    render();
    api.onPapersChanged((papers) => { state.papers = papers; render(); });
    api.onRefreshState(({ ids }) => { state.refreshingIds = new Set(ids); render(); });
    setInterval(render, 60_000);
  } catch (error) {
    showToast(getErrorMessage(error), 'error');
  }
}

initialize();

'use strict';

(() => {
  const api = window.paperTrail?.jobRadar;
  if (!api) return;

  const state = { tab: 'recommendations', jobs: [], summary: null, settings: null, selectedId: null, kpi: null, loading: false };
  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const values = (value) => String(value || '').split(/[、,，;；/|\n]/).map((item) => item.trim()).filter(Boolean);
  const dateLabel = (value) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(value)) : '未设置';
  const isDueSoon = (value) => Number.isFinite(Date.parse(value)) && Date.parse(value) >= Date.now() && Date.parse(value) - Date.now() <= 3 * 86_400_000;
  const labelMap = { NEW: 'NEW', UPDATED: 'UPDATED', REOPENED: 'REOPENED', CLOSED: 'CLOSED', high: '高匹配', 'medium-high': '中高匹配', low: '低匹配', required: '必须', preferred: '优先', 'not-mentioned': '未提及' };
  const dimensionLabels = { direction: '岗位方向', major: '专业', education: '学历', english: '英语', location: '地点', industry: '行业', company: '企业', other: '其他' };
  const dimensionWeights = { direction: 25, major: 20, education: 15, english: 10, location: 10, industry: 10, company: 5, other: 5 };

  function showToast(message, tone) { window.showWorkbenchToast?.(message, tone); }
  function setLoading(loading) { state.loading = loading; $('radarLoading').hidden = !loading; document.querySelector('.radar-split-view').hidden = loading; $('radarRefreshButton').disabled = loading; $('radarRefreshButton').textContent = loading ? '正在刷新…' : '刷新岗位'; }

  function filters() {
    return {
      query: $('radarQuery').value,
      category: $('radarCategory').value,
      city: $('radarCity').value,
      education: $('radarEducation').value,
      english: $('radarEnglish').value,
      source: $('radarSource').value,
      batch: $('radarBatch').value,
      sort: $('radarSort').value,
      minimumMatchScore: state.kpi === 'high' ? 85 : undefined
    };
  }

  function kpiFiltered(jobs) {
    if (state.kpi === 'today') return jobs.filter((job) => String(job.discoveredAt || '').slice(0, 10) === new Date().toISOString().slice(0, 10));
    if (state.kpi === 'due') return jobs.filter((job) => isDueSoon(job.deadline));
    return jobs;
  }

  function optionValues(jobs, read) { return [...new Set(jobs.map(read).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')); }
  function syncSelect(id, entries) {
    const select = $(id); const current = select.value;
    select.innerHTML = `<option value="">不限</option>${entries.map((entry) => `<option value="${escape(entry.value ?? entry)}">${escape(entry.label ?? entry)}</option>`).join('')}`;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function renderFilters(jobs) {
    syncSelect('radarCategory', optionValues(jobs, (job) => job.category));
    syncSelect('radarCity', optionValues(jobs, (job) => job.city));
    syncSelect('radarBatch', optionValues(jobs, (job) => job.recruitmentBatch));
    syncSelect('radarSource', optionValues(jobs, (job) => job.source?.id || job.source?.name).map((value) => ({ value, label: jobs.find((job) => (job.source?.id || job.source?.name) === value)?.source?.name || value })));
  }

  function jobCard(job) {
    const tags = [job.category, job.education?.level || job.education, job.majors?.[0], job.source?.name, dateLabel(job.updatedAt)].filter(Boolean);
    if (job.deadline) tags.push(`<span class="${isDueSoon(job.deadline) ? 'deadline-soon' : ''}">截止 ${escape(dateLabel(job.deadline))}</span>`);
    return `<button class="radar-job-card${state.selectedId === job.id ? ' selected' : ''}" data-radar-job="${escape(job.id)}" type="button"><div><span class="radar-state">${escape(labelMap[job.state] || job.state)}</span><h3>${escape(job.role)}</h3><p>${escape(job.company)} · ${escape(job.city || '地点未注明')}</p></div><div class="radar-score">${job.match.score}<small>${escape(labelMap[job.match.level])}</small></div><div class="radar-tags">${tags.map((tag) => String(tag).startsWith('<span') ? tag : `<span>${escape(tag)}</span>`).join('')}</div></button>`;
  }

  function renderList() {
    const visible = kpiFiltered(state.jobs);
    $('radarJobList').innerHTML = visible.length ? visible.map(jobCard).join('') : `<div class="radar-empty"><strong>${state.settings?.sources?.length ? '暂时没有符合条件的岗位' : '建立你的第一条岗位雷达'}</strong><p>${state.settings?.sources?.length ? '调整筛选条件，或刷新已有岗位源。' : '先设置求职偏好，再添加企业招聘官网或粘贴公开招聘链接。'}</p><div><button class="button secondary" data-radar-empty-action="preferences" type="button">设置求职偏好</button> <button class="button primary" data-radar-empty-action="source" type="button">添加岗位源</button></div></div>`;
    const current = visible.find((job) => job.id === state.selectedId);
    if (state.selectedId && !current) state.selectedId = null;
    renderDetail(current || null);
  }

  function requirements(job) {
    const education = job.education?.level || job.education || '未提及';
    const major = job.majors?.join('、') || '未提及';
    const english = job.english || {};
    return [['学历', education], ['专业', major], ['CET-4', labelMap[english.cet4] || '未提及'], ['CET-6', labelMap[english.cet6] || '未提及'], ['地点', job.city || '未提及'], ['其他硬性条件', job.requirements?.other?.join?.('、') || job.requirements?.other || '未提及']];
  }

  function renderDetail(job) {
    const detail = $('radarDetail');
    if (!job) { detail.classList.remove('open'); detail.innerHTML = '<div class="radar-detail-empty"><strong>选择一个岗位</strong><p>查看匹配分析、岗位要求与岗位动态。</p></div>'; return; }
    const dimensions = Object.entries(job.match.dimensionScores || {}).map(([key, score]) => `<div><span>${escape(dimensionLabels[key] || key)}</span><i><b style="width:${Math.round((score / dimensionWeights[key]) * 100)}%"></b></i><strong>${escape(score)}</strong></div>`).join('');
    detail.innerHTML = `<div class="radar-detail-head"><span class="radar-state">${escape(job.state)}</span><h2>${escape(job.role)}</h2><p>${escape(job.company)} · ${escape(job.city || '地点未注明')}</p></div><div class="radar-detail-meta"><div><span>招聘批次</span><strong>${escape(job.recruitmentBatch || '未提及')}</strong></div><div><span>来源</span><strong>${escape(job.source?.name || '手动添加')}</strong></div><div><span>截止时间</span><strong>${escape(dateLabel(job.deadline))}</strong></div><div><span>岗位方向</span><strong>${escape(job.category || '未分类')}</strong></div></div><section class="radar-match-card"><div class="radar-match-score"><span>总匹配度 · ${escape(labelMap[job.match.level])}</span><strong>${job.match.score}</strong></div><div class="radar-dimensions">${dimensions}</div></section><div class="radar-analysis"><section><h3>推荐理由</h3><ul>${(job.match.reasons?.length ? job.match.reasons : ['尚无明确推荐理由']).map((item) => `<li>${escape(item)}</li>`).join('')}</ul></section><section><h3>风险项</h3><ul>${(job.match.risks?.length ? job.match.risks : ['暂未发现明显风险']).map((item) => `<li>${escape(item)}</li>`).join('')}</ul></section></div><div class="radar-requirements">${requirements(job).map(([name, value]) => `<div><span>${escape(name)}</span><strong>${escape(value)}</strong></div>`).join('')}</div><section class="radar-description"><h3>岗位描述</h3><p>${escape(job.description || '该来源没有提供可读取的岗位描述。')}</p></section><section class="radar-timeline"><h3>岗位动态</h3><p>首次发现 ${escape(dateLabel(job.discoveredAt))}\n最近更新 ${escape(dateLabel(job.updatedAt))}${job.state === 'REOPENED' ? '\n岗位重新开放' : ''}${job.state === 'CLOSED' ? '\n岗位已关闭' : ''}</p></section><div class="radar-detail-actions"><button class="button secondary" data-radar-action="save-later" type="button">稍后再看</button><button class="button secondary" data-radar-action="hide" type="button">不感兴趣</button><button class="button primary" data-radar-action="apply" type="button">加入我的投递</button><button class="button secondary" data-radar-action="open" type="button"${job.sourceUrl ? '' : ' disabled'}>打开官网投递</button></div>`;
    detail.classList.add('open');
  }

  function renderSummary() {
    const summary = state.summary || {};
    $('radarTodayNew').textContent = String(summary.todayNew || 0); $('radarHighMatch').textContent = String(summary.highMatch || 0); $('radarDueSoon').textContent = String(summary.dueSoon || 0); $('radarTrackedCompanies').textContent = String(summary.followedCompanies || 0);
    const stale = summary.refreshState?.stale || summary.refreshState?.status === 'error';
    $('radarStaleNotice').hidden = !stale;
    $('radarStaleNotice').textContent = summary.refreshState?.error || '部分岗位源未能刷新，正在显示上次成功缓存。';
  }

  function renderManagement() {
    const sources = state.settings?.sources || [];
    $('radarSources').innerHTML = sources.length ? sources.map((source) => `<article class="radar-management-row"><div><strong>${escape(source.name)}</strong><small>${escape(source.type)}</small></div><span>${escape(source.url)}</span><span>${source.status === 'ok' ? '正常' : source.status === 'error' ? '访问失败' : source.enabled === false ? '暂停' : '需要检查'}</span><span>${escape(dateLabel(source.lastSuccessAt))}</span><span>发现 ${Number(source.foundCount) || 0} 个岗位${source.error ? ` · ${escape(source.error)}` : ''} · 自动追踪${source.enabled === false ? '关闭' : '开启'}</span><div class="radar-management-actions"><button class="button compact secondary" data-radar-refresh-source="${escape(source.id)}" type="button">刷新</button><button class="button compact text-button" data-radar-edit-source="${escape(source.id)}" type="button">编辑</button><button class="button compact text-button" data-radar-toggle-source="${escape(source.id)}" type="button">${source.enabled === false ? '恢复' : '暂停'}</button><button class="button compact text-button" data-radar-open-url="${escape(source.url)}" type="button">打开</button><button class="button compact text-button" data-radar-delete-source="${escape(source.id)}" type="button">删除</button></div></article>`).join('') : '<div class="radar-empty"><strong>还没有岗位源</strong><p>添加企业公开招聘官网或校招页面。</p></div>';
    const companies = state.settings?.followedCompanies || [];
    $('radarCompanies').innerHTML = companies.length ? companies.map((company) => `<article class="radar-management-row"><div><strong>${escape(company.name)}</strong><small>${escape(company.industry || '行业未设置')}</small></div><span>${escape(company.url || '招聘官网未设置')}</span><span>开放岗位 ${state.jobs.filter((job) => job.company === company.name && job.state !== 'CLOSED').length}</span><span>新岗位 ${state.jobs.filter((job) => job.company === company.name && job.state === 'NEW').length}</span><span>${company.status === 'paused' ? '已暂停' : '追踪中'} · ${escape(dateLabel(company.lastCheckedAt))}</span><div class="radar-management-actions"><button class="button compact secondary" data-radar-refresh-company="${escape(company.id)}" type="button">刷新</button><button class="button compact text-button" data-radar-edit-company="${escape(company.id)}" type="button">编辑</button><button class="button compact text-button" data-radar-toggle-company="${escape(company.id)}" type="button">${company.status === 'paused' ? '恢复' : '暂停'}</button>${company.url ? `<button class="button compact text-button" data-radar-open-url="${escape(company.url)}" type="button">打开</button>` : ''}<button class="button compact text-button" data-radar-delete-company="${escape(company.id)}" type="button">删除</button></div></article>`).join('') : '<div class="radar-empty"><strong>还没有关注企业</strong><p>添加企业后可集中查看开放岗位和追踪状态。</p></div>';
  }

  async function load({ preserveFilters = true } = {}) {
    setLoading(true);
    try {
      const [summary, settings, allJobs] = await Promise.all([api.getSummary(), api.getProfile(), api.list({ minimumMatchScore: 0 })]);
      state.summary = summary; state.settings = settings;
      renderFilters(allJobs);
      state.jobs = await api.list(filters());
      if (!preserveFilters) state.selectedId = null;
      renderSummary(); renderList(); renderManagement(); renderHome();
    } catch (error) { showToast(error.message || '求职雷达加载失败', 'error'); }
    finally { setLoading(false); }
  }

  async function refresh(request = {}) {
    setLoading(true);
    try { const result = await api.refresh(request); showToast(result.failedSources ? `已刷新，${result.failedSources} 个岗位源失败并保留旧缓存` : '岗位已刷新'); }
    catch (error) { showToast(error.message || '岗位刷新失败，旧缓存已保留', 'error'); }
    finally { await load(); }
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-radar-tab]').forEach((button) => button.classList.toggle('active', button.dataset.radarTab === tab));
    document.querySelectorAll('[data-radar-panel]').forEach((panel) => { panel.hidden = panel.dataset.radarPanel !== tab; });
    if (tab === 'applications') window.dispatchEvent(new Event('resize'));
  }

  function openPreferences() {
    const profile = state.settings?.profile || {}, preferences = state.settings?.preferences || {};
    $('radarProfileEducation').value = profile.highestEducation || ''; $('radarProfileMajor').value = profile.major || ''; $('radarProfileCet4').checked = profile.cet4 === true; $('radarProfileCet6').checked = profile.cet6 === true; $('radarPreferenceDirections').value = (preferences.directions || []).join('、'); $('radarPreferenceCities').value = (preferences.cities || []).join('、'); $('radarPreferenceIndustries').value = (preferences.industries || []).join('、'); $('radarPreferenceCompanies').value = (preferences.companyPreferences || []).join('、'); $('radarPreferenceMinimum').value = preferences.minimumMatchScore ?? 70; $('radarMinimumValue').textContent = $('radarPreferenceMinimum').value;
    $('radarDrawerBackdrop').hidden = false; $('radarPreferenceDrawer').hidden = false; $('radarProfileEducation').focus();
  }
  function closePreferences() { $('radarDrawerBackdrop').hidden = true; $('radarPreferenceDrawer').hidden = true; }

  async function renderHome() {
    const container = $('homeJobSummary'); if (!container) return;
    let summary = state.summary;
    if (!summary) { try { summary = await api.getSummary(); state.summary = summary; } catch { return; } }
    const heading = container.closest('.home-job-panel')?.querySelector('.panel-heading');
    if (heading) heading.innerHTML = '<div><p class="eyebrow">JOB RADAR</p><h2>求职雷达</h2><p>岗位发现与投递进展</p></div><button class="text-button" data-go-page="jobs" type="button">查看全部</button>';
    let applications = [];
    try { applications = (await window.paperTrail.getWorkspace()).jobApplications || []; } catch { /* recommendation summary remains useful */ }
    const stageName = (job) => job.workflow?.stages?.find((stage) => stage.id === job.workflow?.currentStageId)?.name || '';
    const applicationRows = [
      ['进行中投递', applications.filter((job) => job.status !== 'closed').length],
      ['面试', applications.filter((job) => /面试/.test(stageName(job))).length],
      ['Offer', applications.filter((job) => /offer/i.test(stageName(job))).length]
    ];
    container.innerHTML = `<button class="home-job-row" data-go-page="jobs" type="button"><span>今日新增</span><i><b class="is-medium"></b></i><strong>${summary.todayNew || 0}</strong></button><button class="home-job-row" data-go-page="jobs" type="button"><span>高匹配</span><i><b class="is-strong"></b></i><strong>${summary.highMatch || 0}</strong></button><button class="home-job-row" data-go-page="jobs" type="button"><span>即将截止</span><i><b class="is-light"></b></i><strong>${summary.dueSoon || 0}</strong></button>${applicationRows.map(([label, count]) => `<button class="home-job-row" data-go-page="jobs" data-radar-home-applications type="button"><span>${label}</span><i><b class="is-light"></b></i><strong>${count}</strong></button>`).join('')}`;
  }

  function bind() {
    document.body.addEventListener('click', async (event) => {
      const tab = event.target.closest('[data-radar-tab]'); if (tab) { switchTab(tab.dataset.radarTab); return; }
      if (event.target.closest('[data-radar-home-applications]')) { switchTab('applications'); return; }
      const card = event.target.closest('[data-radar-job]'); if (card) { state.selectedId = card.dataset.radarJob; await api.markSeen(state.selectedId); renderList(); return; }
      const emptyAction = event.target.closest('[data-radar-empty-action]'); if (emptyAction) { emptyAction.dataset.radarEmptyAction === 'preferences' ? openPreferences() : $('radarSourceDialog').showModal(); return; }
      const kpi = event.target.closest('[data-radar-kpi]'); if (kpi) { state.kpi = state.kpi === kpi.dataset.radarKpi ? null : kpi.dataset.radarKpi; document.querySelectorAll('[data-radar-kpi]').forEach((item) => item.classList.toggle('active', item.dataset.radarKpi === state.kpi)); renderList(); return; }
      const action = event.target.closest('[data-radar-action]'); if (action && state.selectedId) {
        const job = state.jobs.find((item) => item.id === state.selectedId); if (!job) return;
        try {
          if (action.dataset.radarAction === 'hide') { await api.setHidden(job.fingerprint, true); state.selectedId = null; await load(); showToast('已标记为不感兴趣'); }
          if (action.dataset.radarAction === 'save-later') { await api.markSeen(job.id); showToast('已保存，稍后可以继续查看'); }
          if (action.dataset.radarAction === 'apply') { await api.addToApplications(job.id); switchTab('applications'); showToast('已加入我的投递，状态为准备中'); }
          if (action.dataset.radarAction === 'open') await api.openSource(job.id);
        } catch (error) { showToast(error.message || '操作失败', 'error'); }
        return;
      }
      const refreshSource = event.target.closest('[data-radar-refresh-source]'); if (refreshSource) return refresh({ sourceId: refreshSource.dataset.radarRefreshSource });
      const editSource = event.target.closest('[data-radar-edit-source]'); if (editSource) { const source = state.settings.sources.find((item) => item.id === editSource.dataset.radarEditSource); const form = $('radarSourceForm'); form.dataset.editId = source.id; $('radarSourceName').value = source.name; $('radarSourceType').value = source.type; $('radarSourceUrl').value = source.url; $('radarSourceDialog').showModal(); return; }
      const toggleSource = event.target.closest('[data-radar-toggle-source]'); if (toggleSource) { const source = state.settings.sources.find((item) => item.id === toggleSource.dataset.radarToggleSource); await api.saveSource({ ...source, enabled: source.enabled === false }); return load(); }
      const deleteSource = event.target.closest('[data-radar-delete-source]'); if (deleteSource) { await api.deleteSource(deleteSource.dataset.radarDeleteSource); return load(); }
      const editCompany = event.target.closest('[data-radar-edit-company]'); if (editCompany) { const company = state.settings.followedCompanies.find((item) => item.id === editCompany.dataset.radarEditCompany); const form = $('radarCompanyForm'); form.dataset.editId = company.id; $('radarCompanyName').value = company.name; $('radarCompanyIndustry').value = company.industry || ''; $('radarCompanyUrl').value = company.url || ''; $('radarCompanyDialog').showModal(); return; }
      const refreshCompany = event.target.closest('[data-radar-refresh-company]'); if (refreshCompany) { const company = state.settings.followedCompanies.find((item) => item.id === refreshCompany.dataset.radarRefreshCompany); if (!company.url) return showToast('请先为企业设置招聘官网', 'error'); const existingSource = state.settings.sources.find((source) => source.url === company.url); if (existingSource) return refresh({ sourceId: existingSource.id }); setLoading(true); try { await api.importUrl({ name: company.name, type: 'official', url: company.url }); showToast('企业岗位已刷新'); } catch (error) { showToast(error.message || '企业刷新失败', 'error'); } finally { await load(); } return; }
      const toggleCompany = event.target.closest('[data-radar-toggle-company]'); if (toggleCompany) { const company = state.settings.followedCompanies.find((item) => item.id === toggleCompany.dataset.radarToggleCompany); await api.followCompany({ ...company, status: company.status === 'paused' ? 'active' : 'paused' }); return load(); }
      const deleteCompany = event.target.closest('[data-radar-delete-company]'); if (deleteCompany) { await api.unfollowCompany(deleteCompany.dataset.radarDeleteCompany); return load(); }
      const openUrl = event.target.closest('[data-radar-open-url]'); if (openUrl) { await window.paperTrail.openExternal(openUrl.dataset.radarOpenUrl); return; }
      const closeDialog = event.target.closest('[data-close-radar-dialog]'); if (closeDialog) $(closeDialog.dataset.closeRadarDialog).close();
      if (event.target.closest('[data-close-radar-drawer]') || event.target === $('radarDrawerBackdrop')) closePreferences();
    });
    const openNewSource = () => { $('radarSourceForm').reset(); delete $('radarSourceForm').dataset.editId; $('radarSourceDialog').showModal(); };
    const openNewCompany = () => { $('radarCompanyForm').reset(); delete $('radarCompanyForm').dataset.editId; $('radarCompanyDialog').showModal(); };
    $('radarRefreshButton').addEventListener('click', () => refresh()); $('radarAddUrlButton').addEventListener('click', openNewSource); $('radarAddSourceButton').addEventListener('click', openNewSource); $('radarAddCompanyButton').addEventListener('click', openNewCompany); $('radarPreferenceButton').addEventListener('click', openPreferences); $('jobSettingsButton').addEventListener('click', openPreferences);
    document.querySelectorAll('.radar-filter-bar input,.radar-filter-bar select').forEach((control) => control.addEventListener(control.type === 'search' ? 'input' : 'change', () => load()));
    $('radarPreferenceMinimum').addEventListener('input', () => { $('radarMinimumValue').textContent = $('radarPreferenceMinimum').value; });
    $('radarPreferenceForm').addEventListener('submit', async (event) => { event.preventDefault(); try { state.settings = await api.saveProfile({ profile: { highestEducation: $('radarProfileEducation').value, major: $('radarProfileMajor').value.trim(), cet4: $('radarProfileCet4').checked, cet6: $('radarProfileCet6').checked }, preferences: { directions: values($('radarPreferenceDirections').value), cities: values($('radarPreferenceCities').value), industries: values($('radarPreferenceIndustries').value), companyPreferences: values($('radarPreferenceCompanies').value), minimumMatchScore: Number($('radarPreferenceMinimum').value) } }); closePreferences(); await load(); showToast('求职偏好已保存'); } catch (error) { showToast(error.message || '偏好保存失败', 'error'); } });
    $('radarSourceForm').addEventListener('submit', async (event) => { event.preventDefault(); $('radarSourceError').textContent = ''; try { const existing = state.settings.sources.find((source) => source.id === event.target.dataset.editId); const payload = { ...existing, id: event.target.dataset.editId, name: $('radarSourceName').value, type: $('radarSourceType').value, url: $('radarSourceUrl').value }; if (payload.id) { await api.saveSource(payload); await api.refresh({ sourceId: payload.id }); } else await api.importUrl(payload); $('radarSourceDialog').close(); event.target.reset(); delete event.target.dataset.editId; await load(); showToast(payload.id ? '岗位源已更新' : '岗位源已添加'); } catch (error) { $('radarSourceError').textContent = error.message || '岗位源添加失败'; } });
    $('radarCompanyForm').addEventListener('submit', async (event) => { event.preventDefault(); $('radarCompanyError').textContent = ''; try { await api.followCompany({ id: event.target.dataset.editId, name: $('radarCompanyName').value, industry: $('radarCompanyIndustry').value, url: $('radarCompanyUrl').value }); $('radarCompanyDialog').close(); event.target.reset(); delete event.target.dataset.editId; await load(); showToast('企业信息已保存'); } catch (error) { $('radarCompanyError').textContent = error.message || '企业添加失败'; } });
  }

  window.YanjiJobRadar = { renderHome, load, switchTab };
  bind(); load({ preserveFilters: false });
})();

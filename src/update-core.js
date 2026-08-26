'use strict';

const UPDATE_STATUSES = new Set([
  'idle',
  'checking',
  'available',
  'up-to-date',
  'downloading',
  'downloaded',
  'not-published',
  'empty-feed',
  'error',
  'unavailable'
]);

function cleanVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  return match ? match[1] : null;
}

function cleanText(value, fallback = '') {
  return String(value || fallback)
    .replace(/https?:\/\/\S+/gi, '更新服务器')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 240);
}

function friendlyUpdateError(error) {
  const source = cleanText(error?.message || error || '检查更新失败。');
  if (/404|latest(?:-|\.)ya?ml|no published versions|cannot find/i.test(source)) {
    return '更新服务器暂未发布可下载版本。';
  }
  if (/net::|network|timed?\s*out|internet|connection|ENOTFOUND|ECONN/i.test(source)) {
    return '无法连接更新服务器，请检查网络后重试。';
  }
  if (/signature|sha512|checksum|integrity/i.test(source)) {
    return '更新文件校验失败，已停止安装。';
  }
  return source || '检查更新失败，请稍后重试。';
}

function isNotPublishedError(error) {
  return /404|latest(?:-|\.)ya?ml|no published versions|cannot find|release.*not found|empty feed/i.test(String(error?.message || error || ''));
}

function createInitialUpdateState({ currentVersion, packaged, portable, updaterAvailable = true }) {
  const version = cleanVersion(currentVersion) || '0.0.0';
  if (!packaged) {
    return {
      status: 'unavailable',
      currentVersion: version,
      latestVersion: null,
      releaseDate: null,
      percent: null,
      transferred: null,
      total: null,
      bytesPerSecond: null,
      portable: Boolean(portable),
      message: '开发环境不执行在线更新，请使用正式安装版验证。'
    };
  }
  if (portable) {
    return {
      status: 'unavailable',
      currentVersion: version,
      latestVersion: null,
      releaseDate: null,
      percent: null,
      transferred: null,
      total: null,
      bytesPerSecond: null,
      portable: true,
      message: '便携版请前往发布页下载新版；安装版支持应用内更新。'
    };
  }
  if (!updaterAvailable) {
    return {
      status: 'unavailable',
      currentVersion: version,
      latestVersion: null,
      releaseDate: null,
      percent: null,
      transferred: null,
      total: null,
      bytesPerSecond: null,
      portable: false,
      manualUpdate: true,
      componentUnavailable: true,
      message: '自动更新组件不可用，请前往 GitHub Releases 手动更新。'
    };
  }
  return {
    status: 'idle',
    currentVersion: version,
    latestVersion: null,
    releaseDate: null,
    percent: null,
    transferred: null,
    total: null,
    bytesPerSecond: null,
    portable: false,
    manualUpdate: false,
    componentUnavailable: false,
    message: '仅在你点击检查时连接 GitHub Releases。'
  };
}

function nextUpdateState(current, event, payload = {}) {
  const base = {
    ...current,
    currentVersion: cleanVersion(current?.currentVersion) || '0.0.0',
    portable: Boolean(current?.portable)
  };
  let next;
  if (event === 'checking') {
    next = { ...base, status: 'checking', message: '正在检查新版本…', percent: null };
  } else if (event === 'available') {
    const latestVersion = cleanVersion(payload.version);
    next = {
      ...base,
      status: 'available',
      latestVersion,
      releaseDate: payload.releaseDate || null,
      message: latestVersion ? `发现新版本 ${latestVersion}，可立即下载。` : '发现可下载的新版本。',
      percent: null
    };
  } else if (event === 'not-available') {
    next = {
      ...base,
      status: 'up-to-date',
      latestVersion: cleanVersion(payload.version) || base.currentVersion,
      releaseDate: payload.releaseDate || null,
      message: `当前 ${base.currentVersion} 已是最新版本。`,
      percent: null
    };
  } else if (event === 'not-published' || event === 'empty-feed') {
    next = {
      ...base,
      status: event,
      latestVersion: null,
      releaseDate: null,
      message: '更新服务器暂未发布可下载版本。',
      percent: null
    };
  } else if (event === 'download-start') {
    next = { ...base, status: 'downloading', message: '正在下载更新…', percent: 0 };
  } else if (event === 'download-progress') {
    const percent = Math.min(100, Math.max(0, Number(payload.percent) || 0));
    next = {
      ...base,
      status: 'downloading',
      message: `正在下载更新… ${Math.round(percent)}%`,
      percent,
      transferred: Number(payload.transferred) || 0,
      total: Number(payload.total) || 0,
      bytesPerSecond: Number(payload.bytesPerSecond) || 0
    };
  } else if (event === 'downloaded') {
    next = {
      ...base,
      status: 'downloaded',
      latestVersion: cleanVersion(payload.version) || base.latestVersion,
      releaseDate: payload.releaseDate || base.releaseDate,
      message: '更新已安全下载，点击后将重启并安装。',
      percent: 100
    };
  } else if (event === 'error') {
    next = { ...base, status: 'error', message: friendlyUpdateError(payload.error), percent: null };
  } else {
    next = base;
  }
  if (!UPDATE_STATUSES.has(next.status)) throw new Error('无效的更新状态。');
  return next;
}

module.exports = {
  cleanVersion,
  createInitialUpdateState,
  friendlyUpdateError,
  isNotPublishedError,
  nextUpdateState
};

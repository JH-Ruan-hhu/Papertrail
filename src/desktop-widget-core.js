'use strict';

function desktopWidgetPresentation({ attached = false, attempts = 0, supported = true } = {}) {
  if (attached) return { attached: true, mode: 'attached', diagnostic: null };
  return {
    attached: false,
    mode: 'floating',
    diagnostic: {
      code: supported ? 'DESKTOP_ATTACH_FAILED' : 'DESKTOP_ATTACH_UNSUPPORTED',
      message: supported
        ? '桌面小组件未能嵌入桌面图标层，已切换为普通悬浮窗口。'
        : '当前系统不支持桌面图标层嵌入，已切换为普通悬浮窗口。',
      attempts: Math.max(0, Number(attempts) || 0)
    }
  };
}

module.exports = { desktopWidgetPresentation };

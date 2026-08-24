'use strict';

function desktopWidgetPresentation({ attached = false, reserved = false, movedIcons = 0, attempts = 0, supported = true } = {}) {
  if (attached) return { attached: true, reserved: Boolean(reserved), movedIcons: Math.max(0, Number(movedIcons) || 0), mode: 'desktop', diagnostic: reserved ? null : {
    code: 'DESKTOP_ICON_RESERVATION_FAILED',
    message: '小组件已进入桌面层，但 Windows 未允许为它移动重叠图标。请关闭桌面图标自动排列后重试。'
  } };
  return {
    attached: false,
    reserved: false,
    movedIcons: 0,
    mode: 'unavailable',
    diagnostic: {
      code: supported ? 'DESKTOP_ATTACH_FAILED' : 'DESKTOP_ATTACH_UNSUPPORTED',
      message: supported
        ? '桌面小组件未能嵌入桌面图标层，未创建悬浮窗口。'
        : '当前系统不支持桌面图标层嵌入，未创建悬浮窗口。',
      attempts: Math.max(0, Number(attempts) || 0)
    }
  };
}

module.exports = { desktopWidgetPresentation };

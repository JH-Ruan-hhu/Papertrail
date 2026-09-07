'use strict';
(function (root) {
  const minHourHeight = (available, chrome = 98) => Math.max(36, Math.ceil(Math.max(0, available - chrome) / 16));
  const hourHeight = (value, available, chrome) => {
    const minimum = minHourHeight(available, chrome);
    return Math.max(minimum, Math.min(Math.max(96, minimum), Number(value) || 48));
  };
  const bottomScroll = (scrollHeight, clientHeight, gap) => Math.max(0, scrollHeight - clientHeight - gap);
  const snapMinutes = (pointerY, trackTop, trackHeight, offsetY = 0) => Math.max(480, Math.min(1410, Math.round((480 + (pointerY - trackTop - offsetY) / Math.max(1, trackHeight) * 960) / 30) * 30));
  const api = { minHourHeight, hourHeight, bottomScroll, snapMinutes };
  if (typeof module !== 'undefined') module.exports = api;
  else root.YanjiScheduleLayout = api;
}(globalThis));

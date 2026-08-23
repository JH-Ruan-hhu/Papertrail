'use strict';

(function installThemeRuntime() {
  const api = window.paperTrail;
  const allowed = new Set(['liquid-glass', 'classic']);
  function apply(settings = {}) {
    const theme = allowed.has(settings.appearanceTheme) ? settings.appearanceTheme : (document.documentElement.dataset.appearance || 'liquid-glass');
    document.documentElement.dataset.appearance = theme;
    try { localStorage.setItem('yanji.appearanceTheme', theme); } catch { /* local storage is optional */ }
  }
  window.yanjiTheme = { apply };
  if (api?.onSettingsChanged) api.onSettingsChanged(apply);
  if (api?.getSettings) api.getSettings().then(apply).catch(() => {});
}());

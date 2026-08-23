'use strict';

// This file runs before the first paint. It only reads a non-sensitive theme
// preference from the URL/local storage; the persisted setting is still
// authoritative in the main process when the page finishes loading.
(function bootstrapTheme() {
  const queryTheme = new URLSearchParams(location.search).get('appearance');
  let storedTheme = '';
  try { storedTheme = localStorage.getItem('yanji.appearanceTheme') || ''; } catch { /* private mode */ }
  const theme = ['liquid-glass', 'classic'].includes(queryTheme) ? queryTheme : storedTheme;
  document.documentElement.dataset.appearance = theme || 'liquid-glass';
}());

'use strict';

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const POINTER_WINDOW_MS = 900;
  let lastPointerAt = 0;

  function pointerInitiated() {
    return Date.now() - lastPointerAt < POINTER_WINDOW_MS;
  }

  function replayClass(element, className, timeout = 320) {
    if (!element) return;
    element.classList.remove(className);
    // A page or tab can be revisited before its previous animationend fires.
    // The double frame commits the reset without forcing a synchronous layout.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      element.classList.add(className);
      setTimeout(() => element.classList.remove(className), timeout);
    }));
  }

  function enterPage(section, { initial = false, force = false } = {}) {
    if (!section || (!force && !initial && !pointerInitiated())) return;
    section.classList.toggle('page-initial-entry', initial);
    replayClass(section, 'page-entering', initial ? 920 : 520);
    if (initial) setTimeout(() => section.classList.remove('page-initial-entry'), 940);
  }

  function animateDialog(dialog) {
    if (!dialog || reducedMotion.matches || !pointerInitiated()) return;
    dialog.classList.add('dialog-entering');
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.remove('dialog-entering')));
    setTimeout(() => dialog.classList.remove('dialog-entering'), 80);
  }

  function animateTab(panel) {
    if (!panel || !pointerInitiated()) return;
    replayClass(panel, 'motion-tab-entering', reducedMotion.matches ? 150 : 260);
  }

  function syncSidebarIndicator() {
    const nav = document.querySelector('.side-nav');
    const indicator = nav?.querySelector('.sidebar-active-indicator');
    const active = nav?.querySelector('.nav-item.active');
    if (!nav || !indicator) return;
    indicator.classList.toggle('is-hidden', !active);
    if (!active) return;
    indicator.style.setProperty('--motion-nav-y', `${active.offsetTop}px`);
    indicator.style.setProperty('--motion-nav-height', `${active.offsetHeight}px`);
  }

  function syncSettingsIndicator() {
    const nav = document.querySelector('.settings-nav');
    const indicator = nav?.querySelector('.settings-liquid-indicator');
    const active = nav?.querySelector('.settings-nav-item.active');
    if (!nav || !indicator || !active) return;
    indicator.style.setProperty('--motion-tab-x', `${active.offsetLeft}px`);
    indicator.style.setProperty('--motion-tab-width', `${active.offsetWidth}px`);
    indicator.style.setProperty('--motion-tab-height', `${active.offsetHeight}px`);
  }

  function syncIndicators() {
    syncSidebarIndicator();
    syncSettingsIndicator();
  }

  function init() {
    document.addEventListener('pointerdown', () => { lastPointerAt = Date.now(); }, { capture: true, passive: true });
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'class')) syncIndicators();
    });
    document.querySelectorAll('[data-workbench-page], [data-settings-section]').forEach((element) => {
      observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    });
    window.addEventListener('resize', () => requestAnimationFrame(syncIndicators), { passive: true });
    syncIndicators();
    document.body.classList.add('motion-system-ready');
    requestAnimationFrame(() => {
      document.body.classList.add('motion-shell-ready');
      enterPage(document.querySelector('[data-page="home"]'), { initial: true, force: true });
    });
  }

  window.YanjiMotion = Object.freeze({ animateDialog, animateTab, enterPage, pointerInitiated, syncIndicators });
  init();
})();

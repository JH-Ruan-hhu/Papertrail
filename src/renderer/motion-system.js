'use strict';

(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const HOME_MATRIX_SELECTOR = [
    '.home-progress-strip',
    '.home-next-event-card',
    '.home-today-card:not(.home-today-todo-card)',
    '.home-today-todo-card',
    '.home-attendance-card',
    '.home-schedule-panel',
    '.home-focus-timer',
    '.latest-notes-panel',
    '.home-job-panel'
  ].join(', ');
  const POINTER_WINDOW_MS = 900;
  const DIALOG_EXIT_MS = 170;
  let lastPointerAt = 0;

  function pointerInitiated() {
    return Date.now() - lastPointerAt < POINTER_WINDOW_MS;
  }

  function replayClass(element, className, timeout = 420) {
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
    if (section.classList.contains('home-page')) {
      animateHomeMatrices(section);
      return;
    }
    section.classList.toggle('page-initial-entry', initial);
    replayClass(section, 'page-entering', initial ? 1120 : 700);
    animatePageDetails(section);
    if (initial) setTimeout(() => section.classList.remove('page-initial-entry'), 1140);
  }

  function animateHomeMatrices(section) {
    if (!section) return [];
    const items = [...section.querySelectorAll(HOME_MATRIX_SELECTOR)].map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, top: rect.top, left: rect.left };
    }).sort((a, b) => a.top - b.top || a.left - b.left);

    const rows = [];
    items.forEach((item) => {
      const row = rows.at(-1);
      if (!row || Math.abs(item.top - row.top) >= 40) rows.push({ top: item.top, items: [item] });
      else row.items.push(item);
    });
    const ordered = rows.flatMap((row, rowIndex) => row.items.sort((a, b) => a.left - b.left).map((item, columnIndex) => {
      item.element.style.setProperty('--home-enter-wave', rowIndex + columnIndex);
      item.element.style.setProperty('--home-enter-row', rowIndex);
      item.element.style.setProperty('--home-enter-column', columnIndex);
      return item;
    }));
    replayClass(section, 'home-entering', reducedMotion.matches ? 160 : 720);
    return ordered.map(({ element }) => element);
  }

  function animateDialog(dialog) {
    if (!dialog || reducedMotion.matches || document.visibilityState !== 'visible' || !document.hasFocus() || !pointerInitiated()) return;
    dialog.classList.remove('dialog-closing');
    dialog.classList.add('dialog-entering');
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.remove('dialog-entering')));
    setTimeout(() => dialog.classList.remove('dialog-entering'), 260);
  }

  function closeDialog(dialog, callback) {
    if (!dialog?.open) {
      callback?.();
      return Promise.resolve(false);
    }
    if (dialog.classList.contains('dialog-closing')) return dialog._yanjiClosePromise || Promise.resolve(false);

    const finish = () => {
      dialog.classList.remove('dialog-entering', 'dialog-closing');
      if (dialog.open) dialog.close();
      callback?.();
      dialog._yanjiClosePromise = null;
      return true;
    };

    if (reducedMotion.matches || !pointerInitiated()) return Promise.resolve(finish());

    dialog.classList.add('dialog-closing');
    dialog._yanjiClosePromise = new Promise((resolve) => {
      let settled = false;
      const complete = () => {
        if (settled) return;
        settled = true;
        dialog.removeEventListener('animationend', onAnimationEnd);
        resolve(finish());
      };
      const onAnimationEnd = (event) => {
        if (event.target === dialog && event.animationName === 'motion-dialog-exit') complete();
      };
      dialog.addEventListener('animationend', onAnimationEnd);
      setTimeout(complete, DIALOG_EXIT_MS);
    });
    return dialog._yanjiClosePromise;
  }

  function animateTab(panel) {
    if (!panel || !pointerInitiated()) return;
    replayClass(panel, 'motion-tab-entering', reducedMotion.matches ? 180 : 360);
  }

  function animateList(container, selector, { limit = 8, className = 'motion-list-entering', delay = 0, stagger = 30 } = {}) {
    if (!container) return [];
    const items = [...container.querySelectorAll(selector)];
    items.forEach((element, index) => {
      element.classList.toggle('motion-list-item', index < limit);
      if (index < limit) element.style.setProperty('--motion-index', index);
      else element.style.removeProperty('--motion-index');
    });
    container.style.setProperty('--motion-list-delay', `${delay}ms`);
    container.style.setProperty('--motion-list-stagger', `${stagger}ms`);
    replayClass(container, className, reducedMotion.matches ? 160 : 620);
    return items.slice(0, limit);
  }

  function animateJobList(container) {
    if (!container) return [];
    container._yanjiJobObserver?.disconnect();
    const items = [...container.querySelectorAll('.job-position')];
    items.forEach((element) => {
      element.classList.remove('motion-job-visible');
      element.classList.add('motion-job-pending');
      element.style.removeProperty('--motion-index');
    });
    if (!items.length) return items;

    const reveal = (elements) => {
      elements.sort((a, b) => items.indexOf(a) - items.indexOf(b)).forEach((element, index) => {
        element.style.setProperty('--motion-index', reducedMotion.matches ? 0 : index);
        element.classList.add('motion-job-visible');
        const finish = () => {
          element.classList.remove('motion-job-pending', 'motion-job-visible');
          element.style.removeProperty('--motion-index');
        };
        element.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, reducedMotion.matches ? 180 : 420);
      });
    };

    if (typeof IntersectionObserver !== 'function') {
      reveal(items);
      return items;
    }

    const observer = new IntersectionObserver((entries) => {
      const entering = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
      if (!entering.length) return;
      entering.forEach((element) => observer.unobserve(element));
      reveal(entering);
    }, { threshold: .08, rootMargin: '0px 0px -8% 0px' });
    container._yanjiJobObserver = observer;
    items.forEach((element) => observer.observe(element));
    return items;
  }

  function animateStateChange(element, className = 'motion-state-changing', timeout = 300) {
    if (!element) return Promise.resolve(false);
    const duration = reducedMotion.matches ? 120 : timeout;
    element.classList.remove(className);
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        element.classList.add(className);
        setTimeout(() => {
          element.classList.remove(className);
          resolve(true);
        }, duration);
      }));
    });
  }

  async function transitionSchedule(board, direction, update) {
    if (!board) {
      update?.();
      return;
    }
    if (reducedMotion.matches || typeof board.animate !== 'function') {
      update?.();
      return;
    }
    const sign = direction === 'previous' ? 1 : -1;
    await board.animate([
      { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      { opacity: .25, transform: `translate3d(${sign * 18}px, 0, 0)` }
    ], { duration: 110, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'forwards' }).finished.catch(() => {});
    update?.();
    await board.animate([
      { opacity: .25, transform: `translate3d(${-sign * 18}px, 0, 0)` },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' }
    ], { duration: 130, easing: 'cubic-bezier(.23, 1, .32, 1)' }).finished.catch(() => {});
  }

  function animatePageDetails(section) {
    const page = section?.dataset.page;
    if (page === 'todos') animateList(document.getElementById('todoList'), '.todo-card', { limit: 8, delay: 150 });
    if (page === 'notes') animateList(document.getElementById('notesGrid'), '.note-card', { limit: 8, stagger: 35 });
    if (page === 'attendance') {
      const summary = document.querySelector('.attendance-summary');
      [...summary?.querySelectorAll('article') || []].forEach((card, index) => card.style.setProperty('--motion-index', index));
      section.classList.add('attendance-entering');
      setTimeout(() => section.classList.remove('attendance-entering'), reducedMotion.matches ? 140 : 720);
    }
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
    document.addEventListener('cancel', (event) => {
      const dialog = event.target;
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
      if (dialog.id === 'noteDialog') return;
      event.preventDefault();
      closeDialog(dialog);
    }, { capture: true });
    window.addEventListener('resize', () => requestAnimationFrame(syncIndicators), { passive: true });
    syncIndicators();
    document.body.classList.add('motion-system-ready');
    requestAnimationFrame(() => {
      document.body.classList.add('motion-shell-ready');
      enterPage(document.querySelector('[data-page="home"]'), { initial: true, force: true });
    });
  }

  window.YanjiMotion = Object.freeze({
    enterPage,
    animateHomeMatrices,
    animateDialog,
    closeDialog,
    animateTab,
    animateList,
    animateJobList,
    animateStateChange,
    transitionSchedule,
    pointerInitiated,
    syncIndicators
  });
  init();
})();

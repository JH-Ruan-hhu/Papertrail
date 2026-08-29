'use strict';

const confirmDialog = document.getElementById('yanjiConfirmDialog');
const confirmTitle = document.getElementById('yanjiConfirmTitle');
const confirmMessage = document.getElementById('yanjiConfirmMessage');
const confirmAccept = document.getElementById('yanjiConfirmAccept');
const confirmCancel = document.getElementById('yanjiConfirmCancel');
let settleConfirm = null;

function popupText(value) {
  return String(value ?? '').replace(/[。]+$/g, '');
}

function syncConfirmModalState() {
  const active = [...document.querySelectorAll('dialog')].some((dialog) => dialog.open);
  window.paperTrail?.setModalWindowState(active).catch(() => {});
}

function finishConfirm(accepted) {
  if (!settleConfirm) return;
  const settle = settleConfirm;
  settleConfirm = null;
  const finish = () => {
    syncConfirmModalState();
    settle(Boolean(accepted));
  };
  if (confirmDialog.open && window.YanjiMotion?.closeDialog) window.YanjiMotion.closeDialog(confirmDialog, finish);
  else {
    if (confirmDialog.open) confirmDialog.close();
    finish();
  }
}

window.yanjiConfirm = ({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  tone = 'default'
} = {}) => new Promise((resolve) => {
  if (settleConfirm) settleConfirm(false);
  settleConfirm = resolve;
  confirmTitle.textContent = popupText(title);
  confirmMessage.textContent = popupText(message);
  confirmAccept.textContent = popupText(confirmText);
  confirmAccept.classList.toggle('danger', tone === 'danger');
  window.YanjiMotion?.animateDialog(confirmDialog);
  confirmDialog.showModal();
  syncConfirmModalState();
  requestAnimationFrame(() => confirmCancel.focus());
});

confirmAccept.addEventListener('click', () => finishConfirm(true));
confirmCancel.addEventListener('click', () => finishConfirm(false));
confirmDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  finishConfirm(false);
});
confirmDialog.addEventListener('click', (event) => {
  if (event.target === confirmDialog) finishConfirm(false);
});

'use strict';

const confirmDialog = document.getElementById('yanjiConfirmDialog');
const confirmTitle = document.getElementById('yanjiConfirmTitle');
const confirmMessage = document.getElementById('yanjiConfirmMessage');
const confirmAccept = document.getElementById('yanjiConfirmAccept');
const confirmCancel = document.getElementById('yanjiConfirmCancel');
let settleConfirm = null;

function finishConfirm(accepted) {
  if (!settleConfirm) return;
  const settle = settleConfirm;
  settleConfirm = null;
  if (confirmDialog.open) confirmDialog.close();
  settle(Boolean(accepted));
}

window.yanjiConfirm = ({
  title = '确认操作',
  message = '',
  confirmText = '确认',
  tone = 'default'
} = {}) => new Promise((resolve) => {
  if (settleConfirm) settleConfirm(false);
  settleConfirm = resolve;
  confirmTitle.textContent = String(title);
  confirmMessage.textContent = String(message);
  confirmAccept.textContent = String(confirmText);
  confirmAccept.classList.toggle('danger', tone === 'danger');
  confirmDialog.showModal();
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

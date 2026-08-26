'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RECOVERY_VERSION = 1;

function normalizeToastPolicy(value) {
  if (!value || typeof value !== 'object' || value.changed !== true) throw new Error('通知恢复记录无效。');
  const previousExisted = value.previousExisted === true;
  const previousValue = previousExisted ? Number(value.previousValue) : null;
  if (previousExisted && (!Number.isInteger(previousValue) || previousValue < 0)) throw new Error('原通知策略值无效。');
  return {
    changed: true,
    previousExisted,
    previousValue,
    expectedValue: 1,
    sessionId: String(value.sessionId || ''),
    recordedAt: Number.isFinite(Date.parse(value.recordedAt)) ? new Date(value.recordedAt).toISOString() : null
  };
}

function readSystemRecovery(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing' };
    return { state: 'corrupt', error: `无法读取系统恢复记录：${error.message}` };
  }
  try {
    const parsed = JSON.parse(source);
    if (!parsed || parsed.version !== RECOVERY_VERSION) throw new Error('恢复记录版本无效。');
    return { state: 'valid', value: { version: RECOVERY_VERSION, toastPolicy: normalizeToastPolicy(parsed.toastPolicy) } };
  } catch (error) {
    return { state: 'corrupt', error: `系统恢复记录损坏：${error.message}` };
  }
}

function writeSystemRecovery(filePath, toastPolicy) {
  const normalized = normalizeToastPolicy(toastPolicy);
  const temporaryPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(temporaryPath, JSON.stringify({ version: RECOVERY_VERSION, toastPolicy: normalized }, null, 2), 'utf8');
  fs.renameSync(temporaryPath, filePath);
  return normalized;
}

function clearSystemRecovery(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }
}

module.exports = { clearSystemRecovery, readSystemRecovery, writeSystemRecovery };

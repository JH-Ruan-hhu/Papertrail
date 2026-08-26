'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SOFTWARE_BACKUP_PATTERN = /^papertrail-backup-\d{8}-\d{6}(?:-\d+)?\.json$/i;

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isManagedBackupPath(candidate, { backupDirectory, currentFile = '', mustExist = true }) {
  try {
    const target = path.resolve(String(candidate));
    const root = path.resolve(String(backupDirectory));
    if (!SOFTWARE_BACKUP_PATTERN.test(path.basename(target))) return false;
    if (!samePath(path.dirname(target), root)) return false;
    if (currentFile && samePath(target, currentFile)) return false;
    if (mustExist && (!fs.existsSync(target) || !fs.statSync(target).isFile())) return false;
    return true;
  } catch {
    return false;
  }
}

function emptyPointerValue() {
  return { dataDirectory: '', backupFiles: [], backupCreatedAt: {} };
}

function normalizePointerValue(pointer) {
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    throw new Error('存储指针必须是 JSON 对象。');
  }
  const dataDirectory = String(pointer.dataDirectory || '').trim();
  if (!dataDirectory || !path.isAbsolute(dataDirectory)) {
    throw new Error('存储指针中的数据目录无效。');
  }
  return {
    dataDirectory: path.resolve(dataDirectory),
    backupFiles: Array.isArray(pointer.backupFiles) ? pointer.backupFiles.map(String) : [],
    backupCreatedAt: pointer.backupCreatedAt && typeof pointer.backupCreatedAt === 'object' && !Array.isArray(pointer.backupCreatedAt)
      ? pointer.backupCreatedAt
      : {}
  };
}

function readStoragePointer(pointerPath) {
  let source;
  try {
    source = fs.readFileSync(pointerPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'missing', value: emptyPointerValue() };
    return { state: 'corrupt', error: `无法读取存储指针：${error.message}` };
  }
  try {
    return { state: 'valid', value: normalizePointerValue(JSON.parse(source)) };
  } catch (error) {
    return { state: 'corrupt', error: `存储指针损坏：${error.message}` };
  }
}

function resolveStorageState({ pointerPath, defaultFilePath, dataFileName }) {
  const pointer = readStoragePointer(pointerPath);
  if (pointer.state === 'missing') return { state: 'default', filePath: path.resolve(defaultFilePath), pointer };
  if (pointer.state === 'corrupt') return { state: 'pointer-corrupt', error: pointer.error, pointerPath };

  const configuredDirectory = pointer.value.dataDirectory;
  const defaultDirectory = path.dirname(path.resolve(defaultFilePath));
  if (path.resolve(configuredDirectory) === path.resolve(defaultDirectory)) {
    return { state: 'default', filePath: path.resolve(defaultFilePath), pointer };
  }

  let directoryStat;
  try {
    directoryStat = fs.statSync(configuredDirectory);
    fs.accessSync(configuredDirectory, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    return { state: 'custom-unavailable', configuredDirectory, error: error.message, pointer };
  }
  if (!directoryStat.isDirectory()) {
    return { state: 'custom-unavailable', configuredDirectory, error: '配置路径不是文件夹。', pointer };
  }

  const filePath = path.join(configuredDirectory, dataFileName);
  let dataStat;
  try {
    dataStat = fs.statSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return { state: 'custom-missing-data', configuredDirectory, filePath, pointer };
    return { state: 'custom-unavailable', configuredDirectory, filePath, error: error.message, pointer };
  }
  if (!dataStat.isFile()) {
    return { state: 'custom-missing-data', configuredDirectory, filePath, pointer };
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    return { state: 'custom-unavailable', configuredDirectory, filePath, error: error.message, pointer };
  }
  return { state: 'custom-valid', configuredDirectory, filePath: path.resolve(filePath), pointer };
}

module.exports = {
  SOFTWARE_BACKUP_PATTERN,
  emptyPointerValue,
  isManagedBackupPath,
  normalizePointerValue,
  readStoragePointer,
  resolveStorageState,
  samePath
};

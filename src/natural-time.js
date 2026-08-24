'use strict';

const TIME_NUMBER_PATTERN = '[0-9零〇一二两三四五六七八九十]{1,3}';

function chineseNumber(value) {
  const text = String(value || '');
  if (/^\d+$/.test(text)) return Number(text);
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (text === '十') return 10;
  if (text.includes('十')) {
    const [left, right] = text.split('十');
    return (left ? digits[left] : 1) * 10 + (right ? digits[right] : 0);
  }
  return digits[text];
}

function parseMinuteToken(value) {
  if (value === '半') return 30;
  return chineseNumber(value);
}

module.exports = { TIME_NUMBER_PATTERN, parseMinuteToken };

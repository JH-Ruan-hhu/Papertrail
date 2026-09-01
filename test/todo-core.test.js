'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  completeTodo,
  filterTodos,
  isOverdue,
  normalizeTodo,
  parseNaturalLanguageTodo,
  saveTodo,
  sortTodos
} = require('../src/todo-core');

const base = new Date(2026, 7, 22, 10, 0);

test('parses Chinese relative todo dates, priority and a clean title', () => {
  const parsed = parseNaturalLanguageTodo('明天下午3点前提交论文修改稿 #1', base);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '提交论文修改稿');
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.reminderMode, 'at-due');
  assert.equal(new Date(parsed.dueAt).getDate(), 23);
  assert.equal(new Date(parsed.dueAt).getHours(), 15);
  assert.ok(parsed.matches.some((match) => match.text === '明天'));
  assert.ok(parsed.matches.some((match) => match.text === '#1'));
});

test('parses explicit dates and treats a time range end as the due time with a warning', () => {
  const parsed = parseNaturalLanguageTodo('2026年8月28日 9点到11点整理数据', base);
  assert.equal(parsed.title, '整理数据');
  assert.equal(parsed.warning, '检测到时间段，已将结束时间作为截止时间。');
  assert.equal(parsed.meta.timeRange, true);
  assert.equal(new Date(parsed.dueAt).getHours(), 11);
  assert.equal(new Date(parsed.dueAt).getDate(), 28);
});

test('parses a bare day-of-month followed by an evening day part', () => {
  const parsed = parseNaturalLanguageTodo('2号晚上前完成远景科技和宁德时代的测评', new Date(2026, 8, 1, 10, 0));
  const due = new Date(parsed.dueAt);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '完成远景科技和宁德时代的测评');
  assert.equal(parsed.meta.explicitDate, true);
  assert.equal(due.getMonth(), 8);
  assert.equal(due.getDate(), 2);
  assert.equal(due.getHours(), 23);
  assert.equal(due.getMinutes(), 59);
  assert.ok(parsed.matches.some((match) => match.text === '2号'));
  assert.ok(parsed.matches.some((match) => match.text === '晚上'));
});

test('natural language without a date becomes an inbox todo without a reminder', () => {
  const parsed = parseNaturalLanguageTodo('整理实验记录', base);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.title, '整理实验记录');
  assert.equal(parsed.dueAt, null);
  assert.equal(parsed.reminderMode, 'none');
  assert.equal(parsed.reminderAt, null);
});

test('normalizes todo status, dates, legacy fields and reminder state', () => {
  const todo = normalizeTodo({
    id: 'todo-1',
    title: '补图',
    status: 'completed',
    dueAt: '2026-08-22T12:00:00.000Z',
    reminderMode: 'at-due',
    legacy: { imported: true }
  }, 0, '2026-08-22T00:00:00.000Z');
  assert.equal(todo.status, 'completed');
  assert.equal(todo.reminderMode, 'none');
  assert.equal(todo.reminderAt, null);
  assert.deepEqual(todo.legacy, { imported: true });
});

test('moves unknown todo fields into legacy without losing explicit legacy data', () => {
  const todo = normalizeTodo({ id: 'todo-unknown', title: '保留字段', sourceTag: 'imported', legacy: { old: true } });
  assert.deepEqual(todo.legacy, { old: true, sourceTag: 'imported' });
});

test('saves and completes todos while preserving the stable id', () => {
  const first = saveTodo([], { title: '写摘要', dueAt: '2026-08-23T08:00:00.000Z', reminderMode: 'at-due' }, '2026-08-22T02:00:00.000Z', () => 'todo-fixed');
  assert.equal(first[0].id, 'todo-fixed');
  const updated = saveTodo(first, { id: 'todo-fixed', title: '写摘要与图注', dueAt: first[0].dueAt, reminderMode: first[0].reminderMode }, '2026-08-22T03:00:00.000Z', () => 'never');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, 'todo-fixed');
  assert.equal(updated[0].reminderSentAt, null);
  const completed = completeTodo(updated[0], true, '2026-08-22T04:00:00.000Z');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.completedAt, '2026-08-22T04:00:00.000Z');
});

test('filters today, inbox, upcoming and completed views', () => {
  const todos = [
    normalizeTodo({ id: 'overdue', title: '逾期', status: 'open', dueAt: '2026-08-21T09:00:00.000Z', priority: 'high' }),
    normalizeTodo({ id: 'today', title: '今天', status: 'open', dueAt: '2026-08-22T07:00:00.000Z' }),
    normalizeTodo({ id: 'inbox', title: '收件箱', status: 'open' }),
    normalizeTodo({ id: 'future', title: '未来', status: 'open', dueAt: '2026-08-25T16:00:00.000Z' }),
    normalizeTodo({ id: 'done', title: '完成', status: 'completed', completedAt: '2026-08-22T08:00:00.000Z' })
  ];
  assert.deepEqual(filterTodos(todos, { view: 'today', now: base }).map((todo) => todo.id), ['overdue', 'today']);
  assert.deepEqual(filterTodos(todos, { view: 'inbox', now: base }).map((todo) => todo.id), ['inbox']);
  assert.deepEqual(filterTodos(todos, { view: 'upcoming', now: base }).map((todo) => todo.id), ['future']);
  assert.deepEqual(filterTodos(todos, { view: 'completed', now: base, showAllCompleted: true }).map((todo) => todo.id), ['done']);
});

test('sorts overdue items before priority and due date ties', () => {
  const todos = [
    normalizeTodo({ id: 'low', title: '低', priority: 'low', dueAt: '2026-08-22T11:00:00.000Z' }),
    normalizeTodo({ id: 'high', title: '高', priority: 'high', dueAt: '2026-08-22T12:00:00.000Z' }),
    normalizeTodo({ id: 'overdue', title: '逾期', priority: 'low', dueAt: '2026-08-21T12:00:00.000Z' })
  ];
  assert.deepEqual(sortTodos(todos, base).map((todo) => todo.id), ['overdue', 'high', 'low']);
  assert.equal(isOverdue(todos[2], base), true);
});

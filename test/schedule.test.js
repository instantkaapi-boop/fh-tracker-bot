import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipsBetween, riskFlags, riskList } from '../lib/schedule.js';
import { formatSchedule, formatWeek, formatRisks, formatBrief } from '../lib/format.js';
import { isManager } from '../lib/roster.js';

const T = '2026-11-18';
const row = (o = {}) => ({ id: 'x', content: 'Halwani – Reel 2', pipelineStatus: 'Editing', posted: false, shootDoneDate: null, expectedDate: null, postingDate: null, editingStartDate: null, completionDate: null, ...o });

test('chipsBetween orders by date then shoot, delivery, post and skips posted rows', () => {
  const chips = chipsBetween([
    row({ id: 'a', shootDoneDate: '2026-11-19', expectedDate: '2026-11-19', postingDate: '2026-11-20' }),
    row({ id: 'b', postingDate: '2026-11-19', posted: true }),
  ], T, '2026-11-25');
  assert.deepEqual(chips.map((c) => c.kind), ['shoot', 'deliver', 'post']);
});

test('risk flags match the agreed rules', () => {
  const codes = (r) => riskFlags(r, T).map((f) => f.code);
  assert.deepEqual(codes(row({ expectedDate: '2026-11-25', postingDate: '2026-11-24', pipelineStatus: 'Approved' })), ['late-delivery']);
  assert.deepEqual(codes(row({ shootDoneDate: '2026-11-15', pipelineStatus: 'Scripting Done', expectedDate: '2026-12-30' })), ['shoot-overdue']);
  assert.deepEqual(codes(row({ shootDoneDate: '2026-11-20', pipelineStatus: 'Scripting Done', expectedDate: T })), []);
  assert.deepEqual(codes(row({ shootDoneDate: '2026-11-10', expectedDate: '2026-11-20' })), ['not-started']);
  assert.deepEqual(codes(row({ postingDate: '2026-11-19' })), ['post-not-ready']);
  assert.deepEqual(codes(row({ postingDate: '2026-11-17', pipelineStatus: 'Approved' })), ['post-missed']);
  assert.deepEqual(codes(row({ postingDate: '2026-11-19', pipelineStatus: 'Approved' })), []);
});

test('riskList puts high severity first', () => {
  const list = riskList([row({ id: 'm', shootDoneDate: '2026-11-10', expectedDate: '2026-11-19' }), row({ id: 'h', postingDate: '2026-11-19' })], T);
  assert.deepEqual(list.map((r) => r.row.id), ['h', 'm']);
});

test('brief shows today/tomorrow shoots and today posts only when asked, escaping HTML', () => {
  const rows = [
    row({ id: '1', content: 'KFC <Dubai>', shootDoneDate: '2026-11-19' }),
    row({ id: '2', content: 'Halwani', shootDoneDate: '2026-11-25' }),
    row({ id: '3', content: 'Chicking', postingDate: T, pipelineStatus: 'Approved' }),
    row({ id: '4', content: 'Later', postingDate: '2026-11-19' }),
  ];
  const lines = formatSchedule(rows, T).join('\n');
  assert.ok(lines.includes('Shoots today / tomorrow') && lines.includes('Tomorrow — KFC &lt;Dubai&gt;'));
  assert.ok(!lines.includes('Halwani') && lines.includes('Posting today') && lines.includes('• Chicking') && !lines.includes('Later'));
  assert.ok(!formatBrief(rows).includes('Shoots today'));
  assert.ok(formatBrief(rows, { today: T }).includes('Shoots today'));
});

test('/week groups by day; empty week says so; risks text lists reasons', () => {
  assert.equal(formatWeek([], T), 'Nothing scheduled in the next 7 days.');
  const out = formatWeek([row({ shootDoneDate: T, expectedDate: '2026-11-20' })], T);
  assert.ok(out.includes('Today · 2026/11/18') && out.includes('🎥 Halwani – Reel 2 — shoot') && out.includes('Fri · 2026/11/20'));
  assert.equal(formatRisks([]), null);
  assert.ok(formatRisks(riskList([row({ postingDate: '2026-11-17' })], T)).includes('Posting date passed'));
});

test('manager rights: admin always, others not', () => {
  assert.equal(isManager('Ajay'), true);
  assert.equal(isManager('Jishnu'), false);
});

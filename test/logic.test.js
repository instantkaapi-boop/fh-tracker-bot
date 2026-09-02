import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, classifyRows, dueFlag, isLastDayOfMonthIST, weekRangeIST, computeWeeklyStats,
  completionUpdate, startUpdate, stableSort, rowsFor, dueBetween, isLateCheckin, averageTime, staleDays,
} from '../lib/logic.js';

const base = { id: 'x', content: 'Clip', pipelineStatus: 'Editing', editType: null, expectedDate: null, editingStartDate: null, editingEndHandover: null, fEditingStart: null, fEditingDone: null, completionDate: null, lastEdited: null };
const row = (o) => ({ ...base, ...o });

test('Approved overrides everything', () => {
  assert.equal(classify(row({ pipelineStatus: 'Approved', editType: 'Jishnu Only' })).bucket, 'ready');
});

test('Fazil Only: editing until handover date, then ready', () => {
  assert.deepEqual(classify(row({ editType: 'Fazil Only' })), { bucket: 'fazil', inCharge: 'Fazil', status: 'editing', timeTaken: null });
  const done = classify(row({ editType: 'Fazil Only', editingEndHandover: '2026-09-02', fEditingStart: '2026-08-30', fEditingDone: '2026-09-02' }));
  assert.equal(done.bucket, 'ready');
  assert.equal(done.timeTaken, 3);
});

test('Jishnu Only: editing until handover date', () => {
  assert.equal(classify(row({ editType: 'Jishnu Only' })).bucket, 'jishnu');
  assert.equal(classify(row({ editType: 'Jishnu Only', editingEndHandover: '2026-09-01' })).bucket, 'ready');
});

test('J+F: Jishnu editing → Fazil sound → ready', () => {
  assert.equal(classify(row({ editType: 'Jishnu + Fazil' })).bucket, 'jishnu');
  assert.equal(classify(row({ editType: 'Jishnu + Fazil', editingEndHandover: '2026-09-01' })).status, 'sound');
  assert.equal(classify(row({ editType: 'Jishnu + Fazil', fEditingStart: '2026-09-01' })).bucket, 'fazil');
  assert.equal(classify(row({ editType: 'Jishnu + Fazil', fEditingDone: '2026-09-02' })).bucket, 'ready');
});

test('no or unknown Edit Type → needs attention regardless of pipeline status', () => {
  assert.equal(classify(row({ pipelineStatus: 'Shoot Done' })).bucket, 'needs_assignment');
  assert.equal(classify(row({ editType: 'Levin Only' })).bucket, 'needs_assignment');
});

test('dueFlag', () => {
  assert.equal(dueFlag('2026-09-01', '2026-09-02'), 'overdue');
  assert.equal(dueFlag('2026-09-02', '2026-09-02'), 'due-today');
  assert.equal(dueFlag('2026-09-03', '2026-09-02'), null);
  assert.equal(dueFlag(null, '2026-09-02'), null);
});

test('stale uses IST calendar date of last edit; ready rows never stale', () => {
  const rows = classifyRows([row({ editType: 'Jishnu Only', lastEdited: '2026-08-28T20:00:00.000Z' })], '2026-09-02');
  assert.equal(rows[0].stale, true);
  assert.equal(rows[0].staleDays, 4); // 2026-08-29 IST → 4 days
  const ready = classifyRows([row({ pipelineStatus: 'Approved', lastEdited: '2026-08-01T00:00:00.000Z' })], '2026-09-02');
  assert.equal(ready[0].stale, false);
  assert.equal(staleDays(null), 0);
});

test('isLastDayOfMonthIST', () => {
  assert.equal(isLastDayOfMonthIST('2026-02-28'), true);
  assert.equal(isLastDayOfMonthIST('2028-02-28'), false);
  assert.equal(isLastDayOfMonthIST('2026-09-30'), true);
  assert.equal(isLastDayOfMonthIST('2026-09-29'), false);
});

test('weekRangeIST is Monday→Sunday', () => {
  assert.deepEqual(weekRangeIST(0, '2026-09-02'), { start: '2026-08-31', end: '2026-09-06' });
  assert.deepEqual(weekRangeIST(-1, '2026-09-06'), { start: '2026-08-24', end: '2026-08-30' });
  assert.deepEqual(weekRangeIST(0, '2026-09-07'), { start: '2026-09-07', end: '2026-09-13' });
});

test('computeWeeklyStats: throughput, per-person credit, on-time %', () => {
  const s = computeWeeklyStats([
    row({ editType: 'Fazil Only', fEditingStart: '2026-09-01', fEditingDone: '2026-09-03', expectedDate: '2026-09-05', completionDate: '2026-09-03' }),
    row({ editType: 'Jishnu + Fazil', editingStartDate: '2026-09-01', fEditingDone: '2026-09-05', expectedDate: '2026-09-04', completionDate: '2026-09-05' }),
    row({ editType: 'Jishnu Only', completionDate: '2026-09-02' }),
  ]);
  assert.equal(s.throughput, 3);
  assert.deepEqual(s.perPerson, { Fazil: 2, Jishnu: 2 });
  assert.equal(s.onTimePct, 50);
  assert.equal(s.avgTT.Fazil, 2);
  assert.equal(s.avgTT['J+F'], 4);
  assert.equal(s.avgTT.Jishnu, null);
});

test('stableSort: dated first ascending, then title, then id', () => {
  const sorted = stableSort([
    row({ id: 'b', content: 'B' }),
    row({ id: 'a', content: 'A', expectedDate: '2026-09-05' }),
    row({ id: 'c', content: 'A', expectedDate: '2026-09-01' }),
    row({ id: 'd', content: 'A' }),
  ]).map((r) => r.id);
  assert.deepEqual(sorted, ['c', 'a', 'd', 'b']);
});

test('rowsFor: person buckets, Ajay gets ready + unassigned, Levin nothing', () => {
  const c = classifyRows([
    row({ id: '1', editType: 'Fazil Only' }),
    row({ id: '2', editType: 'Jishnu Only' }),
    row({ id: '3' }),
    row({ id: '4', pipelineStatus: 'Approved' }),
  ], '2026-09-02');
  assert.deepEqual(rowsFor('Fazil', c).map((r) => r.id), ['1']);
  assert.deepEqual(rowsFor('Jishnu', c).map((r) => r.id), ['2']);
  assert.deepEqual(rowsFor('Ajay', c).map((r) => r.id).sort(), ['3', '4']);
  assert.deepEqual(rowsFor('Levin', c), []);
});

test('completionUpdate per type and phase', () => {
  const t = '2026-09-02';
  const f = completionUpdate(row({ editType: 'Fazil Only' }), t);
  assert.equal(f.outcome, 'ready');
  assert.ok(f.properties['Editing End/ Handover'] && f.properties['F editing Done'] && f.properties['F editing start']);
  assert.equal(completionUpdate(row({ editType: 'Fazil Only', editingEndHandover: t }), t), null);

  const j = completionUpdate(row({ editType: 'Jishnu Only' }), t);
  assert.equal(j.outcome, 'ready');
  assert.equal(j.properties['Completion date'].date.start, t);

  const jfPhase1 = completionUpdate(row({ editType: 'Jishnu + Fazil' }), t);
  assert.equal(jfPhase1.outcome, 'handover');
  assert.deepEqual(Object.keys(jfPhase1.properties), ['Editing End/ Handover']);

  const jfPhase2 = completionUpdate(row({ editType: 'Jishnu + Fazil', editingEndHandover: '2026-09-01', fEditingStart: '2026-09-01' }), t);
  assert.equal(jfPhase2.outcome, 'ready');
  assert.equal(jfPhase2.properties['F editing start'], undefined);

  assert.equal(completionUpdate(row({}), t), null);
  assert.equal(completionUpdate(row({ editType: 'Jishnu + Fazil', fEditingDone: t }), t), null);
});

test('startUpdate per type and phase', () => {
  const t = '2026-09-02';
  assert.ok(startUpdate(row({ editType: 'Fazil Only' }), t).properties['F editing start']);
  assert.equal(startUpdate(row({ editType: 'Fazil Only', fEditingStart: t }), t), null);
  assert.ok(startUpdate(row({ editType: 'Jishnu + Fazil' }), t).properties['Editing Start Date']);
  assert.ok(startUpdate(row({ editType: 'Jishnu + Fazil', editingEndHandover: t }), t).properties['F editing start']);
  assert.equal(startUpdate(row({}), t), null);
});

test('dueBetween inclusive', () => {
  const c = [row({ id: 'a', expectedDate: '2026-08-31' }), row({ id: 'b', expectedDate: '2026-09-06' }), row({ id: 'c', expectedDate: '2026-09-07' }), row({ id: 'd' })];
  assert.deepEqual(dueBetween(c, '2026-08-31', '2026-09-06').map((r) => r.id), ['a', 'b']);
});

test('attendance helpers', () => {
  assert.equal(isLateCheckin('10:31'), true);
  assert.equal(isLateCheckin('10:30'), false);
  assert.equal(isLateCheckin(null), false);
  assert.equal(averageTime(['10:00', '11:00']), '10:30');
  assert.equal(averageTime([]), null);
});

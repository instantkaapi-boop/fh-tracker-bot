import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, classifyRows, dueFlag, isLastDayOfMonthIST, weekRangeIST, computeWeeklyStats,
  completionUpdate, startUpdate, stableSort, rowsFor, dueBetween, isLateCheckin, averageTime, staleDays,
  computeShootKPI, lateShootLog,
} from '../lib/logic.js';

const base = { id: 'x', content: 'Clip', pipelineStatus: 'Editing', editType: null, expectedDate: null, editingStartDate: null, shootDoneDate: null, completionDate: null, lastEdited: null, createdTime: null };
const row = (o) => ({ ...base, ...o });

test('Approved overrides everything', () => {
  assert.equal(classify(row({ pipelineStatus: 'Approved', editType: 'Jishnu Only' })).bucket, 'ready');
});

test('Editing done overrides Edit Type too', () => {
  assert.equal(classify(row({ pipelineStatus: 'Editing done', editType: 'Fazil Only' })).bucket, 'ready');
});

test('Fazil Only / Jishnu Only: editing until Pipeline Status flips', () => {
  assert.deepEqual(classify(row({ editType: 'Fazil Only' })), { bucket: 'fazil', inCharge: 'Fazil', status: 'editing', timeTaken: null });
  assert.equal(classify(row({ editType: 'Jishnu Only' })).bucket, 'jishnu');
  const done = classify(row({ editType: 'Fazil Only', pipelineStatus: 'Editing done', editingStartDate: '2026-08-30', completionDate: '2026-09-02' }));
  assert.equal(done.bucket, 'ready');
  assert.equal(done.timeTaken, 3);
});

test('Jishnu + Fazil is one shared task, bucket "jf"', () => {
  assert.equal(classify(row({ editType: 'Jishnu + Fazil' })).bucket, 'jf');
  assert.equal(classify(row({ editType: 'Jishnu + Fazil', pipelineStatus: 'Editing done' })).bucket, 'ready');
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
    row({ editType: 'Fazil Only', editingStartDate: '2026-09-01', expectedDate: '2026-09-05', completionDate: '2026-09-03' }),
    row({ editType: 'Jishnu + Fazil', editingStartDate: '2026-09-01', expectedDate: '2026-09-04', completionDate: '2026-09-05' }),
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

test('rowsFor: person buckets (J+F shared), Ajay gets ready + unassigned, Levin nothing', () => {
  const c = classifyRows([
    row({ id: '1', editType: 'Fazil Only' }),
    row({ id: '2', editType: 'Jishnu Only' }),
    row({ id: '5', editType: 'Jishnu + Fazil' }),
    row({ id: '3' }),
    row({ id: '4', pipelineStatus: 'Approved' }),
  ], '2026-09-02');
  assert.deepEqual(rowsFor('Fazil', c).map((r) => r.id).sort(), ['1', '5']);
  assert.deepEqual(rowsFor('Jishnu', c).map((r) => r.id).sort(), ['2', '5']);
  assert.deepEqual(rowsFor('Ajay', c).map((r) => r.id).sort(), ['3', '4']);
  assert.deepEqual(rowsFor('Levin', c), []);
});

test('completionUpdate: same shape for every Edit Type, null once past editing', () => {
  const t = '2026-09-02';
  for (const editType of ['Fazil Only', 'Jishnu Only', 'Jishnu + Fazil']) {
    const u = completionUpdate(row({ editType }), t);
    assert.equal(u.outcome, 'ready');
    assert.equal(u.properties['Completion date'].date.start, t);
    assert.equal(u.properties['Pipeline Status'].select.name, 'Editing done');
  }
  assert.equal(completionUpdate(row({ editType: 'Fazil Only', pipelineStatus: 'Editing done' }), t), null);
  assert.equal(completionUpdate(row({ editType: 'Jishnu + Fazil', pipelineStatus: 'Approved' }), t), null);
  assert.equal(completionUpdate(row({}), t), null);
});

test('startUpdate: same shape for every Edit Type, null once already started', () => {
  const t = '2026-09-02';
  for (const editType of ['Fazil Only', 'Jishnu Only', 'Jishnu + Fazil']) {
    const u = startUpdate(row({ editType }), t);
    assert.equal(u.properties['Editing Start Date'].date.start, t);
    assert.equal(u.properties['Pipeline Status'].select.name, 'Editing');
  }
  assert.equal(startUpdate(row({ editType: 'Fazil Only', editingStartDate: t }), t), null);
  assert.equal(startUpdate(row({}), t), null);
});

test('computeShootKPI: averages gap per person, credits both on J+F', () => {
  const kpi = computeShootKPI([
    row({ editType: 'Fazil Only', shootDoneDate: '2026-09-01', completionDate: '2026-09-03' }), // 2d
    row({ editType: 'Jishnu + Fazil', shootDoneDate: '2026-09-01', completionDate: '2026-09-05' }), // 4d, credits both
    row({ editType: 'Jishnu Only', shootDoneDate: null, completionDate: '2026-09-02' }), // no gap, ignored
  ]);
  assert.equal(kpi.Fazil, 3); // avg(2, 4)
  assert.equal(kpi.Jishnu, 4); // avg(4)
});

test('lateShootLog: flags a card whose Shoot Done Date predates its creation', () => {
  const late = lateShootLog(row({ shootDoneDate: '2026-09-18', createdTime: '2026-09-20T10:00:00.000Z' }));
  assert.equal(late.gapDays, 2);
  assert.equal(lateShootLog(row({ shootDoneDate: '2026-09-20', createdTime: '2026-09-20T10:00:00.000Z' })), null);
  assert.equal(lateShootLog(row({ shootDoneDate: null, createdTime: '2026-09-20T10:00:00.000Z' })), null);
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

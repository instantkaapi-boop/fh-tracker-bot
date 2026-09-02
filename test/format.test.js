import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkMessage } from '../lib/chunk.js';
import { formatBrief, formatMine, formatOverdue, escapeHtml } from '../lib/format.js';
import { classifyRows } from '../lib/logic.js';

const base = { id: 'x', content: 'Clip', pipelineStatus: 'Editing', editType: null, expectedDate: null, editingStartDate: null, editingEndHandover: null, fEditingStart: null, fEditingDone: null, completionDate: null, lastEdited: null };
const row = (o) => ({ ...base, ...o });

test('chunkMessage splits on newlines under the limit', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(100)}`);
  const chunks = chunkMessage(lines.join('\n'), 1000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 1000));
  assert.equal(chunks.join('\n'), lines.join('\n'));
  assert.deepEqual(chunkMessage('short'), ['short']);
});

test('formatBrief keeps the agreed layout and escapes HTML', () => {
  const out = formatBrief([
    row({ id: '1', content: 'A <b>bold</b>', editType: 'Fazil Only' }),
    row({ id: '2', content: 'B', pipelineStatus: 'Approved' }),
    row({ id: '3', content: 'C' }),
  ], { brandTasks: [{ content: 'Logo', status: 'Started' }] });
  assert.ok(out.startsWith('<b><u>Daily Brief</u></b>'));
  assert.ok(out.includes('A &lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(out.indexOf('Ready to Post') < out.indexOf('Fazil'));
  assert.ok(out.includes('1. Logo — started'));
  assert.ok(out.includes('Pending list for Fazil: 1 (1 individual+0 JF work)'));
  assert.ok(out.includes('Need Attention: 1'));
});

test('formatMine numbers match rowsFor order', () => {
  const out = formatMine('Jishnu', [
    row({ id: '1', content: 'Later', editType: 'Jishnu Only', expectedDate: '2026-09-10' }),
    row({ id: '2', content: 'Sooner', editType: 'Jishnu + Fazil', expectedDate: '2026-09-01' }),
  ]);
  assert.ok(out.indexOf('1. ') < out.indexOf('Sooner'));
  assert.ok(out.includes('2. ') && out.indexOf('2. ') < out.indexOf('Later'));
  assert.equal(formatMine('Levin', [], []), "Levin's list is empty. 🎉");
});

test('formatOverdue returns null when nothing is hot', () => {
  const c = classifyRows([row({ editType: 'Fazil Only', expectedDate: '2026-12-01' })], '2026-09-02');
  assert.equal(formatOverdue(c, '2026-09-02'), null);
  const hot = classifyRows([row({ editType: 'Fazil Only', expectedDate: '2026-09-01' })], '2026-09-02');
  assert.ok(formatOverdue(hot, '2026-09-02').includes('overdue'));
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('a & <b>'), 'a &amp; &lt;b&gt;');
});

// Shoot / delivery / post dates and risk flags for the daily brief, /week and the manager nudge.
// Mirrors fhm-core's src/core/schedule.js, but on this bot's row shape (see parseRow in notion.js).

export const KIND_LABEL = { shoot: 'Shoot', deliver: 'Delivery', post: 'Post' };
export const KIND_ICON = { shoot: '🎥', deliver: '✂️', post: '📲' };
const KINDS = ['shoot', 'deliver', 'post'];
const DONE_STAGES = ['Editing done', 'Approved'];
const BEFORE_SHOOT = ['Ideation', 'Scripting Done'];

const day = (s) => (s ? String(s).slice(0, 10) : '');
const stamp = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => new Date(stamp(iso) + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((stamp(a) - stamp(b)) / 864e5);

// The shoot date is the tracker's "Shoot Done Date": the planned day first, then the day it happened.
export function chipDate(row, kind) {
  if (kind === 'shoot') return day(row.shootDoneDate);
  return day(kind === 'deliver' ? row.expectedDate : row.postingDate);
}

export function chipsBetween(rows, from, to) {
  const out = [];
  for (const row of rows) {
    if (row.posted) continue;
    for (const kind of KINDS) {
      const date = chipDate(row, kind);
      if (date && date >= from && date <= to) out.push({ kind, date, row });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.row.content.localeCompare(b.row.content));
}

const editingFinished = (row) => !!row.completionDate || DONE_STAGES.includes(row.pipelineStatus);

export function riskFlags(row, today, startWindowDays = 2) {
  if (row.posted) return [];
  const flags = [];
  const exp = day(row.expectedDate);
  const post = day(row.postingDate);
  const shoot = day(row.shootDoneDate);
  const shootPending = shoot && shoot > today;
  if (exp && post && exp > post) flags.push({ code: 'late-delivery', severity: 'high', label: 'Delivery is after the posting date' });
  if (shoot && shoot < today && BEFORE_SHOOT.includes(row.pipelineStatus)) flags.push({ code: 'shoot-overdue', severity: 'high', label: 'Shoot date passed but the stage is still before Shoot Done' });
  if (exp && !row.editingStartDate && !editingFinished(row) && !shootPending && diffDays(exp, today) <= startWindowDays) {
    flags.push({ code: 'not-started', severity: 'medium', label: 'Editing not started and delivery is close' });
  }
  if (post && post < today) flags.push({ code: 'post-missed', severity: 'high', label: 'Posting date passed, not marked posted' });
  else if (post && post <= addDays(today, 1) && row.pipelineStatus !== 'Approved') flags.push({ code: 'post-not-ready', severity: 'high', label: 'Posting soon but not Approved' });
  return flags;
}

// Rows with at least one flag, worst first, then earliest date.
export function riskList(rows, today) {
  const rank = (flags) => (flags.some((f) => f.severity === 'high') ? 0 : 1);
  const first = (r) => [chipDate(r, 'shoot'), day(r.expectedDate), day(r.postingDate)].filter(Boolean).sort()[0] || '9';
  return rows
    .map((row) => ({ row, flags: riskFlags(row, today) }))
    .filter((r) => r.flags.length)
    .sort((a, b) => rank(a.flags) - rank(b.flags) || first(a.row).localeCompare(first(b.row)));
}

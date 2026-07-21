export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function isLastDayOfMonthIST(today = todayIST()) {
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return tomorrow.getUTCMonth() !== m - 1;
}

export function dueFlag(expectedDate, today = todayIST()) {
  if (!expectedDate) return null;
  const d = expectedDate.slice(0, 10);
  if (d < today) return 'overdue';
  if (d === today) return 'due-today';
  return null;
}

function daysBetween(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO.slice(0, 10));
  const end = new Date(endISO.slice(0, 10));
  return Math.round((end - start) / 86400000);
}

// A row not touched in this many days (Notion's last_edited_time) gets flagged stale in the brief.
const STALE_DAYS = 3;

// Notion's last_edited_time is a UTC timestamp — convert to its IST calendar date
// before diffing against todayIST(), so edits made late UTC / early IST don't count
// as a day earlier than they actually landed.
function istDateString(isoTimestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(isoTimestamp));
}

function isStale(lastEdited, today) {
  if (!lastEdited) return false;
  const days = daysBetween(istDateString(lastEdited), today);
  return days != null && days >= STALE_DAYS;
}

// Time taken to edit, in days — only defined for the three Edit Type values
// that have a matching start/end date pair. Independent of why a row ended
// up in the 'ready' bucket (Approved override or the normal done-check).
export function computeTimeTaken(row) {
  const { editType, fEditingStart, fEditingDone, editingStartDate, editingEndHandover } = row;
  if (editType === 'Fazil Only') return daysBetween(fEditingStart, fEditingDone);
  if (editType === 'Jishnu + Fazil') return daysBetween(editingStartDate, fEditingDone);
  if (editType === 'Jishnu Only') return daysBetween(editingStartDate, editingEndHandover);
  return null;
}

// Classify a row into who's in charge and its display bucket/status.
// Rows with no Edit Type and a Pipeline Status other than "Ideation" aren't
// covered by the spec's rules explicitly; they're folded into
// needs_assignment rather than silently dropped from the brief.
export function classify(row) {
  const { editType, pipelineStatus, editingEndHandover, fEditingStart, fEditingDone } = row;
  const timeTaken = computeTimeTaken(row);

  // Approved overrides Edit Type entirely — the video is complete.
  if (pipelineStatus === 'Approved') {
    return { bucket: 'ready', inCharge: null, status: 'approved', timeTaken };
  }

  if (editType === 'Fazil Only' || editType === 'Jishnu Only') {
    const person = editType === 'Fazil Only' ? 'Fazil' : 'Jishnu';
    if (!editingEndHandover) {
      return { bucket: person.toLowerCase(), inCharge: person, status: 'editing', timeTaken };
    }
    return { bucket: 'ready', inCharge: person, status: 'done, ready to post', timeTaken };
  }

  if (editType === 'Jishnu + Fazil') {
    if (fEditingDone) {
      return { bucket: 'ready', inCharge: null, status: 'done, ready to post', timeTaken };
    }
    if (fEditingStart || editingEndHandover) {
      return { bucket: 'fazil', inCharge: 'Fazil', status: 'sound', timeTaken };
    }
    return { bucket: 'jishnu', inCharge: 'Jishnu', status: 'editing', timeTaken };
  }

  if (!editType && pipelineStatus === 'Ideation') {
    return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention', timeTaken };
  }

  if (!editType) {
    return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention', timeTaken };
  }

  return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention', timeTaken };
}

export function classifyRows(rows) {
  const today = todayIST();
  return rows.map((row) => {
    const classified = classify(row);
    return {
      ...row,
      ...classified,
      due: dueFlag(row.expectedDate, today),
      stale: classified.bucket !== 'ready' && isStale(row.lastEdited, today),
    };
  });
}

// Monday-to-Sunday IST week boundaries, offsetWeeks=0 is the current week, -1 is last week.
export function weekRangeIST(offsetWeeks = 0, today = todayIST()) {
  const [y, m, d] = today.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = anchor.getUTCDay();
  const mondayDelta = (dow === 0 ? -6 : 1 - dow) + offsetWeeks * 7;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + mondayDelta);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (dt) => dt.toISOString().slice(0, 10);
  return { start: iso(monday), end: iso(sunday) };
}

function average(values) {
  const valid = values.filter((v) => v != null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

// Throughput + average time-taken per Edit Type, for the weekly stats post.
export function computeWeeklyStats(rows) {
  const byType = { 'Fazil Only': [], 'Jishnu Only': [], 'Jishnu + Fazil': [] };
  for (const row of rows) {
    if (byType[row.editType]) byType[row.editType].push(computeTimeTaken(row));
  }
  return {
    throughput: rows.length,
    avgTT: {
      Fazil: average(byType['Fazil Only']),
      Jishnu: average(byType['Jishnu Only']),
      'J+F': average(byType['Jishnu + Fazil']),
    },
  };
}

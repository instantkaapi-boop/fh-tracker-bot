export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function isSundayIST() {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date()) === 'Sun';
}

export function isMondayIST() {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date()) === 'Mon';
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

export function daysBetween(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO.slice(0, 10));
  const end = new Date(endISO.slice(0, 10));
  return Math.round((end - start) / 86400000);
}

// A row not touched in this many days (Notion's last_edited_time) gets flagged stale in the brief.
export const STALE_DAYS = 3;
// Stale escalation thresholds for the morning nudge job: owner DM, then admin DM.
export const STALE_DM_OWNER_DAYS = 5;
export const STALE_DM_ADMIN_DAYS = 7;

// Notion's last_edited_time is a UTC timestamp — convert to its IST calendar date
// before diffing against todayIST(), so edits made late UTC / early IST don't count
// as a day earlier than they actually landed.
export function istDateString(isoTimestamp) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(isoTimestamp));
}

export function staleDays(lastEdited, today = todayIST()) {
  if (!lastEdited) return 0;
  return daysBetween(istDateString(lastEdited), today) ?? 0;
}

function isStale(lastEdited, today) {
  return staleDays(lastEdited, today) >= STALE_DAYS;
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
// Rows with no Edit Type (any Pipeline Status) and rows with an unrecognised
// Edit Type both land in needs_assignment rather than silently vanishing.
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

  return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention', timeTaken };
}

export function classifyRows(rows, today = todayIST()) {
  return rows.map((row) => {
    const classified = classify(row);
    return {
      ...row,
      ...classified,
      due: dueFlag(row.expectedDate, today),
      stale: classified.bucket !== 'ready' && isStale(row.lastEdited, today),
      staleDays: classified.bucket !== 'ready' ? staleDays(row.lastEdited, today) : 0,
    };
  });
}

// Deterministic ordering used everywhere a numbered list must line up
// between two messages (/mine → /done <n>): expected date ascending,
// undated last, then title, then id as a final tiebreak.
export function stableSort(rows) {
  return [...rows].sort((a, b) => {
    if (a.expectedDate !== b.expectedDate) {
      if (!a.expectedDate) return 1;
      if (!b.expectedDate) return -1;
      const c = a.expectedDate.localeCompare(b.expectedDate);
      if (c !== 0) return c;
    }
    const t = (a.content ?? '').localeCompare(b.content ?? '');
    return t !== 0 ? t : (a.id ?? '').localeCompare(b.id ?? '');
  });
}

// The rows a given roster member is responsible for right now.
// Ajay (owner) sees the two buckets nobody else owns.
export function rowsFor(person, classified) {
  const bucket = { Fazil: 'fazil', Jishnu: 'jishnu' }[person];
  if (bucket) return stableSort(classified.filter((r) => r.bucket === bucket));
  if (person === 'Ajay') {
    return stableSort(classified.filter((r) => r.bucket === 'needs_assignment' || r.bucket === 'ready'));
  }
  return [];
}

// What "/done" should write for a row, given who's in charge and which phase
// it's in. Returns { properties, outcome } or null when the row can't be
// completed from Telegram (no Edit Type / already ready).
export function completionUpdate(row, today = todayIST()) {
  const { editType, editingEndHandover, fEditingStart, fEditingDone } = row;
  const date = { date: { start: today } };
  if (editType === 'Fazil Only') {
    if (editingEndHandover) return null;
    return {
      outcome: 'ready',
      properties: {
        'Editing End/ Handover': date,
        'F editing Done': date,
        'Completion date': date,
        'Pipeline Status': { select: { name: 'Editing done' } },
        ...(fEditingStart ? {} : { 'F editing start': date }),
      },
    };
  }
  if (editType === 'Jishnu Only') {
    if (editingEndHandover) return null;
    return {
      outcome: 'ready',
      properties: {
        'Editing End/ Handover': date,
        'Completion date': date,
        'Pipeline Status': { select: { name: 'Editing done' } },
      },
    };
  }
  if (editType === 'Jishnu + Fazil') {
    if (fEditingDone) return null;
    if (fEditingStart || editingEndHandover) {
      return {
        outcome: 'ready',
        properties: {
          'F editing Done': date,
          'Completion date': date,
          'Pipeline Status': { select: { name: 'Editing done' } },
          ...(fEditingStart ? {} : { 'F editing start': date }),
        },
      };
    }
    return {
      outcome: 'handover',
      properties: { 'Editing End/ Handover': date },
    };
  }
  return null;
}

// What "/begin" should write: stamps the start date for the current phase.
export function startUpdate(row, today = todayIST()) {
  const { editType, editingStartDate, fEditingStart, editingEndHandover } = row;
  const date = { date: { start: today } };
  const editing = { 'Pipeline Status': { select: { name: 'Editing' } } };
  if (editType === 'Fazil Only') {
    if (fEditingStart) return null;
    return { properties: { 'F editing start': date, ...editing } };
  }
  if (editType === 'Jishnu Only') {
    if (editingStartDate) return null;
    return { properties: { 'Editing Start Date': date, ...editing } };
  }
  if (editType === 'Jishnu + Fazil') {
    if (editingEndHandover) {
      if (fEditingStart) return null;
      return { properties: { 'F editing start': date } };
    }
    if (editingStartDate) return null;
    return { properties: { 'Editing Start Date': date, ...editing } };
  }
  return null;
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

// Who gets credit for a completed row in throughput counts.
function creditFor(row) {
  if (row.editType === 'Fazil Only') return ['Fazil'];
  if (row.editType === 'Jishnu Only') return ['Jishnu'];
  if (row.editType === 'Jishnu + Fazil') return ['Jishnu', 'Fazil'];
  return [];
}

// Throughput + average time-taken per Edit Type + per-person counts and
// on-time rate (Completion date <= Expected date), for the weekly stats post.
export function computeWeeklyStats(rows) {
  const byType = { 'Fazil Only': [], 'Jishnu Only': [], 'Jishnu + Fazil': [] };
  const perPerson = { Fazil: 0, Jishnu: 0 };
  let onTime = 0;
  let dated = 0;
  for (const row of rows) {
    if (byType[row.editType]) byType[row.editType].push(computeTimeTaken(row));
    for (const p of creditFor(row)) perPerson[p] += 1;
    if (row.expectedDate && row.completionDate) {
      dated += 1;
      if (row.completionDate.slice(0, 10) <= row.expectedDate.slice(0, 10)) onTime += 1;
    }
  }
  return {
    throughput: rows.length,
    perPerson,
    onTimePct: dated ? Math.round((onTime / dated) * 100) : null,
    avgTT: {
      Fazil: average(byType['Fazil Only']),
      Jishnu: average(byType['Jishnu Only']),
      'J+F': average(byType['Jishnu + Fazil']),
    },
  };
}

// Rows with an Expected date inside [start, end] — this week's plan.
export function dueBetween(rows, start, end) {
  return stableSort(rows.filter((r) => r.expectedDate && r.expectedDate.slice(0, 10) >= start && r.expectedDate.slice(0, 10) <= end));
}

// "HH:MM" > threshold, both 24h strings.
export function isLateCheckin(hhmm, threshold = '10:30') {
  return Boolean(hhmm) && hhmm > threshold;
}

export function averageTime(hhmmList) {
  if (hhmmList.length === 0) return null;
  const mins = hhmmList.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
}

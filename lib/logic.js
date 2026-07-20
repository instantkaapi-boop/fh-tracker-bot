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

// Time taken to edit, in days — only defined for the three Edit Type values
// that have a matching start/end date pair. Independent of why a row ended
// up in the 'ready' bucket (Approved override or the normal done-check).
function computeTimeTaken(row) {
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
  return rows.map((row) => ({
    ...row,
    ...classify(row),
    due: dueFlag(row.expectedDate, today),
  }));
}

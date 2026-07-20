export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function dueFlag(expectedDate, today = todayIST()) {
  if (!expectedDate) return null;
  const d = expectedDate.slice(0, 10);
  if (d < today) return 'overdue';
  if (d === today) return 'due-today';
  return null;
}

// Classify a row into who's in charge and its display bucket/status.
// Rows with no Edit Type and a Pipeline Status other than "Ideation" aren't
// covered by the spec's rules explicitly; they're folded into
// needs_assignment rather than silently dropped from the brief.
export function classify(row) {
  const { editType, pipelineStatus, editingEndHandover, fEditingStart, fEditingDone } = row;

  // Approved overrides Edit Type entirely — the video is complete.
  if (pipelineStatus === 'Approved') {
    return { bucket: 'ready', inCharge: null, status: 'approved' };
  }

  if (editType === 'Fazil Only' || editType === 'Jishnu Only') {
    const person = editType === 'Fazil Only' ? 'Fazil' : 'Jishnu';
    if (!editingEndHandover) {
      return { bucket: person.toLowerCase(), inCharge: person, status: 'editing' };
    }
    return { bucket: 'ready', inCharge: person, status: 'done, ready to post' };
  }

  if (editType === 'Jishnu + Fazil') {
    if (fEditingDone) {
      return { bucket: 'ready', inCharge: null, status: 'done, ready to post' };
    }
    if (fEditingStart || editingEndHandover) {
      return { bucket: 'fazil', inCharge: 'Fazil', status: 'sound' };
    }
    return { bucket: 'jishnu', inCharge: 'Jishnu', status: 'editing' };
  }

  if (!editType && pipelineStatus === 'Ideation') {
    return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention' };
  }

  if (!editType) {
    return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention' };
  }

  return { bucket: 'needs_assignment', inCharge: null, status: 'needs attention' };
}

export function classifyRows(rows) {
  const today = todayIST();
  return rows.map((row) => ({
    ...row,
    ...classify(row),
    due: dueFlag(row.expectedDate, today),
  }));
}

import { classifyRows, stableSort, rowsFor } from './logic.js';

const SECTIONS = [
  { bucket: 'ready', title: '✅ <b>Ready to Post</b>', footerLabel: 'Ready to Post' },
  { bucket: 'fazil', title: '👤 <i>Fazil</i>', footerLabel: 'Pending list for Fazil' },
  { bucket: 'jishnu', title: '👤 <i>Jishnu</i>', footerLabel: 'Pending list for Jishnu' },
];

const LEVIN_SECTION = { title: '👤 <i>Levin</i>', footerLabel: 'Pending list for Levin' };
const NEEDS_ATTENTION_SECTION = { bucket: 'needs_assignment', title: '💡 <b>Need Attention</b>', footerLabel: 'Need Attention' };
const TASK_LIST_CAPTION = '📋 <b>Task List</b>';
const DIVIDER = '----------';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatDate(isoDate) {
  return isoDate ? isoDate.slice(0, 10).replaceAll('-', '/') : undefined;
}

function formatLine(row) {
  const flag = row.due ? '⚠️ ' : '';
  const staleFlag = row.stale ? '⏳ ' : '';
  const due = formatDate(row.expectedDate) ?? '—';
  const tag = row.editType === 'Jishnu + Fazil' ? ' (J+F)' : '';
  if (row.bucket === 'ready') {
    const tt = row.timeTaken != null ? ` — TT: ${row.timeTaken}d` : '';
    return `• ${flag}${staleFlag}${escapeHtml(row.content)}${tag} — due: ${due}${tt}`;
  }
  return `• ${flag}${staleFlag}${escapeHtml(row.content)}${tag} — ${escapeHtml(row.status)} — due: ${due}`;
}

// Numbered (not bulleted) so Ajay can reference a task by its number:
// "/levwork 2 done".
function formatBrandTaskLine(task, n) {
  return `${n}. ${escapeHtml(task.content)} — ${escapeHtml(task.status.toLowerCase())}`;
}

// HTML parse_mode output — pass { parse_mode: 'HTML' } when sending this via Telegram.
// `quote`, when passed, only appears on the scheduled morning post, not /brief.
// `brandTasks` is Levin's checklist work (separate Notion DB, no due dates).
export function formatBrief(rows, { quote, brandTasks = [] } = {}) {
  const classified = classifyRows(rows);
  const lines = ['<b><u>Daily Brief</u></b>'];
  if (quote) lines.push(`<i>${escapeHtml(quote)}</i>`);
  lines.push('');

  const readySection = SECTIONS[0];
  const readyItems = stableSort(classified.filter((r) => r.bucket === readySection.bucket));
  if (readyItems.length > 0) {
    lines.push(readySection.title);
    for (const row of readyItems) {
      lines.push(formatLine(row));
    }
    lines.push('');
  }

  const personSections = SECTIONS.slice(1);
  const hasTaskList = personSections.some((s) => classified.some((r) => r.bucket === s.bucket)) || brandTasks.length > 0;

  if (hasTaskList) {
    lines.push(DIVIDER);
    lines.push(TASK_LIST_CAPTION);
    lines.push('');
    for (const section of personSections) {
      const items = stableSort(classified.filter((r) => r.bucket === section.bucket));
      if (items.length === 0) continue;
      lines.push(section.title);
      for (const row of items) {
        lines.push(formatLine(row));
      }
      lines.push('');
    }

    if (brandTasks.length > 0) {
      lines.push(LEVIN_SECTION.title);
      brandTasks.forEach((task, i) => {
        lines.push(formatBrandTaskLine(task, i + 1));
      });
      lines.push('');
    }

    lines.push(DIVIDER);
    lines.push('');
  }

  const needsAttentionItems = stableSort(classified.filter((r) => r.bucket === NEEDS_ATTENTION_SECTION.bucket));
  if (needsAttentionItems.length > 0) {
    lines.push(NEEDS_ATTENTION_SECTION.title);
    for (const row of needsAttentionItems) {
      lines.push(formatLine(row));
    }
    lines.push('');
  }

  if (classified.length === 0 && brandTasks.length === 0) {
    lines.push('Nothing in the pipeline right now.', '');
  }

  lines.push('<b>Summary:</b>');
  for (const section of SECTIONS) {
    const items = classified.filter((r) => r.bucket === section.bucket);
    const count = items.length;
    if (personSections.includes(section) && count > 0) {
      const jf = items.filter((r) => r.editType === 'Jishnu + Fazil').length;
      const solo = count - jf;
      lines.push(`${section.footerLabel}: ${count} (${solo} individual+${jf} JF work)`);
    } else {
      lines.push(`${section.footerLabel}: ${count}`);
    }
  }
  lines.push(`${LEVIN_SECTION.footerLabel}: ${brandTasks.length}`);
  lines.push(`${NEEDS_ATTENTION_SECTION.footerLabel}: ${needsAttentionItems.length}`);

  return lines.join('\n');
}

// "/mine" — one person's numbered list. Numbers line up with "/done <n>" and
// "/begin <n>" because both use rowsFor() → stableSort().
export function formatMine(person, rows, brandTasks = []) {
  if (person === 'Levin') {
    if (brandTasks.length === 0) return "Levin's list is empty. 🎉";
    const lines = ["📋 <b>Levin's tasks</b>", ''];
    brandTasks.forEach((t, i) => lines.push(formatBrandTaskLine(t, i + 1)));
    lines.push('', 'Mark one done: /done &lt;number&gt;');
    return lines.join('\n');
  }
  const mine = rowsFor(person, classifyRows(rows));
  if (mine.length === 0) return `Nothing on your plate right now, ${person}. 🎉`;
  const lines = [`📋 <b>${escapeHtml(person)}'s list</b>`, ''];
  mine.forEach((row, i) => {
    const flag = row.due === 'overdue' ? '⚠️ ' : row.due === 'due-today' ? '📅 ' : '';
    const staleFlag = row.stale ? '⏳ ' : '';
    const tag = row.editType === 'Jishnu + Fazil' ? ' (J+F)' : '';
    const due = formatDate(row.expectedDate) ?? '—';
    lines.push(`${i + 1}. ${flag}${staleFlag}${escapeHtml(row.content)}${tag} — ${escapeHtml(row.status)} — due: ${due}`);
  });
  if (person === 'Fazil' || person === 'Jishnu') {
    lines.push('', 'Finished one? /done &lt;number&gt;   Starting one? /begin &lt;number&gt;');
  }
  return lines.join('\n');
}

// 09:30 group post: only what's overdue or due today, grouped by owner.
export function formatOverdue(classified, today) {
  const hot = stableSort(classified.filter((r) => r.due && r.bucket !== 'ready'));
  if (hot.length === 0) return null;
  const lines = [`🔥 <b>Due today / overdue</b> — ${formatDate(today)}`, ''];
  const groups = [['Fazil', 'fazil'], ['Jishnu', 'jishnu'], ['Unassigned', 'needs_assignment']];
  for (const [label, bucket] of groups) {
    const items = hot.filter((r) => r.bucket === bucket);
    if (items.length === 0) continue;
    lines.push(`👤 <b>${label}</b>`);
    for (const r of items) {
      const tag = r.due === 'overdue' ? `⚠️ overdue ${formatDate(r.expectedDate)}` : '📅 due today';
      lines.push(`• ${escapeHtml(r.content)} — ${tag}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

// Personal DM version of the same thing.
export function formatOverdueDm(person, items) {
  const lines = [`🔥 ${escapeHtml(person)}, on your list:`, ''];
  for (const r of items) {
    const tag = r.due === 'overdue' ? `⚠️ overdue (was ${formatDate(r.expectedDate)})` : '📅 due today';
    lines.push(`• ${escapeHtml(r.content)} — ${tag}`);
  }
  lines.push('', 'Send /mine for your full list, /done &lt;n&gt; when finished.');
  return lines.join('\n');
}

export function formatStaleDm(person, items, forAdmin = false) {
  const lines = [forAdmin ? '⏳ <b>Stuck for 7+ days</b> (owner already pinged at 5):' : `⏳ ${escapeHtml(person)}, these haven't moved in a while:`, ''];
  for (const r of items) {
    const owner = forAdmin ? ` — ${r.inCharge ?? 'unassigned'}` : '';
    lines.push(`• ${escapeHtml(r.content)}${owner} — ${r.staleDays}d untouched`);
  }
  if (!forAdmin) lines.push('', 'Update the card in Notion, or /begin / /done it here, and the timer resets.');
  return lines.join('\n');
}

export function formatHandover(row) {
  return `🎧 <b>Handover to Fazil</b>\n${escapeHtml(row.content)} — Jishnu's edit is done, sound is up next. Due: ${formatDate(row.expectedDate) ?? '—'}`;
}

// Monday plan: what's due this week, per person, with a "Got it" button per person.
export function formatWeeklyPlan({ start, end }, classified, brandTasks = []) {
  const lines = [`🗓 <b>This week</b> — ${formatDate(start)} to ${formatDate(end)}`, ''];
  let any = false;
  for (const [label, bucket] of [['Fazil', 'fazil'], ['Jishnu', 'jishnu']]) {
    const items = classified.filter((r) => r.bucket === bucket);
    if (items.length === 0) continue;
    any = true;
    lines.push(`👤 <b>${label}</b>`);
    for (const r of items) lines.push(`• ${escapeHtml(r.content)} — ${formatDate(r.expectedDate)}`);
    lines.push('');
  }
  if (brandTasks.length > 0) {
    any = true;
    lines.push('👤 <b>Levin</b>');
    for (const t of brandTasks) lines.push(`• ${escapeHtml(t.content)}`);
    lines.push('');
  }
  if (!any) return null;
  lines.push('Tap 👍 to confirm you\'ve seen your list.');
  return lines.join('\n');
}

export function formatWeeklyStats({ start, end }, current, previous) {
  const diff = current.throughput - previous.throughput;
  const diffTag = diff > 0 ? `+${diff}` : `${diff}`;
  const tt = (label, val) => `Avg TT — ${label}: ${val != null ? `${val}d` : '—'}`;
  return [
    `📈 <b>Weekly Stats</b> — ${formatDate(start)} to ${formatDate(end)}`,
    '',
    `Throughput: ${current.throughput} (last week: ${previous.throughput}, ${diffTag})`,
    `Per person — Fazil: ${current.perPerson.Fazil}, Jishnu: ${current.perPerson.Jishnu}`,
    `On time: ${current.onTimePct != null ? `${current.onTimePct}%` : '—'} (last week: ${previous.onTimePct != null ? `${previous.onTimePct}%` : '—'})`,
    '',
    tt('Fazil', current.avgTT.Fazil),
    tt('Jishnu', current.avgTT.Jishnu),
    tt('J+F', current.avgTT['J+F']),
  ].join('\n');
}

export function formatCheckinStatus({ date, checkedIn, notCheckedIn, notCheckedOut, onLeave = [] }) {
  const lines = [`🕒 <b>Check-in status</b> — ${formatDate(date)}`, ''];

  if (checkedIn.length > 0) {
    lines.push('✅ <b>Checked in</b>');
    for (const c of checkedIn) {
      const note = c.note ? ` (${escapeHtml(c.note)})` : '';
      lines.push(`• ${c.person} — ${c.checkIn}${c.checkOut ? ` → out ${c.checkOut}` : ''}${note}`);
    }
  } else {
    lines.push('✅ <b>Checked in</b>', '• nobody yet');
  }
  lines.push('');

  if (onLeave.length > 0) lines.push(`🏖 On leave: ${escapeHtml(onLeave.join(', '))}`);
  lines.push(`⏳ Not checked in: ${notCheckedIn.length ? escapeHtml(notCheckedIn.join(', ')) : 'none 🎉'}`);
  lines.push(`⌛ Not checked out: ${notCheckedOut.length ? notCheckedOut.join(', ') : 'none'}`);

  return lines.join('\n');
}

export function formatAttendance(monthStr, attendance) {
  const lines = [`<b>🕒 Attendance — ${monthStr}</b>`, ''];
  for (const [person, a] of Object.entries(attendance)) {
    lines.push(`${person}: ${a.days} days, avg in ${a.avgCheckIn ?? '—'}, late ${a.late}, WFH ${a.wfh}, shoot ${a.shoot}`);
  }
  return lines.join('\n');
}

export function formatLeaveSummary(monthStr, totals) {
  const lines = [`<b>📊 Leave Summary — ${monthStr}</b>`, ''];
  for (const [person, days] of Object.entries(totals)) {
    lines.push(`${person}: ${days} day${days === 1 ? '' : 's'}`);
  }
  return lines.join('\n');
}

export function formatCard(row) {
  const c = { ...classifyRows([row])[0] };
  const line = (label, value) => `${label}: ${value ?? '—'}`;
  return [
    `📋 ${c.content}`,
    line('Pipeline Status', c.pipelineStatus),
    line('Edit Type', c.editType),
    line('Video type', c.videoType),
    line('In charge', c.inCharge ? `${c.inCharge} (${c.status})` : c.status),
    line('Posted', c.posted ? 'Yes' : 'No'),
    line('Expected date', formatDate(c.expectedDate)),
    line('Editing Start Date', formatDate(c.editingStartDate)),
    line('Editing End/Handover', formatDate(c.editingEndHandover)),
    line('F editing start', formatDate(c.fEditingStart)),
    line('F editing Done', formatDate(c.fEditingDone)),
    line('Completion date', formatDate(c.completionDate)),
    c.url,
  ].join('\n');
}

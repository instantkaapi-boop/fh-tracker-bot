import { classifyRows } from './logic.js';

const SECTIONS = [
  { bucket: 'ready', title: '✅ <b>Ready to Post</b>', footerLabel: 'Ready to Post' },
  { bucket: 'fazil', title: '👤 <i>Fazil</i>', footerLabel: 'Pending list for Fazil' },
  { bucket: 'jishnu', title: '👤 <i>Jishnu</i>', footerLabel: 'Pending list for Jishnu' },
];

const LEVIN_SECTION = { title: '👤 <i>Levin</i>', footerLabel: 'Pending list for Levin' };
const NEEDS_ATTENTION_SECTION = { bucket: 'needs_assignment', title: '💡 <b>Need Attention</b>', footerLabel: 'Need Attention' };

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function byExpectedDateAsc(a, b) {
  if (!a.expectedDate && !b.expectedDate) return 0;
  if (!a.expectedDate) return 1;
  if (!b.expectedDate) return -1;
  return a.expectedDate.localeCompare(b.expectedDate);
}

function formatLine(row) {
  const flag = row.due ? '⚠️ ' : '';
  const due = row.expectedDate ? row.expectedDate.slice(0, 10) : '—';
  const tag = row.editType === 'Jishnu + Fazil' ? ' (J+F)' : '';
  if (row.bucket === 'ready') {
    const tt = row.timeTaken != null ? ` — TT: ${row.timeTaken}d` : '';
    return `• ${flag}${escapeHtml(row.content)}${tag} — due: ${due}${tt}`;
  }
  return `• ${flag}${escapeHtml(row.content)}${tag} — ${escapeHtml(row.status)} — due: ${due}`;
}

function formatBrandTaskLine(task) {
  return `• ${escapeHtml(task.content)} — ${escapeHtml(task.status.toLowerCase())}`;
}

// HTML parse_mode output — pass { parse_mode: 'HTML' } when sending this via Telegram.
// `quote`, when passed, only appears on the scheduled morning post, not /brief.
// `brandTasks` is Levin's checklist work (separate Notion DB, no due dates).
export function formatBrief(rows, { quote, brandTasks = [] } = {}) {
  const classified = classifyRows(rows);
  const lines = ['<b><u>Daily Brief</u></b>'];
  if (quote) lines.push(`<i>${escapeHtml(quote)}</i>`);
  lines.push('');

  for (const section of SECTIONS) {
    const items = classified.filter((r) => r.bucket === section.bucket).sort(byExpectedDateAsc);
    if (items.length === 0) continue;
    lines.push(section.title);
    for (const row of items) {
      lines.push(formatLine(row));
    }
    lines.push('');
  }

  if (brandTasks.length > 0) {
    lines.push(LEVIN_SECTION.title);
    for (const task of brandTasks) {
      lines.push(formatBrandTaskLine(task));
    }
    lines.push('');
  }

  const needsAttentionItems = classified
    .filter((r) => r.bucket === NEEDS_ATTENTION_SECTION.bucket)
    .sort(byExpectedDateAsc);
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
    const count = classified.filter((r) => r.bucket === section.bucket).length;
    lines.push(`${section.footerLabel}: ${count}`);
  }
  lines.push(`${LEVIN_SECTION.footerLabel}: ${brandTasks.length}`);
  lines.push(`${NEEDS_ATTENTION_SECTION.footerLabel}: ${needsAttentionItems.length}`);

  return lines.join('\n');
}

export function formatCard(row) {
  const c = { ...classifyRows([row])[0] };
  const line = (label, value) => `${label}: ${value ?? '—'}`;
  return [
    `📋 ${c.content}`,
    line('Pipeline Status', c.pipelineStatus),
    line('Edit Type', c.editType),
    line('In charge', c.inCharge ? `${c.inCharge} (${c.status})` : c.status),
    line('Posted', c.posted ? 'Yes' : 'No'),
    line('Expected date', c.expectedDate?.slice(0, 10)),
    line('Editing Start Date', c.editingStartDate?.slice(0, 10)),
    line('Editing End/Handover', c.editingEndHandover?.slice(0, 10)),
    line('F editing start', c.fEditingStart?.slice(0, 10)),
    line('F editing Done', c.fEditingDone?.slice(0, 10)),
    line('Completion date', c.completionDate?.slice(0, 10)),
    c.url,
  ].join('\n');
}

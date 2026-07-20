import { classifyRows } from './logic.js';

const SECTIONS = [
  { bucket: 'ready', title: '✅ Ready to Post' },
  { bucket: 'fazil', title: '👤 Fazil' },
  { bucket: 'jishnu', title: '👤 Jishnu' },
  { bucket: 'needs_assignment', title: '💡 Need Attention' },
];

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
  return `• ${flag}${escapeHtml(row.content)} — ${escapeHtml(row.status)} — due: ${due}`;
}

// HTML parse_mode output — pass { parse_mode: 'HTML' } when sending this via Telegram.
export function formatBrief(rows) {
  const classified = classifyRows(rows);
  const lines = ['<b>Daily Brief</b>', ''];

  for (const section of SECTIONS) {
    const items = classified.filter((r) => r.bucket === section.bucket).sort(byExpectedDateAsc);
    if (items.length === 0) continue;
    lines.push(section.title);
    for (const row of items) {
      lines.push(formatLine(row));
    }
    lines.push('');
  }

  if (classified.length === 0) {
    lines.push('Nothing in the pipeline right now.', '');
  }

  for (const section of SECTIONS) {
    const count = classified.filter((r) => r.bucket === section.bucket).length;
    lines.push(`${section.title.replace(/^\S+\s/, '')}: ${count}`);
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

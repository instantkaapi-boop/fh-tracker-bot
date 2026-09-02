import { hasDashboardToken } from '../lib/auth.js';
import { fetchOpenRows } from '../lib/notion.js';
import { classifyRows } from '../lib/logic.js';

export const config = { maxDuration: 30 };

function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function ymd(iso) {
  return iso.slice(0, 10).replaceAll('-', '');
}

// Subscribe in Google/Apple Calendar: https://<app>/api/calendar?token=<DASHBOARD_TOKEN>
// One all-day event per open row with an Expected date, titled with owner + status.
export default async function handler(req, res) {
  if (!hasDashboardToken(req)) {
    res.status(401).send('unauthorized');
    return;
  }
  try {
    const rows = classifyRows(await fetchOpenRows()).filter((r) => r.expectedDate);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FH Tracker Bot//EN', 'CALSCALE:GREGORIAN',
      'X-WR-CALNAME:FH Content Due Dates', 'X-WR-TIMEZONE:Asia/Kolkata',
    ];
    for (const r of rows) {
      const owner = r.inCharge ? `[${r.inCharge}] ` : r.bucket === 'ready' ? '[Ready] ' : '[Unassigned] ';
      const start = ymd(r.expectedDate);
      const end = new Date(Date.UTC(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8) + 1)).toISOString().slice(0, 10).replaceAll('-', '');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${r.id}@fh-tracker-bot`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsEscape(owner + r.content)}`,
        `DESCRIPTION:${icsEscape(`${r.status}${r.editType ? ` · ${r.editType}` : ''}\n${r.url}`)}`,
        `URL:${r.url}`,
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(lines.join('\r\n'));
  } catch (err) {
    console.error('calendar error:', err);
    res.status(500).send('internal error');
  }
}

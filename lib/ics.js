function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function ymd(iso) {
  return iso.slice(0, 10).replaceAll('-', '');
}

function nextDay(yyyymmdd) {
  return new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1)).toISOString().slice(0, 10).replaceAll('-', '');
}

// One all-day event per classified row with an Expected date.
export function buildIcs(classifiedRows) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FH Tracker Bot//EN', 'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:FH Content Due Dates', 'X-WR-TIMEZONE:Asia/Kolkata',
  ];
  for (const r of classifiedRows.filter((x) => x.expectedDate)) {
    const owner = r.inCharge ? `[${r.inCharge}] ` : r.bucket === 'ready' ? '[Ready] ' : '[Unassigned] ';
    const start = ymd(r.expectedDate);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${r.id}@fh-tracker-bot`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${nextDay(start)}`,
      `SUMMARY:${icsEscape(owner + r.content)}`,
      `DESCRIPTION:${icsEscape(`${r.status}${r.editType ? ` · ${r.editType}` : ''}\n${r.url}`)}`,
      `URL:${r.url}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

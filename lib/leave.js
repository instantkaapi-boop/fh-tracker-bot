import { notion } from './notion.js';
import { todayIST } from './logic.js';
import { ROSTER } from './roster.js';

const DATA_SOURCE_ID = process.env.LEAVE_DATA_SOURCE;

const TYPE_LABEL = { half: 'Half Day', full: 'Full Day' };
const TYPE_VALUE = { 'Half Day': 0.5, 'Full Day': 1 };

function parseRow(page) {
  const p = page.properties;
  return {
    id: page.id,
    person: p['Person']?.select?.name ?? null,
    date: p['Date']?.date?.start ?? null,
    type: p['Type']?.select?.name ?? null,
  };
}

async function findLeave(person, date) {
  const res = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: {
      and: [
        { property: 'Person', select: { equals: person } },
        { property: 'Date', date: { equals: date } },
      ],
    },
    page_size: 1,
  });
  return res.results[0] ? parseRow(res.results[0]) : null;
}

// One leave row per person per day. Logging again on the same day updates
// the type (half → full) instead of double-counting in the monthly summary.
export async function logLeave(person, type, date = todayIST()) {
  const label = TYPE_LABEL[type];
  const existing = await findLeave(person, date);
  if (existing) {
    if (existing.type === label) return { id: existing.id, person, type: label, date, status: 'already' };
    await notion.pages.update({
      page_id: existing.id,
      properties: {
        Entry: { title: [{ text: { content: `${person} - ${label} - ${date}` } }] },
        Type: { select: { name: label } },
      },
    });
    return { id: existing.id, person, type: label, date, status: 'updated', previous: existing.type };
  }
  const page = await notion.pages.create({
    parent: { data_source_id: DATA_SOURCE_ID },
    properties: {
      Entry: { title: [{ text: { content: `${person} - ${label} - ${date}` } }] },
      Person: { select: { name: person } },
      Date: { date: { start: date } },
      Type: { select: { name: label } },
    },
  });
  return { id: page.id, person, type: label, date, status: 'created' };
}

export async function cancelLeave(person, date = todayIST()) {
  const existing = await findLeave(person, date);
  if (!existing) return { status: 'none', date };
  await notion.pages.update({ page_id: existing.id, archived: true });
  return { status: 'cancelled', date, type: existing.type };
}

// [start, end) — end is the first day of the following month.
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const endDate = new Date(Date.UTC(y, m, 1)); // JS month is 0-based, so this is day 1 of next month
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

async function monthRows(monthStr) {
  const { start, end } = monthRange(monthStr);
  const rows = [];
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DATA_SOURCE_ID,
      filter: {
        and: [
          { property: 'Date', date: { on_or_after: start } },
          { property: 'Date', date: { before: end } },
        ],
      },
      sorts: [{ property: 'Date', direction: 'ascending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...res.results.map(parseRow));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

export async function monthlyLeaveSummary(monthStr) {
  const rows = await monthRows(monthStr);
  const totals = Object.fromEntries(ROSTER.map((p) => [p, 0]));
  for (const { person, type } of rows) {
    if (person in totals && type in TYPE_VALUE) {
      totals[person] += TYPE_VALUE[type];
    }
  }
  return totals;
}

// One person's leave entries this month, for "/leaves".
export async function myLeaves(person, monthStr = todayIST().slice(0, 7)) {
  const rows = (await monthRows(monthStr)).filter((r) => r.person === person);
  const total = rows.reduce((sum, r) => sum + (TYPE_VALUE[r.type] ?? 0), 0);
  return { monthStr, entries: rows, total };
}

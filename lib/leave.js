import { notion } from './notion.js';
import { todayIST } from './logic.js';
import { ROSTER } from './roster.js';

const DATA_SOURCE_ID = process.env.LEAVE_DATA_SOURCE;

const TYPE_LABEL = { half: 'Half Day', full: 'Full Day' };
const TYPE_VALUE = { 'Half Day': 0.5, 'Full Day': 1 };

export async function logLeave(person, type, date = todayIST()) {
  const label = TYPE_LABEL[type];
  const page = await notion.pages.create({
    parent: { data_source_id: DATA_SOURCE_ID },
    properties: {
      Entry: { title: [{ text: { content: `${person} - ${label} - ${date}` } }] },
      Person: { select: { name: person } },
      Date: { date: { start: date } },
      Type: { select: { name: label } },
    },
  });
  return { id: page.id, person, type: label, date };
}

// [start, end) — end is the first day of the following month.
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const endDate = new Date(Date.UTC(y, m, 1)); // JS month is 0-based, so this is day 1 of next month
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

export async function monthlyLeaveSummary(monthStr) {
  const { start, end } = monthRange(monthStr);
  const res = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: {
      and: [
        { property: 'Date', date: { on_or_after: start } },
        { property: 'Date', date: { before: end } },
      ],
    },
    page_size: 100,
  });

  const totals = Object.fromEntries(ROSTER.map((p) => [p, 0]));
  for (const page of res.results) {
    const person = page.properties['Person']?.select?.name;
    const typeLabel = page.properties['Type']?.select?.name;
    if (person in totals && typeLabel in TYPE_VALUE) {
      totals[person] += TYPE_VALUE[typeLabel];
    }
  }
  return totals;
}

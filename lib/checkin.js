import { notion } from './notion.js';
import { todayIST } from './logic.js';
import { ROSTER } from './roster.js';

const DATA_SOURCE_ID = process.env.CHECKIN_DATA_SOURCE;

function nowISTIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+05:30`;
}

function parseRow(page) {
  const p = page.properties;
  return {
    id: page.id,
    person: p['Person']?.select?.name ?? null,
    date: p['Date']?.date?.start ?? null,
    checkInTime: p['Check-in Time']?.date?.start ?? null,
    checkOutTime: p['Check-out Time']?.date?.start ?? null,
  };
}

async function findTodayRow(person, today) {
  const res = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: {
      and: [
        { property: 'Person', select: { equals: person } },
        { property: 'Date', date: { equals: today } },
      ],
    },
    page_size: 1,
  });
  return res.results[0] ? parseRow(res.results[0]) : null;
}

async function createTodayRow(person, today) {
  const page = await notion.pages.create({
    parent: { data_source_id: DATA_SOURCE_ID },
    properties: {
      Entry: { title: [{ text: { content: `${person} - ${today}` } }] },
      Person: { select: { name: person } },
      Date: { date: { start: today } },
    },
  });
  return parseRow(page);
}

export async function checkIn(person) {
  const today = todayIST();
  let row = await findTodayRow(person, today);
  if (!row) row = await createTodayRow(person, today);
  if (row.checkInTime) {
    return { status: 'already', time: row.checkInTime };
  }
  const time = nowISTIso();
  await notion.pages.update({
    page_id: row.id,
    properties: { 'Check-in Time': { date: { start: time } } },
  });
  return { status: 'ok', time };
}

export async function checkOut(person) {
  const today = todayIST();
  const row = await findTodayRow(person, today);
  if (!row || !row.checkInTime) {
    return { status: 'no-checkin' };
  }
  if (row.checkOutTime) {
    return { status: 'already', time: row.checkOutTime };
  }
  const time = nowISTIso();
  await notion.pages.update({
    page_id: row.id,
    properties: { 'Check-out Time': { date: { start: time } } },
  });
  return { status: 'ok', time };
}

async function getTodayRows() {
  const today = todayIST();
  const res = await notion.dataSources.query({
    data_source_id: DATA_SOURCE_ID,
    filter: { property: 'Date', date: { equals: today } },
    page_size: 100,
  });
  return res.results.map(parseRow);
}

export async function missingCheckins() {
  const rows = await getTodayRows();
  const checkedIn = new Set(rows.filter((r) => r.checkInTime).map((r) => r.person));
  return ROSTER.filter((p) => !checkedIn.has(p));
}

export async function missingCheckouts() {
  const rows = await getTodayRows();
  const checkedIn = rows.filter((r) => r.checkInTime);
  const checkedInNames = new Set(checkedIn.map((r) => r.person));
  return {
    pendingCheckout: checkedIn.filter((r) => !r.checkOutTime).map((r) => r.person),
    neverCheckedIn: ROSTER.filter((p) => !checkedInNames.has(p)),
  };
}

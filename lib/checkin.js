import { notion } from './notion.js';
import { todayIST, isLateCheckin, averageTime } from './logic.js';
import { leavesForDate } from './leave.js';

// Who the daily check-in / check-out reminders nag. Deliberately a hard-coded
// list, not derived from ROSTER — only Jishnu and Levin do check-ins. Fazil
// and Ajay (owner/test account) are excluded.
export const CHECKIN_ROSTER = ['Jishnu', 'Levin'];

// Check-ins after this (IST, 24h) count as late in the monthly attendance report.
export const LATE_AFTER = '10:30';

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
    note: (p['Note']?.rich_text ?? []).map((t) => t.plain_text).join('').trim() || null,
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

function noteProp(text) {
  return { 'Note': { rich_text: [{ text: { content: text.slice(0, 200) } }] } };
}

export async function checkIn(person, timeOverride, note) {
  const today = todayIST();
  let row = await findTodayRow(person, today);
  if (!row) row = await createTodayRow(person, today);
  if (row.checkInTime) {
    return { status: 'already', time: row.checkInTime };
  }
  const time = timeOverride ? `${today}T${timeOverride}:00+05:30` : nowISTIso();
  await notion.pages.update({
    page_id: row.id,
    properties: {
      'Check-in Time': { date: { start: time } },
      ...(note ? noteProp(row.note ? `${row.note}; ${note}` : note) : {}),
    },
  });
  return { status: 'ok', time };
}

export async function checkOut(person, timeOverride) {
  const today = todayIST();
  const row = await findTodayRow(person, today);
  if (!row || !row.checkInTime) {
    return { status: 'no-checkin' };
  }
  if (row.checkOutTime) {
    return { status: 'already', time: row.checkOutTime };
  }
  const time = timeOverride ? `${today}T${timeOverride}:00+05:30` : nowISTIso();
  await notion.pages.update({
    page_id: row.id,
    properties: { 'Check-out Time': { date: { start: time } } },
  });
  return { status: 'ok', time };
}

// "/late <reason>" — flags today's row before the person arrives so the
// 11:00 reminder and the status post show why. Doesn't check them in.
export async function markLate(person, reason) {
  const today = todayIST();
  let row = await findTodayRow(person, today);
  if (!row) row = await createTodayRow(person, today);
  const text = reason ? `Late: ${reason}` : 'Late';
  await notion.pages.update({
    page_id: row.id,
    properties: noteProp(row.note ? `${row.note}; ${text}` : text),
  });
  return { status: 'ok', note: text };
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

async function fullDayLeaveNames() {
  const leaves = await leavesForDate();
  return new Set(leaves.filter((l) => l.type === 'Full Day').map((l) => l.person));
}

export async function missingCheckins() {
  const [rows, onLeave] = await Promise.all([getTodayRows(), fullDayLeaveNames()]);
  const checkedIn = new Set(rows.filter((r) => r.checkInTime).map((r) => r.person));
  const notes = Object.fromEntries(rows.filter((r) => r.note).map((r) => [r.person, r.note]));
  return CHECKIN_ROSTER.filter((p) => !onLeave.has(p) && !checkedIn.has(p)).map((p) => (notes[p] ? `${p} (${notes[p]})` : p));
}

export async function missingCheckouts() {
  const [rows, onLeave] = await Promise.all([getTodayRows(), fullDayLeaveNames()]);
  const checkedIn = rows.filter((r) => r.checkInTime);
  const checkedInNames = new Set(checkedIn.map((r) => r.person));
  return {
    pendingCheckout: checkedIn.filter((r) => !r.checkOutTime).map((r) => r.person),
    neverCheckedIn: CHECKIN_ROSTER.filter((p) => !onLeave.has(p) && !checkedInNames.has(p)),
  };
}

// Full snapshot of today's check-in state, for the 19:00 IST status post and dashboard.
export async function todayCheckinStatus() {
  const [rows, onLeave] = await Promise.all([getTodayRows(), fullDayLeaveNames()]);
  const byPerson = new Map(rows.filter((r) => r.person).map((r) => [r.person, r]));

  const checkedIn = CHECKIN_ROSTER
    .map((p) => ({ person: p, row: byPerson.get(p) }))
    .filter(({ row }) => row?.checkInTime)
    .map(({ person, row }) => ({
      person,
      checkIn: row.checkInTime.slice(11, 16),
      checkOut: row.checkOutTime ? row.checkOutTime.slice(11, 16) : null,
      note: row.note,
    }))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const checkedInNames = new Set(checkedIn.map((c) => c.person));
  return {
    date: todayIST(),
    checkedIn,
    onLeave: CHECKIN_ROSTER.filter((p) => onLeave.has(p) && !checkedInNames.has(p)),
    notCheckedIn: CHECKIN_ROSTER.filter((p) => !onLeave.has(p) && !checkedInNames.has(p)).map((p) => {
      const note = byPerson.get(p)?.note;
      return note ? `${p} (${note})` : p;
    }),
    notCheckedOut: checkedIn.filter((c) => !c.checkOut).map((c) => c.person),
  };
}

// Month attendance per CHECKIN_ROSTER member: days present, average check-in,
// late count (after LATE_AFTER), WFH and shoot-day counts. monthStr = "YYYY-MM".
export async function monthlyAttendance(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
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
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...res.results.map(parseRow));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const result = {};
  for (const person of CHECKIN_ROSTER) {
    const mine = rows.filter((r) => r.person === person && r.checkInTime);
    const times = mine.map((r) => r.checkInTime.slice(11, 16));
    result[person] = {
      days: mine.length,
      avgCheckIn: averageTime(times),
      late: times.filter((t) => isLateCheckin(t, LATE_AFTER)).length,
      wfh: mine.filter((r) => /wfh/i.test(r.note ?? '')).length,
      shoot: mine.filter((r) => /shoot/i.test(r.note ?? '')).length,
    };
  }
  return result;
}

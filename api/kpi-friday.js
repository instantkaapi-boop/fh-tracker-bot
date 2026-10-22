import { cronHandler } from '../lib/cron.js';
import { dmPerson } from '../lib/telegram.js';
import { fetchRowsCompletedBetween, fetchRowsCreatedBetween } from '../lib/notion.js';
import { weekRangeIST, todayIST, computeShootKPI, lateShootLog } from '../lib/logic.js';
import { formatKPI } from '../lib/format.js';
import { ADMIN_PERSON } from '../lib/roster.js';

export const config = { maxDuration: 30 };

// Friday personal DM to Ajay only: per-person Shoot Done Date → Completion
// date turnaround for the week so far, plus any card whose Shoot Done Date
// looks backdated against when it was created in Notion (logged late).
export default cronHandler('Weekly KPI DM (/api/kpi-friday)', {}, async () => {
  const week = weekRangeIST(0);
  const today = todayIST();
  const [completedRows, createdRows] = await Promise.all([
    fetchRowsCompletedBetween(week.start, today),
    fetchRowsCreatedBetween(week.start, today),
  ]);
  const kpi = computeShootKPI(completedRows);
  const lateRows = createdRows.map((r) => lateShootLog(r)).filter(Boolean);
  const sent = await dmPerson(ADMIN_PERSON, formatKPI({ start: week.start, end: today }, kpi, lateRows));
  return { sent, kpi, lateCount: lateRows.length };
});

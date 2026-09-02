import { cronHandler } from '../lib/cron.js';
import { sendChunked, dmPerson, PLAN_KEYBOARD } from '../lib/telegram.js';
import { fetchOpenRows } from '../lib/notion.js';
import { fetchOpenBrandTasks } from '../lib/brand.js';
import { classifyRows, rowsFor, todayIST, isMondayIST, weekRangeIST, dueBetween, STALE_DM_OWNER_DAYS, STALE_DM_ADMIN_DAYS } from '../lib/logic.js';
import { formatOverdue, formatOverdueDm, formatStaleDm, formatHandover, formatWeeklyPlan } from '../lib/format.js';
import { ADMIN_PERSON } from '../lib/roster.js';

export const config = { maxDuration: 60 };

// 09:30 IST, Mon–Sat. Four things in one job so the group gets one focused
// post instead of a spray of crons:
//  1. group post: only overdue / due-today rows, grouped by owner
//  2. DM each editor their own overdue list
//  3. stale escalation: owner DM at 5 days untouched, admin DM at 7
//  4. handover ping: J+F rows whose handover date is today → DM Fazil
//  5. Mondays: this week's plan with a "Got it" button
export default cronHandler('Morning nudge (/api/nudge)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const today = todayIST();
  const [rows, brandTasks] = await Promise.all([fetchOpenRows(), fetchOpenBrandTasks()]);
  const classified = classifyRows(rows, today);
  const report = { overduePost: false, dms: {}, stale: {}, handover: [], plan: false };

  // 1. group post
  const overdueText = formatOverdue(classified, today);
  if (overdueText) {
    await sendChunked(chatId, overdueText, { parse_mode: 'HTML' });
    report.overduePost = true;
  }

  // 2. personal DMs
  for (const person of ['Fazil', 'Jishnu']) {
    const hot = rowsFor(person, classified).filter((r) => r.due);
    if (hot.length > 0) report.dms[person] = await dmPerson(person, formatOverdueDm(person, hot));
  }

  // 3. stale escalation
  const stuck = classified.filter((r) => r.bucket !== 'ready' && r.staleDays >= STALE_DM_OWNER_DAYS);
  for (const person of ['Fazil', 'Jishnu']) {
    const mine = stuck.filter((r) => r.inCharge === person);
    if (mine.length > 0) report.stale[person] = await dmPerson(person, formatStaleDm(person, mine));
  }
  const veryStuck = stuck.filter((r) => r.staleDays >= STALE_DM_ADMIN_DAYS);
  if (veryStuck.length > 0) report.stale[ADMIN_PERSON] = await dmPerson(ADMIN_PERSON, formatStaleDm(ADMIN_PERSON, veryStuck, true));

  // 4. handover ping (the Notion webhook does this instantly; this is the daily backstop)
  const handovers = classified.filter((r) => r.editType === 'Jishnu + Fazil' && r.editingEndHandover?.slice(0, 10) === today && !r.fEditingStart);
  for (const row of handovers) {
    const text = formatHandover(row);
    await sendChunked(chatId, text, { parse_mode: 'HTML' });
    await dmPerson('Fazil', text);
    report.handover.push(row.content);
  }

  // 5. Monday plan
  if (isMondayIST()) {
    const week = weekRangeIST(0, today);
    const planText = formatWeeklyPlan(week, dueBetween(classified, week.start, week.end), brandTasks);
    if (planText) {
      await sendChunked(chatId, planText, { parse_mode: 'HTML', ...PLAN_KEYBOARD });
      report.plan = true;
    }
  }

  return report;
});

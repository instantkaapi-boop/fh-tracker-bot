import { cronHandler } from '../lib/cron.js';
import { sendChunked } from '../lib/telegram.js';
import { monthlyLeaveSummary } from '../lib/leave.js';
import { monthlyAttendance } from '../lib/checkin.js';
import { todayIST, isLastDayOfMonthIST } from '../lib/logic.js';
import { formatLeaveSummary, formatAttendance } from '../lib/format.js';

export const config = { maxDuration: 30 };

// Runs daily at 20:00 IST, only acts on the last day of the month. Posts the
// leave totals and the attendance report (avg check-in, late count, WFH).
export default cronHandler('Leave summary (/api/leave-summary)', { requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async (req) => {
  const force = req.query?.force === 'true';
  const today = todayIST();
  if (!force && !isLastDayOfMonthIST(today)) {
    return { skipped: true, reason: 'not last day of month', today };
  }
  const monthStr = today.slice(0, 7);
  const [totals, attendance] = await Promise.all([monthlyLeaveSummary(monthStr), monthlyAttendance(monthStr)]);
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  await sendChunked(chatId, formatLeaveSummary(monthStr, totals), { parse_mode: 'HTML' });
  await sendChunked(chatId, formatAttendance(monthStr, attendance), { parse_mode: 'HTML' });
  return { monthStr, totals, attendance };
});

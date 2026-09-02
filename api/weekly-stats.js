import { cronHandler } from '../lib/cron.js';
import { sendChunked } from '../lib/telegram.js';
import { fetchRowsCompletedBetween } from '../lib/notion.js';
import { computeWeeklyStats, weekRangeIST } from '../lib/logic.js';
import { formatWeeklyStats } from '../lib/format.js';

export const config = { maxDuration: 30 };

export default cronHandler('Weekly stats (/api/weekly-stats)', { requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const current = weekRangeIST(-1);
  const previous = weekRangeIST(-2);
  const [currentRows, previousRows] = await Promise.all([
    fetchRowsCompletedBetween(current.start, current.end),
    fetchRowsCompletedBetween(previous.start, previous.end),
  ]);
  const currentStats = computeWeeklyStats(currentRows);
  const previousStats = computeWeeklyStats(previousRows);
  await sendChunked(process.env.TELEGRAM_GROUP_CHAT_ID, formatWeeklyStats(current, currentStats, previousStats), { parse_mode: 'HTML' });
  return { current: currentStats, previous: previousStats };
});

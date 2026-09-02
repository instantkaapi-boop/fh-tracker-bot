import { cronHandler } from '../lib/cron.js';
import { sendChunked } from '../lib/telegram.js';
import { fetchOpenRows } from '../lib/notion.js';
import { fetchOpenBrandTasks } from '../lib/brand.js';
import { formatBrief } from '../lib/format.js';
import { fetchDailyQuote } from '../lib/quote.js';

export const config = { maxDuration: 30 };

export default cronHandler('Daily brief (/api/cron)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const [rows, brandTasks, quote] = await Promise.all([fetchOpenRows(), fetchOpenBrandTasks(), fetchDailyQuote()]);
  await sendChunked(process.env.TELEGRAM_GROUP_CHAT_ID, formatBrief(rows, { quote, brandTasks }), { parse_mode: 'HTML' });
  return { count: rows.length, brandTaskCount: brandTasks.length, quote };
});

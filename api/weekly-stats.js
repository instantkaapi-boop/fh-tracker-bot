import { bot } from '../lib/bot.js';
import { fetchRowsCompletedBetween } from '../lib/notion.js';
import { computeWeeklyStats, weekRangeIST } from '../lib/logic.js';
import { formatWeeklyStats } from '../lib/format.js';
import { alertAdmin } from '../lib/alert.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${secret}`) return true;
  const { secret: querySecret } = req.query ?? {};
  return querySecret === secret;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!chatId) {
    res.status(500).json({ ok: false, error: 'TELEGRAM_GROUP_CHAT_ID not set' });
    return;
  }

  try {
    const current = weekRangeIST(-1);
    const previous = weekRangeIST(-2);
    const [currentRows, previousRows] = await Promise.all([
      fetchRowsCompletedBetween(current.start, current.end),
      fetchRowsCompletedBetween(previous.start, previous.end),
    ]);
    const currentStats = computeWeeklyStats(currentRows);
    const previousStats = computeWeeklyStats(previousRows);
    await bot.telegram.sendMessage(chatId, formatWeeklyStats(current, currentStats, previousStats), { parse_mode: 'HTML' });
    res.status(200).json({ ok: true, current: currentStats, previous: previousStats });
  } catch (err) {
    console.error('weekly-stats error:', err);
    await alertAdmin('Weekly stats (/api/weekly-stats)', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

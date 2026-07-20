import { bot } from '../lib/bot.js';
import { monthlyLeaveSummary } from '../lib/leave.js';
import { todayIST, isLastDayOfMonthIST } from '../lib/logic.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${secret}`) return true;
  const { secret: querySecret } = req.query ?? {};
  return querySecret === secret;
}

function formatSummary(monthStr, totals) {
  const lines = [`<b>📊 Leave Summary — ${monthStr}</b>`, ''];
  for (const [person, days] of Object.entries(totals)) {
    lines.push(`${person}: ${days} day${days === 1 ? '' : 's'}`);
  }
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }

  const force = req.query?.force === 'true';
  const today = todayIST();
  if (!force && !isLastDayOfMonthIST(today)) {
    res.status(200).json({ ok: true, skipped: true, reason: 'not last day of month', today });
    return;
  }

  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!chatId) {
    res.status(500).json({ ok: false, error: 'TELEGRAM_GROUP_CHAT_ID not set' });
    return;
  }

  try {
    const monthStr = today.slice(0, 7);
    const totals = await monthlyLeaveSummary(monthStr);
    await bot.telegram.sendMessage(chatId, formatSummary(monthStr, totals), { parse_mode: 'HTML' });
    res.status(200).json({ ok: true, monthStr, totals });
  } catch (err) {
    console.error('leave-summary error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

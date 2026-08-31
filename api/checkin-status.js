import { bot } from '../lib/bot.js';
import { todayCheckinStatus } from '../lib/checkin.js';
import { formatCheckinStatus } from '../lib/format.js';
import { alertAdmin } from '../lib/alert.js';
import { isSundayIST } from '../lib/logic.js';

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

  if (isSundayIST()) {
    res.status(200).json({ ok: true, skipped: 'sunday' });
    return;
  }

  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!chatId) {
    res.status(500).json({ ok: false, error: 'TELEGRAM_GROUP_CHAT_ID not set' });
    return;
  }

  try {
    const status = await todayCheckinStatus();
    await bot.telegram.sendMessage(chatId, formatCheckinStatus(status), { parse_mode: 'HTML' });
    res.status(200).json({ ok: true, status });
  } catch (err) {
    console.error('checkin-status error:', err);
    await alertAdmin('Check-in status (/api/checkin-status)', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

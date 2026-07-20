import { bot } from '../lib/bot.js';
import { missingCheckins } from '../lib/checkin.js';

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
    const missing = await missingCheckins();
    if (missing.length > 0) {
      const text = `⏰ <b>Check-in reminder</b>\nStill haven't checked in: ${missing.join(', ')}`;
      await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }
    res.status(200).json({ ok: true, missing });
  } catch (err) {
    console.error('checkin-reminder error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

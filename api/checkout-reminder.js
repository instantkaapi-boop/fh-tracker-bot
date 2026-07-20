import { bot } from '../lib/bot.js';
import { missingCheckouts } from '../lib/checkin.js';

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
    const { pendingCheckout, neverCheckedIn } = await missingCheckouts();
    const lines = ['⏰ <b>Check-out reminder</b>'];
    if (pendingCheckout.length > 0) {
      lines.push(`Still haven't checked out: ${pendingCheckout.join(', ')}`);
    }
    if (neverCheckedIn.length > 0) {
      lines.push(`No check-in recorded today: ${neverCheckedIn.join(', ')}`);
    }
    if (pendingCheckout.length > 0 || neverCheckedIn.length > 0) {
      await bot.telegram.sendMessage(chatId, lines.join('\n'), { parse_mode: 'HTML' });
    }
    res.status(200).json({ ok: true, pendingCheckout, neverCheckedIn });
  } catch (err) {
    console.error('checkout-reminder error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

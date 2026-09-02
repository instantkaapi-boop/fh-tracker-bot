import { bot } from '../lib/bot.js';

// Telegram echoes the secret_token we passed to setWebhook back on every
// update in this header. Without this check anyone who guesses the URL can
// POST a fake update and run commands as any roster member.
function isFromTelegram(req) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // not configured yet — fail open so a missing env var can't take the bot down
  return req.headers['x-telegram-bot-api-secret-token'] === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('FH Tracker Bot webhook is live.');
    return;
  }
  if (!isFromTelegram(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('Webhook error:', err);
  }
  res.status(200).json({ ok: true });
}

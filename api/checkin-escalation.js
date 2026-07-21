import { bot } from '../lib/bot.js';
import { missingCheckins } from '../lib/checkin.js';
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

  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!adminChatId) {
    res.status(500).json({ ok: false, error: 'ADMIN_CHAT_ID not set' });
    return;
  }

  try {
    const missing = await missingCheckins();
    if (missing.length > 0) {
      const text = `🔴 <b>Still not checked in (past noon)</b>\n${missing.join(', ')}`;
      await bot.telegram.sendMessage(adminChatId, text, { parse_mode: 'HTML' });
    }
    res.status(200).json({ ok: true, missing });
  } catch (err) {
    console.error('checkin-escalation error:', err);
    await alertAdmin('Check-in escalation (/api/checkin-escalation)', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

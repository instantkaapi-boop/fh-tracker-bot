import { bot } from '../lib/bot.js';
import { fetchOpenRows } from '../lib/notion.js';
import { formatBrief } from '../lib/format.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — fail open only for local/manual testing
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
    const rows = await fetchOpenRows();
    const text = formatBrief(rows);
    await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    res.status(200).json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('cron error:', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

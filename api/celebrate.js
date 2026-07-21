import { bot } from '../lib/bot.js';
import { fetchUncelebratedPostedRows, markCelebrated } from '../lib/notion.js';
import { escapeHtml } from '../lib/format.js';
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
    const rows = await fetchUncelebratedPostedRows();
    for (const row of rows) {
      await bot.telegram.sendMessage(chatId, `🎉 <b>${escapeHtml(row.content)}</b> posted!`, { parse_mode: 'HTML' });
      await markCelebrated(row.id);
    }
    res.status(200).json({ ok: true, count: rows.length });
  } catch (err) {
    console.error('celebrate error:', err);
    await alertAdmin('Posted celebration (/api/celebrate)', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

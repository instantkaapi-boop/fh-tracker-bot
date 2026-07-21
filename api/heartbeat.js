import { bot } from '../lib/bot.js';
import { fetchOpenRows } from '../lib/notion.js';
import { alertAdmin } from '../lib/alert.js';

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${secret}`) return true;
  const { secret: querySecret } = req.query ?? {};
  return querySecret === secret;
}

// Confirms Notion + Telegram are both reachable once a day, independent of whether
// any other cron job happened to run — per-job failures already self-report via
// alertAdmin, but a job that never fires at all (deploy broken, secret misconfigured)
// can't alert on itself. This is the backstop for that case.
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
    const rows = await fetchOpenRows();
    await bot.telegram.sendMessage(
      adminChatId,
      `✅ Bot heartbeat — alive, Notion reachable (${rows.length} open).`,
      { parse_mode: 'HTML' },
    );
    res.status(200).json({ ok: true, openCount: rows.length });
  } catch (err) {
    console.error('heartbeat error:', err);
    await alertAdmin('Heartbeat (/api/heartbeat)', err);
    res.status(500).json({ ok: false, error: 'internal error' });
  }
}

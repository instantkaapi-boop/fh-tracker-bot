import { cronHandler } from '../lib/cron.js';
import { bot } from '../lib/bot.js';
import { fetchOpenRows } from '../lib/notion.js';

export const config = { maxDuration: 30 };

// Confirms Notion + Telegram are both reachable once a day, independent of whether
// any other cron job happened to run — per-job failures already self-report via
// alertAdmin, but a job that never fires at all (deploy broken, secret misconfigured)
// can't alert on itself. This is the backstop for that case.
export default cronHandler('Heartbeat (/api/heartbeat)', { requireEnv: ['ADMIN_CHAT_ID'] }, async () => {
  const rows = await fetchOpenRows();
  await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `✅ Bot heartbeat — alive, Notion reachable (${rows.length} open).`, { parse_mode: 'HTML' });
  return { openCount: rows.length };
});

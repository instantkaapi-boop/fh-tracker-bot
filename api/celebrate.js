import { cronHandler } from '../lib/cron.js';
import { bot } from '../lib/bot.js';
import { fetchUncelebratedPostedRows, markCelebrated } from '../lib/notion.js';
import { escapeHtml } from '../lib/format.js';

export const config = { maxDuration: 30 };

export default cronHandler('Posted celebration (/api/celebrate)', { requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const rows = await fetchUncelebratedPostedRows();
  for (const row of rows) {
    // Mark first so a Telegram hiccup can't re-celebrate the same row tomorrow.
    await markCelebrated(row.id);
    await bot.telegram.sendMessage(process.env.TELEGRAM_GROUP_CHAT_ID, `🎉 <b>${escapeHtml(row.content)}</b> posted!`, { parse_mode: 'HTML' });
  }
  return { count: rows.length };
});

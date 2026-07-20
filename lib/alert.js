import { bot } from './bot.js';

// Best-effort admin DM on cron failure — never throws, so an alerting
// hiccup can't mask or replace the original error.
export async function alertAdmin(jobName, err) {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (!adminChatId) return;
  try {
    await bot.telegram.sendMessage(
      adminChatId,
      `⚠️ <b>${jobName}</b> failed:\n${err?.message ?? String(err)}`,
      { parse_mode: 'HTML' },
    );
  } catch (alertErr) {
    console.error('alertAdmin failed:', alertErr);
  }
}

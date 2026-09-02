import 'dotenv/config';
import { bot } from '../lib/bot.js';

// WARNING: bot.launch() switches Telegram to long-polling, which DELETES the
// production webhook. The bot on Vercel goes silent until the webhook is
// restored. This script restores it automatically on Ctrl+C, but if the
// process dies any other way, run:  npm run set-webhook
console.warn('⚠️  Local polling will disable the production webhook while this runs.');

bot.launch().then(() => {
  console.log('Bot polling locally. Message it on Telegram (e.g. /brief). Ctrl+C to stop.');
});

async function shutdown(signal) {
  bot.stop(signal);
  const url = process.env.PUBLIC_URL;
  if (!url) {
    console.error('PUBLIC_URL not set — webhook NOT restored. Run: npm run set-webhook');
    return;
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const endpoint = `${url.replace(/\/$/, '')}/api/telegram`;
  await bot.telegram.setWebhook(endpoint, secret ? { secret_token: secret } : undefined);
  console.log('Production webhook restored:', endpoint);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

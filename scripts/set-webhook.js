import 'dotenv/config';
import { Telegraf } from 'telegraf';

const url = process.argv[2] || process.env.PUBLIC_URL;
if (!url) {
  console.error('Usage: node scripts/set-webhook.js https://your-app.vercel.app');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const endpoint = `${url.replace(/\/$/, '')}/api/telegram`;
await bot.telegram.setWebhook(endpoint);
const info = await bot.telegram.getWebhookInfo();
console.log('Webhook set to:', endpoint);
console.log(info);

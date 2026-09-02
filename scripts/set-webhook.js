import 'dotenv/config';
import { Telegraf } from 'telegraf';

const url = process.argv[2] || process.env.PUBLIC_URL;
if (!url) {
  console.error('Usage: node scripts/set-webhook.js https://your-app.vercel.app');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const endpoint = `${url.replace(/\/$/, '')}/api/telegram`;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  console.warn('TELEGRAM_WEBHOOK_SECRET not set — webhook will accept unauthenticated POSTs.');
}
await bot.telegram.setWebhook(endpoint, secret ? { secret_token: secret } : undefined);

// "/" autocomplete menu in Telegram. Order = display order.
await bot.telegram.setMyCommands([
  { command: 'brief', description: "Today's content brief" },
  { command: 'status', description: 'Details for one card: /status <name>' },
  { command: 'checkin', description: 'Check in (optional HH:MM)' },
  { command: 'checkout', description: 'Check out (optional HH:MM)' },
  { command: 'leave', description: '/leave half|full [YYYY-MM-DD]' },
  { command: 'levintask', description: "Add a task to Levin's list" },
  { command: 'levwork', description: "Levin's list / mark done (Ajay)" },
  { command: 'whoami', description: 'Show your Telegram id + roster match' },
  { command: 'chatid', description: 'Show this chat id' },
]);

const info = await bot.telegram.getWebhookInfo();
console.log('Webhook set to:', endpoint, secret ? '(with secret token)' : '(NO secret token)');
console.log('Command menu registered.');
console.log(info);

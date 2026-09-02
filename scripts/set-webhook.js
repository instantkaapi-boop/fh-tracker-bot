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
await bot.telegram.setWebhook(endpoint, {
  ...(secret ? { secret_token: secret } : {}),
  allowed_updates: ['message', 'callback_query'],
});

// "/" autocomplete menu in Telegram. Order = display order.
await bot.telegram.setMyCommands([
  { command: 'brief', description: "Today's full content brief" },
  { command: 'mine', description: 'Just your own numbered list' },
  { command: 'done', description: 'Finish task: /done <number>' },
  { command: 'begin', description: 'Start task: /begin <number>' },
  { command: 'status', description: 'One card: /status <name>' },
  { command: 'newwork', description: 'New card, step by step' },
  { command: 'add', description: 'One-line: /add <title> | f|j|jf | YYYY-MM-DD' },
  { command: 'checkin', description: 'Check in (optional HH:MM)' },
  { command: 'checkout', description: 'Check out (optional HH:MM)' },
  { command: 'wfh', description: 'Check in as working from home' },
  { command: 'shoot', description: 'Check in as on a shoot' },
  { command: 'late', description: 'Running late: /late <reason>' },
  { command: 'leave', description: '/leave half|full|cancel [date]' },
  { command: 'leaves', description: 'Your leave this month' },
  { command: 'levintask', description: "Add a task to Levin's list" },
  { command: 'levwork', description: "Levin's list / mark done (Ajay)" },
  { command: 'whoami', description: 'Your Telegram id + roster match' },
  { command: 'chatid', description: 'Show this chat id' },
]);

const info = await bot.telegram.getWebhookInfo();
console.log('Webhook set to:', endpoint, secret ? '(with secret token)' : '(NO secret token)');
console.log('Command menu registered.');
console.log(info);

import 'dotenv/config';
import { bot } from '../lib/bot.js';

bot.launch().then(() => {
  console.log('Bot polling locally. Message it on Telegram (e.g. /brief). Ctrl+C to stop.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

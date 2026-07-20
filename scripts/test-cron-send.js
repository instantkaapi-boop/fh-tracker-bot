import 'dotenv/config';
import { bot } from '../lib/bot.js';
import { fetchOpenRows } from '../lib/notion.js';
import { formatBrief } from '../lib/format.js';

const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
if (!chatId) throw new Error('TELEGRAM_GROUP_CHAT_ID not set in .env');

const rows = await fetchOpenRows();
const text = formatBrief(rows);
await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
console.log(`Sent to ${chatId}:\n${text}`);

import { Telegraf } from 'telegraf';
import { fetchOpenRows, searchByTitle } from './notion.js';
import { formatBrief, formatCard } from './format.js';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function sendBrief(ctx) {
  try {
    const rows = await fetchOpenRows();
    await ctx.reply(formatBrief(rows), { parse_mode: 'HTML' });
  } catch (err) {
    console.error('brief error:', err);
    await ctx.reply('Could not fetch the brief from Notion. Check server logs.');
  }
}

bot.command(['brief', 'list'], sendBrief);

bot.command('status', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!query) {
    await ctx.reply('Usage: /status <content name>');
    return;
  }
  try {
    const matches = await searchByTitle(query);
    if (matches.length === 0) {
      await ctx.reply(`No card found matching "${query}".`);
      return;
    }
    if (matches.length > 1) {
      const list = matches.map((r) => `• ${r.content}`).join('\n');
      await ctx.reply(`Multiple matches, narrow your search:\n${list}`);
      return;
    }
    await ctx.reply(formatCard(matches[0]));
  } catch (err) {
    console.error('status error:', err);
    await ctx.reply('Could not fetch that card from Notion. Check server logs.');
  }
});

// Helper to grab a chat's id — needed once to set TELEGRAM_GROUP_CHAT_ID.
bot.command('chatid', async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

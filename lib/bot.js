import { Telegraf } from 'telegraf';
import { fetchOpenRows, searchByTitle } from './notion.js';
import { formatBrief, formatCard } from './format.js';
import { checkIn, checkOut } from './checkin.js';
import { resolvePerson } from './roster.js';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function timeOnly(iso) {
  return iso ? iso.slice(11, 16) : '—';
}

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

bot.command('checkin', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply("Your Telegram name doesn't match the roster (Fazil / Jishnu / Levin).");
    return;
  }
  try {
    const result = await checkIn(person);
    if (result.status === 'already') {
      await ctx.reply(`${person}, you already checked in today at ${timeOnly(result.time)}.`);
      return;
    }
    await ctx.reply(`✅ ${person} checked in at ${timeOnly(result.time)}.`);
  } catch (err) {
    console.error('checkin error:', err);
    await ctx.reply('Could not record check-in. Check server logs.');
  }
});

bot.command('checkout', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply("Your Telegram name doesn't match the roster (Fazil / Jishnu / Levin).");
    return;
  }
  try {
    const result = await checkOut(person);
    if (result.status === 'no-checkin') {
      await ctx.reply(`${person}, you haven't checked in today yet. Use /checkin first.`);
      return;
    }
    if (result.status === 'already') {
      await ctx.reply(`${person}, you already checked out today at ${timeOnly(result.time)}.`);
      return;
    }
    await ctx.reply(`👋 ${person} checked out at ${timeOnly(result.time)}.`);
  } catch (err) {
    console.error('checkout error:', err);
    await ctx.reply('Could not record check-out. Check server logs.');
  }
});

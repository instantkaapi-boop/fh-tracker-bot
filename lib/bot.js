import { Telegraf } from 'telegraf';
import { fetchOpenRows, searchByTitle } from './notion.js';
import { fetchOpenBrandTasks, addBrandTask, completeBrandTask } from './brand.js';
import { formatBrief, formatCard } from './format.js';
import { checkIn, checkOut } from './checkin.js';
import { logLeave } from './leave.js';
import { resolvePerson } from './roster.js';
import { todayIST } from './logic.js';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

function timeOnly(iso) {
  return iso ? iso.slice(11, 16) : '—';
}

// Optional "/checkin 10:42" style time override, 24h HH:MM.
function parseTimeArg(text) {
  const arg = text.split(' ')[1];
  if (!arg) return { ok: true, time: undefined };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(arg);
  if (!m) return { ok: false };
  return { ok: true, time: `${m[1].padStart(2, '0')}:${m[2]}` };
}

// "/leave half" or "/leave full 2026-07-25", date optional (defaults to today).
function parseLeaveArgs(text) {
  const [, typeArg, dateArg] = text.split(' ');
  const type = { half: 'half', full: 'full' }[typeArg?.toLowerCase()];
  if (!type) return { ok: false };
  if (!dateArg) return { ok: true, type, date: todayIST() };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) return { ok: false };
  return { ok: true, type, date: dateArg };
}

async function sendBrief(ctx) {
  try {
    const [rows, brandTasks] = await Promise.all([fetchOpenRows(), fetchOpenBrandTasks()]);
    await ctx.reply(formatBrief(rows, { brandTasks }), { parse_mode: 'HTML' });
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

// "/levintask Design March thumbnails" — drops a task into Levin's Brand
// Manager Kanban, which the daily brief's Levin section reads from.
bot.command(['levintask', 'levtask'], async (ctx) => {
  // No roster gate — anyone in the group can queue a task for Levin. The task
  // row carries no author, so resolvePerson is only used to label the reply.
  const person = resolvePerson(ctx);
  const who = person ?? (ctx.from?.first_name ?? 'someone');
  const task = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!task) {
    await ctx.reply('Usage: /levintask <task description>');
    return;
  }
  try {
    await addBrandTask(task);
    await ctx.reply(`📝 Added to Levin's list (by ${who}): ${task}\nShows in tomorrow's brief.`);
  } catch (err) {
    console.error('levintask error:', err);
    await ctx.reply('Could not add the task to Notion. Check server logs.');
  }
});

// "/levwork" → show Levin's numbered open list.
// "/levwork 2 done" → tick task #2 off (numbers match the daily brief).
// Ajay only.
bot.command('levwork', async (ctx) => {
  if (resolvePerson(ctx) !== 'Ajay') {
    await ctx.reply("Only Ajay can update Levin's task list.");
    return;
  }
  const args = ctx.message.text.split(' ').slice(1).filter(Boolean);
  if (args.length === 0) {
    try {
      const open = await fetchOpenBrandTasks();
      if (open.length === 0) {
        await ctx.reply("Levin's list is empty.");
        return;
      }
      const list = open.map((t, i) => `${i + 1}. ${t.content} — ${t.status.toLowerCase()}`).join('\n');
      await ctx.reply(`Levin's tasks:\n${list}\n\nMark one done: /levwork <number> done`);
    } catch (err) {
      console.error('levwork list error:', err);
      await ctx.reply('Could not fetch the list. Check server logs.');
    }
    return;
  }
  const n = Number.parseInt(args[0], 10);
  const action = (args[1] ?? 'done').toLowerCase();
  if (!Number.isInteger(n) || n < 1 || !['done', 'complete', 'completed'].includes(action)) {
    await ctx.reply('Usage: /levwork <number> done  (numbers match the daily brief)');
    return;
  }
  try {
    const task = await completeBrandTask(n);
    if (!task) {
      await ctx.reply(`No task #${n} on Levin's list. Send /levwork to see it.`);
      return;
    }
    await ctx.reply(`✅ Marked done: ${task.content}`);
  } catch (err) {
    console.error('levwork error:', err);
    await ctx.reply('Could not update the task in Notion. Check server logs.');
  }
});

// Helper to grab a chat's id — needed once to set TELEGRAM_GROUP_CHAT_ID.
bot.command('chatid', async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}`);
});

// Helper to grab a user's Telegram id + how the bot resolves them — used to
// populate ID_MAP in lib/roster.js for people whose name/username don't match.
bot.command('whoami', async (ctx) => {
  const { id, username, first_name } = ctx.from ?? {};
  const resolved = resolvePerson(ctx) ?? 'not resolved';
  await ctx.reply(
    `User ID: ${id}\nusername: ${username ? '@' + username : '—'}\nfirst_name: ${first_name ?? '—'}\nresolves to: ${resolved}`,
  );
});

bot.command('checkin', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply("Your Telegram name doesn't match the roster (Fazil / Jishnu / Levin / Ajay).");
    return;
  }
  const parsed = parseTimeArg(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /checkin or /checkin HH:MM (24h, e.g. /checkin 10:42)');
    return;
  }
  try {
    const result = await checkIn(person, parsed.time);
    if (result.status === 'already') {
      await ctx.reply(`${person}, you already checked in today at ${timeOnly(result.time)}.`);
      return;
    }
    await ctx.reply(`✅ ${person} checked in at ${timeOnly(result.time)}.\nThanks, have a great day at work!`);
  } catch (err) {
    console.error('checkin error:', err);
    await ctx.reply('Could not record check-in. Check server logs.');
  }
});

bot.command('checkout', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply("Your Telegram name doesn't match the roster (Fazil / Jishnu / Levin / Ajay).");
    return;
  }
  const parsed = parseTimeArg(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /checkout or /checkout HH:MM (24h, e.g. /checkout 18:30)');
    return;
  }
  try {
    const result = await checkOut(person, parsed.time);
    if (result.status === 'no-checkin') {
      await ctx.reply(`${person}, you haven't checked in today yet. Use /checkin first.`);
      return;
    }
    if (result.status === 'already') {
      await ctx.reply(`${person}, you already checked out today at ${timeOnly(result.time)}.`);
      return;
    }
    await ctx.reply(`👋 ${person} checked out at ${timeOnly(result.time)}.\nThanks for today, see you tomorrow!`);
  } catch (err) {
    console.error('checkout error:', err);
    await ctx.reply('Could not record check-out. Check server logs.');
  }
});

bot.command('leave', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply("Your Telegram name doesn't match the roster (Fazil / Jishnu / Levin / Ajay).");
    return;
  }
  const parsed = parseLeaveArgs(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /leave half or /leave full, optionally with a date: /leave half 2026-07-25');
    return;
  }
  try {
    const { type, date } = await logLeave(person, parsed.type, parsed.date);
    await ctx.reply(`📌 ${person} — ${type} leave logged for ${date}.`);
  } catch (err) {
    console.error('leave error:', err);
    await ctx.reply('Could not record leave. Check server logs.');
  }
});

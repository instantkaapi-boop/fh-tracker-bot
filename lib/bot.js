import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { fetchOpenRows, searchByTitle, updateRow, createRow } from './notion.js';
import { fetchOpenBrandTasks, addBrandTask, completeBrandTask } from './brand.js';
import { formatBrief, formatCard, formatMine, formatDate } from './format.js';
import { checkIn, checkOut, markLate } from './checkin.js';
import { logLeave, cancelLeave, myLeaves } from './leave.js';
import { resolvePerson, ROSTER, ADMIN_PERSON } from './roster.js';
import { todayIST, classifyRows, rowsFor, completionUpdate, startUpdate } from './logic.js';
import { chunkMessage } from './chunk.js';
import { transcribe, transcriptionEnabled } from './transcribe.js';
import { NAME_PROMPT, DATE_PROMPT_PREFIX, keyboardFor, cardText, startDraft, applyChoice, applyTypedDate, questionFor, datePrompt, refFromPrompt, shortId } from './newwork.js';

export const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const ROSTER_HINT = `Your Telegram name doesn't match the roster (${ROSTER.join(' / ')}). Send /whoami and share the reply with Ajay.`;

function timeOnly(iso) {
  return iso ? iso.slice(11, 16) : '—';
}

function args(ctx) {
  return (ctx.message?.text ?? '').split(' ').slice(1).join(' ').trim();
}

async function replyHtml(ctx, text, extra = {}) {
  for (const chunk of chunkMessage(text)) {
    await ctx.reply(chunk, { parse_mode: 'HTML', ...extra });
  }
}

// Optional "/checkin 10:42" style time override, 24h HH:MM.
function parseTimeArg(text) {
  const arg = text.split(' ')[1];
  if (!arg) return { ok: true, time: undefined };
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(arg);
  if (!m) return { ok: false };
  return { ok: true, time: `${m[1].padStart(2, '0')}:${m[2]}` };
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// "/leave half", "/leave full 2026-07-25", "/leave cancel [date]".
function parseLeaveArgs(text) {
  const [, typeArg, dateArg] = text.split(' ');
  const type = { half: 'half', full: 'full', cancel: 'cancel' }[typeArg?.toLowerCase()];
  if (!type) return { ok: false };
  if (!dateArg) return { ok: true, type, date: todayIST() };
  if (!isValidDate(dateArg)) return { ok: false };
  return { ok: true, type, date: dateArg };
}

const EDIT_TYPE_ALIASES = {
  f: 'Fazil Only', fazil: 'Fazil Only',
  j: 'Jishnu Only', jishnu: 'Jishnu Only',
  jf: 'Jishnu + Fazil', 'j+f': 'Jishnu + Fazil', both: 'Jishnu + Fazil',
};
const VIDEO_TYPE_ALIASES = {
  filler: 'Non Paid Filler',
  paid: 'Paid immedieate',
  wait: 'Paid (Can wait)', paidwait: 'Paid (Can wait)',
};

// "/add Title | jf | 2026-09-10 | paid" — only the title is required.
function parseAddArgs(text) {
  const [title, typeArg, dateArg, videoArg] = text.split('|').map((s) => s.trim());
  if (!title) return { ok: false, reason: 'missing title' };
  let editType = null;
  if (typeArg && typeArg !== '-' && typeArg.toLowerCase() !== 'none') {
    editType = EDIT_TYPE_ALIASES[typeArg.toLowerCase()];
    if (!editType) return { ok: false, reason: `unknown type "${typeArg}" (use f, j, jf or none)` };
  }
  let expectedDate = null;
  if (dateArg && dateArg !== '-') {
    if (!isValidDate(dateArg)) return { ok: false, reason: `bad date "${dateArg}" (use YYYY-MM-DD)` };
    expectedDate = dateArg;
  }
  let videoType = null;
  if (videoArg && videoArg !== '-') {
    videoType = VIDEO_TYPE_ALIASES[videoArg.toLowerCase()];
    if (!videoType) return { ok: false, reason: `unknown video type "${videoArg}" (use filler, paid or wait)` };
  }
  return { ok: true, content: title, editType, expectedDate, videoType };
}

async function sendBrief(ctx) {
  try {
    const [rows, brandTasks] = await Promise.all([fetchOpenRows(), fetchOpenBrandTasks()]);
    await replyHtml(ctx, formatBrief(rows, { brandTasks }));
  } catch (err) {
    console.error('brief error:', err);
    await ctx.reply('Could not fetch the brief from Notion. Check server logs.');
  }
}

bot.command(['brief', 'list'], sendBrief);

bot.command('status', async (ctx) => {
  const query = args(ctx);
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

// "/mine" — just your own numbered list.
bot.command(['mine', 'my'], async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  try {
    const [rows, brandTasks] = await Promise.all([fetchOpenRows(), person === 'Levin' ? fetchOpenBrandTasks() : []]);
    await replyHtml(ctx, formatMine(person, rows, brandTasks));
  } catch (err) {
    console.error('mine error:', err);
    await ctx.reply('Could not fetch your list from Notion. Check server logs.');
  }
});

// Resolve "/done 2" / "/begin 2" against the same ordering /mine shows.
async function nthOfMine(person, n) {
  const rows = await fetchOpenRows();
  const mine = rowsFor(person, classifyRows(rows));
  return mine[n - 1] ?? null;
}

function parseIndex(ctx) {
  const n = Number.parseInt(args(ctx).split(' ')[0], 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

// "/done <n>" — stamps the right end-date(s) for the row's Edit Type and phase.
bot.command('done', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const n = parseIndex(ctx);
  if (!n) {
    await ctx.reply('Usage: /done <number>  (numbers from /mine)');
    return;
  }
  try {
    if (person === 'Levin') {
      const task = await completeBrandTask(n);
      await ctx.reply(task ? `✅ Marked done: ${task.content}` : `No task #${n} on your list. Send /mine.`);
      return;
    }
    if (person === 'Ajay') {
      await ctx.reply('Your list is review-only — mark Approved / Posted in Notion, or use /levwork for Levin.');
      return;
    }
    const row = await nthOfMine(person, n);
    if (!row) {
      await ctx.reply(`No task #${n} on your list. Send /mine.`);
      return;
    }
    const update = completionUpdate(row);
    if (!update) {
      await ctx.reply(`"${row.content}" can't be completed from here — check the card in Notion.`);
      return;
    }
    await updateRow(row.id, update.properties);
    if (update.outcome === 'handover') {
      await ctx.reply(`🎧 ${row.content} — handed over to Fazil for sound. Fazil, it's on your /mine now.`);
    } else {
      await ctx.reply(`✅ ${row.content} — done and moved to Ready to Post.`);
    }
  } catch (err) {
    console.error('done error:', err);
    await ctx.reply('Could not update the card in Notion. Check server logs.');
  }
});

// "/begin <n>" — stamps the start date for the current phase.
bot.command(['begin', 'starting'], async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  if (person !== 'Fazil' && person !== 'Jishnu') {
    await ctx.reply('/begin is for editing tasks (Fazil / Jishnu).');
    return;
  }
  const n = parseIndex(ctx);
  if (!n) {
    await ctx.reply('Usage: /begin <number>  (numbers from /mine)');
    return;
  }
  try {
    const row = await nthOfMine(person, n);
    if (!row) {
      await ctx.reply(`No task #${n} on your list. Send /mine.`);
      return;
    }
    const update = startUpdate(row);
    if (!update) {
      await ctx.reply(`"${row.content}" already has a start date for this phase.`);
      return;
    }
    await updateRow(row.id, update.properties);
    await ctx.reply(`▶️ ${row.content} — started today. /done ${n} when finished.`);
  } catch (err) {
    console.error('begin error:', err);
    await ctx.reply('Could not update the card in Notion. Check server logs.');
  }
});

// "/add Title | jf | 2026-09-10 | paid" — new tracker row without opening Notion.
bot.command('add', async (ctx) => {
  const text = args(ctx);
  if (!text) {
    await ctx.reply('Usage: /add <title> | <f|j|jf|none> | <YYYY-MM-DD> | <filler|paid|wait>\nOnly the title is required, e.g. /add Diwali reel | jf | 2026-10-15');
    return;
  }
  const parsed = parseAddArgs(text);
  if (!parsed.ok) {
    await ctx.reply(`Couldn't add: ${parsed.reason}.\nUsage: /add <title> | <f|j|jf|none> | <YYYY-MM-DD> | <filler|paid|wait>`);
    return;
  }
  try {
    const row = await createRow(parsed);
    const who = resolvePerson(ctx) ?? ctx.from?.first_name ?? 'someone';
    const bits = [row.editType ?? 'needs assignment', row.expectedDate ? `due ${formatDate(row.expectedDate)}` : 'no due date'];
    await ctx.reply(`➕ Added by ${who}: ${row.content} (${bits.join(', ')})\n${row.url}`);
  } catch (err) {
    console.error('add error:', err);
    await ctx.reply('Could not create the card in Notion. Check server logs.');
  }
});

// "/levintask Design March thumbnails" — drops a task into Levin's Brand
// Manager Kanban, which the daily brief's Levin section reads from.
bot.command(['levintask', 'levtask'], async (ctx) => {
  // No roster gate — anyone in the group can queue a task for Levin. The task
  // row carries no author, so resolvePerson is only used to label the reply.
  const person = resolvePerson(ctx);
  const who = person ?? (ctx.from?.first_name ?? 'someone');
  const task = args(ctx);
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
  const parts = args(ctx).split(' ').filter(Boolean);
  if (parts.length === 0) {
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
  const n = Number.parseInt(parts[0], 10);
  const action = (parts[1] ?? 'done').toLowerCase();
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

// Private-chat /start — Telegram requires this before the bot can DM someone.
bot.start(async (ctx) => {
  const person = resolvePerson(ctx);
  if (ctx.chat.type === 'private') {
    await ctx.reply(person
      ? `Hi ${person} 👋 You'll now get personal reminders here. Send /mine any time for your list.`
      : `Hi 👋 ${ROSTER_HINT}`);
  }
});

async function doCheckIn(ctx, person, time, note) {
  const result = await checkIn(person, time, note);
  if (result.status === 'already') {
    return `${person}, you already checked in today at ${timeOnly(result.time)}.`;
  }
  return `✅ ${person} checked in at ${timeOnly(result.time)}.${note ? ` (${note})` : ''}\nThanks, have a great day at work!`;
}

async function doCheckOut(ctx, person, time) {
  const result = await checkOut(person, time);
  if (result.status === 'no-checkin') {
    return `${person}, you haven't checked in today yet. Use /checkin first.`;
  }
  if (result.status === 'already') {
    return `${person}, you already checked out today at ${timeOnly(result.time)}.`;
  }
  const prompt = person === 'Levin' ? '\n\n📝 What did you work on today? Reply here with a quick update.' : '';
  return `👋 ${person} checked out at ${timeOnly(result.time)}.\nThanks for today, see you tomorrow!${prompt}`;
}

bot.command('checkin', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const parsed = parseTimeArg(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /checkin or /checkin HH:MM (24h, e.g. /checkin 10:42)');
    return;
  }
  try {
    await ctx.reply(await doCheckIn(ctx, person, parsed.time));
  } catch (err) {
    console.error('checkin error:', err);
    await ctx.reply('Could not record check-in. Check server logs.');
  }
});

bot.command('checkout', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const parsed = parseTimeArg(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /checkout or /checkout HH:MM (24h, e.g. /checkout 18:30)');
    return;
  }
  try {
    await ctx.reply(await doCheckOut(ctx, person, parsed.time));
  } catch (err) {
    console.error('checkout error:', err);
    await ctx.reply('Could not record check-out. Check server logs.');
  }
});

// "/wfh [note]" — checks you in now, tagged WFH.
bot.command('wfh', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const extra = args(ctx);
  try {
    await ctx.reply(await doCheckIn(ctx, person, undefined, extra ? `WFH: ${extra}` : 'WFH'));
  } catch (err) {
    console.error('wfh error:', err);
    await ctx.reply('Could not record WFH check-in. Check server logs.');
  }
});

// "/shoot [note]" — checks you in now, tagged Shoot (outdoor / on-location day).
bot.command('shoot', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const extra = args(ctx);
  try {
    await ctx.reply(await doCheckIn(ctx, person, undefined, extra ? `Shoot: ${extra}` : 'Shoot'));
  } catch (err) {
    console.error('shoot error:', err);
    await ctx.reply('Could not record shoot check-in. Check server logs.');
  }
});

// "/late [reason]" — heads-up before arriving; reminders show the reason.
bot.command('late', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  try {
    const { note } = await markLate(person, args(ctx));
    await ctx.reply(`⏱ Noted, ${person} — "${note}". Remember to /checkin when you arrive.`);
  } catch (err) {
    console.error('late error:', err);
    await ctx.reply('Could not record that. Check server logs.');
  }
});

bot.command('leave', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  const parsed = parseLeaveArgs(ctx.message.text);
  if (!parsed.ok) {
    await ctx.reply('Usage: /leave half | /leave full | /leave cancel — optionally with a date: /leave half 2026-07-25');
    return;
  }
  try {
    if (parsed.type === 'cancel') {
      const r = await cancelLeave(person, parsed.date);
      await ctx.reply(r.status === 'none' ? `No leave logged for ${person} on ${r.date}.` : `🗑 ${person} — ${r.type} leave on ${r.date} cancelled.`);
      return;
    }
    const r = await logLeave(person, parsed.type, parsed.date);
    if (r.status === 'already') {
      await ctx.reply(`${person}, ${r.type.toLowerCase()} leave is already logged for ${r.date}.`);
    } else if (r.status === 'updated') {
      await ctx.reply(`📌 ${person} — ${r.date} changed from ${r.previous.toLowerCase()} to ${r.type.toLowerCase()} leave.`);
    } else {
      await ctx.reply(`📌 ${person} — ${r.type} leave logged for ${r.date}.`);
    }
  } catch (err) {
    console.error('leave error:', err);
    await ctx.reply('Could not record leave. Check server logs.');
  }
});

// "/leaves" — your own leave this month.
bot.command('leaves', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.reply(ROSTER_HINT);
    return;
  }
  try {
    const { monthStr, entries, total } = await myLeaves(person);
    if (entries.length === 0) {
      await ctx.reply(`${person}: no leave logged in ${monthStr}.`);
      return;
    }
    const list = entries.map((e) => `• ${formatDate(e.date)} — ${e.type}`).join('\n');
    await ctx.reply(`${person} — leave in ${monthStr}:\n${list}\n\nTotal: ${total} day${total === 1 ? '' : 's'}`);
  } catch (err) {
    console.error('leaves error:', err);
    await ctx.reply('Could not fetch your leave. Check server logs.');
  }
});

// Admin shortcut: Ajay can type "fulldayleaveJishnu" / "half day leave Levin"
// (with or without spaces/dashes, optionally + a YYYY-MM-DD date) as a plain
// group message to log someone else's leave without them running /leave.
const ADMIN_LEAVE_RE = /^\s*(full|half)\s*[- ]?\s*day\s*[- ]?\s*leave\s*[- ]?\s*([a-z]+)(?:\s+(\d{4}-\d{2}-\d{2}))?\s*$/i;

bot.hears(ADMIN_LEAVE_RE, async (ctx) => {
  if (resolvePerson(ctx) !== ADMIN_PERSON) {
    await ctx.reply(`Only ${ADMIN_PERSON} can log leave for someone else.`);
    return;
  }
  const [, typeWord, nameWord, dateArg] = ctx.match;
  const type = typeWord.toLowerCase() === 'full' ? 'full' : 'half';
  const target = ROSTER.find((p) => p.toLowerCase() === nameWord.toLowerCase());
  if (!target) {
    await ctx.reply(`Don't recognize "${nameWord}" — roster is ${ROSTER.join(', ')}.`);
    return;
  }
  if (dateArg && !isValidDate(dateArg)) {
    await ctx.reply("That date doesn't look right — use YYYY-MM-DD.");
    return;
  }
  const date = dateArg ?? todayIST();
  const label = dateArg ? formatDate(date) : 'today';
  try {
    const r = await logLeave(target, type, date);
    const text = r.status === 'already'
      ? `${target}, ${r.type.toLowerCase()} leave is already logged for ${label}.`
      : r.status === 'updated'
        ? `📌 ${target} — ${label} changed from ${r.previous.toLowerCase()} to ${r.type.toLowerCase()} leave.`
        : `📌 ${target} — ${r.type} leave logged for ${label}.`;
    await ctx.reply(text);
  } catch (err) {
    console.error('admin leave shortcut error:', err);
    await ctx.reply('Could not record leave. Check server logs.');
  }
});

// ---- Inline buttons -------------------------------------------------------

bot.action('checkin', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.answerCbQuery("Your Telegram name isn't on the roster.", { show_alert: true });
    return;
  }
  try {
    const text = await doCheckIn(ctx, person);
    await ctx.answerCbQuery(text.split('\n')[0]);
    await ctx.reply(text);
  } catch (err) {
    console.error('checkin action error:', err);
    await ctx.answerCbQuery('Could not record check-in.', { show_alert: true });
  }
});

bot.action('checkout', async (ctx) => {
  const person = resolvePerson(ctx);
  if (!person) {
    await ctx.answerCbQuery("Your Telegram name isn't on the roster.", { show_alert: true });
    return;
  }
  try {
    const text = await doCheckOut(ctx, person);
    await ctx.answerCbQuery(text.split('\n')[0]);
    await ctx.reply(text);
  } catch (err) {
    console.error('checkout action error:', err);
    await ctx.answerCbQuery('Could not record check-out.', { show_alert: true });
  }
});

// WFH / Shoot buttons = check in now with a note; leave buttons = log today.
for (const [action, note] of [['wfh', 'WFH'], ['shoot', 'Shoot']]) {
  bot.action(action, async (ctx) => {
    const person = resolvePerson(ctx);
    if (!person) {
      await ctx.answerCbQuery("Your Telegram name isn't on the roster.", { show_alert: true });
      return;
    }
    try {
      const text = await doCheckIn(ctx, person, undefined, note);
      await ctx.answerCbQuery(text.split('\n')[0]);
      await ctx.reply(text);
    } catch (err) {
      console.error(`${action} action error:`, err);
      await ctx.answerCbQuery('Could not record that.', { show_alert: true });
    }
  });
}

for (const [action, type] of [['leave_full', 'full'], ['leave_half', 'half']]) {
  bot.action(action, async (ctx) => {
    const person = resolvePerson(ctx);
    if (!person) {
      await ctx.answerCbQuery("Your Telegram name isn't on the roster.", { show_alert: true });
      return;
    }
    try {
      const r = await logLeave(person, type, todayIST());
      const text = r.status === 'already'
        ? `${person}, ${r.type.toLowerCase()} leave is already logged for today.`
        : r.status === 'updated'
          ? `📌 ${person} — today changed from ${r.previous.toLowerCase()} to ${r.type.toLowerCase()} leave.`
          : `📌 ${person} — ${r.type} leave logged for today.`;
      await ctx.answerCbQuery(text);
      await ctx.reply(text);
    } catch (err) {
      console.error(`${action} action error:`, err);
      await ctx.answerCbQuery('Could not record leave.', { show_alert: true });
    }
  });
}

// Weekly plan "Got it" — appends the presser's name to the post so everyone
// can see who has confirmed. Stateless: the message itself is the record.
bot.action('plan_ack', async (ctx) => {
  const person = resolvePerson(ctx) ?? ctx.from?.first_name ?? 'someone';
  const msg = ctx.callbackQuery.message;
  const text = msg?.text ?? '';
  if (text.includes(`✅ ${person}`)) {
    await ctx.answerCbQuery('Already confirmed 👍');
    return;
  }
  const marker = '\n\nConfirmed:';
  const newText = text.includes(marker) ? `${text} ✅ ${person}` : `${text}${marker} ✅ ${person}`;
  try {
    await ctx.editMessageText(newText, { entities: msg.entities, reply_markup: msg.reply_markup });
    await ctx.answerCbQuery('Thanks 👍');
  } catch (err) {
    console.error('plan_ack error:', err);
    await ctx.answerCbQuery('Noted 👍');
  }
});

// ---- Voice notes ----------------------------------------------------------

const VOICE_PREFIX = '🎙 Transcript:\n';

bot.on(message('voice'), async (ctx) => {
  if (!transcriptionEnabled()) {
    if (ctx.chat.type === 'private') await ctx.reply('Voice notes need OPENAI_API_KEY configured on the server.');
    return;
  }
  try {
    const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const text = await transcribe(link.href);
    if (!text) {
      await ctx.reply("Couldn't make out any words in that voice note.");
      return;
    }
    await ctx.reply(`${VOICE_PREFIX}${text}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: "📝 Levin's list", callback_data: 'voice_levin' },
          { text: '➕ Tracker', callback_data: 'voice_add' },
          { text: '🗑 Discard', callback_data: 'voice_discard' },
        ]],
      },
    });
  } catch (err) {
    console.error('voice error:', err);
    await ctx.reply('Could not transcribe that voice note. Check server logs.');
  }
});

function transcriptFrom(ctx) {
  const text = ctx.callbackQuery.message?.text ?? '';
  return text.startsWith(VOICE_PREFIX) ? text.slice(VOICE_PREFIX.length).trim() : null;
}

bot.action('voice_levin', async (ctx) => {
  const text = transcriptFrom(ctx);
  if (!text) return ctx.answerCbQuery('Transcript missing.');
  try {
    await addBrandTask(text);
    await ctx.editMessageText(`📝 Added to Levin's list: ${text}`);
    await ctx.answerCbQuery('Added');
  } catch (err) {
    console.error('voice_levin error:', err);
    await ctx.answerCbQuery('Could not add to Notion.', { show_alert: true });
  }
});

bot.action('voice_add', async (ctx) => {
  const text = transcriptFrom(ctx);
  if (!text) return ctx.answerCbQuery('Transcript missing.');
  try {
    const row = await createRow({ content: text.slice(0, 120) });
    await ctx.editMessageText(`➕ Added to tracker (needs Edit Type + date in Notion): ${row.content}\n${row.url}`);
    await ctx.answerCbQuery('Added');
  } catch (err) {
    console.error('voice_add error:', err);
    await ctx.answerCbQuery('Could not add to Notion.', { show_alert: true });
  }
});

bot.action('voice_discard', async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch {
    await ctx.editMessageText('🗑 Discarded.');
  }
  await ctx.answerCbQuery('Discarded');
});

// ---- /newwork wizard ------------------------------------------------------

bot.command(['newwork', 'new'], async (ctx) => {
  const inline = args(ctx);
  try {
    if (inline) {
      // "/newwork Diwali reel" skips the name question.
      const row = await startDraft(inline);
      await ctx.reply(cardText(row, questionFor('ps')), { parse_mode: 'HTML', reply_markup: keyboardFor('ps', shortId(row.id)) });
      return;
    }
    await ctx.reply(NAME_PROMPT, { reply_markup: { force_reply: true, selective: true } });
  } catch (err) {
    console.error('newwork error:', err);
    await ctx.reply('Could not start a new card. Check server logs.');
  }
});

bot.action(/^nw\|(\w+)\|(\w+)\|([0-9a-f]{32})$/, async (ctx) => {
  const [, step, choice, id] = ctx.match;
  try {
    const { row, nextStep } = await applyChoice(step, choice, id);
    if (nextStep === 'typed') {
      await ctx.editMessageText(cardText(row, 'Expected date — reply to the next message.'), { parse_mode: 'HTML' });
      await ctx.reply(datePrompt(row), { reply_markup: { force_reply: true, selective: true } });
    } else if (nextStep === 'done') {
      await ctx.editMessageText(cardText(row, null), { parse_mode: 'HTML' });
    } else {
      await ctx.editMessageText(cardText(row, questionFor(nextStep)), { parse_mode: 'HTML', reply_markup: keyboardFor(nextStep, id) });
    }
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('newwork step error:', err);
    await ctx.answerCbQuery('Could not save that. Try again.', { show_alert: true });
  }
});

// Replies to the wizard's force_reply prompts (name, typed date). Must be
// registered after every bot.command so commands still win.
bot.on(message('text'), async (ctx, next) => {
  const replyTo = ctx.message.reply_to_message;
  if (!replyTo?.from?.is_bot) return next();
  const prompt = replyTo.text ?? '';
  const text = ctx.message.text.trim();

  if (prompt === NAME_PROMPT) {
    if (!text) return ctx.reply('Name can\'t be empty. Send /newwork again.');
    try {
      const row = await startDraft(text.slice(0, 200));
      await ctx.reply(cardText(row, questionFor('ps')), { parse_mode: 'HTML', reply_markup: keyboardFor('ps', shortId(row.id)) });
    } catch (err) {
      console.error('newwork name error:', err);
      await ctx.reply('Could not create the card in Notion. Check server logs.');
    }
    return;
  }

  if (prompt.startsWith(DATE_PROMPT_PREFIX)) {
    const id = refFromPrompt(prompt);
    if (!id) return next();
    if (!isValidDate(text)) {
      await ctx.reply('That\'s not a date I understand. Reply to the prompt again with YYYY-MM-DD, e.g. 2026-09-15.');
      return;
    }
    try {
      const row = await applyTypedDate(id, text);
      await ctx.reply(cardText(row, null), { parse_mode: 'HTML' });
    } catch (err) {
      console.error('newwork date error:', err);
      await ctx.reply('Could not save the date. Check server logs.');
    }
    return;
  }

  return next();
});

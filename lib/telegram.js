import { bot } from './bot.js';
import { chatIdFor } from './roster.js';
import { chunkMessage } from './chunk.js';

export { chunkMessage };

export async function sendChunked(chatId, text, extra = {}) {
  const chunks = chunkMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    // Inline keyboards only go on the last chunk so they sit under the full message.
    const opts = i === chunks.length - 1 ? extra : { parse_mode: extra.parse_mode };
    await bot.telegram.sendMessage(chatId, chunks[i], opts);
  }
}

// Best-effort DM to a roster member. Returns false (never throws) when we
// don't have their id yet or they haven't pressed Start on the bot, so a
// single unreachable person can't fail a whole cron job.
export async function dmPerson(person, text, extra = {}) {
  const chatId = chatIdFor(person);
  if (!chatId) return false;
  try {
    await sendChunked(chatId, text, { parse_mode: 'HTML', ...extra });
    return true;
  } catch (err) {
    console.error(`dm to ${person} failed:`, err?.message ?? err);
    return false;
  }
}

export const CHECKIN_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Check in', callback_data: 'checkin' },
      { text: '👋 Check out', callback_data: 'checkout' },
    ]],
  },
};

export const PLAN_KEYBOARD = {
  reply_markup: { inline_keyboard: [[{ text: '👍 Got it', callback_data: 'plan_ack' }]] },
};

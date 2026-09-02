import { cronHandler } from '../lib/cron.js';
import { sendChunked, CHECKIN_KEYBOARD } from '../lib/telegram.js';
import { missingCheckins } from '../lib/checkin.js';

export const config = { maxDuration: 30 };

export default cronHandler('Check-in reminder (/api/checkin-reminder)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const missing = await missingCheckins();
  if (missing.length > 0) {
    const text = `⏰ <b>Check-in reminder</b>\nStill haven't checked in: ${missing.join(', ')}`;
    await sendChunked(process.env.TELEGRAM_GROUP_CHAT_ID, text, { parse_mode: 'HTML', ...CHECKIN_KEYBOARD });
  }
  return { missing };
});

import { cronHandler } from '../lib/cron.js';
import { sendChunked, CHECKIN_KEYBOARD } from '../lib/telegram.js';
import { missingCheckouts } from '../lib/checkin.js';

export const config = { maxDuration: 30 };

export default cronHandler('Check-out reminder (/api/checkout-reminder)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const { pendingCheckout, neverCheckedIn } = await missingCheckouts();
  const lines = ['⏰ <b>Check-out reminder</b>'];
  if (pendingCheckout.length > 0) lines.push(`Still haven't checked out: ${pendingCheckout.join(', ')}`);
  if (neverCheckedIn.length > 0) lines.push(`No check-in recorded today: ${neverCheckedIn.join(', ')}`);
  if (pendingCheckout.length > 0 || neverCheckedIn.length > 0) {
    await sendChunked(process.env.TELEGRAM_GROUP_CHAT_ID, lines.join('\n'), { parse_mode: 'HTML', ...CHECKIN_KEYBOARD });
  }
  return { pendingCheckout, neverCheckedIn };
});

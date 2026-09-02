import { cronHandler } from '../lib/cron.js';
import { sendChunked } from '../lib/telegram.js';
import { missingCheckins } from '../lib/checkin.js';

export const config = { maxDuration: 30 };

export default cronHandler('Check-in escalation (/api/checkin-escalation)', { skipSunday: true, requireEnv: ['ADMIN_CHAT_ID'] }, async () => {
  const missing = await missingCheckins();
  if (missing.length > 0) {
    await sendChunked(process.env.ADMIN_CHAT_ID, `🔴 <b>Still not checked in (past noon)</b>\n${missing.join(', ')}`, { parse_mode: 'HTML' });
  }
  return { missing };
});

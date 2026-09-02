import { cronHandler } from '../lib/cron.js';
import { sendChunked } from '../lib/telegram.js';
import { todayCheckinStatus } from '../lib/checkin.js';
import { formatCheckinStatus } from '../lib/format.js';

export const config = { maxDuration: 30 };

export default cronHandler('Check-in status (/api/checkin-status)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
  const status = await todayCheckinStatus();
  await sendChunked(process.env.TELEGRAM_GROUP_CHAT_ID, formatCheckinStatus(status), { parse_mode: 'HTML' });
  return { status };
});

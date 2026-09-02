import { cronHandler } from '../lib/cron.js';
import { sendChunked, CHECKIN_KEYBOARD } from '../lib/telegram.js';
import { missingCheckins, missingCheckouts, todayCheckinStatus } from '../lib/checkin.js';
import { formatCheckinStatus } from '../lib/format.js';

export const config = { maxDuration: 30 };

// One function, four jobs — Vercel Hobby caps deployments at 12 functions.
// vercel.json rewrites /api/attendance-<job> → /api/attendance?job=<job> so
// each cron keeps a distinct path.
const group = () => process.env.TELEGRAM_GROUP_CHAT_ID;

const JOBS = {
  reminder: cronHandler('Check-in reminder (/api/attendance-reminder)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
    const missing = await missingCheckins();
    if (missing.length > 0) {
      await sendChunked(group(), `⏰ <b>Check-in reminder</b>\nStill haven't checked in: ${missing.join(', ')}`, { parse_mode: 'HTML', ...CHECKIN_KEYBOARD });
    }
    return { missing };
  }),

  escalation: cronHandler('Check-in escalation (/api/attendance-escalation)', { skipSunday: true, requireEnv: ['ADMIN_CHAT_ID'] }, async () => {
    const missing = await missingCheckins();
    if (missing.length > 0) {
      await sendChunked(process.env.ADMIN_CHAT_ID, `🔴 <b>Still not checked in (past noon)</b>\n${missing.join(', ')}`, { parse_mode: 'HTML' });
    }
    return { missing };
  }),

  checkout: cronHandler('Check-out reminder (/api/attendance-checkout)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
    const { pendingCheckout, neverCheckedIn } = await missingCheckouts();
    const lines = ['⏰ <b>Check-out reminder</b>'];
    if (pendingCheckout.length > 0) lines.push(`Still haven't checked out: ${pendingCheckout.join(', ')}`);
    if (neverCheckedIn.length > 0) lines.push(`No check-in recorded today: ${neverCheckedIn.join(', ')}`);
    if (pendingCheckout.length > 0 || neverCheckedIn.length > 0) {
      await sendChunked(group(), lines.join('\n'), { parse_mode: 'HTML', ...CHECKIN_KEYBOARD });
    }
    return { pendingCheckout, neverCheckedIn };
  }),

  status: cronHandler('Check-in status (/api/attendance-status)', { skipSunday: true, requireEnv: ['TELEGRAM_GROUP_CHAT_ID'] }, async () => {
    const status = await todayCheckinStatus();
    await sendChunked(group(), formatCheckinStatus(status), { parse_mode: 'HTML' });
    return { status };
  }),
};

export default async function handler(req, res) {
  const job = JOBS[req.query?.job];
  if (!job) {
    res.status(404).json({ ok: false, error: `unknown job; use one of ${Object.keys(JOBS).join(', ')}` });
    return;
  }
  return job(req, res);
}

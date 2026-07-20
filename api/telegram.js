import { bot } from '../lib/bot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('FH Tracker Bot webhook is live.');
    return;
  }
  try {
    await bot.handleUpdate(req.body);
  } catch (err) {
    console.error('Webhook error:', err);
  }
  res.status(200).json({ ok: true });
}

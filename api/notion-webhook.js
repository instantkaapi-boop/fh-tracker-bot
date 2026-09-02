import { createHmac, timingSafeEqual } from 'node:crypto';
import { bot } from '../lib/bot.js';
import { fetchRow, markCelebrated, propertyNamesById } from '../lib/notion.js';
import { escapeHtml, formatHandover } from '../lib/format.js';
import { dmPerson } from '../lib/telegram.js';
import { alertAdmin } from '../lib/alert.js';

// Notion signs the raw body, so body parsing is off and we read the stream.
export const config = { api: { bodyParser: false }, maxDuration: 30 };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verify(raw, header) {
  const secret = process.env.NOTION_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  return expected.length === header.length && timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

// Setup: create a webhook subscription in Notion → integration settings →
// Webhooks, pointing at https://<app>/api/notion-webhook. Notion first POSTs
// {verification_token}; we DM it to the admin so they can paste it back into
// Notion, and it must ALSO be saved as NOTION_WEBHOOK_SECRET on Vercel, since
// every later event is HMAC-signed with it.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('Notion webhook endpoint is live.');
    return;
  }
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    res.status(400).json({ ok: false, error: 'bad json' });
    return;
  }

  if (body.verification_token) {
    console.log('Notion verification token received');
    if (process.env.ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `🔗 Notion webhook verification token:\n<code>${escapeHtml(body.verification_token)}</code>\n\nPaste it into Notion to verify, and save it on Vercel as NOTION_WEBHOOK_SECRET.`,
        { parse_mode: 'HTML' },
      );
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (!verify(raw, req.headers['x-notion-signature'])) {
    res.status(401).json({ ok: false, error: 'bad signature' });
    return;
  }

  // Always 200 quickly — Notion retries on non-2xx and we'd rather alert than loop.
  res.status(200).json({ ok: true });

  try {
    if (body.type !== 'page.properties_updated' || body.entity?.type !== 'page') return;
    const names = await propertyNamesById();
    const changed = (body.data?.updated_properties ?? []).map((id) => names[id] ?? id);
    const row = await fetchRow(body.entity.id);
    if (!row.content) return; // not a tracker row we understand

    if (changed.includes('Posted') && row.posted && !row.celebrated && process.env.TELEGRAM_GROUP_CHAT_ID) {
      await markCelebrated(row.id);
      await bot.telegram.sendMessage(process.env.TELEGRAM_GROUP_CHAT_ID, `🎉 <b>${escapeHtml(row.content)}</b> posted!`, { parse_mode: 'HTML' });
    }

    if (changed.includes('Editing End/ Handover') && row.editType === 'Jishnu + Fazil' && row.editingEndHandover && !row.fEditingStart && !row.fEditingDone) {
      const text = formatHandover(row);
      if (process.env.TELEGRAM_GROUP_CHAT_ID) await bot.telegram.sendMessage(process.env.TELEGRAM_GROUP_CHAT_ID, text, { parse_mode: 'HTML' });
      await dmPerson('Fazil', text);
    }
  } catch (err) {
    console.error('notion-webhook error:', err);
    await alertAdmin('Notion webhook (/api/notion-webhook)', err);
  }
}

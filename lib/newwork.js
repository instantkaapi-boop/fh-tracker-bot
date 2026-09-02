import { fetchRow, createRow, updateRow } from './notion.js';
import { escapeHtml, formatDate } from './format.js';
import { todayIST } from './logic.js';

// "/newwork" wizard. Vercel functions keep no memory between messages, so
// the draft Notion row is the state and every button carries the row id:
//   callback_data = "nw|<step>|<choice>|<32-hex page id>"   (≤ 64 bytes)
// Free-text steps (name, typed date) use Telegram's force_reply and read the
// row id back out of the prompt they replied to.

export const NAME_PROMPT = '🆕 New work — what is the content name?';
export const DATE_PROMPT_PREFIX = '📅 Expected date';

export const STEPS = {
  ps: { label: 'Pipeline status', property: 'Pipeline Status', options: ['Ideation', 'Scripting Done', 'Shoot Done', 'Editing', 'Editing done', 'Approved'], next: 'vt' },
  vt: { label: 'Video type', property: 'Video type', options: ['Non Paid Filler', 'Paid immedieate', 'Paid (Can wait)'], next: 'et' },
  et: { label: 'Edit type', property: 'Edit Type', options: ['Fazil Only', 'Jishnu Only', 'Jishnu + Fazil'], next: 'ed' },
};

const DATE_CHOICES = [
  ['Today', 0], ['Tomorrow', 1], ['+3 days', 3], ['+7 days', 7],
];

export function shortId(pageId) {
  return pageId.replaceAll('-', '');
}

function addDaysIST(n, today = todayIST()) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function grid(buttons, perRow = 2) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += perRow) rows.push(buttons.slice(i, i + perRow));
  return rows;
}

export function keyboardFor(step, id) {
  if (step === 'ed') {
    const buttons = DATE_CHOICES.map(([text, days]) => ({ text, callback_data: `nw|ed|${days}|${id}` }));
    return { inline_keyboard: [...grid(buttons), [
      { text: '⌨️ Type a date', callback_data: `nw|ed|type|${id}` },
      { text: 'Skip', callback_data: `nw|ed|skip|${id}` },
    ]] };
  }
  const def = STEPS[step];
  const buttons = def.options.map((o, i) => ({ text: o, callback_data: `nw|${step}|${i}|${id}` }));
  return { inline_keyboard: [...grid(buttons), [{ text: step === 'et' ? 'None yet' : 'Skip', callback_data: `nw|${step}|skip|${id}` }]] };
}

// Card text rebuilt from Notion every step, so the message always reflects
// what was actually saved.
export function cardText(row, question) {
  const lines = [
    `🆕 <b>${escapeHtml(row.content)}</b>`,
    `Pipeline status: ${escapeHtml(row.pipelineStatus ?? '—')}`,
    `Video type: ${escapeHtml(row.videoType ?? '—')}`,
    `Edit type: ${escapeHtml(row.editType ?? 'none')}`,
    `Expected date: ${formatDate(row.expectedDate) ?? '—'}`,
  ];
  if (question) lines.push('', question);
  else lines.push('', `✅ Saved. ${row.url}`);
  return lines.join('\n');
}

export async function startDraft(content) {
  return createRow({ content });
}

// Applies a button choice. Returns { row, nextStep } where nextStep is
// 'ps' | 'vt' | 'et' | 'ed' | 'typed' | 'done'.
export async function applyChoice(step, choice, id) {
  if (step === 'ed') {
    if (choice === 'type') return { row: await fetchRow(id), nextStep: 'typed' };
    if (choice !== 'skip') {
      await updateRow(id, { 'Expected date': { date: { start: addDaysIST(Number(choice)) } } });
    }
    return { row: await fetchRow(id), nextStep: 'done' };
  }
  const def = STEPS[step];
  if (!def) throw new Error(`unknown step ${step}`);
  if (choice !== 'skip') {
    const value = def.options[Number(choice)];
    if (!value) throw new Error(`bad choice ${choice} for ${step}`);
    await updateRow(id, { [def.property]: { select: { name: value } } });
  }
  return { row: await fetchRow(id), nextStep: def.next };
}

export async function applyTypedDate(id, date) {
  await updateRow(id, { 'Expected date': { date: { start: date } } });
  return fetchRow(id);
}

export function questionFor(step) {
  if (step === 'ed') return 'Expected date?';
  return `${STEPS[step].label}?`;
}

// The typed-date prompt carries the row id on its last line so the reply
// handler can find the draft without any server-side state.
export function datePrompt(row) {
  return `${DATE_PROMPT_PREFIX} for "${row.content}"? Reply with YYYY-MM-DD.\nref:${shortId(row.id)}`;
}

export function refFromPrompt(text) {
  const m = /ref:([0-9a-f]{32})\s*$/.exec(text ?? '');
  return m ? m[1] : null;
}

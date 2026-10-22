import { fetchOpenRows, searchByTitle, fetchRowsCompletedBetween } from './notion.js';
import { todayIST, classifyRows, rowsFor, computeWeeklyStats, computeShootKPI, weekRangeIST } from './logic.js';
import { todayCheckinStatus } from './checkin.js';
import { leavesForDate } from './leave.js';
import { fetchOpenBrandTasks } from './brand.js';
import { ROSTER, resolveRosterName } from './roster.js';

// Free-text chat in the Telegram group, grounded in live Notion data via
// tool calls. Read-only on purpose — every tool here only fetches; any
// change to Notion still has to go through the deterministic commands
// (/done, /begin, /leave, ...), so the model can't hallucinate a write.
export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_TOOL_ROUNDS = 5;

function trimRow(r) {
  return {
    content: r.content,
    editType: r.editType,
    pipelineStatus: r.pipelineStatus,
    status: r.status,
    inCharge: r.inCharge,
    expectedDate: r.expectedDate,
    completionDate: r.completionDate,
    shootDoneDate: r.shootDoneDate,
    timeTaken: r.timeTaken,
    due: r.due,
    posted: r.posted,
  };
}

const TOOLS = [
  {
    name: 'content_pipeline',
    description: 'Everything currently in the content pipeline (not yet posted), grouped by who owns it: ready to post, Fazil, Jishnu, Jishnu+Fazil (shared), and unassigned.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'person_tasks',
    description: "One roster member's current task list — what they're working on right now.",
    input_schema: {
      type: 'object',
      properties: { person: { type: 'string', description: `Roster name, e.g. one of: ${ROSTER.join(', ')}` } },
      required: ['person'],
    },
  },
  {
    name: 'find_card',
    description: 'Search the content tracker by title substring and return matching cards with full status.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Title substring to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'checkin_status',
    description: "Today's attendance snapshot: who's checked in, checked out, on leave, or missing.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'leave_today',
    description: "Who's on leave today and whether it's half or full day.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'brand_tasks',
    description: "Levin's open Brand Manager checklist tasks.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'weekly_stats',
    description: 'Last full week\'s editing throughput, per-person counts, on-time rate, and average time-taken per Edit Type.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'shoot_to_completion_kpi',
    description: 'This week so far: average days between Shoot Done Date and Completion date, per editor — how fast shot footage gets turned around into a finished edit.',
    input_schema: { type: 'object', properties: {} },
  },
];

async function runTool(name, input) {
  switch (name) {
    case 'content_pipeline': {
      const rows = classifyRows(await fetchOpenRows());
      const byBucket = {};
      for (const r of rows) (byBucket[r.bucket] ??= []).push(trimRow(r));
      return byBucket;
    }
    case 'person_tasks': {
      const target = resolveRosterName(input.person);
      if (!target) return { error: `"${input.person}" isn't on the roster (${ROSTER.join(', ')})` };
      const classified = classifyRows(await fetchOpenRows());
      return { person: target, tasks: rowsFor(target, classified).map(trimRow) };
    }
    case 'find_card': {
      const rows = classifyRows(await searchByTitle(input.query));
      return rows.map(trimRow);
    }
    case 'checkin_status':
      return todayCheckinStatus();
    case 'leave_today':
      return leavesForDate();
    case 'brand_tasks':
      return fetchOpenBrandTasks();
    case 'weekly_stats': {
      const week = weekRangeIST(-1);
      const rows = await fetchRowsCompletedBetween(week.start, week.end);
      return { week, stats: computeWeeklyStats(rows) };
    }
    case 'shoot_to_completion_kpi': {
      const week = weekRangeIST(0);
      const today = todayIST();
      const rows = await fetchRowsCompletedBetween(week.start, today);
      return { from: week.start, to: today, avgDaysByPerson: computeShootKPI(rows) };
    }
    default:
      return { error: `unknown tool "${name}"` };
  }
}

function systemPrompt(askerName) {
  return [
    'You are the assistant inside @Instantkaabot, a Telegram bot for the First House Media team.',
    `Today's date (IST): ${todayIST()}.`,
    `Team: Fazil and Jishnu edit video (sometimes together, tagged Jishnu + Fazil). Levin runs brand/marketing tasks. Ajay owns the project. Shamil is an intern working afternoons only.`,
    askerName ? `You're talking to ${askerName}.` : "You don't know who's asking — they're not on the roster.",
    'Use the tools to get live data before answering anything about tasks, status, attendance, or leave — never guess or make up card names, dates, or statuses.',
    'You are READ-ONLY: you cannot create, update, or complete anything in Notion. If someone asks you to mark something done, assign work, log leave, or check someone in, tell them which command does it (/done <n>, /begin <n>, /leave, /add, /checkin, /checkout) instead of pretending to do it.',
    'Keep replies short and chat-appropriate — this is a Telegram group, not a report. Telegram HTML is supported: <b>bold</b>, <i>italic</i> only, no markdown.',
  ].join('\n');
}

async function callAnthropic(messages, system) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages, tools: TOOLS }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Runs the tool-call loop and returns the final text reply.
export async function askClaude(question, { askerName } = {}) {
  const messages = [{ role: 'user', content: question }];
  const system = systemPrompt(askerName);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callAnthropic(messages, system);
    if (response.stop_reason !== 'tool_use') {
      return response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || "I don't have anything to add.";
    }
    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      let result;
      try {
        result = await runTool(block.name, block.input ?? {});
      } catch (err) {
        result = { error: err.message };
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return "That took too many steps to answer — try asking something more specific.";
}

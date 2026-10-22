import { hasDashboardToken } from '../lib/auth.js';
import { fetchOpenRows } from '../lib/notion.js';
import { fetchOpenBrandTasks } from '../lib/brand.js';
import { todayCheckinStatus } from '../lib/checkin.js';
import { classifyRows, stableSort, todayIST } from '../lib/logic.js';
import { escapeHtml, formatDate } from '../lib/format.js';
import { buildIcs } from '../lib/ics.js';

export const config = { maxDuration: 30 };

const CSS = `
:root{color-scheme:light dark;--bg:#fafaf7;--fg:#1a1a1a;--muted:#6b6b6b;--card:#fff;--line:#e6e4dd;--warn:#b42318;--ok:#067647;--stale:#b54708}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--muted:#9a9a9a;--card:#1e1e1e;--line:#2c2c2c;--warn:#f97066;--ok:#47cd89;--stale:#f7b955}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
h2{font-size:15px;margin:0 0 10px;display:flex;justify-content:space-between}h2 span{color:var(--muted);font-weight:400}
ul{list-style:none;margin:0;padding:0}li{padding:6px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}
.meta{color:var(--muted);font-size:13px}.warn{color:var(--warn)}.ok{color:var(--ok)}.stale{color:var(--stale)}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}.empty{color:var(--muted)}
.tag{font-size:11px;padding:1px 6px;border:1px solid var(--line);border-radius:999px;color:var(--muted);margin-left:6px}`;

function rowLi(r) {
  const due = r.due === 'overdue' ? `<span class="warn">overdue ${formatDate(r.expectedDate)}</span>`
    : r.due === 'due-today' ? '<span class="warn">due today</span>'
      : r.expectedDate ? `due ${formatDate(r.expectedDate)}` : 'no date';
  const stale = r.stale ? ` · <span class="stale">${r.staleDays}d untouched</span>` : '';
  const tag = r.editType === 'Jishnu + Fazil' ? '<span class="tag">J+F</span>' : '';
  const tt = r.bucket === 'ready' && r.timeTaken != null ? ` · TT ${r.timeTaken}d` : '';
  return `<li><a href="${escapeHtml(r.url)}" target="_blank">${escapeHtml(r.content)}</a>${tag}<div class="meta">${escapeHtml(r.status)} · ${due}${stale}${tt}</div></li>`;
}

function section(title, items, render) {
  const body = items.length ? `<ul>${items.map(render).join('')}</ul>` : '<p class="empty">Nothing here.</p>';
  return `<section><h2>${title} <span>${items.length}</span></h2>${body}</section>`;
}

// Read-only live view of the same data as the brief. Open with
// https://<app>/api/dashboard?token=<DASHBOARD_TOKEN>. Server-rendered, no JS.
// ?format=ics (or the /api/calendar rewrite) returns the due-date calendar feed instead.
export default async function handler(req, res) {
  if (!hasDashboardToken(req)) {
    res.status(401).send('unauthorized');
    return;
  }
  if (req.query?.format === 'ics') {
    try {
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(buildIcs(classifyRows(await fetchOpenRows())));
    } catch (err) {
      console.error('calendar error:', err);
      res.status(500).send('internal error');
    }
    return;
  }
  try {
    const [rows, brandTasks, checkin] = await Promise.all([fetchOpenRows(), fetchOpenBrandTasks(), todayCheckinStatus()]);
    const c = classifyRows(rows);
    const by = (b) => stableSort(c.filter((r) => r.bucket === b));
    const checkinLis = [
      ...checkin.checkedIn.map((p) => `<li><span class="ok">●</span> ${escapeHtml(p.person)} <span class="meta">in ${p.checkIn}${p.checkOut ? ` · out ${p.checkOut}` : ''}${p.note ? ` · ${escapeHtml(p.note)}` : ''}</span></li>`),
      ...checkin.onLeave.map((p) => `<li><span class="meta">●</span> ${escapeHtml(p)} <span class="meta">on leave</span></li>`),
      ...checkin.notCheckedIn.map((p) => `<li><span class="warn">●</span> ${escapeHtml(p)} <span class="meta">not checked in</span></li>`),
    ];
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FH Tracker</title><style>${CSS}</style></head><body><main>
<h1>FH Tracker</h1><p class="sub">${formatDate(todayIST())} · live from Notion · refresh to update</p>
<div class="grid">
${section('🔥 Overdue / due today', stableSort(c.filter((r) => r.due && r.bucket !== 'ready')), rowLi)}
<section><h2>🕒 Check-in today</h2>${checkinLis.length ? `<ul>${checkinLis.join('')}</ul>` : '<p class="empty">Nothing yet.</p>'}</section>
${section('✅ Ready to Post', by('ready'), rowLi)}
${section('👤 Fazil', by('fazil'), rowLi)}
${section('👤 Jishnu', by('jishnu'), rowLi)}
${section('👤 Levin', brandTasks, (t, i) => `<li>${i + 1}. ${escapeHtml(t.content)} <span class="meta">${escapeHtml(t.status.toLowerCase())}</span></li>`)}
${section('💡 Need attention', by('needs_assignment'), rowLi)}
</div></main></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(html);
  } catch (err) {
    console.error('dashboard error:', err);
    res.status(500).send('internal error');
  }
}

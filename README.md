# FH Tracker Bot

Telegram bot (**@Instantkaabot**) for the First House Media team. Reads and writes the
team's Notion databases and runs scheduled posts from Vercel Cron.

## What it does

**Content pipeline** (Master Content Tracker in Notion)
- `/brief` — full daily brief: Ready to Post, per-person task lists, Levin's list, Need Attention
- `/mine` — just your own numbered list
- `/done <n>` — finish task *n* from `/mine` (stamps the right end dates, moves it to Ready to Post; for J+F rows the first `/done` hands over to Fazil)
- `/begin <n>` — stamp the start date for task *n*
- `/add <title> | f|j|jf|none | YYYY-MM-DD | filler|paid|wait` — new tracker row (only title required)
- `/status <name>` — one card's details
- Voice note → transcript + buttons to add it to Levin's list or the tracker (needs `OPENAI_API_KEY`)

**Attendance** (Daily Check-in + Leave Log in Notion; only Jishnu and Levin are nagged)
- `/checkin [HH:MM]`, `/checkout [HH:MM]`, or the buttons on the reminder posts
  (Check in · Check out · WFH · Shoot work · Full leave · Half leave)
- `/wfh [note]` — check in as working from home
- `/shoot [note]` — check in as on a shoot
- When Levin checks out, the bot asks what he worked on; his reply is saved to that day's check-in note
- `/late <reason>` — heads-up before arriving; reminders show the reason
- `/leave half|full [date]`, `/leave cancel [date]`, `/leaves`
- Ajay only: plain text `fulldayleave<name>` / `halfdayleave<name>` (spaces/dashes optional,
  e.g. `full day leave Jishnu`, optionally + a `YYYY-MM-DD` date) logs leave for someone else

**Levin's checklist** (Brand Manager Kanban)
- `/levintask <text>` — anyone can add
- `/levwork` / `/levwork <n> done` — Ajay only

**Utilities**: `/whoami` (your Telegram id + roster match), `/chatid`

**Read-only views** (token in URL, see `.env.example`)
- `https://<app>/api/dashboard?token=…` — live web dashboard
- `https://<app>/api/calendar?token=…` — ICS feed of due dates (subscribe in Google/Apple Calendar)

## Scheduled posts (IST, Mon–Sat unless noted)

| Time | Job | Where |
|---|---|---|
| 09:00 | Daily brief + quote (`/api/cron`) | group |
| 09:05 | 🎉 posted celebration (`/api/celebrate`, daily incl. Sun) | group |
| 09:15 Mon | Weekly stats: throughput, per person, on-time %, avg TT | group |
| 09:30 | Nudge (`/api/nudge`): overdue/due-today post, personal overdue DMs, stale escalation (5d → owner DM, 7d → Ajay DM), handover ping, Monday week plan with 👍 button | group + DMs |
| 11:00 | Check-in reminder with buttons (`/api/attendance-reminder`) | group |
| 12:00 | Check-in escalation | Ajay DM |
| 18:30 | Check-out reminder with buttons | group |
| 19:00 | Check-in status snapshot | group |
| 20:00 | Month-end only: leave summary + attendance report | group |
| 21:00 | Heartbeat (daily incl. Sun) | Ajay DM |

Every job DMs `ADMIN_CHAT_ID` if it throws.

`/api/notion-webhook` (optional) makes the posted celebration and handover ping instant
instead of next-morning. Setup in `.env.example`.

## Layout

```
api/        one file per Vercel function (Hobby plan caps at 12; attendance.js serves 4 crons via rewrites)
lib/        bot.js commands · logic.js pure rules (tested) · format.js rendering
            notion.js/checkin.js/leave.js/brand.js data access · cron.js shared wrapper
scripts/    set-webhook.js (also registers the / menu) · dev.js (local polling, see warning)
test/       node --test, no dependencies
```

## Deploy

```
npm test
git commit …
npx vercel --prod --yes
node scripts/set-webhook.js https://fh-tracker-bot.vercel.app   # after any command-menu or secret change
```

New env vars go in **both** Vercel (`npx vercel env add NAME production`) and local `.env`.

## Gotchas

- **`npm run dev` disables the production webhook** while it runs (Telegram can't do both).
  It restores it on Ctrl+C; if it dies any other way, run `npm run set-webhook`.
- The webhook rejects requests without `TELEGRAM_WEBHOOK_SECRET` — if the bot goes silent
  after a redeploy, re-run `set-webhook` so Telegram sends the current secret.
- Roster matching prefers Telegram user id (`ID_MAP` in `lib/roster.js`). When someone's
  commands say "doesn't match the roster", have them send `/whoami` and add their id.
- People must press **Start** on the bot in a private chat once before it can DM them.
- `scripts/smoke-checkin-WRITES-TO-NOTION.js` creates real check-in rows. Don't run it casually.

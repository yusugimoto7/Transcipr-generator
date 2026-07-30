# Sugimoto Visa — Video Topic Engine

A Next.js app that pulls **this week's live Canada & Europe immigration news**, presents
one topic per card in a **Tinder-style swipe deck**, and — when you approve a topic —
writes a complete, ready-to-shoot Reel script in **Farsi + English**.

Built for the Sugimoto Visa Persian-language immigration brand
(`@sugimotovisa`, `@sugimotovisa.europe`).

## How it works
1. **Topic feed** — Claude runs a web search over the last 7 days of Canada/Europe
   immigration developments (Express Entry, BC PNP, PGWP, LMIA, IRCC policy, Federal
   Court, Germany Opportunity Card, etc.) and returns 6 engagement-ranked topics.
2. **Swipe deck** — swipe right / tap ✓ to approve, swipe left / tap ✕ to reject.
3. **Script generation** — approving a topic generates a full bilingual Reel script
   (hook, narration, on-screen text, caption + CTA) in Farsi and English.

Your Anthropic API key stays on the **server** — it is never shipped to the browser.
The Claude calls live in `/app/api/topics` and `/app/api/script`; the UI only talks to
those routes.

## What you need
One key, provided at runtime (nothing in code):
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)

## Run locally
Requires Node 18.18+.
```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
# open http://localhost:3000
```

Production build:
```bash
npm run build
npm start
```

## Deploy
- **Vercel / any Next.js host** — import the repo and set the `ANTHROPIC_API_KEY`
  environment variable. That's it.
- **Docker** — the included `Dockerfile` builds and serves the app; pass
  `ANTHROPIC_API_KEY` as a runtime env var:
  ```bash
  docker build -t sugimoto-topic-engine .
  docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... sugimoto-topic-engine
  ```

## Draw auto-poster (Canada immigration draws → social + site)

A second, independent feature in this same app: it watches Canadian immigration
draws and **auto-posts every new one** to Telegram, X, LinkedIn and Instagram —
and optionally keeps a Persian "latest draws" page on your WordPress site up to
date. No n8n, no manual approval.

### Programs covered
| Program | Source | Cadence |
|---|---|---|
| Express Entry (federal) | official IRCC JSON | one post per draw |
| BC PNP — Skills | Apps Script router (`?source=bcpnp`) | one post per draw |
| BC PNP — Entrepreneur | same | one post per draw |
| OINP (Ontario) draws + program updates | Apps Script router (`?source=oinp`) | one post per draw/update |
| OINP — Entrepreneur | scraped from ontario.ca | only when it resumes (see below) |
| Alberta AAIP | scraped from alberta.ca | **one weekly digest** |

Alberta runs several draws a week across many streams, so it posts a single
weekly roundup of the most recently completed week (Mon–Sun) instead of flooding
the channels. OINP's Entrepreneur stream has been dormant since Sept 2023, so it
is staleness-gated: nothing posts unless Ontario runs a draw newer than 90 days,
at which point it starts posting automatically. Alberta publishes no scored
entrepreneur draws, so there is nothing to post there.

### How it runs
Set `DRAWS_AUTORUN=true` and **the app schedules itself** — there is no cron job
to create anywhere:

```
app boots ──► every 15 min ──► collect all programs
                                 ├─ drop already-posted
                                 ├─ post the rest
                                 └─ refresh the WordPress page (if changed)
```

(Prefer an external scheduler? Leave `DRAWS_AUTORUN` off and have anything —
Render Cron Job, cron-job.org, GitHub Actions — hit
`/api/draws/run?key=$DRAWS_CRON_SECRET`. Required if you run more than one
instance, since the built-in scheduler assumes a single one.)

Already-posted draws are remembered in your existing Google Sheet, as records in
the **Library** tab — this uses the Apps Script endpoints you already have
deployed, so **no changes to `google-apps-script.gs` are required**. The memory
survives Render redeploys, which wipe the container disk, so nothing is ever
posted twice and idle runs are free.

The WordPress page is **fingerprint-gated**: the draw data is hashed (timestamps
excluded), the hash is stored in an HTML comment on the page, and the page is
only rewritten when the data actually changed. Provinces with no fresh data get
an amber "نیازمند بررسی" badge and a link to the official source rather than a
stale number.

### Endpoints
| Route | Purpose |
|---|---|
| `GET /api/draws/status?key=…` | **start here** — setup checklist, plus scheduler state and the last run's result |
| `GET/POST /api/draws/run?key=…` | one full cycle (this is what cron calls) |
| `…&dry=1` | collect and report, send nothing |
| `…&only=alberta,express-entry` | restrict to specific sources |
| `…&wp=0` | skip the WordPress page this run |
| `GET /api/draws/preview?key=…` | show exactly what *would* post, send nothing |
| `GET /api/draws/story?key=…` | **see the Instagram story card** for a real draw, as an image |
| `…&program=alberta-aaip-weekly` | pick which program's card to render |
| `…&list=1` | which programs currently have a card |
| `…&png=1` | render through HCTI and return the hosted PNG URL |

`/api/draws/status` never reveals secret values — only whether each one is set —
and tells you the exact next variable to configure, so you don't have to work
through this README line by line.

### Setup
Setting environment variables is the only manual step — there is no script to
edit and no cron to configure.

1. **Set the env vars** from `.env.example` (the `CANADA DRAWS AUTO-POSTER`
   block). Only `DRAWS_CRON_SECRET` is required — every channel is independent,
   so any block you leave blank is simply skipped and reported as such.
2. **Check what's left** at `/api/draws/status?key=…` — it lists exactly which
   variables are still missing and the next step. Then `/api/draws/preview?key=…`
   shows the real message text without sending anything.
3. **Turn it on** with `DRAWS_AUTORUN=true`. That's the whole schedule.

Optional: paste a base64 PNG into `assets/story-logo.b64` (or `STORY_LOGO_B64`)
for the Instagram story card — without it the card renders a text wordmark.

### Instagram stories
Every draw with numbers gets a story card automatically — the same 1080×1920
design for all programs, re-labelled per draw (CRS + invitations for Express
Entry, min score + ITAs for the provincial programs, week totals for the Alberta
digest). Program *updates* have no numbers, so they post to the text channels
only and skip Instagram.

Check the design before enabling it: open `/api/draws/story?key=…` and the card
renders in the browser. Then set `IG_USER_ID`, `IG_ACCESS_TOKEN`, `HCTI_USER_ID`
and `HCTI_API_KEY` and stories start going out with the rest.

Instagram will not accept inline image data, so the card is rendered to a hosted
PNG first — that is what the HCTI credentials are for. Rendering happens in a
real browser, which is what makes the Persian typography and the web font come
out correctly.

The updated `google-apps-script.gs` in this repo adds a government-page proxy
that is only needed if your host cannot reach canada.ca / alberta.ca /
ontario.ca. Everything else works with the Apps Script you already have.

### Notes
- **Token expiry** is the one thing that needs occasional attention: X's OAuth
  1.0a credentials do not expire, but **LinkedIn (~60 days)** and **Instagram**
  tokens do. When one lapses, that channel returns an error in the run report
  while the others keep posting — and if `DRAWS_ALERT_CHAT_ID` is set you get a
  Telegram ping instead of finding out from silence.
- **Egress**: Express Entry, Alberta and OINP-Entrepreneur are fetched straight
  from the government sites. If your host blocks those (403/timeout in
  `sourceErrors`), the Apps Script has a built-in proxy — point
  `DRAWS_ALBERTA_URL` / `DRAWS_OINP_ENT_URL` / `DRAWS_EE_URL` at
  `<your /exec>?secret=…&proxy=alberta|oinp_ent|ee`. No code change needed.
- Every source is isolated — one broken parser or unreachable page never stops
  the other programs; failures appear in `sourceErrors` in the run report.

## Project structure
- `app/page.jsx` — the full swipe deck + script UI (client component)
- `app/api/topics/route.js` — topic feed (web search → 6 ranked topics)
- `app/api/script/route.js` — bilingual script generation for one topic
- `app/api/draws/run/route.js` — draw auto-poster cycle (cron target)
- `app/api/draws/preview/route.js` — dry-run preview of what would post
- `lib/anthropic.js` — server-side Claude client
- `lib/prompts.js` — the topic + script prompts and JSON parser
- `lib/draws/sources/*` — one parser per immigration program
- `lib/draws/publish.js` — Telegram / X / LinkedIn / Instagram posting
- `lib/draws/story.js` — Instagram story card (SVG → PNG)
- `lib/draws/wordpress.js` — fingerprint-gated draws page
- `lib/draws/store.js` — "already posted" memory (Google Sheet Library tab)
- `lib/draws/scheduler.js` — built-in interval scheduler (no external cron)
- `lib/draws/status.js` — setup self-check
- `lib/draws/run.js` — the orchestrator
- `instrumentation.js` — arms the scheduler once at server start

## Notes
- If the live topic fetch fails (e.g. no API key, network issue), the deck falls back
  to a set of evergreen base topics so the UI stays usable.
- Claude usage is billed to your own Anthropic account.

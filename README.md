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
One endpoint does a full cycle; an external cron visits it on a schedule:

```
Render Cron Job ──every 15 min──► /api/draws/run?key=$DRAWS_CRON_SECRET
                                        │
             collect all programs ──► drop already-posted ──► post the rest
                                        └──► refresh the WordPress page (if changed)
```

Already-posted draws are remembered in your Google Sheet (a `PostedDraws` tab,
via the same Apps Script as the rest of the app), so nothing is ever posted
twice — and the memory survives Render redeploys, which wipe the container disk.
That makes idle runs free, so a missed or repeated ping costs nothing.

The WordPress page is **fingerprint-gated**: the draw data is hashed (timestamps
excluded), the hash is stored in an HTML comment on the page, and the page is
only rewritten when the data actually changed. Provinces with no fresh data get
an amber "نیازمند بررسی" badge and a link to the official source rather than a
stale number.

### Endpoints
| Route | Purpose |
|---|---|
| `GET /api/draws/status?key=…` | **start here** — setup checklist: what's configured, what's missing, next step |
| `GET/POST /api/draws/run?key=…` | one full cycle (this is what cron calls) |
| `…&dry=1` | collect and report, send nothing |
| `…&only=alberta,express-entry` | restrict to specific sources |
| `…&wp=0` | skip the WordPress page this run |
| `GET /api/draws/preview?key=…` | show exactly what *would* post, send nothing |

`/api/draws/status` never reveals secret values — only whether each one is set —
and tells you the exact next variable to configure, so you don't have to work
through this README line by line.

### Setup
1. **Set the env vars** from `.env.example` (the `CANADA DRAWS AUTO-POSTER`
   block). Only `DRAWS_CRON_SECRET` is required — every channel is independent,
   so any block you leave blank is simply skipped and reported as such.
2. **Re-deploy your Apps Script** after pulling the updated
   `google-apps-script.gs` (it adds the `PostedDraws` tab used for dedup).
   Deploy → Manage deployments → edit → New version → Deploy, so the `/exec`
   URL stays the same.
3. **Add the logo** for the Instagram story card: paste your base64 PNG into
   `assets/story-logo.b64` or the `STORY_LOGO_B64` env var. Without it the card
   renders a text wordmark.
4. **Check it** with `/api/draws/preview?key=…` — this posts nothing and shows
   the exact message text, which items are new, and any source errors.
5. **Add the cron.** On Render, create a *Cron Job* with schedule `*/15 * * * *`
   running:
   ```bash
   curl -fsS "https://<your-app>.onrender.com/api/draws/run?key=$DRAWS_CRON_SECRET"
   ```
   (Any pinger works — cron-job.org, UptimeRobot, GitHub Actions.)

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

## Leads dashboard (`dashboard/index.html`)

A standalone analytics dashboard for the assessment-form leads sheet — one HTML
file with its data embedded, no server, no API keys, no network calls at runtime.

**Deploy to Render.** `render.yaml` in the repo root defines it as a static site:
Render dashboard → **New → Blueprint** → pick this repo → **Apply**. Render serves
`dashboard/`, and the dashboard is `index.html`, so the shared link is just the
service domain. Nothing to build and no environment variables.

**Anyone with the URL can read it.** Render static sites have no access control,
and the page carries commercially sensitive figures (volumes, budget mix,
acquisition channels, affiliate codes). Names, emails and phone numbers are *not*
in the file. The blueprint sets `X-Robots-Tag: noindex` so it stays out of search
results, but if the link needs to be restricted, serve it behind an authenticated
route instead of as a static site.

**Live data (recommended).** With an endpoint configured the page fetches the
sheet on every load, so a browser refresh is always current:

1. Open the leads spreadsheet → **Extensions → Apps Script**, paste
   `apps-script/leads-dashboard.gs`, set `SECRET` to a long random string.
2. **Deploy → New deployment → Web app**, *Execute as* Me, *Who has access*
   Anyone. Authorize it (it is your own script).
3. Put the resulting URL in `LIVE_DATA_URL` near the top of the script block in
   `dashboard/index.html`:
   `https://script.google.com/macros/s/AKfy.../exec?secret=YOUR_SECRET`
4. Commit and push — Render redeploys.

The page renders its embedded snapshot instantly, then swaps in the live pack and
re-renders, so it never shows a blank screen and never breaks if the endpoint is
down — it falls back to the snapshot and says so in the header badge. The badge
reads "Live · HH:MM" when fresh, and carries a Refresh button. Add `?live=<url>`
to the page URL to point a single visit at a different endpoint.

The endpoint returns **only the anonymised pack** — no names, emails, phone
numbers or résumé text. `SECRET` is embedded in the page, so treat it as
obfuscation, not access control: anyone who can open the dashboard can call the
endpoint and get exactly what the dashboard already shows. The Apps Script
transform is verified byte-identical to the Python build script's output.

**Rebuilding the embedded snapshot.** Independent of the live endpoint, the
fallback snapshot can be refreshed so the page is useful even offline:

```sh
pip install openpyxl
# Sheet -> File -> Download -> Microsoft Excel (.xlsx)
python3 scripts/build_dashboard.py ~/Downloads/leads.xlsx
git commit -am "Refresh dashboard data" && git push      # Render redeploys on push
```

The script re-reads the first three tabs, de-duplicates the overlap between them,
drops test rows, and rewrites both the embedded data and every figure the page
states in prose, so the narrative can never contradict the charts. It prints a
summary of what it found. The header shows when the data was last rebuilt, and a
banner appears automatically once the newest lead is more than a day old.

Use the **xlsx** export, never Drive's plain-text export — the latter silently
truncates large sheets to a few dozen rows per tab.

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
- `lib/draws/store.js` — "already posted" memory (Google Sheet)
- `lib/draws/run.js` — the orchestrator

## Notes
- If the live topic fetch fails (e.g. no API key, network issue), the deck falls back
  to a set of evergreen base topics so the UI stays usable.
- Claude usage is billed to your own Anthropic account.

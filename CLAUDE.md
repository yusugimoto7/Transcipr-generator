# Sugimoto Visa — Topic Engine

Next.js 14 (App Router, JSX, `runtime = "nodejs"`) content tool for a Persian-language Canadian/European immigration brand (@sugimotovisa). It ingests real immigration news, turns it into Farsi topic cards, and generates video scripts, clean Telegram news posts, and Farsi SEO blog articles (WordPress drafts). A separate module auto-posts Canadian immigration draws.

Deployed on Render from `main` (auto-deploy on push). Two people work on this repo on the same branch, each with their own Claude Code session.

## Branch workflow (two people, one branch)

Both people work directly on `main`. Render deploys every push to it, so the
discipline is about not stepping on each other and not shipping a broken build:

- `git pull --rebase origin main` before you start work and again right before every push.
- `npm run build` must pass before every push. A broken push goes straight to production.
- Push small commits often. Do not sit on a day of local changes.
- If a push is rejected, `git pull --rebase origin main`, resolve, build, push again.
- CI also runs the build on every push to `main`. If it goes red, fix it immediately.
- Before starting a lane of work, say which files you are about to change so the other person is not editing the same ones at the same time.

## Safety rules — read before running anything locally

Every integration in this app is optional and degrades gracefully when its env vars are blank. Use that.

- **Local `.env.local` = `USE_OPENAI=true` + `OPENAI_API_KEY` only.** Leave everything else blank. Production Telegram, WordPress, and Google Sheet credentials live in Render; do not copy them into a local file.
- **Never open `/api/telegram/setup` locally.** It re-registers the bot webhook to whatever URL you are on and silently breaks the production approve/reject buttons.
- **Never set `DRAWS_AUTORUN=true` locally.** The draws poster publishes straight to the public channel with no review step.
- Never commit secrets. `.env*.local` is gitignored; keep it that way.
- Any credential pasted into a chat is exposed — rotate it.

## Verify before pushing

```
npm install
npm run build        # must print "✓ Compiled successfully"
```

There is no test suite. Diagnostics live in the deployed app instead:
- `/api/status` — one-page health check of every integration
- `/api/feeds` — which news sources are actually delivering
- GitHub → Actions → **harvest** → latest run summary — per-feed health from the scheduled harvest, plus how many Google News links resolved
- Tap the line above the deck in the app — why the deck has the cards it has

## Where things are

| Area | Files |
|---|---|
| **Feed list — add sources here** | `lib/feeds.js` |
| News ingest logic: parsing, dedupe, YouTube resolution | `lib/news.js` |
| Candidate pool: relevance scoring, merge, reading the harvest | `lib/candidates.js` |
| Scheduled harvester (every 2h, GitHub Actions → `harvest-data` branch) | `scripts/harvest.mjs`, `.github/workflows/harvest.yml` |
| Google News link → real publisher URL | `lib/gnews.js` |
| Topic generation pipeline, caching, cost caps | `app/api/topics/route.js` |
| All LLM prompts + output parsing | `lib/prompts.js` |
| Model selection per job (env-overridable) | `lib/openai.js`, `lib/anthropic.js` |
| WordPress draft publishing (redirect-safe auth) | `lib/wordpress.js` |
| Telegram review flow + webhook | `app/api/telegram/**` |
| Durable memory (Google Sheet via Apps Script) | `lib/sheet.js`, `google-apps-script.gs` |
| Draws auto-poster (separate system) | `lib/draws/**`, `app/api/draws/**` |
| Keep-awake + deck warm-up (every 10 min, GitHub Actions → `/api/topics?warm=1`) | `.github/workflows/keepwarm.yml` |
| Instagram creators (list / reader / health page) | `lib/creators.js`, `lib/social/instagram.js`, `/api/social` |
| Lexbase newsletter from Gmail (IMAP, read-only; PDF → items) | `lib/newsletter/lexbase.js`, `/api/lexbase` |
| Background jobs (script, Telegram, article, draft, Word file, carousel, video run server-side) | `lib/jobs.js`, `app/api/jobs/route.js` |
| Shared workspace — every used/archived topic and what was made from it, for the whole team (Sheet "Library" tab, replaces the old Library view) | `lib/workspace.js`, `app/api/workspace/route.js` |
| Carousel posts: slide text (Wizard's carousel prompt) → gpt-image-2 → WordPress media → Telegram | `lib/carousel.js`, `lib/wordpress.js` (`uploadMedia`) |
| English video: options sheet on the topic page → n8n workflow "Topic Engine: English video" (HeyGen) → reports back to `/api/video/callback`. Inactive until `VIDEO_WORKFLOW_URL` + `VIDEO_WORKFLOW_SECRET` are set | `lib/video.js`, `app/api/video/callback/route.js` |
| General ideas: demand signals (Google/YouTube autocomplete EN+FA, IRCC Help Centre, Reddit, site titles, official page text) harvested daily → weekly batch of evergreen ideas grounded on canada.ca pages | `lib/ideas/seeds.js` (subjects, pages), `lib/ideas/signals.js`, `lib/ideas/index.js`, `/api/ideas` |
| Source text for every writing step (Lexbase item → stored official page → fetched page → excerpt) | `lib/grounding.js` |
| Video Editing section (login, team, projects, review, corrections, approval). The editing method is NOT here: it lives in english-sugimotovisa (`scripts/rough_cut.py`, GitHub job `rough_cut`); this app only stores state on that repo's `editing-data` branch and starts the job | `lib/editing/**`, `app/editing/**`, `app/api/editing/**`, `middleware.js` |
| Content calendar (Trello-style boards per market, month view, cards from topics and approved videos, publishing to Instagram, TikTok, YouTube, LinkedIn page, X after Hamed's approval) | `lib/calendar/**`, `app/calendar/**`, `app/api/calendar/**` |
| UI (one list: new + used topics, Archive filter; Lexbase and Ideas tabs; topic view with scripts, original text, article, carousel, video) | `app/page.jsx` |

## Video Editing section

- Off unless `EDITING_SESSION_SECRET` and `EDITING_GITHUB_TOKEN` are set; then only `/editing` and `/api/editing` need a login. `APP_LOGIN=all` puts the whole app behind the same login (members see only Video Editing); leave it off until Hamed decides.
- Locally use `EDITING_STORE_DIR=/some/folder` instead of the GitHub token: data stays in that folder and no worker is started.
- Rules that never change: only pauses, false starts and retakes are removed (decided in english-sugimotovisa, never here); a version can be approved only after it reached review; nothing is posted to Instagram or TikTok from this section; a change to the editing rules goes into english-sugimotovisa's files, never only into this app.
- A member only ever reads their own projects: every API route loads the project through `loadProject(user, id)`, which answers 403 otherwise. Keep it that way for any new route.

## Content calendar

- Same accounts as Video Editing, same switch: off until `EDITING_SESSION_SECRET` and `EDITING_GITHUB_TOKEN` are set. State is on the `editing-data` branch, one file per board.
- Everyone signed in adds, edits and moves cards. Only the admin approves, publishes and edits lists and labels. Topic Engine topics can be turned into cards by the admin only; members add their own cards and their approved videos.
- Approval covers the captions and media of the switched-on channels (`contentHash`); changing either needs a new approval, moving the card or its date does not. A card is published only while its approval holds. Never weaken this: it is how "nothing goes to Instagram or TikTok without Hamed's approval" is kept here.
- Publishing: `CALENDAR_AUTOPUBLISH=true` arms a clock (instrumentation.js) that publishes due, approved cards every minute. `CALENDAR_DRY_RUN=true` makes every channel only pretend. Failures are never retried by themselves; a post interrupted by a restart is marked "unknown" for a person to check.
- Publishing screens follow Zoho Social: New post composer (network icons, one caption with per-network customisation via `channels[k].custom`, media, schedule, live previews), month and week calendars coloured by `postStatus`, and post lists (Drafts, Waiting for approval, Scheduled, Published, Failed). Members "Send for approval"; Hamed approves, sends back with a note, or publishes. The Trello board stays as "Planning".
- Channels: X, LinkedIn and Instagram use the draws poster's keys on Render. TikTok and YouTube are connected from the calendar's Channels panel (tokens stored encrypted with a key from `EDITING_SESSION_SECRET`). Instagram gets the media through a signed app link, `/api/calendar/media/...`.

## Conventions that matter here

- **Slow steps run as server jobs, not page fetches.** A phone freezes a page when you switch apps, so anything slow must be started with `startJob` in `app/page.jsx` (POST `/api/jobs`) and read back by polling. Never `await` a model call inside a click handler. Jobs are in memory: a deploy or restart mid-job loses it, and the page offers a retry.

- **Topics stream.** `/api/topics` with `stream: true` sends one card per line as each write batch finishes, and the page also shows the deck saved on the device first. Keep both: never make the page wait for a whole batch.
- **Grounding is non-negotiable.** Every generated text must be supported by fetched source text. Never let a model see only a headline and write from it; if a source is too thin, drop it. Invented facts are the worst bug this app can have.
- Nothing goes to Telegram automatically: the news post, the article, the carousel and the English video are each started from their own tile on the topic page.
- Farsi output is the brand's own voice — never "according to the source", never sales lines or "DM us" in news posts.
- Express Entry draw results are excluded from topics (the brand covers them elsewhere).
- Evergreen ideas (`topic.evergreen`) are explainers, not news: the script, Telegram post, article and carousel prompts switch framing on that flag, and ground on the official page the harvester stored (`page_id`).
- Per-feed failures are swallowed on purpose so one dead source never breaks a batch — so when adding a source, confirm it on `/api/feeds` after deploy.
- Match the surrounding code's comment style: comments explain *why*, not what.
- Do not put model identifiers in commit messages or code comments.

## Current direction

Topic supply now runs on a harvested pool: `scripts/harvest.mjs` accumulates candidates every two hours into `candidates.json` on the `harvest-data` branch (never edit that branch by hand; it is force-pushed each run). The app reads it, filters, shortlists, has the model SELECT, fetches real text for each pick, then has the model WRITE cards from that text only. Next lanes: silent page-change detection on canada.ca, practitioner feeds, audience-demand signals. Ask the other person which lane they are on before starting one.

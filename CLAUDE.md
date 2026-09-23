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

## Where things are

| Area | Files |
|---|---|
| **Feed list — add sources here** | `lib/feeds.js` |
| News ingest logic: parsing, dedupe, YouTube resolution | `lib/news.js` |
| Topic generation pipeline, caching, cost caps | `app/api/topics/route.js` |
| All LLM prompts + output parsing | `lib/prompts.js` |
| Model selection per job (env-overridable) | `lib/openai.js`, `lib/anthropic.js` |
| WordPress draft publishing (redirect-safe auth) | `lib/wordpress.js` |
| Telegram review flow + webhook | `app/api/telegram/**` |
| Durable memory (Google Sheet via Apps Script) | `lib/sheet.js`, `google-apps-script.gs` |
| Draws auto-poster (separate system) | `lib/draws/**`, `app/api/draws/**` |
| UI | `app/page.jsx` |

## Conventions that matter here

- **Grounding is non-negotiable.** Every generated text must be supported by fetched source text. Never let a model see only a headline and write from it; if a source is too thin, drop it. Invented facts are the worst bug this app can have.
- Farsi output is the brand's own voice — never "according to the source", never sales lines or "DM us" in news posts.
- Express Entry draw results are excluded from topics (the brand covers them elsewhere).
- Per-feed failures are swallowed on purpose so one dead source never breaks a batch — so when adding a source, confirm it on `/api/feeds` after deploy.
- Match the surrounding code's comment style: comments explain *why*, not what.
- Do not put model identifiers in commit messages or code comments.

## Current direction

Topic supply is being rebuilt from fetch-on-click to continuous harvesting with a durable candidate store, plus new source lanes (primary government sources, silent page-change detection, practitioner feeds). Ask the other person which lane they are on before starting one.

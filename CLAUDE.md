# Sugimoto Visa — Topic Engine

Next.js 14 (App Router, JSX, `runtime = "nodejs"`) content tool for a Persian-language Canadian/European immigration brand (@sugimotovisa). It ingests real immigration news, turns it into Farsi topic cards, and generates video scripts, clean Telegram news posts, and Farsi SEO blog articles (WordPress drafts). A separate module auto-posts Canadian immigration draws.

Deployed on Render from `main` (auto-deploy on push). Two people work on this repo, each with their own Claude Code session.

## Branch workflow (two people — follow this)

- `main` is production. **Never commit to it directly.** Render deploys every push to it.
- Work on your own branch named `<yourname>/<topic>` (e.g. `sara/page-watch`).
- Open a pull request into `main`. CI runs `npm run build`; do not merge red.
- Rebase on `origin/main` before opening the PR. Keep PRs to one topic.
- If two branches touch the same file, coordinate before merging, not after.

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
| News ingest, feed list, dedupe, YouTube resolution | `lib/news.js` |
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

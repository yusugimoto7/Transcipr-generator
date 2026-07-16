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

## Project structure
- `app/page.jsx` — the full swipe deck + script UI (client component)
- `app/api/topics/route.js` — topic feed (web search → 6 ranked topics)
- `app/api/script/route.js` — bilingual script generation for one topic
- `lib/anthropic.js` — server-side Claude client
- `lib/prompts.js` — the topic + script prompts and JSON parser

## Notes
- If the live topic fetch fails (e.g. no API key, network issue), the deck falls back
  to a set of evergreen base topics so the UI stays usable.
- Claude usage is billed to your own Anthropic account.

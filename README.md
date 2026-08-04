# Sugimoto Draws

Watches Canadian immigration draws and publishes every new one — to Telegram, X,
LinkedIn and Instagram — and keeps the draws page on sugimotovisa.com current.

Runs on its own Render service with nothing else in it. Credentials are
environment variables set once; editing the code never touches them.

## What it watches

| Program | Where it reads | How often it posts |
|---|---|---|
| Express Entry (federal) | official IRCC JSON | one post per draw |
| BC PNP — Skills | Apps Script router | one post per draw |
| BC PNP — Entrepreneur | Apps Script router | one post per draw |
| OINP draws + announcements | Apps Script router | one post per draw |
| OINP — Entrepreneur | ontario.ca | only if the stream restarts |
| Alberta AAIP | alberta.ca | one weekly roundup |

Alberta runs several draws a week across many streams, so it posts a single
Monday–Sunday roundup rather than flooding the channels. OINP's Entrepreneur
stream has not drawn since September 2023, so it stays silent until Ontario
runs one and then posts automatically. Ontario *announcements* carry no numbers,
so they go to the text channels and skip the Instagram story.

## How it runs

```
every 15 min → read every program
             → drop anything already posted
             → post the rest
             → refresh the website page, but only if the data changed
```

Posted draws are remembered in a Google Sheet, so nothing is ever sent twice and
the memory survives redeploys — the container's own disk does not. That makes
idle runs free, so a missed or repeated run costs nothing.

The website page is only rewritten when the draw data itself changed: the data
is fingerprinted (timestamps deliberately excluded, or every run would look
different), and the fingerprint is stored in a comment on the page. A province
with no fresh data shows a "needs review" badge and a link to the official
source instead of a stale number.

## Pages

Open the service's home page and enter the access key — it shows what's
configured, what the last run did, and lets you preview or trigger a run.

| Address | What it does |
|---|---|
| `/` | control panel |
| `/api/draws/status?key=…` | what's configured and what's missing |
| `/api/draws/selftest?key=…` | **proves the duplicate guard works** — run this first |
| `/api/draws/preview?key=…` | exactly what would post — sends nothing |
| `/api/draws/story?key=…` | the Instagram card, as an image |
| `/api/draws/run?key=…` | run one cycle |
| `/api/health` | uptime check |

`/api/draws/run` also takes `&dry=1` (send nothing), `&only=alberta` (one
program), `&wp=0` (skip the website page), and `&seed=1` — see below.

## Why it cannot repeat itself

A draw is **recorded before it is published**, and the record is read back to
confirm it stuck. If the memory cannot be written, the draw simply does not go
out — the failure mode is a missed post, never a repeated one.

Three rails back that up:

- **No durable memory, no posting.** In-process memory is wiped by every
  restart, and a free instance restarts often; that combination is what turns
  one missed write into a flood. Without the Sheet, publishing is refused.
- **A cap per run.** `DRAWS_MAX_POSTS_PER_RUN` (default 3) means any future
  fault produces a few posts and a visible warning, not hundreds.
- **A self-test.** `/api/draws/selftest` writes a throwaway record and reads it
  back, and answers 503 while the guard is broken.

One gotcha worth knowing: a POST to an Apps Script `/exec` answers with a 302,
and a followed 302 turns POST into GET — which drops the body. The write looks
successful and stores nothing. Redirects on writes are therefore followed by
hand, re-issuing the POST.

## First run

⚠️ On the very first real run, every current draw counts as new and posts at
once. To start clean, call `/api/draws/run?key=…&seed=1` first: it records
today's draws as already-posted **without sending anything**, so only genuinely
new draws go out afterwards.

## Setup

1. Copy the settings from `.env.example` into the service's environment. Only
   `DRAWS_CRON_SECRET` is required to boot.
2. Open the home page, enter the key, and work down the list it gives you.
3. Point `DRAWS_TELEGRAM_CHANNEL_ID` at the test channel, prove each channel,
   then switch it to the live one.

## Things worth knowing

- **Tokens expire.** X's credentials don't, but LinkedIn's (~60 days) and
  Instagram's do. When one lapses that channel reports an error while the others
  keep posting — set `DRAWS_ALERT_CHAT_ID` to get a Telegram ping instead of
  silence.
- **A free Render service sleeps** when idle, and the built-in timer sleeps with
  it. Keep an uptime pinger on `/api/health`, or drive `/api/draws/run` from an
  external cron.
- **One instance only** if you use the built-in scheduler. Two instances each
  run their own timer and could post the same draw simultaneously; use an
  external cron instead if you ever scale out.
- **Every source is isolated.** One broken parser or unreachable government page
  never stops the other programs — failures show up as `sourceErrors` on the run.

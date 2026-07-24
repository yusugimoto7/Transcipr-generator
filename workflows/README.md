# Unified Draw System (social notifier + auto-updating WordPress page)

One n8n workflow with **two independent branches** off their own schedules:

1. **Social notifier** (every 15 min) — auto-posts **every** Express Entry,
   OINP, BC PNP, and **Alberta (AAIP)** draw to **Telegram, X, LinkedIn, and
   Instagram** (story image), deduped so nothing posts twice. Merges the two
   original flows. Alberta is scraped **directly from alberta.ca** — no Apps
   Script to deploy.
2. **WordPress page** (hourly at `:07`) — rebuilds a Persian page showing
   Express Entry + **all 9 provinces**, but only writes when the draw data
   actually changed (fingerprint-gated). Ported from the Canada Draws spec.

## Files

| File | Purpose |
|------|---------|
| `unified-draw-notifier.workflow.json` | **Import this into n8n** (Workflows → ⋯ → Import from File). |
| `build.js` | Regenerates the JSON from the sources below: `node workflows/build.js`. |
| `src/buildEE.js` | Normalises the latest Express Entry round. |
| `src/buildBCPNP.js` | Normalises BC PNP Skills + Entrepreneur draws. |
| `src/buildOINP.js` | Normalises OINP draws + program updates. |
| `src/buildAlberta.js` | Parses the Alberta AAIP draw table (fetched from alberta.ca) — newest 3 draws. |
| `src/buildStory.js` | Builds the Instagram story SVG (shared card). **Paste your logo here.** |
| `src/prepareImage.js` | Base64-encodes the SVG for the HCTI render step; skips update posts. |
| `src/updateWordPress.js` | WordPress branch: fetch unified endpoint, fingerprint, rewrite page only on change. **Fill 3 constants.** |

## Flow

```
Every 15 min ─┬─ Fetch Express Entry ─ Build EE Items ───┐
              ├─ Fetch BC PNP ──────── Build BC PNP Items ┼─ Merge ─ Build Story Card
              └─ Fetch OINP ────────── Build OINP Items ──┘        │
                                                                    ▼
   Check if posted (data table) ─ Is New? ─┬─ Telegram ─ Mark as posted
                                           ├─ X (Twitter)
                                           ├─ LinkedIn
                                           └─ Prepare Image ─ Render(HCTI) ─ IG container ─ Wait ─ Publish IG story
```

- **Dedup**: each item gets a `dedup_key` stored in the `posted_draws` data
  table's `draw_number` column (EE uses the numeric draw number, so existing EE
  rows keep working). `Mark as posted` hangs off the Telegram post so updates
  (which skip Instagram) still get recorded.
- **Alberta**: fetched directly from `alberta.ca/aaip-processing-information`
  (a clean HTML draw table) and parsed in `Build Alberta Items` — no Apps Script
  needed. It emits the newest **3** draws each run as candidates; dedup posts
  only the genuinely new ones, so the **first activation posts up to 3 Alberta
  draws once**, then one per new draw after that. Alberta draws happen several
  times a week across streams (Opportunity, Express Entry pathways, Health Care,
  Rural Renewal, Tourism) — expect more Alberta posts than the other programs.
- **Instagram**: OINP program *updates* have no numbers, so they skip the story
  image and post to Telegram/X/LinkedIn only. Draws with numbers get the story
  card re-labelled per program (min score + ITAs, etc.).

## Before enabling

1. **Paste your logo**: open the **Build Story Card** node and replace
   `__PASTE_LOGO_B64_HERE__` in the `LOGO_B64` constant with the same base64
   value used in your Express Entry flow's `Build Message` node. Until then the
   card shows a `SUGIMOTO VISA` text wordmark.
2. **Confirm credentials** re-linked on import: Telegram (`Telegram Notifier
   bot`), X (`X account`), LinkedIn (`Sugimoto Master App`), and the HCTI Basic
   Auth on **Render SVG to PNG**.
3. **Refresh the Instagram token** in `Create IG Story Container` /
   `Publish IG Story` if the long-lived token has rotated.
4. **Fill the WordPress branch**: open the **Update WordPress Page** node and
   set the three constants at the top:
   - `APPS_SCRIPT_URL` — the unified Apps Script `/exec` URL (the one that
     returns `rounds` + `pnpDraws` for all 9 provinces).
   - `WP_BASE` — `https://your-site/wp-json/wp/v2/pages/<PAGE_ID>`.
   - `WP_AUTH` — `Basic ` + base64(`user:application-password`). The WP user
     needs the `unfiltered_html` capability so the `<style>` block survives.
   Until filled, this branch no-ops safely (returns "not configured").
5. **Deactivate the old flows** (EE auto-poster, BC PNP/OINP draft notifier,
   and the standalone Canada-Draws WordPress workflow) so nothing runs twice.

Then activate the workflow.

## WordPress branch notes (from the spec)

- **Fingerprint excludes timestamps** — only draw data is hashed, so idle runs
  don't rewrite the page. The hash lives in an HTML comment on the page itself
  (no database needed).
- **Staleness safeguard preserved** — a province with no fresh data (>60 days,
  empty, or unparseable) renders an amber "needs review" badge + official-source
  link instead of a bare number. Do not remove this; it's a liability guard for
  a regulated (RCIC) publisher.
- **Two triggers, one endpoint** — the WordPress branch runs hourly (not every
  15 min) because the unified endpoint scrapes ~10 government pages per call;
  sub-15-min polling risks IP blocking. Draws happen every 1–2 weeks, so hourly
  is plenty.

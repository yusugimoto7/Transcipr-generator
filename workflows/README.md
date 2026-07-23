# Unified Draw Notifier (Express Entry + OINP + BC PNP)

A single n8n workflow that auto-posts **every** Express Entry, OINP, and BC PNP
draw to **Telegram, X (Twitter), LinkedIn, and Instagram** (story image) — no
manual approval. It merges the behaviour of the two original flows (the EE
auto-poster and the BC PNP/OINP draft notifier) into one.

## Files

| File | Purpose |
|------|---------|
| `unified-draw-notifier.workflow.json` | **Import this into n8n** (Workflows → ⋯ → Import from File). |
| `build.js` | Regenerates the JSON from the sources below: `node workflows/build.js`. |
| `src/buildEE.js` | Normalises the latest Express Entry round. |
| `src/buildBCPNP.js` | Normalises BC PNP Skills + Entrepreneur draws. |
| `src/buildOINP.js` | Normalises OINP draws + program updates. |
| `src/buildStory.js` | Builds the Instagram story SVG (shared card). **Paste your logo here.** |
| `src/prepareImage.js` | Base64-encodes the SVG for the HCTI render step; skips update posts. |

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
4. **Deactivate the two old flows** (the EE auto-poster and the BC PNP/OINP
   draft notifier) so draws aren't posted twice.

Then activate the workflow.

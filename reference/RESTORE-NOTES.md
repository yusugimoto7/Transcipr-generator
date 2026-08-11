# Outstanding work — n8n workflow 1jejYyUcyc79YVdW

Workflow: "Canada Draws — all programs (v3)" on https://n8n.sugimotogroup.org
Design source of truth: `reference/original-n8n-build-message.js`
(recovered from the old workflow PEVWZe99mBwnTY6c; the `__LOGO_B64__` marker
stands in for the 77.8KB inline logo, now hosted as `assets/story-logo.png`)

## Apply, in one workflow update

1. **Instagram story** — use the locked SVG from the reference file verbatim.
   Swap only `__LOGO_B64__` for the hosted PNG URL; that renders identically
   and keeps the node editable.
2. **Instagram caption** — restore the Persian version with hashtags.
3. **Telegram** — restore the full layout. NOTE: Latin digits (`3,000`,
   `516`, `August 5, 2026`), unlike the story card which uses Persian
   numerals. Include both the IRCC rounds link and sugimotovisa.com.
4. **X** — line breaks, emoji, hashtags. Plain text only; X has no rich text.
5. **LinkedIn** — emojis plus Unicode bold/italic for emphasis. LinkedIn's API
   has no markdown or HTML, so bold is Unicode mathematical characters. Use it
   sparingly (headline, CRS figure): screen readers cannot read those
   codepoints and LinkedIn's search indexes them poorly.
6. **Fetch Draw Data** — point at the unified endpoint so BC PNP, OINP and
   Alberta arrive, not just Express Entry.
7. **Alerts** — Telegram ping when a channel fails, so an expired token
   surfaces as a message instead of silence.

## After the update

n8n auto-assigns credentials for native nodes but SKIPS HTTP Request nodes,
so the HCTI and Instagram credentials must be re-selected from their
dropdowns. They still exist; they just detach.

## Then

- Activate the schedule (hourly at :07).
- Switch Telegram from `@testchannel_draws` to `@sugimotovisa` only on
  explicit approval.
- Delete the Render service `srv-d9nmtd7lk1mc738flqeg` — it bills until then.
- Rotate the WordPress application password (exposed in a chat transcript).

## Website page — workflow M6rayqv4W9Nt0HyH, as of 2026-08-11

Template v7 is live. The amber «نیازمند بررسی» badge is gone: a source with
draws but none inside the 60-day window now shows a neutral «بدون دراو جدید»
with a quiet grey note, because the data was not doubtful — the province
simply had not drawn. Amber was telling readers to distrust correct figures.

**The 60-second fetch timeout was the outage.** The unified endpoint now
scrapes six provincial sites per call and takes ~152s end to end, so every run
died at 60s and the page went unwritten. The node is at 300000ms with 3 tries;
Apps Script's own ceiling is 6 minutes, so 300s is the useful maximum.

**Two versions exist.** `update_workflow` writes a draft — the ACTIVE version
keeps running the old nodes until `publish_workflow` is called. A run that
looks fixed in the editor and still fails hourly is this, every time.

## Manitoba returns zero draws — one-line fix, not applied yet

The deployed endpoint reports:

    "MB": { "source": "Manitoba (MPNP)",
            "url": "https://immigratemanitoba.com/notices/", "draws": [] }

`getMPNP_` was written and tested, but `doGet` was never wired to it — the MB
row still carried the placeholder `noParserYet_` and the old notices URL, so
the working parser was simply never called. In `doGet`, replace:

    MB: province_('Manitoba (MPNP)', 'https://immigratemanitoba.com/notices/', noParserYet_),

with:

    MB: province_('Manitoba (MPNP)', MB_URL, getMPNP_),

then redeploy with **Manage deployments → New version** (New deployment mints
a new URL and both workflows would have to be re-pointed).

Testing a parser function on its own proves the parser, not the endpoint.
`getMPNP_()` returned six draws in the editor while `/exec` returned none,
because they were not connected.

Zero draws is treated as "hide this province", so a broken fetch and a quiet
province look identical on the page. That is the safe direction — better a
missing card than invented numbers — but it means a parser can rot silently.

## Proven as of 2026-08-06

All four channels have posted successfully at least once, and the duplicate
guard held across four runs. Recording the draw BEFORE publishing is what
makes a channel failure cost one missed post instead of an endless loop —
do not move that node back behind the channels.

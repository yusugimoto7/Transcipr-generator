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

## Manitoba — fixed and deployed 2026-08-11

`getMPNP_` was written and tested, but `doGet` was never wired to it — the MB
row still carried the placeholder `noParserYet_` and the old notices URL, so
the working parser was simply never called. `doGet` now reads:

    MB: province_('Manitoba (MPNP)', MB_URL, getMPNP_),

and the endpoint returns 6 draws, newest 30 July, EOI Draw #276 = 766.

Testing a parser function on its own proves the parser, not the endpoint.
`getMPNP_()` returned six draws in the editor while `/exec` returned none,
because they were not connected.

## Current endpoint URL

    https://script.google.com/macros/s/AKfycbwVPTpr39_-ubP57wVDsuOFT80SCdQ-glVifWLlE5hf5VtGPQdqzt3-LQC-jVExDbQ4/exec

This was a **New deployment**, so it is a new URL and every consumer has to be
re-pointed. Prefer **Manage deployments → New version**: it keeps the URL and
nothing downstream needs touching.

Still pointing at an older URL: the social workflow `1jejYyUcyc79YVdW`.

Zero draws is treated as "hide this province", so a broken parser and a quiet
province look identical on the page. That is the safe direction — better a
missing card than invented numbers — but it means a parser can rot silently.
Alberta and Saskatchewan are still on `noParserYet_`.
## Why the page timestamp does not move every hour

By design. The page is rewritten only when the fingerprint changes, and the
fingerprint covers draw data plus TEMPLATE_VERSION — never the clock. On a
quiet week every hourly run returns `changed:false` and the page is left
alone, so the stamp shows the last WRITE, not the last CHECK.

Template v9 replaces the run timestamp with the date of the newest draw
across all sources, plus a line saying the page is checked hourly. Nothing on
the page now claims a time it cannot back up, and no hourly rewrite is needed
to keep it honest. Printing a live "last checked" time would mean rewriting
the page every hour — 24 WordPress revisions a day for data that moves twice a
week, which is exactly what the fingerprint gate exists to prevent.

Newest-draw dates are formatted from ISO parts by hand: `new Date('2026-08-07')`
is UTC midnight and formats as August 6 in Vancouver.

## Apps Script serialises concurrent calls

Firing several executions at the same endpoint at once makes them queue: runs
that normally take 7-50s sat past 300s when three overlapped. The hourly
schedules are staggered (:07 social, :17 page) and do not collide, but do not
launch manual test runs on top of each other — wait for one to finish.

## Social workflow 1jejYyUcyc79YVdW — 2026-08-12

Now on the current endpoint with a 300s timeout and 3 retries, same as the page.

**Telegram values are escaped.** `buildTexts` interpolates the date, category,
count and score into `parse_mode: HTML`. BC publishes counts under five as the
literal `<5`, which Telegram rejects as malformed HTML — the whole message
fails, not just that field. X, LinkedIn and the IG caption are plain text and
take raw values.

**The per-run cap was hiding draws, not throttling them.** `Expand Programs`
sliced to MAX_ITEMS_PER_RUN *before* the dedup lookup, so only the newest draw
was ever a candidate. Once Express Entry #434 was recorded, every run produced
that one item, dedup dropped it, and the five BC draws from 6 August behind it
were unreachable — permanently, not just delayed. The Code node now emits every
candidate and a Limit node ("One per run") after the IF caps the UNPOSTED ones.

**Ontario is deliberately not posted.** The OINP parser returns prose
fragments, not stream names: one row is `the Masters Graduate stream and 244
invitations to apply to candidates who may qualify und` — cut mid-word — and
another carries the source's own `nternational` typo. Fine in a table next to a
link to the official page; not fine as the headline of a post under an RCIC's
name. Re-add ON to `PROV` once the parser returns a clean stream name.

**MAX_AGE_DAYS is 10.** BC Entrepreneur and Manitoba arrived with a backlog
going back to April. A wide window would announce a 16 July draw as
«نتیجه جدیدترین دراو» a month late.

## Proven as of 2026-08-06

All four channels have posted successfully at least once, and the duplicate
guard held across four runs. Recording the draw BEFORE publishing is what
makes a channel failure cost one missed post instead of an endless loop —
do not move that node back behind the channels.

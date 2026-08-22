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
## The dedup lookup was dropping new draws

The Data Table `get` node emits only the rows it MATCHES. An unmatched input —
which is exactly what a brand new draw is — produces no output item at all, so
new draws disappeared before the IF that was meant to let them through. Proof
from execution 1314993: `Expand Programs` emitted 2 items, `Already posted?`
emitted 1, and the one it kept was the already-posted Express Entry round.

It only ever looked correct because a run never had more than one candidate:
with a single input, `alwaysOutputData` produced one empty item and the empty
`dedup_key` read as "not posted".

Replaced with `Fetch posted keys` (returnAll, executeOnce) followed by a
`Drop already posted` Code node that filters `$('Expand Programs').all()`
against the key set. One query per run instead of one per candidate, and
unmatched means fresh rather than gone.

## Combined posts, one per province per date

BC ran five streams on 6 August, each with its own cut-off (102, 84, 68, 72,
88). Telegram, LinkedIn and Instagram carry the total plus a per-stream
breakdown; X is summary-only because a five-line breakdown would be truncated
mid-figure.

Totals containing a `<5` are printed as `500+`, never as an exact figure —
`<5` means one to four, and stripping the `<` to make it 5 invents a number.
Cut-offs across a date are shown as a range («68 تا 102»).

## "<5" flips to "5>" in right-to-left text

BC publishes counts under five as `<5`. Rendered inside an RTL line the bracket
mirrors, so the reader sees `5>` — "more than five", the opposite of what BC
said. It reached the test channel looking exactly like that.

The website page fixes it with `direction:ltr` on the numeric cell. Telegram, X,
LinkedIn and Instagram captions have no CSS, so the value is written in words
instead: `countFa()` turns `<5` into «کمتر از 5». The story card keeps the raw
`<5` because its number sits in an LTR English font and renders correctly.

Dedup keys use the raw figure, never the Persian wording, so rewording the text
can never make an already-published draw look new.

## Never let a key change republish an old draw

A six-day-old BC draw went out to the test channel because the dedup key format
changed from `bc::2026-08-06::Care: Childcare::183` to `bc::2026-08-06::5::500+`.
The old rows no longer matched, so already-published content looked brand new.

`Drop already posted` now matches on the **province+date prefix**, not the whole
key: once a province has been announced for a date, it stays announced whatever
the key looks like afterwards. MAX_AGE_DAYS also dropped from 10 to 5 so nothing
historical is eligible in the first place. Two independent locks, because this
failure publishes under an RCIC's name.

Any future change to key composition must keep `code::dateISO` as the first two
segments, or the guard silently stops working.

## Story card: multi-draw dates show ONLY the breakdown

A date with several streams drops both the decorative bar chart and the two big
headline figures, and gives the whole card to the per-stream list — name,
invitations, cut-off. The headline total and cut-off range were a summary of a
table printed directly beneath them: the same facts twice, once rounded
("500+", "68-102") and once exactly.

The totals stay in the TEXT posts, where X carries no breakdown at all and needs
them. Single-draw cards are the original locked design, untouched.

The list is centred vertically rather than anchored to a fixed top, so a
two-stream day does not sit in the corner of an empty card. Eight rows maximum,
then «+N استریم دیگر». Names clip at 24 characters — they share the line with
the figures.

Card figures stay raw (`<5`), not the Persian wording: the list is drawn in an
LTR English font where `<5` renders correctly.

## Proven as of 2026-08-06

All four channels have posted successfully at least once, and the duplicate
guard held across four runs. Recording the draw BEFORE publishing is what
makes a channel failure cost one missed post instead of an endless loop —
do not move that node back behind the channels.

## LIVE — 2026-08-14

Telegram switched from `@testchannel_draws` to `@sugimotovisa` on explicit
approval. Instagram, LinkedIn and X were always pointed at the real accounts;
Telegram was the only channel held back.

Nothing currently in the source is eligible to post: the newest Express Entry
round (7 August) and the BC draws (6 August) are all outside the 5-day window
and already recorded. The first live post will be a genuinely new draw.

Both guards matter more now than they did in testing:
  - `Drop already posted` matches province+date, so no key change can
    republish an announced draw.
  - `MAX_AGE_DAYS = 5` keeps anything historical out of the candidate list.
  - `One per run` caps a burst at one post per hour.

To pull it back: set the Telegram node's chatId to `@testchannel_draws` and
publish, or unpublish the workflow entirely.

## The 20 August card was wrong — breakdown-only was the wrong default

BC published two rows for 2026-08-20, BOTH named "Innovate: High Economic
Impact": 337 invitations with no score, and 265 with score 132. That is one
draw split across two qualifying routes, not two draws.

The card showed two rows reading "Innovate: High Economic…" — identical after
clipping — and nothing else. The total (602) was absent because totals had just
been removed from the card entirely.

Removing them unconditionally was the mistake. The totals are redundant when the
breakdown adds information; they are the ONLY useful figure when it does not.

Rule now:
  - If every row on a date shares the same stream name, treat it as ONE draw:
    sum the invitations, show the stream once, show the lowest score.
    -> "602 دعوت‌نامه" / "Innovate: High Economic Impact" / "حداقل نمره 132"
  - If the rows have genuinely different stream names, show the breakdown list.
  - The total appears in both cases.

Not automatable from the feed: the eligibility text in the reference design
("حداقل حقوق 55 دلار در ساعت و 110 هزار دلار در سال"). That is BC's published
criteria for the Innovate stream, not a field in the draw data. It would need a
static per-stream lookup — worth adding for the handful of BC streams, but it
must never be guessed for a stream that is not in the lookup.

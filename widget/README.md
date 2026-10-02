# Draw windows — embeddable per-programme tables

A single `<div>` dropped into an existing page renders a live table of that
programme's newest draws. **The host page is never rewritten** — no n8n write, no
WordPress revision, no cache to purge. The visitor's browser reads the feed, so
the Express Entry page keeps its own content and history untouched while the
window inside it always shows current data.

This is separate from the all-programmes page (`sugimotovisa.com` page 43311),
which the `Canada Draws — website page` workflow still renders in full. Nothing
here changes that page.

## Step 1 — update the Apps Script endpoint (required, do this first)

The windows call the feed from the visitor's browser, so a request must never
cost a full six-site scrape. `reference/apps-script-unified-endpoint.gs` now
accepts `?only=`:

| Request | Work done |
|---|---|
| `?only=EE` | Express Entry rounds only |
| `?only=BC` | one province only |
| `?only=EE,BC` | both |
| *(omitted)* | everything, exactly as before — what the n8n workflows still ask for |

**Until this is deployed the windows will not work reliably**: the old code
ignores `only=`, scrapes all six sites, and can take longer than the widget's
20-second timeout — so visitors would see the "could not load" state.

1. Open the Apps Script project.
2. Replace the file with the current `reference/apps-script-unified-endpoint.gs`.
   (This also brings in the response cache that was written earlier and never
   pasted in — that is what makes the common case instant.)
3. Run `testEndpoint()` and read the log. Confirm BC's newest date matches
   welcomebc.ca and Manitoba draw #276 reads **766**, not 76.
4. **Deploy → Manage deployments → pencil → New version → Deploy.**
   Not "New deployment" — that mints a different URL and orphans both n8n
   workflows.

Check it worked by opening this in a browser; it should return **only** BC:

```
https://script.google.com/macros/s/AKfycbwVPTpr39_-ubP57wVDsuOFT80SCdQ-glVifWLlE5hf5VtGPQdqzt3-LQC-jVExDbQ4/exec?only=BC
```

The hourly n8n workflows keep asking for the whole payload, which is what keeps
every source's cache warm for the browsers.

**Verified live on 28 Sep 2026**, after deployment:

- `?only=EE` returns 40 rounds and no provinces; `?only=BC` returns one province
  and no rounds. The full payload was 94KB; a window now pulls about 6KB.
- The response carries `access-control-allow-origin: *` on both the 302 redirect
  and the final JSON, so a browser on sugimotovisa.com is allowed to read it.
  This was checked rather than assumed — if it had been missing, every window
  would have shown its failure state.

## Step 2 — paste one block per page

In `dist/`, ready to paste:

| File | Page |
|---|---|
| `express-entry-fa.html` | Farsi Express Entry page |
| `express-entry-en.html` | English Express Entry page |
| `bc-pnp-fa.html` | Farsi BC PNP — Skills Immigration |
| `bc-pnp-en.html` | English BC PNP — Skills Immigration |
| `bc-entrepreneur-fa.html` | Farsi BC PNP — Entrepreneur |
| `bc-entrepreneur-en.html` | English BC PNP — Entrepreneur |
| `manitoba-fa.html` | Farsi Manitoba MPNP |
| `manitoba-en.html` | English Manitoba MPNP |

In the WordPress editor, at the spot where the window should appear:
**+ → Custom HTML**, paste the whole file, Update.

That is the only page edit ever needed. From then on the table updates itself.

## Options

```html
<div class="sgv-draws" data-program="bc" data-lang="fa" data-rows="10"></div>
```

| Attribute | Values |
|---|---|
| `data-program` | `ee`, `bc`, `bce`, `on`, `mb`, `ab`, `sk` |
| `data-lang` | `fa` (right-to-left) or `en` |
| `data-rows` | how many draws to show — default 10 |
| `data-title` | override the heading |

Several windows may sit on one page; the script installs itself once and makes
one request per programme no matter how many windows ask for it. A window only
fetches when it is scrolled near, so a page with several of them does not fire
every request on load.

Adding a future programme to a page is a one-attribute change — but only for
provinces the feed actually parses. `ab` and `sk` are wired here and will render
correctly the day parsers exist for them; until then they return no draws and the
window will say so rather than invent any.

## What the windows get right

These are the traps that cost real published mistakes, and each is handled:

- **`<5` is a real BC value meaning 1–4**, not a number. It is never coerced —
  `Number("<5")` is `NaN`, and printing "0 invitations" is a wrong fact, not a
  gap. In Farsi it becomes «کمتر از 5», because `<5` set in a right-to-left line
  renders as `5>`, which reads as *more* than five — the opposite of what BC
  published. English shows `<5` as-is.
- **BC's wage route.** Where BC publishes no minimum score, the wage threshold is
  the real eligibility bar, so it appears under the stream name. It is read from
  BC's own "Selection factors" column every draw — never a lookup table, because
  that wage moves every single draw ($55/$110k on 20 Aug, $58/$115k on 16 Jul,
  $62/$125k on 18 Jun). Farsi is produced only on an exact pattern match;
  anything else passes through verbatim rather than being paraphrased.
- **Ontario's prose.** OINP's parser returns sentence fragments, not stream
  names, so prose is dropped rather than printed in a Stream column.
- **Column headers sit exactly over their columns** in both directions. A centred
  header drifts beside its column in RTL — the same misalignment that had to be
  fixed on the social card.
- **Latin digits**, always left-to-right, so a date or a count never mirrors.
- **"Newest draw" comes from the newest draw actually shown**, never the feed's
  generation clock — otherwise the window looks like it changes hourly while
  showing the same draws.
- **A quiet province says so** and links to the official page instead of looking
  broken or looking current.
- **Failure is graceful**: a message, the official link, and a retry button —
  never a blank or broken box.
- **Plain integers are grouped for reading only.** Manitoba's parser strips the
  commas it finds, so its totals arrive as "2146" where BC sends "1,204". The
  separator is added only to a value that is all digits; "<5", "N/A" and an
  already-grouped number are untouched.
- **A blank Manitoba score is deliberate.** A draw that publishes several
  lowest-ranked scores, one per sub-selection, has no single honest number, so
  it publishes none. Draw #277 is the live example: 15+12+13+9+4 = 53 invitations
  in a strategic-recruitment-only draw that states no ranking score at all.

## Which programmes are shippable

| Code | Window | State |
|---|---|---|
| `ee` | Express Entry | Official IRCC JSON. Solid. |
| `bc` | BC PNP Skills Immigration | Parsed from the table. Solid. |
| `bce` | BC PNP Entrepreneur | Parsed from the table. Solid. |
| `mb` | Manitoba MPNP | One fetch per draw for the date. Solid. |
| `on` | Ontario OINP | **Not shipped.** See below. |
| `ab`, `sk` | Alberta, Saskatchewan | **No parser exists.** They return nothing and the window will say so. |

Ontario is wired (`data-program="on"`) but deliberately not built as a paste
block yet. Two problems: its newest draw in the feed is 30 April 2026, and the
parser mangles any announcement carrying more than one draw — the 22 April row
comes through as "the Masters Graduate stream and 244 invitations to apply to
candidates who may qualify und", which loses a second draw's count entirely.
Shipping that under an RCIC's name would publish wrong invitation figures.

## Changing the design

Edit `sgv-draws.js`, run `node build.js`, re-paste the four blocks. Do not edit
the files in `dist/` — they are generated and will be overwritten.

To preview locally without touching the live feed, open `preview.html`; it stubs
the network with fixed data covering RTL, LTR, phone width, a `<5` count, a
wage-route draw, a quiet province and the failure state.

## Known limitation — SEO

The table is drawn in the browser, so it is not in the page's HTML source. Google
renders JavaScript and will normally see it, but server-rendered content still
ranks more dependably. For a window inside an already-rich page this is a fair
trade; if you later want the draw numbers themselves to rank, the alternative is
to have n8n write each table into a WordPress synced pattern (reusable block) —
that is server-rendered and still never edits the parent pages.

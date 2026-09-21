# Canada immigration draw feeds — working data layer, handed over

Paste everything below this line into the new Claude chat.

---

I am building an automation that needs Canadian immigration draw data: IRCC Express Entry
rounds and Provincial Nominee Program (PNP) draws. I already have a **working, deployed,
zero-cost data layer** for exactly this, built and debugged over months in another project.
Do not rebuild it, do not write new scrapers, and do not reach for a paid API. Reuse what is
below and spend your effort on my new automation instead.

This document is the complete handover: the live endpoint, its exact JSON contract, the full
source of the scraper, and every trap that was discovered the hard way. Read all of it before
writing code.

## Why this exists

My other system struggled to read feeds from IRCC and the provinces. The reason is that only
one of these sources is a real feed. IRCC publishes clean JSON. **Every province publishes
HTML that has to be scraped**, each with a different shape, and each with at least one detail
that makes a naive parser produce a *confidently wrong number* rather than an obvious failure.
This output is published under a licensed immigration consultant's (RCIC) name, so a wrong
cut-off score is far worse than a visible gap.

That principle governs everything here:

> **When a parse is uncertain, return nothing. Never guess, never interpolate, never fall
> back to a generic "find a date near a number" heuristic.** A province with no parser
> returns `[]` and is flagged `stale: true`, which downstream renders as "needs review" or
> hides entirely.

Carry that rule into my new automation.

---

## 1. The live endpoint — use this first

A Google Apps Script web app scrapes every source, normalises it, caches it, and serves one
JSON document. It is free forever (Apps Script quota), needs no key, and is my own
infrastructure.

```
GET https://script.google.com/macros/s/AKfycbwVPTpr39_-ubP57wVDsuOFT80SCdQ-glVifWLlE5hf5VtGPQdqzt3-LQC-jVExDbQ4/exec
```

Plain unauthenticated GET, returns `application/json`.

**Operational facts you must design around:**

- **It can be slow.** It scrapes six government sites in series. Cached it answers in
  well under a second; cold it has taken over 150 seconds, and in the worst case 300+.
  **Set your HTTP client timeout to 300 s (300000 ms) and retry up to 3 times.** A 60-second
  default timeout killed every single run of my first workflow — this was the single biggest
  outage I had.
- **Apps Script serialises concurrent executions.** Two consumers hitting it at the same
  moment queue behind each other and make each other slower. Poll it from one place and fan
  out internally rather than having several jobs call it independently.
- **Polling every 15–60 minutes is plenty.** Draws land a few times a week, not a few times
  an hour. The response is cached for 30 minutes anyway, so polling faster only burns quota.
- **Verify `statusCode` / parse success before trusting the body.** Apps Script occasionally
  returns a transient 404 or an HTML error page. I once declared the endpoint dead on the
  strength of one such 404 and told the user to redeploy — it was fine thirty seconds later.
  Treat a single bad response as transient and retry; only alert after repeated failures.
- **If you scrape it through a caching proxy or a scraping API, add a cache-busting query
  parameter**, e.g. `?cb=<timestamp>`, or you will read a stale copy and think nothing changed.

---

## 2. The JSON contract

```jsonc
{
  "updatedAt": "2026-09-21T14:03:11.204Z",   // ISO, generation time, NOT draw time
  "rounds": [                                 // Express Entry, newest first, max 40
    {
      "drawNumber":   "361",
      "drawDate":     "2026-09-16",           // ISO-ish, sortable
      "drawDateFull": "September 16, 2026",   // display form
      "drawName":     "Canadian Experience Class",
      "drawSize":     "3,000",                // STRING, comma-grouped
      "drawCRS":      "521"                   // STRING
    }
  ],
  "pnpDraws": {
    "ON":  { /* province object */ },         // Ontario (OINP)
    "BC":  { /* province object */ },         // BC PNP — Skills Immigration
    "BCE": { /* province object */ },         // BC PNP — Entrepreneur (separate table!)
    "AB":  { /* province object */ },         // Alberta (AAIP)      — no parser yet
    "SK":  { /* province object */ },         // Saskatchewan (SINP) — no parser yet
    "MB":  { /* province object */ },         // Manitoba (MPNP)
    "NS":  { /* province object */ },         // Nova Scotia         — no parser yet
    "NB":  { /* province object */ },         // New Brunswick       — no parser yet
    "PE":  { /* province object */ },         // Prince Edward Island— no parser yet
    "NL":  { /* province object */ }          // Newfoundland        — no parser yet
  }
}
```

Province object:

```jsonc
{
  "source": "British Columbia (BCPNP)",
  "url":    "https://www.welcomebc.ca/...",   // the human page — cite this, don't re-scrape it
  "stale":  false,                            // true = empty, undated, or newest > 60 days old
  "draws": [
    {
      "date":        "August 20, 2026",       // display form, as the province printed it
      "dateISO":     "2026-08-20",            // "" when unparseable
      "invitations": "337",                   // STRING. May be "<5" or "N/A". See §4.
      "stream":      "Skilled Worker — Tech",
      "score":       "108",                   // "" when the province published none
      "factors":     "Minimum wage of $55.00/hour and $110,000/year"  // BC only, often ""
    }
  ]
}
```

### Contract rules — these are load-bearing

- **Every numeric field is a STRING.** Do not coerce. `invitations` can legitimately be
  `"<5"` (BC's privacy suppression, meaning 1–4) or `"N/A"`. `Number("<5")` is `NaN`, and
  anything that turns `NaN` into `0` publishes "0 invitations", which is a *wrong fact*
  rather than a gap.
- **You cannot sum a column containing `"<5"`.** If you need a total across rows and any row
  is suppressed, render it as `"500+"` or omit the total — never present a partial sum as a total.
- **`score: ""` is meaningful and common.** It means the province published no minimum score
  for that draw, not that the score was zero. For BC, `factors` frequently carries the real
  eligibility bar instead (a wage threshold). See §4.
- **`updatedAt` is when the scraper ran, not when a draw happened.** If you surface a
  "last updated" timestamp to users, derive it from the newest `dateISO` you actually show.
  Using the run clock makes the page look like it changes hourly when nothing changed, which
  confused me for a full day in the other project.
- **`stale: true` means do not publish this province.** Hide it, or label it "needs review".
- **An empty `draws: []` is indistinguishable from a genuinely quiet province.** Do not alert
  on it in isolation — alert when a province that *used to* return draws now returns none.
- **`BC` and `BCE` come from the same page but are different programs.** Never merge them.
- **`AB`, `SK`, `NS`, `NB`, `PE`, `NL` currently return `[]` by design.** Parsers were never
  written. If you need Alberta or Saskatchewan, that is new work — see §6.
- **Ontario's `stream` field often contains a prose fragment, not a stream name** (e.g.
  "the ... stream and who have"). In my other system I filter these out before display:
  reject strings longer than 48 chars, or starting with "the"/"to", or containing
  "invitation", "candidate", "who may qualify". Prefer omitting the stream to printing prose.

---

## 3. Deduplication — how to know what is new

The feed always returns the last ~40 rounds and last ~40 draws per province. Every poll sees
the same historical rows. You must keep your own record of what you have already acted on.

Three dedup bugs burned me; avoid all three:

1. **Key on `province + dateISO` (a prefix), not on the whole row.** I once changed my key
   format, which made already-processed rows stop matching, and the system re-announced a
   six-day-old draw to a live public channel. An announced date must stay announced
   *regardless of how the rest of the key is composed*.
2. **Apply any "max N per run" cap AFTER the dedup filter, never before.** Capping first means
   every item behind the newest one is permanently unreachable — it is always filtered out by
   the cap before it is ever checked for newness.
3. **Add an age ceiling as a second lock.** Ignore anything with `dateISO` older than ~5 days,
   even if it is unseen. If your state store is ever lost, this is what stops a backfill
   avalanche into a public channel.

Also: if your dedup uses a database-lookup step that only emits *matched* rows (n8n's Data
Table `get` node behaves this way), brand-new draws produce no output item at all and get
silently dropped — the exact opposite of what you want. Fetch all known keys and filter in
code instead.

---

## 4. Source-by-source notes

### IRCC Express Entry — the only real feed
```
https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json
```
Official JSON, `{ rounds: [...] }`, newest first. Fields used: `drawNumber`, `drawDate`,
`drawDateFull`, `drawName` (falls back to `drawText`), `drawSize`, `drawCRS` (falls back to
`drawCutOff`). ~435 rounds, ~80 KB — the endpoint trims to the newest 40. You may fetch this
one directly if you only need Express Entry; there is no scraping risk here.

### British Columbia — `welcomebc.ca` — the hardest one
The page carries **three** tables and only two are draws:

| # | Table | Columns |
|---|---|---|
| 1 | Skills Immigration | Date \| ITA type \| Selection factors \| Min score \| Invitations |
| 2 | Registration pool  | Score range \| Number of registrations — **skip this one** |
| 3 | Entrepreneur       | Date \| Stream \| Minimum Score \| Number of Invitations |

Tables are located **by header text**, not by position, so BC reordering them cannot silently
swap the data.

Three traps:

- **The date cell uses `rowspan`.** Continuation rows have *no* date cell, so every column
  shifts left by one. You must detect continuation by **cell count**, not by the cell being
  blank. The previous parser got this wrong and reported April while the page showed August.
- **`&lt;` must be decoded before `&amp;`.** BC prints small counts as `&lt;5`. Left encoded,
  the value failed the is-this-a-count test and **silently dropped seven real draws**.
  Decoding `&amp;` first would turn `&amp;lt;` into a stray `<`.
- **BC publishes a "Selection factors" column, and for wage-based streams that is the real
  eligibility bar** — and **it changes every single draw** ($55/$110k on 20 Aug, $58/$115k on
  16 Jul, $62/$125k on 18 Jun). I nearly hardcoded a per-stream criteria lookup table; it
  would have published a stale threshold for months under an RCIC's name. **Never build a
  static criteria table. Pass `factors` through from the source, verbatim.**

### Manitoba — `immigratemanitoba.com/draws/`
Not a table at all — a WordPress archive of one post per EOI draw, each containing several
sub-selections with their own counts.

- **The figure that matters is the total**, stated once as
  `"Of the N Letters of Advice to Apply issued in this draw"`.
- **The total is split across tags**: `<strong>76</strong><strong>6</strong>` is **766, not 76**.
  A tag-stripper that substitutes a space produces `"76 6"` and reads 76 — out by a factor of
  ten. Inline formatting tags (`strong b em i span u`) must be removed with an **empty**
  replacement *before* general tag stripping. Regression check: draw #276 must read **766**
  (74 + 605 + 17 + 70).
- **The archive carries no dates.** The post URL gives only year and month; the exact date
  lives in each post's `<meta property="article:published_time">`, costing one extra fetch per
  draw. That is why only the newest 6 are fetched.
- **A draw can state several "lowest-ranked score" values**, one per sub-selection. When there
  is more than one there is no single honest number, so the parser publishes **none** (`score: ""`).

### Ontario — `ontario.ca/page/...oinp-updates`
Prose, matched on
`"On <Month D, YYYY>, we issued <N> invitations to apply ..."`.
Announcements **without** a number are not draws and must not be counted as one. `stream`
comes out as a prose fragment — filter as described in §2.

### Alberta / Saskatchewan / Atlantic — no parsers
`noParserYet_()` returns `[]` deliberately. They are flagged stale and hidden.

---

## 5. Full scraper source — yours to deploy or fork

If you want your own copy (own quota, own deploy, free to modify), create a Google Apps Script
project and paste this file whole. It is the exact production source.

**Deployment, and the one mistake that orphans everything:**
1. script.google.com → New project.
2. Paste the file, replacing the placeholder.
3. Run `testEndpoint()` from the editor and **read the log before deploying**. Confirm BC shows
   its newest table date and Manitoba's newest total matches the site.
4. Deploy → New deployment → gear → Web app. *Execute as:* **Me**. *Who has access:* **Anyone**.
   Authorise (Advanced → Go to project → Allow).
5. Copy the `/exec` URL.

> **After any later edit: Deploy → Manage deployments → pencil → New version → Deploy.**
> Choosing "New deployment" mints a *different* URL and silently orphans every consumer still
> pointing at the old one. In my other project the live workflow ran the *old* code for days
> because of this. Same class of mistake: if your platform distinguishes a draft from a
> published version, remember that saving is not publishing.

Testing note: **running a parser function on its own proves the parser, not the endpoint.**
Manitoba returned zero draws for a day because `doGet` was still wired to `noParserYet_` even
though `getMPNP_()` worked perfectly when called directly. Always verify through `doGet`.

```javascript
/**
 * Canada Draws — unified endpoint.
 *
 * Serves ONE JSON payload describing every draw source:
 *   { updatedAt, rounds: [...], pnpDraws: { ON, BC, BCE, AB, SK, MB, NS, NB, PE, NL } }
 *
 * WHY PARSERS RETURN NOTHING RATHER THAN GUESSING
 * A generic "find a date near a number" parser will happily invent draws out of
 * unrelated page furniture. Published under an RCIC's name, a confidently wrong
 * cut-off score is worse than an honest gap — so a province with no real parser
 * returns [] and is flagged stale, which the website renders as "needs review"
 * or hides entirely. Add parsers deliberately; never fall back to guessing.
 */

var STALE_DAYS = 60;
var EE_JSON_URL = 'https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json';
var BC_URL = 'https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program/invitations-to-apply';
var ON_URL = 'https://www.ontario.ca/page/2026-ontario-immigrant-nominee-program-updates';
var AB_URL = 'https://www.alberta.ca/alberta-advantage-immigration-program-express-entry-stream';

function doGet(e) {
  var payload = {
    updatedAt: new Date().toISOString(),
    rounds: cachedRounds_(),
    pnpDraws: {
      ON:  province_('Ontario (OINP)', ON_URL, getOINP_),
      BC:  province_('British Columbia (BCPNP)', BC_URL, getBCSkills_),
      BCE: province_('British Columbia — Entrepreneur', BC_URL, getBCEntrepreneur_),
      AB:  province_('Alberta (AAIP)', AB_URL, noParserYet_),
      SK:  province_('Saskatchewan (SINP)', 'https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program', noParserYet_),
      MB:  province_('Manitoba (MPNP)', MB_URL, getMPNP_),
      NS:  province_('Nova Scotia (NSNP)', 'https://liveinnovascotia.com/nova-scotia-nominee-program', noParserYet_),
      NB:  province_('New Brunswick (NBPNP)', 'https://www.welcomenb.ca/content/wel-bien/en/immigrating_and_settling/content/HowToImmigrate/NBProvincialNomineeProgram.html', noParserYet_),
      PE:  province_('Prince Edward Island', 'https://www.princeedwardisland.ca/en/information/office-of-immigration/expression-of-interest-draws', noParserYet_),
      NL:  province_('Newfoundland & Labrador', 'https://www.gov.nl.ca/immigration/immigrating-to-newfoundland-and-labrador/provincial-nominee-program/', noParserYet_)
    }
  };
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// A province with no parser yet. Honest emptiness, not invented data.
function noParserYet_() { return []; }

// ── Response cache ──────────────────────────────────────────────────────────
// Every call re-scraped six government sites in series, so one request took
// anywhere from 7 to 300+ seconds depending on how slow the slowest site
// happened to be that minute. n8n gave up at 60s until the timeout was raised,
// and Apps Script serialises concurrent executions, so two consumers arriving
// together made each other worse.
//
// FRESH_SECONDS — how long a parsed result is reused without re-fetching.
//   Draws are announced a few times a week; half an hour of staleness costs
//   nothing and makes almost every call return instantly.
// GOOD_SECONDS — how long the last SUCCESSFUL result is kept as a fallback.
//   21600 is the CacheService maximum.
var FRESH_SECONDS = 1800;
var GOOD_SECONDS = 21600;

function cacheKey_(prefix, name) {
  return prefix + ':' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(name)));
}

// One broken province must never take down the whole endpoint.
function province_(sourceName, url, fn) {
  var cache = CacheService.getScriptCache();
  var freshKey = cacheKey_('p-fresh', sourceName);
  var goodKey = cacheKey_('p-good', sourceName);

  var fresh = cache.get(freshKey);
  if (fresh) { try { return JSON.parse(fresh); } catch (e) {} }

  var draws = [];
  var failed = false;
  try { draws = fn() || []; }
  catch (err) { Logger.log(sourceName + ' failed: ' + err); failed = true; }

  // A source that has published before and now returns nothing means the fetch
  // or the parser broke, not that the province stopped drawing. Serving the
  // last good copy beats serving an empty province, which downstream reads as
  // "hide this card" and "nothing to post" — indistinguishable from a genuinely
  // quiet province, which is how Manitoba stayed invisible for a day.
  if (failed || !draws.length) {
    var lastGood = cache.get(goodKey);
    if (lastGood) { try { return JSON.parse(lastGood); } catch (e) {} }
  }

  var out = { source: sourceName, url: url, stale: isStale_(draws), draws: draws };
  var json = JSON.stringify(out);
  try {
    cache.put(freshKey, json, FRESH_SECONDS);
    if (draws.length) cache.put(goodKey, json, GOOD_SECONDS);
  } catch (e) {
    // Values over 100KB are rejected. A province result is far smaller, but a
    // failed put must never break the response.
    Logger.log('cache put failed for ' + sourceName + ': ' + e);
  }
  return out;
}

// Express Entry, cached the same way.
//
// EE_KEEP trims the history to the newest 40 rounds. The full list is 435
// entries and roughly 80KB — most of the response body, for data no consumer
// reads. Trimming also keeps the cached value clear of the 100KB ceiling.
var EE_KEEP = 40;

function cachedRounds_() {
  var cache = CacheService.getScriptCache();
  var fresh = cache.get('ee-fresh');
  if (fresh) { try { return JSON.parse(fresh); } catch (e) {} }

  var rounds = safe_(getExpressEntryRounds_, []).slice(0, EE_KEEP);
  if (!rounds.length) {
    var lastGood = cache.get('ee-good');
    if (lastGood) { try { return JSON.parse(lastGood); } catch (e) {} }
  }

  var json = JSON.stringify(rounds);
  try {
    cache.put('ee-fresh', json, FRESH_SECONDS);
    if (rounds.length) cache.put('ee-good', json, GOOD_SECONDS);
  } catch (e) {
    Logger.log('cache put failed for rounds: ' + e);
  }
  return rounds;
}

// Stale when: nothing parsed, no parseable date, or the newest is too old.
function isStale_(draws) {
  if (!draws || !draws.length) return true;
  var newest = 0;
  for (var i = 0; i < draws.length; i++) {
    var t = Date.parse(draws[i].dateISO || draws[i].date || '');
    if (!isNaN(t) && t > newest) newest = t;
  }
  if (!newest) return true;
  return (Date.now() - newest) / 86400000 > STALE_DAYS;
}

function safe_(fn, fallback) {
  try { return fn() || fallback; }
  catch (err) { Logger.log(String(fn).slice(0, 40) + ' failed: ' + err); return fallback; }
}

function fetchText_(url) {
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (DrawsBot)' }
  });
  if (res.getResponseCode() >= 400) throw new Error('HTTP ' + res.getResponseCode() + ' ' + url);
  return res.getContentText();
}

function stripTags_(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // &lt; matters: BC publishes small counts as "<5". Left encoded, the value
    // failed the is-this-a-count check and silently dropped seven real draws
    // across the two tables. Decode before &amp; so "&amp;lt;" cannot
    // double-decode into a stray "<".
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function toISO_(monthDayYear) {
  var t = Date.parse(monthDayYear);
  if (isNaN(t)) return '';
  var d = new Date(t);
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function dedupe_(rows) {
  var seen = {}, out = [];
  rows.forEach(function (r) {
    var k = (r.date || '') + '|' + (r.stream || '') + '|' + (r.invitations || '');
    if (!seen[k]) { seen[k] = true; out.push(r); }
  });
  return out;
}

// ===================== EXPRESS ENTRY (official JSON) =====================
function getExpressEntryRounds_() {
  var json = JSON.parse(fetchText_(EE_JSON_URL));
  return (json.rounds || []).map(function (r) {
    return {
      drawNumber: r.drawNumber,
      drawDate: r.drawDate,
      drawDateFull: r.drawDateFull,
      drawName: r.drawName || r.drawText || '',
      drawSize: r.drawSize,
      drawCRS: r.drawCRS || r.drawCutOff || ''
    };
  });
}

// ============================== ONTARIO ==============================
// "On <Month D, YYYY>, we issued <N> invitations to apply to candidates who
// may qualify under the <stream>..."  Announcements without a number are not
// draws and must not be counted as one.
function getOINP_() {
  var text = stripTags_(fetchText_(ON_URL));
  var out = [];
  var re = /On\s+([A-Z][a-z]+ \d{1,2},\s*20\d{2}),\s*we issued\s*([\d,]+)\s*invitations? to apply\s*(?:to candidates who may qualify (?:under|for)\s+)?([^.]{0,90})/gi;
  var m;
  while ((m = re.exec(text)) !== null && out.length < 20) {
    var date = m[1].trim();
    out.push({
      date: date,
      dateISO: toISO_(date),
      invitations: m[2].replace(/,/g, ''),
      stream: stripTags_(m[3]).replace(/\s{2,}/g, ' ').trim().slice(0, 90),
      score: scoreNear_(text, m.index)
    });
  }
  return dedupe_(out);
}

function scoreNear_(text, idx) {
  var w = text.substr(idx, 240);
  var m = w.match(/(?:score of|score|ranking)[^\d]{0,15}(\d{2,4})/i);
  return m ? m[1] : '';
}

// ========================== BRITISH COLUMBIA ==========================
// The page carries THREE tables and only two are draws:
//   1. Skills Immigration  — Date | ITA type | Selection factors | Min score | Invitations
//   2. Registration pool   — Score range | Number of registrations   <- skipped
//   3. Entrepreneur        — Date | Stream | Minimum Score | Number of Invitations
// Tables are matched on header text, so reordering them cannot swap the data.
//
// The date cell uses rowspan, so continuation rows have NO date cell and every
// column shifts left by one. Continuation is therefore detected by cell COUNT,
// not by the cell being blank — that distinction is why the previous parser
// reported April while the page showed August.
var BC_DATE_RE = /^([A-Z][a-z]+ \d{1,2},\s*20\d{2})/;

function bcTables_(html) {
  var out = [];
  var re = /<table[\s\S]*?<\/table>/gi;
  var m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

function bcRows_(tableHtml) {
  var rows = [];
  var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var tr;
  while ((tr = trRe.exec(tableHtml)) !== null) {
    var cells = [];
    var cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    var c;
    while ((c = cellRe.exec(tr[1])) !== null) cells.push(stripTags_(c[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function bcFindTable_(html, mustContain) {
  var tables = bcTables_(html);
  for (var i = 0; i < tables.length; i++) {
    var rows = bcRows_(tables[i]);
    if (!rows.length) continue;
    var head = rows[0].join(' | ').toLowerCase();
    var ok = true;
    for (var j = 0; j < mustContain.length; j++) {
      if (head.indexOf(mustContain[j]) === -1) { ok = false; break; }
    }
    if (ok) return rows.slice(1);
  }
  return null;
}

// "<5" and "N/A" are published literally. Keep them as text — coercing to a
// number would print 0 invitations, which is a wrong fact rather than a gap.
function bcLooksLikeCount_(v) { return /^(<\s*\d|\d|N\/A)/i.test(String(v || '').trim()); }
function bcScore_(v) { var s = String(v || '').trim(); return /^\d+$/.test(s) ? s : ''; }

function getBCSkills_() {
  var html = fetchText_(BC_URL);
  var rows = bcFindTable_(html, ['ita type', 'invitations']);
  if (!rows) return [];
  var out = [], curDate = '';
  for (var i = 0; i < rows.length && out.length < 40; i++) {
    var cells = rows[i].slice();
    var dm = (cells[0] || '').match(BC_DATE_RE);
    if (dm) { curDate = dm[1]; cells = cells.slice(1); }
    // Rows of 1-2 cells are an extra "selection factors" line for a draw whose
    // other columns are rowspanned. They carry no new numbers.
    if (!curDate || cells.length < 4) continue;
    if (!bcLooksLikeCount_(cells[3])) continue;
    out.push({
      date: curDate,
      dateISO: toISO_(curDate),
      invitations: String(cells[3]).replace(/,/g, '').trim(),
      stream: String(cells[0] || '').slice(0, 60),
      score: bcScore_(cells[2]),
      factors: String(cells[1] || '').slice(0, 120)
    });
  }
  return dedupe_(out);
}

function getBCEntrepreneur_() {
  var html = fetchText_(BC_URL);
  var rows = bcFindTable_(html, ['stream', 'minimum score']);
  if (!rows) return [];
  var out = [], curDate = '';
  for (var i = 0; i < rows.length && out.length < 40; i++) {
    var cells = rows[i].slice();
    var dm = (cells[0] || '').match(BC_DATE_RE);
    if (dm) { curDate = dm[1]; cells = cells.slice(1); }
    if (!curDate || cells.length < 3) continue;
    if (!bcLooksLikeCount_(cells[2])) continue;
    out.push({
      date: curDate,
      dateISO: toISO_(curDate),
      invitations: String(cells[2]).replace(/,/g, '').trim(),
      stream: String(cells[0] || '').slice(0, 60),
      score: bcScore_(cells[1]),
      factors: ''
    });
  }
  return dedupe_(out);
}

// ============================== MANITOBA ==============================
// Manitoba publishes nothing like a table. /draws/ is a WordPress archive of
// posts, one per EOI draw, and each draw contains several sub-selections
// (occupation-specific, Francophone, Skilled Worker Stream, IES...) each with
// its own count. The figure that matters is the total, stated once as
// "Of the N Letters of Advice to Apply issued in this draw".
//
// TWO TRAPS, both of which produce a confidently wrong number:
//
// 1. The total is split across tags: <strong>76</strong><strong>6</strong> is
//    766, not 76. stripTags_ replaces every tag with a space, which turns that
//    into "76 6" and reads 76 — out by a factor of ten. So inline formatting
//    tags are removed with an EMPTY replacement first. Check against draw #276:
//    74 + 605 + 17 + 70 = 766.
//
// 2. The archive carries no dates, and the post URL gives only year and month.
//    The exact date lives in each post's <meta property="article:published_time">,
//    so each draw costs one extra fetch. MB_MAX_DRAWS bounds that.
var MB_URL = 'https://immigratemanitoba.com/draws/';
var MB_MAX_DRAWS = 6;
var MB_MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];

// Inline tags vanish with no separator; everything else strips normally.
function mbText_(html) {
  return stripTags_(String(html).replace(/<\/?(strong|b|em|i|span|u)[^>]*>/gi, ''));
}

function mbDisplayDate_(iso) {
  var t = Date.parse(iso);
  if (isNaN(t)) return '';
  var d = new Date(t);
  return MB_MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

function getMPNP_() {
  var html = fetchText_(MB_URL);
  var re = /https:\/\/immigratemanitoba\.com\/(\d{4})\/(\d{2})\/expression-of-interest-draw-(\d+)\//gi;
  var seen = {}, links = [], m;
  while ((m = re.exec(html)) !== null) {
    var n = m[3];
    if (seen[n]) continue;
    seen[n] = true;
    links.push({ url: m[0], number: n });
    if (links.length >= MB_MAX_DRAWS) break;
  }

  var out = [];
  for (var i = 0; i < links.length; i++) {
    // One unreadable draw must not lose the others.
    try {
      var row = mbParseDraw_(links[i]);
      if (row) out.push(row);
    } catch (err) {
      Logger.log('MB draw ' + links[i].number + ' failed: ' + err);
    }
  }
  out.sort(function (a, b) { return String(b.dateISO).localeCompare(String(a.dateISO)); });
  return dedupe_(out);
}

function mbParseDraw_(link) {
  var page = fetchText_(link.url);

  var pm = page.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  var iso = pm ? pm[1] : '';

  var text = mbText_(page);
  var tm = text.match(/Of the\s+([\d,]+)\s+Letters of Advice to Apply issued in this draw/i);
  if (!tm) return null;  // no stated total — report nothing rather than a guess

  // A draw can state several lowest-ranked scores, one per sub-selection. With
  // more than one there is no single honest number to publish, so publish none.
  var scores = [], sre = /Ranking score of lowest-ranked candidate invited:?\s*([\d,]+)/gi, sm;
  while ((sm = sre.exec(text)) !== null) scores.push(sm[1].replace(/,/g, ''));

  return {
    date: mbDisplayDate_(iso),
    dateISO: toISO_(iso),
    invitations: tm[1].replace(/,/g, ''),
    stream: 'EOI Draw #' + link.number,
    score: scores.length === 1 ? scores[0] : '',
    factors: ''
  };
}

// ============================== TESTING ==============================
// Run these from the editor and read Executions/Logs BEFORE deploying.
// NOTE: testing a parser function on its own proves the PARSER, not the
// ENDPOINT — Manitoba returned zero for a day because doGet was still wired to
// noParserYet_ while getMPNP_() worked fine when called directly.
function testEndpoint() {
  var p = JSON.parse(doGet().getContent());
  Logger.log('rounds: ' + p.rounds.length + ', newest ' + (p.rounds[0] ? p.rounds[0].drawDateFull : 'NONE'));
  Object.keys(p.pnpDraws).forEach(function (k) {
    var v = p.pnpDraws[k];
    Logger.log(k + ': ' + v.draws.length + ' draws, stale=' + v.stale +
      ', newest ' + (v.draws[0] ? v.draws[0].date : 'NONE'));
  });
}

function testBC() {
  var s = getBCSkills_(), e = getBCEntrepreneur_();
  Logger.log('SKILLS ' + s.length + ' newest ' + (s[0] ? s[0].date : 'NONE'));
  Logger.log(JSON.stringify(s.slice(0, 6), null, 2));
  Logger.log('ENTREPRENEUR ' + e.length + ' newest ' + (e[0] ? e[0].date : 'NONE'));
  Logger.log(JSON.stringify(e.slice(0, 4), null, 2));
}

function testON() { Logger.log(JSON.stringify(getOINP_().slice(0, 6), null, 2)); }

// Run this and check the totals against immigratemanitoba.com/draws/ BEFORE
// deploying. Draw #276 must read 766, not 76.
function testMB() {
  var rows = getMPNP_();
  Logger.log('MANITOBA ' + rows.length + ' draws, newest ' + (rows[0] ? rows[0].date : 'NONE'));
  Logger.log(JSON.stringify(rows, null, 2));
}
```

---

## 6. Adding a province (Alberta, Saskatchewan, …)

The pattern is fixed. Do it in this order and do not skip step 1 or step 5:

1. **Read the actual page first** and find the field the province already publishes. Do not
   invent structure. (Checking BC's page is what revealed the "Selection factors" column and
   saved me from hardcoding a wage table that changes every draw.)
2. Write `getXX_()` returning `[{ date, dateISO, invitations, stream, score, factors }]`,
   newest first, all strings.
3. Anchor on **text the province itself printed** (a header, a fixed sentence), never on
   positional guesses like "third table" or "the number after the date".
4. Return `null`/skip a row whose key value you cannot read. Never substitute a default.
5. **Wire it into `doGet`** — replace `noParserYet_` for that province code.
6. Write a `testXX()` and verify at least one number **by hand against the live page**.
7. Run `testEndpoint()`, confirm the province's count and newest date, *then* deploy a
   **New version**.

---

## 7. Presentation rules (only if your automation renders text or images)

These cost me real published mistakes. They apply to any localised or right-to-left output —
in my case Persian/Farsi.

- **`"<5"` inside a right-to-left line renders as `"5>"`** — the exact opposite meaning
  ("more than five"). Convert it to words in RTL text (e.g. «کمتر از ۵»). Keep the raw `<5`
  only where the surrounding font/run is LTR.
- **`<5` breaks HTML parse modes** (Telegram HTML, for one). Escape every interpolated value.
- **In SVG, `text-anchor="start"` and `"end"` resolve to *opposite visual edges* for RTL vs
  LTR content.** For a table where a header is LTR and the data is RTL (or vice versa), use
  `text-anchor="middle"` with the **same x** for header and data — it is the only
  direction-agnostic option, and it is what finally aligned my columns.
- **Never translate eligibility criteria unless an exact pattern matched.** Pass source text
  through verbatim otherwise. Regex-matching a known wage sentence is fine; paraphrasing is not.
- If a date has **several rows sharing one stream name**, that is usually one draw with several
  selection routes — render it as one draw with multiple routes, not as duplicate draws.

---

## 8. Suggested shape for my new automation

```
schedule (every 15–60 min)
  → GET the endpoint   [timeout 300 s, retry 3×, treat one bad response as transient]
  → flatten  rounds[] + pnpDraws.*.draws[]  into a single list of candidate items
  → drop provinces where stale === true
  → drop items older than 5 days (dateISO)
  → drop items whose "<province>::<dateISO>" prefix is already in my state store
  → RECORD the key FIRST, before acting          ← so a mid-flight crash cannot double-post
  → …my new automation's actual work…
  → collect per-branch outcomes → alert on any failure
```

Record-before-act is deliberate: the cost of missing one item is a gap; the cost of
double-acting on a public channel is a visible, embarrassing error.

---

## What I want from you now

Confirm you have read the contract and the traps, then help me build my new automation on top
of this endpoint. Ask me what the automation does before writing any code. Do not write new
scrapers for IRCC or the provinces unless we agree a province needs one that does not exist yet
(Alberta and Saskatchewan are the open ones), and if we do, follow §6 exactly.

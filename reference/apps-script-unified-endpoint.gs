/**
 * Canada Draws — unified endpoint.
 *
 * Serves ONE JSON payload describing every draw source:
 *   { updatedAt, rounds: [...], pnpDraws: { ON, BC, BCE, AB, SK, MB, NS, NB, PE, NL } }
 *
 * This replaces the original endpoint, whose source was lost — it existed only
 * as a deployed URL nobody could open. Keep this file in the repo so the next
 * time a province redesigns its page, the parser is editable instead of a black
 * box that has to be probed from the outside.
 *
 * WHY PARSERS RETURN NOTHING RATHER THAN GUESSING
 * A generic "find a date near a number" parser will happily invent draws out of
 * unrelated page furniture. Published under an RCIC's name, a confidently wrong
 * cut-off score is worse than an honest gap — so a province with no real parser
 * returns [] and is flagged stale, which the website renders as "needs review"
 * or hides entirely. Add parsers deliberately; never fall back to guessing.
 *
 * SETUP
 *   1. script.google.com -> New project. Name it "Canada Draws — unified endpoint".
 *   2. Delete the placeholder, paste this whole file.
 *   3. Run testEndpoint() from the editor. Read the log. Confirm BC shows its
 *      newest table date before going further.
 *   4. Deploy -> New deployment -> gear -> Web app
 *        Execute as:     Me
 *        Who has access: Anyone
 *      Deploy, authorise (Advanced -> Go to project -> Allow).
 *   5. Copy the /exec URL and send it over — two n8n workflows point at it.
 *
 * AFTER ANY EDIT: Deploy -> Manage deployments -> pencil -> New version -> Deploy.
 * "New deployment" would mint a different URL and silently orphan the workflows.
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
// reads: the website page shows 15 and the social workflow reads 1. Trimming
// also keeps the cached value clear of the 100KB CacheService ceiling.
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
  catch (err) { Logger.log(String(fn) .slice(0, 40) + ' failed: ' + err); return fallback; }
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

// ============================== TESTING ==============================
// Run these from the editor and read Executions/Logs BEFORE deploying.
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

// Run this and check the totals against immigratemanitoba.com/draws/ BEFORE
// deploying. Draw #276 must read 766, not 76.
function testMB() {
  var rows = getMPNP_();
  Logger.log('MANITOBA ' + rows.length + ' draws, newest ' + (rows[0] ? rows[0].date : 'NONE'));
  Logger.log(JSON.stringify(rows, null, 2));
}

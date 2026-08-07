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
    rounds: safe_(getExpressEntryRounds_, []),
    pnpDraws: {
      ON:  province_('Ontario (OINP)', ON_URL, getOINP_),
      BC:  province_('British Columbia (BCPNP)', BC_URL, getBCSkills_),
      BCE: province_('British Columbia — Entrepreneur', BC_URL, getBCEntrepreneur_),
      AB:  province_('Alberta (AAIP)', AB_URL, noParserYet_),
      SK:  province_('Saskatchewan (SINP)', 'https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program', noParserYet_),
      MB:  province_('Manitoba (MPNP)', 'https://immigratemanitoba.com/notices/', noParserYet_),
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

// One broken province must never take down the whole endpoint.
function province_(sourceName, url, fn) {
  var draws = [];
  try { draws = fn() || []; }
  catch (err) { Logger.log(sourceName + ' failed: ' + err); draws = []; }
  return { source: sourceName, url: url, stale: isStale_(draws), draws: draws };
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

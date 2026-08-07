/**
 * BC PNP parsers for the unified draws endpoint.
 *
 * Replaces getBCPNP_() in the Apps Script behind DRAWS_UNIFIED_URL.
 *
 * WHY THE OLD ONE FAILED
 * The old parser read prose paragraphs only, so it stopped seeing draws when BC
 * moved to tables — it reported April 22 while the page showed August 6. The
 * version in the spec was meant to fix that by treating a *blank* first cell as
 * "same date as the row above". But BC does not leave the cell blank: it uses
 * rowspan, so continuation rows have no date cell at all and every column is
 * shifted by one. Detecting continuation by cell COUNT rather than by blankness
 * is what makes this work.
 *
 * WHAT THE PAGE ACTUALLY CONTAINS — three tables, and only two are draws:
 *   1. Skills Immigration  — Date | ITA type | Selection factors | Min score | Invitations
 *   2. Registration pool   — Score range | Number of registrations   <- NOT draws, skipped
 *   3. Entrepreneur        — Date | Stream | Minimum Score | Number of Invitations
 * Tables are identified by their header text, not by position, so BC reordering
 * them does not silently swap the data.
 *
 * INSTALL
 *   1. Open the Apps Script behind the unified endpoint.
 *   2. Delete the old getBCPNP_() function.
 *   3. Paste everything below.
 *   4. In doGet, replace the BC line and add the entrepreneur one:
 *        BC:  province_('British Columbia (BCPNP)', BC_URL, getBCSkills_),
 *        BCE: province_('British Columbia — Entrepreneur', BC_URL, getBCEntrepreneur_),
 *   5. Run testBC() from the editor and read the log BEFORE deploying.
 *   6. Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy.
 *      Use "Manage deployments", not "New deployment", or the /exec URL changes.
 */

var BC_URL = 'https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program/invitations-to-apply';

// A row starts a new draw when its first cell is a date. Otherwise it continues
// the date above it (rowspan), and carries one less cell.
var BC_DATE_RE = /^([A-Z][a-z]+ \d{1,2},\s*20\d{2})/;

/** Every <table> on the page, in document order. */
function bcTables_(html) {
  var out = [];
  var re = /<table[\s\S]*?<\/table>/gi;
  var m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

/** One array of cell texts per <tr>, header row included. */
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

/** Find the table whose header contains all the given words. */
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

/** "<5" and "N/A" are real values on this page — keep them, never coerce. */
function bcLooksLikeCount_(v) {
  return /^(<\s*\d|\d|N\/A)/i.test(String(v || '').trim());
}

function bcScore_(v) {
  var s = String(v || '').trim();
  return /^\d+$/.test(s) ? s : '';
}

// ===================== SKILLS IMMIGRATION =====================
// Date | ITA type | Selection factors | Minimum score | Invitations
//   with date : 5 cells        continuation : 4 cells
//   a row of 1-2 cells is a second "selection factors" line for a draw whose
//   ITA type / score / invitations are themselves rowspanned — it carries no new
//   numbers, so it is skipped rather than counted as another draw.
function getBCSkills_() {
  var html = fetchText_(BC_URL);
  var rows = bcFindTable_(html, ['ita type', 'invitations']);
  if (!rows) return [];

  var out = [];
  var curDate = '';
  for (var i = 0; i < rows.length && out.length < 40; i++) {
    var cells = rows[i].slice();
    var dm = (cells[0] || '').match(BC_DATE_RE);
    if (dm) { curDate = dm[1]; cells = cells.slice(1); }
    if (!curDate || cells.length < 4) continue;

    var inv = cells[3];
    if (!bcLooksLikeCount_(inv)) continue;

    out.push({
      date: curDate,
      dateISO: toISO_(curDate),
      invitations: String(inv).replace(/,/g, '').trim(),
      stream: String(cells[0] || '').slice(0, 60),
      score: bcScore_(cells[2]),
      factors: String(cells[1] || '').slice(0, 120)
    });
  }
  return dedupe_(out);
}

// ===================== ENTREPRENEUR IMMIGRATION =====================
// Date | Stream | Minimum Score | Number of Invitations
//   with date : 4 cells        continuation : 3 cells
function getBCEntrepreneur_() {
  var html = fetchText_(BC_URL);
  var rows = bcFindTable_(html, ['stream', 'minimum score']);
  if (!rows) return [];

  var out = [];
  var curDate = '';
  for (var i = 0; i < rows.length && out.length < 40; i++) {
    var cells = rows[i].slice();
    var dm = (cells[0] || '').match(BC_DATE_RE);
    if (dm) { curDate = dm[1]; cells = cells.slice(1); }
    if (!curDate || cells.length < 3) continue;

    var inv = cells[2];
    if (!bcLooksLikeCount_(inv)) continue;

    out.push({
      date: curDate,
      dateISO: toISO_(curDate),
      invitations: String(inv).replace(/,/g, '').trim(),
      stream: String(cells[0] || '').slice(0, 60),
      score: bcScore_(cells[1]),
      factors: ''
    });
  }
  return dedupe_(out);
}

// ============================== TESTING ==============================
// Run this from the editor and read the log BEFORE deploying. Expect the
// newest Skills draw to be the date shown at the top of the live page.
function testBC() {
  var skills = getBCSkills_();
  var ent = getBCEntrepreneur_();
  Logger.log('SKILLS: ' + skills.length + ' draws, newest ' + (skills[0] ? skills[0].date : 'NONE'));
  Logger.log(JSON.stringify(skills.slice(0, 6), null, 2));
  Logger.log('ENTREPRENEUR: ' + ent.length + ' draws, newest ' + (ent[0] ? ent[0].date : 'NONE'));
  Logger.log(JSON.stringify(ent.slice(0, 4), null, 2));
}

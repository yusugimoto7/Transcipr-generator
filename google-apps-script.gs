/**
 * Sugimoto Topic Engine — Google Sheet history log + "seen" memory.
 *
 * SETUP (one time, ~5 minutes):
 *  1. Create a new Google Sheet (sheets.new). Name it anything.
 *  2. In the sheet: Extensions -> Apps Script.
 *  3. Delete whatever is there, paste ALL of this file in, and change
 *     SECRET below to your own long random string.
 *  4. Click Deploy -> New deployment -> gear icon -> Web app.
 *       - Description: anything
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Click Deploy, then Authorize access (you'll see a "Google hasn't
 *     verified this app" warning — it's YOUR own script, click Advanced ->
 *     "Go to <project> (unsafe)" -> Allow).
 *  5. Copy the Web app URL (ends in /exec).
 *  6. In Render -> your service -> Environment, add:
 *       SHEET_WEBHOOK_URL = that /exec URL
 *       SHEET_SECRET      = the same SECRET string you set below
 *     Save (it redeploys).
 *
 * After that, every topic the app shows is appended as a row here, and it
 * will never show the same article twice — on any device, forever.
 */

const SECRET = "CHANGE-ME-to-a-long-random-string";
const SHEET_NAME = "Seen";
const LIBRARY_SHEET = "Library";
const POSTED_DRAWS_SHEET = "PostedDraws";

function doGet(e) {
  if (!e || e.parameter.secret !== SECRET) return json({ error: "unauthorized" });

  // Library view: return every saved script/article record.
  if (e.parameter.type === "library") {
    const values = getLibrarySheet().getDataRange().getValues().slice(1);
    const items = [];
    values.forEach(function (r) {
      var raw = r[5];
      if (!raw) return;
      try { items.push(JSON.parse(raw)); } catch (_) {}
    });
    return json({ items: items });
  }

  // Government-page proxy for the draw auto-poster. Some hosts cannot reach
  // canada.ca / alberta.ca / ontario.ca directly, but Apps Script can. This
  // returns the page verbatim as plain text, so the app's parsers work
  // unchanged — just point DRAWS_ALBERTA_URL / DRAWS_OINP_ENT_URL / DRAWS_EE_URL
  // at this endpoint, e.g.
  //   https://script.google.com/.../exec?secret=YOURSECRET&proxy=alberta
  if (e.parameter.proxy) {
    var targets = {
      alberta: "https://www.alberta.ca/aaip-processing-information",
      oinp_ent:
        "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply",
      ee: "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json",
    };
    var target = targets[e.parameter.proxy];
    if (!target) return json({ error: "unknown proxy target" });
    try {
      var resp = UrlFetchApp.fetch(target, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { "User-Agent": "Mozilla/5.0 (DrawsBot)" },
      });
      if (resp.getResponseCode() >= 400) {
        return json({ error: "HTTP " + resp.getResponseCode() });
      }
      return ContentService.createTextOutput(resp.getContentText()).setMimeType(
        ContentService.MimeType.TEXT
      );
    } catch (err) {
      return json({ error: String(err) });
    }
  }

  // Draw dedup memory: return every dedup key already posted.
  if (e.parameter.type === "posted_draws") {
    const rows = getPostedDrawsSheet().getDataRange().getValues().slice(1);
    return json({
      keys: rows.map(function (r) { return String(r[1] || ""); }).filter(Boolean),
    });
  }

  const values = getSheet().getDataRange().getValues().slice(1); // skip header
  return json({
    urls: values.map((r) => String(r[3] || "")).filter(Boolean),
    titles: values.map((r) => String(r[2] || r[1] || "")).filter(Boolean),
  });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (_) {}
  if (body.secret !== SECRET) return json({ error: "unauthorized" });

  // Library save: append full script/article records (kept as JSON).
  if (body.library) {
    const lib = getLibrarySheet();
    body.library.forEach(function (it) {
      lib.appendRow([
        new Date(),
        it.id || "",
        it.type || "",
        it.title_fa || "",
        it.title_en || "",
        JSON.stringify(it),
      ]);
    });
    return json({ ok: true, added: body.library.length });
  }

  // Draw dedup memory: append the keys of draws that were just posted.
  if (body.posted_draws) {
    const sh = getPostedDrawsSheet();
    body.posted_draws.forEach(function (d) {
      sh.appendRow([
        new Date(),
        d.key || "",
        d.program || "",
        d.name || "",
        d.crs || "",
        d.size || "",
        d.channels || "",
      ]);
    });
    return json({ ok: true, added: body.posted_draws.length });
  }

  const sheet = getSheet();
  const rows = body.rows || [];
  rows.forEach(function (t) {
    sheet.appendRow([
      new Date(),
      t.title_fa || "",
      t.title_en || "",
      t.source_url || "",
      t.field || "",
      t.page || "",
      t.score || "",
    ]);
  });
  return json({ ok: true, added: rows.length });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["timestamp", "title_fa", "title_en", "source_url", "field", "page", "score"]);
  }
  return sh;
}

function getLibrarySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LIBRARY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LIBRARY_SHEET);
    sh.appendRow(["timestamp", "id", "type", "title_fa", "title_en", "json"]);
  }
  return sh;
}

function getPostedDrawsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(POSTED_DRAWS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(POSTED_DRAWS_SHEET);
    sh.appendRow([
      "timestamp",
      "key",
      "program",
      "draw_name",
      "draw_crs",
      "draw_size",
      "channels",
    ]);
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

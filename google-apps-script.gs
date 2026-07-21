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

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

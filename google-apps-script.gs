/**
 * Sugimoto Draws — duplicate-guard memory.
 *
 * Remembers which draws have already been published, so the same draw is never
 * posted twice. Nothing else lives here: this is deliberately separate from the
 * Topic Engine's sheet, so cleaning up one can never wipe the other.
 *
 * SETUP (about 3 minutes, once)
 *  1. Create a new Google Sheet — sheets.new. Name it "Sugimoto Draws memory".
 *  2. Extensions -> Apps Script.
 *  3. Delete whatever is there, paste this whole file in, and change SECRET
 *     below to a long random string of your own.
 *  4. Deploy -> New deployment -> gear icon -> Web app
 *       Execute as:     Me
 *       Who has access: Anyone
 *     Deploy, then Authorize access. Google warns that the app is unverified —
 *     it is your own script, so Advanced -> "Go to <project> (unsafe)" -> Allow.
 *  5. Copy the Web app URL (it ends in /exec).
 *  6. In the Draw automation service's environment, set:
 *       SHEET_WEBHOOK_URL = that /exec URL
 *       SHEET_SECRET      = the SECRET you set below
 *
 * AFTER EDITING THIS FILE you must redeploy for the change to go live:
 *   Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy.
 * Use "Manage deployments", not "New deployment", or the URL changes.
 *
 * To check which version is actually live, open <exec-url>?ping=1 — it needs no
 * secret and reveals nothing but the number below.
 */

const SECRET = "CHANGE-ME-to-a-long-random-string";
const SHEET_NAME = "PostedDraws";
const SCRIPT_VERSION = 1;

function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return json({ ok: true, version: SCRIPT_VERSION, service: "draws-memory" });
  }
  if (!e || e.parameter.secret !== SECRET) return json({ error: "unauthorized" });

  const rows = getSheet().getDataRange().getValues().slice(1);
  return json({
    keys: rows
      .map(function (r) {
        return String(r[1] || "");
      })
      .filter(Boolean),
  });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (_) {}
  if (body.secret !== SECRET) return json({ error: "unauthorized" });

  const entries = body.keys || [];
  if (!entries.length) return json({ ok: true, added: 0 });

  const sheet = getSheet();
  // Never store the same key twice, even if a run is retried.
  const existing = {};
  sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .forEach(function (r) {
      existing[String(r[1] || "")] = true;
    });

  var added = 0;
  entries.forEach(function (d) {
    const key = String(d.id || d.key || "");
    if (!key || existing[key]) return;
    sheet.appendRow([
      new Date(),
      key,
      d.program || "",
      d.title_fa || d.name || "",
      d.draw_crs || "",
      d.draw_size || "",
      d.channels || "",
    ]);
    existing[key] = true;
    added++;
  });

  return json({ ok: true, added: added });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow([
      "posted_at",
      "key",
      "program",
      "name",
      "min_score",
      "invitations",
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

// Run this from the editor to confirm the sheet reads and writes before
// deploying. Check Executions/Logs for the result.
function testRoundTrip() {
  const probe = "__editor_test__" + Date.now();
  doPost({ postData: { contents: JSON.stringify({ secret: SECRET, keys: [{ id: probe }] }) } });
  const back = JSON.parse(doGet({ parameter: { secret: SECRET } }).getContent());
  Logger.log(back.keys.indexOf(probe) >= 0 ? "round trip OK" : "WRITE DID NOT STICK");
}

// Optional Google Sheet backend for permanent, cross-device "seen" memory +
// a browsable history log. Backed by a Google Apps Script web app (see
// google-apps-script.gs and the README). If not configured, the app just uses
// the browser's localStorage as before.
//
// SHEET_WEBHOOK_URL = the Apps Script web-app /exec URL
// SHEET_SECRET      = a shared secret string, matching the one in the script

function sheetUrl() {
  return process.env.SHEET_WEBHOOK_URL;
}
function sheetSecret() {
  return process.env.SHEET_SECRET;
}

export function sheetEnabled() {
  return !!sheetUrl() && !!sheetSecret();
}

// Normalize a URL the same way the client does, so www / trailing-slash /
// query-string variants of the same article collapse to one key.
export function normalizeUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  try {
    const p = new URL(s);
    return (p.hostname.replace(/^www\./, "") + p.pathname)
      .replace(/\/+$/, "")
      .toLowerCase();
  } catch (_) {
    return s.toLowerCase();
  }
}

// Fetch the seen history: { urls: [...], titles: [...] }.
export async function getSeen() {
  const res = await fetch(
    `${sheetUrl()}?secret=${encodeURIComponent(sheetSecret())}`,
    { method: "GET", redirect: "follow" }
  );
  if (!res.ok) throw new Error("sheet GET " + res.status);
  const data = await res.json();
  return {
    urls: Array.isArray(data?.urls) ? data.urls : [],
    titles: Array.isArray(data?.titles) ? data.titles : [],
  };
}

// Append new topic rows to the sheet (the history log).
export async function appendRows(rows) {
  if (!rows || rows.length === 0) return { ok: true, added: 0 };
  const res = await fetch(sheetUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ secret: sheetSecret(), rows }),
  });
  if (!res.ok) throw new Error("sheet POST " + res.status);
  return res.json();
}

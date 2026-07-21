// Durable, cross-device library of generated scripts + articles. Backed by the
// same Google Apps Script web app as the "seen" memory (a separate "Library"
// tab). If the Sheet isn't configured, the app falls back to per-device
// browser storage and these functions are no-ops.
//
// Reuses SHEET_WEBHOOK_URL / SHEET_SECRET.

import { sheetEnabled } from "./sheet";

function sheetUrl() {
  return process.env.SHEET_WEBHOOK_URL;
}
function sheetSecret() {
  return process.env.SHEET_SECRET;
}

export function libraryEnabled() {
  return sheetEnabled();
}

// Fetch every saved library item: [{ id, ts, type, title_fa, ... }, ...]
export async function getLibrary() {
  if (!sheetEnabled()) return [];
  const res = await fetch(
    `${sheetUrl()}?secret=${encodeURIComponent(sheetSecret())}&type=library`,
    { method: "GET", redirect: "follow" }
  );
  if (!res.ok) throw new Error("library GET " + res.status);
  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

// Append one library item (a full script or article record).
export async function saveLibraryItem(item) {
  if (!sheetEnabled()) return { ok: false, skipped: true };
  const res = await fetch(sheetUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ secret: sheetSecret(), library: [item] }),
  });
  if (!res.ok) throw new Error("library POST " + res.status);
  return res.json();
}

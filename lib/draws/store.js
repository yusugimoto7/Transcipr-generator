// Dedup memory: which draws have already been posted.
//
// Stored in the Google Sheet's existing "Library" tab as records of
// type "posted_draw", using the Apps Script endpoints that are ALREADY
// deployed — no changes to google-apps-script.gs are required. The Sheet
// survives Render redeploys, which wipe the container filesystem.
//
// If the Sheet isn't configured, dedup falls back to an in-memory set. That is
// enough while the process is alive but is LOST on restart, so the Sheet is
// strongly recommended (otherwise a redeploy can re-post the current draw once).
import { sheetEnabled } from "../sheet";
import { getLibrary, saveLibraryItem } from "../library";

const RECORD_TYPE = "posted_draw";
const memory = new Set();

export function storeIsDurable() {
  return sheetEnabled();
}

// All previously posted dedup keys, as a Set.
export async function getPostedKeys() {
  if (!sheetEnabled()) return memory;
  const items = await getLibrary();
  const keys = new Set();
  for (const it of items) {
    if (it?.type === RECORD_TYPE && it.id) keys.add(String(it.id));
  }
  // Anything posted this process but not yet visible in the Sheet still counts.
  for (const k of memory) keys.add(k);
  return keys;
}

// Record a draw as posted. `item` is a collected draw item.
export async function markPosted(item, results = {}) {
  memory.add(item.dedupKey);
  if (!sheetEnabled()) return { ok: false, skipped: true };
  return saveLibraryItem({
    id: item.dedupKey,
    type: RECORD_TYPE,
    title_fa: item.record?.name || item.program,
    title_en: item.program,
    posted_at: new Date().toISOString(),
    draw_crs: item.record?.crs || "",
    draw_size: item.record?.size || "",
    channels: Object.entries(results)
      .filter(([, v]) => v?.ok)
      .map(([k]) => k)
      .join(","),
  });
}

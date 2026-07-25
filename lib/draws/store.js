// Dedup memory: which draws have already been posted.
//
// Backed by the same Google Apps Script web app as the rest of the app (a
// separate "PostedDraws" tab), so it survives Render redeploys — the container
// filesystem does not. Reuses SHEET_WEBHOOK_URL / SHEET_SECRET.
//
// If the Sheet isn't configured, dedup falls back to an in-memory set. That is
// enough for a single long-running process but is LOST on restart, so the Sheet
// is strongly recommended in production (otherwise a redeploy can re-post the
// current draw once).
import { sheetEnabled } from "../sheet";

const memory = new Set();

function url() {
  return process.env.SHEET_WEBHOOK_URL;
}
function secret() {
  return process.env.SHEET_SECRET;
}

export function storeIsDurable() {
  return sheetEnabled();
}

// All previously posted dedup keys, as a Set.
export async function getPostedKeys() {
  if (!sheetEnabled()) return memory;
  const res = await fetch(
    `${url()}?secret=${encodeURIComponent(secret())}&type=posted_draws`,
    { method: "GET", redirect: "follow" }
  );
  if (!res.ok) throw new Error("posted_draws GET " + res.status);
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  return new Set(keys.map(String));
}

// Record a draw as posted. `item` is a collected draw item.
export async function markPosted(item, results = {}) {
  memory.add(item.dedupKey);
  if (!sheetEnabled()) return { ok: false, skipped: true };
  const res = await fetch(url(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({
      secret: secret(),
      posted_draws: [
        {
          key: item.dedupKey,
          program: item.program,
          name: item.record?.name || "",
          crs: item.record?.crs || "",
          size: item.record?.size || "",
          channels: Object.entries(results)
            .filter(([, v]) => v?.ok)
            .map(([k]) => k)
            .join(","),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("posted_draws POST " + res.status);
  return res.json();
}

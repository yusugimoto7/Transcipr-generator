// Visa-result cases still being worked on, kept in this server's memory only — never on disk and
// never in the Sheet, because they hold the client's original, uncovered pictures. They let the
// work go on when the page is left or closed: the pictures are read on the server, the page picks
// the case up again from here, and its checks and text are kept here as they change. A case leaves
// this store when its stories are made (it is then saved with covered pictures only), after 12
// hours, or when the server restarts.

const TTL = 12 * 60 * 60 * 1000;
const MAX = 20;
const store = globalThis.__visaPending || (globalThis.__visaPending = new Map());

function prune() {
  const now = Date.now();
  for (const [id, c] of store) if (now - (c.touched || c.created || 0) > TTL) store.delete(id);
  while (store.size > MAX) store.delete(store.keys().next().value);
}

export function putPending(id, patch) {
  prune();
  const prev = store.get(id) || { id, created: Date.now() };
  const next = { ...prev, ...patch, id, touched: Date.now() };
  store.set(id, next);
  return next;
}

export function getPending(id) {
  prune();
  return store.get(id) || null;
}

export function dropPending(id) {
  store.delete(id);
}

// The list as the page shows it: no pictures, only what a row needs.
export function listPending() {
  prune();
  return [...store.values()]
    .map(({ images, ...c }) => ({ ...c, count: (images || []).length }))
    .sort((a, b) => (b.created || 0) - (a.created || 0));
}

// What the page may change on a case while it is checked: the boxes, the grouping, the text, the design.
export function cleanEdit(e) {
  const out = {};
  if (Array.isArray(e.scans)) {
    out.scans = e.scans.slice(0, 10).map((s) =>
      s && typeof s === "object"
        ? { ...s, boxes: (Array.isArray(s.boxes) ? s.boxes : []).slice(0, 200).map((b) => ({ id: Number(b.id) || 0, kind: b.kind === "date" ? "date" : "hide", x: Number(b.x) || 0, y: Number(b.y) || 0, w: Number(b.w) || 0, h: Number(b.h) || 0, on: b.on !== false, label: String(b.label || "").slice(0, 80) })) }
        : s
    );
  }
  if (Array.isArray(e.groups)) out.groups = e.groups.slice(0, 10).map(Number);
  if (e.texts && typeof e.texts === "object") out.texts = Object.fromEntries(Object.entries(e.texts).slice(0, 10).map(([k, v]) => [k, String(v).slice(0, 1200)]));
  if (e.opts && typeof e.opts === "object") out.opts = { mark: String(e.opts.mark || "marker"), background: String(e.opts.background || "light"), watermark: e.opts.watermark !== false };
  if (typeof e.checked === "boolean") out.checked = e.checked;
  return out;
}

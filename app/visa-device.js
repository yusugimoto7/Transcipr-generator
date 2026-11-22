"use client";

// A visa-result case being worked on, kept on this device too (Hamed, Nov 22 2026: «after two revisions,
// it disappeared! It was not supposed to be like this»). The server holds such a case in its memory only,
// because it carries the client's uncovered pictures, so a restart of the server lost it. The copy here
// stays on the person's own device (IndexedDB, where the pictures came from; never on the server's disk
// or in the Sheet) and puts the case back on the server when it is gone there. It is removed once the
// case is saved for the team or taken off the list, and after 14 days.
const DB = "sugimoto-visa";
const STORE = "cases";
const KEEP_MS = 14 * 24 * 3600 * 1000;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no device store"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

// only what the server needs to hold the case again, and only while it still has uncovered pictures
const FIELDS = ["id", "created", "status", "notes", "images", "scans", "groups", "texts", "kinds", "opts", "checked", "title"];
export async function keepOnDevice(c) {
  if (!c || !c.id || !(c.images || []).some((im) => im && im.data)) return;
  const row = Object.fromEntries(FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
  await tx("readwrite", (s) => s.put({ ...row, status: "ready", kept_at: Date.now() })).catch(() => {});
}

export async function dropFromDevice(id) {
  await tx("readwrite", (s) => s.delete(id)).catch(() => {});
}

export async function fromDevice(id) {
  return (await tx("readonly", (s) => s.get(id)).catch(() => null)) || null;
}

// rows for the list (no pictures), old ones cleared on the way
export async function deviceCases() {
  const all = (await tx("readonly", (s) => s.getAll()).catch(() => [])) || [];
  const now = Date.now();
  for (const c of all) if (now - (c.kept_at || 0) > KEEP_MS) dropFromDevice(c.id);
  return all.filter((c) => now - (c.kept_at || 0) <= KEEP_MS).map(({ images, scans, ...c }) => ({ ...c, count: (images || []).length, device: true }));
}

// The case put back on the server from this device, when the server no longer holds it.
export async function restoreToServer(c) {
  const res = await fetch("/api/visa-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, restore: Object.fromEntries(FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])) }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.case) throw new Error(j.error || "could not put the case back on the server");
  return j.case;
}

// Before a step that needs the server's copy (a new reading, drawing the stories): put it back if it is gone.
export async function ensureHeld(c) {
  if (!c || !c.id || c.saved || !(c.images || []).some((im) => im && im.data)) return;
  const r = await fetch("/api/visa-cases?id=" + encodeURIComponent(c.id) + "&held=1", { cache: "no-store" }).catch(() => null);
  if (r && r.ok) return;
  await restoreToServer(c);
}

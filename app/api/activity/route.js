import { createHash, timingSafeEqual } from "crypto";
import { guard, json, allUsers } from "../../../lib/editing/auth";
import { sessionSecret } from "../../../lib/editing/session";
import { get } from "../../../lib/editing/store";
import { record, readDay, dayOf, ZONE } from "../../../lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The activity log (lib/activity.js).
//   POST — the middleware, on this server, with the session secret: one request a signed-in person made.
//          Open in access.js; the secret is the check.
//   GET ?day=YYYY-MM-DD (Vancouver day, default today) — the admin only: that day's entries with
//          each person's name and the project or card they were about.

const digest = (s) => createHash("sha256").update(String(s)).digest();

export async function POST(request) {
  const secret = sessionSecret();
  const got = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !got || !timingSafeEqual(digest(got), digest(secret))) return json({ error: "not allowed" }, 403);
  const b = await request.json().catch(() => ({}));
  record({ uid: String(b.uid || ""), method: String(b.method || ""), path: String(b.path || "").slice(0, 300) });
  return json({ ok: true });
}

async function titles(items) {
  const projects = new Map(), boards = new Map();
  for (const e of items) {
    const ids = e.ids || [];
    const path = JSON.stringify(e.what || "");
    if (/پروژه|project|version|editor|correction|subtitle|step/i.test(path) && ids[0] && /^p-/.test(ids[0])) projects.set(ids[0], "");
    if (/calendar/i.test(path) && ids[0] && ids[1]) boards.set(ids[0], null);
  }
  await Promise.all([...projects.keys()].slice(0, 40).map(async (id) => {
    const r = await get(`projects/${id}.json`).catch(() => null);
    projects.set(id, (r && r.data && r.data.title) || "");
  }));
  await Promise.all([...boards.keys()].slice(0, 5).map(async (id) => {
    const r = await get(`calendar/boards/${id}.json`).catch(() => null);
    boards.set(id, (r && r.data && r.data.cards) || []);
  }));
  return (e) => {
    const ids = e.ids || [];
    if (projects.get(ids[0])) return projects.get(ids[0]);
    const cards = boards.get(ids[0]);
    if (cards && ids[1]) {
      const c = cards.find((x) => x.id === ids[1]);
      if (c) return c.title || "";
    }
    return "";
  };
}

export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const q = new URL(request.url).searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get("day") || "") ? q.get("day") : dayOf(Date.now());
  const [items, users] = await Promise.all([readDay(day), allUsers().catch(() => [])]);
  const names = new Map(users.map((u) => [u.id, u.name || u.email || u.id]));
  const about = await titles(items);
  return json({
    day,
    zone: ZONE,
    people: users.map((u) => ({ id: u.id, name: u.name || u.email || u.id })),
    items: items.map((e) => ({
      at: e.at,
      until: e.until || 0,
      n: e.n || 1,
      uid: e.uid,
      who: names.get(e.uid) || e.uid,
      what: e.what,
      path: e.path || "",
      about: e.detail || about(e),
    })),
  });
}

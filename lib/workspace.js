// The team's shared workspace: every topic someone acted on, with everything
// made from it (scripts, article, carousel), visible to everyone who opens
// the app. It replaces the Library, which kept the same material per device
// and per type, so nobody could see which topic already had what.
//
// Stored in the Google Sheet's "Library" tab through the existing Apps Script
// (no script change needed): each row is one JSON record, appended, and the
// newest record per id wins. Ids are "<type>:<topic key>":
//   topic:<key>     { status: "new" | "active" | "archived", topic }
//   script:<key>    { script_fa, script_en }        (as the Library wrote them)
//   article:<key>   { article }
//   carousel:<key>  { slides, caption, count, notes, sent }
//   story:<key>     { pages, caption, count, notes, sent, masthead_url, source_label }
//   telegram:<key>  { sent }                         (news post sent for review)
//   video:<key>     { status, request_id, request, video_url, ... }
// so the 60-odd scripts and articles already saved show up as used topics.
//
// Without the Sheet the records live in memory only and a restart loses them.

import { getLibrary, saveLibraryItem, libraryEnabled } from "./library.js";

// English versions (topic page language switch, lib/lang.js) are their own materials; a type left
// off this list is saved but never read back.
const MATERIALS = ["script", "article", "carousel", "story", "video", "telegram", "article_en", "carousel_en", "story_en", "telegram_en"];
const TTL_MS = 30 * 1000;
const LOCAL_KEEP_MS = 10 * 60 * 1000;

export function keyOf(t) {
  return String((t && (t.title_fa || t.title_en)) || "").trim().toLowerCase();
}

// What of a card is worth keeping. snippet is the grounding text: the script,
// article and carousel steps fall back to it when the source page cannot be read.
const TOPIC_FIELDS = [
  "title_fa", "title_en", "field", "page", "why_now", "date", "source_url", "source_name",
  "snippet", "grounding", "score", "newsletter", "citation", "outcome", "kind", "focus", "issue", "n",
  "social", "author", "coverage", "outlets", "video", "lane",
  "evergreen", "page_id", "subject", "question", "gap", "signals", "format",
  "custom", "links", "note", "image_text", "images_count", "researched", "idea", "outline", "manual",
];
export function slimTopic(t) {
  const out = {};
  for (const k of TOPIC_FIELDS) if (t && t[k] !== undefined && t[k] !== null && t[k] !== "") out[k] = t[k];
  if (out.snippet) out.snippet = String(out.snippet).slice(0, 1500);
  if (out.image_text) out.image_text = String(out.image_text).slice(0, 12000);
  return out;
}

const state = globalThis.__sugimotoWorkspace || (globalThis.__sugimotoWorkspace = { at: 0, sheet: [], local: [], inflight: null });

async function sheetRecords() {
  if (!libraryEnabled()) return [];
  if (Date.now() - state.at < TTL_MS) return state.sheet;
  if (!state.inflight) {
    state.inflight = getLibrary()
      .then((items) => {
        state.sheet = items;
        state.at = Date.now();
      })
      .catch((e) => console.log("[workspace] read failed:", String(e?.message || e)))
      .finally(() => (state.inflight = null));
  }
  await state.inflight;
  return state.sheet;
}

// The newest record per id. Writes made by this process in the last few
// minutes are merged in, so a read that started before a write cannot hide it.
async function records() {
  const cutoff = Date.now() - LOCAL_KEEP_MS;
  if (libraryEnabled()) state.local = state.local.filter((r) => (r.ts || 0) >= cutoff);
  const latest = new Map();
  for (const r of [...(await sheetRecords()), ...state.local]) {
    if (!r || !r.id) continue;
    const prev = latest.get(r.id);
    if (!prev || (r.ts || 0) >= (prev.ts || 0)) latest.set(r.id, r);
  }
  return [...latest.values()];
}

// Newest record per id whose id starts with `prefix` — for other stores that
// keep their own records in the same Sheet (e.g. the Lexbase section).
export async function getRecords(prefix) {
  return (await records()).filter((r) => String(r.id || "").startsWith(prefix));
}

function topicFromRecord(r) {
  if (r.topic) return r.topic;
  // Library rows carry the card's fields at the top level.
  return slimTopic(r);
}

// Every topic in the workspace, newest activity first. `full` includes the
// materials themselves; without it only which ones exist (a light payload for
// the list on a phone).
export async function getEntries({ full = false } = {}) {
  const byKey = new Map();
  for (const r of await records()) {
    const i = String(r.id).indexOf(":");
    if (i < 0) continue;
    const type = r.id.slice(0, i);
    const key = r.id.slice(i + 1);
    if (type !== "topic" && !MATERIALS.includes(type)) continue; // e.g. posted_draw
    const e = byKey.get(key) || { key, topic: null, status: "", statusTs: 0, materials: {}, updatedAt: 0 };
    if (type === "topic") {
      e.topic = { ...(e.topic || {}), ...topicFromRecord(r) };
      e.status = r.status || "new";
      e.statusTs = r.ts || 0;
      e.pickedAt = Number(r.picked_at) || 0;
    } else {
      if (!e.topic) e.topic = topicFromRecord(r);
      e.materials[type] = r;
    }
    e.updatedAt = Math.max(e.updatedAt, r.ts || 0);
    // When the topic first appeared: the list orders by date and must not move a topic up just
    // because someone worked on it.
    if (r.ts) e.createdAt = e.createdAt ? Math.min(e.createdAt, r.ts) : r.ts;
    byKey.set(key, e);
  }
  const out = [];
  for (const e of byKey.values()) {
    if (!e.topic || !(e.topic.title_fa || e.topic.title_en)) continue;
    // Material saved before the workspace existed means the topic was used.
    if (!e.status) e.status = Object.keys(e.materials).length ? "active" : "new";
    if (!full) {
      const has = {};
      for (const [k, m] of Object.entries(e.materials)) {
        has[k] = {
          ts: m.ts || 0,
          ...(k === "carousel" || k === "carousel_en" ? { count: (m.slides || []).length, sent: m.sent || {} } : {}),
          ...(k === "story" || k === "story_en" ? { count: (m.pages || []).length, sent: m.sent || {} } : {}),
          ...(k === "video" ? { status: m.status || "" } : {}),
        };
      }
      e.materials = has;
    }
    out.push(e);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEntry(key) {
  return (await getEntries({ full: true })).find((e) => e.key === key) || null;
}

export async function saveRecord(rec) {
  const r = { ...rec, ts: rec.ts || Date.now() };
  state.local.push(r);
  if (libraryEnabled()) await saveLibraryItem(r);
  return r;
}

export async function saveMaterial(type, topic, data) {
  return saveRecord({ id: `${type}:${keyOf(topic)}`, type, ...slimTopic(topic), ...data });
}

// pick: the team chose this topic with ✓ now. The list puts it on top from that moment (Hamed,
// Oct 27 2026); every later save keeps that time, so working on a topic never moves it again.
export async function setStatus(topic, status, { pick = false } = {}) {
  let picked_at = 0;
  if (status === "active") {
    if (pick) picked_at = Date.now();
    else picked_at = ((await getEntry(keyOf(topic)).catch(() => null)) || {}).pickedAt || 0;
  }
  // Titles at the top level too, so the Sheet row is readable by a person.
  return saveRecord({
    id: `topic:${keyOf(topic)}`,
    type: "topic",
    status,
    ...(picked_at ? { picked_at } : {}),
    title_fa: topic.title_fa || "",
    title_en: topic.title_en || "",
    topic: slimTopic(topic),
  });
}

// Restoring puts a topic back where it was before it was archived: used if
// anything was made from it, otherwise new.
export async function restore(topic) {
  const e = await getEntry(keyOf(topic));
  const used = e && Object.keys(e.materials).length > 0;
  return setStatus((e && e.topic) || topic, used ? "active" : "new");
}

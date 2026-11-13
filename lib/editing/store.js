// Storage for the Video Editing section: users, projects, runs and corrections, one JSON file
// each, on the `editing-data` branch of the private english-sugimotovisa repository. The rough-cut
// worker (scripts/rough_cut_service.py there) reads and writes the same files, so the app and the
// worker share state without a database and without touching the Topic Engine's Google Sheet.
//
//   EDITING_GITHUB_TOKEN   fine-grained token, english-sugimotovisa only, Contents: read and write
//   EDITING_REPO           default yusugimoto7/english-sugimotovisa
//   EDITING_BRANCH         default editing-data
//   EDITING_STORE_DIR      local folder instead of GitHub (development only)
//
// Reads use the branch tree (one call, cached a couple of seconds) and blobs cached by hash, so a
// page that polls costs one GitHub call per poll.

import fs from "fs";
import path from "path";
import crypto from "crypto";

export class ConflictError extends Error {}

const cache = globalThis.__editingStore || (globalThis.__editingStore = { tree: null, at: 0, blobs: new Map(), inflight: null });
// This server's own writes of the last half minute. GitHub's branch tree can lag a write by a few
// seconds, so a card reloaded right after a comment came back without it, and a second write read the
// old version and failed as a conflict (Hamed, Nov 4 2026: "the activities are not saving").
if (!cache.mine) cache.mine = new Map();
// What the cached files weigh (characters of their text) and which version of each path is held.
// The cache once kept every version of every file it ever read or wrote: each autosave of the 2.5 MB
// calendar board left another parsed copy of it, and a morning of card edits ran the server out of
// memory (Nov 10 2026: two crashes, 512 MB instance). Now it keeps one version per path and, past a
// budget, drops the least recently used.
if (!cache.size) cache.size = new Map(); // key -> characters
if (!cache.held) cache.held = new Map(); // path -> key held for it
const CACHE_BUDGET = Number(process.env.EDITING_CACHE_CHARS) || 8 * 1024 * 1024; // characters of JSON; a parsed file takes several times that in memory

function remember(key, value, chars, p) {
  if (p) {
    const old = cache.held.get(p);
    if (old && old !== key) forget(old);
    cache.held.set(p, key);
  }
  cache.blobs.delete(key); // re-inserted last: the Map's order is the use order
  cache.blobs.set(key, value);
  cache.size.set(key, chars);
  let total = 0;
  for (const n of cache.size.values()) total += n;
  for (const k of cache.blobs.keys()) {
    if (total <= CACHE_BUDGET || k === key) break;
    total -= cache.size.get(k) || 0;
    forget(k);
  }
}
function forget(key) {
  cache.blobs.delete(key);
  cache.size.delete(key);
}
function recall(key) {
  if (!cache.blobs.has(key)) return undefined;
  const v = cache.blobs.get(key);
  cache.blobs.delete(key);
  cache.blobs.set(key, v);
  return v;
}
const MINE_MS = 30000;
// Our own write wins until a tree read well after it (GitHub has caught up by then), so a file the
// worker changes after us is still seen within seconds.
function ownSha(p) {
  const own = cache.mine.get(p);
  return own && Date.now() - own.at < MINE_MS && cache.at < own.at + 5000 ? own.sha : null;
}
const TREE_TTL_MS = 2500;

function repo() {
  return process.env.EDITING_REPO || "yusugimoto7/english-sugimotovisa";
}
function branch() {
  return process.env.EDITING_BRANCH || "editing-data";
}
function localDir() {
  return process.env.EDITING_STORE_DIR || "";
}

export function storeConfigured() {
  return !!(localDir() || process.env.EDITING_GITHUB_TOKEN);
}

function safe(p) {
  if (!/^[a-z]+(\/[a-z0-9-]+)+\.json$/.test(p)) throw new Error("bad store path " + p);
  return p;
}

// Screenshots on corrections: shots/<correction id>-<n>.jpg, the pictures a hand-edited version
// lays over the video: overlays/<run id>-<n>.png|jpg, and the voice a voice-only motion graphics
// project is built on: voices/v-<id>.<ext>. The worker reads them from its checkout.
export const VOICE_PATH = /^voices\/v-[a-f0-9]{12}\.(webm|m4a|ogg|mp3|wav|aac)$/;
function safeShot(p) {
  if (VOICE_PATH.test(p)) return p;
  if (!/^(shots\/c-[a-f0-9]{12}-[1-9]\.jpg|overlays\/r-[a-f0-9]{12}-\d{1,2}\.(png|jpg)|refs\/hamed\/\d{6,24}-[1-9]\d?\.jpg|drafts\/p-[a-f0-9]{12}\/i\d{1,6}-[a-z0-9]{6,12}\.(png|jpg))$/.test(p)) throw new Error("bad shot path " + p);
  return p;
}

export async function putShot(p, buf, message) {
  safeShot(p);
  if (localDir()) {
    const f = path.join(localDir(), p);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return;
  }
  const res = await gh(`/repos/${repo()}/contents/${p}`, { method: "PUT", body: JSON.stringify({ message: message || "app: " + p, content: buf.toString("base64"), branch: branch() }) });
  cache.at = 0;
  if (!res.ok) throw new Error("GitHub write " + res.status);
}

export async function getShot(p) {
  safeShot(p);
  if (localDir()) {
    const f = path.join(localDir(), p);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const sha = (await tree()).get(p);
  if (!sha) return null;
  const res = await gh(`/repos/${repo()}/git/blobs/${sha}`);
  if (!res.ok) throw new Error("GitHub blob " + res.status);
  return Buffer.from((await res.json()).content, "base64");
}

// A file of the worker's own code branch (main), for settings the app shows but never owns: the
// voices a dub speaker can have live in config/video_process.json there (the one place the video
// process is defined). Cached for ten minutes; the token has Contents: read on the whole repository.
const REPO_FILE = /^(config|docs)\/[a-z_\-]+\.(json|md)$/;
const fileCache = globalThis.__editingRepoFiles || (globalThis.__editingRepoFiles = new Map());
export async function getRepoFile(p, ref = "main") {
  if (!REPO_FILE.test(p)) throw new Error("bad repo path " + p);
  const key = ref + ":" + p;
  const hit = fileCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.text;
  if (localDir()) {
    const f = path.join(localDir(), "..", p);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  }
  const res = await gh(`/repos/${repo()}/contents/${p}?ref=${encodeURIComponent(ref)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub contents " + res.status);
  const text = Buffer.from((await res.json()).content, "base64").toString("utf8");
  fileCache.set(key, { text, at: Date.now() });
  return text;
}

// A picture kept in english-sugimotovisa on main (the motion graphics looks' preview stills,
// config/graphics_previews/<id>-<n>.jpg, made there by scripts/graphics_previews.py), read raw.
const REPO_PICTURE = /^config\/graphics_previews\/[a-z0-9-]{1,30}-[12]\.jpg$/;
const pictureCache = globalThis.__editingRepoPictures || (globalThis.__editingRepoPictures = new Map());
export async function getRepoPicture(p, ref = "main") {
  if (!REPO_PICTURE.test(p)) throw new Error("bad picture path " + p);
  const hit = pictureCache.get(p);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.buf;
  if (localDir()) {
    const f = path.join(localDir(), "..", p);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const res = await fetch(`https://api.github.com/repos/${repo()}/contents/${p}?ref=${encodeURIComponent(ref)}`, {
    cache: "no-store",
    headers: { Authorization: "Bearer " + process.env.EDITING_GITHUB_TOKEN, Accept: "application/vnd.github.raw", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub contents " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  pictureCache.set(p, { buf, at: Date.now() });
  return buf;
}

// The worker's subtitle files of a version (runs/<id>/work/sub/): the lines and their times, read
// by the subtitle editor for versions made before the worker returned them in the result.
const SUB_WORK = /^runs\/r-[a-f0-9]{12}\/work\/(sub\/(corrected\.txt|cut_islands\.json)|speakers\.json|joins\.json)$/;
export async function getWorkText(p) {
  if (!SUB_WORK.test(p)) throw new Error("bad work path " + p);
  if (localDir()) {
    const f = path.join(localDir(), p);
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
  }
  const sha = (await tree()).get(p);
  if (!sha) return null;
  const key = "text:" + sha;
  const hit = recall(key);
  if (hit !== undefined) return hit;
  const res = await gh(`/repos/${repo()}/git/blobs/${sha}`);
  if (!res.ok) throw new Error("GitHub blob " + res.status);
  const text = Buffer.from((await res.json()).content, "base64").toString("utf8");
  remember(key, text, text.length, "text:" + p);
  return text;
}

async function gh(url, init = {}) {
  const res = await fetch("https://api.github.com" + url, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + process.env.EDITING_GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  return res;
}

async function tree() {
  if (cache.tree && Date.now() - cache.at < TREE_TTL_MS) return cache.tree;
  if (!cache.inflight) {
    cache.inflight = (async () => {
      const res = await gh(`/repos/${repo()}/git/trees/${branch()}?recursive=1`);
      if (res.status === 404) throw new Error(`the data branch ${branch()} does not exist in ${repo()}`);
      if (!res.ok) throw new Error("GitHub tree " + res.status);
      const data = await res.json();
      const map = new Map();
      for (const e of data.tree || []) if (e.type === "blob") map.set(e.path, e.sha);
      cache.tree = map;
      cache.at = Date.now();
      return map;
    })().finally(() => (cache.inflight = null));
  }
  return cache.inflight;
}

async function blob(sha, p) {
  const hit = recall(sha);
  if (hit !== undefined) return hit;
  const res = await gh(`/repos/${repo()}/git/blobs/${sha}`);
  if (!res.ok) throw new Error("GitHub blob " + res.status);
  const data = await res.json();
  const text = Buffer.from(data.content, "base64").toString("utf8");
  const parsed = JSON.parse(text);
  remember(sha, parsed, text.length, p);
  return parsed;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// Forget the cached file list, so the next read sees what the worker just pushed.
export function refresh() {
  cache.at = 0;
}

// { data, sha } or null
export async function get(p) {
  safe(p);
  if (localDir()) {
    const f = path.join(localDir(), p);
    if (!fs.existsSync(f)) return null;
    const text = fs.readFileSync(f, "utf8");
    return { data: JSON.parse(text), sha: crypto.createHash("sha1").update(text).digest("hex") };
  }
  const t = await tree();
  const sha = ownSha(p) || t.get(p);
  if (!sha) return null;
  return { data: clone(await blob(sha, p)), sha };
}

// The file as GitHub holds it this moment (contents API, not the cached tree): used after a conflict.
async function getFresh(p) {
  if (localDir()) return get(p);
  const res = await gh(`/repos/${repo()}/contents/${p}?ref=${encodeURIComponent(branch())}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub read " + res.status);
  const d = await res.json();
  const text = Buffer.from(d.content, "base64").toString("utf8");
  const data = JSON.parse(text);
  remember(d.sha, data, text.length, p);
  cache.mine.delete(p);
  return { data: clone(data), sha: d.sha };
}

// Every file under a folder: [{ path, data, sha }]
export async function list(prefix) {
  if (localDir()) {
    const dir = path.join(localDir(), prefix);
    if (!fs.existsSync(dir)) return [];
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const rel = prefix.replace(/\/$/, "") + "/" + name;
      out.push({ path: rel, ...(await get(rel)) });
    }
    return out;
  }
  const t = new Map(await tree());
  for (const k of cache.mine.keys()) if (ownSha(k)) t.set(k, ownSha(k));
  const want = [...t.keys()].filter((k) => k.startsWith(prefix) && k.endsWith(".json") && !k.slice(prefix.length).includes("/"));
  return Promise.all(want.map(async (k) => ({ path: k, sha: t.get(k), data: clone(await blob(t.get(k), k)) })));
}

// Write a whole file. sha: the version read before (null for a new file). A file changed by
// someone else in between raises ConflictError, so a status the worker just wrote is never lost.
export async function put(p, data, sha, message) {
  safe(p);
  const text = JSON.stringify(data, null, 1) + "\n";
  if (localDir()) {
    const f = path.join(localDir(), p);
    const cur = await get(p);
    if ((sha || null) !== (cur ? cur.sha : null)) throw new ConflictError(p + " changed");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    return;
  }
  const body = { message: message || "app: " + p, content: Buffer.from(text).toString("base64"), branch: branch() };
  if (sha) body.sha = sha;
  const res = await gh(`/repos/${repo()}/contents/${p}`, { method: "PUT", body: JSON.stringify(body) });
  cache.at = 0;
  if (res.status === 409 || res.status === 422) throw new ConflictError(p + " changed");
  if (!res.ok) throw new Error("GitHub write " + res.status);
  const out = await res.json().catch(() => null);
  const newSha = out && out.content && out.content.sha;
  if (newSha) {
    remember(newSha, JSON.parse(text), text.length, p);
    cache.mine.set(p, { sha: newSha, at: Date.now() });
  }
}

// Read, change, write; retried when the file changed in between. A retry reads GitHub directly:
// the cached tree may still hold the version that just conflicted.
export async function update(p, fn, message) {
  for (let i = 0; i < 5; i++) {
    const cur = i === 0 ? (await get(p)) || (await getFresh(p)) : await getFresh(p);
    if (!cur) throw new Error("not found: " + p);
    const next = fn(cur.data);
    try {
      await put(p, next, cur.sha, message);
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError) || i === 4) throw e;
      cache.at = 0;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
}

// Start the rough-cut worker (GitHub job `rough_cut` in english-sugimotovisa).
export async function dispatch(runId, action, stage = "cut") {
  if (localDir()) {
    console.log(`[editing] would start the worker: ${action} ${runId} (${stage})`);
    return;
  }
  // The worker (subtitles, motion graphics, storyboard notes) names terms from this file, so it is
  // refreshed first; a failure here never stops the run.
  await import("../glossary.js").then((m) => m.loadGlossary({ fresh: true })).catch(() => {});
  const res = await gh(`/repos/${repo()}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ event_type: "rough_cut", client_payload: { run_id: runId, action, stage, glossary: "glossary/terms.json" } }),
  });
  if (res.status !== 204) throw new Error("could not start the worker (GitHub " + res.status + ")");
}

export function newId(prefix) {
  return prefix + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

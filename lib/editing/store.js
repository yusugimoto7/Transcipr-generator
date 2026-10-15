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

async function blob(sha) {
  if (cache.blobs.has(sha)) return cache.blobs.get(sha);
  const res = await gh(`/repos/${repo()}/git/blobs/${sha}`);
  if (!res.ok) throw new Error("GitHub blob " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  if (cache.blobs.size > 3000) cache.blobs.clear();
  cache.blobs.set(sha, parsed);
  return parsed;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
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
  const sha = (await tree()).get(p);
  if (!sha) return null;
  return { data: clone(await blob(sha)), sha };
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
  const t = await tree();
  const want = [...t.keys()].filter((k) => k.startsWith(prefix) && k.endsWith(".json") && !k.slice(prefix.length).includes("/"));
  return Promise.all(want.map(async (k) => ({ path: k, sha: t.get(k), data: clone(await blob(t.get(k))) })));
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
}

// Read, change, write; retried when the file changed in between.
export async function update(p, fn, message) {
  for (let i = 0; i < 4; i++) {
    const cur = await get(p);
    if (!cur) throw new Error("not found: " + p);
    const next = fn(cur.data);
    try {
      await put(p, next, cur.sha, message);
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError) || i === 3) throw e;
      cache.at = 0;
    }
  }
}

// Start the rough-cut worker (GitHub job `rough_cut` in english-sugimotovisa).
export async function dispatch(runId, action) {
  if (localDir()) {
    console.log(`[editing] would start the worker: ${action} ${runId}`);
    return;
  }
  const res = await gh(`/repos/${repo()}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ event_type: "rough_cut", client_payload: { run_id: runId, action } }),
  });
  if (res.status !== 204) throw new Error("could not start the worker (GitHub " + res.status + ")");
}

export function newId(prefix) {
  return prefix + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

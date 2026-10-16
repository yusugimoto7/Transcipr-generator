// The team's benchmark videos: one shared Google Drive folder ("Benchmarks"),
// read through Drive's public folder view, so no Google key is needed — the
// folder must stay shared as "Anyone with the link". Each video's shape
// (vertical / horizontal / square) comes from its Drive thumbnail, which has
// the video's proportions; that says which format it is a model for.

import sharp from "sharp";

const FOLDER_ID = process.env.BENCHMARK_FOLDER_ID || "13zzIgmAPzHdv2Ah_8XlL0DGJ8L_rE9J1";
const TTL_MS = 10 * 60 * 1000;
const UA = "Mozilla/5.0 (compatible; SugimotoTopicBot/1.0; +https://sugimotovisa.com)";

let cache = { at: 0, list: null, inflight: null };
const thumbs = new Map(); // file id -> { buf, type }

export function benchmarkFolderUrl() {
  return `https://drive.google.com/drive/folders/${FOLDER_ID}`;
}

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

async function get(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA } });
  } finally {
    clearTimeout(timer);
  }
}

function shapeOf(w, h) {
  if (!w || !h) return { ratio: "", orientation: "", fits: "" };
  const r = w / h;
  if (r < 0.85) return { ratio: "9:16", orientation: "vertical", fits: "Reels · TikTok · Shorts" };
  if (r > 1.2) return { ratio: "16:9", orientation: "horizontal", fits: "YouTube" };
  return { ratio: "1:1", orientation: "square", fits: "Feed" };
}

async function thumbnail(id) {
  const hit = thumbs.get(id);
  if (hit) return hit;
  const res = await get(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w480`);
  if (!res.ok) throw new Error("no thumbnail");
  const type = res.headers.get("content-type") || "";
  if (!/^image\//.test(type)) throw new Error("no thumbnail");
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const t = { buf, type, width: meta.width || 0, height: meta.height || 0 };
  thumbs.set(id, t);
  return t;
}

async function load() {
  const res = await get(`https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}`);
  if (!res.ok) throw new Error(`the Benchmarks folder answered ${res.status}; is it shared as "Anyone with the link"?`);
  const html = await res.text();
  const entries = [];
  const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[0];
    // Videos only; a sub-folder or a document is not a benchmark.
    if (!/type\/video|alt="Video"/i.test(block)) continue;
    entries.push({ id: m[1], title: decode(m[2]).trim() });
  }
  const list = await Promise.all(
    entries.map(async (e) => {
      let shape = shapeOf(0, 0);
      try {
        const t = await thumbnail(e.id);
        shape = shapeOf(t.width, t.height);
      } catch (_) {}
      return {
        id: e.id,
        title: e.title,
        url: `https://drive.google.com/file/d/${e.id}/view`,
        thumb: `/api/video/benchmarks?thumb=${e.id}`,
        ...shape,
      };
    })
  );
  return list;
}

// The folder's videos, at most ten minutes old (`fresh` reads it again).
export async function listBenchmarks({ fresh = false } = {}) {
  if (!fresh && cache.list && Date.now() - cache.at < TTL_MS) return cache.list;
  if (!cache.inflight) {
    cache.inflight = load()
      .then((list) => {
        cache = { at: Date.now(), list, inflight: null };
        return list;
      })
      .finally(() => (cache.inflight = null));
  }
  return cache.inflight;
}

// A listed video's thumbnail, for the page (only ids from the folder).
export async function benchmarkThumbnail(id) {
  const list = await listBenchmarks();
  if (!list.some((b) => b.id === id)) return null;
  return thumbnail(id);
}

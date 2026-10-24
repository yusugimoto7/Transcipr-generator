// The card's video or image, for the channels. Drive links are turned into their download form.
// Instagram fetches media by URL, so the app serves it through a signed, short-lived link of its
// own (/api/calendar/media/...): the platform never needs access to Drive.

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const MAX_BYTES = 1024 * 1024 * 1024;

export function downloadUrl(url) {
  const u = String(url || "");
  const m = u.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || (/drive\.google\.com/.test(u) && u.match(/[?&]id=([A-Za-z0-9_-]{10,})/));
  return m ? `https://drive.usercontent.google.com/download?id=${m[1]}&export=download&confirm=t` : u;
}

export async function openMedia(url) {
  const res = await fetch(downloadUrl(url), { redirect: "follow" });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || type.includes("text/html")) throw new Error("the media link cannot be downloaded (Drive: share as “Anyone with the link”)");
  return res;
}

// Download to a temporary file: uploads to the platforms go in chunks with known sizes.
export async function downloadMedia(url) {
  const res = await openMedia(url);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new Error("the media file is larger than 1 GB");
  const file = path.join(os.tmpdir(), "cal-" + crypto.randomUUID());
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
  const size = fs.statSync(file).size;
  let mime = (res.headers.get("content-type") || "").split(";")[0];
  if (!mime || mime === "application/octet-stream") mime = /\.(jpe?g)$/i.test(url) ? "image/jpeg" : /\.png$/i.test(url) ? "image/png" : "video/mp4";
  return { file, size, mime, cleanup: () => fs.promises.unlink(file).catch(() => {}) };
}

export function readChunk(file, start, length) {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, start);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

function secret() {
  return process.env.EDITING_SESSION_SECRET || "";
}

// Only the site's own address counts: APP_URL once held the sign-in page
// (".../editing/login?next=..."), so every link built from it (Instagram's pictures, the video's
// callback) led to that page instead.
export function siteOrigin() {
  for (const v of [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL]) {
    try {
      if (v) return new URL(v).origin;
    } catch {}
  }
  return "";
}

export function appUrl(req) {
  const env = siteOrigin();
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "";
}

// `i` picks one file of a carousel or a set of stories; the first file signs as it always did.
const signed = (boardId, cardId, exp, i) => `${boardId}:${cardId}:${exp}` + (Number(i) > 0 ? `:${Number(i)}` : "");

export function signedMediaUrl(boardId, cardId, minutes = 120, i = 0) {
  const exp = Date.now() + minutes * 60000;
  const sig = crypto.createHmac("sha256", secret()).update(signed(boardId, cardId, exp, i)).digest("hex").slice(0, 32);
  return `${appUrl()}/api/calendar/media/${boardId}/${cardId}?exp=${exp}&sig=${sig}${Number(i) > 0 ? `&i=${Number(i)}` : ""}`;
}

export function checkMediaSig(boardId, cardId, exp, sig, i = 0) {
  if (!secret() || !(Number(exp) > Date.now())) return false;
  const want = crypto.createHmac("sha256", secret()).update(signed(boardId, cardId, exp, i)).digest("hex").slice(0, 32);
  return want.length === String(sig || "").length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(String(sig)));
}

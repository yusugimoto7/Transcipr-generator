// The document a social post shares, used as the story's screenshot instead of the post (Hamed, Nov 22
// 2026: «پست اون فرد برای ما ارزشی نداره. ما اصل اون خبر رو لازم داریم که اگر اسکرین شاتی هست از همون
// اسکرین شات استفاده بشه»: an IRCC answer retweeted with a picture of the email showed the tweet, not the
// email). The post's own pictures (X's public data, Meta's API for a followed Instagram creator) are read
// by OCR; one that holds a page of text is the source itself, and the quoted sentences are marked on it
// where OCR finds them. A photo with little or no text (a face, a logo) is not a document and is skipped.
import sharp from "sharp";
import { ocrWords } from "../visa-news/scan.js";
import { xPostData } from "../video-file.js";
import { instagramPost } from "../social/instagram.js";
import { keepImage } from "../carousel.js";

const MIN_TEXT = 120; // characters of OCR text before a picture counts as a document
const MAX_BYTES = 8 * 1024 * 1024;

export async function postPhotos(url) {
  if (/(?:^|\/\/|\.)(?:x|twitter)\.com\//.test(url)) {
    const d = await xPostData(url).catch(() => null);
    return ((d && d.mediaDetails) || []).filter((m) => m && m.type === "photo" && /^https:\/\/pbs\.twimg\.com\//.test(m.media_url_https || "")).map((m) => m.media_url_https + "?name=large").slice(0, 4);
  }
  if (/instagram\.com\//.test(url)) {
    const p = await instagramPost(url).catch(() => null);
    return p && p.image_url ? [p.image_url] : [];
  }
  return [];
}

const tok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// The word boxes of the longest run of the quote's words found in a row in the picture (at least six
// words, or the whole quote when it is shorter).
function findRun(words, quote) {
  const q = String(quote || "").split(/\s+/).map(tok).filter(Boolean);
  const w = words.map((x) => tok(x.text));
  if (q.length < 3) return [];
  let best = [];
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < q.length; j++) {
      if (!w[i] || w[i] !== q[j]) continue;
      let k = 0;
      while (i + k < w.length && j + k < q.length && (w[i + k] === q[j + k] || (!w[i + k] && k > 0))) k++;
      if (k > best.length) best = words.slice(i, i + k);
    }
  }
  return best.length >= Math.min(6, q.length) ? best : [];
}

// { url, marked, key } for the first picture of the post that is a document, or null.
export async function postPhotoShot(postUrl, quotes, { ratio = 0.95, name = "story-shot", skip = new Set() } = {}) {
  for (const src of await postPhotos(postUrl)) {
    const key = "photo:" + src;
    if (skip.has(key)) continue;
    try {
      const res = await fetch(src, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) continue;
      const { width, height, words } = await ocrWords(buf);
      if (words.map((x) => x.text).join(" ").length < MIN_TEXT) continue;
      // one bar per line of each marked run, as a highlighter would draw it
      const boxes = (quotes || []).flatMap((q) => {
        const lines = new Map();
        for (const b of findRun(words, q)) {
          const r = lines.get(b.line);
          if (!r) lines.set(b.line, { ...b });
          else {
            const x1 = Math.max(r.x + r.w, b.x + b.w), y1 = Math.max(r.y + r.h, b.y + b.h);
            r.x = Math.min(r.x, b.x);
            r.y = Math.min(r.y, b.y);
            r.w = x1 - r.x;
            r.h = y1 - r.y;
          }
        }
        return [...lines.values()];
      });
      const pad = 3;
      const svg = boxes.length
        ? `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${boxes.map((b) => `<rect x="${b.x - pad}" y="${b.y - pad}" width="${b.w + 2 * pad}" height="${b.h + 2 * pad}" rx="3" fill="#ffe14d"/>`).join("")}</svg>`
        : "";
      let img = sharp(buf).flatten({ background: "#ffffff" });
      if (svg) img = img.composite([{ input: Buffer.from(svg), blend: "multiply" }]);
      let out = await img.png().toBuffer();
      // a tall page: the part around the marked sentences, as tall as the story's screenshot slot allows
      const maxH = Math.round(width * ratio);
      if (height > maxH) {
        const top = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
        const y = Math.max(0, Math.min(Math.round(top - maxH * 0.3), height - maxH));
        out = await sharp(out).extract({ left: 0, top: y, width, height: maxH }).png().toBuffer();
      }
      // small pictures are enlarged so the text stays sharp on a 1080-wide story
      const jpeg = await sharp(out).resize({ width: Math.max(width, 1200), withoutEnlargement: false, kernel: "lanczos3" }).jpeg({ quality: 90 }).toBuffer();
      return { url: (await keepImage(jpeg, name)).url, marked: boxes.length ? 1 : 0, key };
    } catch (e) {
      console.log("[story] post picture not used:", src, String(e?.message || e).slice(0, 160));
    }
  }
  return null;
}

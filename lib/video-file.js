// Where a social video's file is, without a paid service (Oct 28 2026). The networks' pages are
// login walls, but two of them hand the file itself to anyone who asks the right way:
//   X         the public syndication endpoint (what embedded tweets are built from) names every
//             mp4 variant of a tweet's clip; the lightest one is taken, the sound is the same
//   Instagram Meta's official API, which already reads the followed creators' posts
//             (lib/social/instagram.js), names each reel's media_url
// Facebook, TikTok and YouTube give nothing this way; those videos stay with the transcript
// service (lib/video-transcript.js), when it is set up.

import { spawn } from "node:child_process";
import { instagramVideoUrl } from "./social/instagram.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function host(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  } catch (_) {
    return "";
  }
}

// The token the syndication endpoint expects is derived from the tweet id (as react-tweet does).
function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function xVideoUrl(url) {
  const m = String(url).match(/\/status\/(\d+)/);
  if (!m) return "";
  const id = m[1];
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return "";
  const d = await res.json().catch(() => null);
  const variants = ((d && d.mediaDetails) || [])
    .flatMap((md) => ((md && md.video_info && md.video_info.variants) || []))
    .filter((v) => v && v.content_type === "video/mp4" && v.url)
    .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
  return variants.length ? variants[0].url : "";
}

// A tweet's own words and the pages it links to, from the same public endpoint. Shared tweets are
// mostly plain text (Hamed, Nov 7 2026: an LMIA post shared from X failed with "the page could not
// be read"), so the words themselves are the source, not the login-walled page.
export async function xPostText(url) {
  const m = String(url).match(/\/status\/(\d+)/);
  if (!m) return { text: "", links: [], video: false };
  const id = m[1];
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${syndicationToken(id)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return { text: "", links: [], video: false };
  const d = await res.json().catch(() => null);
  if (!d) return { text: "", links: [], video: false };
  const expand = (t, ents) => {
    let s = String(t || "");
    for (const u of (ents && ents.urls) || []) if (u && u.url && u.expanded_url) s = s.split(u.url).join(u.expanded_url);
    return s.replace(/https:\/\/t\.co\/\w+/g, "").replace(/[ \t]+\n/g, "\n").trim();
  };
  const parts = [];
  const links = [];
  const take = (t, label) => {
    if (!t) return;
    const body = expand(t.text, t.entities);
    if (body) parts.push(label ? `${label}\n${body}` : body);
    for (const u of (t.entities && t.entities.urls) || []) if (u && u.expanded_url && !/^https?:\/\/(x|twitter)\.com\//.test(u.expanded_url)) links.push(u.expanded_url);
  };
  take(d, "");
  take(d.quoted_tweet, "[Quoted post]");
  const video = ((d.mediaDetails) || []).some((md) => md && md.video_info);
  return { text: parts.join("\n\n"), links: [...new Set(links)], video };
}

// The file's address for a post, or "" when the network gives none.
export async function videoFileUrl(url, { video_url = "" } = {}) {
  if (video_url) return video_url;
  const h = host(url);
  if (h === "x.com" || h === "twitter.com") return xVideoUrl(url).catch(() => "");
  if (h === "instagram.com") return instagramVideoUrl(url).catch(() => "");
  return "";
}

// The sound of a video as a small mp3, made by ffmpeg straight from the file's address (16 kHz mono,
// 48 kbps: a minute is about 360 KB), so a long or full-quality reel never has to fit in memory or
// in a transcriber's 25 MB. Null when ffmpeg is missing or cannot read the address.
function audioOf(fileUrl, { timeoutMs = 150000, maxBytes = 24 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const chunks = [];
    let size = 0;
    let child;
    const end = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        child && child.kill("SIGKILL");
      } catch (_) {}
      resolve(v);
    };
    const timer = setTimeout(() => end(null), timeoutMs);
    try {
      child = spawn("ffmpeg", ["-v", "error", "-user_agent", UA, "-i", fileUrl, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (_) {
      return end(null);
    }
    child.on("error", () => end(null));
    child.stdout.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) return end(null);
      chunks.push(c);
    });
    child.on("close", (code) => end(code === 0 && size > 2000 ? { buf: Buffer.concat(chunks), type: "audio/mpeg", name: "audio.mp3" } : null));
  });
}

// The file itself when it is up to `maxBytes` (a transcriber takes 25 MB); a larger one as its sound
// alone (Nov 10 2026: followed creators' reels over that size were going to the paid service, and a
// shared one failed outright when its credits ran out). Null when it cannot be fetched; the reason
// is logged.
export async function downloadVideo(fileUrl, { maxBytes = 24 * 1024 * 1024, timeoutMs = 60000 } = {}) {
  let res;
  try {
    res = await fetch(fileUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  } catch (e) {
    console.log("[video file] not fetched:", host(fileUrl), String(e.message || e).slice(0, 120));
    return null;
  }
  if (!res.ok) {
    console.log("[video file] not fetched:", host(fileUrl), "HTTP " + res.status);
    return null;
  }
  const type = String(res.headers.get("content-type") || "");
  const len = Number(res.headers.get("content-length") || 0);
  let buf = null;
  if (len <= maxBytes) {
    // read as it comes, stopping at the limit when the server did not say the size
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true }));
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        chunks.length = 0;
        size = -1;
        break;
      }
      chunks.push(value);
    }
    if (size > 0) buf = Buffer.concat(chunks);
    else if (size === 0) return null;
  } else {
    await res.body.cancel().catch(() => {});
  }
  if (buf) return { buf, type: /video|audio|octet/.test(type) ? type : "video/mp4", name: /audio/.test(type) ? "audio.mp3" : "video.mp4" };
  const audio = await audioOf(fileUrl);
  console.log("[video file]", host(fileUrl), len ? (len / 1e6).toFixed(1) + " MB:" : "larger than the limit:", audio ? `read as its sound alone (${(audio.buf.length / 1e6).toFixed(1)} MB)` : "its sound could not be taken (ffmpeg)");
  return audio;
}

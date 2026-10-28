// Where a social video's file is, without a paid service (Oct 28 2026). The networks' pages are
// login walls, but two of them hand the file itself to anyone who asks the right way:
//   X         the public syndication endpoint (what embedded tweets are built from) names every
//             mp4 variant of a tweet's clip; the lightest one is taken, the sound is the same
//   Instagram Meta's official API, which already reads the followed creators' posts
//             (lib/social/instagram.js), names each reel's media_url
// Facebook, TikTok and YouTube give nothing this way; those videos stay with the transcript
// service (lib/video-transcript.js), when it is set up.

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

// The file's address for a post, or "" when the network gives none.
export async function videoFileUrl(url, { video_url = "" } = {}) {
  if (video_url) return video_url;
  const h = host(url);
  if (h === "x.com" || h === "twitter.com") return xVideoUrl(url).catch(() => "");
  if (h === "instagram.com") return instagramVideoUrl(url).catch(() => "");
  return "";
}

// The file itself, up to `maxBytes` (a transcriber takes 25 MB; a reel is a few). Null when it is
// larger or cannot be fetched.
export async function downloadVideo(fileUrl, { maxBytes = 24 * 1024 * 1024, timeoutMs = 60000 } = {}) {
  const res = await fetch(fileUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
  if (!res.ok) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > maxBytes) return null;
  const type = String(res.headers.get("content-type") || "");
  return { buf, type: /video|audio|octet/.test(type) ? type : "video/mp4" };
}

// What a shared social post holds, as text (Hamed, Nov 7 2026: "any kind of post I share from X,
// TikTok, Instagram or YouTube must work, even videos"). A post's page is a login wall, so it is never
// scraped; each part comes the way the network itself hands it out:
//   the words   X's public embed endpoint (lib/video-file.js xPostText), TikTok's and YouTube's
//               official oEmbed, and Supadata's metadata API for every network (Instagram's caption
//               only comes that way)
//   the video   its transcript (lib/video-transcript.js: the file itself for X and the followed
//               creators, else Supadata)
//   the page    the official page the post links to, read like any article
// Whatever could be read is kept: a caption without a transcript is still a source, and the reason
// for each part that failed is said plainly (no credits left, a private post) instead of "blocked".
import { xPostText } from "./video-file.js";
import { videoTranscript, supadataEnabled, supadataCall, transcriptsEnabled } from "./video-transcript.js";

const KEEP_MS = 6 * 60 * 60 * 1000;
const cache = globalThis.__socialPosts || (globalThis.__socialPosts = new Map()); // url -> { at, value: Promise }

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(www|m|mobile|vm|vt)\./, "");
  } catch (_) {
    return "";
  }
}

// Which network a link belongs to, or "" for an ordinary page.
export function socialNetwork(url) {
  const h = hostOf(url);
  if (h === "x.com" || h === "twitter.com") return /\/status\/\d+/.test(url) ? "x" : "";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "instagram.com" || h === "instagr.am") return /\/(p|reels?|tv)\//.test(url) ? "instagram" : "";
  if (h === "youtu.be" || h === "youtube.com" || h.endsWith(".youtube.com")) return /youtu\.be\/|\/(watch|shorts|live)/.test(url) ? "youtube" : "";
  if (h === "facebook.com" || h === "fb.watch" || h === "fb.com") return "facebook";
  if (h === "threads.net" || h === "threads.com") return "threads";
  return "";
}

const NAMES = { x: "X", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", facebook: "Facebook", threads: "Threads" };

async function oembed(net, url) {
  const api = net === "tiktok" ? "https://www.tiktok.com/oembed?url=" : net === "youtube" ? "https://www.youtube.com/oembed?format=json&url=" : "";
  if (!api) return null;
  const res = await fetch(api + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  const d = await res.json().catch(() => null);
  return d ? { caption: String(d.title || "").trim(), author: String(d.author_unique_id || d.author_name || "").trim() } : null;
}

async function supadataMeta(url) {
  if (!supadataEnabled()) return null;
  const d = await supadataCall("/metadata", { url }, 45000);
  if (!d) return null;
  const a = d.author || {};
  const media = d.media || {};
  return {
    caption: [d.title, d.description].map((x) => String(x || "").trim()).filter(Boolean).filter((x, i, all) => !(i && all[0] && all[0].includes(x))).join("\n\n"),
    author: String(a.username || a.displayName || a.name || "").trim(),
    video: /video|reel|short/i.test(String(media.type || d.type || "")),
  };
}

const plainReason = (e) => {
  const m = String((e && e.message) || e || "");
  if (/limit exceeded|credit|quota|402/i.test(m)) return "the transcript service (Supadata) has no credits left this month";
  if (/private|not found|404|unavailable|removed/i.test(m)) return "the post is private, removed or not public";
  return m.slice(0, 140) || "unknown";
};

async function read(url, readPage) {
  const net = socialNetwork(url);
  const why = [];
  let caption = "", author = "", links = [], video = net === "tiktok" || net === "youtube" || /\/(reels?|tv|videos|watch|shorts)\b|fb\.watch/.test(url);

  if (net === "x") {
    const p = await xPostText(url).catch((e) => {
      why.push("X: " + plainReason(e));
      return null;
    });
    if (p) {
      caption = p.text;
      links = p.links;
      video = p.video;
    }
  } else {
    const o = await oembed(net, url).catch(() => null);
    if (o) (caption = o.caption), (author = o.author);
  }
  // Supadata's metadata: the only way to Instagram's and Facebook's captions, and fuller than oEmbed's
  // title for YouTube (the description) and TikTok.
  if (net !== "x" && (net === "instagram" || net === "facebook" || net === "threads" || caption.length < 200)) {
    try {
      const m = await supadataMeta(url);
      if (m) {
        if (m.caption.length > caption.length) caption = m.caption;
        author = author || m.author;
        video = video || m.video;
      }
    } catch (e) {
      why.push("caption: " + plainReason(e));
    }
  }
  if (!links.length) links = (caption.match(/https?:\/\/[^\s<>"'،)]+/g) || []).filter((u) => !socialNetwork(u));

  let transcript = "";
  if (video && transcriptsEnabled()) {
    try {
      transcript = await videoTranscript(url, { waitMs: 120000 });
      if (!transcript) why.push("the video has no speech that could be transcribed");
    } catch (e) {
      why.push("video: " + plainReason(e));
    }
  } else if (video) why.push("no transcript service is set up on the server");

  let page = "";
  if (links[0] && readPage) page = await readPage(links[0]).catch(() => "");

  const parts = [];
  if (caption) parts.push(`[${NAMES[net] || "Post"}${author ? " post by @" + author.replace(/^@/, "") : " post"}]\n${caption}`);
  if (transcript) parts.push("[Video transcript]\n" + transcript);
  if (page) parts.push(`[Page the post links to: ${hostOf(links[0])}]\n${page}`);
  return { text: parts.join("\n\n"), network: net, video, why };
}

// { text, network, video, why }; kept a few hours so the card and every step written from it read
// the post once. `readPage(url)` reads an ordinary page (lib/news.js fetchArticleText).
export function readSocialPost(url, { readPage } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const value = read(url, readPage);
  cache.set(url, { at: Date.now(), value });
  value.then((r) => !r.text && cache.delete(url), () => cache.delete(url));
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

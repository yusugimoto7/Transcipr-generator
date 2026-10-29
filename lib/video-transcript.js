// What a video says, as text: a reel, TikTok, YouTube video or Short, X or Facebook video has no
// article to read, and scraping its page gives the site's chrome and comments instead (Hamed,
// Oct 24 2026: a reel's "original text" was Instagram's login prompts and other people's
// comments). lib/news.js fetchArticleText returns the transcript for such links.
//
// Three ways, cheapest first (Oct 28 2026, after Supadata's free 100 credits a month proved to be
// about fifty reels, Hamed asked for a way without that cost):
//   1. the file itself (lib/video-file.js: X's public endpoint, Meta's official API for the
//      followed creators) transcribed by Groq's Whisper (GROQ_API_KEY, free: eight hours of audio
//      a day), else by the team's OpenAI account (gpt-4o-mini-transcribe, about a third of a cent
//      a minute; on by USE_OPENAI). Instagram and X videos go this way.
//   2. Supadata (SUPADATA_API_KEY, the n8n script bot's service) for what no one hands over as a
//      file: Facebook, TikTok, YouTube.
// A transcript is kept a day, so a card, its script and its article pay once.

import { openaiEnabled, openaiTranscribeVideo } from "./openai.js";
import { videoFileUrl, downloadVideo } from "./video-file.js";

const API = "https://api.supadata.ai/v1";
const GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";
const KEEP_MS = 24 * 60 * 60 * 1000;
const cache = globalThis.__videoTranscripts || (globalThis.__videoTranscripts = new Map()); // url -> { text, ts, how } | { pending }
// How many each way did today, for the status pages.
const tally = globalThis.__videoTranscriptTally || (globalThis.__videoTranscriptTally = { day: "", groq: 0, openai: 0, supadata: 0, none: 0 });

export function supadataEnabled() {
  return !!process.env.SUPADATA_API_KEY;
}
export function groqEnabled() {
  return !!process.env.GROQ_API_KEY;
}
export function transcriptsEnabled() {
  return groqEnabled() || openaiEnabled() || supadataEnabled();
}
export function transcriptWays() {
  return [groqEnabled() && "groq", openaiEnabled() && "openai", supadataEnabled() && "supadata"].filter(Boolean);
}
export function transcriptTally() {
  const day = new Date().toISOString().slice(0, 10);
  if (tally.day !== day) Object.assign(tally, { day, groq: 0, openai: 0, supadata: 0, none: 0 });
  return { ...tally };
}
function count(how) {
  transcriptTally();
  tally[how] = (tally[how] || 0) + 1;
}

export function isVideoUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return false;
  }
  const h = u.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const p = u.pathname;
  if (h === "instagram.com") return /^\/(reel|reels|tv|p)\//.test(p);
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return true;
  if (h === "youtu.be") return true;
  if (h === "youtube.com" || h.endsWith(".youtube.com")) return /^\/(watch|shorts|live)/.test(p);
  if (h === "x.com" || h === "twitter.com") return /\/status\/\d+/.test(p);
  if (h === "facebook.com" || h === "fb.watch") return h === "fb.watch" || /\/(reel|videos|watch)/.test(p);
  return false;
}

// ── 1. the file, transcribed by Groq or OpenAI ───────────────────────────────
async function groqTranscribe(buf, type, language) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type }), "video.mp4");
  form.append("model", process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3");
  form.append("response_format", "text");
  form.append("temperature", "0");
  if (language) form.append("language", language);
  const res = await fetch(GROQ, { method: "POST", headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY }, body: form, signal: AbortSignal.timeout(120000) });
  const text = await res.text();
  if (!res.ok) throw new Error("groq " + res.status + " " + text.slice(0, 160));
  return text.trim();
}

// `lang` is a hint from the post's caption ("fa" / "en"); a wrong hint is worse than none, so it is
// passed only when the caption was clearly Farsi.
async function fromFile(url, { video_url, lang }) {
  if (!groqEnabled() && !openaiEnabled()) return null;
  const fileUrl = await videoFileUrl(url, { video_url });
  if (!fileUrl) return null;
  const file = await downloadVideo(fileUrl);
  if (!file) return null;
  const language = lang === "fa" ? "fa" : undefined;
  if (groqEnabled()) {
    try {
      const t = await groqTranscribe(file.buf, file.type, language);
      count("groq");
      return { text: t, how: "groq" };
    } catch (e) {
      console.log("[transcript] groq failed:", String(e.message || e).slice(0, 160));
      if (!openaiEnabled()) throw e;
    }
  }
  const t = await openaiTranscribeVideo(file.buf, "video.mp4", { language });
  count("openai");
  return { text: t, how: "openai" };
}

// ── 2. Supadata ──────────────────────────────────────────────────────────────
const plain = (content) =>
  typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((s) => (s && s.text) || "").join(" ").trim() : "";

// The service answers "Limit Exceeded" both when its monthly credits are spent and when two
// requests land in the same second (the free plan allows one; the social lane, a script and a
// job's status checks can coincide). Requests therefore wait their turn, a little over a second
// apart, and one that is refused for its rate is asked again once.
const GAP_MS = Number(process.env.SUPADATA_GAP_MS) || 1100;
const turn = globalThis.__supadataTurn || (globalThis.__supadataTurn = { next: Promise.resolve(), last: 0 });
function inTurn(fn) {
  const run = turn.next.then(async () => {
    const wait = turn.last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    turn.last = Date.now();
  });
  turn.next = run.catch(() => {});
  return run.then(fn);
}

async function call(path, params, timeoutMs = 30000) {
  for (let attempt = 0; ; attempt++) {
    const res = await inTurn(() =>
      fetch(API + path + (params ? "?" + new URLSearchParams(params) : ""), {
        headers: { "x-api-key": process.env.SUPADATA_API_KEY },
        signal: AbortSignal.timeout(timeoutMs),
      })
    );
    const d = await res.json().catch(() => ({}));
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    if (!res.ok && res.status !== 202) throw new Error((d && (d.message || d.error)) || `transcript service ${res.status}`);
    return d;
  }
}

// The plan and this month's credits ({ plan, max, used }), or null; asked at most every ten minutes.
const credits = globalThis.__supadataCredits || (globalThis.__supadataCredits = { at: 0, value: null });
export async function transcriptCredits({ fresh = false } = {}) {
  if (!supadataEnabled()) return null;
  if (!fresh && credits.value && Date.now() - credits.at < 10 * 60 * 1000) return credits.value;
  try {
    const d = await call("/me", null, 15000);
    if (d && Number.isFinite(Number(d.maxCredits))) credits.value = { plan: String(d.plan || ""), max: Number(d.maxCredits), used: Number(d.usedCredits) || 0 };
  } catch (_) {}
  credits.at = Date.now();
  return credits.value;
}

async function fromSupadata(url, waitMs) {
  if (!supadataEnabled()) return null;
  // Fetching a reel before transcribing it can take the service the better part of a minute.
  const first = await call("/transcript", { url, text: "true", mode: "auto" }, 75000);
  let text = plain(first.content);
  if (!text && first.jobId) {
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 5000));
      const job = await call("/transcript/" + encodeURIComponent(first.jobId));
      if (job.status === "completed") {
        text = plain(job.content);
        break;
      }
      if (job.status === "failed") throw new Error("the video could not be transcribed: " + (job.error || "unknown"));
    }
  }
  count("supadata");
  return { text, how: "supadata" };
}

// ── the transcript ───────────────────────────────────────────────────────────
// "" when the video has none (no speech, private, deleted) or no way is set up. `video_url` is
// the file when the caller already knows it (the followed creators' reels), `lang` the caption's
// language. A long Supadata job is waited for up to `waitMs`, and a later call picks it up.
// `fileOnly` keeps the paid service out of it (the voice study reads the page's own files).
export async function videoTranscript(url, { waitMs = 90000, video_url = "", lang = "", fileOnly = false } = {}) {
  if (!transcriptsEnabled() || !isVideoUrl(url)) return "";
  const hit = cache.get(url);
  if (hit && hit.text !== undefined && Date.now() - hit.ts < KEEP_MS) return hit.text;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    let got = null;
    try {
      got = await fromFile(url, { video_url, lang });
    } catch (e) {
      console.log("[transcript] file way failed:", url, String(e.message || e).slice(0, 160));
    }
    if (!got && !fileOnly) got = await fromSupadata(url, waitMs);
    if (!got) {
      count("none");
      return { text: "", how: "none" };
    }
    return got;
  })();
  cache.set(url, { pending: pending.then((g) => g.text) });
  try {
    const got = await pending;
    cache.set(url, { text: got.text, ts: Date.now(), how: got.how });
    return got.text;
  } catch (e) {
    cache.delete(url);
    throw e;
  }
}

// Which way the last transcript of a video came, for logs ("groq" | "openai" | "supadata" | "none").
export function transcriptWay(url) {
  const hit = cache.get(url);
  return (hit && hit.how) || "";
}

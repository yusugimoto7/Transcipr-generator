// What a video says, as text: a reel, TikTok, YouTube video or Short, X or Facebook video has no
// article to read, and scraping its page gives the site's chrome and comments instead (Hamed,
// Oct 24 2026: a reel's "original text" was Instagram's login prompts and other people's
// comments). Supadata transcribes it, the same service the n8n script bot uses. Off unless
// SUPADATA_API_KEY is set; then lib/news.js fetchArticleText returns the transcript for such links.

const API = "https://api.supadata.ai/v1/transcript";
const KEEP_MS = 24 * 60 * 60 * 1000;
const cache = globalThis.__videoTranscripts || (globalThis.__videoTranscripts = new Map()); // url -> { text, ts } | { pending }

export function transcriptsEnabled() {
  return !!process.env.SUPADATA_API_KEY;
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

const plain = (content) =>
  typeof content === "string" ? content.trim() : Array.isArray(content) ? content.map((s) => (s && s.text) || "").join(" ").trim() : "";

async function call(path, params, timeoutMs = 30000) {
  const res = await fetch(API + path + (params ? "?" + new URLSearchParams(params) : ""), {
    headers: { "x-api-key": process.env.SUPADATA_API_KEY },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) throw new Error((d && (d.message || d.error)) || `transcript service ${res.status}`);
  return d;
}

// The transcript, or "" when the video has none (no speech, private, deleted). A long video is
// transcribed as a job; it is waited for up to `waitMs`, and a later call picks the result up.
export async function videoTranscript(url, { waitMs = 90000 } = {}) {
  if (!transcriptsEnabled() || !isVideoUrl(url)) return "";
  const hit = cache.get(url);
  if (hit && hit.text !== undefined && Date.now() - hit.ts < KEEP_MS) return hit.text;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    // Fetching a reel before transcribing it can take the service the better part of a minute.
    const first = await call("", { url, text: "true", mode: "auto" }, 75000);
    let text = plain(first.content);
    if (!text && first.jobId) {
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 5000));
        const job = await call("/" + encodeURIComponent(first.jobId));
        if (job.status === "completed") {
          text = plain(job.content);
          break;
        }
        if (job.status === "failed") throw new Error("the video could not be transcribed: " + (job.error || "unknown"));
      }
    }
    return text;
  })();
  cache.set(url, { pending });
  try {
    const text = await pending;
    cache.set(url, { text, ts: Date.now() });
    return text;
  } catch (e) {
    cache.delete(url);
    throw e;
  }
}

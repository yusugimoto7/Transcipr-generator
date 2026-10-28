// What a video says, as text: a reel, TikTok, YouTube video or Short, X or Facebook video has no
// article to read, and scraping its page gives the site's chrome and comments instead (Hamed,
// Oct 24 2026: a reel's "original text" was Instagram's login prompts and other people's
// comments). Supadata transcribes it, the same service the n8n script bot uses. Off unless
// SUPADATA_API_KEY is set; then lib/news.js fetchArticleText returns the transcript for such links.

const API = "https://api.supadata.ai/v1";
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

// The service answers "Limit Exceeded" both when its monthly credits are spent and when two
// requests land in the same second (the free plan allows one a second; the social lane, a script
// and a job's status checks can coincide). Requests therefore wait their turn, a little over a
// second apart, and one that is refused for its rate is asked again once.
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
  if (!transcriptsEnabled()) return null;
  if (!fresh && credits.value && Date.now() - credits.at < 10 * 60 * 1000) return credits.value;
  try {
    const d = await call("/me", null, 15000);
    if (d && Number.isFinite(Number(d.maxCredits))) credits.value = { plan: String(d.plan || ""), max: Number(d.maxCredits), used: Number(d.usedCredits) || 0 };
  } catch (_) {}
  credits.at = Date.now();
  return credits.value;
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

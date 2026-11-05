import { userForVoiceKey } from "../../../lib/voice/key";
import { parseLinks } from "../../../lib/custom-news";
import { startJob } from "../../../lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Share a post into the Topic Engine from the phone (Hamed, 5 Nov 2026: "whatever I see on Instagram,
// TikTok or YouTube, I press Share and it goes to the system as a topic it understands"). An iPhone
// Shortcut in the Share menu POSTs what was shared: { text } (a link, or a caption with a link in it)
// and optionally { note }, with the personal key from Settings as "Authorization: Bearer <key>" or
// ?k=<key>. The link becomes a topic under Studio → My sources exactly as one pasted there would
// (custom_news: a video is read as its transcript), and the person gets a notification when it is
// ready. The answer is one plain sentence, which the Shortcut shows as its notification.
// Open in access.js: the key is the check.

const SHORT = /^(www\.|m\.)?(facebook\.com\/share\/|fb\.watch\/|vm\.tiktok\.com\/|vt\.tiktok\.com\/|tiktok\.com\/t\/|instagr\.am\/)/i;

// A share link that only redirects (Facebook's /share/, TikTok's short links) becomes the post's own
// address, so the video is recognised as a video and read as its transcript.
async function resolve(url) {
  let u = url;
  try {
    for (let i = 0; i < 5 && SHORT.test(u.replace(/^https?:\/\//, "")); i++) {
      const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15" }, signal: AbortSignal.timeout(10000) });
      const loc = r.headers.get("location");
      if (!loc || /login|checkpoint/i.test(loc)) break;
      u = new URL(loc, u).toString();
    }
  } catch (_) {}
  return u;
}

async function body(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return request.json().catch(() => ({}));
  if (type.includes("form")) {
    const f = await request.formData().catch(() => null);
    if (!f) return {};
    // a Shortcut whose field was filled the other way round (the shared link as the field's name,
    // Nov 5 2026) still works: every name and value is searched for the link
    const all = [];
    for (const [k, v] of f.entries()) if (k !== "note") all.push(k, typeof v === "string" ? v : "");
    return { text: [f.get("text"), f.get("url"), ...all].filter(Boolean).join("\n"), note: f.get("note") || "" };
  }
  return { text: await request.text().catch(() => "") };
}

const reply = (text, status = 200) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function POST(request) {
  const q = new URL(request.url).searchParams;
  const key = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || q.get("k") || "";
  const user = await userForVoiceKey(key);
  const fa = (user && user.lang) !== "en";
  if (!user) return reply("کلید معتبر نیست؛ از تنظیمات Topic Engine دوباره کپی‌اش کن. / The key is not valid; copy it again from Settings.", 401);
  const b = await body(request);
  const text = [b.text, b.url].filter(Boolean).join("\n");
  const links = parseLinks(text, 3);
  if (!links.length) return reply(fa ? "لینکی پیدا نشد؛ از دکمهٔ Share خودِ پست بفرست." : "No link found; send it from the post's own Share button.", 400);
  const resolved = await Promise.all(links.map(resolve));
  // what came with the link (a caption, a few words typed in the Shortcut) frames the card, never its facts
  const rest = String(text).replace(/https?:\/\/[^\s<>"'،]+/gi, " ").replace(/\s+/g, " ").trim();
  const note = [String(b.note || "").trim(), rest].filter(Boolean).join(" · ").slice(0, 1500);
  try {
    startJob("custom_news", "share:" + resolved[0], { links: resolved, note, images: [], by_uid: user.id, shared_by: user.name || user.id });
  } catch (e) {
    return reply((fa ? "الان نشد: " : "Not now: ") + String(e.message || e), 503);
  }
  return reply(fa ? "رسید ✓ موضوعش تا یکی دو دقیقهٔ دیگه در استودیو ← منابع خودم آماده می‌شه." : "Got it ✓ The topic will be ready in Studio → My sources in a minute or two.");
}

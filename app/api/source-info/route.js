export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whose video a YouTube link is, for cards made before they carried the channel's name (Hamed,
// Oct 28 2026). YouTube's public oEmbed answers with the channel's name, no key needed; the
// answers are remembered, so a list of cards asks once per video.
//   GET ?url=<youtube link>  ->  { channel }
const memo = globalThis.__sourceInfoMemo || (globalThis.__sourceInfoMemo = new Map());

export async function GET(request) {
  const url = new URL(request.url).searchParams.get("url") || "";
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return Response.json({ error: "bad url" }, { status: 400 });
  }
  if (!/^(youtube\.com|m\.youtube\.com|youtu\.be)$/.test(host)) return Response.json({ channel: "" });
  if (memo.has(url)) return Response.json({ channel: memo.get(url) });
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url), { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    const d = res.ok ? await res.json().catch(() => ({})) : {};
    const channel = String(d.author_name || "").slice(0, 80);
    if (channel || res.status === 404 || res.status === 401) memo.set(url, channel);
    return Response.json({ channel });
  } catch (_) {
    return Response.json({ channel: "" });
  }
}

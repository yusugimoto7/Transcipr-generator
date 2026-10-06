import { getInstagramItems, instagramHandles } from "../../../lib/social/instagram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instagram source health: which creators could be read, by which method, and
// how many recent posts each gave. Shows no tokens. Open /api/social.
// ?refresh=1 waits for a fresh read instead of showing the last one.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request) {
  const wait = new URL(request.url).searchParams.get("refresh") === "1";
  const { items, status } = await getInstagramItems({ maxAgeDays: 30, wait });
  const rows = instagramHandles()
    .map((h) => {
      const st = (status.handles || {})[h];
      const n = items.filter((i) => i.author === h).length;
      const icon = !st ? "…" : st.error && !st.posts ? "❌" : n ? "✅" : "⚠️";
      const detail = !st ? "not read yet" : st.error ? `${esc(st.via)}: ${esc(st.error)}` : `${esc(st.via)} · ${n} post(s) in 30 days`;
      return `<tr><td>${icon}</td><td><a href="https://www.instagram.com/${esc(h)}/" target="_blank" rel="noopener">@${esc(h)}</a></td><td>${detail}</td></tr>`;
    })
    .join("");
  const sample = items
    .slice(0, 8)
    .map((i) => `<li><b>@${esc(i.author)}</b> · ${esc((i.published || "").slice(0, 10))} · <span dir="auto">${esc(i.title)}</span></li>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugimoto — Instagram sources</title><style>
body{margin:0;background:#f6f7f9;color:#121a24;font-family:Inter,system-ui,sans-serif;padding:18px;max-width:760px}
h1{font-size:19px;margin:0 0 4px}.sub{font-size:13px;color:#5b6675;margin-bottom:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:13.5px;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden}
td{padding:9px 10px;border-bottom:1px solid #eef0f3;vertical-align:top}td:first-child{width:24px}
a{color:#0e8a99}ul{font-size:13px;line-height:1.7;padding-left:18px}
</style></head><body>
<h1>Instagram sources</h1>
<div class="sub">Official API: <b>${esc(status.discovery || "…")}</b>${status.account ? " · " + esc(status.account) : ""}<br>
Apify: <b>${esc(status.apify || "…")}</b><br>${items.length} recent posts in the topic pool. <a href="?refresh=1">Read again now</a></div>
<table>${rows}</table>
${sample ? `<h3 style="font-size:15px;margin-top:20px">Latest posts</h3><ul>${sample}</ul>` : ""}
<div class="sub" style="margin-top:16px">✅ read · ⚠️ readable but nothing in 30 days · ❌ could not be read (a personal account needs Apify; a wrong handle should be removed from lib/creators.js)</div>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

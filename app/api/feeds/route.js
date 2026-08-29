import { checkFeeds } from "../../../lib/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-feed health, as an HTML table. Normal ingest swallows feed failures on
// purpose (one dead feed must never break a batch), so without this page a
// source can rot silently for months and simply stop contributing topics.
// Open /api/feeds to see which sources are actually feeding the engine.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const rows = await checkFeeds();
  const ok = rows.filter((r) => r.ok);
  const live = ok.filter((r) => (r.within30d || 0) > 0);
  const fresh = ok.reduce((n, r) => n + (r.within30d || 0), 0);

  const body = rows
    .map((r) => {
      const stale = r.ok && !(r.within30d > 0);
      const icon = !r.ok ? "❌" : stale ? "⚠️" : "✅";
      const detail = !r.ok
        ? esc(r.error)
        : `${r.items} items · ${r.within30d} within 30d · newest ${
            r.newestDays == null ? "undated" : r.newestDays + "d ago"
          }`;
      return `<tr><td class="i">${icon}</td><td class="n">${esc(r.name)}<div class="u">${esc(
        r.url.slice(0, 96)
      )}</div></td><td class="d">${detail}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugimoto — Feed Health</title><style>
body{margin:0;background:#16282f;color:#f2e5c0;font-family:system-ui,-apple-system,sans-serif;padding:18px}
h1{font-size:19px;margin:0 0 4px}
.sub{font-size:12px;color:rgba(242,229,192,.55);margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:9px 6px;border-bottom:1px solid rgba(242,229,192,.12);vertical-align:top}
td.i{width:24px}td.n{width:44%;font-weight:600}
.u{font-weight:400;font-size:10.5px;color:rgba(242,229,192,.4);word-break:break-all;margin-top:3px}
td.d{color:rgba(242,229,192,.7)}
.f{margin-top:18px;font-size:11.5px;color:rgba(242,229,192,.45);line-height:1.6}
</style></head><body>
<h1>Sugimoto — Feed Health</h1>
<div class="sub">${live.length} of ${rows.length} feeds delivering recent news · ${fresh} articles within 30 days · ${esc(
    new Date().toISOString()
  )}</div>
<table>${body}</table>
<div class="f">✅ working · ⚠️ reachable but nothing in the last 30 days · ❌ unreachable.<br>
A ❌ or ⚠️ feed is skipped silently during topic generation — it costs you variety, not correctness.</div>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

import { getLexbaseItems, getLexbaseItem } from "../../../../../lib/newsletter/lexbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The text of one Lexbase item, so a card from a policy note (which has no
// public web page) still has a link that opens something readable.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(_request, { params }) {
  await getLexbaseItems({ waitMs: 4000 });
  const it = getLexbaseItem(params.issue, params.n);
  if (!it) {
    return new Response("Not found (the item may not be loaded yet — try again in a minute).", { status: 404 });
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(it.title)} — Lexbase ${esc(it.issue)}</title><style>
body{margin:0;background:#f6f7f9;color:#121a24;font-family:Inter,system-ui,sans-serif;padding:18px;max-width:720px;line-height:1.7}
h1{font-size:20px;margin:0 0 6px}.sub{font-size:13px;color:#5b6675;margin-bottom:16px}
.box{background:#fff;border:1px solid #e6e8ec;border-radius:14px;padding:16px 18px;font-size:15px;white-space:pre-wrap}
a{color:#0e8a99}
</style></head><body>
<h1>${esc(it.title)}</h1>
<div class="sub">Lexbase ${esc(it.issue)} · item ${esc(it.n)} · ${esc(it.kind)}${it.citation ? " · " + esc(it.citation) : ""} · <a href="/api/lexbase">all items</a></div>
<div class="box">${esc(it.text)}</div>
<p class="sub" style="margin-top:14px">Source: Lexbase, Kurland Tobe — subscription newsletter. Shown here for the editor's own research only.</p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

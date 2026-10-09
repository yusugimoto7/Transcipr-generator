import { getLexbaseItems, lexbaseEnabled, LEXBASE_SENDER } from "../../../lib/newsletter/lexbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lexbase source health: mailbox connection, issues found, items per issue.
// Shows no credentials. ?refresh=1 re-reads the mailbox now.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request) {
  const wait = new URL(request.url).searchParams.get("refresh") === "1";
  const { items, status } = await getLexbaseItems({ wait, waitMs: wait ? 0 : 1500 });
  const rows = (status.issues || [])
    .map(
      (i) =>
        `<tr><td>${i.error ? "❌" : i.items ? "✅" : "⚠️"}</td><td>${esc(i.key)}<div class="u">${esc(i.subject)}</div></td><td>${
          i.error ? esc(i.error) : `${i.items} items (${i.court || 0} court)${i.cached ? " · cached" : ""}`
        }</td></tr>`
    )
    .join("");
  const list = items
    .slice(0, 40)
    .map(
      (it) =>
        `<li><a href="${esc(it.source_url)}" target="_blank" rel="noopener">${esc(it.title)}</a> <span class="k">${esc(it.kind)}${
          it.citation ? " · " + esc(it.citation) : ""
        }</span></li>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugimoto — Lexbase</title><style>
body{margin:0;background:#f6f7f9;color:#121a24;font-family:Inter,system-ui,sans-serif;padding:18px;max-width:760px}
h1{font-size:19px;margin:0 0 4px}.sub{font-size:13px;color:#5b6675;margin-bottom:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:13.5px;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden}
td{padding:9px 10px;border-bottom:1px solid #eef0f3;vertical-align:top}td:first-child{width:24px}
.u{font-size:11.5px;color:#8b95a3}.k{font-size:11.5px;color:#8b95a3}a{color:#0e8a99}ul{font-size:13px;line-height:1.8;padding-left:18px}
</style></head><body>
<h1>Lexbase newsletter</h1>
<div class="sub">${lexbaseEnabled() ? `Reads mail from <b>${esc(LEXBASE_SENDER)}</b> in ${esc(process.env.GMAIL_USER)} (read-only).` : "Not configured: set GMAIL_USER and GMAIL_APP_PASSWORD in Render."}<br>
Mailbox: <b>${esc(status.mailbox || (status.pending ? "reading…" : "…"))}</b>${status.checkedAt ? " · checked " + esc(status.checkedAt.slice(0, 16).replace("T", " ")) + " UTC" : ""}<br>
${items.length} items in the topic pool. <a href="?refresh=1">Read the mailbox again now</a></div>
<table>${rows || `<tr><td>…</td><td colspan="2">${status.pending ? "first read in progress — reload in a few seconds" : "no issues found in the look-back window"}</td></tr>`}</table>
${list ? `<h3 style="font-size:15px;margin-top:20px">Items</h3><ul>${list}</ul>` : ""}
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

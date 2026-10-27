import { pollSocialLane, laneStatus, laneCards } from "../../../lib/social/lane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The social lane's health (lib/social/lane.js): when it last read the followed accounts, which
// feeds answered, how many posts it saw, what became a card and why the rest did not, today's
// counts against the caps. ?poll=1 reads the accounts now; ?json=1 gives the same as data.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  if (q.get("poll") === "1") await pollSocialLane({ reason: "by hand" });
  const st = laneStatus();
  const cards = laneCards().slice(0, 40);
  if (q.get("json") === "1") return Response.json({ ...st, cards }, { headers: { "Cache-Control": "no-store" } });
  const feeds = st.feeds
    .map((f) => `<tr><td>${f.ok ? (f.count ? "✅" : "⚠️") : "❌"}</td><td>${esc(f.name)}</td><td>${f.ok ? f.count + " posts" : esc(f.error)}</td></tr>`)
    .join("");
  const polls = st.log
    .slice(0, 20)
    .map(
      (l) =>
        `<tr><td>${esc(l.at.slice(0, 16).replace("T", " "))}</td><td>${esc(l.reason)}</td><td>${l.posts} / ${l.fresh}</td><td><b>${l.made}</b></td><td>${esc(
          Object.entries(l.skipped || {})
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")
        )}${l.unanswered ? ` · unanswered ${l.unanswered}` : ""}</td></tr>`
    )
    .join("");
  const list = cards
    .map((c) => `<li><span dir="auto"><b>${esc(c.title_fa)}</b></span> — ${esc(c.author || c.source_name)}${c.video ? " 🎬" : ""} · ${esc(c.date)} · ${esc(c.grounding)}</li>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugimoto — Social lane</title><style>
body{margin:0;background:#f6f7f9;color:#121a24;font-family:Inter,system-ui,sans-serif;padding:18px;max-width:820px}
h1{font-size:19px;margin:0 0 4px}h3{font-size:15px;margin:20px 0 6px}.sub{font-size:13px;color:#5b6675;margin-bottom:14px;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden}
td{padding:7px 9px;border-bottom:1px solid #eef0f3;vertical-align:top}td:first-child{white-space:nowrap}
a{color:#0e8a99}ul{font-size:13px;line-height:1.7;padding-left:18px}.err{color:#b42318}
</style></head><body>
<h1>Social lane</h1>
<div class="sub">${st.enabled ? "On" : "Off (no writing model, or SOCIAL_LANE=off)"} · transcripts ${st.transcripts ? "on" : "off (SUPADATA_API_KEY)"} · last read ${esc(st.last_poll || "never")}${st.polling ? " (reading now)" : ""}<br>
Today (${esc(st.today.date)}): <b>${st.today.cards}</b> cards · ${st.today.transcripts} transcripts · by account: ${esc(
    Object.entries(st.today.by_account || {})
      .map(([k, v]) => `${k} ${v}`)
      .join(", ") || "—"
  )}<br>
${st.cards} cards kept (7 days) · ${st.seen} posts remembered${st.error ? `<br><span class="err">${esc(st.error)}</span>` : ""}<br>
<a href="?poll=1">Read the accounts now</a> · <a href="?json=1">JSON</a></div>
<h3>Feeds at the last read</h3><table>${feeds || "<tr><td>—</td><td colspan=2>not read yet</td></tr>"}</table>
<h3>Reads</h3><div class="sub">posts seen / new to the lane · cards made · what the rest were</div><table>${polls || "<tr><td colspan=5>—</td></tr>"}</table>
<h3>Latest cards</h3><ul>${list || "<li>—</li>"}</ul>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

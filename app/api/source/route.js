import { fetchArticleText } from "../../../lib/news";
import { getLexbaseItems, findLexbaseItem, getLexbaseIssueText } from "../../../lib/newsletter/lexbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The original text behind a topic, for the "Original text" tab: the
// newsletter item (and, on request, the whole issue) or the article itself.
// Only the topic's own link is fetched, and never an internal address, so
// this cannot be used to reach the server's private network.
function publicHttpUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.includes(":")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

export async function POST(request) {
  const { topic, whole } = await request.json().catch(() => ({}));
  if (!topic) return Response.json({ error: "no topic" }, { status: 400 });

  if (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || "")) {
    await getLexbaseItems({ waitMs: 8000 });
    const it = findLexbaseItem(topic);
    const issueKey = (it && it.issue) || topic.issue || "";
    if (whole) {
      const doc = getLexbaseIssueText(issueKey);
      if (!doc || !doc.text) return Response.json({ error: "The newsletter is not loaded yet — try again in a minute." }, { status: 404 });
      return Response.json({ kind: "lexbase-issue", title: doc.subject, text: doc.text });
    }
    if (it) {
      return Response.json({
        kind: "lexbase",
        title: it.title + (it.citation ? " — " + it.citation : ""),
        text: it.text,
        issue: { key: it.issue, subject: (getLexbaseIssueText(it.issue) || {}).subject || "" },
      });
    }
  }

  let text = "";
  if (topic.source_url && publicHttpUrl(topic.source_url)) {
    text = await fetchArticleText(topic.source_url, { timeoutMs: 10000, maxChars: 20000 }).catch(() => "");
  }
  if (text && text.length > (topic.snippet || "").length) return Response.json({ kind: "article", text });
  if (topic.snippet) return Response.json({ kind: "snippet", text: topic.snippet });
  return Response.json({ error: "The original text could not be read from the source page." }, { status: 404 });
}

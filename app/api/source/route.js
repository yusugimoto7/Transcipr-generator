import { fetchArticleText } from "../../../lib/news";
import { getLexbaseItems, findLexbaseItem, getLexbaseIssueText } from "../../../lib/newsletter/lexbase";
import { topicLink, socialPostText } from "../../../lib/grounding";

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

  // A topic made from uploaded pictures: the word-for-word transcription.
  if (topic.image_text) {
    return Response.json({ kind: "pictures", title: `Text read from ${topic.images_count || ""} uploaded picture(s)`, text: topic.image_text });
  }

  if (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || "")) {
    await getLexbaseItems({ waitMs: 8000 });
    const it = findLexbaseItem(topic);
    const issueKey = (it && it.issue) || topic.issue || "";
    if (whole) {
      const doc = getLexbaseIssueText(issueKey);
      if (!doc || !doc.text) return Response.json({ error: "The newsletter is not loaded yet — try again in a minute." }, { status: 404 });
      return Response.json({ kind: "lexbase-issue", title: doc.subject, text: doc.text, issue: { key: doc.key, subject: doc.subject } });
    }
    if (it) {
      return Response.json({
        kind: "lexbase",
        title: it.title + (it.citation ? " — " + it.citation : ""),
        text: it.text,
        issue: { key: it.issue, subject: (getLexbaseIssueText(it.issue) || {}).subject || "" },
      });
    }
    // The item's text as stored on the card, rather than whatever page the link points at.
    if (String(topic.snippet || "").length >= 200) return Response.json({ kind: "lexbase", title: "Lexbase newsletter — this item (as stored on the card)", text: topic.snippet, ...(issueKey ? { issue: { key: issueKey, subject: "" } } : {}) });
  }

  let text = "";
  const link = topicLink(topic);
  // a post on a social network: its words, its video's transcript and what it links to
  const held = topic.social && String(topic.snippet || "").length >= 200;
  const post = link && publicHttpUrl(link) && !held ? await socialPostText(link, 20000) : null;
  if (post) {
    if (post.text) return Response.json({ kind: "post", title: post.why.length ? "Not everything could be read: " + post.why.join("; ") : "", text: post.text });
    if (!topic.snippet) return Response.json({ error: "The post could not be read: " + (post.why.join("; ") || "nothing came back") }, { status: 404 });
  }
  if (!post && link && publicHttpUrl(link)) {
    text = await fetchArticleText(link, { timeoutMs: 10000, maxChars: 20000 }).catch(() => "");
  }
  if (text && text.length > (topic.snippet || "").length) return Response.json({ kind: "article", text });
  if (topic.snippet) return Response.json({ kind: "snippet", text: topic.snippet });
  return Response.json({ error: "The original text could not be read from the source page." }, { status: 404 });
}

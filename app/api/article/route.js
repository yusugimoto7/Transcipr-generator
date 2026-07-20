import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiArticle } from "../../../lib/openai";
import { getInternalLinks } from "../../../lib/wordpress";
import { articlePrompt, parseArticle } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s) {
  const out = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "immigration-news-" + Date.now();
}

export async function POST(request) {
  try {
    const { topic } = await request.json();
    if (!topic || !(topic.title_fa || topic.title_en)) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Pull the site's pages as the allowed internal-link list (public, no auth).
    const links = await getInternalLinks();
    const today = new Date().toLocaleDateString("en-CA");
    const prompt = articlePrompt(topic, links, today);

    let text = "";
    let provider = "anthropic";
    if (openaiEnabled()) {
      try {
        text = await openaiArticle(prompt);
        provider = "openai";
      } catch (e) {
        if (!process.env.ANTHROPIC_API_KEY) throw e;
        text = await callClaude([{ role: "user", content: prompt }], false, 6000);
        provider = "anthropic (openai failed)";
      }
    } else {
      text = await callClaude([{ role: "user", content: prompt }], false, 6000);
    }

    const a = parseArticle(text);

    // Assemble final HTML: article body + a source-credit paragraph.
    const srcName = (() => {
      try {
        return new URL(topic.source_url).hostname.replace(/^www\./, "");
      } catch (_) {
        return "منبع خبر";
      }
    })();
    const hasHtml = a.content_html && a.content_html.indexOf("<") !== -1;
    const body = hasHtml ? a.content_html : `<p>${topic.why_now || ""}</p>`;
    const sourceP = topic.source_url
      ? `<p><strong>منبع:</strong> <a href="${topic.source_url}" target="_blank" rel="noopener nofollow">${srcName}</a></p>`
      : "";

    return Response.json({
      provider,
      article: {
        title_fa: a.title_fa || topic.title_fa || topic.title_en,
        slug: slugify(a.slug_en),
        meta_description: a.meta_description || "",
        focus_keyword: a.focus_keyword || "",
        excerpt: a.excerpt || "",
        tags: a.tags || "",
        content_html: body + sourceP,
        source_url: topic.source_url || "",
        parse_ok: !!(a.title_fa && hasHtml),
      },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

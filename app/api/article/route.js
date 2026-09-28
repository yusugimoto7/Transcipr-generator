import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiArticle } from "../../../lib/openai";
import { getArticleLinks } from "../../../lib/wordpress";
import { fetchArticleText } from "../../../lib/news";
import { articlePrompt, parseArticle, ARTICLE_MIN_CHARS, ARTICLE_MAX_CHARS } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(s) {
  const out = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || "immigration-news-" + Date.now();
}

// Length of the visible article text: tags removed, whitespace collapsed,
// spaces counted, measured in characters (not UTF-16 units).
function visibleChars(html) {
  const t = String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(t).length;
}

export async function POST(request) {
  try {
    const { topic } = await request.json();
    if (!topic || !(topic.title_fa || topic.title_en)) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Site pages/posts relevant to THIS topic (searched), then the main pages,
    // as the allowed internal-link list (public, no auth).
    const links = await getArticleLinks(topic);
    const today = new Date().toLocaleDateString("en-CA");
    // Ground the article in the REAL source article text (never fabricate).
    let sourceText = "";
    if (topic.source_url) sourceText = await fetchArticleText(topic.source_url).catch(() => "");
    if (!sourceText && topic.snippet) sourceText = String(topic.snippet);
    const prompt = articlePrompt(topic, links, today, sourceText);

    async function generate(p) {
      if (openaiEnabled()) {
        try {
          return { text: await openaiArticle(p), provider: "openai" };
        } catch (e) {
          if (!process.env.ANTHROPIC_API_KEY) throw e;
          return {
            text: await callClaude([{ role: "user", content: p }], false, 6000),
            provider: "anthropic (openai failed)",
          };
        }
      }
      return { text: await callClaude([{ role: "user", content: p }], false, 6000), provider: "anthropic" };
    }

    let { text, provider } = await generate(prompt);

    // Enforce the length here rather than trusting the model to count Farsi
    // characters. One retry with the measured length; a small tolerance on
    // the first check avoids paying for a retry over a few characters.
    let a = parseArticle(text);
    let chars = visibleChars(a.content_html);
    const TOL = 60;
    if (a.content_html && (chars < ARTICLE_MIN_CHARS - TOL || chars > ARTICLE_MAX_CHARS + TOL)) {
      const fix =
        `\n\nCORRECTION: your previous body was ${chars} visible characters. It must be between ` +
        `${ARTICLE_MIN_CHARS} and ${ARTICLE_MAX_CHARS}. Rewrite the whole article to fit, ` +
        (chars > ARTICLE_MAX_CHARS ? "cutting detail, not facts that matter." : "adding only facts from the source.") +
        " Same output format.";
      try {
        const retry = await generate(prompt + fix);
        const a2 = parseArticle(retry.text);
        const c2 = visibleChars(a2.content_html);
        const dist = (c) => (c < ARTICLE_MIN_CHARS ? ARTICLE_MIN_CHARS - c : c > ARTICLE_MAX_CHARS ? c - ARTICLE_MAX_CHARS : 0);
        if (a2.content_html && dist(c2) < dist(chars)) {
          a = a2;
          chars = c2;
          provider = retry.provider;
        }
      } catch (_) {}
    }


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
        length_chars: chars,
      },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

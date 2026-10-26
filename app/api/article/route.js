import { callClaude } from "../../../lib/anthropic";
import { lessonsBlock } from "../../../lib/learning";
import { glossaryBlock } from "../../../lib/glossary";
import { openaiEnabled, openaiArticle } from "../../../lib/openai";
import { getArticleLinks } from "../../../lib/wordpress";
import { sourceTextFor } from "../../../lib/grounding";
import { editorNoteBlock } from "../../../lib/custom-news";
import { englishBlock, langOf } from "../../../lib/lang";
import { cleanText, cleanHtml } from "../../../lib/clean-text";
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
    const { topic, lang: asked } = await request.json();
    const lang = langOf(asked);
    if (!topic || !(topic.title_fa || topic.title_en)) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Site pages/posts relevant to THIS topic (searched), then the main pages,
    // as the allowed internal-link list (public, no auth).
    const links = await getArticleLinks(topic);
    const today = new Date().toLocaleDateString("en-CA");
    // Ground the article in the REAL source article text (never fabricate).
    const sourceText = await sourceTextFor(topic, { maxChars: 5000 });
    const prompt = articlePrompt(topic, links, today, sourceText) + editorNoteBlock(topic, "en") + (await lessonsBlock("article")) + (await glossaryBlock(lang === "en" ? "en" : "fa")) + (lang === "en" ? englishBlock("article") : "");

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
        return lang === "en" ? "Source" : "منبع خبر";
      }
    })();
    const hasHtml = a.content_html && a.content_html.indexOf("<") !== -1;
    const body = hasHtml ? a.content_html : `<p>${topic.why_now || ""}</p>`;
    const sourceP = topic.source_url
      ? `<p><strong>${lang === "en" ? "Source:" : "منبع:"}</strong> <a href="${topic.source_url}" target="_blank" rel="noopener nofollow">${srcName}</a></p>`
      : "";

    return Response.json({
      provider,
      article: {
        // The field keeps its old name; for an English article it holds the English title.
        title_fa: cleanText(a.title_fa || (lang === "en" ? topic.title_en || topic.title_fa : topic.title_fa || topic.title_en), { lang }),
        lang,
        slug: slugify(a.slug_en) + (lang === "en" ? "-en" : ""),
        meta_description: cleanText(a.meta_description || "", { lang }),
        focus_keyword: a.focus_keyword || "",
        excerpt: cleanText(a.excerpt || "", { lang }),
        tags: a.tags || "",
        content_html: cleanHtml(body, { lang }) + sourceP,
        source_url: topic.source_url || "",
        parse_ok: !!(a.title_fa && hasHtml),
        length_chars: chars,
      },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// The script written for a topic, cut into story pages and carousel slides by rule, never by a model
// (Hamed, Nov 11 2026: "the story and the carousel must say exactly what the script says; I like the
// script's words, they read like mine, but the carousels and stories came out in another tone").
// Every word on a page or slide is the script's own; only the spoken close that asks for a comment
// word is left out, and the carousel ends on the fixed consultation slide below.

export const sentencesOf = (t) => String(t || "").match(/[^.!?؟…]+(?:[.!?؟…]+["»”)]*|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];
export const isCallToComment = (x) => /کامنت|comment|لینک\s*(?:در|تو)\s*بایو|link in (?:the |my )?bio/i.test(x);

// The carousel's last slide, always the same (Hamed, Nov 11 2026: not "Sugimoto Visa's consultants",
// a consultation with Hamed himself, and the word to comment is «مشاوره»).
export const CAROUSEL_CTA = {
  fa: { title: "مشاوره با آقای حامد سوگیموتو", body: "کلمهٔ «مشاوره» رو کامنت بگذار." },
  en: { title: "A consultation with Hamed Sugimoto", body: "Tap the link in our bio to book it." }, // English: the bio link, never "comment the word" (Oct 24 2026)
};
export const carouselCtaLine = (lang = "fa") => (lang === "en" ? "Book a consultation with Hamed Sugimoto: tap the link in our bio." : "برای مشاوره با آقای حامد سوگیموتو، کلمهٔ «مشاوره» رو کامنت بگذار.");

// paragraphs, each a list of sentences, without the comment-word close
export function scriptParagraphs(script) {
  return String(script || "")
    .replace(/\r/g, "")
    .split(/\n\s*\n+/)
    .map((p) => sentencesOf(p.replace(/\s*\n\s*/g, " ")).filter((x) => !isCallToComment(x)))
    .filter((p) => p.length);
}

const lenOf = (sents) => sents.join(" ").length;
const chunkLen = (c) => c.reduce((a, p) => a + lenOf(p), 0);

// n groups in the script's order; a group is a list of paragraphs. Too many paragraphs: the shortest
// neighbouring pair is joined; too few: the longest group is cut at the paragraph break nearest its
// middle, or inside its one paragraph at the sentence end nearest its middle.
export function scriptChunks(paras, n) {
  let chunks = paras.map((p) => [p]);
  if (!chunks.length) return [];
  while (chunks.length > n) {
    let best = 0;
    for (let i = 1; i < chunks.length - 1; i++) if (chunkLen(chunks[i]) + chunkLen(chunks[i + 1]) < chunkLen(chunks[best]) + chunkLen(chunks[best + 1])) best = i;
    chunks.splice(best, 2, [...chunks[best], ...chunks[best + 1]]);
  }
  while (chunks.length < n) {
    const i = chunks.reduce((b, c, k) => ((c.length > 1 || c[0].length > 1) && (b < 0 || chunkLen(c) > chunkLen(chunks[b])) ? k : b), -1);
    if (i < 0) break;
    const [a, b] = halves(chunks[i]);
    chunks.splice(i, 1, a, b);
  }
  return chunks;
}

// a group cut in two near its middle: at a paragraph break when it has two or more, else at a sentence end
function halves(chunk) {
  const total = chunkLen(chunk);
  if (chunk.length > 1) {
    let k = 1, best = Infinity;
    for (let j = 1; j < chunk.length; j++) {
      const d = Math.abs(chunkLen(chunk.slice(0, j)) - total / 2);
      if (d < best) (best = d), (k = j);
    }
    return [chunk.slice(0, k), chunk.slice(k)];
  }
  const s = chunk[0];
  let k = 1, best = Infinity;
  for (let j = 1; j < s.length; j++) {
    const d = Math.abs(lenOf(s.slice(0, j)) - total / 2);
    if (d < best) (best = d), (k = j);
  }
  return [[s.slice(0, k)], [s.slice(k)]];
}

const textOf = (chunk, sep = " ") => chunk.map((p) => p.join(" ")).join(sep).trim();

// Story pages: the whole script over `count` pages, each page's words in two parts, above the
// screenshot (headline) and under it (body), cut near the middle (Hamed's own one-page story).
export function storyPagesFromScript(script, count, { min = 1, max = 4 } = {}) {
  const n = Math.max(min, Math.min(max, Number(count) || 1));
  return scriptChunks(scriptParagraphs(script), n).map((c) => {
    const one = c.length === 1 && c[0].length === 1;
    if (one) return { headline: c[0][0], body: "" };
    const [a, b] = halves(c);
    return { headline: textOf(a), body: textOf(b) };
  });
}

// Carousel slides: the script's first sentence is the cover, the rest of it over the middle slides
// (each slide's first sentence its heading, the rest its body), then the fixed consultation slide.
export function carouselSlidesFromScript(script, count, { min = 3, max = 10, lang = "fa" } = {}) {
  const n = Math.max(min, Math.min(max, Number(count) || 7));
  const paras = scriptParagraphs(script);
  if (!paras.length) return null;
  const cover = paras[0][0];
  const rest = [paras[0].slice(1), ...paras.slice(1)].filter((p) => p.length);
  const middle = rest.length ? scriptChunks(rest, Math.max(1, n - 2)) : [];
  const cta = CAROUSEL_CTA[lang === "en" ? "en" : "fa"];
  const contents = [
    cover,
    ...middle.map((c) => {
      const [first, ...others] = c[0];
      const body = [others.join(" "), ...c.slice(1).map((p) => p.join(" "))].filter(Boolean).join("\n");
      return [first, body].filter(Boolean).join("\n");
    }),
    `${cta.title}\n${cta.body}`,
  ];
  return {
    slides: contents.map((content, i) => ({ num: i + 1, content })),
    caption: `${cover}\n\n${carouselCtaLine(lang)}`,
  };
}

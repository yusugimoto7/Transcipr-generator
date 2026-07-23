// Shared prompt + parsing logic for the Sugimoto Topic Engine.

// Topic feed prompt. `todayStr` (YYYY-MM-DD) is injected so the model anchors
// its search to the real current date instead of drifting to older events;
// `excludeTitles` are already-shown topics the model should avoid repeating.
export function topicPrompt(todayStr, excludeTitles = []) {
  const year = todayStr.slice(0, 4);
  const excludeBlock = excludeTitles.length
    ? `\n\nAVOID REPEATS: do NOT return any topic that duplicates or closely overlaps these already-shown titles:\n${excludeTitles
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "";

  return `You are the content strategist for Sugimoto Visa, a Persian-language Canadian & European immigration brand (Instagram @sugimotovisa, and @sugimotovisa.europe). The audience is Persian-speaking (Iranian) immigrants and aspirants.

TODAY'S DATE IS ${todayStr}. Recency is the single most important rule — this is non-negotiable.

Use web search to find the MOST RECENT important Canada immigration developments. HARD RULES on recency:
- Strongly prefer items from the LAST 7 DAYS (on or after 7 days before ${todayStr}).
- NEVER include anything older than 30 days from ${todayStr}. If an article/announcement is dated more than a month ago, DROP it — do not put it on the list.
- Ignore anything from before ${year} entirely.
- Put the item's real publication date in "why_now", and only keep it if that date is within the last 30 days.
- Always include the current year (${year}) and words like "this week"/"latest" in your queries, and sort/prefer the newest results.
If you genuinely cannot find 10 items that are all recent enough, fill the remainder with EVERGREEN how-to topics (below) rather than padding the list with outdated news.

HARD EXCLUSION — DO NOT include any of these; the brand already covers them:
- Express Entry DRAW results, CRS cut-off scores, "latest draw" / "newest draw" announcements, or number-of-invitations round-ups. NONE of these. If a development is basically "Canada held an Express Entry draw / the CRS score was X", SKIP it entirely.
Focus instead on: Provincial Nominee Programs (especially BC PNP), study permits & PGWP, work permits & LMIA, IRCC policy/rule changes, bans/caps/deadlines, notable Federal Court decisions, and Europe (Germany Opportunity Card, Portugal, etc.).

IMPORTANT — be efficient with searches: do at most ${"5"} web searches total. Use broad, batched queries (e.g. "Canada immigration news this week ${year} PNP PGWP work permit policy change") that surface several developments at once, then a couple of follow-ups for specifics or Europe. A handful of well-chosen searches is enough.

Generate exactly 10 short-video topic ideas optimized for engagement with THIS audience:
- About 7 must be tied to a SPECIFIC, very recent (last 30 days) development — include the concrete detail AND its date in "why_now" and the machine-readable date in "date".
- About 3 must be EVERGREEN educational/how-to topics that are always useful and NOT tied to a news event — e.g. "what you can do to stay in Canada after your PGWP expires", "how to move from a work permit to permanent residence", "the biggest mistakes that get an application refused". For these, "date" is "".
- Every one of the 10 must be a DISTINCT topic based on a DIFFERENT development/article. NEVER return two entries about the same news item, the same underlying article, or the same development worded differently. No duplicates or near-duplicates.

Proven winning patterns in this niche: (1) name "Iranians" directly in hooks, (2) high-stakes / anxiety framing (permit ending, refusal, deadline, ban), (3) rejection-reversal & real case stories, (4) BC PNP & occupation-specific, (5) Europe is uncontested white space. Anxiety + specificity beat generic eligibility overviews.${excludeBlock}

Return ONLY a JSON array (no markdown fences, no preamble, no trailing text) of exactly 10 objects with keys:
- "title_fa": the Farsi hook/title, punchy and ready to put on screen
- "title_en": short English title
- "field": one of "PNP","Study","Work Permit","LMIA","Policy","Court","Europe" (do NOT use "Express Entry")
- "page": "CA" or "EU"
- "why_now": ONE sentence in Persian. For news topics, tie it to the specific recent development and include its date. For evergreen topics, explain why it's always relevant.
- "date": for a NEWS topic, the development's real publication/announcement date in strict "YYYY-MM-DD" format (must be within the last 30 days of ${todayStr}). For an EVERGREEN topic, an empty string "".
- "source_url": REQUIRED for every topic — it must NEVER be empty. For a NEWS topic, the exact, real URL of the specific web page (from your search results) it is based on; use the actual URL from a search result, never a made-up or generic homepage link. For an EVERGREEN topic (not tied to one article), give the single most relevant official government reference page (e.g. the specific IRCC.ca / canada.ca page for that program, or the relevant official European immigration page) — a real, working, specific URL, never a bare homepage and never empty.
- "score": integer 60-98 engagement-potential score
Order by "score" descending. Output the JSON array and nothing else.`;
}

// Script prompt. Produces ONLY the spoken script text (what the presenter says
// to camera) — no section labels, on-screen text, captions, or hashtags — but
// detailed and complete enough to shoot a full 60-90 second video.
export function scriptPrompt(topic, lang) {
  const src = topic.source_url ? `\nمنبع خبر: ${topic.source_url}` : "";
  if (lang === "fa") {
    return `تو یک سناریونویس حرفه‌ای ویدیوهای کوتاه فارسی برای برند مهاجرتی «سوگیموتو ویزا» هستی (مخاطب: ایرانی‌های علاقه‌مند به مهاجرت).

فقط «متنِ گفتاری» ویدیو رو بنویس — یعنی دقیقاً همون چیزی که راوی جلوی دوربین می‌گه. بدون تیتر، بدون بخش‌بندی (قلاب/روایت/کپشن)، بدون «متن روی تصویر» و بدون هشتگ. فقط پاراگراف‌های روان و آمادهٔ خوندن.

موضوع: ${topic.title_fa}
چرا الان مهمه: ${topic.why_now}
حوزه: ${topic.field}${src}

راهنمای نگارش — یک سناریوی کامل و مفصل بنویس (حدود ۶۰ تا ۹۰ ثانیه، معادل ۴ تا ۶ پاراگراف):
۱. با یک جملهٔ قلاب کوبنده شروع کن (اگر مناسبه کلمهٔ «ایرانیان» رو مستقیم بیار).
۲. بعد موضوع رو کامل باز کن: دقیقاً چی شده، از چه تاریخی، برای چه کسانی مهمه، و چه تأثیری روی وضعیت مهاجرتی مخاطب داره.
۳. حداقل ۵ تا ۷ نکتهٔ مشخص و ملموس بیار، با اعداد و فکت‌های واقعی (امتیاز، تاریخ، تعداد دعوت‌نامه، رشته‌های شغلی و…).
۴. اگر لازمه، یک مثال یا سناریوی واقعی کوتاه بزن تا ملموس بشه.
۵. «قدم بعدی» رو روشن بگو — بیننده الان دقیقاً باید چیکار کنه.
۶. در پایان یک دعوت نرم و طبیعی به رزرو مشاوره یا دایرکت.

لحن محاوره‌ای، مستقیم و صمیمی با بیننده باشه (نه رسمی و کتابی). اصیل و بومی بنویس، نه ترجمه‌شده. مفصل و کامل بنویس تا برای ساخت ویدیو چیزی کم نداشته باشه.`;
  }
  return `You are a professional short-video scriptwriter for Sugimoto Visa (Persian immigration audience; this is the English version).

Write ONLY the spoken script text — exactly what the presenter says to camera. No titles, no section labels (hook/narration/caption), no on-screen text, no hashtags. Just clean, ready-to-read paragraphs.

Topic: ${topic.title_en || topic.title_fa}
Why it matters now: ${topic.why_now}
Field: ${topic.field}${topic.source_url ? `\nNews source: ${topic.source_url}` : ""}

Write a DETAILED, complete script (~60-90 seconds, about 4-6 paragraphs):
1. Open with a punchy hook line (name "Iranians" directly if it fits).
2. Then fully unpack the topic: exactly what happened, since what date, who it affects, and how it changes the viewer's immigration situation.
3. Give at least 5-7 concrete, specific points with real facts/numbers (scores, dates, number of invitations, eligible occupations, etc.).
4. Where useful, add a short real-world example or scenario to make it tangible.
5. Spell out the "next step" — exactly what the viewer should do now.
6. End with a natural, soft call to book a consultation or DM.

Keep the tone conversational, direct, and warm (not stiff or formal). Authentic and specific, not generic or translated-sounding. Make it detailed and complete enough to shoot the full video with nothing missing.`;
}

export function parseTopics(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();

  // 1. Clean parse.
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return v;
  } catch (_) {}

  // 2. Extract the outermost JSON array-OF-OBJECTS, ignoring any surrounding
  //    prose or markdown citation brackets. Search-capable models routinely
  //    wrap the answer in commentary and add "[1]" / "[source](url)" refs; a
  //    naive first-"[" / last-"]" slice grabs those and fails. Anchoring on
  //    "[{ ... }]" skips citation brackets, which never start with "{".
  const m = t.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (m) {
    try {
      const v = JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1")); // tolerate trailing commas
      if (Array.isArray(v)) return v;
    } catch (_) {}
  }

  // 3. Naive slice (kept as a fallback for clean-but-unwrapped output).
  const s = t.indexOf("["),
    e = t.lastIndexOf("]");
  if (s !== -1 && e !== -1 && e > s) {
    try {
      const v = JSON.parse(t.slice(s, e + 1));
      if (Array.isArray(v)) return v;
    } catch (_) {}
  }

  // 4. Salvage: pull out every complete flat {...} object we can find and parse
  //    them individually. This recovers a usable list even when the array
  //    wrapper is broken or the output was truncated mid-stream.
  const objs = [];
  const re = /\{[^{}]*\}/g;
  let mm;
  while ((mm = re.exec(t)) !== null) {
    try {
      const o = JSON.parse(mm[0].replace(/,\s*}/g, "}"));
      if (o && (o.title_fa || o.title_en)) objs.push(o);
    } catch (_) {}
  }
  if (objs.length) return objs;

  return null;
}

// Full Farsi SEO blog article prompt (for the sugimotovisa.com Blog). `links`
// is an array of {url, title} internal links the writer may weave in.
// Uses a robust delimiter output (not JSON) since the body is HTML.
export function articlePrompt(topic, links = [], todayStr = "") {
  const allowed = links.length
    ? links.map((l) => `${l.url} => ${l.title || ""}`).slice(0, 40).join(" ; ")
    : "(none)";
  return `You are a senior Farsi-language immigration news editor for sugimotovisa.com (Sugimoto Visa, a licensed RCIC firm in Canada). Write an ORIGINAL Farsi news/blog article based on the provided source facts. Never translate the source text verbatim; report the facts in your own professional journalistic Farsi. Audience: Iranians interested in Canadian immigration. Accuracy of all numbers, dates and program names is critical.

SEO requirements: choose one Farsi focus keyword and use it in the title, in the first paragraph, and in at least one H2; structure the body with H2 and H3 headings; length 500-800 words; end with a section titled سوالات متداول containing exactly 3 questions as H3 with short answers. Internal linking: weave up to 3 internal links into the body as <a href="URL">anchor</a>, chosen ONLY from the allowed list below; if fewer are relevant use what fits; NEVER invent URLs. Do not use em dashes or en dashes. Do not mention the source website name in the body text.

Source facts:
- عنوان: ${topic.title_fa || topic.title_en || ""}
- خلاصه/چرا مهم: ${topic.why_now || ""}
- حوزه: ${topic.field || ""}
- لینک منبع: ${topic.source_url || ""}
- تاریخ امروز: ${todayStr}
- لینک‌های داخلی مجاز (url => anchor): ${allowed}

CRITICAL OUTPUT FORMAT: Do NOT output JSON. Output plain text using these exact delimiter lines, each on its own line, in this exact order. Put the value on the lines AFTER each delimiter. Do not add anything before the first delimiter or after the content block.
===TITLE===
(the Farsi title, max 65 chars, one line)
===SLUG===
(an english-hyphenated slug, 3 to 6 words, lowercase, one line)
===METADESC===
(Farsi meta description, max 155 chars, one line)
===KEYWORD===
(the Farsi focus keyword, one line)
===EXCERPT===
(1-2 sentence Farsi excerpt, one line)
===TAGS===
(3 Farsi tags separated by commas, one line)
===CONTENT===
(the full article body as HTML using only h2, h3, p, ul, li, strong, a tags; may span multiple lines)`;
}

// Parse the delimiter-formatted article output into fields.
export function parseArticle(text) {
  const t = String(text || "");
  const order = ["TITLE", "SLUG", "METADESC", "KEYWORD", "EXCERPT", "TAGS", "CONTENT"];
  function grab(name) {
    const marker = "===" + name + "===";
    const start = t.indexOf(marker);
    if (start === -1) return "";
    const from = start + marker.length;
    let end = t.length;
    for (const n of order.slice(order.indexOf(name) + 1)) {
      const i = t.indexOf("===" + n + "===", from);
      if (i !== -1 && i < end) end = i;
    }
    return t.slice(from, end).trim();
  }
  return {
    title_fa: grab("TITLE"),
    slug_en: grab("SLUG"),
    meta_description: grab("METADESC"),
    focus_keyword: grab("KEYWORD"),
    excerpt: grab("EXCERPT"),
    tags: grab("TAGS"),
    content_html: grab("CONTENT"),
  };
}

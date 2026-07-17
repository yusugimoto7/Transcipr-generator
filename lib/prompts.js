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

TODAY'S DATE IS ${todayStr}. Recency is critical — this is non-negotiable.

Use web search to find the MOST RECENT and important Canada immigration developments. Prioritize the LAST 7 DAYS, and do NOT include anything older than ~30 days from today's date. Ignore events from previous years entirely — if a development is from before ${year}, skip it. Always include the current year (${year}) in your search queries and prefer the newest results (sort by recency).

IMPORTANT — be efficient with searches: do at most ${"5"} web searches total. Use broad, batched queries (e.g. one search like "Canada immigration news ${year} Express Entry PNP PGWP LMIA" instead of one search per category) that surface several developments at once, then a couple of follow-ups for specifics or Europe (Germany Opportunity Card, Portugal, etc.). You do NOT need to search every category separately — a handful of well-chosen searches is enough to write 10 strong topics.

Generate exactly 10 short-video topic ideas optimized for engagement with THIS audience:
- About 7 must be tied to a SPECIFIC, very recent development — include the concrete detail AND its date in "why_now".
- About 3 must be EVERGREEN educational/how-to topics that are always useful and NOT tied to a news event — e.g. "what you can do to stay in Canada after your PGWP expires", "how to move from a work permit to permanent residence", "the biggest mistakes that get an application refused". For these, "why_now" explains in Persian why the topic is always relevant to the audience.

Proven winning patterns in this niche: (1) name "Iranians" directly in hooks, (2) high-stakes / anxiety framing (permit ending, refusal, deadline, ban), (3) rejection-reversal & real case stories, (4) BC PNP & occupation-specific, (5) Europe is uncontested white space. Anxiety + specificity beat generic eligibility overviews.${excludeBlock}

Return ONLY a JSON array (no markdown fences, no preamble, no trailing text) of exactly 10 objects with keys:
- "title_fa": the Farsi hook/title, punchy and ready to put on screen
- "title_en": short English title
- "field": one of "Express Entry","PNP","Study","Work Permit","LMIA","Policy","Court","Europe"
- "page": "CA" or "EU"
- "why_now": ONE sentence in Persian. For news topics, tie it to the specific recent development and include its date. For evergreen topics, explain why it's always relevant.
- "source_url": the exact, real URL of the specific web page (from your search results) that this topic is based on — e.g. the IRCC page, the official news release, or the article you found. Use the actual URL from a search result, never a made-up or generic homepage link. For evergreen topics not tied to one article, use the most authoritative official source you'd cite (e.g. an IRCC.ca policy page), or an empty string "" if genuinely none applies.
- "score": integer 60-98 engagement-potential score
Order by "score" descending. Output the JSON array and nothing else.`;
}

// Script prompt. Produces ONLY the spoken script text (what the presenter says
// to camera) — no section labels, on-screen text, captions, or hashtags.
export function scriptPrompt(topic, lang) {
  if (lang === "fa") {
    return `تو یک سناریونویس حرفه‌ای ویدیوهای کوتاه فارسی برای برند مهاجرتی «سوگیموتو ویزا» هستی (مخاطب: ایرانی‌های علاقه‌مند به مهاجرت).

فقط «متنِ گفتاری» ویدیو رو بنویس — یعنی دقیقاً همون چیزی که راوی جلوی دوربین می‌گه. بدون تیتر، بدون بخش‌بندی (قلاب/روایت/کپشن)، بدون «متن روی تصویر» و بدون هشتگ. فقط پاراگراف‌های روان و آمادهٔ خوندن.

موضوع: ${topic.title_fa}
چرا الان مهمه: ${topic.why_now}
حوزه: ${topic.field}

راهنما: با یک جملهٔ کوبنده شروع کن (اگر مناسبه کلمهٔ «ایرانیان» رو مستقیم بیار)، بعد ۳ تا ۴ نکتهٔ کوتاه و ملموس با حداقل یک عدد یا فکت واقعی، و در پایان یک دعوت نرمِ کوتاه به رزرو مشاوره یا دایرکت. لحن محاوره‌ای و مستقیم با بیننده، حدود ۳۰ تا ۴۵ ثانیه. اصیل و بومی بنویس، نه ترجمه‌شده.`;
  }
  return `You are a professional short-video scriptwriter for Sugimoto Visa (Persian immigration audience; this is the English version).

Write ONLY the spoken script text — exactly what the presenter says to camera. No titles, no section labels (hook/narration/caption), no on-screen text, no hashtags. Just clean, ready-to-read paragraphs.

Topic: ${topic.title_en || topic.title_fa}
Why it matters now: ${topic.why_now}
Field: ${topic.field}

Guidance: open with one punchy line (name "Iranians" directly if it fits), then 3-4 short concrete points with at least one real fact/number, and end with a short soft call to book a consultation or DM. Conversational and direct to the viewer, ~30-45 seconds. Keep it authentic and specific, not generic.`;
}

export function parseTopics(text) {
  let t = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(t);
  } catch (e) {}
  const s = t.indexOf("["),
    e = t.lastIndexOf("]");
  if (s !== -1 && e !== -1) {
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch (_) {}
  }
  return null;
}

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

// Shared prompt + parsing logic for the Sugimoto Topic Engine.
// Ported verbatim from the reference prototype so topic generation and the
// bilingual (Farsi + English) script generation behave identically.

export const TOPIC_PROMPT = `You are the content strategist for Sugimoto Visa, a Persian-language Canadian & European immigration brand (Instagram @sugimotovisa, and @sugimotovisa.europe). The audience is Persian-speaking (Iranian) immigrants and aspirants.

Use web search to find the MOST IMPORTANT Canada immigration developments from the LAST 7 DAYS across: Express Entry draws & category-based selection, Provincial Nominee Programs (especially BC PNP), study permits & PGWP, work permits & LMIA, IRCC policy changes, and notable Federal Court decisions. Also check 1-2 key Europe developments (Germany Opportunity Card, Portugal, etc.) for the Europe page.

Then generate 6 short-video topic ideas optimized for engagement with THIS audience. Proven winning patterns in this niche: (1) name "Iranians" directly in hooks, (2) high-stakes / anxiety framing (permit ending, refusal, deadline, ban), (3) rejection-reversal & real case stories, (4) BC PNP & occupation-specific, (5) Europe is uncontested white space. Anxiety + specificity beat generic eligibility overviews.

Return ONLY a JSON array (no markdown fences, no preamble, no trailing text) of exactly 6 objects with keys:
- "title_fa": the Farsi hook/title, punchy and ready to put on screen
- "title_en": short English title
- "field": one of "Express Entry","PNP","Study","Work Permit","LMIA","Policy","Court","Europe"
- "page": "CA" or "EU"
- "why_now": ONE sentence in Persian tying it to a specific recent development from your search (include the concrete detail)
- "score": integer 60-98 engagement-potential score
Order by "score" descending. Output the JSON array and nothing else.`;

export function scriptPrompt(topic, lang) {
  if (lang === "fa") {
    return `تو یک سناریونویس حرفه‌ای ویدیوهای کوتاه فارسی برای برند مهاجرتی «سوگیموتو ویزا» هستی (مخاطب: ایرانی‌های علاقه‌مند به مهاجرت).

برای این موضوع یک سناریوی کامل و آمادهٔ ضبط برای یک ریلز بنویس:
موضوع: ${topic.title_fa}
چرا الان مهمه: ${topic.why_now}
حوزه: ${topic.field}

خروجی رو کاملاً فارسی و با این بخش‌های مشخص بنویس:
۱. قلاب (سه ثانیهٔ اول) — یک جملهٔ کوبنده؛ اگر مناسبه کلمهٔ «ایرانیان» رو مستقیم بیار.
۲. متن روایت — حدود ۳۰ تا ۴۵ ثانیه، ۳ تا ۴ نکتهٔ کوتاه و ملموس، حداقل یک عدد یا فکت واقعی، لحن محاوره‌ای و مستقیم با بیننده (نه رسمی و کتابی).
۳. متن روی تصویر — ۳ تا ۴ عبارت کوتاه برای اورلی.
۴. کپشن و CTA — یک کپشن با دعوت نرم به رزرو مشاوره یا دایرکت، به‌همراه ۵ تا ۷ هشتگ مرتبط.

اصیل و بومی بنویس، نه ترجمه‌شده. مشخص و عملیاتی باش.`;
  }
  return `You are a professional short-video scriptwriter for Sugimoto Visa (Persian immigration audience, but this is the English reference/version).

Write a complete, ready-to-shoot Reel script IN ENGLISH for this topic:
Topic: ${topic.title_en || topic.title_fa}
Why it matters now: ${topic.why_now}
Field: ${topic.field}

Structure the output with these labeled sections:
1. HOOK (first 3 seconds) — one punchy line; name "Iranians" directly if it fits.
2. NARRATION — ~30-45 seconds, 3-4 short concrete points, at least one real fact/number, conversational and direct to the viewer.
3. ON-SCREEN TEXT — 3-4 short overlay phrases.
4. CAPTION & CTA — a caption with a soft call to book a consultation or DM, plus 5-7 relevant hashtags.

Keep it authentic and specific, not generic.`;
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

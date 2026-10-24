// Opening lines for video scripts (Hamed, Oct 24 2026, after the instagram-agent-skill hook
// library). Three options from different patterns, each checked for what makes a hook fail. The
// check only catches weak hooks; it cannot pick the winner (the skill's own test: it separated bad
// hooks well and a creator's hits from their misses no better than a coin), so it advises.

import { openaiScript } from "./openai.js";
import { cleanText } from "./clean-text.js";

// Our own patterns, for news and explainers. A hook is always a fact from the source.
export const HOOK_PATTERNS = [
  ["number", "The number first", "«۱۵۰۰ درصد افزایش در…»", "\"Processing just hit 25 months.\""],
  ["decision", "The decision", "«دادگاه فدرال رد پرونده رو لغو کرد.»", "\"The Federal Court just overturned a refusal.\""],
  ["date", "The date or deadline", "«از ۳ نوامبر این قانون عوض می‌شه.»", "\"From November 3, this rule changes.\""],
  ["who", "Who it hits", "«دارندگان مجوز کار بسته، این خبر مال شماست.»", "\"Closed work permit holders: this one is about you.\""],
  ["before_after", "Before and after", "«تا دیروز X بود، از امروز Y.»", "\"Yesterday it was X. Today it is Y.\""],
  ["myth", "The common mistake", "«خیلیا فکر می‌کنن… ولی متن رسمی چیز دیگه‌ای می‌گه.»", "\"Most people think… The official page says otherwise.\""],
  ["question", "The question people ask", "«با مجوز کار جدید، ویزای قبلی‌ام هنوز معتبره؟»", "\"Is my visitor visa still valid after I switch permits?\""],
  ["exception", "The surprising exception", "«یک گروه از این قانون معافه.»", "\"One group is exempt from this.\""],
  ["cost", "The cost of getting it wrong", "«یک مدرک جاافتاده، و پرونده رد شد.»", "\"One missing document, and the file was refused.\""],
  ["story", "Mid-story", "«این متقاضی از ۲۰۱۹ منتظر جواب بود…»", "\"This applicant had been waiting since 2019…\""],
];

const WORDS = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const CONCRETE_FA = /[0-9۰-۹]|کانادا|اروپا|آلمان|اداره مهاجرت|دادگاه|اکسپرس|استان|مجوز|ویزا|اقامت|شهروندی|IRCC|PNP|CRS|LMIA|PGWP|[A-Z]{2,}/;

// What would make this line lose the viewer in the first seconds. Empty means none found.
export function hookProblems(line, lang = "fa") {
  const s = String(line || "").trim();
  const en = lang === "en";
  const out = [];
  if (/^(hi|hey|hello|welcome)\b|^(سلام|درود)/i.test(s)) out.push(en ? "opens with a greeting" : "با سلام شروع می‌شه");
  if (/\b(in (this|today'?s) video|today i'?m going to|let me tell you)\b|(تو|توی|در) این ویدیو|امروز می‌خوام/i.test(s)) out.push(en ? "a preamble, not the point" : "مقدمه‌چینیه، نه اصل حرف");
  if (/stop scrolling|don'?t scroll|watch (till|until) the end|اسکرول نکن|تا آخر ببین/i.test(s)) out.push(en ? "asks for attention instead of earning it" : "به‌جای جلب توجه، التماس توجه می‌کنه");
  if (WORDS(s) > (en ? 15 : 18)) out.push(en ? "longer than about 3 seconds" : "بیشتر از حدود ۳ ثانیه طول می‌کشه");
  if (!(en ? /[0-9]|\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million)\b|\b[A-Z][a-z]+\b.*\b[A-Z]/.test(s) || /\b(IRCC|PNP|CRS|LMIA|PGWP|Canada|Europe|Federal Court)\b/.test(s) : CONCRETE_FA.test(s)))
    out.push(en ? "nothing concrete (no number or name)" : "چیز مشخصی نداره (عدد یا اسم)");
  return out;
}

function hooksPrompt(topic, script, lang, sourceText) {
  const en = lang === "en";
  const list = HOOK_PATTERNS.map(([id, name, fa, eng]) => `- ${id}: ${name} (e.g. ${en ? eng : fa})`).join("\n");
  return `You write the opening line of a short immigration video for Sugimoto Visa. The script is below; its first sentence is the current hook.

Write THREE alternative opening lines in ${en ? "natural spoken English" : "natural spoken Persian (the brand's everyday voice)"}, each from a DIFFERENT pattern in this list:
${list}

Rules: every line states a fact from the SOURCE TEXT (no invented number, date, name or claim); at most ${en ? "12 words" : "14 words"}, sayable in under 3 seconds; no greeting, no "in this video", no asking for attention, no sales line.

Return ONLY JSON: {"hooks":[{"pattern":"<id>","line":"..."}]}

===== SCRIPT =====
${String(script || "").slice(0, 2500)}
===== SOURCE TEXT =====
${String(sourceText || topic.snippet || "").slice(0, 3500)}
===== END =====`;
}

// Three hook options for a written script, each with what (if anything) makes it weak.
export async function hookOptions(topic, script, lang, sourceText) {
  const raw = String(await openaiScript(hooksPrompt(topic, script, lang, sourceText), { maxOutputTokens: 800 }));
  const m = raw.replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  let v = null;
  try {
    v = m ? JSON.parse(m[0]) : null;
  } catch (_) {}
  const ids = new Set(HOOK_PATTERNS.map(([id]) => id));
  return ((v && v.hooks) || [])
    .slice(0, 3)
    .map((h) => {
      const line = cleanText(String(h.line || "").trim(), { lang }).slice(0, 200);
      return line ? { line, pattern: ids.has(h.pattern) ? h.pattern : "", problems: hookProblems(line, lang) } : null;
    })
    .filter(Boolean);
}

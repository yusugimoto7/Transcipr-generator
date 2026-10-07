import { NextResponse } from "next/server";
import { researchTopic } from "../../../lib/research.js";
import { generateText } from "../../../lib/wizardOpenai.js";
import { BRAND_CONTEXT } from "../../../lib/brandContext.js";

export const runtime = "nodejs";

// Returns the persona description that matches country + field so the model
// writes hooks that address real audience concerns, not generic angles.
function buildPersonaBlock(country, field) {
  const c = (country || "").toLowerCase().replace(/,.*/, "").trim();
  const f = field || "";

  if (c === "canada" && f === "Express Entry")
    return "مخاطب هدف: ۲۵ تا ۴۰ ساله، لیسانس+، ۱ تا ۳ سال سابقه کاری. دغدغه‌ها: امتیاز CRS، دسته‌بندی NOC. سؤالات رایج: چه رشته‌هایی واجد شرایطند، چطور امتیاز بگیرند، آخرین دور قرعه‌کشی چه شرایطی داشت.";
  if (c === "canada" && (f === "تحصیل" || f === "Study Permit" || f === "PGWP"))
    return "مخاطب هدف: سن مدرسه تا ۴۰ ساله (شامل فوق‌لیسانس دوم). دغدغه‌ها: شهریه، بورسیه، ویزای همراه. سؤالات: مسیر PR بعد از تحصیل، اجازه کار همسر، زمان پردازش، نکات افزایش شانس تأیید ویزا.";
  if (c === "canada" && f === "PNP")
    return "مخاطب هدف: ۲۵ تا ۴۵ ساله، دنبال نامزدی استانی. دغدغه‌ها: کدام استان با پروفایل‌شان تطابق دارد، فرکانس قرعه‌کشی، شرط ارتباط با استان، مسیر PR.";
  if (c === "canada" && (f === "ورک پرمیت" || f === "Startup Visa" || f === "LMIA"))
    return "مخاطب هدف: ۲۵ تا ۴۵ ساله، کاری. دغدغه‌ها: نوع مجوز کار (باز یا اختصاصی)، شرایط LMIA، مسیر PR، اجازه ورود خانواده.";
  if (c === "netherlands")
    return "مخاطب هدف: ۲۲ ساله به بالا، لیسانس+. دغدغه‌ها: اقامت خانواده، اجازه کار همسر، بدون شرط زبان برای Startup Visa.";
  if (c === "france")
    return "مخاطب هدف: ۱۸ تا ۳۶ ساله (دیپلم تا ۲۶، لیسانس تا ۳۱، ارشد+ تا ۳۵). دغدغه‌ها: تمکن مالی، ویزای همراه، اجازه کار، ورک پرمیت بعد از تحصیل، وضعیت اقامت، مزایای دولتی.";
  if (["finland", "germany", "spain"].includes(c) || (c === "netherlands" && f === "تحصیل"))
    return "مخاطب هدف: ۱۸ تا ۴۰ ساله (فنلاند تا ۴۵)، لیسانس و ارشد. دغدغه‌ها: تمکن مالی، اجازه کار حین تحصیل، شرایط همراه، مسیر PR و پاسپورت، ورک پرمیت بعد از تحصیل، رشته‌های محبوب، ویزای خانواده.";
  if (c.includes(","))
    return "مخاطب هدف: افرادی که دو کشور را مقایسه می‌کنند. دغدغه‌ها: شرایط، هزینه، زبان، شرایط همراه، مسیر PR — نیاز به مقایسه واضح دارند نه فقط اطلاعات جداگانه.";
  return "مخاطب هدف: دنبال‌کنندگان @sugimotovisa. دغدغه‌های کلی: واجد شرایط بودن، مسیرها، هزینه‌ها، زمان‌بندی، گزینه‌های خانوادگی.";
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { country, field, language } = body || {};
  if (!country) {
    return NextResponse.json({ error: "country is required" }, { status: 400 });
  }

  const seedTopic = { country, title: field || "immigration news", language };
  const facts = await researchTopic(seedTopic);

  const factsBlock = facts.length
    ? facts.map((f) => `- ${f.fact} (${f.source_url}, ${f.date})`).join("\n")
    : "(فکت تأییدشده‌ای یافت نشد — بر اساس دانش کلی از چشم‌انداز مهاجرتی این کشور هوک بنویس)";

  const personaBlock = buildPersonaBlock(country, field);

  const prompt = `${BRAND_CONTEXT}

شما برای اینستاگرام @sugimotovisa کار می‌کنید. باید ۵ هوک برای اسلاید اول کاروسل بنویسید — نه اسم موضوع، نه عنوان مقاله. این‌ها متن واقعی هستند که مخاطب روی اسلاید ۱ می‌بیند.

کشور: ${country}
حوزه: ${field || "عمومی مهاجرت"}

${personaBlock}

فکت‌های تأییدشده (فقط از همین‌ها استفاده کن — هیچ عدد یا ادعایی اضافه نکن):
${factsBlock}

قوانین هوک (همه اجباری):
۱. جمله باشد نه سؤال — هرگز «چطور»، «How to»، «چرا»، «چه...؟»
۲. یک عدد یا فکت مشخص از فکت‌های بالا داشته باشد
۳. حداکثر ۱۲ کلمه فارسی
۴. مثل چیزی باشد که یک متخصص واقعی می‌گوید، نه خلاصه عمومی

نمونه هوک خوب:
✅ «کانادا مسیر را نبسته؛ معیارهای انتخاب را تغییر داده»
✅ «Express Entry در ۲۰۲۶: امتیاز ۴۸۰ دیگر کافی نیست»
✅ «فنلاند ظرفیت پذیرش را ۳۰٪ کاهش داد؛ این رشته‌ها هنوز باز هستند»
✅ «کانادا استارتاپ ویزا: بدون سرمایه‌گذاری اولیه — این ۳ شرط کافی است»

نمونه هوک بد:
❌ «ویزای استارتاپ کانادا» (کلی، بدون فکت)
❌ «چطور به کانادا مهاجرت کنیم؟» (سؤال)
❌ «۵ نکته مهم Express Entry» (فرمت ممنوع)
❌ «همه چیز درباره Study Permit» (کلی)

خروجی: فقط JSON آرایه — بدون توضیح اضافه، بدون کد فنس:
[{ "title": "...", "angle": "..." }, ...]

"title" = متن هوک به فارسی (همان متنی که روی اسلاید ۱ می‌رود)
"angle" = یک جمله انگلیسی: کدام دغدغه مخاطب را هدف می‌گیرد و کاروسل چه نشان می‌دهد (فقط برای تیم، نه مخاطب)`;

  let raw;
  try {
    raw = await generateText(prompt, 1500);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Parse defensively — model may return plain array or { topics: [...] }
  let topics = [];
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.topics) ? parsed.topics : null);
    if (arr) {
      topics = arr.map((t) => ({ ...t, researchedFacts: facts }));
    }
  } catch {
    topics = [{ title: raw.slice(0, 100), angle: raw, researchedFacts: facts }];
  }

  return NextResponse.json({ topics });
}

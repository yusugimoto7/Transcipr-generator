import { BRAND_CONTEXT } from "./brandContext.js";

function sourceBlock(sourceText) {
  const s = String(sourceText || "").trim();
  return s.length > 60 ? s : "(منبع کامل در دسترس نیست — فقط بر اساس عنوان و خلاصه کوتاه بنویس و چیزی از خودت اضافه نکن)";
}

function topicLine(topic) {
  const lines = [
    `موضوع: ${topic.title || topic.title_fa || topic.subject || ""}`,
    `حوزه: ${topic.field || topic.country || ""}`,
  ];
  if (topic.audience) lines.push(`مخاطب: ${topic.audience}`);
  if (topic.tone) lines.push(`لحن: ${topic.tone}`);
  return lines.join("\n");
}

// Tone selection alone ("لحن: صمیمی و ساده") wasn't enough — models default
// to safe, formal phrasing regardless of the label. Each tone gets concrete,
// actionable writing instructions in the target language instead.
const TONE_INSTRUCTIONS = {
  "صمیمی و ساده": {
    fa: "لحن: صمیمی و ساده — مثل یک دوست که داره برات توضیح می‌ده بنویس، نه مثل گزارش مشاور. از فعل‌های محاوره‌ای طبیعی استفاده کن (میشه/میکنی/داری/بریم) نه رسمی و کتابی (می‌شود/می‌کنید/دارید). جمله‌های کوتاه‌تر بساز؛ همچنان مؤدب و با «شما»، ولی رسمی و دست‌وپاگیر نباش.",
    en: "Tone: warm and casual — write like a friend explaining this, not a consultant's report. Use contractions and everyday phrasing (you'll, it's, let's), short sentences, conversational language — not stiff or formal.",
  },
  "آموزشی و رسمی": {
    fa: "لحن: آموزشی و رسمی — دقیق و ساختاریافته، با «شما»ی رسمی، مثل یک مشاور متخصص که موضوع رو باز می‌کنه.",
    en: "Tone: educational and formal — precise and structured, like a knowledgeable advisor explaining the topic clearly.",
  },
  "فوری و خبری": {
    fa: "لحن: فوری و خبری — کوتاه، ضربتی و مستقیم بنویس؛ حس فوریت و تازگی خبر رو منتقل کن، بدون مقدمه‌چینی.",
    en: "Tone: urgent and news-like — short, punchy, direct sentences that convey urgency and freshness, no throat-clearing intro.",
  },
  "تحلیلی و عمیق": {
    fa: "لحن: تحلیلی و عمیق — با جزئیات بیشتر و تحلیل دقیق‌تر بنویس، اما همچنان روشن و قابل‌فهم بمون، نه پیچیده و مبهم.",
    en: "Tone: analytical and in-depth — more detail and sharper analysis, but stay clear and readable, not dense or convoluted.",
  },
  "انگیزشی": {
    fa: "لحن: انگیزشی — پرانرژی و امیدبخش بنویس، مخاطب رو به اقدام‌کردن ترغیب کن، بدون اینکه به قوانین برند (بدون وعده قطعی، بدون تضمین) خدشه بزنی.",
    en: "Tone: motivating and energetic — upbeat and encouraging, push the reader toward taking action, without breaking the brand's rules (no guarantees, no definitive promises).",
  },
};

function toneInstruction(topic) {
  const entry = topic.tone && TONE_INSTRUCTIONS[topic.tone];
  if (!entry) return "";
  return topic.language === "english" ? entry.en : entry.fa;
}

// Persian is the default (topic.language unset or anything other than
// "english"); this only activates for English requests.
function languageInstruction(topic) {
  if (topic.language !== "english") return "";
  return "LANGUAGE (required): Write the ENTIRE output in English, not Persian - hooks, body text, captions, comparisons, labels, and CTAs. Treat any Persian example text elsewhere in this prompt only as a reference for style, structure, and rhythm - do not copy it or leave any part of the output in Persian. Keep the exact same section structure and output delimiters requested below. Every brand rule above (tone, red lines, information standards, financial notes) still applies, just expressed in English.";
}

const CTA_TEXT_FA = "برای ارتباط با مشاورین سوگیموتو ویزا، کلمه [مشاوره] رو کامنت کنید";
const CTA_TEXT_EN = "To connect with Sugimoto Visa consultants, comment the word [Consult]";

function ctaText(topic) {
  return topic.language === "english" ? CTA_TEXT_EN : CTA_TEXT_FA;
}

// Ground generation in the verified facts from lib/research.js (real web
// search), not source text / model memory alone. Empty when research found
// nothing or wasn't run — the rest of each prompt's grounding rules still apply.
function researchBlock(topic) {
  const facts = Array.isArray(topic.researchedFacts) ? topic.researchedFacts : [];
  if (!facts.length) return "";
  const lines = facts
    .map((f) => `- ${f.fact} (Source: ${f.source_url || "-"}, Date: ${f.date || "-"})`)
    .join("\n");
  return `These are verified facts from official sources — use them as your primary reference. You may draw on your general knowledge about this immigration topic, but do not invent specific numbers (fees, processing times, dates) that contradict these facts:\n${lines}`;
}

// BRAND_CONTEXT is large; models tend to skim past it. This turns the most
// critical parts into an active checklist rather than passive background.
function brandDirectives() {
  return `قوانین برند و چارچوب محتوایی بالا (BRAND CONTEXT) را واقعاً در متنی که می‌نویسی اعمال کن، نه فقط به‌عنوان زمینه:
- تحلیلی، کاربردی و مشاوره‌ای بنویس — نه فقط بازنویسی قانون (CONTENT MODEL). از دغدغه واقعی مخاطب شروع کن و او را به این سؤال برسان: «این برای من چه معنایی داره؟»
- لحن رسمی با «شما» — حرفه‌ای، تحلیلی، مطمئن ولی غیرتبلیغاتی، بدون اغراق و بدون ترس‌آفرینی (TONE).
- هرگز نتیجه را تضمین نکن، هرگز اسم رقیب نیار (RED LINES). وعده قطعی درباره ویزا/پذیرش/اقامت نده.
- فقط از منابع رسمی/معتبر استفاده کن (INFORMATION STANDARDS: دولت، سفارت‌خانه‌ها، دانشگاه‌ها، منابع پذیرش رسمی)؛ اگر اطلاعات ناقص یا متغیره، قطعی جا نزنش.
- هر مبلغ مالی را با واحد پول دقیق (CAD یا EUR) بنویس و ددلاین‌ها را برجسته کن (FINANCIAL NOTES).`;
}

// Forces real numbers when the source has them, gives a safe escape hatch
// instead of letting the model invent a plausible-looking figure.
function numberDisciplineBlock(topic) {
  const fallback = topic.language === "english" ? "it depends on individual circumstances" : "بسته به شرایط متفاوت است";
  return `دقت در اعداد (اجباری، نه اختیاری):
- اگر «متن منبع» رقم شهریه دارد، همان رقم را دقیق و با واحد CAD یا EUR بنویس — نه «شهریه بالا» یا «معمولاً گران است».
- اگر «متن منبع» زمان پردازش دارد، همان را دقیق به هفته بنویس (مثلاً «۱۰ تا ۱۴ هفته») — نه «مدتی طول می‌کشد».
- اگر «متن منبع» مبلغ تمکن مالی (Proof of Funds) دارد، همان را دقیق و با واحد CAD یا EUR بنویس.
- اگر رقم مشخصی در «متن منبع» نیامده یا مطمئن نیستی، به‌جای حدس زدن یا ساختن یک عدد، دقیقاً همین عبارت را بنویس: «${fallback}». هرگز آماری بدون منبع واقعی در متن نساز (طبق RED LINES: Never cite statistics without sources).`;
}

// Source/date line comes from the first verified research fact, not a
// brand-name fallback. Omitted entirely when no research facts exist —
// never a placeholder like "تاریخ: نامشخص".
function researchSourceLine(topic) {
  const facts = Array.isArray(topic.researchedFacts) ? topic.researchedFacts : [];
  const first = facts[0];
  if (!first || !first.source_url) return "";
  if (topic.language === "english") {
    const line = `Source: ${first.source_url} — Date: ${first.date || ""}`;
    return `Source line (required, must be the very last line of the output): write exactly: "${line}"`;
  }
  const line = `منبع: ${first.source_url} — تاریخ: ${first.date || ""}`;
  return `خط منبع (اجباری، باید آخرین خط خروجی باشد): دقیقاً همین را بنویس: «${line}»`;
}

// Approve/edit loop. route.js sets topic.feedback from the request body
// when the user submitted the feedback textarea; wired into all 5 prompts so
// the model revises based on feedback instead of regenerating cold.
function feedbackBlock(feedback) {
  if (!feedback) return "";
  return `The user gave this feedback on the previous version: ${feedback}. Apply it in the new version.`;
}

// Instagram carousel, slide count chosen by the caller (topic.slideCount —
// 5/7/10/12 in the UI, defaults to 7).
export function carouselPrompt(topic, sourceText) {
  console.log("[wizard] BRAND_CONTEXT length:", BRAND_CONTEXT?.length, "topic:", JSON.stringify({title: topic.title, country: topic.country}));
  const slideCount = Number(topic.slideCount) || 7;
  const prompt = `${BRAND_CONTEXT}

${brandDirectives()}
${languageInstruction(topic)}

تو استراتژیست محتوای اینستاگرام برند «سوگیموتو ویزا» هستی. یک کاروسل دقیقاً ${slideCount} اسلایدی بساز، کاملاً بر اساس «متن منبع» زیر — هیچ فکت، عدد یا ادعایی که در منبع نیست اضافه نکن.

${topicLine(topic)}
${toneInstruction(topic)}

===== متن منبع =====
${sourceBlock(sourceText)}
===== پایان متن منبع =====

${numberDisciplineBlock(topic)}

مدل محتوا: تحلیلی، کاربردی و مشاوره‌ای بنویس — نه فقط بازنویسی قانون. از یک دغدغه یا سؤال واقعی مخاطب شروع کن، زبان ساده ولی دقیق داشته باش، تفاوت مسیرها/شرایط/محدودیت‌ها را نشان بده، و وقتی قوانین سخت‌تر می‌شوند نشان بده چه مسیرهایی هنوز باز هستند. مخاطب را به این سؤال برسان: «این برای من چه معنایی داره؟»

نمونه‌های واقعی از پست‌های خودمان — سبک، ریتم و فرمت خروجی باید دقیقاً همین حس را داشته باشد (البته با فکت‌های خود «متن منبع»، نه این اعداد نمونه):

--- نمونه ۱: هوک ---
«کانادا در ۲۰۲۶؛
برای چه کسانی هنوز فرصت بیشتری وجود دارد؟»

--- نمونه ۱: اسلاید Context ---
«اگر اخبار مهاجرت تحصیلی به کانادا را دنبال کرده باشید، احتمالاً متوجه شده‌اید که قوانین طی دو سال اخیر تغییرات زیادی داشته‌اند.
اما نکته مهم این است:
کانادا مسیر تحصیلی را نبسته؛
معیارهای انتخاب دانشجو را تغییر داده است.»

--- نمونه ۱: اسلاید میانی (بولت، نه پاراگراف) ---
«در ۲۰۲۵، کانادا این محدودیت‌ها را اعمال کرد:
• کاهش ظرفیت پذیرش
• گسترش PAL/TAL (نامه تأیید استانی)
• محدودیت بیشتر برای مجوز کار همسر
• تغییرات در PGWP
• افزایش حساسیت نسبت به منابع مالی»

--- نمونه ۲: هوک ---
«ژانویه ۲۰۲۷ رو از دست دادی؟
سپتامبر ۲۰۲۷ رو از دست نده!
🇳🇱 هلند | 🇫🇮 فنلاند | 🇫🇷 فرانسه | 🇪🇸 اسپانیا
💶 شهریه + 🏦 تمکن مالی + ⏰ زمان شروع پذیرش‌ها
📌 ذخیره کن؛ موقع برنامه‌ریزی بهش نیاز داری»

--- نمونه ۲: اسلاید مقایسه ---
«کشور | شهریه | تمکن | زمان پذیرش | ددلاین
🇳🇱 هلند | €۱۲-۲۰K | €۱۵K | مهر-آذر | بهمن
🇫🇮 فنلاند | €۸-۱۸K | €۹.۶K | آذر | دی (۲ هفته!)
🇫🇷 فرانسه | ~€۳.۹۵K | €۷.۵-۹K | مهر | دی-اسفند
🇪🇸 اسپانیا | €۲-۴.۵K | €۷.۲-۸.۵K | دی-بهمن | خرداد»

--- نمونه ۳: اسلاید آخر (Takeaway + CTA) ---
«سپتامبر ۲۰۲۷ دور نیست.
اگر هنوز دانشگاه‌هایت را انتخاب نکردی،
الان بهترین زمان برای شروع بررسی است.
📌 این پست را ذخیره کن
💬 رشته، مقطع و معدلت را کامنت کن»

--- نمونه کپشن ---
«آیا می‌شه با همسر و فرزندان برای تحصیل در اروپا اقدام کرد؟ پاسخ مثبته! اما قوانین اجازه کار همسر، تحصیل فرزندان و زمان همراهی در هر کشور متفاوت است. 👨‍👩‍👧‍👦

توی این پست، آخرین قوانین رسمی ۶ کشور اروپایی را برای خانواده‌ها بررسی کردیم:

🔹 فنلاند و دانمارک: امکان اقدام هم‌زمان کل خانواده + حق کار همسر
🔹 آلمان: حق کار همسر + تحصیل رایگان فرزندان
🔹 هلند و اسپانیا: امکان ورود همسر و فرزندان اما همسر اجازه کار مستقیم ندارد!

📌 نکته مالی مهم: به ازای هر فرزند، مبلغ مشخصی به تمکن مالی سالانه اضافه می‌شود.

این پست رو برای همسرت بفرست! ✈️
💬 چند نفری قصد مهاجرت دارید؟»

ساختار اجباری کاروسل — این ترتیب را دقیق رعایت کن: هوک ← مسئله ← واقعیت/داده ← تحلیل ← مقایسه ← جمع‌بندی کاربردی ← CTA

اسلاید ۱ (Hook/Cover): یک بیانیه/چالش کوتاه و مشخص — نه یک سؤال عمومی نوع «چطور...؟». مثل نمونه‌های بالا: تضاد یا فرصت را مستقیم بگو.
✅ «کانادا مسیر را نبسته؛ معیارها را تغییر داده»
❌ «چطور به فنلاند مهاجرت کنیم؟»
هرگز از سبک‌هایی مثل «۵ نکته طلایی» یا «با ما مهاجرت کنید» استفاده نکن.

اسلاید ۲ (Context/مسئله): ۳ تا ۴ جمله کوتاه، مثل نمونه ۱ — چرا این موضوع مهمه، چی تغییر کرده، این تغییر یعنی چی. پاراگراف کوتاه، نه بولت.

اسلایدهای میانی (Evidence + Breakdown، دقیقاً ${Math.max(slideCount - 4, 1)} اسلاید — تعداد کل باید ${slideCount} بشه: ۱ هوک + ۱ Context + ${Math.max(slideCount - 4, 1)} میانی + ۱ مقایسه + ۱ Takeaway/CTA): همیشه با بولت پوینت (•) و آیتم‌های مشخص بنویس، نه پاراگراف طولانی — دقیقاً مثل نمونه ۱. این‌ها را پوشش بده:
- شرایط و الزامات
- اعداد و حداقل‌ها (طبق «دقت در اعداد» بالا — هرجا عدد واقعی از متن منبع داری، شهریه/هفته پردازش/مبلغ تمکن مالی را دقیق بیار)
- تفاوت مسیرها
- مزایا و محدودیت‌ها
- چه کسی واجد شرایطه؟
- چه کسی احتمالاً مسیر مناسبی نداره؟
- قدم بعدی چیه؟

اسلاید مقایسه (وقتی مفیده): یک جدول متنی بساز — مثل نمونه ۲.
${topic.comparisonDimensions?.length
    ? `این کاروسل از نوع مقایسه‌ای است: اسلاید مقایسه اجباری است و باید با دقیقاً این ستون‌ها باشد:
کشور/مسیر | شرایط | هزینه | زمان | نکته کلیدی
هر ردیف با ایموجی پرچم کشور مربوطه شروع شود. فقط داده‌های واقعی از متن منبع.`
    : `از دقیقاً همین ستون‌ها استفاده کن:
کشور | شهریه | تمکن | زمان پذیرش | ددلاین
اگر مقایسه بین چند مسیر/برنامه داخل یک کشوره (نه چند کشور)، ستون اول را به «مسیر» تغییر بده ولی بقیه ستون‌ها (شهریه، تمکن، زمان، ددلاین) را نگه دار. هر ردیف را با ایموجی پرچم کشور شروع کن و فقط اعداد واقعیِ متن منبع را بذار (طبق «دقت در اعداد» بالا).`}

اسلاید آخر (Takeaway + CTA): اول ۱ تا ۲ جمله جمع‌بندیِ کاربردی و فوریت‌دار (مثل نمونه ۳)، بعد دقیقاً این دو خط تعاملی:
📌 این پست را ذخیره کن
💬 [بر اساس موضوع، رشته/مقطع/معدل یا مشخصات مرتبط را بپرس — مثلاً «رشته، مقطع و معدلت را کامنت کن»]
و در آخر، یک خط جدا برای مشاوره رسمی: «${ctaText(topic)}»
طبق قانون برند، این خط‌های CTA فقط در همین اسلاید آخر بیاد، جای دیگه‌ای نیاد.

بعد از همه اسلایدها، یک کپشن اینستاگرام دقیقاً با همین ساختار (مثل نمونه کپشن بالا) بنویس:
۱. یک جمله محاوره‌ای شروع‌کننده (سؤال یا ادعای مخاطب‌محور) + پاسخ کوتاه
۲. خلاصه بولت‌دار (🔹) از نکات اصلی
۳. یک نکته مالی برجسته (📌 نکته مالی مهم: ...) — با عدد واقعی طبق «دقت در اعداد» بالا
۴. یک خط «این پست رو برای ... بفرست!» (بر اساس مخاطب موضوع تطبیق بده)
۵. یک سؤال تعاملی پایانی با 💬
۶. ${researchSourceLine(topic)}

اصل کلیدی: کل کاروسل باید به این سؤال جواب بده — «این اطلاعات برای مخاطب چه معنایی داره و الان باید چی رو بدونه یا چک کنه؟»

ایموجی‌ها فقط برای ساختار استفاده بشن، نه تزئین: 💶 = هزینه/شهریه، 🏦 = تمکن مالی، 🗓 = تاریخ/ددلاین، ⏳ = زمان پردازش، 🎓 = تحصیل، 📌 = ذخیره/نکته مهم، ⚠️ = هشدار، ✅ = بله/مزیت، ❌ = خیر/محدودیت.

منابع اطلاعاتی به این ترتیب اولویت دارن: ۱) منابع رسمی دولتی و ادارات مهاجرت ۲) سفارت‌خانه‌ها و سازمان‌های رسمی ۳) وب‌سایت رسمی دانشگاه‌ها ۴) منابع پذیرش رسمی ۵) فقط در صورت نیاز، منابع ثانویه معتبر. هرگز عدد، شرط، مزیت یا مسیر اقامتی بدون پشتوانه رسمی نساز؛ اگر اطلاعات ناقص یا متغیره، آن را قطعی جا نزن.

${researchBlock(topic)}

${feedbackBlock(topic.feedback)}

خروجی را دقیقاً با این دلیمیترها بده، هیچ متن اضافه‌ای قبل یا بعد از آن‌ها ننویس:
===SLIDE 1===
(محتوای اسلاید ۱)
===SLIDE 2===
(محتوای اسلاید ۲)
... همین‌طور تا آخرین اسلاید (شماره‌گذاری پیوسته، دقیقاً ${slideCount} اسلاید، نه بیشتر نه کمتر)
===CAPTION===
(متن کپشن اینستاگرام)`;
  console.log("[wizard] final prompt first 500 chars:", prompt?.slice(0,500));
  return prompt;
}

// Infographic: title, key stats, comparison table, roadmap, source citation.
export function infographicPrompt(topic, sourceText) {
  return `${BRAND_CONTEXT}

${brandDirectives()}
${languageInstruction(topic)}

تو طراح محتوای اینفوگرافیک برند «سوگیموتو ویزا» هستی. بر اساس «متن منبع» زیر، محتوای یک اینفوگرافیک بساز. فقط از فکت‌های داخل منبع استفاده کن.

${topicLine(topic)}
${toneInstruction(topic)}

===== متن منبع =====
${sourceBlock(sourceText)}
===== پایان متن منبع =====

${numberDisciplineBlock(topic)}

${researchBlock(topic)}

${feedbackBlock(topic.feedback)}

خروجی را دقیقاً با این دلیمیترها بده:
===TITLE===
(عنوان کوتاه اینفوگرافیک)
===STATS===
(۵ تا ۷ آمار/عدد کلیدی، هرکدام در یک خط، با فرمت «عدد — توضیح کوتاه» — از اعداد واقعیِ متن منبع استفاده کن، طبق قوانین دقت در اعداد بالا)
===COMPARISON===
(یک جدول مقایسه‌ای متنی بین ۲ یا ۳ گزینه مرتبط با موضوع)
===ROADMAP===
(نقشه راه گام‌به‌گام، هر گام در یک خط شماره‌گذاری‌شده)
===SOURCE===
دقیقاً همین CTA را در همین بخش بنویس: «${ctaText(topic)}»
${researchSourceLine(topic)}`;
}

// Reel script: 3s hook, 45-60s body, on-screen text markers, 5s CTA.
export function reelPrompt(topic, sourceText) {
  const isEnglish = topic.language === "english";
  const marker = isEnglish ? "[ON-SCREEN: ...]" : "[روی صفحه: ...]";
  const markerLabel = isEnglish ? "ON-SCREEN" : "روی صفحه";
  const narrationNote = isEnglish
    ? "روایت و متن‌های روی صفحه، هر دو به انگلیسی."
    : "روایت به فارسی، ولی متن‌های روی صفحه (on-screen text) به انگلیسی باشند.";
  return `${BRAND_CONTEXT}

${brandDirectives()}
${languageInstruction(topic)}

تو سناریونویس ریلز اینستاگرام برای برند «سوگیموتو ویزا» هستی. ${narrationNote} فقط بر اساس «متن منبع» زیر بنویس، چیزی از خودت اضافه نکن.

${topicLine(topic)}
${toneInstruction(topic)}

===== متن منبع =====
${sourceBlock(sourceText)}
===== پایان متن منبع =====

${numberDisciplineBlock(topic)}

ساختار اجباری:
- هوک (۳ ثانیه اول): یک جمله بسیار جذاب و توجه‌برانگیز
- بدنه (۴۵ تا ۶۰ ثانیه): توضیح اصلی خبر/موضوع، مستقیم و صمیمی — هر عدد واقعی (شهریه، هفته پردازش، تمکن مالی) را دقیق بگو، طبق قوانین دقت در اعداد بالا
- در پایان بدنه، اگر منبع تحقیق‌شده‌ای موجوده، یک ${marker} با این محتوا اضافه کن: ${researchSourceLine(topic)}
- CTA (۵ ثانیه پایانی): دقیقاً همین متن را بگو: «${ctaText(topic)}»
- در سراسر متن، هر جا لازم است متن روی صفحه بگذار با فرمت [${markerLabel}: TEXT] — این متن‌ها باید به انگلیسی باشند (به‌جز خط منبع که خودش شامل نام منبع واقعی می‌شود).

${researchBlock(topic)}

${feedbackBlock(topic.feedback)}

خروجی را دقیقاً با این دلیمیترها بده:
===HOOK===
(متن هوک ۳ ثانیه‌ای)
===BODY===
(متن بدنه، شامل مارکرهای ${marker} در جای مناسب)
===CTA===
(متن CTA پایانی)
===ONSCREEN===
(فهرست همه متن‌های روی صفحه که در بدنه استفاده شد، هرکدام در یک خط، به انگلیسی)`;
}

// Website blog article (Farsi), 400-700 words, H2 subheadings.
export function articlePrompt(topic, sourceText) {
  return `${BRAND_CONTEXT}

${brandDirectives()}
${languageInstruction(topic)}

تو نویسنده مقالات وبلاگ برند «سوگیموتو ویزا» هستی. یک مقاله اصیل (نه ترجمه) بر اساس «متن منبع» زیر بنویس. فقط از فکت‌های داخل منبع استفاده کن.

${topicLine(topic)}
${toneInstruction(topic)}

===== متن منبع =====
${sourceBlock(sourceText)}
===== پایان متن منبع =====

${numberDisciplineBlock(topic)}

مقاله باید ۴۰۰ تا ۷۰۰ کلمه باشد، با زیرتیترها (H2) ساختاردهی شده باشد و در پایان یک جمع‌بندی کوتاه داشته باشد. در همان جمع‌بندی پایانی، یک پاراگراف آخر با دقیقاً همین CTA بگذار: «${ctaText(topic)}» و بعد از آن، به‌عنوان آخرین خط مقاله: ${researchSourceLine(topic)}

${researchBlock(topic)}

${feedbackBlock(topic.feedback)}

خروجی را دقیقاً با این دلیمیترها بده:
===TITLE===
(عنوان مقاله)
===CONTENT===
(متن کامل مقاله با زیرتیترها، شامل خط منبع و CTA در پایان)`;
}

// Clean Telegram post: short intro, key points, one golden tip, <=300 words.
export function telegramPrompt(topic, sourceText) {
  return `${BRAND_CONTEXT}

${brandDirectives()}
${languageInstruction(topic)}

تو ویراستار کانال تلگرام «سوگیموتو ویزا» هستی. یک پست خبری/اطلاع‌رسانی کوتاه بساز، حداکثر ۳۰۰ کلمه، فقط بر اساس «متن منبع» زیر.

${topicLine(topic)}
${toneInstruction(topic)}

===== متن منبع =====
${sourceBlock(sourceText)}
===== پایان متن منبع =====

${numberDisciplineBlock(topic)}

ساختار اجباری:
- مقدمه کوتاه (۲ جمله)
- ۵ تا ۷ نکته کلیدی، هرکدام با یک ایموجی مناسب در ابتدا — اعداد واقعی (شهریه، هفته پردازش، تمکن مالی) را دقیق بنویس، طبق قوانین دقت در اعداد بالا
- یک نکته طلایی در انتها، شروع‌شونده با ⚠️
- بعد از نکته طلایی، دقیقاً همین CTA را بنویس: «${ctaText(topic)}»
- بعد از CTA، اگر منبع تحقیق‌شده‌ای موجوده، به‌عنوان آخرین خط پست: ${researchSourceLine(topic)}
(خط منبع و CTA جزو محدودیت ۳۰۰ کلمه محتوای خبری اصلی حساب نمی‌شوند، جدا اضافه‌شان کن)

${researchBlock(topic)}

${feedbackBlock(topic.feedback)}

خروجی را دقیقاً با این دلیمیتر بده، بدون هیچ متن اضافه قبل یا بعدش:
===TEXT===
(متن کامل پست شامل خط منبع و CTA در پایان)`;
}

// Two-angle summary for Path B step 3: user picks one before final generation.
// Angle 1 = practical (what it means for the applicant right now)
// Angle 2 = analytical (the bigger picture / why this is happening)
export function summaryPrompt(topic, sourceText) {
  const langNote = topic.language === "english"
    ? "Write both summaries in English."
    : "Write both summaries in Persian (Farsi).";
  return `You are a content strategist for the immigration brand @sugimotovisa.

Topic: ${topic.title || topic.subject || ""}
Country: ${topic.country || ""}
Category: ${topic.field || ""}
Tone: ${topic.tone || "educational"}
${langNote}

Write TWO different 200-word summaries about this topic, each from a distinct angle.
Keep them factual, analytical and grounded — no invented numbers or guarantees.
Do not write sales language.

Output exactly:
===SUMMARY 1===
(Practical angle — what this means for applicants right now, what they should check or do)
===SUMMARY 2===
(Analytical angle — why this is happening, the bigger policy or market context)`;
}

export function parseSummaries(raw) {
  const t = String(raw || "");
  const s1 = t.indexOf("===SUMMARY 1===");
  const s2 = t.indexOf("===SUMMARY 2===");
  if (s1 === -1 && s2 === -1) return [t.trim()].filter(Boolean);
  const sum1 = s1 !== -1
    ? t.slice(s1 + "===SUMMARY 1===".length, s2 !== -1 ? s2 : undefined).trim()
    : "";
  const sum2 = s2 !== -1 ? t.slice(s2 + "===SUMMARY 2===".length).trim() : "";
  return [sum1, sum2].filter(Boolean);
}

// The model occasionally echoes a delimiter token (e.g. "===TEXT===") inside
// section content — most often when a previous raw response gets fed back in
// during a feedback/regenerate round. Strip them so they never reach output.
function stripStrayMarkers(s) {
  return String(s || "")
    .replace(/={3,}\s*[A-Z][A-Z_ ]*(?:\s+\d+)?\s*={3,}/g, "")
    .trim();
}

// Parse `===NAME===` delimited output into a { name: value } object.
export function parseDelimited(text, order) {
  const t = String(text || "");
  const out = {};
  for (const name of order) {
    const marker = "===" + name + "===";
    const start = t.indexOf(marker);
    if (start === -1) {
      out[name] = "";
      continue;
    }
    const from = start + marker.length;
    let end = t.length;
    for (const other of order) {
      if (other === name) continue;
      const i = t.indexOf("===" + other + "===", from);
      if (i !== -1 && i < end) end = i;
    }
    out[name] = stripStrayMarkers(t.slice(from, end));
  }
  return out;
}

// carouselPrompt() output -> {slides: [{num, content}], caption}
export function parseCarousel(text) {
  const t = String(text || "");
  const slides = [];
  const re = /===SLIDE (\d+)===/g;
  const marks = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    marks.push({ num: Number(m[1]), start: m.index, contentStart: m.index + m[0].length });
  }
  const captionMarkerIdx = t.indexOf("===CAPTION===");
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : captionMarkerIdx !== -1 ? captionMarkerIdx : t.length;
    slides.push({ num: marks[i].num, content: stripStrayMarkers(t.slice(marks[i].contentStart, end)) });
  }
  const caption = captionMarkerIdx !== -1 ? stripStrayMarkers(t.slice(captionMarkerIdx + "===CAPTION===".length)) : "";
  return { slides, caption };
}

// infographicPrompt() output -> {title, stats, comparison, roadmap, source}
export function parseInfographic(text) {
  const d = parseDelimited(text, ["TITLE", "STATS", "COMPARISON", "ROADMAP", "SOURCE"]);
  return {
    title: d.TITLE,
    stats: d.STATS.split("\n").map((s) => s.trim()).filter(Boolean),
    comparison: d.COMPARISON,
    roadmap: d.ROADMAP,
    source: d.SOURCE,
  };
}

// reelPrompt() output -> {hook, body, cta, onscreen}
export function parseReel(text) {
  const d = parseDelimited(text, ["HOOK", "BODY", "CTA", "ONSCREEN"]);
  return {
    hook: d.HOOK,
    body: d.BODY,
    cta: d.CTA,
    onscreen: d.ONSCREEN.split("\n").map((s) => s.trim()).filter(Boolean),
  };
}

// telegramPrompt() output -> {text}
export function parseTelegramPost(text) {
  const d = parseDelimited(text, ["TEXT"]);
  return { text: d.TEXT };
}

// articlePrompt() output -> {title, content}
export function parseArticle(text) {
  const d = parseDelimited(text, ["TITLE", "CONTENT"]);
  return { title: d.TITLE, content: d.CONTENT };
}

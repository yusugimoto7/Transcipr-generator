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
- NEVER include anything older than 14 days from ${todayStr}. If an article/announcement is older than two weeks, DROP it — do not put it on the list.
- Ignore anything from before ${year} entirely.
- Put the item's real publication date in "why_now", and only keep it if that date is within the last 14 days.
- Always include the current year (${year}) and words like "this week"/"latest" in your queries, and sort/prefer the newest results.
If you genuinely cannot find 10 recent items, return FEWER — as few as 3 is fine. NEVER pad the list with outdated news or with generic how-to/explainer topics. Only real, recent developments.

HARD EXCLUSION — DO NOT include any of these; the brand already covers them:
- Express Entry DRAW results, CRS cut-off scores, "latest draw" / "newest draw" announcements, or number-of-invitations round-ups. NONE of these. If a development is basically "Canada held an Express Entry draw / the CRS score was X", SKIP it entirely.
Focus instead on: Provincial Nominee Programs (especially BC PNP), study permits & PGWP, work permits & LMIA, IRCC policy/rule changes, bans/caps/deadlines, notable Federal Court decisions, and Europe (Germany Opportunity Card, Portugal, etc.).

IMPORTANT — be efficient with searches: do at most ${"5"} web searches total. Use broad, batched queries (e.g. "Canada immigration news this week ${year} PNP PGWP work permit policy change") that surface several developments at once, then a couple of follow-ups for specifics or Europe. A handful of well-chosen searches is enough.

Generate up to 10 short-video topic ideas optimized for engagement with THIS audience:
- EVERY topic must be tied to a SPECIFIC, very recent (last 14 days) development — include the concrete detail AND its date in "why_now" and the machine-readable date in "date".
- NO evergreen/how-to/explainer topics. If it isn't a real recent development, don't return it.
- Each "source_url" must be the SPECIFIC article/announcement page for that development — never a generic landing/overview page (e.g. never a bare "immigrate to Canada" or program-overview page).
- Every topic must be DISTINCT and based on a DIFFERENT development/article. NEVER return two entries about the same news item, the same underlying article, or the same development worded differently.

Proven winning patterns in this niche: (1) name "Iranians" directly in hooks, (2) high-stakes / anxiety framing (permit ending, refusal, deadline, ban), (3) rejection-reversal & real case stories, (4) BC PNP & occupation-specific, (5) Europe is uncontested white space. Anxiety + specificity beat generic eligibility overviews.${excludeBlock}

Return ONLY a JSON array (no markdown fences, no preamble, no trailing text) of exactly 10 objects with keys:
- "title_fa": the Farsi hook/title, punchy and ready to put on screen
- "title_en": short English title
- "field": one of "PNP","Study","Work Permit","LMIA","Policy","Court","Europe" (do NOT use "Express Entry")
- "page": "CA" or "EU"
- "why_now": ONE sentence in Persian. For news topics, tie it to the specific recent development and include its date. For evergreen topics, explain why it's always relevant.
- "date": for a NEWS topic, the development's real publication/announcement date in strict "YYYY-MM-DD" format (must be within the last 14 days of ${todayStr}). For an EVERGREEN topic, an empty string "".
- "source_url": REQUIRED for every topic — it must NEVER be empty. For a NEWS topic, the exact, real URL of the specific web page (from your search results) it is based on; use the actual URL from a search result, never a made-up or generic homepage link. For an EVERGREEN topic (not tied to one article), give the single most relevant official government reference page (e.g. the specific IRCC.ca / canada.ca page for that program, or the relevant official European immigration page) — a real, working, specific URL, never a bare homepage and never empty.
- "score": integer 60-98 engagement-potential score
Order by "score" descending. Output the JSON array and nothing else.`;
}

// Topic generation is two calls, not one. Selection judges which items are
// worth a card; writing then turns only those into cards, grounded in the text
// fetched for each. The single combined prompt this replaced told the model
// that "3 accurate cards beat 8", and caution about writing leaked into
// selection: it returned 2-3 cards no matter how much real news it was shown.

// Stage 1: pick. Sees compact headlines + a little text; returns ids only.
export function selectTopicsPrompt(items, todayStr, excludeTitles = [], want = 14) {
  const list = items
    .map(
      (it, i) =>
        `[${i}] ${it.published ? it.published.slice(0, 10) : "undated"} · ${it.source_name} · ${it.title}` +
        (it.brief ? `\n    ${it.brief}` : "")
    )
    .join("\n");
  const excludeBlock = excludeTitles.length
    ? `\n\nALREADY COVERED — skip anything that is the same development as these:\n${excludeTitles
        .slice(0, 80)
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "";
  return `You are the content strategist for Sugimoto Visa, a Persian-language immigration brand. Audience: Iranians aiming to immigrate to, study in, work in, or stay in Canada or Europe. TODAY IS ${todayStr}.

Below are ${items.length} real, recent items from immigration news, government sources, court decisions and practitioner channels. Choose the ${want} that would make the best short-video topics for this audience.

CHOOSE items that report a concrete development: a rule, program, fee, cap, deadline, processing, eligibility or policy change; a notable court decision; a new or closing stream or intake; official figures; Europe residence/work/study routes. Practical, specific and consequential beats general.
SKIP: Express Entry draw results and CRS cut-offs (covered elsewhere), US-only immigration, opinion pieces, listicles, promotional content, crime/politics stories where immigration is incidental, and anything off-topic.
SKIP EVERGREEN: explainers that restate existing rules with nothing having changed ("Canada lists 5 rules for…", "3 reasons your permit…", "how to apply for…") are not news, however recent their date. Exception: at most 2 picks may be a specific question practitioners are answering right now (e.g. a lawyer's video on a situation many applicants face) — only when it is concrete.
COURT DECISIONS: choose one only if its text shows a notable ruling with wider consequences; a bare case name is not enough.
NEWSLETTER ITEMS ("[Lexbase newsletter, …]"): items from a practitioners' newsletter — a policy or operational note, or a Federal Court decision. These are high-credibility and usually not covered elsewhere. Choose a court item when the ruling has consequences for applicants in general (refusals, procedural fairness, evidence, delays); choose a policy note when it reports a concrete change or practice. Each item is a separate development; several may be chosen.
PRIORITY ("[priority: …]"): the item concerns Iranians, study permits or the Start-up Visa — the audience's own files. Always choose these unless one repeats an already covered development.
CREATOR POSTS ("@name · Instagram"): these show what immigration creators and their audiences are talking about right now. Choose one when it reports or explains a concrete, current development or a specific situation many applicants face. Skip self-promotion, testimonials, giveaways, "book a consultation" posts and generic motivation. When a creator post and a news item cover the same development, prefer the news item.
A short headline is fine — judge the development it reports; full article text is fetched after you choose.
VARIETY: if several items report the same development, choose only the best one. Spread choices across beats (PNP, study, work permits, PR/policy, citizenship, family, court, Europe) rather than taking many from one beat.
RECENCY: when two are comparable, the newer wins.
HEAT: "[covered by N sources …]" means several outlets or creators are reporting the same development right now. That is strong evidence it matters to the audience; weigh it heavily — but never above freshness: this week's news beats an older widely covered story.
CREDIBILITY: prefer official and established sources (IRCC/canada.ca, provincial governments, Canada Gazette, courts, CIC News, major newspapers, EU and national government sites) over minor blogs.

ITEMS:
${list}${excludeBlock}

Return ONLY a JSON array, best first, of up to ${want} objects: {"id": <the [number]>, "field": one of "PNP","Study","Work Permit","LMIA","Policy","Citizenship","Family","Court","Europe", "score": integer 60-98 for engagement potential}. No other text.`;
}

// Stage 2: write. Each item arrives with the text it can be grounded in.
// Persian names for every immigration term come from the glossary (lib/glossary.js, edited in the
// Google Sheet's Glossary tab): a work permit is «اجازه کار» in every piece. The prompt builders in
// this file are synchronous, so they carry this short rule and every writing step appends the list
// itself with `await glossaryBlock(lang)` (see the call sites in app/api and lib).
export const TERM_RULE = `
FARSI NAMES (required in all Persian text): institutions, programmes, permits and documents are named in Persian exactly as the GLOSSARY in this prompt gives them; the English name or acronym follows in parentheses the FIRST time only, when people know the term by it; afterwards the Persian name alone. Never use a bare English acronym as the name, and never a form the glossary marks «نه:». Names of people stay as they are. A term not in the glossary: Persian wording first, the English in parentheses once.
`;

export function writeCardsPrompt(items, todayStr) {
  const list = items
    .map((it, i) => {
      const body = it.groundText
        ? it.groundText.slice(0, 1400)
        : "(headline only — no article text available)";
      return `[${i}] ${it.published ? it.published.slice(0, 10) : "undated"} · ${it.source_name}\nHEADLINE: ${it.title}\nTEXT: ${body}`;
    })
    .join("\n\n");
  return `You write short-video topic cards for Sugimoto Visa, a Persian-language immigration brand for Iranians aiming for Canada or Europe. TODAY IS ${todayStr}.

Write ONE card for EVERY item below. Each item has already been chosen as worth covering.

⛔️ GROUNDING (non-negotiable): everything in a card must be stated in that item's HEADLINE or TEXT. Never add a number, date, program name, eligibility rule or claim that is not there. For an item marked "headline only", the card may say only what the headline says — no added detail.

Voice: punchy, specific, honest high-stakes framing where the facts support it; name Iranians directly when it genuinely applies. No sales lines.
${TERM_RULE}

ITEMS:
${list}

Return ONLY a JSON array with one object per item: {"id": <the [number]>, "title_fa": Farsi on-screen hook, "title_en": short English title, "why_now": ONE Farsi sentence on what changed and for whom, "page": "CA" or "EU"}. No other text.`;
}

// CLEAN channel news post (for Telegram/the public channel) — NOT a video
// script. No hooks, no "if you're following X", no sales/CTA lines. Just the
// news, clearly, grounded strictly in the real source. Links are added in code.
// The team's Telegram voice (Oct 2026, with posts from a successful Persian immigration channel as
// the model): a lawyer friend posting himself, first person, colloquial, short, still exact. The
// sample lines are that channel's, for tone only; never a source of facts.
const TG_VOICE = `لحن و ادبیات (مهم‌ترین بخش):
- تو خودت، به‌عنوان یک وکیل مهاجرت دوست‌داشتنی و خودمونی، داری توی کانال خودت پست می‌ذاری. اول‌شخص و محاوره‌ای بنویس، مثل حرف زدن با دوستات: «میشه»، «دارن»، «میخواد»، «یعنی»، «نکته اینجاست»، «قسمت جالبش اینه که…»، «این سؤال داره زیاد پرسیده میشه».
- کوتاه و سرراست: معمولاً ۲ تا ۵ پاراگراف کوتاه، هر کدوم یکی دو جمله. اصل خبر یا جواب رو همون اول بگو.
- خودمونی بودن یعنی دقیق نبودن نیست: اعداد، تاریخ‌ها، کدها و اسم برنامه‌ها دقیقاً همون چیزی باشه که در متن منبع اومده.
- اصطلاح‌ها رو همون‌طور بگو که فارسی‌زبان‌های کانادا می‌گن (مثلاً CEC، کد ناک، ال‌ام‌آی‌ای، اکسپرس اینتری؛ فرم‌های واژه‌نامه). اگر اصطلاحی برای عموم ناآشناست، بار اول یک توضیح خیلی کوتاه بده.
- می‌تونی برداشت خودت رو بگی («فکر کنم…»، «به نظرم…»، «یعنی برای کسانی که…»)، ولی فقط وقتی مستقیم از فکت‌های همین متن منبع درمیاد. برداشت هیچ‌وقت عدد، تاریخ، برنامه یا ادعای تازه‌ای نمیاره و پیش‌بینی قطعی نمی‌کنه.
- اگر یک جملهٔ کوتاه انگلیسی از متن منبع اصل حرف رو می‌زنه، می‌تونی عیناً نقلش کنی (کلمه‌به‌کلمه از متن منبع، در یک خط جدا داخل « »).
- تیتر لازم نیست. اگر خواستی، خط اول یک جملهٔ کوتاه پررنگ (<b>…</b>) باشه. حداکثر یک ایموجی.

نمونهٔ لحن (از یک کانال موفق؛ فقط برای لحن، هیچ فکتی از این نمونه‌ها برندار):
«قسمت جالبش برای اینایی که هنوز یکسال سابقه کار کانادایی رو بدست نیاوردن. اما شغل فعلی و جاری شون در همون مشاغل پردرآمد طبقه بندی میشه. اینا بدون نیاز به ال ام آی ای و با تایید کارفرما میتونن بگن جاب افر داریم و امتیاز قسمت جاب افر و بگیرن.»
«این سوال داره زیاد پرسیده میشه. من کوتاه جواب میدم… سوال: آیا کسی که در لیست مشاغل پردرامد قرار داره، اما حقوقش در رنج حداقل یا متوسط اون شغل نمیرسه، همچنان واجد شرایطه؟ پاسخ: هیچ پیش شرط مستقیمی در بحث امتیاز مشاغل پر درامد برای میزان حقوق افراد تعریف نشده… اما نکته اینجاست…»
«یعنی یک تغییراتی برنامه ریختن که ۵ بار باید بخونی تا بفهمی چی به چیه، ولی خیلی خوبه کلا. برای بچه هایی که اینجا در فیلد های مهندسی و کلا رشته های با درامد بالا فعالیت دارند، بسیار بسیار خبر خوبیه.»`;

const TG_RULES = `قوانین سخت‌گیرانه:
- فقط از فکت‌های داخل «متن منبع» استفاده کن. هیچ عدد، تاریخ، برنامه یا ادعایی که در منبع نیست از خودت نساز. اگر منبع کم‌جزئیاته، کوتاه‌تر بنویس.
- ⛔️ هیچ جملهٔ تبلیغاتی یا دعوت به اقدام: «به ما پیام بدید»، «برای مشاوره …»، «رزرو کنید»، «دنبال کنید»، «لینک در بیو» ممنوع.
- ⛔️ به «منبع» یا «متن» اشاره نکن («طبق منبع»، «بر اساس گزارش»، «در متن آمده» ممنوع). خبر رو از زبان خودت بگو.
- بدون هشتگ و بدون لینک (لینک جدا اضافه میشه). از em dash/en dash استفاده نکن.
- فقط تگ‌های <b> و <i> (parse_mode=HTML). خروجی فقط متن پست باشه.`;

export function newsPostPrompt(topic, sourceText = "") {
  const source = String(sourceText || topic.snippet || "").trim();
  const block = source.length > 60 ? source.slice(0, 4000) : "(متن کامل خبر در دسترس نیست — فقط بر اساس همین تیتر و توضیح کوتاه، و بدون افزودن چیزی)";
  const what = topic.evergreen
    ? `یک پست آموزشی دربارهٔ یک قانون یا روند همیشگی (خبر نیست؛ «اعلام شد» و «به‌تازگی» ننویس). سؤالی که مردم دارن: «${topic.question || topic.title_fa}». جوابش رو از متن منبع (صفحهٔ رسمی اداره مهاجرت کانادا) بده، فقط همون بخش‌هایی که به این سؤال مربوطن.${stayOnQuestion(topic, "fa")}`
    : topic.newsletter === "lexbase"
      ? `یک پست دربارهٔ ${topic.kind === "court" ? "یک حکم دادگاه فدرال کانادا" : "یک سند خود اداره مهاجرت کانادا"}: اول خود حکم یا سند رو بگو (چه کسی، چه درخواستی، چه تصمیمی، به چه دلیل)، بعد اگه نکته‌ای برای بقیه داره، کوتاه بگو. «اگر برای … اقدام می‌کنید» ننویس.`
      : `یک پست دربارهٔ این خبر: چی شده، از کی، برای چه کسانی، و به نظرت معنیش چیه.`;
  return `برای کانال تلگرام «سوگیموتو ویزا» (مخاطب: فارسی‌زبان‌های علاقه‌مند به مهاجرت کانادا و اروپا) ${what}

${TG_VOICE}

${TG_RULES}

موضوع: ${topic.title_fa || topic.title_en || ""}

===== متن منبع (تنها منبع مجاز فکت‌ها) =====
${block}
===== پایان متن منبع =====`;
}

// Script prompt. Produces ONLY the spoken script text (what the presenter says
// to camera). CRITICALLY: it is grounded in the REAL source article text
// (`sourceText`) so the script is about the actual news, and the model is
// forbidden from inventing facts not present in the source.
// How the team actually speaks on camera (corrected subtitles of their own video "Inland vs
// overseas sponsorship", english-sugimotovisa roughcuts/RC2). Style reference only: the wording,
// rhythm and the English term after the Persian one; never a source of facts.
const VOICE_SAMPLE_FA = `اگه شما و همسرتون یا شریک زندگیتون داخل کانادا هستید و می‌خواید برای پرونده‌ی اسپانسرشیپ همسر اقدام کنید، دو تا راه پیش رو دارید: اینکه پرونده‌تون رو به شکل Inland، یعنی پرونده‌ی داخل کانادا، اقدام کنید یا به شکل Outland یا Overseas. پرونده‌هایی که Overseas اقدام می‌شن برای بررسی به یکی از دفاتر اداره مهاجرت کانادا در خارج از کانادا فرستاده می‌شه؛ برای ملیت ایرانی معمولاً دفتر آنکارا. این روزا پرونده‌های Overseas زمان بررسی یا Processing Time کوتاه‌تری نسبت به پرونده‌های Inland دارن.`;

// Lexbase items are not news to announce: they are court decisions and IRCC's own documents
// (officer training, internal notes, answers to officers' questions), told the way the team's
// informative stories tell them (Oct 2026: "دادگاه فدرال کانادا فلان حکم را صادر کرد… نه اینکه
// بگیم اگر برای مجوز کار اقدام می‌کنید این خبر برات مهمه"). The sample lines are the team's own
// stories, for voice only.
function lexbaseScriptPrompt(topic, lang, sourceBlock) {
  const court = topic.kind === "court";
  const outcome = topic.outcome === "allowed" ? (lang === "fa" ? "پذیرفته شد" : "allowed") : topic.outcome === "dismissed" ? (lang === "fa" ? "رد شد" : "dismissed") : "";
  if (lang === "fa") {
    return `تو برای برند مهاجرتی «سوگیموتو ویزا» متن گفتاری یک ویدیوی کوتاه می‌نویسی، از روی یک ${court ? "حکم دادگاه فدرال کانادا" : "سند خود اداره مهاجرت کانادا (مثل محتوای آموزشی افسران، یادداشت داخلی، یا پاسخ به سؤال افسران)"} که در خبرنامهٔ تخصصی Lexbase آمده.

🎯 این «خبر» نیست که اعلامش کنیم؛ گزارش آگاه‌کننده است، به همان شکلی که استوری‌های اطلاع‌رسانی ما نوشته می‌شوند: چه کسی، چه درخواستی داده بود، چه تصمیمی گرفته شد و به چه دلیل.

شیوهٔ نوشتن:
${court ? `۱. با خود حکم شروع کن: «دادگاه فدرال کانادا درخواست … را ${topic.outcome === "allowed" ? "پذیرفت" : topic.outcome === "dismissed" ? "رد کرد" : "پذیرفت / رد کرد"}» یا «دادگاه فدرال کانادا حکم داد که …».${outcome ? ` نتیجهٔ این پرونده «${outcome}» است؛ خلاف آن ننویس.` : ""}
۲. پرونده را بگو: متقاضی کیست (ملیت، شغل یا وضعیت، فقط اگر در متن هست)، چه درخواستی داده بود و از کی.
۳. استدلال اداره مهاجرت یا افسر را بگو، بعد جواب قاضی و دلیلش را.
۴. اگر متن، نکتهٔ کلی‌ای از حکم درمی‌آورد (مثلاً «سابقهٔ کار خوداشتغالی برای CEC قبول نیست»)، همان را در یک جمله بگو.
۵. در پایان نام پرونده را همان‌طور که در متن هست بگو (مثلاً «پرونده‌ی Saravanabavanathan علیه کانادا»).` : `۱. با خود سند شروع کن: «محتوای آموزشی افسران اداره مهاجرت کانادا برای بررسی پرونده‌های … نشان می‌دهد …»، «یادداشت‌های داخلی اداره مهاجرت کانادا نشان می‌دهد …» یا «سؤالی که از اداره مهاجرت پرسیده شد: … پاسخ: …».
۲. محتوای سند را به ترتیب و دقیق بگو: کدام بخش، چه قاعده یا مرحله‌ای، چه عدد یا آماری.
۳. اگر سند یک نکتهٔ مهم یا جالب دارد، همان را برجسته کن («جالب اینه که اولین قدم …»).`}

⛔️ ممنوع: «اگر برای … اقدام می‌کنید»، «این خبر برای شما مهمه»، «برای شما چه معنی دارد»، شروع با خطاب به بیننده یا سؤال از او، توصیه و «قدم بعدی»، دعوت به مشاوره یا دایرکت، و عبارت‌های خبری مثل «اعلام شد» یا «به‌تازگی». کلمهٔ «شما» را فقط وقتی بیاور که خود سند دربارهٔ متقاضی حرف می‌زند.
⛔️ فقط فکت‌های متن منبع: هیچ نام، عدد، تاریخ، ملیت یا دلیلی که در متن منبع نیست اضافه نکن. اگر متن کوتاه است، کوتاه بنویس.
⛔️ هرگز «طبق منبع»، «بر اساس خبرنامه» یا «Lexbase» را نگو؛ خودت روایت کن.
${TERM_RULE}
لحن: فارسی محاوره‌ای و روان، مثل گفتار راوی جلوی دوربین (نه متن اداری و نه ترجمه). جمله‌های کوتاه. فقط پاراگراف‌های روان، بدون تیتر، هشتگ یا متن روی تصویر.

نمونهٔ لحن از استوری‌های خود ما (فقط برای لحن؛ فکت‌ها را از متن منبع بگیر):
«دادگاه فدرال کانادا با درخواست مندیمس یک متقاضی اهل سریلانکا موافق کرد و به اداره مهاجرت ۹۰ روز وقت داد تا جواب اپلیکیشن ایشون رو مشخص کنه. این متقاضی پرونده اسپانسرشیپ خودش رو در سال ۲۰۱۹ اقدام کرده و هنوز جوابش نیومده بود. دادگاه با استدلال اداره مهاجرت مبنی بر اینکه اگر ما فایل ایشون رو جلو بندازیم رعایت حق بقیه کسانی که در صف هستند رو نکردیم، مخالفت کرد.»
«حکم دادگاه فدرال کانادا تأکید کرد که سابقه کاری داخل کانادا که با ورک پرمیت C11 (Self-employed) به دست آمده، به عنوان سابقه کار مورد قبول در برنامه اقامت دائم اکسپرس انتری CEC قبول نیست.»
«سؤال از اداره مهاجرت کانادا: اگر فردی اسپانسر همسر خود بشه و پرونده PR قبول شه، اما همسر هنوز به خاک کانادا نرسیده باشه، و اسپانسر درخواست کنسل شدن پرونده رو بده، آیا همچنان وظیفه سه ساله اسپانسری بر گردن اسپانسر می‌مونه؟ پاسخ: بله.»

عنوان کارت: ${topic.title_fa}
${topic.citation ? `پرونده: ${topic.citation}
` : ""}===== متن منبع (تنها منبع مجاز فکت‌ها) =====
${sourceBlock}
===== پایان متن منبع =====`;
  }
  return `You write the spoken script of a short video for Sugimoto Visa, a licensed immigration firm, from ${court ? "a Federal Court of Canada decision" : "one of IRCC's own documents (officer training material, an internal note, or an answer to officers' questions)"} summarised in the Lexbase newsletter.

🔤 OUTPUT LANGUAGE: ENGLISH ONLY.
🎯 This is not news to announce. It is an informative report, the way the brand's information stories are written: who applied for what, what was decided, and why.

How to write it:
${court ? `1. Open with the ruling itself: "The Federal Court of Canada ${outcome || "allowed / dismissed"} …" or "The Federal Court ruled that …".${outcome ? ` The outcome is "${outcome}"; never contradict it.` : ""}
2. The case: who the applicant is (nationality, job or status, only if stated), what they applied for and since when.
3. IRCC's or the officer's argument, then the judge's answer and the reason.
4. If the text draws a general point from it, state that point in one sentence.
5. Close with the case name as written in the text.` : `1. Open with the document itself: "IRCC's training material for officers reviewing … shows …", "IRCC's internal notes show …", or "A question put to IRCC: … The answer: …".
2. Give its content in order and exactly: which section, which rule or step, which number.
3. If it holds one striking point, bring it out.`}

⛔️ Never: "if you are applying for …", "this matters to you", opening by addressing the viewer or asking them a question, advice or "next steps", a call to book a consultation or DM, news wording ("announced", "recently").
⛔️ Only facts in the source text: no name, number, date, nationality or reason that is not there. Short source, short script.
⛔️ Never say "according to the source", "the newsletter" or "Lexbase".
Plain paragraphs of spoken English, short sentences, no titles or hashtags.

Card title: ${topic.title_en || topic.title_fa}
${topic.citation ? `Case: ${topic.citation}
` : ""}===== SOURCE TEXT (the ONLY allowed source of facts) =====
${sourceBlock}
===== END SOURCE TEXT =====`;
}

// An explainer rests on a whole official page (the visitor visa page covers biometrics, fees,
// processing times…), and the writer used to answer the question in one paragraph and then walk
// through the rest of the page. Hamed (Oct 21 2026): stay on the topic from the first line to the
// last. Every evergreen prompt carries this.
export function stayOnQuestion(topic, lang = "en") {
  const q = topic.question || topic.title_fa || topic.title_en || "";
  return lang === "fa"
    ? `\n⛔️ پایبندی به موضوع (نقض‌ناپذیر): از اول تا آخر فقط دربارهٔ همین سؤال حرف بزن: «${q}». هر پاراگراف باید مستقیم به همین سؤال جواب بده یا آن را روشن‌تر کند. متن منبع یک صفحهٔ کلی است؛ فقط بخش‌هایی را که به این سؤال مربوطند استفاده کن و بقیه (هزینه‌ها، زمان بررسی، بیومتریک، مراحل کلی درخواست و هر چیز دیگر) را کنار بگذار، مگر مستقیماً به جواب همین سؤال ربط داشته باشد. اگر متن منبع دربارهٔ این سؤال کم گفته، کوتاه‌تر بنویس؛ با اطلاعات کلی صفحه پرش نکن. قبل از تمام کردن، هر پاراگراف را با سؤال مقایسه کن و پاراگرافی را که دربارهٔ چیز دیگری است حذف کن.\n`
    : `\n⛔️ STAY ON THE QUESTION (non-negotiable): from the first line to the last, talk only about this question: "${q}". Every paragraph must answer it directly or make the answer clearer. The source is a general page: use only the parts that bear on this question and leave the rest (fees, processing times, biometrics, the general application steps, anything else) out unless it is part of the answer to this question. If the source says little about the question, write less; never pad with the page's general information. Before finishing, check each paragraph against the question and drop any that is about something else.\n`;
}

export function scriptPrompt(topic, lang, sourceText = "") {
  const source = String(sourceText || topic.snippet || "").trim();
  const hasSource = source.length > 60;
  // The fallback note is in the script's own language: a Farsi note inside the
  // English prompt was one of the things pulling the English script into Farsi.
  const sourceBlock = hasSource
    ? source.slice(0, 4500)
    : lang === "fa"
      ? "(متن کامل خبر در دسترس نیست — فقط بر اساس همین تیتر و توضیح کوتاه بنویس و چیزی از خودت اضافه نکن)"
      : "(The full text is not available — write only from the title and short description, and add nothing of your own.)";

  if (topic.newsletter === "lexbase") return lexbaseScriptPrompt(topic, lang, sourceBlock);

  const ever = !!topic.evergreen;
  if (lang === "fa") {
    return `تو یک سناریونویس حرفه‌ای ویدیوهای کوتاه فارسی برای برند مهاجرتی «سوگیموتو ویزا» هستی (مخاطب: ایرانی‌های علاقه‌مند به مهاجرت). این برند یک مؤسسهٔ رسمی مهاجرتیه، پس دقت و صداقت مطلقاً حیاتیه.
${ever ? `
🎯 این ویدیو «خبر» نیست؛ یک ویدیوی آموزشی دربارهٔ یک قانون یا روند همیشگیه. سؤالی که مخاطب دارد: «${topic.question || topic.title_fa}»${topic.gap ? `\nاشتباه یا سوءتفاهم رایج: «${topic.gap}» (فقط چارچوب است؛ هر قاعده و عددی باید از متن منبع بیاید).` : ""}
«متن منبع» پایین، صفحهٔ رسمی اداره مهاجرت کانادا (IRCC) دربارهٔ همین موضوع است. از همان صفحه فقط آنچه به این سؤال جواب می‌دهد را توضیح بده. هیچ عبارت خبری مثل «اعلام شد»، «به‌تازگی»، «تغییر کرد» ننویس، مگر در متن منبع باشد.
${stayOnQuestion(topic, "fa")}` : ""}

فقط «متنِ گفتاری» ویدیو رو بنویس — دقیقاً همون چیزی که راوی جلوی دوربین می‌گه. بدون تیتر، بدون بخش‌بندی، بدون «متن روی تصویر» و بدون هشتگ. فقط پاراگراف‌های روان.

⛔️ قانون طلایی (نقض‌ناپذیر): سناریو باید فقط و فقط دربارهٔ همین خبری باشه که در «متن منبع» پایین اومده. فقط از فکت‌هایی استفاده کن که واقعاً توی متن منبع هستن. هیچ عدد، تاریخ، برنامه، امتیاز، آمار یا ادعایی که در متن منبع نیست از خودت نساز. اگر اطلاعات کمه، سناریوی کوتاه‌تر و واقعی بنویس؛ چیزی از خودت اضافه نکن. اگر متن منبع فقط یک اطلاعیه یا اعلان کوتاهه (مثلاً «قراره فلان‌جا یک خبر اعلام بشه»)، دقیقاً همون رو بگو و اشاره کن جزئیات هنوز اعلام نشده — یک خبر جعلی نساز.

⛔️ خبر رو مستقیم و به زبون خودت بگو، نه به‌عنوان خلاصه‌ای از یک منبع. هرگز نگو «طبق منبع»، «بر اساس منبع»، «منبع می‌گوید» یا «در متن آمده».

⛔️ اصطلاحات تخصصی: نام نهادها، برنامه‌ها و مدارک را به فارسی بگو و فقط بار اول، عبارت انگلیسی یا مخفف را داخل پرانتز بیاور؛ هرگز مخفف انگلیسیِ خالی را به‌جای نام فارسی به کار نبر (بگو «اداره مهاجرت کانادا (IRCC)»، نه «IRCC»). فهرست پایین الزامی است. اسم افراد و پرونده‌ها همان‌طور که هست بماند.
${TERM_RULE}

عنوان پیشنهادی: ${topic.title_fa}
حوزه: ${topic.field}
منبع: ${topic.source_url || "-"}

===== متن منبع (تنها منبع مجاز فکت‌ها) =====
${sourceBlock}
===== پایان متن منبع =====

راهنمای نگارش (تا جایی که متن منبع اجازه می‌ده، نه بیشتر):
${ever ? `۱. با خودِ سؤال مخاطب شروع کن، همان‌طور که مردم می‌پرسند — طبیعی و بدون اغراق.
۲. پاسخ همین سؤال را از متن منبع بده (شرایط، مدارک یا محدودیت‌ها فقط تا جایی که به همین سؤال مربوطند)؛ و اگر متن منبع به اشتباه رایج اشاره می‌کند، آن را روشن کن. تا آخر سناریو روی همین سؤال بمان.` : `۱. با یک جملهٔ قلاب طبیعی و صادق شروع کن (اگر مناسبه «ایرانیان» رو بیار) — اما اغراق و ادعای بی‌پایه نکن.
۲. دقیقاً چیزی که در خبر اومده رو توضیح بده: چی اعلام شده، کی، برای چه کسانی، و چه تأثیری روی وضعیت مهاجرتی داره.`}
۳. فقط فکت‌ها و اعداد واقعیِ داخل متن منبع رو بگو.
۴. «قدم بعدی» واقع‌بینانه بگو (مثلاً منتظر جزئیات رسمی بمونید / بررسی شرایط).
۵. در پایان یک دعوت نرم و طبیعی به رزرو مشاوره یا دایرکت سوگیموتو ویزا.

لحن محاوره‌ای، مستقیم و صمیمی. اصیل و بومی بنویس، نه ترجمه‌شده. طول سناریو رو با میزان اطلاعات واقعیِ خبر تنظیم کن — کیفیت و صحت مهم‌تر از طوله.

نمونهٔ گفتار خود ما جلوی دوربین (فقط برای لحن، ریتم و شیوهٔ آوردن اصطلاح انگلیسی بعد از فارسی؛ هیچ فکتی از آن برندار):
«${VOICE_SAMPLE_FA}»
همین‌طور حرف بزن: جمله‌های کوتاه و گفتاری («اگه»، «می‌خواید»، «دارن»)، اصطلاح فارسی و بلافاصله نام انگلیسی‌اش، و توضیح ساده و قدم‌به‌قدم.`;
  }
  return `You are a professional short-video scriptwriter for Sugimoto Visa, a licensed immigration firm. This is the ENGLISH version of the video, for an English-speaking audience. Accuracy and honesty are absolutely critical.

🔤 OUTPUT LANGUAGE: ENGLISH ONLY. The title, the source text or the notes below may be in Persian (Farsi); read them, but write every word of the script in natural spoken English. No Persian script, no transliterated Persian, no bilingual lines.
${ever ? `
🎯 This is NOT a news video: it is an explainer on a standing rule or process. The audience's question: "${topic.question || topic.title_en || topic.title_fa}"${topic.gap ? ` Common misunderstanding behind it: "${topic.gap}" (framing only — every rule and number must come from the source text).` : ""}
The SOURCE TEXT below is the official IRCC page on this subject. From it, explain only what answers this question. Never use news wording ("announced", "recently", "changed") unless the source says so.
${stayOnQuestion(topic, "en")}` : ""}

Write ONLY the spoken script text — exactly what the presenter says to camera. No titles, no section labels, no on-screen text, no hashtags. Just clean paragraphs.

⛔️ GOLDEN RULE (non-negotiable): the script must be about ONLY the specific news in the SOURCE TEXT below, and may use ONLY facts that actually appear there. Do NOT invent any number, date, program, CRS score, statistic, or claim that isn't in the source text. If there's little information, write a shorter, truthful script — never pad with fabrication. If the source is only an advisory/announcement (e.g. "an announcement will be made"), say exactly that and note details are pending — do NOT fabricate a news story.

⛔️ Speak the facts directly in your own voice — never as a summary of an outside source. Do NOT say "according to the source", "the source says/explains", or "as reported".

Suggested title: ${topic.title_en || topic.title_fa}${topic.title_en && topic.title_fa ? ` (Persian title, for reference only: ${topic.title_fa})` : ""}
Field: ${topic.field}
Source: ${topic.source_url || "-"}

===== SOURCE TEXT (the ONLY allowed source of facts) =====
${sourceBlock}
===== END SOURCE TEXT =====

Guidance (only as far as the source supports, no further):
${ever ? `1. Open with the audience's question itself, the way people ask it — natural, no exaggeration.
2. Answer this question from the source text (eligibility, documents or limits only as far as they bear on it); clear up the common misunderstanding where the source supports it. Stay on this question to the end.` : `1. Open with a natural, honest hook (name "Iranians" if it fits) — no exaggeration or unsupported claims.
2. Explain exactly what the news says: what was announced, when, who it affects, how it changes the viewer's immigration situation.`}
3. Use only the real facts/numbers present in the source text.
4. Give a realistic "next step" (e.g. watch for official details / check eligibility).
5. End with a natural, soft call to book a Sugimoto Visa consultation or DM.

Conversational, direct, warm tone. Authentic, not translated-sounding. Match the length to how much real information the news actually contains — accuracy matters more than length.

Remember: the whole script is in English.`;
}

// Share of letters in a text that are Persian/Arabic script. Used to catch an
// "English" script that came back in Farsi.
export function persianShare(text) {
  const s = String(text || "");
  const fa = (s.match(/[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return fa + latin ? fa / (fa + latin) : 0;
}

// Spoken English runs about 2.5 words a second at the presenter's pace (the
// video workflow measured 179 words in 70 s at its default voice speed).
export const EN_WORDS_PER_SEC = 2.5;

// Rewrite an English video script: into English when it came back in Farsi,
// and/or to a target duration. Grounded the same way as the first draft: the
// source text is the only allowed source of facts, so a longer target is met
// with more of the source's detail, never with invented material.
export function englishScriptRewritePrompt(topic, script, sourceText = "", { seconds = 0, notes = "" } = {}) {
  const source = String(sourceText || topic.snippet || "").trim();
  const words = seconds ? Math.round(seconds * EN_WORDS_PER_SEC) : 0;
  const lengthRule = words
    ? `TARGET LENGTH: the video runs about ${seconds} seconds, so the script must be about ${words} spoken words (between ${Math.round(words * 0.9)} and ${Math.round(words * 1.1)}). If the source does not hold enough real information for that length, stop shorter rather than pad: never invent, never repeat yourself.`
    : "LENGTH: keep about the same length as the current script.";
  return `You edit spoken scripts for short videos by Sugimoto Visa, a licensed immigration firm. Rewrite the CURRENT SCRIPT below.

🔤 OUTPUT LANGUAGE: ENGLISH ONLY. If the current script (or anything else below) is in Persian, translate its meaning into natural spoken English. No Persian script anywhere in the output.

${lengthRule}

⛔️ GROUNDING (non-negotiable): every fact, number, date, program name and rule must be in the SOURCE TEXT. Do not add anything that is not there. Speak the facts directly in your own voice — never "according to the source".

Keep the shape of a short video: a natural opening hook, the facts, a realistic next step, and a soft closing invitation to book a Sugimoto Visa consultation or send a DM.${notes ? `\n\nNOTES FROM THE TEAM (follow them where they do not conflict with the grounding rule): ${notes}` : ""}

Write ONLY the spoken script text — no titles, labels, stage directions or hashtags.

Topic: ${topic.title_en || topic.title_fa || ""}

===== SOURCE TEXT (the ONLY allowed source of facts) =====
${source.length > 60 ? source.slice(0, 4500) : "(no source text available — keep strictly to what the current script already says)"}
===== END SOURCE TEXT =====

===== CURRENT SCRIPT =====
${String(script || "").slice(0, 6000)}
===== END CURRENT SCRIPT =====`;
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
      if (o && (o.title_fa || o.title_en || o.id !== undefined)) objs.push(o);
    } catch (_) {}
  }
  if (objs.length) return objs;

  return null;
}

// Full Farsi SEO blog article prompt (for the sugimotovisa.com Blog). `links`
// is an array of {url, title} internal links the writer may weave in.
// Uses a robust delimiter output (not JSON) since the body is HTML.
// Article length is counted in visible characters (tags stripped, spaces
// included), enforced after generation by the article route.
export const ARTICLE_MIN_CHARS = Number(process.env.ARTICLE_MIN_CHARS || 600);
export const ARTICLE_MAX_CHARS = Number(process.env.ARTICLE_MAX_CHARS || 900);

export function articlePrompt(topic, links = [], todayStr = "", sourceText = "") {
  const allowed = links.length
    ? links.map((l) => `${l.url} => ${l.title || ""}`).slice(0, 30).join(" ; ")
    : "(none)";
  const source = String(sourceText || topic.snippet || "").trim();
  const sourceBlock = source.length > 60 ? source.slice(0, 5000) : "(full article text unavailable)";
  const framing = topic.evergreen
    ? `\nFRAMING: this is an EVERGREEN explainer, not news. The source is the official IRCC page on the subject; the audience's question is "${topic.question || topic.title_fa}". Write it as a standing guide to this question (eligibility, documents, steps, limits and the common mistake only as far as they answer it). No announcement wording ("recently", "announced", "new rule") unless the source says so, and no dates of announcement.${stayOnQuestion(topic, "en")}`
    : "";
  return `${framing}You are a senior Farsi-language immigration news editor for sugimotovisa.com (Sugimoto Visa, a licensed RCIC firm in Canada). Write an ORIGINAL Farsi news/blog article based STRICTLY on the source article text below. Never translate the source verbatim; report its facts in your own professional journalistic Farsi. Audience: Iranians interested in Canadian immigration. Accuracy of all numbers, dates and program names is critical.

⛔️ ANTI-INVENTION RULE (non-negotiable): use ONLY facts that appear in the SOURCE ARTICLE TEXT below. Do NOT invent any number, date, program, CRS score, statistic, quote, or claim not present there. If the source is thin, write a shorter, accurate article — never fabricate. If the source is merely an advisory (e.g. "an announcement will be made"), report exactly that and that details are pending; do NOT invent a policy story.

===== SOURCE ARTICLE TEXT (the ONLY allowed source of facts) =====
${sourceBlock}
===== END SOURCE ARTICLE TEXT =====

VOICE (important): this is published BY Sugimoto Visa as our OWN original article. Report every fact directly as our own reporting — NEVER as a summary of someone else's article. Forbidden phrases (do not use these or anything like them): «طبق منبع»، «بر اساس منبع»، «طبق توضیح منبع»، «منبع می‌گوید»، «منبع اعلام کرده»، «همان‌طور که در متن آمده»، «در متنِ خبر آمده»، «در نمونه‌ای که در متن آمده»، "according to the source", "the source says/explains", "as reported by". If the source gives an example, present it naturally as a scenario, without saying it came from a source or "the text". Never mention any outside website or source name.

LENGTH (hard limit): the visible article body, counting every character of the text without HTML tags and including spaces, must be between ${ARTICLE_MIN_CHARS} and ${ARTICLE_MAX_CHARS} characters. This is a short news piece: a one-paragraph lead that states the news, then one or two short sections. Cut background and repetition rather than exceed the limit. No FAQ section and no questions at the end.

STRUCTURE / SEO: choose one Farsi focus keyword and use it in the title, in the first paragraph, and in at least one H2. Use H2 headings only (no H3). Do not use em dashes or en dashes.

TECHNICAL TERMS (important): write like a Persian immigration consultant, mixing Persian wording with the technical term, not one or the other. Rules:
- Never leave a technical term bare and unexplained. The first time a term appears, give the Persian word or a short Persian explanation together with the term, e.g. «اجازه کار (work permit)» or «برنامه نامزدی استانی (PNP)». If there is no established Persian word (e.g. LMIA, PGWP), keep the acronym and add a few words of Persian explanation right there.
- Institutions and programmes take their Persian name, with the English in parentheses on first mention only — «اداره مهاجرت کانادا (IRCC)», never a bare "IRCC":
${TERM_RULE}
- After that first mention, do NOT repeat the same Latin term. Continue with the Persian wording, or a short natural Persian form, and keep the Latin form for at most one further mention in the whole article.
- Use at most 3 different Latin terms in the whole article. Prefer the Persian word wherever a natural one exists (شهروندی، اقامت دائم، ویزای تحصیلی، درخواست‌دهنده، صف رسیدگی).
- Do not fill the text with transliterated English (like «ورک پرمیت» three times); vary with the Persian equivalent.

INTERNAL LINKS: the list below is ordered most relevant first. Weave 2 to 3 of them into the body as <a href="URL">anchor</a>, choosing the pages whose subject genuinely matches what this article is about (the same program, permit type, province or country), with a natural anchor that fits the sentence. Skip any that are only loosely related; use fewer than 2 only if nothing on the list truly fits. NEVER invent or alter a URL.

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
(the full article body as HTML using only h2, p, ul, li, strong, a tags; may span multiple lines)`;
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

// General ideas: what people keep asking, turned into evergreen topic cards.
// The model sees the demand signals the harvester gathered and the brand's
// existing titles, and must tie every idea to one official page by id.
export function ideasPrompt(sig, { proposed = [], used = [], want = 24 } = {}) {
  const subjects = sig.subjects
    .map(
      (s) =>
        `## ${s.id} — ${s.label}
OFFICIAL PAGES (choose page_id from these only): ${s.pages.join(" | ")}
Google searches (Persian): ${s.google_fa.join(" ; ") || "-"}
Google searches (English): ${s.google_en.join(" ; ") || "-"}
YouTube searches: ${s.youtube.join(" ; ") || "-"}
IRCC Help Centre questions: ${s.ircc_help_centre.join(" ; ") || "-"}`
    )
    .join("\n\n");
  const avoid = [...new Set([...used, ...proposed])].slice(-200);
  return `You are the content strategist for Sugimoto Visa, a licensed Persian-language immigration consultancy (@sugimotovisa). Audience: Iranians who want to study, work, join family or settle in Canada.

Below are DEMAND SIGNALS gathered today: what people type into Google (in Persian and English) and YouTube, the questions IRCC's own Help Centre lists as most asked, and recent questions from the r/ImmigrationCanada community. Turn them into ${want} EVERGREEN topic ideas: questions that recur, misunderstandings that cost applicants, rules people get wrong. Not news — nothing that depends on a recent announcement, and no Express Entry draw results.

HOW TO CHOOSE (be smart about gaps):
- Prefer questions that appear in SEVERAL sources at once (a Persian search + a Help Centre question + a Reddit thread). Cite the evidence.
- The Persian searches carry the Iranian angle («برای ایرانیان», «بدون مدرک زبان», «با همسر», «زیر ۱۸ سال», «چقدر طول می‌کشه») — give those angles priority.
- Look for the mistake or the misunderstanding behind a question, not only the question: "people think X, the rule is Y".
- Spread ideas across subjects; at most 4 per subject.
- Every idea must be answerable from ONE of the official pages listed for its subject: eligibility, documents, steps, conditions. Pick that page_id. If no page covers it, drop the idea.
- The brand's site already has articles on the titles under ALREADY COVERED. Skip those subjects unless the idea is a clearly different angle (a specific sub-question, a mistake, a comparison) — then say so in "why".
- Never repeat anything under ALREADY PROPOSED.

TITLE RULES: "title_fa" is the Persian on-screen hook — specific and concrete, naming the situation (e.g. «درخواست اجازه تحصیل از داخل کانادا: چه کسی می‌تواند؟», «۵ دلیل رایج رد اسپانسرشیپ همسر»). No clickbait, no promises, no "for you". "title_en" is a short English title.
${TERM_RULE}

===== DEMAND SIGNALS =====
${subjects}

## Reddit — recent questions in r/ImmigrationCanada
${sig.reddit.map((t) => "- " + t).join("\n")}

## ALREADY COVERED on sugimotovisa.com (titles)
${sig.covered.map((t) => "- " + String(t).slice(0, 80)).join("\n")}

## ALREADY PROPOSED OR USED (never repeat)
${avoid.map((t) => "- " + t).join("\n") || "-"}
===== END =====

Return ONLY a JSON array of ${want} objects, best first:
{"subject": "<subject id>", "page_id": "<page id from that subject>", "title_fa": "...", "title_en": "...", "question_fa": "the audience's question in plain Persian, one sentence", "gap_fa": "the mistake or misunderstanding behind it, one sentence in Persian", "why": ["Google FA: «…» ×N", "IRCC Help Centre: …", "Reddit: …"], "format": "video" | "carousel" | "article", "score": 60-98}
No other text.`;
}

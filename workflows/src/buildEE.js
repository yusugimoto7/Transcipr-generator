// Code node: "Build EE Items"
// Normalises the latest Express Entry round into the shared item shape.
// Dedup is handled downstream by the posted_draws data table.
const src = $input.all();
const round = src.length ? (src[0].json.rounds || [])[0] : null;
if (!round) return [];

const currentDrawNumber = String(round.drawNumber);

const drawNameRaw = round.drawName || round.drawText || 'نامشخص';
const drawName = drawNameRaw.replace(/,?\s*\d{4}-version\s*\d+/i, '').trim();
const drawDate = round.drawDateFull || round.drawDate || 'نامشخص';
const drawSize = round.drawSize || round.drawSizeText || 'نامشخص';
const drawCRS  = round.drawCRS  || round.drawCutOff || round.drawCutoff || round.crs || 'نامشخص';

const categoryMap = [
  { en: 'provincial nominee program',                    fa: 'برنامه نامزدی استانی' },
  { en: 'canadian experience class',                     fa: 'کلاس سابقه کار کانادایی' },
  { en: 'french-language proficiency',                   fa: 'تسلط به زبان فرانسوی' },
  { en: 'french language proficiency',                   fa: 'تسلط به زبان فرانسوی' },
  { en: 'healthcare and social services',                fa: 'مشاغل بهداشت و خدمات اجتماعی' },
  { en: 'healthcare occupations',                        fa: 'مشاغل بهداشت و درمان' },
  { en: 'science, technology, engineering and math',     fa: 'مشاغل علوم، فناوری، مهندسی و ریاضی (STEM)' },
  { en: 'stem occupations',                              fa: 'مشاغل STEM' },
  { en: 'trade occupations',                             fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'trades occupations',                            fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'education occupations',                         fa: 'مشاغل آموزشی' },
  { en: 'transport occupations',                         fa: 'مشاغل حمل و نقل' },
  { en: 'agriculture and agri-food',                     fa: 'مشاغل کشاورزی و صنایع غذایی' },
  { en: 'physicians with canadian work experience',      fa: 'پزشکان با سابقه کار کانادایی' },
  { en: 'senior managers with canadian work experience', fa: 'مدیران ارشد با سابقه کار کانادایی' },
  { en: 'researchers with canadian work experience',     fa: 'پژوهشگران با سابقه کار کانادایی' },
  { en: 'skilled military recruits',                     fa: 'سربازان متخصص استخدام شده' },
  { en: 'federal skilled worker',                        fa: 'برنامه فدرال نیروی کار متخصص' },
  { en: 'federal skilled trades',                        fa: 'برنامه فدرال مشاغل فنی' },
  { en: 'general',                                       fa: 'دراو عمومی' },
  { en: 'no program specified',                          fa: 'بدون برنامه مشخص' }
];
function getPersianCategory(englishName) {
  if (!englishName) return 'دسته‌بندی نامشخص';
  const lower = String(englishName).toLowerCase();
  for (const entry of categoryMap) {
    if (lower.includes(entry.en)) return entry.fa;
  }
  return englishName;
}
const drawNameFa = getPersianCategory(drawName);

const link = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';
const site = 'www.sugimotovisa.com';

const telegramText = `📢 <b>نتیجه جدیدترین دراو اکسپرس انتری</b>
<b>اقامت دائم کانادا (PR)</b> 🇨🇦

🗓 <b>تاریخ برگزاری:</b> <code>${drawDate}</code>
🎯 <b>دسته‌بندی انتخاب:</b> <b>${drawNameFa}</b>

📊 <b>آمار این دوره:</b>
🔹 تعداد دعوت‌نامه صادر شده: <b>${drawSize}</b> نفر
🔹 حداقل امتیاز قبولی (CRS): <b>${drawCRS}</b> امتیاز

🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی اداره مهاجرت</a>

🌐 ${site}`;

const xPostText = `📢 دراو جدید اکسپرس انتری 🇨🇦
🗓 ${drawDate}
🎯 ${drawNameFa}
🔹 دعوت‌نامه: ${drawSize} نفر
🔹 حداقل CRS: ${drawCRS}
${link}`;

const linkedinText = `📢 نتیجه جدیدترین دراو اکسپرس انتری — اقامت دائم کانادا (PR) 🇨🇦

🗓 تاریخ برگزاری: ${drawDate}
🎯 دسته‌بندی انتخاب: ${drawNameFa}
🔹 تعداد دعوت‌نامه صادر شده: ${drawSize} نفر
🔹 حداقل امتیاز قبولی (CRS): ${drawCRS}

🔗 جزئیات در سایت رسمی اداره مهاجرت:
${link}

🌐 ${site}
#ExpressEntry #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا`;

const igCaption = `نتیجه جدیدترین دراو اکسپرس انتری 🇨🇦\n\nتاریخ برگزاری: ${drawDate}\nدسته‌بندی انتخاب: ${drawNameFa}\nتعداد دعوت‌نامه: ${drawSize} نفر\nحداقل امتیاز CRS: ${drawCRS}\n\nبرای مشاوره: ${site}\n\n#اکسپرس_انتری #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا #PR #ExpressEntry`;

return [{
  json: {
    program: 'express-entry',
    dedup_key: currentDrawNumber,
    final_post_text: telegramText,
    x_post_text: xPostText,
    linkedin_text: linkedinText,
    ig_caption: igCaption,
    skipInstagram: false,
    // shared story-card fields
    headingLine1: 'آخرین Draw',
    headingLine2: 'اکسپرس انتری',
    headingLine3: 'اقامت دائم کانادا PR',
    statLeftValue: String(drawSize),
    statLeftLabel: 'تعداد دعوتنامه',
    statRightValue: String(drawCRS),
    statRightLabel: 'نمره آخرین نفر قبولی',
    categoryFa: drawNameFa,
    categoryEn: drawName,
    dateText: String(drawDate),
    // data-table meta
    dt_name: drawName,
    dt_crs: String(drawCRS),
    dt_size: String(drawSize)
  }
}];

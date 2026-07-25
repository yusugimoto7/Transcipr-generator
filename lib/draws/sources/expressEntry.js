// Express Entry (federal) — official IRCC JSON feed.
import { fetchJson, SITE } from "../util";

const DEFAULT_URL =
  "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json";

const LINK =
  "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html";

const CATEGORY_MAP = [
  { en: "provincial nominee program", fa: "برنامه نامزدی استانی" },
  { en: "canadian experience class", fa: "کلاس سابقه کار کانادایی" },
  { en: "french-language proficiency", fa: "تسلط به زبان فرانسوی" },
  { en: "french language proficiency", fa: "تسلط به زبان فرانسوی" },
  { en: "healthcare and social services", fa: "مشاغل بهداشت و خدمات اجتماعی" },
  { en: "healthcare occupations", fa: "مشاغل بهداشت و درمان" },
  {
    en: "science, technology, engineering and math",
    fa: "مشاغل علوم، فناوری، مهندسی و ریاضی (STEM)",
  },
  { en: "stem occupations", fa: "مشاغل STEM" },
  { en: "trade occupations", fa: "مشاغل فنی و حرفه‌ای" },
  { en: "trades occupations", fa: "مشاغل فنی و حرفه‌ای" },
  { en: "education occupations", fa: "مشاغل آموزشی" },
  { en: "transport occupations", fa: "مشاغل حمل و نقل" },
  { en: "agriculture and agri-food", fa: "مشاغل کشاورزی و صنایع غذایی" },
  {
    en: "physicians with canadian work experience",
    fa: "پزشکان با سابقه کار کانادایی",
  },
  {
    en: "senior managers with canadian work experience",
    fa: "مدیران ارشد با سابقه کار کانادایی",
  },
  {
    en: "researchers with canadian work experience",
    fa: "پژوهشگران با سابقه کار کانادایی",
  },
  { en: "skilled military recruits", fa: "سربازان متخصص استخدام شده" },
  { en: "federal skilled worker", fa: "برنامه فدرال نیروی کار متخصص" },
  { en: "federal skilled trades", fa: "برنامه فدرال مشاغل فنی" },
  { en: "general", fa: "دراو عمومی" },
  { en: "no program specified", fa: "بدون برنامه مشخص" },
];

function persianCategory(name) {
  if (!name) return "دسته‌بندی نامشخص";
  const lower = String(name).toLowerCase();
  for (const entry of CATEGORY_MAP) {
    if (lower.includes(entry.en)) return entry.fa;
  }
  return name;
}

export const id = "express-entry";

export async function collect() {
  const url = process.env.DRAWS_EE_URL || DEFAULT_URL;
  const data = await fetchJson(url, { timeout: 20000 });
  const round = (data?.rounds || [])[0];
  if (!round) return [];

  const drawNumber = String(round.drawNumber || "").trim();
  if (!drawNumber) return [];

  const nameRaw = round.drawName || round.drawText || "نامشخص";
  const name = nameRaw.replace(/,?\s*\d{4}-version\s*\d+/i, "").trim();
  const nameFa = persianCategory(name);
  const date = round.drawDateFull || round.drawDate || "نامشخص";
  const size = round.drawSize || round.drawSizeText || "نامشخص";
  const crs =
    round.drawCRS || round.drawCutOff || round.drawCutoff || round.crs || "نامشخص";

  const telegram =
    `📢 <b>نتیجه جدیدترین دراو اکسپرس انتری</b>\n` +
    `<b>اقامت دائم کانادا (PR)</b> 🇨🇦\n\n` +
    `🗓 <b>تاریخ برگزاری:</b> <code>${date}</code>\n` +
    `🎯 <b>دسته‌بندی انتخاب:</b> <b>${nameFa}</b>\n\n` +
    `📊 <b>آمار این دوره:</b>\n` +
    `🔹 تعداد دعوت‌نامه صادر شده: <b>${size}</b> نفر\n` +
    `🔹 حداقل امتیاز قبولی (CRS): <b>${crs}</b> امتیاز\n\n` +
    `🔗 <a href="${LINK}">مشاهده جزئیات در سایت رسمی اداره مهاجرت</a>\n\n` +
    `🌐 ${SITE}`;

  return [
    {
      program: id,
      dedupKey: drawNumber,
      telegram,
      x:
        `📢 دراو جدید اکسپرس انتری 🇨🇦\n🗓 ${date}\n🎯 ${nameFa}\n` +
        `🔹 دعوت‌نامه: ${size} نفر\n🔹 حداقل CRS: ${crs}\n${LINK}`,
      linkedin:
        `📢 نتیجه جدیدترین دراو اکسپرس انتری — اقامت دائم کانادا (PR) 🇨🇦\n\n` +
        `🗓 تاریخ برگزاری: ${date}\n🎯 دسته‌بندی انتخاب: ${nameFa}\n` +
        `🔹 تعداد دعوت‌نامه صادر شده: ${size} نفر\n🔹 حداقل امتیاز قبولی (CRS): ${crs}\n\n` +
        `🔗 ${LINK}\n🌐 ${SITE}\n` +
        `#ExpressEntry #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا`,
      igCaption:
        `نتیجه جدیدترین دراو اکسپرس انتری 🇨🇦\n\nتاریخ برگزاری: ${date}\n` +
        `دسته‌بندی انتخاب: ${nameFa}\nتعداد دعوت‌نامه: ${size} نفر\n` +
        `حداقل امتیاز CRS: ${crs}\n\nبرای مشاوره: ${SITE}\n\n` +
        `#اکسپرس_انتری #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا #PR #ExpressEntry`,
      skipInstagram: false,
      card: {
        headingLine1: "آخرین Draw",
        headingLine2: "اکسپرس انتری",
        headingLine3: "اقامت دائم کانادا PR",
        statLeft: { value: String(size), label: "تعداد دعوتنامه" },
        statRight: { value: String(crs), label: "نمره آخرین نفر قبولی" },
        categoryFa: nameFa,
        categoryEn: name,
        dateText: String(date),
      },
      record: { name, crs: String(crs), size: String(size) },
    },
  ];
}

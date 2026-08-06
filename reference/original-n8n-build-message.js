// Note: Deduplication is handled by the data table after this node.

const latestDraw = $input.item.json.rounds[0];
const currentDrawNumber = String(latestDraw.drawNumber);

console.log('Processing draw:', currentDrawNumber);

// ===== DYNAMIC VALUES =====
const drawNameRaw = latestDraw.drawName || latestDraw.drawText || 'نامشخص';
// Remove year/version suffixes like ", 2026-Version 3"
const drawName = drawNameRaw.replace(/,?\s*\d{4}-version\s*\d+/i, '').trim();
const drawDate = latestDraw.drawDateFull || latestDraw.drawDate || 'نامشخص';
const drawSize = latestDraw.drawSize || latestDraw.drawSizeText || 'نامشخص';
const drawCRS  = latestDraw.drawCRS  || latestDraw.drawCutOff || latestDraw.drawCutoff || latestDraw.crs || 'نامشخص';

// ===== PERSIAN CATEGORY MAP =====
const categoryMap = [
  { en: 'provincial nominee program',                  fa: 'برنامه نامزدی استانی' },
  { en: 'canadian experience class',                   fa: 'کلاس سابقه کار کانادایی' },
  { en: 'french-language proficiency',                 fa: 'تسلط به زبان فرانسوی' },
  { en: 'french language proficiency',                 fa: 'تسلط به زبان فرانسوی' },
  { en: 'healthcare and social services',              fa: 'مشاغل بهداشت و خدمات اجتماعی' },
  { en: 'healthcare occupations',                      fa: 'مشاغل بهداشت و درمان' },
  { en: 'science, technology, engineering and math',   fa: 'مشاغل علوم، فناوری، مهندسی و ریاضی (STEM)' },
  { en: 'stem occupations',                            fa: 'مشاغل STEM' },
  { en: 'trade occupations',                           fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'trades occupations',                          fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'education occupations',                       fa: 'مشاغل آموزشی' },
  { en: 'transport occupations',                       fa: 'مشاغل حمل و نقل' },
  { en: 'agriculture and agri-food',                   fa: 'مشاغل کشاورزی و صنایع غذایی' },
  { en: 'physicians with canadian work experience',    fa: 'پزشکان با سابقه کار کانادایی' },
  { en: 'senior managers with canadian work experience', fa: 'مدیران ارشد با سابقه کار کانادایی' },
  { en: 'researchers with canadian work experience',   fa: 'پژوهشگران با سابقه کار کانادایی' },
  { en: 'skilled military recruits',                   fa: 'سربازان متخصص استخدام شده' },
  { en: 'federal skilled worker',                      fa: 'برنامه فدرال نیروی کار متخصص' },
  { en: 'federal skilled trades',                      fa: 'برنامه فدرال مشاغل فنی' },
  { en: 'general',                                     fa: 'دراو عمومی' },
  { en: 'no program specified',                        fa: 'بدون برنامه مشخص' }
];

function getPersianCategory(englishName) {
  if (!englishName) return 'دسته‌بندی نامشخص';
  const lower = String(englishName).toLowerCase();
  for (const entry of categoryMap) {
    if (lower.includes(entry.en)) return entry.fa;
  }
  console.log('Unknown category, no Persian mapping:', englishName);
  return englishName;
}

const drawNameFa = getPersianCategory(drawName);

const link = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';

// Auto-resize font based on digit count
const fitSize = (val) => {
  const len = String(val).length;
  if (len <= 3) return 220;
  if (len === 4) return 180;
  if (len === 5) return 150;
  return 130;
};
const crsFontSize = fitSize(drawCRS);
const sizeFontSize = fitSize(drawSize);

// ===== TELEGRAM (Persian, HTML) =====
const telegramText = `📢 <b>نتیجه جدیدترین دراو اکسپرس انتری</b>
<b>اقامت دائم کانادا (PR)</b> 🇨🇦

🗓 <b>تاریخ برگزاری:</b> <code>${drawDate}</code>
🎯 <b>دسته‌بندی انتخاب:</b> <b>${drawNameFa}</b>

📊 <b>آمار این دوره:</b>
🔹 تعداد دعوت‌نامه صادر شده: <b>${drawSize}</b> نفر
🔹 حداقل امتیاز قبولی (CRS): <b>${drawCRS}</b> امتیاز

🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی اداره مهاجرت</a>

🌐 www.sugimotovisa.com`;

// ===== X / TWITTER (plain text, no HTML) =====
const xPostText = `📢 نتیجه جدیدترین دراو اکسپرس انتری
اقامت دائم کانادا (PR) 🇨🇦

🗓 تاریخ برگزاری: ${drawDate}
🎯 دسته‌بندی انتخاب: ${drawNameFa}

📊 آمار این دوره:
🔹 تعداد دعوت‌نامه صادر شده: ${drawSize} نفر
🔹 حداقل امتیاز قبولی (CRS): ${drawCRS} امتیاز

🔗 جزئیات در سایت رسمی اداره مهاجرت:
${link}

🌐 www.sugimotovisa.com`;

// ===== INSTAGRAM CAPTION (Persian) =====
const igCaption = `نتیجه جدیدترین دراو اکسپرس انتری 🇨🇦\n\nتاریخ برگزاری: ${drawDate}\nدسته‌بندی انتخاب: ${drawNameFa}\nتعداد دعوت‌نامه: ${drawSize} نفر\nحداقل امتیاز CRS: ${drawCRS}\n\nبرای مشاوره: www.sugimotovisa.com\n\n#اکسپرس_انتری #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا #PR #ExpressEntry`;

// ===== INSTAGRAM STORY SVG (locked design) =====
const LOGO_B64 = '__LOGO_B64__';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&amp;family=Inter:wght@700;800;900&amp;display=swap');
      .farsi { font-family: 'Vazirmatn', 'Tahoma', sans-serif; direction: rtl; }
      .english { font-family: 'Inter', 'Arial', sans-serif; }
    </style>
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="20" stdDeviation="40" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="#FFFFFF"/>
  <rect x="40" y="40" width="1000" height="1840" rx="50" ry="50" fill="#FFFFFF" filter="url(#cardShadow)" stroke="#F3F4F6" stroke-width="1"/>
  <g opacity="0.45">
    <rect x="120" y="1150" width="110" height="100" fill="#FCA5A5"/>
    <rect x="260" y="1080" width="110" height="170" fill="#FED7AA"/>
    <rect x="400" y="980"  width="110" height="270" fill="#FEF3C7"/>
    <rect x="540" y="880"  width="110" height="370" fill="#BAE6FD"/>
    <rect x="680" y="780"  width="110" height="470" fill="#C7D2FE"/>
    <rect x="820" y="680"  width="110" height="570" fill="#E9D5FF"/>
  </g>
  <g opacity="0.55">
    <circle cx="175" cy="1090" r="32" fill="#F87171"/>
    <path d="M 130 1150 Q 130 1100 175 1100 Q 220 1100 220 1150 Z" fill="#F87171"/>
    <circle cx="315" cy="1020" r="32" fill="#FB923C"/>
    <path d="M 270 1080 Q 270 1030 315 1030 Q 360 1030 360 1080 Z" fill="#FB923C"/>
    <circle cx="455" cy="920" r="32" fill="#FBBF24"/>
    <path d="M 410 980 Q 410 930 455 930 Q 500 930 500 980 Z" fill="#FBBF24"/>
    <circle cx="595" cy="820" r="32" fill="#38BDF8"/>
    <path d="M 550 880 Q 550 830 595 830 Q 640 830 640 880 Z" fill="#38BDF8"/>
    <circle cx="735" cy="720" r="32" fill="#818CF8"/>
    <path d="M 690 780 Q 690 730 735 730 Q 780 730 780 780 Z" fill="#818CF8"/>
    <circle cx="875" cy="620" r="32" fill="#C084FC"/>
    <path d="M 830 680 Q 830 630 875 630 Q 920 630 920 680 L 905 680 Q 900 695 875 695 Q 850 695 845 680 Z" fill="#C084FC"/>
  </g>
  <text x="540" y="300" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">آخرین Draw</text>
  <text x="540" y="395" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">اکسپرس انتری</text>
  <text x="540" y="490" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">اقامت دائم کانادا PR</text>
  <line x1="220" y1="555" x2="860" y2="555" stroke="#E5E7EB" stroke-width="3"/>
  <text x="780" y="800" text-anchor="middle" class="english" font-size="${crsFontSize}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${drawCRS}</text>
  <text x="780" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">نمره آخرین نفر قبولی</text>
  <line x1="540" y1="660" x2="540" y2="890" stroke="#E5E7EB" stroke-width="3"/>
  <text x="300" y="800" text-anchor="middle" class="english" font-size="${sizeFontSize}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${drawSize}</text>
  <text x="300" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">تعداد دعوتنامه</text>
  <text x="540" y="1380" text-anchor="middle" class="farsi" font-size="46" font-weight="700" fill="#2C3E50">${drawNameFa}</text>
  <text x="540" y="1450" text-anchor="middle" class="english" font-size="46" font-weight="700" fill="#2C3E50">${drawName}</text>
  <text x="540" y="1560" text-anchor="middle" class="english" font-size="42" font-weight="700" fill="#2C3E50">${drawDate}</text>
  <image x="290" y="1730" width="500" height="85" xlink:href="data:image/png;base64,${LOGO_B64}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

return [{
  json: {
    final_post_text: telegramText,
    x_post_text: xPostText,
    ig_caption: igCaption,
    draw_number: currentDrawNumber,
    drawDate,
    drawName,
    drawNameFa,
    drawSize,
    drawCRS,
    svg
  }
}];

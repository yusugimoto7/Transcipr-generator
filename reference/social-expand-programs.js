// Express Entry (newest round) + one post per province per date.
//
// Three shapes, decided by what the province actually published that day:
//   single  — one row. The original locked card, untouched.
//   routes  — several rows sharing ONE stream name. That is a single draw
//             selected by more than one route, so it gets one total and the
//             routes listed underneath. BC's Innovate does this every time.
//   streams — several rows with different stream names. Per-stream breakdown.
//
// MAX_AGE_DAYS is 5, and "Drop already posted" matches province+date. Both
// exist so a historical draw can never be announced as news.
const MAX_AGE_DAYS = 5;
const LOGO_URL = 'https://raw.githubusercontent.com/yusugimoto7/Transcipr-generator/claude/n8n-draw-automation-kfxfmy/assets/story-logo.png';
const src = $input.first().json || {};
const daysOld = (iso) => { const t = Date.parse(iso || ''); return isNaN(t) ? 1e9 : (Date.now() - t) / 86400000; };

// BC publishes counts under five as the literal string "<5". Unescaped that
// makes Telegram reject the whole message as malformed HTML.
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// LinkedIn has no rich text: bold is Unicode math digits. Numbers only.
const BD = { '0': '\u{1D7EC}', '1': '\u{1D7ED}', '2': '\u{1D7EE}', '3': '\u{1D7EF}', '4': '\u{1D7F0}', '5': '\u{1D7F1}', '6': '\u{1D7F2}', '7': '\u{1D7F3}', '8': '\u{1D7F4}', '9': '\u{1D7F5}' };
const ubold = (s) => String(s == null ? '' : s).replace(/[0-9]/g, (d) => BD[d]);

const EE_LINK = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html';

const categoryMap = [
  { en: 'provincial nominee program', fa: 'برنامه نامزدی استانی' },
  { en: 'canadian experience class', fa: 'کلاس سابقه کار کانادایی' },
  { en: 'french-language proficiency', fa: 'تسلط به زبان فرانسوی' },
  { en: 'french language proficiency', fa: 'تسلط به زبان فرانسوی' },
  { en: 'healthcare and social services', fa: 'مشاغل بهداشت و خدمات اجتماعی' },
  { en: 'healthcare occupations', fa: 'مشاغل بهداشت و درمان' },
  { en: 'science, technology, engineering and math', fa: 'مشاغل علوم، فناوری، مهندسی و ریاضی (STEM)' },
  { en: 'stem occupations', fa: 'مشاغل STEM' },
  { en: 'trade occupations', fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'trades occupations', fa: 'مشاغل فنی و حرفه‌ای' },
  { en: 'education occupations', fa: 'مشاغل آموزشی' },
  { en: 'transport occupations', fa: 'مشاغل حمل و نقل' },
  { en: 'agriculture and agri-food', fa: 'مشاغل کشاورزی و صنایع غذایی' },
  { en: 'physicians with canadian work experience', fa: 'پزشکان با سابقه کار کانادایی' },
  { en: 'senior managers with canadian work experience', fa: 'مدیران ارشد با سابقه کار کانادایی' },
  { en: 'researchers with canadian work experience', fa: 'پژوهشگران با سابقه کار کانادایی' },
  { en: 'skilled military recruits', fa: 'سربازان متخصص استخدام شده' },
  { en: 'federal skilled worker', fa: 'برنامه فدرال نیروی کار متخصص' },
  { en: 'federal skilled trades', fa: 'برنامه فدرال مشاغل فنی' },
  { en: 'general', fa: 'دراو عمومی' },
  { en: 'no program specified', fa: 'بدون برنامه مشخص' }
];
function getPersianCategory(name) {
  if (!name) return 'دسته‌بندی نامشخص';
  const lower = String(name).toLowerCase();
  for (const e of categoryMap) { if (lower.includes(e.en)) return e.fa; }
  return name;
}

// Ontario's parser returns prose, not stream names. A sentence fragment is fine
// in a table beside a link to the source; as a post headline it reads as a bug.
function usableStream(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return false;
  if (t.length > 48) return false;
  if (/^(the|to)\b/i.test(t)) return false;
  if (/invitation|candidate|who may qualify|stream and/i.test(t)) return false;
  return true;
}

// "<5" inside a right-to-left line renders as "5>" — "more than five", the
// opposite of what BC published. No CSS is available on these channels, so the
// value is said in words instead.
function countFa(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = s.match(/^<\s*(\d+)$/);
  return m ? 'کمتر از ' + m[1] : s;
}

// How a row was selected, taken from what BC itself published.
//
// NEVER replace this with a per-stream criteria table. The Innovate wage moves
// every draw — $55/$110k on 20 Aug, $58/$115k on 16 Jul, $62/$125k on 18 Jun —
// so a hardcoded table would keep publishing a stale threshold under an RCIC's
// name. Step 2 is the ONLY translation, and only on an exact pattern match:
// anything worded differently passes through in English rather than being
// paraphrased, because a paraphrased eligibility rule is advice.
function routeLabel(score, factors) {
  const s = String(score == null ? '' : score).trim();
  if (s) return 'حداقل نمره ' + s;
  const f = String(factors == null ? '' : factors).trim();
  const m = f.match(/Minimum wage of \$([\d,.]+)\s*\/\s*hour and \$([\d,]+)\s*\/\s*year/i);
  if (m) {
    const year = parseInt(m[2].replace(/,/g, ''), 10);
    const yr = (!isNaN(year) && year % 1000 === 0) ? (year / 1000) + ' هزار' : m[2];
    return 'حداقل حقوق ' + m[1] + ' دلار در ساعت و ' + yr + ' دلار در سال';
  }
  return f || 'بدون اعلام حداقل نمره';
}

function clip(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function wrapText(t, per) {
  const words = String(t == null ? '' : t).split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    const c = (cur + ' ' + w).trim();
    if (c.length <= per) { cur = c; } else { if (cur) out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// "<5" cannot be added up, so a total containing one is reported as "500+"
// rather than a false exact figure.
function totalInvites(rows) {
  let known = 0;
  let approx = false;
  for (const r of rows) {
    const raw = String(r.invitations == null ? '' : r.invitations).trim();
    if (/^<\s*\d/.test(raw)) { approx = true; continue; }
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (isNaN(n)) { approx = true; continue; }
    known += n;
  }
  return { known: known, approx: approx };
}

function scoreRange(rows) {
  const nums = [];
  for (const r of rows) {
    const n = parseInt(String(r.score == null ? '' : r.score).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n)) nums.push(n);
  }
  if (!nums.length) return { fa: '', card: '' };
  const lo = Math.min.apply(null, nums);
  const hi = Math.max.apply(null, nums);
  if (lo === hi) return { fa: String(lo), card: String(lo) };
  return { fa: lo + ' تا ' + hi, card: lo + '-' + hi };
}

const fitSize = (val) => {
  const len = String(val == null ? '' : val).length;
  if (len <= 3) return 220;
  if (len === 4) return 180;
  if (len === 5) return 150;
  return 130;
};

const CARD_MAX_ROWS = 8;

function storyCard(o) {
  const rows = o.rows || [];
  const routes = o.routes || [];
  const hasRows = rows.length > 0;
  const hasRoutes = routes.length > 0;
  const plain = !hasRows && !hasRoutes;

  const decor = plain ? (
    '<g opacity="0.45">' +
    '<rect x="120" y="1150" width="110" height="100" fill="#FCA5A5"/>' +
    '<rect x="260" y="1080" width="110" height="170" fill="#FED7AA"/>' +
    '<rect x="400" y="980" width="110" height="270" fill="#FEF3C7"/>' +
    '<rect x="540" y="880" width="110" height="370" fill="#BAE6FD"/>' +
    '<rect x="680" y="780" width="110" height="470" fill="#C7D2FE"/>' +
    '<rect x="820" y="680" width="110" height="570" fill="#E9D5FF"/>' +
    '</g>' +
    '<g opacity="0.55">' +
    '<circle cx="175" cy="1090" r="32" fill="#F87171"/>' +
    '<path d="M 130 1150 Q 130 1100 175 1100 Q 220 1100 220 1150 Z" fill="#F87171"/>' +
    '<circle cx="315" cy="1020" r="32" fill="#FB923C"/>' +
    '<path d="M 270 1080 Q 270 1030 315 1030 Q 360 1030 360 1080 Z" fill="#FB923C"/>' +
    '<circle cx="455" cy="920" r="32" fill="#FBBF24"/>' +
    '<path d="M 410 980 Q 410 930 455 930 Q 500 930 500 980 Z" fill="#FBBF24"/>' +
    '<circle cx="595" cy="820" r="32" fill="#38BDF8"/>' +
    '<path d="M 550 880 Q 550 830 595 830 Q 640 830 640 880 Z" fill="#38BDF8"/>' +
    '<circle cx="735" cy="720" r="32" fill="#818CF8"/>' +
    '<path d="M 690 780 Q 690 730 735 730 Q 780 730 780 780 Z" fill="#818CF8"/>' +
    '<circle cx="875" cy="620" r="32" fill="#C084FC"/>' +
    '<path d="M 830 680 Q 830 630 875 630 Q 920 630 920 680 L 905 680 Q 900 695 875 695 Q 850 695 845 680 Z" fill="#C084FC"/>' +
    '</g>'
  ) : '';

  const bigFigures = plain ? (
    '<text x="780" y="800" text-anchor="middle" class="english" font-size="' + fitSize(o.crs) + '" font-weight="900" fill="#2C3E50" letter-spacing="-8">' + esc(o.crs) + '</text>' +
    '<text x="780" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">' + esc(o.crsLabel) + '</text>' +
    '<line x1="540" y1="660" x2="540" y2="890" stroke="#E5E7EB" stroke-width="3"/>' +
    '<text x="300" y="800" text-anchor="middle" class="english" font-size="' + fitSize(o.size) + '" font-weight="900" fill="#2C3E50" letter-spacing="-8">' + esc(o.size) + '</text>' +
    '<text x="300" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">' + esc(o.sizeLabel || 'تعداد دعوتنامه') + '</text>' +
    '<text x="540" y="1380" text-anchor="middle" class="farsi" font-size="46" font-weight="700" fill="#2C3E50">' + esc(o.catFa) + '</text>' +
    '<text x="540" y="1450" text-anchor="middle" class="english" font-size="46" font-weight="700" fill="#2C3E50">' + esc(o.catEn) + '</text>'
  ) : '';

  let body = '';

  if (hasRoutes) {
    let y = 630;
    body += '<rect x="260" y="' + y + '" width="560" height="126" rx="30" ry="30" fill="#EEF2F7"/>';
    body += '<text x="540" y="' + (y + 86) + '" text-anchor="middle" class="farsi" font-size="66" font-weight="900" fill="#2C3E50">' + esc(o.size) + ' دعوت‌نامه</text>';
    y += 176;
    const cl = wrapText(o.catEn, 24);
    const ch = 86 + (cl.length - 1) * 62;
    let widest = 0;
    for (const l of cl) { if (l.length > widest) widest = l.length; }
    const cw = Math.min(900, Math.max(460, Math.round(widest * 42 * 0.63) + 120));
    body += '<rect x="' + (540 - Math.round(cw / 2)) + '" y="' + y + '" width="' + cw + '" height="' + ch + '" rx="28" ry="28" fill="#2C3E50"/>';
    for (let i = 0; i < cl.length; i++) {
      body += '<text x="540" y="' + (y + 56 + i * 62) + '" text-anchor="middle" class="english" font-size="42" font-weight="800" fill="#FFFFFF">' + esc(cl[i]) + '</text>';
    }
    y += ch + 56;
    for (const r of routes.slice(0, 4)) {
      const ll = wrapText(r.label, 34);
      const bh = 64 + ll.length * 54;
      body += '<rect x="130" y="' + y + '" width="820" height="' + bh + '" rx="24" ry="24" fill="#F8FAFC" stroke="#E5E7EB" stroke-width="2"/>';
      body += '<text x="540" y="' + (y + 50) + '" text-anchor="middle" class="farsi" font-size="42" font-weight="800" fill="#2C3E50">' + esc(r.count) + ' دعوت‌نامه</text>';
      for (let i = 0; i < ll.length; i++) {
        body += '<text x="540" y="' + (y + 50 + (i + 1) * 50) + '" text-anchor="middle" class="farsi" font-size="34" font-weight="600" fill="#545454">' + esc(ll[i]) + '</text>';
      }
      y += bh + 22;
    }
  } else if (hasRows) {
    const shown = rows.slice(0, CARD_MAX_ROWS);
    const startY = 1050 - Math.floor((shown.length - 1) * 88 / 2);
    // Three columns, all middle-anchored, header and data sharing the SAME x
    // per column. "start"/"end" resolve to opposite visual edges for Farsi
    // (RTL) vs the English digits in the data cells, which is what sent
    // "دعوت‌نامه · حداقل امتیاز" off the left edge of the card. Centering is
    // direction-agnostic — a middle anchor lands on the same point regardless
    // of which script it is centering.
    const STREAM_X = 760, INVITE_X = 460, SCORE_X = 240;
    body += '<text x="540" y="' + (startY - 150) + '" text-anchor="middle" class="farsi" font-size="40" font-weight="800" fill="#2C3E50">خلاصه دراوهای این روز</text>';
    body += '<text x="' + STREAM_X + '" y="' + (startY - 72) + '" text-anchor="middle" class="farsi" font-size="30" font-weight="700" fill="#9CA3AF">استریم</text>';
    body += '<text x="' + INVITE_X + '" y="' + (startY - 72) + '" text-anchor="middle" class="farsi" font-size="30" font-weight="700" fill="#9CA3AF">دعوت‌نامه</text>';
    body += '<text x="' + SCORE_X + '" y="' + (startY - 72) + '" text-anchor="middle" class="farsi" font-size="30" font-weight="700" fill="#9CA3AF">نمره</text>';
    body += '<line x1="130" y1="' + (startY - 46) + '" x2="950" y2="' + (startY - 46) + '" stroke="#E5E7EB" stroke-width="3"/>';
    for (let i = 0; i < shown.length; i++) {
      const y = startY + i * 88;
      body += '<text x="' + STREAM_X + '" y="' + y + '" text-anchor="middle" class="english" font-size="34" font-weight="700" fill="#2C3E50">' + esc(clip(shown[i].name, 20)) + '</text>';
      body += '<text x="' + INVITE_X + '" y="' + y + '" text-anchor="middle" class="english" font-size="38" font-weight="700" fill="#2C3E50">' + esc(shown[i].count) + '</text>';
      body += '<text x="' + SCORE_X + '" y="' + y + '" text-anchor="middle" class="english" font-size="38" font-weight="700" fill="#545454">' + esc(shown[i].score || '—') + '</text>';
    }
    if (rows.length > shown.length) {
      body += '<text x="540" y="' + (startY + shown.length * 88) + '" text-anchor="middle" class="farsi" font-size="30" font-weight="700" fill="#9CA3AF">+' + (rows.length - shown.length) + ' استریم دیگر</text>';
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">' +
    '<defs>' +
    '<style>' +
    "@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&amp;family=Inter:wght@700;800;900&amp;display=swap');" +
    ".farsi { font-family: 'Vazirmatn', 'Tahoma', sans-serif; direction: rtl; }" +
    ".english { font-family: 'Inter', 'Arial', sans-serif; }" +
    '</style>' +
    '<filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">' +
    '<feDropShadow dx="0" dy="20" stdDeviation="40" flood-color="#000000" flood-opacity="0.08"/>' +
    '</filter>' +
    '</defs>' +
    '<rect width="1080" height="1920" fill="#FFFFFF"/>' +
    '<rect x="40" y="40" width="1000" height="1840" rx="50" ry="50" fill="#FFFFFF" filter="url(#cardShadow)" stroke="#F3F4F6" stroke-width="1"/>' +
    decor +
    '<text x="540" y="300" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">' + esc(o.line1) + '</text>' +
    '<text x="540" y="395" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">' + esc(o.line2) + '</text>' +
    '<text x="540" y="490" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">' + esc(o.line3) + '</text>' +
    '<line x1="220" y1="555" x2="860" y2="555" stroke="#E5E7EB" stroke-width="3"/>' +
    bigFigures +
    body +
    '<text x="540" y="' + (plain ? 1560 : 1620) + '" text-anchor="middle" class="english" font-size="42" font-weight="700" fill="#2C3E50">' + esc(o.date) + '</text>' +
    '<image x="290" y="1730" width="500" height="85" xlink:href="' + LOGO_URL + '" preserveAspectRatio="xMidYMid meet"/>' +
    '</svg>';
}

// X is summary-only: a breakdown would be truncated mid-figure, which is worse
// than omitting it. That is also why the totals stay in the text posts even
// though the card drops them.
function buildTexts(t) {
  const lines = t.lines || [];

  const tgBreakdown = lines.length
    ? '\n' + lines.map((l) =>
        '\u{1F539} <b>' + esc(l.label) + '</b> — ' + esc(l.size) + ' دعوت‌نامه' +
        (l.score ? ' · حداقل امتیاز ' + esc(l.score) : '')
      ).join('\n') + '\n'
    : '';

  const plainBreakdown = lines.length
    ? '\n' + lines.map((l) =>
        '\u{1F539} ' + l.label + ' — ' + l.size + ' دعوت‌نامه' +
        (l.score ? ' · حداقل امتیاز ' + l.score : '')
      ).join('\n') + '\n'
    : '';

  const telegram = '\u{1F4E2} <b>' + esc(t.title) + '</b>\n' +
    '<b>اقامت دائم کانادا (PR)</b> \u{1F1E8}\u{1F1E6}\n\n' +
    '\u{1F5D3} <b>تاریخ برگزاری:</b> <code>' + esc(t.date) + '</code>\n' +
    (t.catFa ? '\u{1F3AF} <b>دسته‌بندی انتخاب:</b> <b>' + esc(t.catFa) + '</b>\n' : '') +
    '\n\u{1F4CA} <b>آمار این دوره:</b>\n' +
    '\u{1F539} ' + esc(t.sizeLabelFa) + ': <b>' + esc(t.size) + '</b> نفر\n' +
    (t.crs ? '\u{1F539} ' + esc(t.scoreLabelFa) + ': <b>' + esc(t.crs) + '</b> امتیاز\n' : '') +
    tgBreakdown +
    '\n\u{1F517} <a href="' + esc(t.link) + '">مشاهده جزئیات در سایت رسمی' + esc(t.sourceFa) + '</a>\n\n' +
    '\u{1F310} www.sugimotovisa.com';

  const x = '\u{1F4E2} ' + t.title + '\n' +
    'اقامت دائم کانادا (PR) \u{1F1E8}\u{1F1E6}\n\n' +
    '\u{1F5D3} تاریخ برگزاری: ' + t.date + '\n' +
    (t.catFa ? '\u{1F3AF} دسته‌بندی انتخاب: ' + t.catFa + '\n' : '') +
    '\u{1F539} ' + t.sizeLabelFa + ': ' + t.size + ' نفر\n' +
    (t.crs ? '\u{1F539} ' + t.scoreLabelFa + ': ' + t.crs + ' امتیاز\n' : '') +
    '\n\u{1F310} www.sugimotovisa.com';

  const linkedin = '\u{1F4E2} ' + t.title + '\n' +
    'اقامت دائم کانادا (PR) \u{1F1E8}\u{1F1E6}\n\n' +
    '\u{1F5D3} تاریخ برگزاری: ' + t.date + '\n' +
    (t.catFa ? '\u{1F3AF} دسته‌بندی انتخاب: ' + t.catFa + '\n' : '') +
    '\n\u{1F4CA} آمار این دوره:\n' +
    '\u{1F539} ' + t.sizeLabelFa + ': ' + ubold(t.size) + ' نفر\n' +
    (t.crs ? '\u{1F539} ' + t.scoreLabelFa + ': ' + ubold(t.crs) + ' امتیاز\n' : '') +
    plainBreakdown +
    '\n\u{1F517} جزئیات در سایت رسمی: ' + t.link + '\n\n' +
    '\u{1F310} www.sugimotovisa.com';

  const ig_caption = t.title + ' \u{1F1E8}\u{1F1E6}\n\n' +
    'تاریخ برگزاری: ' + t.date + '\n' +
    (t.catFa ? 'دسته‌بندی انتخاب: ' + t.catFa + '\n' : '') +
    t.sizeLabelFa + ': ' + t.size + ' نفر\n' +
    (t.crs ? t.scoreLabelFa + ': ' + t.crs + '\n' : '') +
    plainBreakdown +
    '\nبرای مشاوره: www.sugimotovisa.com\n\n' +
    t.tags;

  return { telegram: telegram, x: x, linkedin: linkedin, ig_caption: ig_caption };
}

const EE_TAGS = '#اکسپرس_انتری #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا #PR #ExpressEntry';
const PNP_TAGS = '#برنامه_استانی #مهاجرت_کانادا #اقامت_کانادا #سوگیموتو_ویزا #PR #PNP';

const out = [];

const r = (src.rounds || [])[0];
if (r && daysOld(r.drawDate) <= MAX_AGE_DAYS) {
  const name = String(r.drawName || r.drawText || '').replace(/,?\s*\d{4}-version\s*\d+/i, '').trim();
  const nameFa = getPersianCategory(name);
  const date = String(r.drawDateFull || r.drawDate || '');
  const size = String(r.drawSize || '');
  const crs = String(r.drawCRS || r.drawCutOff || '');
  const texts = buildTexts({
    title: 'نتیجه جدیدترین دراو اکسپرس انتری',
    date: date, catFa: nameFa, size: size, sizeLabelFa: 'تعداد دعوت‌نامه صادر شده',
    crs: crs, scoreLabelFa: 'حداقل امتیاز قبولی (CRS)',
    link: EE_LINK, sourceFa: ' اداره مهاجرت', tags: EE_TAGS, lines: []
  });
  out.push({
    sortKey: String(r.drawDate || ''),
    dedup_key: 'ee::' + r.drawNumber,
    program: 'express-entry',
    draw_number: String(r.drawNumber),
    draw_name: name,
    draw_crs: crs,
    draw_size: size,
    telegram: texts.telegram,
    x: texts.x,
    linkedin: texts.linkedin,
    ig_caption: texts.ig_caption,
    svg: storyCard({ line1: 'جدیدترین Draw', line2: 'اکسپرس انتری', line3: 'اقامت دائم کانادا PR', crs: crs, crsLabel: 'نمره آخرین نفر قبولی', size: size, catFa: nameFa, catEn: name, date: date })
  });
}

const PROV = {
  BC:  { fa: 'بریتیش کلمبیا (BC PNP)', short: 'بریتیش کلمبیا', en: 'BC PNP', prefix: '' },
  BCE: { fa: 'بریتیش کلمبیا — کارآفرینی (BC PNP)', short: 'بریتیش کلمبیا', en: 'BC PNP Entrepreneur', prefix: 'Entrepreneur — ' },
  ON:  { fa: 'انتاریو (OINP)', short: 'انتاریو', en: 'OINP', prefix: '' },
  AB:  { fa: 'آلبرتا (AAIP)', short: 'آلبرتا', en: 'AAIP', prefix: '' },
  MB:  { fa: 'مانیتوبا (MPNP)', short: 'مانیتوبا', en: 'MPNP', prefix: '' }
};
const pnp = src.pnpDraws || {};
for (const code of Object.keys(PROV)) {
  const p = pnp[code];
  if (!p || !Array.isArray(p.draws)) continue;
  const meta = PROV[code];
  const link = String(p.url || 'https://www.sugimotovisa.com');

  const byDate = {};
  for (const d of p.draws) {
    if (daysOld(d.dateISO || d.date) > MAX_AGE_DAYS) continue;
    if (!(d.date || d.dateISO) || !d.invitations) continue;
    const key = String(d.dateISO || d.date);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(d);
  }

  for (const dateKey of Object.keys(byDate)) {
    const group = byDate[dateKey];
    const date = String(group[0].date || group[0].dateISO || '');
    const tot = totalInvites(group);
    const sc = scoreRange(group);
    const single = group.length === 1;

    const sizeCard = single
      ? String(group[0].invitations)
      : (tot.approx ? tot.known + '+' : String(tot.known));
    const sizeDisplay = single ? countFa(sizeCard) : sizeCard;

    const labelled = group.filter((d) => usableStream(d.stream));
    const allLabelled = !single && labelled.length === group.length;
    const firstStream = String(group[0].stream || '');
    const sameStream = allLabelled && group.every((d) => String(d.stream || '') === firstStream);

    let lines = [];
    let cardRows = [];
    let cardRoutes = [];
    let catFa = '';
    let title = '';
    let headlineScore = '';
    let headlineScoreLabel = '';

    if (single) {
      catFa = usableStream(group[0].stream) ? meta.prefix + firstStream : '';
      title = 'نتیجه جدیدترین دراو ' + meta.fa;
      headlineScore = String(group[0].score || '');
      headlineScoreLabel = 'حداقل امتیاز قبولی';
    } else if (sameStream) {
      // One draw, several selection routes. The routes carry the scores, so the
      // headline shows only the total.
      catFa = meta.prefix + firstStream;
      title = 'نتیجه جدیدترین دراو ' + meta.fa;
      lines = group.map((d) => ({
        label: routeLabel(d.score, d.factors),
        size: countFa(d.invitations),
        score: ''
      }));
      cardRoutes = group.map((d) => ({
        count: String(d.invitations),
        label: routeLabel(d.score, d.factors)
      }));
    } else {
      catFa = group.length + ' استریم';
      title = 'نتایج دراوهای ' + meta.fa;
      headlineScore = sc.fa;
      headlineScoreLabel = 'محدوده حداقل امتیاز';
      if (allLabelled) {
        lines = group.map((d) => ({
          label: meta.prefix + String(d.stream),
          size: countFa(d.invitations),
          score: String(d.score || '')
        }));
        cardRows = group.map((d) => ({
          name: meta.prefix + String(d.stream),
          count: String(d.invitations),
          score: String(d.score || '')
        }));
      }
    }

    const texts = buildTexts({
      title: title,
      date: date,
      catFa: catFa,
      size: sizeDisplay,
      sizeLabelFa: single ? 'تعداد دعوت‌نامه صادر شده' : 'مجموع دعوت‌نامه‌های این روز',
      crs: headlineScore,
      scoreLabelFa: headlineScoreLabel,
      link: link,
      sourceFa: ' استان',
      tags: PNP_TAGS,
      lines: lines
    });

    // Keyed on the raw figure. "Drop already posted" matches on the first two
    // segments — keep code::dateISO leading in any future change.
    out.push({
      sortKey: dateKey,
      dedup_key: code.toLowerCase() + '::' + dateKey + '::' + group.length + '::' + sizeCard,
      program: meta.en,
      draw_number: '',
      draw_name: single || sameStream ? (catFa || meta.en) : (meta.en + ' — ' + group.length + ' draws'),
      draw_crs: single ? String(group[0].score || '') : sc.card,
      draw_size: sizeCard,
      telegram: texts.telegram,
      x: texts.x,
      linkedin: texts.linkedin,
      ig_caption: texts.ig_caption,
      svg: storyCard({
        line1: 'جدیدترین Draw',
        line2: meta.short,
        line3: 'اقامت دائم کانادا PR',
        crs: (single ? String(group[0].score || '') : sc.card) || '—',
        crsLabel: 'حداقل امتیاز',
        size: sizeCard,
        sizeLabel: 'تعداد دعوتنامه',
        catFa: '',
        catEn: sameStream ? firstStream : (single ? (usableStream(group[0].stream) ? meta.prefix + firstStream : meta.en) : ''),
        date: date,
        rows: cardRows,
        routes: cardRoutes
      })
    });
  }
}

out.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));
return out.map((json) => ({ json }));
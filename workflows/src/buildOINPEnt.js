// Code node: "Build OINP Entrepreneur Items"
// Parses the OINP "Entrepreneur stream" invitation tables (fetched from
// ontario.ca as text) and posts the latest entrepreneur draw — but ONLY if it
// is recent (<= STALE_DAYS). OINP's Entrepreneur stream has not drawn since
// Sept 2023, so this stays silent until Ontario resumes entrepreneur draws,
// then auto-posts. Dedup by draw date via the posted_draws table.
const STALE_DAYS = 90;

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function stripTags(h) {
  return String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function toISO(s) {
  const t = Date.parse(s);
  if (isNaN(t)) return '';
  const d = new Date(t);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

const src = $input.all();
const first = src.length ? src[0].json : null;
const html = first ? (first.data || first.body || (typeof first === 'string' ? first : '')) : '';
if (!html) return [];

// Only tables that sit under an "Entrepreneur stream" <h3> — scoped so worker
// draws are never picked up.
const dateRe = /^[A-Z][a-z]+ \d{1,2},\s*20\d{2}$/;
const draws = [];
const chunks = html.split(/<h3[^>]*>/i);
chunks.forEach(function (chunk) {
  if (!/^\s*Entrepreneur stream\s*<\/h3>/i.test(chunk)) return;
  const tm = chunk.match(/<table[\s\S]*?<\/table>/i);
  if (!tm) return;
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(tm[0])) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(stripTags(td[1]));
    if (cells.length < 3) continue;
    if (!dateRe.test(cells[0])) continue;
    draws.push({ date: cells[0], dateISO: toISO(cells[0]), invitations: cells[1], score: cells[2] });
  }
});
if (!draws.length) return [];

draws.sort(function (a, b) { return (b.dateISO || '').localeCompare(a.dateISO || ''); });
const latest = draws[0];

// Staleness guard: don't post old/dormant draws.
const t = Date.parse(latest.dateISO);
if (isNaN(t) || (Date.now() - t) / 86400000 > STALE_DAYS) return [];

const link = 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply';
const site = 'www.sugimotovisa.com';
const scoreMatch = String(latest.score).match(/\d+/);
const minScore = scoreMatch ? scoreMatch[0] : String(latest.score);

const telegram = '📢 <b>نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP)</b>\n<b>برنامه کارآفرینی انتاریو (Entrepreneur Stream)</b> 🇨🇦\n\n🗓 <b>تاریخ برگزاری:</b> <code>' + esc(latest.date) + '</code>\n\n📊 <b>آمار این دوره:</b>\n🔹 تعداد دعوت‌نامه: <b>' + esc(latest.invitations) + '</b>\n🔹 محدوده امتیاز: <b>' + esc(latest.score) + '</b>\n\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی انتاریو</a>\n\n🌐 ' + site;

return [{
  json: {
    program: 'oinp-entrepreneur',
    dedup_key: 'oinp-entrepreneur::' + latest.dateISO,
    final_post_text: telegram,
    x_post_text: '📢 دراو جدید کارآفرینی انتاریو (OINP) 🇨🇦\n🗓 ' + latest.date + '\n🔹 دعوت‌نامه: ' + latest.invitations + '\n🔹 محدوده امتیاز: ' + latest.score + '\n' + link,
    linkedin_text: 'نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP) — برنامه کارآفرینی انتاریو 🇨🇦\n\n🗓 تاریخ: ' + latest.date + '\n🔹 تعداد دعوت‌نامه: ' + latest.invitations + '\n🔹 محدوده امتیاز: ' + latest.score + '\n\n🔗 ' + link + '\n🌐 ' + site + '\n#OINP #Entrepreneur #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا',
    ig_caption: 'نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP) 🇨🇦\n\nتاریخ: ' + latest.date + '\nتعداد دعوت‌نامه: ' + latest.invitations + '\nمحدوده امتیاز: ' + latest.score + '\n\nبرای مشاوره: ' + site + '\n\n#OINP #Entrepreneur #انتاریو #مهاجرت_کانادا #سوگیموتو_ویزا',
    skipInstagram: false,
    headingLine1: 'آخرین Draw',
    headingLine2: 'انتاریو OINP',
    headingLine3: 'کارآفرینی',
    statLeftValue: String(latest.invitations),
    statLeftLabel: 'تعداد دعوتنامه',
    statRightValue: String(minScore),
    statRightLabel: 'حداقل امتیاز',
    categoryFa: 'برنامه کارآفرینی انتاریو',
    categoryEn: 'OINP Entrepreneur Stream',
    dateText: String(latest.date),
    dt_name: 'OINP Entrepreneur',
    dt_crs: String(latest.score),
    dt_size: String(latest.invitations)
  }
}];

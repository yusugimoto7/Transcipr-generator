// Code node: "Build Alberta Items"
// Parses the Alberta AAIP "Draw information" HTML table (fetched from alberta.ca
// as text) and emits ONE weekly digest post covering the most recently completed
// week (Mon–Sun). Deduped by week via the posted_draws table, so it posts once
// per week no matter how often the workflow runs.
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function stripTags(h) {
  return String(h)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ').trim();
}
function toISO(s) {
  const t = Date.parse(s);
  if (isNaN(t)) return '';
  const d = new Date(t);
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}
function isoOf(d) {
  const m = ('0' + (d.getUTCMonth() + 1)).slice(-2);
  const day = ('0' + d.getUTCDate()).slice(-2);
  return d.getUTCFullYear() + '-' + m + '-' + day;
}

const src = $input.all();
const first = src.length ? src[0].json : null;
const html = first ? (first.data || first.body || (typeof first === 'string' ? first : '')) : '';
if (!html) return [];

// --- parse draw rows (first cell is a date) ---
const dateRe = /^[A-Z][a-z]+ \d{1,2},\s*20\d{2}$/;
const draws = [];
const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
let tr;
while ((tr = trRe.exec(html)) !== null) {
  const cells = [];
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let td;
  while ((td = tdRe.exec(tr[1])) !== null) cells.push(stripTags(td[1]));
  if (cells.length !== 4) continue;
  const date = cells[0];
  if (!dateRe.test(date)) continue;
  const iso = toISO(date);
  if (!iso) continue;
  draws.push({ date: date, dateISO: iso, stream: cells[1], score: cells[2], invitations: cells[3] });
}
if (!draws.length) return [];

// --- window = most recently COMPLETED week (Mon 00:00 UTC .. next Mon, exclusive) ---
const now = new Date();
const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
const weekEnd = thisMon;                                   // exclusive upper bound
const weekStart = new Date(thisMon.getTime() - 7 * 86400000);
const startISO = isoOf(weekStart);
const endISO = isoOf(weekEnd);
const sundayISO = isoOf(new Date(weekEnd.getTime() - 86400000)); // last day shown

const inWeek = draws.filter(function (d) { return d.dateISO >= startISO && d.dateISO < endISO; });
if (!inWeek.length) return [];                             // no draws that week -> no post

inWeek.sort(function (a, b) { return b.dateISO.localeCompare(a.dateISO); }); // newest first

let totalInv = 0;
inWeek.forEach(function (d) { const raw = String(d.invitations).replace(/,/g, ''); if (/^\d+$/.test(raw)) totalInv += parseInt(raw, 10); }); // skip "Less than 10" etc.

const link = 'https://www.alberta.ca/aaip-processing-information';
const site = 'www.sugimotovisa.com';

// --- Telegram (HTML) ---
let listTg = '';
inWeek.forEach(function (d) {
  listTg += '\n🔹 <b>' + esc(d.date) + '</b>\n   • ' + esc(d.stream) + '\n   • دعوت‌نامه: <b>' + esc(d.invitations) + '</b> | حداقل امتیاز: <b>' + esc(d.score) + '</b>\n';
});
const telegram = '📢 <b>خلاصه هفتگی دراوهای آلبرتا (AAIP)</b>\n<b>برنامه مهاجرت استانی آلبرتا</b> 🇨🇦\n\n🗓 <b>هفته:</b> <code>' + startISO + ' تا ' + sundayISO + '</code>\n📊 <b>تعداد دراوها:</b> <b>' + inWeek.length + '</b> | مجموع دعوت‌نامه: <b>' + totalInv + '</b>\n' + listTg + '\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی آلبرتا</a>\n\n🌐 ' + site;

// --- LinkedIn (plain) ---
let listLi = '';
inWeek.forEach(function (d) { listLi += '\n• ' + d.date + ' — ' + d.stream + ' | دعوت‌نامه: ' + d.invitations + ' | حداقل امتیاز: ' + d.score; });
const linkedin = 'خلاصه هفتگی دراوهای آلبرتا (AAIP) — برنامه مهاجرت استانی آلبرتا 🇨🇦\n\nهفته ' + startISO + ' تا ' + sundayISO + '\nتعداد دراوها: ' + inWeek.length + ' | مجموع دعوت‌نامه: ' + totalInv + listLi + '\n\n🔗 ' + link + '\n🌐 ' + site + '\n#AAIP #Alberta #مهاجرت_کانادا #سوگیموتو_ویزا';

return [{
  json: {
    program: 'alberta-aaip-weekly',
    dedup_key: 'alberta-week::' + startISO,
    final_post_text: telegram,
    x_post_text: '📢 خلاصه هفتگی دراوهای آلبرتا (AAIP) 🇨🇦\nهفته ' + startISO + ' تا ' + sundayISO + '\n' + inWeek.length + ' دراو، مجموع ' + totalInv + ' دعوت‌نامه\n' + link,
    linkedin_text: linkedin,
    ig_caption: 'خلاصه هفتگی دراوهای آلبرتا (AAIP) 🇨🇦\n\nهفته ' + startISO + ' تا ' + sundayISO + '\nتعداد دراوها: ' + inWeek.length + '\nمجموع دعوت‌نامه: ' + totalInv + '\n\nبرای مشاوره: ' + site + '\n\n#AAIP #آلبرتا #مهاجرت_کانادا #سوگیموتو_ویزا',
    skipInstagram: false,
    headingLine1: 'خلاصه هفتگی',
    headingLine2: 'آلبرتا AAIP',
    headingLine3: 'مهاجرت استانی',
    statLeftValue: String(totalInv),
    statLeftLabel: 'مجموع دعوتنامه',
    statRightValue: String(inWeek.length),
    statRightLabel: 'تعداد دراو',
    categoryFa: 'خلاصه هفتگی آلبرتا',
    categoryEn: 'Alberta AAIP — Weekly',
    dateText: startISO + ' → ' + sundayISO,
    dt_name: 'Alberta AAIP (weekly)',
    dt_crs: '',
    dt_size: String(totalInv)
  }
}];

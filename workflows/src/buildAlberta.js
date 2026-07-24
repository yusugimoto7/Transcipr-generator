// Code node: "Build Alberta Items"
// Parses the Alberta AAIP "Draw information" HTML table (fetched directly from
// alberta.ca as text) and emits the newest draws as normalised items. Dedup is
// handled by the posted_draws data table, so we emit the top few candidates and
// let the table decide which are actually new.
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

const src = $input.all();
const first = src.length ? src[0].json : null;
// httpRequest (responseFormat: text) puts the body in `data`; fall back to body/string.
const html = first ? (first.data || first.body || (typeof first === 'string' ? first : '')) : '';
if (!html) return [];

// Isolate rows whose first cell is a date — that uniquely identifies the draw table.
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
  draws.push({ date: date, dateISO: toISO(date), stream: cells[1], score: cells[2], invitations: cells[3] });
}
if (!draws.length) return [];

const link = 'https://www.alberta.ca/aaip-processing-information';
const site = 'www.sugimotovisa.com';
const CANDIDATES = 3; // newest N; dedup keeps only the genuinely new ones

return draws.slice(0, CANDIDATES).map(function (d) {
  const streamShort = String(d.stream).substring(0, 50);
  const invCard = String(d.invitations).replace(/less than 10/i, '<10');
  const telegram = '📢 <b>نتیجه جدیدترین دراو آلبرتا (AAIP)</b>\n<b>برنامه مهاجرت استانی آلبرتا</b> 🇨🇦\n\n🗓 <b>تاریخ برگزاری:</b> <code>' + esc(d.date) + '</code>\n🎯 <b>دسته‌بندی:</b> <b>' + esc(d.stream) + '</b>\n\n📊 <b>آمار این دوره:</b>\n🔹 تعداد دعوت‌نامه: <b>' + esc(d.invitations) + '</b>\n🔹 حداقل امتیاز: <b>' + esc(d.score) + '</b>\n\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی آلبرتا</a>\n\n🌐 ' + site;
  return {
    json: {
      program: 'alberta-aaip',
      dedup_key: 'alberta::' + (d.dateISO || d.date) + '::' + streamShort,
      final_post_text: telegram,
      x_post_text: '📢 دراو جدید آلبرتا (AAIP) 🇨🇦\n🗓 ' + d.date + '\n🎯 ' + d.stream + '\n🔹 دعوت‌نامه: ' + d.invitations + '\n🔹 حداقل امتیاز: ' + d.score + '\n' + link,
      linkedin_text: 'نتیجه جدیدترین دراو آلبرتا (AAIP) — برنامه مهاجرت استانی آلبرتا 🇨🇦\n\n🗓 تاریخ: ' + d.date + '\n🎯 دسته‌بندی: ' + d.stream + '\n🔹 تعداد دعوت‌نامه: ' + d.invitations + '\n🔹 حداقل امتیاز: ' + d.score + '\n\n🔗 ' + link + '\n🌐 ' + site + '\n#AAIP #Alberta #مهاجرت_کانادا #سوگیموتو_ویزا',
      ig_caption: 'نتیجه جدیدترین دراو آلبرتا (AAIP) 🇨🇦\n\nتاریخ: ' + d.date + '\nدسته‌بندی: ' + d.stream + '\nتعداد دعوت‌نامه: ' + d.invitations + '\nحداقل امتیاز: ' + d.score + '\n\nبرای مشاوره: ' + site + '\n\n#AAIP #آلبرتا #مهاجرت_کانادا #سوگیموتو_ویزا',
      skipInstagram: false,
      headingLine1: 'آخرین Draw',
      headingLine2: 'آلبرتا AAIP',
      headingLine3: 'مهاجرت استانی',
      statLeftValue: invCard,
      statLeftLabel: 'تعداد دعوتنامه',
      statRightValue: String(d.score),
      statRightLabel: 'حداقل امتیاز',
      categoryFa: 'برنامه مهاجرت آلبرتا',
      categoryEn: String(d.stream).substring(0, 42),
      dateText: String(d.date),
      dt_name: 'Alberta AAIP',
      dt_crs: String(d.score),
      dt_size: String(d.invitations)
    }
  };
});

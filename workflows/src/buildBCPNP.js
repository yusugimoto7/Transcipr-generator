// Code node: "Build BC PNP Items"
// Emits 0-2 normalised items (Skills and/or Entrepreneur) from the GAS router.
// No staticData dedup — the posted_draws data table handles it downstream.
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function htmlToPlain(h) {
  return String(h)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '$2: $1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function lowScore(streams) {
  let m = null;
  (streams || []).forEach(function (s) {
    const n = parseInt(String(s.minScore).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && (m === null || n < m)) m = n;
  });
  return m === null ? '—' : String(m);
}
function sumItas(streams) {
  let t = 0;
  (streams || []).forEach(function (s) {
    const n = parseInt(String(s.itas).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n)) t += n;
  });
  return t;
}

const src = $input.all();
const data = src.length ? src[0].json : null;
if (!data || data.error) return [];

const link = data.sourceUrl;
const site = 'www.sugimotovisa.com';
const outputs = [];

// ===== BC PNP — Skills Immigration =====
const skills = data.skillsImmigration;
if (skills && skills.latestDate) {
  let streamsBlock = '';
  (skills.streams || []).forEach(function (s) {
    const score = s.minScore === 'N/A' ? '—' : esc(s.minScore);
    streamsBlock += '\n🔹 <b>' + esc(s.name) + '</b>\n   • حداقل امتیاز: <b>' + score + '</b>\n   • تعداد دعوت‌نامه: <b>' + esc(s.itas) + '</b> نفر\n';
  });
  const telegram = '📢 <b>نتیجه جدیدترین دراو بی‌سی پی‌ان‌پی</b>\n<b>برنامه نیروی متخصص بریتیش کلمبیا (BC PNP - Skills)</b> 🇨🇦\n\n🗓 <b>تاریخ برگزاری:</b> <code>' + esc(skills.latestDate) + '</code>\n\n📊 <b>خلاصه این دوره:</b>\n🔸 مجموع دعوت‌نامه‌ها: <b>' + esc(skills.totalItas) + '</b> نفر\n' + streamsBlock + '\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی WelcomeBC</a>\n\n🌐 ' + site;
  const low = lowScore(skills.streams);
  const total = String(skills.totalItas || '—');
  outputs.push({
    json: {
      program: 'bcpnp-skills',
      dedup_key: 'bcpnp-skills::' + skills.latestDate,
      final_post_text: telegram,
      x_post_text: '📢 دراو جدید BC PNP (Skills) 🇨🇦\n🗓 ' + skills.latestDate + '\n🔸 مجموع دعوت‌نامه: ' + total + '\n🔹 حداقل امتیاز: ' + low + '\n' + link,
      linkedin_text: htmlToPlain(telegram) + '\n#BCPNP #مهاجرت_کانادا #بریتیش_کلمبیا #سوگیموتو_ویزا',
      ig_caption: 'نتیجه جدیدترین دراو BC PNP (Skills) 🇨🇦\n\nتاریخ برگزاری: ' + skills.latestDate + '\nمجموع دعوت‌نامه: ' + total + ' نفر\nحداقل امتیاز: ' + low + '\n\nبرای مشاوره: ' + site + '\n\n#BCPNP #بریتیش_کلمبیا #مهاجرت_کانادا #سوگیموتو_ویزا',
      skipInstagram: false,
      headingLine1: 'آخرین Draw',
      headingLine2: 'بریتیش کلمبیا',
      headingLine3: 'BC PNP - Skills',
      statLeftValue: total,
      statLeftLabel: 'مجموع دعوتنامه',
      statRightValue: low,
      statRightLabel: 'حداقل امتیاز',
      categoryFa: 'برنامه نیروی متخصص',
      categoryEn: 'Skills Immigration',
      dateText: String(skills.latestDate),
      dt_name: 'BC PNP Skills',
      dt_crs: low,
      dt_size: total
    }
  });
}

// ===== BC PNP — Entrepreneur Immigration =====
const ent = data.entrepreneurImmigration;
if (ent && ent.latestDate) {
  let streamsBlock = '';
  (ent.streams || []).forEach(function (s) {
    streamsBlock += '\n🔹 <b>' + esc(s.name) + '</b>\n   • حداقل امتیاز: <b>' + esc(s.minScore) + '</b>\n   • تعداد دعوت‌نامه: <b>' + esc(s.itas) + '</b> نفر\n';
  });
  const telegram = '📢 <b>نتیجه جدیدترین دراو کارآفرینی بی‌سی</b>\n<b>برنامه کارآفرینی بریتیش کلمبیا (BC PNP - Entrepreneur)</b> 🇨🇦\n\n🗓 <b>تاریخ برگزاری:</b> <code>' + esc(ent.latestDate) + '</code>\n' + streamsBlock + '\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی WelcomeBC</a>\n\n🌐 ' + site;
  const low = lowScore(ent.streams);
  const total = sumItas(ent.streams);
  const totalStr = total > 0 ? String(total) : '—';
  outputs.push({
    json: {
      program: 'bcpnp-entrepreneur',
      dedup_key: 'bcpnp-entrepreneur::' + ent.latestDate,
      final_post_text: telegram,
      x_post_text: '📢 دراو جدید کارآفرینی BC PNP 🇨🇦\n🗓 ' + ent.latestDate + '\n🔸 مجموع دعوت‌نامه: ' + totalStr + '\n🔹 حداقل امتیاز: ' + low + '\n' + link,
      linkedin_text: htmlToPlain(telegram) + '\n#BCPNP #Entrepreneur #مهاجرت_کانادا #سوگیموتو_ویزا',
      ig_caption: 'نتیجه جدیدترین دراو کارآفرینی BC PNP 🇨🇦\n\nتاریخ برگزاری: ' + ent.latestDate + '\nمجموع دعوت‌نامه: ' + totalStr + ' نفر\nحداقل امتیاز: ' + low + '\n\nبرای مشاوره: ' + site + '\n\n#BCPNP #Entrepreneur #بریتیش_کلمبیا #سوگیموتو_ویزا',
      skipInstagram: false,
      headingLine1: 'آخرین Draw',
      headingLine2: 'بریتیش کلمبیا',
      headingLine3: 'BC PNP - Entrepreneur',
      statLeftValue: totalStr,
      statLeftLabel: 'مجموع دعوتنامه',
      statRightValue: low,
      statRightLabel: 'حداقل امتیاز',
      categoryFa: 'برنامه کارآفرینی',
      categoryEn: 'Entrepreneur Immigration',
      dateText: String(ent.latestDate),
      dt_name: 'BC PNP Entrepreneur',
      dt_crs: low,
      dt_size: totalStr
    }
  });
}

return outputs;

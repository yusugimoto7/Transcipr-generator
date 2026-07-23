// Code node: "Build OINP Items"
// Emits 0-2 normalised items (draw summary and/or program update) from the GAS router.
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function htmlToPlain(h) {
  return String(h)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '$2: $1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

const src = $input.all();
const data = src.length ? src[0].json : null;
if (!data || data.error || !data.latestDate || !data.items || data.items.length === 0) return [];

const link = data.sourceUrl;
const site = 'www.sugimotovisa.com';
const outputs = [];
const draws = data.items.filter(function (i) { return i.type === 'draw'; });
const updates = data.items.filter(function (i) { return i.type === 'update'; });

// ===== OINP — Draw summary =====
if (draws.length > 0) {
  let drawsBlock = '';
  let totalItas = 0;
  draws.forEach(function (d) {
    const itaLine = d.itas ? '   • تعداد دعوت‌نامه: <b>' + esc(d.itas) + '</b> نفر\n' : '';
    drawsBlock += '\n🔹 <b>' + esc(d.title) + '</b>\n' + itaLine;
    if (d.itas) { const n = parseInt(d.itas, 10); if (!isNaN(n)) totalItas += n; }
  });
  const totalLine = totalItas > 0 ? '🔸 مجموع دعوت‌نامه‌ها: <b>' + totalItas + '</b> نفر\n' : '';
  const telegram = '📢 <b>نتیجه جدیدترین دراو انتاریو (OINP)</b>\n<b>برنامه مهاجرت استانی انتاریو</b> 🇨🇦\n\n🗓 <b>تاریخ برگزاری:</b> <code>' + esc(data.latestDate) + '</code>\n\n📊 <b>خلاصه این دوره:</b>\n' + totalLine + drawsBlock + '\n🔗 <a href="' + link + '">مشاهده جزئیات در سایت رسمی انتاریو</a>\n\n🌐 ' + site;
  const totalStr = totalItas > 0 ? String(totalItas) : '—';
  const firstTitle = String(draws[0].title || 'OINP').substring(0, 40);
  outputs.push({
    json: {
      program: 'oinp-draw',
      dedup_key: 'oinp-draw::' + data.latestDate + '::' + firstTitle,
      final_post_text: telegram,
      x_post_text: '📢 دراو جدید انتاریو (OINP) 🇨🇦\n🗓 ' + data.latestDate + '\n🔸 مجموع دعوت‌نامه: ' + totalStr + '\n' + link,
      linkedin_text: htmlToPlain(telegram) + '\n#OINP #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا',
      ig_caption: 'نتیجه جدیدترین دراو انتاریو (OINP) 🇨🇦\n\nتاریخ برگزاری: ' + data.latestDate + '\nمجموع دعوت‌نامه: ' + totalStr + ' نفر\n\nبرای مشاوره: ' + site + '\n\n#OINP #انتاریو #مهاجرت_کانادا #سوگیموتو_ویزا',
      skipInstagram: false,
      headingLine1: 'آخرین Draw',
      headingLine2: 'انتاریو OINP',
      headingLine3: 'مهاجرت استانی',
      statLeftValue: totalStr,
      statLeftLabel: 'تعداد دعوتنامه',
      statRightValue: '—',
      statRightLabel: 'حداقل امتیاز',
      categoryFa: 'مهاجرت استانی انتاریو',
      categoryEn: firstTitle,
      dateText: String(data.latestDate),
      dt_name: 'OINP Draw',
      dt_crs: '',
      dt_size: totalStr
    }
  });
}

// ===== OINP — Program update / announcement (no story image) =====
if (updates.length > 0) {
  let updatesBlock = '';
  updates.forEach(function (u) {
    const summaryRaw = (u.summary && u.summary.length > 300) ? u.summary.substring(0, 300) + '...' : (u.summary || '');
    updatesBlock += '\n🔸 <b>' + esc(u.title) + '</b>\n' + esc(summaryRaw) + '\n';
  });
  const telegram = '📣 <b>اطلاعیه مهم برنامه OINP انتاریو</b>\n<b>تغییرات و به‌روزرسانی‌های جدید</b> 🇨🇦\n\n🗓 <b>تاریخ اطلاعیه:</b> <code>' + esc(data.latestDate) + '</code>\n' + updatesBlock + '\n⚠️ <i>این اطلاعیه شامل تغییرات مهم برنامه است، لطفاً برای جزئیات کامل به سایت رسمی مراجعه کنید.</i>\n\n🔗 <a href="' + link + '">مطالعه متن کامل در سایت رسمی انتاریو</a>\n\n🌐 ' + site;
  const firstTitle = String(updates[0].title || 'OINP Update').substring(0, 40);
  outputs.push({
    json: {
      program: 'oinp-update',
      dedup_key: 'oinp-update::' + data.latestDate + '::' + firstTitle,
      final_post_text: telegram,
      x_post_text: '📣 اطلاعیه جدید برنامه OINP انتاریو 🇨🇦\n🗓 ' + data.latestDate + '\n' + firstTitle + '\n' + link,
      linkedin_text: htmlToPlain(telegram) + '\n#OINP #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا',
      ig_caption: '',
      skipInstagram: true,
      headingLine1: '',
      headingLine2: '',
      headingLine3: '',
      statLeftValue: '',
      statLeftLabel: '',
      statRightValue: '',
      statRightLabel: '',
      categoryFa: '',
      categoryEn: '',
      dateText: String(data.latestDate),
      dt_name: 'OINP Update',
      dt_crs: '',
      dt_size: ''
    }
  });
}

return outputs;

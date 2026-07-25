// BC PNP — Skills Immigration + Entrepreneur Immigration, via the Google Apps
// Script router (?source=bcpnp), which already normalises the WelcomeBC page.
import { fetchJson, esc, htmlToPlain, SITE } from "../util";

export const id = "bcpnp";

function lowestScore(streams) {
  let min = null;
  for (const s of streams || []) {
    const n = parseInt(String(s.minScore).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && (min === null || n < min)) min = n;
  }
  return min === null ? "—" : String(min);
}

function sumItas(streams) {
  let total = 0;
  for (const s of streams || []) {
    const n = parseInt(String(s.itas).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) total += n;
  }
  return total;
}

export async function collect() {
  const base = process.env.DRAWS_ROUTER_URL;
  if (!base) return [];
  const data = await fetchJson(`${base}?source=bcpnp`, { timeout: 25000 });
  if (!data || data.error) return [];

  const link = data.sourceUrl;
  const items = [];

  // --- Skills Immigration ---
  const skills = data.skillsImmigration;
  if (skills?.latestDate) {
    let block = "";
    for (const s of skills.streams || []) {
      const score = s.minScore === "N/A" ? "—" : esc(s.minScore);
      block +=
        `\n🔹 <b>${esc(s.name)}</b>\n   • حداقل امتیاز: <b>${score}</b>\n` +
        `   • تعداد دعوت‌نامه: <b>${esc(s.itas)}</b> نفر\n`;
    }
    const total = String(skills.totalItas ?? "—");
    const low = lowestScore(skills.streams);
    const telegram =
      `📢 <b>نتیجه جدیدترین دراو بی‌سی پی‌ان‌پی</b>\n` +
      `<b>برنامه نیروی متخصص بریتیش کلمبیا (BC PNP - Skills)</b> 🇨🇦\n\n` +
      `🗓 <b>تاریخ برگزاری:</b> <code>${esc(skills.latestDate)}</code>\n\n` +
      `📊 <b>خلاصه این دوره:</b>\n🔸 مجموع دعوت‌نامه‌ها: <b>${esc(total)}</b> نفر\n` +
      block +
      `\n🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی WelcomeBC</a>\n\n🌐 ${SITE}`;

    items.push({
      program: "bcpnp-skills",
      dedupKey: `bcpnp-skills::${skills.latestDate}`,
      telegram,
      x:
        `📢 دراو جدید BC PNP (Skills) 🇨🇦\n🗓 ${skills.latestDate}\n` +
        `🔸 مجموع دعوت‌نامه: ${total}\n🔹 حداقل امتیاز: ${low}\n${link}`,
      linkedin:
        htmlToPlain(telegram) +
        `\n#BCPNP #مهاجرت_کانادا #بریتیش_کلمبیا #سوگیموتو_ویزا`,
      igCaption:
        `نتیجه جدیدترین دراو BC PNP (Skills) 🇨🇦\n\nتاریخ برگزاری: ${skills.latestDate}\n` +
        `مجموع دعوت‌نامه: ${total} نفر\nحداقل امتیاز: ${low}\n\n` +
        `برای مشاوره: ${SITE}\n\n#BCPNP #بریتیش_کلمبیا #مهاجرت_کانادا #سوگیموتو_ویزا`,
      skipInstagram: false,
      card: {
        headingLine1: "آخرین Draw",
        headingLine2: "بریتیش کلمبیا",
        headingLine3: "BC PNP - Skills",
        statLeft: { value: total, label: "مجموع دعوتنامه" },
        statRight: { value: low, label: "حداقل امتیاز" },
        categoryFa: "برنامه نیروی متخصص",
        categoryEn: "Skills Immigration",
        dateText: String(skills.latestDate),
      },
      record: { name: "BC PNP Skills", crs: low, size: total },
    });
  }

  // --- Entrepreneur Immigration ---
  const ent = data.entrepreneurImmigration;
  if (ent?.latestDate) {
    let block = "";
    for (const s of ent.streams || []) {
      block +=
        `\n🔹 <b>${esc(s.name)}</b>\n   • حداقل امتیاز: <b>${esc(s.minScore)}</b>\n` +
        `   • تعداد دعوت‌نامه: <b>${esc(s.itas)}</b> نفر\n`;
    }
    const low = lowestScore(ent.streams);
    const totalNum = sumItas(ent.streams);
    const total = totalNum > 0 ? String(totalNum) : "—";
    const telegram =
      `📢 <b>نتیجه جدیدترین دراو کارآفرینی بی‌سی</b>\n` +
      `<b>برنامه کارآفرینی بریتیش کلمبیا (BC PNP - Entrepreneur)</b> 🇨🇦\n\n` +
      `🗓 <b>تاریخ برگزاری:</b> <code>${esc(ent.latestDate)}</code>\n` +
      block +
      `\n🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی WelcomeBC</a>\n\n🌐 ${SITE}`;

    items.push({
      program: "bcpnp-entrepreneur",
      dedupKey: `bcpnp-entrepreneur::${ent.latestDate}`,
      telegram,
      x:
        `📢 دراو جدید کارآفرینی BC PNP 🇨🇦\n🗓 ${ent.latestDate}\n` +
        `🔸 مجموع دعوت‌نامه: ${total}\n🔹 حداقل امتیاز: ${low}\n${link}`,
      linkedin:
        htmlToPlain(telegram) +
        `\n#BCPNP #Entrepreneur #مهاجرت_کانادا #سوگیموتو_ویزا`,
      igCaption:
        `نتیجه جدیدترین دراو کارآفرینی BC PNP 🇨🇦\n\nتاریخ برگزاری: ${ent.latestDate}\n` +
        `مجموع دعوت‌نامه: ${total} نفر\nحداقل امتیاز: ${low}\n\n` +
        `برای مشاوره: ${SITE}\n\n#BCPNP #Entrepreneur #بریتیش_کلمبیا #سوگیموتو_ویزا`,
      skipInstagram: false,
      card: {
        headingLine1: "آخرین Draw",
        headingLine2: "بریتیش کلمبیا",
        headingLine3: "BC PNP - Entrepreneur",
        statLeft: { value: total, label: "مجموع دعوتنامه" },
        statRight: { value: low, label: "حداقل امتیاز" },
        categoryFa: "برنامه کارآفرینی",
        categoryEn: "Entrepreneur Immigration",
        dateText: String(ent.latestDate),
      },
      record: { name: "BC PNP Entrepreneur", crs: low, size: total },
    });
  }

  return items;
}

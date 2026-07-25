// OINP (Ontario) — draws + program updates, via the Apps Script router
// (?source=oinp). Program updates carry no numbers, so they skip Instagram.
import { fetchJson, esc, htmlToPlain, SITE } from "../util";

export const id = "oinp";

export async function collect() {
  const base = process.env.DRAWS_ROUTER_URL;
  if (!base) return [];
  const data = await fetchJson(`${base}?source=oinp`, { timeout: 25000 });
  if (!data || data.error || !data.latestDate || !data.items?.length) return [];

  const link = data.sourceUrl;
  const items = [];
  const draws = data.items.filter((i) => i.type === "draw");
  const updates = data.items.filter((i) => i.type === "update");

  if (draws.length) {
    let block = "";
    let totalItas = 0;
    for (const d of draws) {
      const itaLine = d.itas
        ? `   • تعداد دعوت‌نامه: <b>${esc(d.itas)}</b> نفر\n`
        : "";
      block += `\n🔹 <b>${esc(d.title)}</b>\n${itaLine}`;
      const n = parseInt(d.itas, 10);
      if (!isNaN(n)) totalItas += n;
    }
    const totalLine =
      totalItas > 0 ? `🔸 مجموع دعوت‌نامه‌ها: <b>${totalItas}</b> نفر\n` : "";
    const total = totalItas > 0 ? String(totalItas) : "—";
    const firstTitle = String(draws[0].title || "OINP").slice(0, 40);

    const telegram =
      `📢 <b>نتیجه جدیدترین دراو انتاریو (OINP)</b>\n` +
      `<b>برنامه مهاجرت استانی انتاریو</b> 🇨🇦\n\n` +
      `🗓 <b>تاریخ برگزاری:</b> <code>${esc(data.latestDate)}</code>\n\n` +
      `📊 <b>خلاصه این دوره:</b>\n${totalLine}${block}` +
      `\n🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی انتاریو</a>\n\n🌐 ${SITE}`;

    items.push({
      program: "oinp-draw",
      dedupKey: `oinp-draw::${data.latestDate}::${firstTitle}`,
      telegram,
      x:
        `📢 دراو جدید انتاریو (OINP) 🇨🇦\n🗓 ${data.latestDate}\n` +
        `🔸 مجموع دعوت‌نامه: ${total}\n${link}`,
      linkedin:
        htmlToPlain(telegram) + `\n#OINP #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا`,
      igCaption:
        `نتیجه جدیدترین دراو انتاریو (OINP) 🇨🇦\n\nتاریخ برگزاری: ${data.latestDate}\n` +
        `مجموع دعوت‌نامه: ${total} نفر\n\nبرای مشاوره: ${SITE}\n\n` +
        `#OINP #انتاریو #مهاجرت_کانادا #سوگیموتو_ویزا`,
      skipInstagram: false,
      card: {
        headingLine1: "آخرین Draw",
        headingLine2: "انتاریو OINP",
        headingLine3: "مهاجرت استانی",
        statLeft: { value: total, label: "تعداد دعوتنامه" },
        statRight: { value: "—", label: "حداقل امتیاز" },
        categoryFa: "مهاجرت استانی انتاریو",
        categoryEn: firstTitle,
        dateText: String(data.latestDate),
      },
      record: { name: "OINP Draw", crs: "", size: total },
    });
  }

  if (updates.length) {
    let block = "";
    for (const u of updates) {
      const summary =
        u.summary && u.summary.length > 300
          ? u.summary.slice(0, 300) + "..."
          : u.summary || "";
      block += `\n🔸 <b>${esc(u.title)}</b>\n${esc(summary)}\n`;
    }
    const firstTitle = String(updates[0].title || "OINP Update").slice(0, 40);
    const telegram =
      `📣 <b>اطلاعیه مهم برنامه OINP انتاریو</b>\n` +
      `<b>تغییرات و به‌روزرسانی‌های جدید</b> 🇨🇦\n\n` +
      `🗓 <b>تاریخ اطلاعیه:</b> <code>${esc(data.latestDate)}</code>\n${block}` +
      `\n⚠️ <i>این اطلاعیه شامل تغییرات مهم برنامه است، لطفاً برای جزئیات کامل به سایت رسمی مراجعه کنید.</i>\n\n` +
      `🔗 <a href="${link}">مطالعه متن کامل در سایت رسمی انتاریو</a>\n\n🌐 ${SITE}`;

    items.push({
      program: "oinp-update",
      dedupKey: `oinp-update::${data.latestDate}::${firstTitle}`,
      telegram,
      x:
        `📣 اطلاعیه جدید برنامه OINP انتاریو 🇨🇦\n🗓 ${data.latestDate}\n` +
        `${firstTitle}\n${link}`,
      linkedin:
        htmlToPlain(telegram) + `\n#OINP #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا`,
      igCaption: "",
      skipInstagram: true,
      card: null,
      record: { name: "OINP Update", crs: "", size: "" },
    });
  }

  return items;
}

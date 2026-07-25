// OINP Entrepreneur stream — scraped from the official OINP invitations page.
// This stream has been dormant since Sept 2023, so results are staleness-gated:
// nothing posts unless Ontario runs a draw newer than STALE_DAYS. It then
// auto-posts, without ever publishing an old draw as if it were current.
import {
  fetchText,
  esc,
  toISO,
  daysSince,
  tableRows,
  DATE_CELL,
  SITE,
} from "../util";

const DEFAULT_URL =
  "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
const STALE_DAYS = Number(process.env.DRAWS_OINP_ENT_STALE_DAYS || 90);

export const id = "oinp-entrepreneur";

// Only tables that sit under an "Entrepreneur stream" heading — so the worker
// stream tables on the same page are never picked up.
export function parseDraws(html) {
  const draws = [];
  for (const chunk of String(html).split(/<h3[^>]*>/i)) {
    if (!/^\s*Entrepreneur stream\s*<\/h3>/i.test(chunk)) continue;
    const table = chunk.match(/<table[\s\S]*?<\/table>/i);
    if (!table) continue;
    for (const cells of tableRows(table[0])) {
      if (cells.length < 3) continue;
      if (!DATE_CELL.test(cells[0])) continue;
      draws.push({
        date: cells[0],
        dateISO: toISO(cells[0]),
        invitations: cells[1],
        score: cells[2],
      });
    }
  }
  return draws.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
}

export function buildItem(draws, staleDays = STALE_DAYS) {
  const latest = draws[0];
  if (!latest) return null;
  if (daysSince(latest.dateISO) > staleDays) return null; // dormant — stay silent

  const link = process.env.DRAWS_OINP_ENT_URL || DEFAULT_URL;
  const scoreMatch = String(latest.score).match(/\d+/);
  const minScore = scoreMatch ? scoreMatch[0] : String(latest.score);

  const telegram =
    `📢 <b>نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP)</b>\n` +
    `<b>برنامه کارآفرینی انتاریو (Entrepreneur Stream)</b> 🇨🇦\n\n` +
    `🗓 <b>تاریخ برگزاری:</b> <code>${esc(latest.date)}</code>\n\n` +
    `📊 <b>آمار این دوره:</b>\n` +
    `🔹 تعداد دعوت‌نامه: <b>${esc(latest.invitations)}</b>\n` +
    `🔹 محدوده امتیاز: <b>${esc(latest.score)}</b>\n\n` +
    `🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی انتاریو</a>\n\n🌐 ${SITE}`;

  return {
    program: id,
    dedupKey: `oinp-entrepreneur::${latest.dateISO}`,
    telegram,
    x:
      `📢 دراو جدید کارآفرینی انتاریو (OINP) 🇨🇦\n🗓 ${latest.date}\n` +
      `🔹 دعوت‌نامه: ${latest.invitations}\n🔹 محدوده امتیاز: ${latest.score}\n${link}`,
    linkedin:
      `نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP) — برنامه کارآفرینی انتاریو 🇨🇦\n\n` +
      `🗓 تاریخ: ${latest.date}\n🔹 تعداد دعوت‌نامه: ${latest.invitations}\n` +
      `🔹 محدوده امتیاز: ${latest.score}\n\n🔗 ${link}\n🌐 ${SITE}\n` +
      `#OINP #Entrepreneur #Ontario #مهاجرت_کانادا #سوگیموتو_ویزا`,
    igCaption:
      `نتیجه جدیدترین دراو کارآفرینی انتاریو (OINP) 🇨🇦\n\nتاریخ: ${latest.date}\n` +
      `تعداد دعوت‌نامه: ${latest.invitations}\nمحدوده امتیاز: ${latest.score}\n\n` +
      `برای مشاوره: ${SITE}\n\n#OINP #Entrepreneur #انتاریو #مهاجرت_کانادا #سوگیموتو_ویزا`,
    skipInstagram: false,
    card: {
      headingLine1: "آخرین Draw",
      headingLine2: "انتاریو OINP",
      headingLine3: "کارآفرینی",
      statLeft: { value: String(latest.invitations), label: "تعداد دعوتنامه" },
      statRight: { value: String(minScore), label: "حداقل امتیاز" },
      categoryFa: "برنامه کارآفرینی انتاریو",
      categoryEn: "OINP Entrepreneur Stream",
      dateText: String(latest.date),
    },
    record: {
      name: "OINP Entrepreneur",
      crs: String(latest.score),
      size: String(latest.invitations),
    },
  };
}

export async function collect() {
  const url = process.env.DRAWS_OINP_ENT_URL || DEFAULT_URL;
  const html = await fetchText(url, { timeout: 25000 });
  const item = buildItem(parseDraws(html));
  return item ? [item] : [];
}

// Alberta AAIP — scraped from the official "Draw information" table.
// Alberta runs several draws a week across many streams, so this emits ONE
// weekly digest covering the most recently completed week (Mon–Sun) instead of
// one post per draw.
import {
  fetchText,
  esc,
  toISO,
  isoOfDate,
  tableRows,
  DATE_CELL,
  sumNumeric,
  SITE,
} from "../util";

const DEFAULT_URL = "https://www.alberta.ca/aaip-processing-information";

export const id = "alberta";

export function parseDraws(html) {
  const draws = [];
  for (const cells of tableRows(html)) {
    // The draw table is the only one with exactly 4 cells and a date first.
    if (cells.length !== 4) continue;
    if (!DATE_CELL.test(cells[0])) continue;
    const iso = toISO(cells[0]);
    if (!iso) continue;
    draws.push({
      date: cells[0],
      dateISO: iso,
      stream: cells[1],
      score: cells[2],
      invitations: cells[3],
    });
  }
  return draws;
}

// Most recently completed week: [Mon, next Mon) in UTC.
export function completedWeek(now = new Date()) {
  const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
  const thisMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow)
  );
  const start = new Date(thisMonday.getTime() - 7 * 86400000);
  return {
    startISO: isoOfDate(start),
    endISO: isoOfDate(thisMonday), // exclusive
    sundayISO: isoOfDate(new Date(thisMonday.getTime() - 86400000)),
  };
}

export function buildWeeklyItem(draws, now = new Date()) {
  const { startISO, endISO, sundayISO } = completedWeek(now);
  const week = draws
    .filter((d) => d.dateISO >= startISO && d.dateISO < endISO)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  if (!week.length) return null;

  const link = process.env.DRAWS_ALBERTA_URL || DEFAULT_URL;
  const totalInv = sumNumeric(week.map((d) => d.invitations));

  let blockTg = "";
  let blockPlain = "";
  for (const d of week) {
    blockTg +=
      `\n🔹 <b>${esc(d.date)}</b>\n   • ${esc(d.stream)}\n` +
      `   • دعوت‌نامه: <b>${esc(d.invitations)}</b> | حداقل امتیاز: <b>${esc(d.score)}</b>\n`;
    blockPlain += `\n• ${d.date} — ${d.stream} | دعوت‌نامه: ${d.invitations} | حداقل امتیاز: ${d.score}`;
  }

  const telegram =
    `📢 <b>خلاصه هفتگی دراوهای آلبرتا (AAIP)</b>\n` +
    `<b>برنامه مهاجرت استانی آلبرتا</b> 🇨🇦\n\n` +
    `🗓 <b>هفته:</b> <code>${startISO} تا ${sundayISO}</code>\n` +
    `📊 <b>تعداد دراوها:</b> <b>${week.length}</b> | مجموع دعوت‌نامه: <b>${totalInv}</b>\n` +
    blockTg +
    `\n🔗 <a href="${link}">مشاهده جزئیات در سایت رسمی آلبرتا</a>\n\n🌐 ${SITE}`;

  return {
    program: "alberta-aaip-weekly",
    dedupKey: `alberta-week::${startISO}`,
    telegram,
    x:
      `📢 خلاصه هفتگی دراوهای آلبرتا (AAIP) 🇨🇦\nهفته ${startISO} تا ${sundayISO}\n` +
      `${week.length} دراو، مجموع ${totalInv} دعوت‌نامه\n${link}`,
    linkedin:
      `خلاصه هفتگی دراوهای آلبرتا (AAIP) — برنامه مهاجرت استانی آلبرتا 🇨🇦\n\n` +
      `هفته ${startISO} تا ${sundayISO}\nتعداد دراوها: ${week.length} | مجموع دعوت‌نامه: ${totalInv}` +
      blockPlain +
      `\n\n🔗 ${link}\n🌐 ${SITE}\n#AAIP #Alberta #مهاجرت_کانادا #سوگیموتو_ویزا`,
    igCaption:
      `خلاصه هفتگی دراوهای آلبرتا (AAIP) 🇨🇦\n\nهفته ${startISO} تا ${sundayISO}\n` +
      `تعداد دراوها: ${week.length}\nمجموع دعوت‌نامه: ${totalInv}\n\n` +
      `برای مشاوره: ${SITE}\n\n#AAIP #آلبرتا #مهاجرت_کانادا #سوگیموتو_ویزا`,
    skipInstagram: false,
    card: {
      headingLine1: "خلاصه هفتگی",
      headingLine2: "آلبرتا AAIP",
      headingLine3: "مهاجرت استانی",
      statLeft: { value: String(totalInv), label: "مجموع دعوتنامه" },
      statRight: { value: String(week.length), label: "تعداد دراو" },
      categoryFa: "خلاصه هفتگی آلبرتا",
      categoryEn: "Alberta AAIP — Weekly",
      dateText: `${startISO} → ${sundayISO}`,
    },
    record: {
      name: "Alberta AAIP (weekly)",
      crs: "",
      size: String(totalInv),
    },
  };
}

export async function collect() {
  const url = process.env.DRAWS_ALBERTA_URL || DEFAULT_URL;
  const html = await fetchText(url, { timeout: 25000 });
  const draws = parseDraws(html);
  if (!draws.length) return [];
  const item = buildWeeklyItem(draws);
  return item ? [item] : [];
}

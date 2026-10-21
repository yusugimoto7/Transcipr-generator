// Today's date for every writing prompt. Sources are often written before the change they report
// ("from January 2025 the rules will change"); read a year later that sentence is wrong, so each
// writer is told the date and to set the tense from it (Hamed's note, Oct 2026). The team's first
// zone decides the day, so a post written in the Vancouver evening is not dated tomorrow.

import { TEAM_ZONES } from "./tz.js";

export function todayIso(now = new Date()) {
  const tz = (TEAM_ZONES[0] && TEAM_ZONES[0].id) || "America/Vancouver";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function tenseRule(lang = "en") {
  const d = todayIso();
  return lang === "fa"
    ? `\n\nتاریخ امروز ${d} است. زمان فعل‌ها را از این تاریخ بگیر، نه از متن منبع: منبع ممکن است پیش از اجرای تغییر نوشته شده باشد. چیزی که تاریخش گذشته با فعل گذشته («از ژانویه ۲۰۲۵ اجرا شد»)، چیزی که الان در جریان است با حال («از … اجرا می‌شود و هنوز برقرار است»)، و فقط چیزی که هنوز نرسیده با آینده («از … اجرا خواهد شد»). عبارت‌های نسبی منبع مثل «از هفته آینده» یا «امسال» را به تاریخ واقعی برگردان. اگر تاریخ رویداد معلوم نیست، زمانی را حدس نزن.`
    : `\n\nTODAY IS ${d}. Set every verb's tense from today's date, not from the source's wording: a source is often written before the change it reports. A date already passed takes the past tense ("came into force in January 2025"), something in force now the present, and only a date still ahead the future. Turn the source's relative phrases ("next week", "this year") into the real dates. If the event's date is not known, do not guess one.`;
}

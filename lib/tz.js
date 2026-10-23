// The team works from two places, so a time is never shown as a bare clock reading. Every person
// sees times in their own device's time zone (so it follows where they are), named, and next to the
// same moment in the team's other places. The stored value is always the exact moment (ISO, UTC);
// only the text changes.

import { L, getLang } from "./i18n.js";

// `name` stays the English name for code that reads it; `fa` is what a Persian screen shows.
export const TEAM_ZONES = [
  { id: "America/Vancouver", name: "Vancouver", fa: "ونکوور" },
  { id: "Asia/Tehran", name: "Tehran", fa: "تهران" },
];

// Locale for day and month names in the chosen interface language. Persian keeps the Gregorian
// calendar so the names match the calendar grids, which are Gregorian.
export function dateLocale() {
  return getLang() === "fa" ? "fa-IR-u-ca-gregory" : "en-US";
}

export function myZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (_) {
    return "UTC";
  }
}

// "Vancouver" for a team zone, otherwise the city part of the zone's name ("Europe/Berlin" → "Berlin").
export function zoneName(id) {
  const t = TEAM_ZONES.find((z) => z.id === id);
  return t ? L(t.fa, t.name) : String(id).split("/").pop().replace(/_/g, " ");
}

function parts(date, tz, opts) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).formatToParts(date);
}

// Minutes the zone is ahead of UTC at that moment.
export function offsetMin(date, tz) {
  const p = Object.fromEntries(parts(date, tz, { hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// "PDT" / "GMT+3:30": the short name the browser gives, so summer time is never a surprise.
export function zoneAbbr(date, tz) {
  const p = parts(date, tz, { timeZoneName: "short" }).find((x) => x.type === "timeZoneName");
  return p ? p.value : "";
}

function clock(date, tz) {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}
function day(date, tz) {
  return new Intl.DateTimeFormat(dateLocale(), { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(date);
}

// The zones to show for a moment: the viewer's own first, then each team zone that is not at the
// same offset as one already listed.
export function zonesFor(date) {
  const mine = myZone();
  const out = [{ id: mine, name: zoneName(mine), mine: true }];
  for (const z of TEAM_ZONES) {
    if (out.some((o) => offsetMin(date, o.id) === offsetMin(date, z.id))) continue;
    out.push({ ...z, name: zoneName(z.id), mine: false });
  }
  return out;
}

// "Mon, Oct 19 · 9:00 AM Vancouver (PDT) · 7:30 PM Tehran". Another place's day is added only when
// it is not the same calendar day as the viewer's.
export function whenAll(iso, { withZone = true } = {}) {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date)) return "";
  const zs = zonesFor(date);
  const mineDay = day(date, zs[0].id);
  const bits = zs.map((z, i) => {
    const d = day(date, z.id);
    return `${clock(date, z.id)} ${z.name}${i === 0 && withZone ? ` (${zoneAbbr(date, z.id)})` : ""}${i > 0 && d !== mineDay ? ` (${d})` : ""}`;
  });
  return `${mineDay} · ${bits.join(" · ")}`;
}

// A datetime-local value ("2026-10-19T09:00") read in the viewer's own zone, as an ISO moment.
export function localToIso(v) {
  return v ? new Date(v).toISOString() : null;
}

// The same moment in every team zone, for the line under a time picker.
export function pickerNote(localValue) {
  if (!localValue) return "";
  const date = new Date(localValue);
  if (isNaN(date)) return "";
  const zone = `${zoneName(myZone())} (${zoneAbbr(date, myZone())})`;
  return `${L(`منطقهٔ زمانی شما: ${zone}.`, `Your time zone: ${zone}.`)} ${whenAll(date.toISOString(), { withZone: false })}`;
}

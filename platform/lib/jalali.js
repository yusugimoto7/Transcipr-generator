/**
 * Jalali (Persian / Solar Hijri) ↔ Gregorian conversion, used to check the
 * dates in certified translations against the Persian originals — a wrong
 * date of birth in a translation is a common, costly error.
 *
 * Algorithm: Kazimierz M. Borkowski's, as implemented in jalaali-js.
 */

const div = (a, b) => Math.trunc(a / b);

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm;
  let jump = 0;
  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error(`Invalid Jalali year ${jy}`);
  for (let i = 1; i < bl; i++) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4);
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(j % 1461, 4) * 5 + 308;
  const gd = div(i % 153, 5) + 1;
  const gm = (div(i, 153) % 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: (k % 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: (k % 30) + 1 };
}

export function toGregorian(jy, jm, jd) {
  return d2g(j2d(jy, jm, jd));
}

export function toJalali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

/** Persian and Arabic-Indic digits → ASCII. */
export function asciiDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
}

/** "1352/03/14", "۱۳۵۲/۳/۱۴", "1352-3-14" → { jy, jm, jd } or null. */
export function parseJalali(s) {
  const m = asciiDigits(s).match(/(1[2-4]\d\d)\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})/);
  if (!m) return null;
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
  return { jy, jm, jd };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** "1973-06-04", "04/06/1973", "June 4, 1973", "4 Jun 1973" → { gy, gm, gd } or null. */
export function parseGregorian(s) {
  const t = asciiDigits(s).trim();
  let m = t.match(/(19\d\d|20\d\d)\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})/);
  if (m) return { gy: +m[1], gm: +m[2], gd: +m[3] };
  m = t.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(19\d\d|20\d\d)/);
  if (m) return { gy: +m[3], gm: +m[2], gd: +m[1] }; // day/month/year, as in translations
  m = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(19\d\d|20\d\d)/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return { gy: +m[3], gm: MONTHS[m[1].slice(0, 3).toLowerCase()], gd: +m[2] };
  m = t.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(19\d\d|20\d\d)/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return { gy: +m[3], gm: MONTHS[m[2].slice(0, 3).toLowerCase()], gd: +m[1] };
  return null;
}

export const isoDate = ({ gy, gm, gd }) => `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;

/**
 * Does a translated date match its Jalali original?
 * @returns {{ ok: boolean, expected?: string, got?: string } | null} null when either can't be read
 */
export function checkDatePair(jalaliText, gregorianText) {
  const j = parseJalali(jalaliText);
  const g = parseGregorian(gregorianText);
  if (!j || !g) return null;
  let expected;
  try {
    expected = isoDate(toGregorian(j.jy, j.jm, j.jd));
  } catch {
    return null;
  }
  const got = isoDate(g);
  return { ok: expected === got, expected, got };
}

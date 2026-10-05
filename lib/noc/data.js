// NOC 2021 Version 1.0 lookup over the dataset built by scripts/build-noc.mjs.
import data from "./noc2021.json";

export const NOC_VERSION = data.version;
const UNITS = data.units;
const BY_CODE = new Map(UNITS.map((u) => [u.code, u]));

// TEER = second digit of the five-digit code.
export const TEER = {
  0: "Management occupations",
  1: "Usually requires a university degree",
  2: "Usually requires a college diploma or apprenticeship of 2+ years, or a supervisory role",
  3: "Usually requires a college diploma or apprenticeship under 2 years, or 6+ months of on-the-job training",
  4: "Usually requires a high school diploma or several weeks of on-the-job training",
  5: "Short-term work demonstration, no formal education",
};

// Federal Skilled Trades groups, as listed on IRCC's FST eligibility page:
// Major Groups 72 (excl. Sub-Major 726), 73, 82, 83, 92, 93 (excl. 932),
// Minor Group 6320, Unit Group 62200.
function isTrade(code) {
  const major = code.slice(0, 2);
  if (major === "72") return code.slice(0, 3) !== "726";
  if (major === "93") return code.slice(0, 3) !== "932";
  if (["73", "82", "83", "92"].includes(major)) return true;
  return code.startsWith("6320") || code === "62200";
}

export function programs(code) {
  const teer = Number(code[1]);
  const skilled = teer <= 3;
  return {
    fsw: skilled,
    cec: skilled,
    fst: isTrade(code),
  };
}

export function officialUrl(code) {
  return `https://noc.esdc.gc.ca/Structure/NOCProfile?GocTemplateCulture=en-CA&code=${code}&version=2021.0`;
}

export function getUnit(code) {
  const u = BY_CODE.get(String(code).trim());
  return u ? { ...u, programs: programs(u.code), url: officialUrl(u.code) } : null;
}

const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const stem = (w) => w.replace(/(ies)$/, "y").replace(/(s|es)$/, "");
// Whole-word containment, so "nurse" doesn't match "nursery".
const hasPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `);
const hasWordStart = (text, w) => ` ${text}`.includes(` ${w}`);

// Ranked search over code, unit title and the ~28,000 example job titles.
// Example titles carry most of the signal: applicants search by the title on
// their contract ("backend engineer"), not by StatCan's unit group name.
export function search(query, limit = 15) {
  const q = norm(query || "");
  if (!q) return [];
  if (/^\d{1,5}$/.test(q)) {
    return UNITS.filter((u) => u.code.startsWith(q)).slice(0, limit).map(summary);
  }
  const terms = q.split(" ").map(stem).filter((t) => t.length > 1);
  const scored = [];
  for (const u of UNITS) {
    const title = norm(u.title);
    let score = 0;
    let match = null;
    if (title === q) score += 100;
    else if (hasPhrase(title, q)) score += 40;
    for (const ex of u.examples) {
      const e = norm(ex);
      let s = 0;
      if (e === q) s = 80;
      else if (hasPhrase(e, q)) s = 30;
      else if (terms.every((t) => hasWordStart(e, t))) s = 15;
      if (s > 0 && (!match || s > match.s)) match = { s, title: ex };
    }
    if (match) score += match.s;
    const hits = terms.filter((t) => hasWordStart(title, t)).length;
    score += hits * 5;
    if (hits === terms.length) score += 10;
    if (score > 0) scored.push({ u, score, matched: match?.title });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ u, matched }) => ({ ...summary(u), matched: matched || null }));
}

function summary(u) {
  return { code: u.code, title: u.title, teer: u.teer, programs: programs(u.code) };
}

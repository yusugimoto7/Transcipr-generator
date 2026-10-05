// Builds lib/noc/noc2021.json from Statistics Canada's official NOC 2021
// Version 1.0 CSVs — the version IRCC uses for Express Entry.
//
//   node scripts/build-noc.mjs
//
// The dataset is committed rather than fetched at runtime: NOC 2021 V1.0 is a
// fixed release, statcan.gc.ca is slow from some hosts, and a lookup tool that
// fails because a government site is down is worse than a stale-proof file.
// Re-run only if StatCan publishes a new version that IRCC adopts.

import fs from "node:fs";
import path from "node:path";

const BASE = "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1";
const STRUCTURE = `${BASE}/noc-2021-v1.0-classification-structure.csv`;
const ELEMENTS = `${BASE}/noc-2021-v1.0-elements.csv`;
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "lib", "noc", "noc2021.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.replace(/^﻿/, "").trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || "").trim()])));
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

// StatCan's exclusion text is "Title  (See 21232 Software developers...)".
function tidy(s) {
  return s.replace(/\s+/g, " ").trim();
}

const structure = parseCsv(await get(STRUCTURE));
const elements = parseCsv(await get(ELEMENTS));

const byCode = new Map();
const groups = {};
for (const r of structure) {
  const code = r["Code - NOC 2021 V1.0"];
  if (r.Level === "5") {
    byCode.set(code, {
      code,
      title: r["Class title"],
      teer: Number(code[1]),
      lead: tidy(r["Class definition"]),
      duties: [],
      requirements: [],
      additional: [],
      examples: [],
      inclusions: [],
      exclusions: [],
    });
  } else {
    groups[code] = r["Class title"];
  }
}

const FIELD = {
  "Main duties": "duties",
  "Employment requirements": "requirements",
  "Additional information": "additional",
  "All examples": "examples",
  "Inclusion(s)": "inclusions",
  "Exclusion(s)": "exclusions",
};
for (const r of elements) {
  const unit = byCode.get(r["Code - NOC 2021 V1.0"]);
  const key = FIELD[r["Element Type Label English"]];
  if (!unit || !key) continue;
  const text = tidy(r["Element Description English"]);
  // The first "Main duties" row is a preamble, not a duty.
  if (key === "duties" && /^This group performs some or all of the following duties/i.test(text)) continue;
  if (text) unit[key].push(text);
}

// Many unit groups list duties per role ("Chefs", then "Sous-chefs", ...) but
// the CSV flattens those role headings into the duty list. An officer judges a
// letter against the role the applicant actually held, so split them back out.
// The CSV gives no marker, so this is a heuristic:
//   - a heading follows a section's last duty (which ends in ".") or opens
//     the list, has no closing punctuation, and is short;
//   - its last word names a role (matches the end of an example job title or
//     the unit title), or its first word is a plural noun;
//   - it does not open with an imperative verb seen elsewhere as a duty.
// A miss only leaves a heading inside a duty list; it never drops a duty.
const sing = (w) =>
  w.toLowerCase().replace(/[^a-z]/g, "").replace(/ies$/, "y").replace(/(ch|sh|ss|x)es$/, "$1").replace(/s$/, "");
const firstWord = (t) => t.split(/[ ,]/)[0].toLowerCase();
const lastWord = (t) => sing(t.replace(/\(.*?\)/g, "").trim().split(/\s+/).pop() || "");
const opensSection = (list, i) =>
  (i === 0 || /\.$/.test(list[i - 1])) && !/[.:]$/.test(list[i]) && list[i].split(" ").length <= 12 && i < list.length - 1;

const verbs = new Set();
for (const u of byCode.values()) {
  u.duties.forEach((t, i) => {
    const w = firstWord(t);
    if (!opensSection(u.duties, i) && (!/s$/.test(w) || /ss$/.test(w))) verbs.add(w);
  });
}

function sections(u) {
  const roles = new Set([...u.examples, u.title].map((e) => lastWord(e.replace(/ - .*$/, ""))));
  const out = [{ role: null, items: [] }];
  u.duties.forEach((t, i) => {
    if (/perform(s)? some or all of the following duties/i.test(t)) return;
    const w = firstWord(t);
    const plural = /s$/.test(w) && !/ss$/.test(w);
    const heading =
      opensSection(u.duties, i) &&
      !verbs.has(w) &&
      (roles.has(lastWord(t)) || plural || w === "other");
    if (heading) out.push({ role: t, items: [] });
    else out[out.length - 1].items.push(t);
  });
  return out.filter((s) => s.items.length);
}

const units = [...byCode.values()].map((u) => ({
  ...u,
  duties: sections(u),
  broad: groups[u.code[0]] || "",
  major: groups[u.code.slice(0, 2)] || "",
  minor: groups[u.code.slice(0, 4)] || "",
}));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: "NOC 2021 Version 1.0", source: BASE, units }));
console.log(`Wrote ${units.length} unit groups to ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);

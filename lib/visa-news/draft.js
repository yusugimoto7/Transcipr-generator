// The story text of a visa-result case, and how its pictures are grouped into stories. Shared by
// the page and the server, so a case read while the page is closed comes back ready.

// "2025/05/14" -> Date; anything else -> null.
export function day(s) {
  const m = String(s || "").match(/(20\d\d)[/.-](\d{1,2})[/.-](\d{1,2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// The lines under the pictures, in the team's format. What the team typed (`noted`) wins over what
// the pictures say; a line neither gives is left out.
export function draftText(fields, noted) {
  const f = fields || {};
  const n = noted || {};
  const sub = n.submitted || f.submitted || "";
  const app = n.approved || f.approved || f.letter_date || "";
  const a = day(sub);
  const b = day(app);
  // The team's own wording of the wait wins («۷ ماه و ۱۶ روز»); otherwise it is counted from the dates.
  const counted = a && b && b >= a ? Math.round((b - a) / 86400000) + " روز" : "";
  const waitText = String(n.wait || n.wait_days || "").trim() || counted;
  // A line the team or the pictures cannot fill is left out (Hamed, Oct 2026), not shown as «…».
  const name = n.first_name_fa || f.first_name_fa || f.first_name || "";
  const title = n.title || f.title_fa || "";
  const line = (label, v) => (v ? [`⬅️ ${label}: ${v}`] : []);
  return [
    ...(title || name ? [[title, name].filter(Boolean).join(" ")] : []),
    ...line("نوع ویزا", n.visa_type_fa || f.visa_type_fa || f.visa_type),
    ...line("اقدام از", n.applied_from),
    ...line("سن", n.age),
    ...line("تاریخ سابمیت ویزا", sub),
    ...line("مدت زمان انتظار ویزا", waitText),
    ...line("تاریخ اپرووال ویزا", app),
    ...(n.extra ? [`✅ ${String(n.extra).replace(/^✅\s*/, "")}`] : []),
  ].join("\n");
}

export function mergeFields(list) {
  const out = {};
  for (const f of list) for (const [k, v] of Object.entries(f || {})) if (v && !out[k]) out[k] = v;
  return out;
}

// Letters and timelines are paired when they come one after the other; otherwise one per story.
export function defaultGroups(scans) {
  const g = [];
  let story = 0;
  for (let i = 0; i < scans.length; i++) {
    g[i] = story;
    const a = scans[i] && scans[i].kind;
    const b = scans[i + 1] && scans[i + 1].kind;
    if (i + 1 < scans.length && a && b && a !== b && a !== "other" && b !== "other") {
      g[i + 1] = story;
      i++;
    }
    story++;
  }
  return g;
}

// One upload split into cases: nearly always one client's pictures (Hamed, Oct 2026); notes naming
// several clients share them out in order. Up to two pictures make one story.
export function splitCases(scans, clients) {
  const n = Math.max(1, Math.min((clients || []).length, scans.length));
  const own = scans.map((_, i) => Math.min(n - 1, Math.floor((i * n) / scans.length)));
  return Array.from({ length: n }, (_, k) => {
    const idx = own.map((o, i) => (o === k ? i : -1)).filter((i) => i >= 0);
    const s = idx.map((i) => scans[i]);
    const g = idx.length <= 2 ? idx.map(() => 0) : defaultGroups(s);
    const texts = {};
    for (const sn of [...new Set(g)]) texts[sn] = draftText(mergeFields(s.filter((_, j) => g[j] === sn).map((x) => x.fields)), (clients || [])[k] || (clients || [])[0]);
    return { idx, scans: s, groups: g, texts, kinds: s.map((x) => x.kind || "") };
  });
}

// Are two topic cards the same story? Used by the page to merge cards that
// were written in different runs (the server only merges within one run), so
// one story shows once, with every source that reported it.
//
// Cards carry both an English and a Persian title written by the same model,
// which makes them far more comparable than raw headlines. Guards against
// merging different developments: numbers in the titles must agree ("145
// invited" and "200 invited" are two draws), the dates must be close, and
// court decisions and newsletter items never merge.

const EN_STOP = new Set(
  "the a an and or of to in on for with at by from as is are was were be been its it this that these those new now how what why who will can may into over after before about than more most canada canadian ircc".split(" ")
);
const FA_STOP = new Set(
  "و به در از برای با که را این آن یک تا هم می شد شده است بود کرد کردند کند دیگر چه چی های ها یا اما هر".split(" ")
);

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/(\d)[,٬](?=\d{3})/g, "$1")
    .replace(/‌/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
}

function tokens(s, stop) {
  return new Set(
    norm(s)
      .split(/\s+/)
      .filter((w) => w && (w.length > 1 || /\d/.test(w)) && !stop.has(w))
  );
}

function overlap(a, b) {
  if (a.size < 3 || b.size < 3) return { shared: 0, ratio: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { shared, ratio: shared / Math.min(a.size, b.size) };
}

function numbers(t) {
  const out = new Set();
  for (const s of [t.title_en, t.title_fa]) for (const m of norm(s).match(/\d+/g) || []) out.add(m);
  return out;
}

function standsAlone(t) {
  return !!t.newsletter || t.kind === "court" || /\bv\.?\s+canada\b|\bc\.\s+canada\b/i.test(t.title_en || "");
}

export function sameTopic(a, b) {
  if (!a || !b || standsAlone(a) || standsAlone(b)) return false;
  const na = numbers(a);
  const nb = numbers(b);
  if (na.size && nb.size && ![...na].some((n) => nb.has(n))) return false;
  const da = Date.parse(a.date || "");
  const db = Date.parse(b.date || "");
  const dated = Number.isFinite(da) && Number.isFinite(db);
  if (dated && Math.abs(da - db) > 5 * 86400000) return false;
  const en = overlap(tokens(a.title_en, EN_STOP), tokens(b.title_en, EN_STOP));
  const fa = overlap(tokens(a.title_fa, FA_STOP), tokens(b.title_fa, FA_STOP));
  const strong = dated ? 0.75 : 0.85;
  // One title nearly identical, the other clearly related; or both close.
  return (
    (en.shared >= 3 && en.ratio >= strong && fa.ratio >= 0.45) ||
    (fa.shared >= 3 && fa.ratio >= strong && en.ratio >= 0.45) ||
    (en.ratio >= 0.6 && fa.ratio >= 0.6 && en.shared + fa.shared >= 7)
  );
}

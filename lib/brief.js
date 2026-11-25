// What a piece is about, decided once from its source text before anything is written (Hamed,
// Nov 25 2026, on a Lexbase item headed «Forecast – 14,702,000 Temporary Residents in 2027»: the
// script and the story were a list of the table's footnotes and never said the number; "what you
// made is entirely different from what this item is about, it went completely astray. Review the
// writing process fundamentally").
//
// Every writer had the whole source text and no word on which part of it is the point, so a source
// with long notes was retold as its notes. The brief names the point: the source's own headline
// claim with its figures, what it shows, and at most two notes that change how it is read. The
// script, the story and the other pieces are then built around it (briefBlock goes into their
// prompts). It is never a source of facts: every figure in it is checked against the source text,
// and the writers still take their facts from that text alone.

import { openaiEnabled, openaiScript } from "./openai.js";
import { getRecords, saveRecord, keyOf } from "./workspace.js";

const mem = new Map(); // topic key -> { sig, brief }
const inflight = new Map();

// The source text's fingerprint: a brief made from a text that has since changed (a table read from
// its picture, trusted pages added) is made again.
// The steps ask for the source at different lengths (4,500 to 6,000 characters of a web page), so
// the fingerprint is of its first 4,000 and of how many labelled blocks it carries, not of its end.
function sigOf(text) {
  const head = text.slice(0, 4000) + "|" + (text.match(/\[Additional source|\[TABLE OR FIGURE/g) || []).length;
  let h = 5381;
  for (let i = 0; i < head.length; i++) h = ((h << 5) + h + head.charCodeAt(i)) | 0;
  return `${head.length}:${h >>> 0}`;
}

const latin = (s) => String(s || "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const digits = (s) => latin(s).replace(/[^0-9]/g, "");
const one = (s, n = 400) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

function prompt(topic, sourceText) {
  const title = one(topic.source_title || topic.title_en || topic.title_fa, 200);
  const asked = topic.evergreen && (topic.question || topic.title_fa) ? `\nThis is an explainer: the piece answers the audience's question «${one(topic.question || topic.title_fa, 200)}». The point is the answer to it.` : "";
  const note = topic.note ? `\nThe editor's note on this topic (the angle the team wants; framing only, not a source of facts): ${one(topic.note, 600)}` : "";
  return `You are the editor of @sugimotovisa, the Instagram page of a Persian-language Canadian / European immigration firm. Before anything is written from the SOURCE TEXT below, decide what the piece is ABOUT: the one thing this source is there to say.

How to find it:
- The source's own heading and opening say what it is about. A figure, decision, answer or change named there is the main point. Example: an item headed "Forecast – 14,702,000 Temporary Residents in 2027" over a table of yearly forecasts is about the forecast and how it grows (8,038,000 in 2023 → 14,702,000 in 2027), not about the notes under the table.
- A table's figures are content: read its rows. A block marked "[TABLE OR FIGURE printed here as a picture; …]" is part of the source.
- Notes, caveats, definitions, methodology and "what this does not include" are NOT the point. They only say how to read it.
- A court decision: who asked for what, what the court decided and why. A question put to IRCC: the question and the answer. A rule change: what changes, for whom, from when.${asked}${note}

Return JSON only:
{"kind": "figure" | "decision" | "rule_change" | "answer" | "document" | "explainer" | "other",
 "point_fa": "the main point in ONE spoken Persian sentence with its key figure(s) or decision, the way the page's own stories open (e.g. «تعداد درخواست‌های اقامت موقت کانادا از ۸ میلیون در سال ۲۰۲۳ به ۱۴ میلیون و ۷۰۰ هزار در سال ۲۰۲۷ می‌رسه»)",
 "point_en": "the same in one English sentence",
 "figures": [up to 5 of the figures or dates the point rests on, each {"value": "exactly as written in the source", "what_fa": "what it counts, in Persian", "what_en": "what it counts, in English"}],
 "shows_fa": "ONE Persian sentence on what this shows or means, only as far as the source itself says or its figures plainly show; \\"\\" when it says nothing of the kind",
 "shows_en": "the same in English, or \\"\\"",
 "read_with_fa": [at most 2 short Persian notes that change how the main point is read, e.g. «این تعداد درخواست‌هاست، نه تعداد افراد»; [] when there are none],
 "read_with_en": [the same in English],
 "missing": "when the heading or the text points to a figure, table, list or attachment whose content is NOT in the text (\\"here are the projections:\\" and then nothing), say in English what is missing; else \\"\\""}

Every figure, date and name must be in the source text. Persian: the brand's spoken, everyday voice; an institution by its Persian name (اداره مهاجرت کانادا).

Card title (for orientation only, never a source of facts): ${title}

===== SOURCE TEXT =====
${sourceText.slice(0, 16000)}
===== END =====`;
}

function parse(raw, sourceText) {
  const m = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let v = null;
  try {
    v = JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1"));
  } catch (_) {
    return null;
  }
  if (!v || !one(v.point_fa)) return null;
  const src = digits(sourceText);
  const list = (x, n) => (Array.isArray(x) ? x : []).map((s) => one(s, 220)).filter(Boolean).slice(0, n);
  return {
    kind: one(v.kind, 20) || "other",
    point_fa: one(v.point_fa),
    point_en: one(v.point_en),
    // a figure the source does not hold is dropped: the brief is never a source of facts
    figures: (Array.isArray(v.figures) ? v.figures : [])
      .map((f) => ({ value: one(f && f.value, 60), what_fa: one(f && f.what_fa, 160), what_en: one(f && f.what_en, 160) }))
      .filter((f) => f.value && (digits(f.value).length < 2 || src.includes(digits(f.value))))
      .slice(0, 5),
    shows_fa: one(v.shows_fa),
    shows_en: one(v.shows_en),
    read_with_fa: list(v.read_with_fa, 2),
    read_with_en: list(v.read_with_en, 2),
    missing: one(v.missing, 300),
  };
}

// The topic's brief, made once per source text and kept (memory, then the workspace). Null when the
// text is too thin, no model is set, or the model's answer cannot be read: writing then goes on as
// it did before, without one.
export async function briefFor(topic, sourceText) {
  const text = String(sourceText || "").trim();
  if (!topic || text.length < 200 || !openaiEnabled()) return null;
  const key = keyOf(topic);
  const sig = sigOf(text);
  const hit = mem.get(key);
  if (hit && hit.sig === sig) return hit.brief;
  const flight = key + "|" + sig;
  if (inflight.has(flight)) return inflight.get(flight);
  const run = (async () => {
    const id = "brief:" + key;
    const rec = (await getRecords(id).catch(() => [])).find((r) => r.id === id);
    if (rec && rec.sig === sig && rec.brief && rec.brief.point_fa) {
      mem.set(key, { sig, brief: rec.brief });
      return rec.brief;
    }
    const brief = parse(await openaiScript(prompt(topic, text), { maxOutputTokens: 2500 }), text);
    if (!brief) return null;
    mem.set(key, { sig, brief });
    await saveRecord({ id, type: "brief", title_fa: topic.title_fa || "", title_en: topic.title_en || "", sig, brief }).catch(() => {});
    return brief;
  })()
    .catch((e) => {
      console.log("[brief] failed:", String(e?.message || e).slice(0, 160));
      return null;
    })
    .finally(() => inflight.delete(flight));
  inflight.set(flight, run);
  return run;
}

// The brief as a block for a writing prompt, in the piece's language.
export function briefBlock(brief, lang = "fa") {
  if (!brief || !brief.point_fa) return "";
  const fa = lang !== "en";
  const point = fa ? brief.point_fa : brief.point_en || brief.point_fa;
  const figs = (brief.figures || []).map((f) => `${f.value}${(fa ? f.what_fa : f.what_en || f.what_fa) ? ` (${fa ? f.what_fa : f.what_en || f.what_fa})` : ""}`).join(fa ? "؛ " : "; ");
  const shows = fa ? brief.shows_fa : brief.shows_en || brief.shows_fa;
  const notes = (fa ? brief.read_with_fa : brief.read_with_en && brief.read_with_en.length ? brief.read_with_en : brief.read_with_fa) || [];
  if (fa) {
    return `\n\n===== حرف اصلی این مطلب (پیش از نوشتن، از روی خود متن منبع مشخص شده) =====
حرف اصلی: ${point}${figs ? `\nعددها و تاریخ‌هایی که حرف اصلی روی آن‌هاست: ${figs}` : ""}${shows ? `\nچه چیزی را نشان می‌دهد: ${shows}` : ""}${notes.length ? `\nنکته‌ای که خواندن آن را عوض می‌کند: ${notes.join(" / ")}` : ""}
⛔️ مطلب را دور همین حرف اصلی بساز: در همان یکی دو جملهٔ اول، خود حرف اصلی را با عددش بگو؛ بقیه در خدمت همین است.
⛔️ قیدها، یادداشت‌ها و «چه چیزهایی در این آمار یا سند نیست» فقط بعد از حرف اصلی می‌آیند و روی هم حداکثر یکی دو جمله؛ هرگز مطلب را به فهرست قیدها و حاشیه‌های سند تبدیل نکن.
⛔️ این بخش منبع فکت نیست: هر عدد، تاریخ و نام فقط از متن منبع.${brief.missing ? `\n⚠️ متن منبع ناقص است (${brief.missing}). فقط همان را بگو که در متن هست؛ جای خالی را با حدس پر نکن.` : ""}`;
  }
  return `\n\n===== THE POINT OF THIS PIECE (decided from the source text before writing) =====
Main point: ${point}${figs ? `\nThe figures and dates it rests on: ${figs}` : ""}${shows ? `\nWhat it shows: ${shows}` : ""}${notes.length ? `\nRead it with: ${notes.join(" / ")}` : ""}
⛔️ Build the piece around this main point: state it, with its figure, in the first one or two sentences; everything else serves it.
⛔️ Caveats, notes and "what this figure or document does not cover" come only after the main point and take one or two sentences in all; never turn the piece into a list of the document's caveats and side notes.
⛔️ This block is not a source of facts: every figure, date and name still comes only from the source text.${brief.missing ? `\n⚠️ The source text is incomplete (${brief.missing}). Say only what the text holds; never fill the gap with a guess.` : ""}`;
}

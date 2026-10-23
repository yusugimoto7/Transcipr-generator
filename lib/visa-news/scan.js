// Visa results ("نتایج ویزا"): the team posts a client's approval letter and the timeline of their
// application as Instagram stories. Before anything is drawn, every picture is read here and
// what must not be seen is found: the family name (the first name stays), UCI, application,
// passport and document numbers, date of birth, address, email, phone, barcodes. Dates are
// found too, to be circled.
//
// Three layers, because a missed number is a client's private data on a public page:
//   1. OCR (tesseract) gives every word and its exact box;
//   2. a vision model, shown the picture and the numbered words, says which words are private and
//      which are the dates to mark, and where barcodes or other unreadable private marks sit;
//   3. fixed rules hide every long number, email and postal code whatever the model said.
// The page then shows every box on the picture and nothing is drawn until a person has checked it.

import os from "node:os";
import sharp from "sharp";
import OpenAI from "openai";

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_SCRIPT_MODEL || "gpt-5.6-terra";
export const MAX_VISA_IMAGES = 10;
const MAX_BYTES = 6 * 1024 * 1024;

let client = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// One OCR worker for the server's life; its English model is downloaded once into the temp folder.
let workerP = null;
async function worker() {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, { cachePath: os.tmpdir() });
    })().catch((e) => {
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

export function cleanVisaImages(list) {
  const out = [];
  for (const im of Array.isArray(list) ? list : []) {
    const url = String((im && im.data) || "");
    const m = url.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m || Math.floor((m[2].length * 3) / 4) > MAX_BYTES) continue;
    out.push({ data: url, name: String((im && im.name) || `image-${out.length + 1}`).slice(0, 80) });
    if (out.length >= MAX_VISA_IMAGES) break;
  }
  return out;
}

export function bufferOf(dataUrl) {
  return Buffer.from(String(dataUrl).split(",")[1] || "", "base64");
}

// Words with boxes in the picture's own pixels. A phone screenshot is small; OCR reads it at
// twice the size and the boxes are scaled back.
async function ocrWords(buf) {
  const meta = await sharp(buf).metadata();
  const k = meta.width < 1400 ? 2 : 1;
  const big = k > 1 ? await sharp(buf).resize({ width: meta.width * k }).png().toBuffer() : buf;
  const w = await worker();
  const { data } = await w.recognize(big, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks || [])
    for (const p of b.paragraphs || [])
      for (const [li, l] of (p.lines || []).entries())
        for (const x of l.words || []) {
          const text = String(x.text || "").trim();
          if (!text) continue;
          words.push({
            id: words.length,
            text,
            line: `${b.bbox.x0}:${p.bbox.y0}:${li}`,
            x: Math.round(x.bbox.x0 / k),
            y: Math.round(x.bbox.y0 / k),
            w: Math.round((x.bbox.x1 - x.bbox.x0) / k),
            h: Math.round((x.bbox.y1 - x.bbox.y0) / k),
          });
        }
  return { width: meta.width, height: meta.height, words };
}

const DATE_RE = /^(?:\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;
const MONTH_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?$/i;

// Rules that hide whatever the model says: identifiers are long digit runs (UCI 8-10 digits,
// application numbers with a letter in front), emails, phone numbers and Canadian postal codes.
// Words that are never private, whatever the model says and wherever a hidden name is repeated:
// the country and IRCC's own names (a model once hid every "Canada" in a letter, and the
// "Government of Canada" header), and the form number at the foot of a letter (IMM 0277…).
const NEVER = new Set(["canada", "canada.ca", "canadá", "government", "gouvernement", "of", "du", "the", "immigration", "refugees", "citizenship", "réfugiés", "citoyenneté", "ircc", "permit", "permis", "work", "study", "visitor", "visa", "temporary", "resident", "application", "uci", "date", "dear", "good", "day", "type", "validity", "document", "number", "sincerely", "approved", "imm", "gcms", "e", "f"]);
const plain = (t) => String(t || "").replace(/^[("'«]+|[)"'».,:;]+$/g, "").toLowerCase();

// "IMM 0277 (10-2025) E" and the like: the form's own number, not the client's.
function formWords(words) {
  const ids = new Set();
  for (const [i, w] of words.entries()) {
    if (plain(w.text) !== "imm") continue;
    ids.add(w.id);
    for (const n of words.slice(i + 1, i + 5)) {
      if (n.line !== w.line || !/^[(\d]|^[A-Z]{1,5}$/.test(n.text) || /\d{6,}/.test(n.text)) break;
      ids.add(n.id);
    }
  }
  return ids;
}

// An application number keeps its letters and first digit (Hamed, Oct 2026: "W3…", "VWS2…"),
// so a reader sees what kind of file it is; the rest is covered. Returns the share of the word kept.
function keepShare(text) {
  const m = String(text || "").match(/^([A-Z]{1,4}\d)(\d{4,})/i);
  return m ? m[1].length / String(text).length : 0;
}

function ruleHides(words) {
  const ids = new Set();
  for (const [i, w] of words.entries()) {
    const t = w.text.replace(/[(),.:;]+$/g, "").replace(/^[(]+/, "");
    if (DATE_RE.test(t)) continue;
    const digits = (t.match(/\d/g) || []).length;
    if (digits >= 6) ids.add(w.id);
    else if (/^[A-Z]{1,3}\d{4,}/i.test(t) || /\d{3,}-\d{3,}/.test(t)) ids.add(w.id);
    else if (/@/.test(t) && /\./.test(t)) ids.add(w.id);
    else if (/^[A-Z]\d[A-Z]$/i.test(t) && words[i + 1] && /^\d[A-Z]\d$/i.test(words[i + 1].text)) {
      ids.add(w.id);
      ids.add(words[i + 1].id);
    }
  }
  return ids;
}

// When the vision check could not run: the name after "Dear" (all but its first word), whole
// lines of capitals with two or more words (a name in the address block, all but the first),
// and the address: the line holding a postal code and the line above it.
function fallbackHides(words) {
  const ids = new Set();
  const byLine = new Map();
  for (const w of words) (byLine.get(w.line) || byLine.set(w.line, []).get(w.line)).push(w);
  const lines = [...byLine.values()];
  for (const [li, l] of lines.entries()) {
    const di = l.findIndex((w) => /^dear$/i.test(w.text));
    if (di >= 0) for (const w of l.slice(di + 2)) ids.add(w.id);
    const caps = l.filter((w) => /^[A-Z][A-Z'-]+[,:]?$/.test(w.text));
    if (caps.length >= 2 && caps.length === l.length) for (const w of l.slice(1)) ids.add(w.id);
    const hasPostal = l.some((w, i) => /^[A-Z]\d[A-Z]$/i.test(w.text) && l[i + 1] && /^\d[A-Z]\d$/i.test(l[i + 1].text));
    if (hasPostal) {
      for (const w of l) ids.add(w.id);
      if (lines[li - 1]) for (const w of lines[li - 1]) ids.add(w.id);
    }
  }
  return ids;
}

// Every date on the picture, as units of its words ("June", "18,", "2025" together).
function dateUnits(words) {
  const units = [];
  for (const [i, w] of words.entries()) {
    const t = w.text.replace(/[,.]+$/, "");
    if (DATE_RE.test(t)) units.push([w]);
    else if (MONTH_RE.test(t) && words[i + 1] && /^\d{1,2},?$/.test(words[i + 1].text) && words[i + 2] && /^20\d\d/.test(words[i + 2].text)) units.push([w, words[i + 1], words[i + 2]]);
  }
  return units.map((u) => ({ ids: u.map((w) => w.id), x: u[0].x, y: Math.min(...u.map((w) => w.y)), h: Math.max(...u.map((w) => w.h)) }));
}

const SUBMIT_RE = /submission|submitted/i;
const SENT_RE = /confirmation of online application/i; // the same day, used only when no submission row is read
const ANSWER_RE = /approv|decision|passport request|final|copr|eligib/i;

// Only two dates are marked (Hamed, Oct 2026): when the application went in and when the answer
// came. In a timeline those are the "Date sent" of the submission row and of the approval /
// decision row — the left-most date in that row, never "Date read". On a letter, its own date
// (the first one on the page). The OCR splits a table into columns, so a row is found by height.
function markedDates(words) {
  const units = dateUnits(words);
  if (!units.length) return new Set();
  const rowText = (u) => words.filter((w) => Math.abs(w.y + w.h / 2 - (u.y + u.h / 2)) < u.h * 0.7).map((w) => w.text).join(" ");
  const pick = (re) => {
    const rows = units.filter((u) => re.test(rowText(u)));
    if (!rows.length) return null;
    // The earliest submission and the latest answer are the ones that matter.
    const row = re === ANSWER_RE ? rows[0] : rows[rows.length - 1];
    const same = units.filter((u) => Math.abs(u.y - row.y) < row.h * 0.7).sort((a, b) => a.x - b.x);
    return same[0];
  };
  const chosen = [pick(SUBMIT_RE) || pick(SENT_RE), pick(ANSWER_RE)].filter(Boolean);
  if (!chosen.length) chosen.push(units.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0]);
  return new Set(chosen.flatMap((u) => u.ids));
}

function prompt(words, extra = "") {
  const lines = new Map();
  for (const w of words) (lines.get(w.line) || lines.set(w.line, []).get(w.line)).push(`${w.id}:${w.text}`);
  return `This picture is from an immigration consultancy's client file: an IRCC (Canada) letter, an approval, or a screenshot of the application's timeline ("Messages about your application"). It will be posted publicly as a "visa approved" story, so the client's private data must be hidden.

The OCR words of the picture, one line per text line, as id:word:
${[...lines.values()].map((l) => l.join("  ")).join("\n").slice(0, 14000)}

Decide, looking at the picture itself as well as the words:
- "hide": ids of every word that is private: the client's FAMILY NAME (surname) wherever it appears, any other person's full name, UCI / client ID, application number, file / document / passport / permit numbers, date of birth, home address lines (street, unit, city with postal code), postal code, email, phone number, and any reference number. KEEP the client's FIRST (given) name visible.
  NEVER hide: the word "Canada" anywhere (in "Government of Canada", "remain in Canada", "coming to Canada", "Citizenship Canada", the Canada logo), "Gouvernement du Canada", IRCC's own names, the letter's wording, links, the visa / permit type, the dates, or the form number printed at the foot of the letter (e.g. "IMM 0277 (10-2025) E").
- "dates": ids of ONLY two dates: the date the application was submitted and the date the answer came. In a timeline: the "Date sent" of the "Submission Confirmation" row and of the approval / decision row ("Approval Letter", "Original Passport Request", "Decision"); never the "Date read" column or other rows. On a letter: the letter's own date only (not validity or expiry). Every word of a date (e.g. "June", "18,", "2025") is listed.
- "regions": private things the words do not cover — a barcode, a QR code, a photo of a person, a signature, a handwritten number, a number the OCR missed — as boxes in fractions of the picture (x, y, w, h between 0 and 1), generous rather than tight.
- "kind": "letter", "timeline" or "other".
- "fields", read only from the picture (empty when it does not say): "first_name" (the client's given name, in English letters as written), "first_name_fa" (the same name in Persian letters), "title_fa" («سرکار خانم» if the first name is a woman's name, «جناب آقای» if a man's — judge from the name itself, most clients are Iranian; empty if the name could be either), "visa_type" (as written), "visa_type_fa" (a short Persian name for it, e.g. «ورک پرمیت همسر», «ویزای توریستی (ویزیتوری)», «تمدید ورک پرمیت», «پرمیت تحصیلی»), "letter_date", "submitted" (the date the application was submitted, e.g. "Submission Confirmation" in a timeline), "approved" (the approval date: the letter's date, or "Original Passport Request" / approval in a timeline), all dates as YYYY/MM/DD.

${extra}
Answer with JSON only:
{"kind":"","hide":[],"dates":[],"regions":[{"x":0,"y":0,"w":0,"h":0,"why":""}],"fields":{}}`;
}

function parseJson(text) {
  const m = String(text || "").replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// Neighbouring words on one line become one box, with a margin so no letter edge shows.
function boxesOf(words, ids, kind, pad) {
  const chosen = words.filter((w) => ids.has(w.id));
  const out = [];
  for (const w of chosen) {
    const last = out[out.length - 1];
    if (last && last.line === w.line && w.x - (last.x + last.w) < Math.max(w.h, last.h) * 1.2) {
      const x2 = Math.max(last.x + last.w, w.x + w.w);
      const y2 = Math.max(last.y + last.h, w.y + w.h);
      last.x = Math.min(last.x, w.x);
      last.y = Math.min(last.y, w.y);
      last.w = x2 - last.x;
      last.h = y2 - last.y;
      last.label += " " + w.text;
    } else out.push({ line: w.line, x: w.x, y: w.y, w: w.w, h: w.h, label: w.text, kind });
  }
  return out.map(({ line, ...b }) => ({ ...b, x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }));
}

// One picture: its size, the proposed boxes (hide / date) and what it says.
// `note`: the team's correction for this picture ("also mark the final decision date", "the
// passport number at the bottom is still showing"); it is followed over the usual choices.
export async function scanVisaImage(image, { note = "" } = {}) {
  const buf = bufferOf(image.data);
  const { width, height, words } = await ocrWords(buf);
  let out = null;
  try {
    const resp = await openai().responses.create({
      model: VISION_MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt(words, await extraFor(note)) }, { type: "input_image", image_url: image.data, detail: "high" }] }],
      max_output_tokens: 4000,
    });
    out = parseJson(resp.output_text);
  } catch (e) {
    console.log("[visa-news] vision check failed:", String(e?.message || e).slice(0, 200));
  }
  const hide = ruleHides(words);
  for (const id of (out && out.hide) || []) if (words[Number(id)]) hide.add(Number(id));
  if (!out) for (const id of fallbackHides(words)) hide.add(id);
  // A surname the model found is hidden wherever else it appears in the picture too.
  const form = formWords(words);
  const keep = (w) => form.has(w.id) || (NEVER.has(plain(w.text)) && !(w.text.match(/\d/g) || []).length);
  for (const w of words) if (keep(w)) hide.delete(w.id);
  const hiddenNames = new Set(words.filter((w) => hide.has(w.id) && /^[A-Za-z][A-Za-z'-]{2,}$/.test(plain(w.text))).map((w) => plain(w.text)));
  for (const w of words) if (!keep(w) && hiddenNames.has(plain(w.text))) hide.add(w.id);
  // Only the part of an application number after its letters and first digit is covered.
  for (const w of words) {
    const k = hide.has(w.id) ? keepShare(plain(w.text).toUpperCase()) : 0;
    if (k) Object.assign(w, { x: w.x + Math.round(w.w * k + w.h * 0.5), w: Math.round(w.w * (1 - k) - w.h * 0.5), partial: true });
  }
  // The fixed rule decides which dates are marked; the model's choice only when the rule finds none.
  let dates = new Set([...markedDates(words)].filter((id) => !hide.has(id)));
  // A correction from the team decides the dates when the model followed it.
  if (note && out && Array.isArray(out.dates) && out.dates.length) dates = new Set(out.dates.map(Number).filter((id) => words[id] && !hide.has(id)));
  if (!dates.size) dates = new Set(((out && out.dates) || []).map(Number).filter((id) => words[id] && !hide.has(id)));

  const pad = Math.max(3, Math.round(Math.min(width, height) * 0.006));
  const boxes = [...boxesOf(words, hide, "hide", pad), ...boxesOf(words, dates, "date", Math.round(pad * 1.5))];
  for (const r of (out && Array.isArray(out.regions) ? out.regions : []).slice(0, 8)) {
    const x = Number(r.x), y = Number(r.y), w = Number(r.w), h = Number(r.h);
    if (![x, y, w, h].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || w <= 0 || h <= 0) continue;
    boxes.push({ kind: "hide", x: Math.round(x * width), y: Math.round(y * height), w: Math.round(w * width), h: Math.round(h * height), label: String(r.why || "region").slice(0, 60) });
  }
  return {
    name: image.name,
    width,
    height,
    kind: (out && out.kind) || "other",
    fields: (out && out.fields && typeof out.fields === "object" ? out.fields : {}) || {},
    boxes: boxes.map((b, i) => ({ id: i, ...b, on: true })),
    checked: !!out,
  };
}

async function extraFor(note) {
  const { lessonsBlock } = await import("../learning.js");
  const taught = await lessonsBlock("visa").catch(() => "");
  const n = String(note || "").trim().slice(0, 800);
  return `${taught}${n ? `\n\nTHE TEAM'S NOTE FOR THIS PICTURE (follow it over the usual choices above, except never uncover a private number, name or address):\n${n}\n` : ""}`;
}

export async function scanVisaImages(images, onOne = () => {}) {
  const out = [];
  // One at a time: the OCR worker is single, and the vision calls stay within rate limits.
  for (const im of images) {
    try {
      out.push(await scanVisaImage(im));
    } catch (e) {
      out.push({ name: im.name, error: String(e?.message || e).slice(0, 200), boxes: [] });
    }
    onOne(out.length);
  }
  return out;
}

// What the team typed about the client(s): the timeline, visa type, age, where they applied from.
// It fills the story lines the pictures cannot (the title and the age never come from a picture)
// and wins over what was read from them. One client per story, in the order written.
export async function readVisaNotes(notes) {
  const text = String(notes || "").trim().slice(0, 3000);
  if (!text) return [];
  const { openaiScript } = await import("../openai.js");
  const raw = await openaiScript(`An immigration consultancy's team wrote these notes (usually Persian) about one or more clients whose visas were approved, to be posted as "visa result" stories:

"""
${text}
"""

For each client, in the order the notes give them, take ONLY what the notes state (leave a field empty when they do not say it; never guess):
- "title": «سرکار خانم» for a woman, «جناب آقای» for a man, or the exact phrase the notes use (e.g. «جناب آقای غلامرضا و همسر محترم» goes into title + first_name). When the notes give only the name, judge from the first name itself (most clients are Iranian: زینت, مریم → «سرکار خانم»; غلامرضا, علی → «جناب آقای»); empty if the name could be either
- "first_name_fa": the first name in Persian letters, as the notes write it
- "visa_type_fa": the visa type in short Persian (e.g. «ورک پرمیت همسر worker», «ویزای توریستی (ویزیتوری)»)
- "applied_from": «خارج از کانادا» or «داخل کانادا» if stated
- "age": the age as a number
- "submitted", "approved": dates as YYYY/MM/DD (convert a Persian-digit or Jalali date only if the notes give the Gregorian date; otherwise copy it as written)
- "wait": the waiting time exactly as the notes write it (e.g. «۷ ماه و ۱۶ روز», «35 روز»), if they state it
- "extra": any other line the notes ask to show (e.g. «با سابقه یکبار ریجکتی، ورک پرمیت همراه!»), else ""

Answer with JSON only: {"clients":[{"title":"","first_name_fa":"","visa_type_fa":"","applied_from":"","age":"","submitted":"","approved":"","wait":"","extra":""}]}`, { maxOutputTokens: 1500 });
  const out = parseJson(raw);
  return Array.isArray(out && out.clients) ? out.clients.slice(0, 10) : [];
}

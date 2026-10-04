import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { CLIENT_SECTIONS, CONFIRM_TEXT } from './clientForm';
import { filledRows } from './schema';
import { getAppType } from './appTypes';

/**
 * The client's submitted questionnaire (the firm's Forms 124 and 128) as a
 * PDF for the client's Drive folder: every question the client was asked, in
 * English and Persian, with their answer, and their signed confirmation.
 *
 * Persian is drawn with Vazirmatn (public/fonts, SIL Open Font License):
 * fontkit joins the letters and lays out a Persian run right to left; numbers
 * and English words inside Persian text are laid out as runs of their own, so
 * they read left to right.
 */

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const PERSIAN = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const PERSIAN_LETTER = /[ء-يٮ-ۓۺ-ۿﭐ-﷿ﹰ-﻿]/;
// A left-to-right run: Latin letters or digits (either script), with what can sit between them.
const LTR_RUN = /\(?[A-Za-z0-9۰-۹٠-٩](?:[A-Za-z0-9۰-۹٠-٩.,:/\-+@_'#&]|\s(?=[A-Za-z0-9۰-۹٠-٩]))*\)?/g;

const PAGE = { w: 595, h: 842, margin: 50 };
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.82, 0.84, 0.87);

/** Text in display order: [{ text, rtl }] runs, left to right on the page. */
function runs(text) {
  const s = String(text ?? '');
  const out = [];
  let last = 0;
  for (const m of s.matchAll(LTR_RUN)) {
    // A bracket belongs to the run only as a pair: "(Unit 4)" yes, the ")" of "(کد 1234)" no.
    let t = m[0];
    if (t.startsWith('(') && !t.endsWith(')')) t = t.slice(1);
    const start = m.index + m[0].indexOf(t);
    if (t.endsWith(')') && !t.startsWith('(')) t = t.slice(0, -1);
    if (start > last) out.push({ text: s.slice(last, start), rtl: true });
    out.push({ text: t, rtl: false });
    last = start + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last), rtl: true });
  // A run with no Persian letter (spaces, punctuation) follows the paragraph.
  const rtlPara = isRtl(s);
  const logical = out.map((r) => (r.rtl && !PERSIAN_LETTER.test(r.text) ? { ...r, rtl: rtlPara } : r));
  return rtlPara ? logical.reverse() : logical;
}

const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '«': '»', '»': '«', '<': '>', '>': '<' };
/**
 * What to draw for one run, left to right. fontkit lays a Persian run out right
 * to left but doesn't mirror brackets, so they are swapped here; and it would
 * also reverse Persian digits, so in a left-to-right run each digit is drawn
 * on its own.
 */
function pieces(r) {
  if (r.rtl) return [r.text.replace(/[()[\]«»<>]/g, (c) => MIRROR[c])];
  return r.text.split(/([\u06F0-\u06F9\u0660-\u0669])/).filter((x) => x !== '');
}

/** Right-to-left when the first strong letter is Persian. */
const isRtl = (s) => {
  const m = String(s ?? '').match(/[A-Za-zء-يٮ-ۓۺ-ۿ]/);
  return Boolean(m && PERSIAN_LETTER.test(m[0]));
};

export async function renderClientFormPdf(app) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(await fs.readFile(path.join(FONT_DIR, 'Vazirmatn-Regular.ttf')), { subset: true });
  const bold = await doc.embedFont(await fs.readFile(path.join(FONT_DIR, 'Vazirmatn-Bold.ttf')), { subset: true });
  const who = [app.data?.givenName, app.data?.familyName].filter(Boolean).join(' ') || app.title || '';
  doc.setTitle(`Client Questionnaire - ${who}`);
  doc.setProducer('Canada Visa Platform');

  const width = (t, font, size) => runs(t).reduce((w, r) => w + font.widthOfTextAtSize(r.text, size), 0);
  const maxW = PAGE.w - PAGE.margin * 2;
  let page;
  let y;
  const newPage = () => {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - PAGE.margin;
  };
  const room = (h) => {
    if (y - h < PAGE.margin + 20) newPage();
  };
  /** One line, aligned left or right, laid out run by run. */
  const line = (t, { font = regular, size = 10, color = INK, align = 'left', x0 = PAGE.margin, w = maxW } = {}) => {
    let x = align === 'right' ? x0 + w - width(t, font, size) : x0;
    for (const r of runs(t)) {
      for (const piece of pieces(r)) {
        if (piece.trim()) page.drawText(piece, { x, y, size, font, color });
        x += font.widthOfTextAtSize(piece, size);
      }
    }
  };
  /** Word-wrap in logical order. */
  const wrap = (t, font, size, w = maxW) => {
    const out = [];
    for (const para of String(t ?? '').split(/\n/)) {
      let cur = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && width(next, font, size) > w) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const para = (t, opts = {}) => {
    const size = opts.size || 10;
    const lead = opts.lead || size * 1.55;
    const align = opts.align || (isRtl(t) ? 'right' : 'left');
    for (const l of wrap(t, opts.font || regular, size, opts.w || maxW)) {
      room(lead);
      line(l, { ...opts, size, align });
      y -= lead;
    }
  };
  const rule = () => {
    page.drawLine({ start: { x: PAGE.margin, y: y + 4 }, end: { x: PAGE.w - PAGE.margin, y: y + 4 }, thickness: 0.6, color: RULE });
  };

  newPage();
  const content = questionnaireContent(app);
  // Header: the title in both languages, then who, which file, when.
  line(content.title.en, { font: bold, size: 18 });
  line(content.title.fa, { font: bold, size: 18, align: 'right' });
  y -= 30;
  for (const [k, v] of content.header) {
    line(`${k}:`, { font: bold, size: 10, color: MUTED });
    line(String(v || '—'), { size: 10, x0: PAGE.margin + 70, w: maxW - 70 });
    y -= 16;
  }
  y -= 6;

  for (const s of content.sections) {
    room(48);
    y -= 8;
    line(s.en, { font: bold, size: 13 });
    line(s.fa, { font: bold, size: 13, align: 'right' });
    y -= 8;
    rule();
    y -= 14;
    for (const item of s.items) {
      room(34);
      // The question in English (left) and Persian (right), then the answer.
      const half = maxW / 2 - 6;
      const enLines = wrap(item.en, regular, 8.5, half);
      const faLines = wrap(item.fa, regular, 8.5, half);
      for (let i = 0; i < Math.max(enLines.length, faLines.length); i++) {
        room(12);
        if (enLines[i]) line(enLines[i], { size: 8.5, color: MUTED, w: half });
        if (faLines[i]) line(faLines[i], { size: 8.5, color: MUTED, align: 'right', x0: PAGE.margin + maxW / 2 + 6, w: half });
        y -= 12;
      }
      if (item.rows) {
        if (!item.rows.length) para('—', { size: 10.5, align: 'left' });
        for (const r of item.rows) para(r, { size: 10, align: 'left' });
      } else para(item.answer || '—', { size: 10.5, font: bold });
      y -= 6;
    }
  }

  // The client's confirmation, as they signed it.
  const c = content.confirmation;
  room(120);
  y -= 8;
  line('Confirmation', { font: bold, size: 13 });
  line('تأیید', { font: bold, size: 13, align: 'right' });
  y -= 8;
  rule();
  y -= 14;
  para(c.en, { size: 9.5, align: 'left' });
  para(c.fa, { size: 9.5, align: 'right' });
  y -= 4;
  if (c.signed) {
    para(c.signed, { size: 10, font: bold, align: 'left' });
    para(c.date, { size: 9, color: MUTED, align: 'left' });
  } else para('Not yet confirmed by the client.', { size: 10, color: MUTED, align: 'left' });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: PAGE.w - PAGE.margin - regular.widthOfTextAtSize(t, 8), y: 28, size: 8, font: regular, color: MUTED });
    p.drawText(`Client Questionnaire — ${who}`, { x: PAGE.margin, y: 28, size: 8, font: regular, color: MUTED });
  });
  return doc.save();
}

const vancouver = (iso) => `${new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' })} (Vancouver)`;

/**
 * What the PDF and the Word file show, in order: the header, each section with
 * every question the client was asked (English, Persian, the answer; a list as
 * one line per row) and the signed confirmation.
 */
export function questionnaireContent(app) {
  const f = app.clientForm || {};
  const a = f.answers || {};
  const who = [app.data?.givenName, app.data?.familyName].filter(Boolean).join(' ') || app.title || '';
  const optLabel = (field, v) => {
    if (typeof v === 'boolean') return v ? 'Yes — بله' : 'No — خیر';
    const o = (field.options || []).find((x) => x.v === v);
    return o ? (o.en && o.fa && o.en !== o.fa ? `${o.en} — ${o.fa}` : o.en || o.fa) : String(v ?? '');
  };
  const value = (field, v) => {
    if (v == null || v === '' || (Array.isArray(v) && !filledRows(v).length)) return '';
    if (field.type === 'yesno' || field.options || typeof v === 'boolean') return optLabel(field, v);
    return String(v);
  };
  const sections = CLIENT_SECTIONS.map((s) => ({
    en: s.en,
    fa: s.fa,
    items: s.fields
      .filter((x) => !x.show || x.show(a))
      .map((field) =>
        field.type === 'rows'
          ? {
              en: field.en,
              fa: field.fa,
              rows: filledRows(a[field.id]).map((r, i) => `${i + 1}. ${field.columns.map((c) => [c.en, value(c, r[c.id])]).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join('  ·  ')}`),
            }
          : { en: field.en, fa: field.fa, answer: value(field, a[field.id]) }
      ),
  })).filter((s) => s.items.length);
  const c = f.confirmation;
  return {
    who,
    title: { en: 'Client Questionnaire', fa: 'پرسشنامه موکل' },
    header: [
      ['Client', who],
      ['File', [app.clientNumber, getAppType(app.type)?.title || app.type].filter(Boolean).join(' · ')],
      ['Submitted', f.submittedAt ? vancouver(f.submittedAt) : 'Not submitted yet'],
    ],
    sections,
    confirmation: {
      en: c?.text?.en || CONFIRM_TEXT.en,
      fa: c?.text?.fa || CONFIRM_TEXT.fa,
      signed: c ? `Signed (typed name): ${c.name}` : '',
      date: c ? `Date: ${vancouver(c.at)}${c.ip ? ` · IP ${c.ip}` : ''}` : '',
    },
  };
}

/** File name of the stored copy: "Client Questionnaire - Arman Rezaei.pdf" (or .docx). */
export function clientFormFilename(app, ext = 'pdf') {
  const who = [app.data?.givenName, app.data?.familyName].filter(Boolean).join(' ') || app.title || 'Client';
  return `Client Questionnaire - ${who.replace(/[\\/:*?"<>|]/g, '-')}.${ext}`;
}

/** The keys of the stored PDF and Word copies among the file's generated files. */
export const CLIENT_FORM_KEY = 'client-questionnaire';
export const CLIENT_FORM_DOCX_KEY = 'client-questionnaire-docx';

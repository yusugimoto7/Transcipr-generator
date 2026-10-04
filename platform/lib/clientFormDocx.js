import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, Footer, PageNumber } from 'docx';
import { questionnaireContent } from './clientFormPdf';

/**
 * The client's submitted questionnaire as a Word file, with the same content
 * as the PDF (lib/clientFormPdf.js). Persian paragraphs are right-to-left
 * (Word lays out the letters, numbers and English words itself), so the team
 * can edit or copy from it.
 */

const PERSIAN = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
const firstStrongPersian = (s) => {
  const m = String(s ?? '').match(/[A-Za-zء-يٮ-ۓۺ-ۿ]/);
  return Boolean(m && PERSIAN.test(m[0]));
};
const FONT = { ascii: 'Calibri', hAnsi: 'Calibri', cs: 'Tahoma' };
const MUTED = '6B7280';

/** A paragraph that runs right to left when the text is Persian. */
function p(text, { size = 20, bold = false, color, after = 60, before = 0, align, border } = {}) {
  const rtl = firstStrongPersian(text);
  return new Paragraph({
    ...(rtl ? { bidirectional: true } : {}),
    // A right-to-left paragraph starts at the right by itself (Word and LibreOffice read "left"/"right" differently there).
    ...(rtl && !align ? {} : { alignment: align || AlignmentType.LEFT }),
    spacing: { after, before },
    ...(border ? { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB', space: 2 } } } : {}),
    children: String(text ?? '')
      .split('\n')
      .map((t, i) => new TextRun({ text: t, bold, boldComplexScript: bold, size, sizeComplexScript: size, color, font: FONT, ...(rtl ? { rightToLeft: true } : {}), ...(i ? { break: 1 } : {}) })),
  });
}

export async function renderClientFormDocx(app) {
  const c = questionnaireContent(app);
  const children = [
    p(c.title.en, { size: 36, bold: true, after: 0 }),
    p(c.title.fa, { size: 36, bold: true, after: 200 }),
    ...c.header.map(([k, v]) => new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: `${k}: `, bold: true, color: MUTED, size: 20, font: FONT }), new TextRun({ text: String(v || '—'), size: 20, font: FONT })],
    })),
  ];
  for (const s of c.sections) {
    children.push(p(s.en, { size: 26, bold: true, before: 280, after: 0 }));
    children.push(p(s.fa, { size: 26, bold: true, after: 120, border: true }));
    for (const item of s.items) {
      children.push(p(item.en, { size: 17, color: MUTED, before: 100, after: 0 }));
      children.push(p(item.fa, { size: 17, color: MUTED, after: 20 }));
      if (item.rows) {
        if (!item.rows.length) children.push(p('—', { size: 21 }));
        for (const r of item.rows) children.push(p(r, { size: 20, align: AlignmentType.LEFT }));
      } else children.push(p(item.answer || '—', { size: 21, bold: true }));
    }
  }
  children.push(p('Confirmation', { size: 26, bold: true, before: 320, after: 0 }));
  children.push(p('تأیید', { size: 26, bold: true, after: 120, border: true }));
  children.push(p(c.confirmation.en, { size: 19 }));
  children.push(p(c.confirmation.fa, { size: 19, after: 120 }));
  if (c.confirmation.signed) {
    children.push(p(c.confirmation.signed, { size: 20, bold: true }));
    children.push(p(c.confirmation.date, { size: 18, color: MUTED }));
  } else children.push(p('Not yet confirmed by the client.', { size: 20, color: MUTED }));

  const doc = new Document({
    creator: 'Canada Visa Platform',
    title: `Client Questionnaire - ${c.who}`,
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `Client Questionnaire — ${c.who} · Page `, size: 16, color: MUTED, font: FONT }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED, font: FONT })],
          })],
        }),
      },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

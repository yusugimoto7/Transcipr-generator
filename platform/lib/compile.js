import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Compile a package: merge section content (generated docs + uploaded files) into
 * one PDF with a Table of Contents and a numbered divider page per section, in the
 * exact order/names of the firm's sample packages.
 *
 * sections: [{ name, items: [{ bytes: Buffer, mime: string, filename?: string }] }]
 * Empty sections (no items) are skipped. Returns Uint8Array (PDF bytes).
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 64;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);

async function addNotePage(doc, font, message) {
  const p = doc.addPage([PAGE_W, PAGE_H]);
  p.drawText('Document', { x: MARGIN, y: PAGE_H - MARGIN, size: 12, font, color: MUTED });
  wrapText(p, font, message, MARGIN, PAGE_H - MARGIN - 40, 11, PAGE_W - MARGIN * 2, INK);
}

function wrapText(page, font, text, x, y, size, maxWidth, color) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y: cy, size, font, color });
      line = w;
      cy -= size + 4;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: cy, size, font, color });
  return cy;
}

async function addContent(doc, font, item) {
  const { bytes, mime, filename } = item;
  if (mime === 'application/pdf') {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
      const pages = await doc.copyPages(src, src.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
      return;
    } catch {
      await addNotePage(doc, font, `"${filename}" could not be embedded automatically; include it manually.`);
      return;
    }
  }
  if (mime === 'image/jpeg' || mime === 'image/png') {
    try {
      const img = mime === 'image/jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      const page = doc.addPage([PAGE_W, PAGE_H]);
      const maxW = PAGE_W - MARGIN * 2;
      const maxH = PAGE_H - MARGIN * 2;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      page.drawImage(img, {
        x: (PAGE_W - img.width * s) / 2,
        y: (PAGE_H - img.height * s) / 2,
        width: img.width * s,
        height: img.height * s,
      });
      return;
    } catch {
      await addNotePage(doc, font, `Image "${filename}" could not be embedded.`);
      return;
    }
  }
  await addNotePage(
    doc,
    font,
    `"${filename}" was uploaded as ${mime} (e.g. a Word file) and must be added to this package manually.`
  );
}

export async function compilePackage(title, sections) {
  const included = sections.filter((s) => s.items && s.items.length);

  // Pass 1: build the body (divider + content per section), recording start pages.
  const body = await PDFDocument.create();
  const bodyBold = await body.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await body.embedFont(StandardFonts.Helvetica);
  const marks = [];
  for (let i = 0; i < included.length; i++) {
    const sec = included[i];
    marks.push({ name: sec.name, start: body.getPageCount() }); // divider index (0-based)
    const dp = body.addPage([PAGE_W, PAGE_H]);
    dp.drawText(`${i + 1})`, { x: MARGIN, y: PAGE_H / 2 + 20, size: 22, font: bodyBold, color: INK });
    wrapText(dp, bodyBold, sec.name, MARGIN, PAGE_H / 2 - 12, 22, PAGE_W - MARGIN * 2, INK);
    for (const item of sec.items) await addContent(body, bodyFont, item);
  }

  // Pass 2: final doc = TOC page(s) + body pages.
  const final = await PDFDocument.create();
  const bold = await final.embedFont(StandardFonts.HelveticaBold);
  const font = await final.embedFont(StandardFonts.Helvetica);
  const perPage = 30;
  const tocPageCount = Math.max(1, Math.ceil(included.length / perPage));
  const tocPages = [];
  for (let i = 0; i < tocPageCount; i++) tocPages.push(final.addPage([PAGE_W, PAGE_H]));

  const bodyPages = await final.copyPages(body, body.getPageIndices());
  bodyPages.forEach((p) => final.addPage(p));

  // Draw TOC.
  tocPages[0].drawText(title, { x: MARGIN, y: PAGE_H - MARGIN, size: 20, font: bold, color: INK });
  tocPages[0].drawText('Contents', { x: MARGIN, y: PAGE_H - MARGIN - 30, size: 14, font: bold, color: INK });
  let y = PAGE_H - MARGIN - 60;
  let tp = 0;
  included.forEach((s, i) => {
    if (y < MARGIN) {
      tp = Math.min(tp + 1, tocPages.length - 1);
      y = PAGE_H - MARGIN;
    }
    const page = tocPages[tp];
    const finalPageNum = tocPageCount + marks[i].start + 1; // 1-based page of the divider
    const label = `${i + 1})  ${s.name}`;
    page.drawText(label, { x: MARGIN, y, size: 11, font, color: INK });
    page.drawText(String(finalPageNum), { x: PAGE_W - MARGIN - 24, y, size: 11, font, color: INK });
    // dotted leader
    const labelW = font.widthOfTextAtSize(label, 11);
    const dotsStart = MARGIN + labelW + 6;
    const dotsEnd = PAGE_W - MARGIN - 30;
    if (dotsEnd > dotsStart) {
      page.drawText('.'.repeat(Math.max(0, Math.floor((dotsEnd - dotsStart) / 3))), {
        x: dotsStart,
        y,
        size: 11,
        font,
        color: MUTED,
      });
    }
    y -= 22;
  });

  return final.save();
}

/**
 * Package definitions — exact section order and names from the firm's samples.
 * Each section maps to a generated document (generatedKey) or an uploaded
 * document category. Sections with no content are skipped at compile time.
 */
export const PACKAGES = {
  'client-info': {
    title: 'Client Information',
    filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Curriculum Vitae', category: 'cv' },
      { name: 'Education Certificates and Transcripts', category: 'transcripts' },
      { name: 'Certificates', category: 'certificates' },
      { name: 'Job Offer and Work Experiences', category: 'job-offer' },
      { name: 'Birth Certificate and National Identity Card', category: 'national-id' },
      { name: 'Flight Ticket', category: 'flight' },
      { name: 'Accommodation Arrangement', category: 'accommodation' },
    ],
  },
  'financial-proof': {
    title: 'Financial Support Proof',
    filename: 'Financial Support Proof.pdf',
    sections: [
      { name: 'Financial Cover Letter', generatedKey: 'financial-cover-letter' },
      { name: 'Financial Summary Report', generatedKey: 'financial-summary' },
      { name: 'Deposit Payment Confirmation', category: 'deposit' },
      { name: 'Bank Statements', category: 'proof-of-funds' },
      { name: 'Source of Funds', category: 'source-of-funds' },
      { name: 'Affidavit of Financial Support', category: 'affidavit-support' },
      { name: 'Title Deeds', category: 'title-deeds' },
    ],
  },
};

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Compile a submission package: merge section content (generated docs + uploaded
 * files) into one PDF with a title block, Table of Contents (with nested a/b/c
 * sub-sections), numbered divider pages, and "Page N of M" footers — matching
 * the firm's sample "Client Information" and "Financial Support Proof" files.
 *
 * sections: [{ name, items: [...], children?: [{ name, items: [...] }] }]
 *   item: { bytes, mime, filename?, keepPages? }
 * Sections/children with no items are skipped.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 64;
const INK = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);

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

async function addNotePage(doc, font, message) {
  const p = doc.addPage([PAGE_W, PAGE_H]);
  p.drawText('Document', { x: MARGIN, y: PAGE_H - MARGIN, size: 12, font, color: MUTED });
  wrapText(p, font, message, MARGIN, PAGE_H - MARGIN - 40, 11, PAGE_W - MARGIN * 2, INK);
}

async function addContent(doc, font, item) {
  const { bytes, mime, filename, keepPages } = item;
  if (mime === 'application/pdf') {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
      let pages = src.getPages();
      if (Array.isArray(keepPages) && keepPages.length) {
        pages = keepPages.filter((n) => n >= 1 && n <= pages.length).map((n) => src.getPage(n - 1));
      }
      // Embed via each page's CropBox (what viewers display) and normalize to Letter.
      const boxes = pages.map((p) => {
        const cb = p.getCropBox();
        return { left: cb.x, bottom: cb.y, right: cb.x + cb.width, top: cb.y + cb.height };
      });
      const embedded = await doc.embedPages(pages, boxes);
      for (const ep of embedded) {
        const page = doc.addPage([PAGE_W, PAGE_H]);
        const scale = Math.min(PAGE_W / ep.width, PAGE_H / ep.height);
        const w = ep.width * scale;
        const h = ep.height * scale;
        page.drawPage(ep, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
      }
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

export async function compilePackage(title, applicantName, sections) {
  // Keep sections that have content of their own or in a child.
  const included = sections
    .map((s) => ({ ...s, children: (s.children || []).filter((c) => c.items && c.items.length) }))
    .filter((s) => (s.items && s.items.length) || s.children.length);

  // Pass 1: body (divider per top-level section, then its content, then each
  // child's content) recording TOC marks.
  const body = await PDFDocument.create();
  const bodyBold = await body.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await body.embedFont(StandardFonts.Helvetica);
  const marks = []; // { label, page(0-based in body), level }

  for (let i = 0; i < included.length; i++) {
    const sec = included[i];
    marks.push({ label: `${i + 1}) ${sec.name}`, page: body.getPageCount(), level: 0 });
    const dp = body.addPage([PAGE_W, PAGE_H]);
    dp.drawText(`${i + 1})`, { x: MARGIN, y: PAGE_H / 2 + 20, size: 22, font: bodyBold, color: INK });
    wrapText(dp, bodyBold, sec.name, MARGIN, PAGE_H / 2 - 12, 22, PAGE_W - MARGIN * 2, INK);
    for (const item of sec.items || []) await addContent(body, bodyFont, item);
    let letter = 97; // 'a'
    for (const child of sec.children) {
      marks.push({
        label: `${String.fromCharCode(letter++)}) ${child.name}`,
        page: body.getPageCount(),
        level: 1,
      });
      for (const item of child.items) await addContent(body, bodyFont, item);
    }
  }

  // Pass 2: final = TOC pages + body.
  const perPage = 26;
  const tocPageCount = Math.max(1, Math.ceil((marks.length + 4) / perPage));
  const final = await PDFDocument.create();
  const bold = await final.embedFont(StandardFonts.HelveticaBold);
  const font = await final.embedFont(StandardFonts.Helvetica);
  const tocPages = [];
  for (let i = 0; i < tocPageCount; i++) tocPages.push(final.addPage([PAGE_W, PAGE_H]));
  const bodyPages = await final.copyPages(body, body.getPageIndices());
  bodyPages.forEach((p) => final.addPage(p));

  // Title block (centered), like the samples: "Client Information" / applicant name.
  const w1 = bold.widthOfTextAtSize(title, 16);
  tocPages[0].drawText(title, { x: (PAGE_W - w1) / 2, y: PAGE_H - MARGIN - 4, size: 16, font: bold, color: INK });
  if (applicantName) {
    const w2 = bold.widthOfTextAtSize(applicantName, 14);
    tocPages[0].drawText(applicantName, { x: (PAGE_W - w2) / 2, y: PAGE_H - MARGIN - 26, size: 14, font: bold, color: INK });
  }
  tocPages[0].drawText('Contents', { x: MARGIN, y: PAGE_H - MARGIN - 64, size: 13, font: bold, color: INK });

  // TOC entries with dotted leaders; children indented like "a) ...".
  let y = PAGE_H - MARGIN - 94;
  let tp = 0;
  for (const m of marks) {
    if (y < MARGIN + 30) {
      tp = Math.min(tp + 1, tocPages.length - 1);
      y = PAGE_H - MARGIN;
    }
    const page = tocPages[tp];
    const x = MARGIN + (m.level ? 26 : 0);
    const pageNum = tocPageCount + m.page + 1; // 1-based page in the final doc
    const numStr = String(pageNum);
    const numW = font.widthOfTextAtSize(numStr, 11);
    page.drawText(m.label, { x, y, size: 11, font, color: INK });
    page.drawText(numStr, { x: PAGE_W - MARGIN - numW, y, size: 11, font, color: INK });
    const labelW = font.widthOfTextAtSize(m.label, 11);
    const dotsStart = x + labelW + 6;
    const dotsEnd = PAGE_W - MARGIN - numW - 6;
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
  }

  // "Page N of M" footer on every page (as in the samples).
  const total = final.getPageCount();
  final.getPages().forEach((p, i) => {
    const s = `Page ${i + 1} of ${total}`;
    const w = font.widthOfTextAtSize(s, 9);
    p.drawText(s, { x: (PAGE_W - w) / 2, y: 24, size: 9, font, color: MUTED });
  });

  return final.save();
}

/**
 * Package definitions modelled on the firm's sample TOCs. Sections appear only
 * when documents exist for them. `supporter` marks the section whose name gets
 * the sponsor relation appended (e.g. "My Supporter's Documents (My Father)").
 */
export const PACKAGES = {
  'client-info': {
    title: 'Client Information',
    filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Curriculum Vitae', category: 'cv' },
      { name: 'Degree Certificate and Transcripts', category: 'transcripts' },
      { name: 'Employment Letter', category: 'employment-letter' },
      { name: 'Job Offer Letter', category: 'job-offer' },
      { name: 'Leave of Absence Letter', category: 'leave-of-absence' },
      { name: 'Internship Certificate', category: 'internship' },
      { name: 'Certificates', category: 'certificates' },
      { name: 'Ties to Home Country', category: 'ties-docs' },
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
      {
        name: 'My Bank Statement',
        category: 'proof-of-funds',
        children: [{ name: 'Source of My Money', category: 'source-of-funds' }],
      },
      { name: 'My Title Deeds', category: 'title-deeds' },
      {
        name: "My Supporter's Documents",
        supporter: true,
        children: [
          { name: 'Affidavit of Financial Support', category: 'affidavit-support' },
          { name: 'Bank Statements', category: 'supporter-bank' },
          { name: 'Pay Slips / Employment Letter', category: 'supporter-income' },
          { name: 'Title Deeds', category: 'supporter-deeds' },
          { name: 'Birth Certificate / National ID', category: 'supporter-id' },
        ],
      },
    ],
  },
};

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

// Pictures (rendered scan pages, photos) are placed inside this box: a small
// margin all round and a clear band at the bottom for the "Page N of M" footer.
const PIC_MARGIN = 18;
const FOOTER_BAND = 40;

// Add one item's pages to the package. Returns true on success; false means the
// item could NOT be embedded — the caller reports it to the applicant instead
// of shipping a placeholder page inside a file meant for a visa officer.
//
// Two kinds of item:
//   { kind: 'picture', buffer, width, height }  a JPEG page picture (uploads)
//   { mime: 'application/pdf', bytes }           a PDF the platform generated
// Uploaded PDFs never reach here as PDFs — they're rendered to pictures first
// (see lib/packageDocs.js), which is what makes cropping impossible.
async function addContent(doc, font, item) {
  if (item.kind === 'picture') {
    try {
      const img = await doc.embedJpg(item.buffer);
      const boxW = PAGE_W - PIC_MARGIN * 2;
      const boxH = PAGE_H - PIC_MARGIN - FOOTER_BAND;
      const s = Math.min(boxW / img.width, boxH / img.height);
      const w = img.width * s;
      const h = img.height * s;
      const page = doc.addPage([PAGE_W, PAGE_H]);
      page.drawImage(img, {
        x: (PAGE_W - w) / 2,
        y: FOOTER_BAND + (boxH - h) / 2,
        width: w,
        height: h,
      });
      return true;
    } catch {
      return false;
    }
  }
  const { bytes, mime } = item;
  if (mime === 'application/pdf') {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
      const embedded = await doc.embedPages(src.getPages());
      for (const ep of embedded) {
        // Generated documents are Letter portrait already; fit defensively.
        const s = Math.min(PAGE_W / ep.width, PAGE_H / ep.height);
        const w = ep.width * s;
        const h = ep.height * s;
        const page = doc.addPage([PAGE_W, PAGE_H]);
        page.drawPage(ep, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
      }
      return true;
    } catch {
      return false;
    }
  }
  // Unsupported type (e.g. .docx) — never emit a placeholder page.
  return false;
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
  const skipped = []; // filenames that could not be embedded

  for (let i = 0; i < included.length; i++) {
    const sec = included[i];
    const dividerIdx = body.getPageCount();
    const secMarkIdx = marks.length;
    marks.push({ label: `${i + 1}) ${sec.name}`, page: dividerIdx, level: 0 });
    const dp = body.addPage([PAGE_W, PAGE_H]);
    dp.drawText(`${i + 1})`, { x: MARGIN, y: PAGE_H / 2 + 20, size: 22, font: bodyBold, color: INK });
    wrapText(dp, bodyBold, sec.name, MARGIN, PAGE_H / 2 - 12, 22, PAGE_W - MARGIN * 2, INK);
    for (const item of sec.items || []) {
      if (!(await addContent(body, bodyFont, item))) skipped.push(item.filename || 'document');
    }
    let letter = 97; // 'a'
    for (const child of sec.children) {
      const childStart = body.getPageCount();
      for (const item of child.items) {
        if (!(await addContent(body, bodyFont, item))) skipped.push(item.filename || 'document');
      }
      // Only list the child in the TOC if something was actually embedded.
      if (body.getPageCount() > childStart) {
        marks.push({
          label: `${String.fromCharCode(letter++)}) ${child.name}`,
          page: childStart,
          level: 1,
        });
      }
    }
    // Every item in this section failed: drop the orphan divider and its marks.
    if (body.getPageCount() === dividerIdx + 1) {
      body.removePage(dividerIdx);
      marks.splice(secMarkIdx);
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

  return { bytes: await final.save(), skipped };
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
    // `catchAll: true` collects any uploaded document that belongs to this
    // package but wasn't matched by an earlier section, so nothing is lost.
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'PAL / PAL Exemption', categories: ['pal'] },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Language Test Result', categories: ['language'] },
      { name: 'Employment Letter', categories: ['employment-letter'] },
      { name: 'Job Offer Letter', categories: ['job-offer'] },
      { name: 'Leave of Absence Letter', categories: ['leave-of-absence'] },
      { name: 'Internship Certificate', categories: ['internship'] },
      { name: 'Certificates', categories: ['certificates'] },
      { name: 'Ties to Home Country', categories: ['ties-docs'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Flight Ticket', categories: ['flight'] },
      { name: 'Accommodation Arrangement', categories: ['accommodation'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  'financial-proof': {
    title: 'Financial Support Proof',
    filename: 'Financial Support Proof.pdf',
    sections: [
      { name: 'Financial Cover Letter', generatedKey: 'financial-cover-letter' },
      { name: 'Financial Summary Report', generatedKey: 'financial-summary' },
      { name: 'Deposit Payment Confirmation', categories: ['deposit', 'gic'] },
      {
        name: 'My Bank Statement',
        categories: ['proof-of-funds'],
        children: [{ name: 'Source of My Money', categories: ['source-of-funds'] }],
      },
      { name: 'My Title Deeds', categories: ['title-deeds'] },
      {
        name: "My Supporter's Documents",
        supporter: true,
        children: [
          { name: 'Affidavit of Financial Support', categories: ['affidavit-support'] },
          { name: 'Bank Statements', categories: ['supporter-bank'] },
          { name: 'Pay Slips / Employment Letter', categories: ['supporter-income'] },
          { name: 'Title Deeds', categories: ['supporter-deeds'] },
          { name: 'Birth Certificate / National ID', categories: ['supporter-id'] },
        ],
      },
    ],
  },
};

/** Categories that belong to each package (used for the catch-all section). */
export const PACKAGE_CATEGORIES = {
  'client-info': [
    'pal', 'cv', 'transcripts', 'language', 'employment-letter', 'job-offer',
    'leave-of-absence', 'internship', 'certificates', 'ties-docs', 'national-id',
    'military', 'police-clearance', 'flight', 'accommodation', 'sop', 'other',
  ],
  'financial-proof': [
    'deposit', 'gic', 'proof-of-funds', 'source-of-funds', 'title-deeds',
    'affidavit-support', 'supporter-bank', 'supporter-income', 'supporter-deeds',
    'supporter-id',
  ],
};

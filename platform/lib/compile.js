import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
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

/**
 * Compile a package without ever holding it in memory.
 *
 * A client file can hold 100+ scans — several hundred page pictures. Building
 * the whole PDF in pdf-lib keeps every page in memory several times over
 * (pictures, body, final copy, saved bytes), which exhausted the server.
 * Instead: lay the package out first (page counts only), then write it in
 * small parts of at most PART_PAGES pages — each part built, saved to disk and
 * released — and join the parts with poppler's `pdfunite`. Page pictures can
 * be buffers or files on disk (`file`), so the caller needn't hold them either.
 *
 * sections: [{ name, items: [...], children?: [{ name, items: [...] }] }]
 *   item: { kind: 'picture', buffer | file, width, height, filename }
 *         { mime: 'application/pdf', bytes, filename }   (generated letters)
 * opts: outPath — write the package there and return { path, pages, skipped }
 *       (otherwise the bytes are returned); onProgress(pagesDone, pagesTotal).
 */

const PART_PAGES = 40;

// Pictures (rendered scan pages, photos) are placed inside this box: a small
// margin all round and a clear band at the bottom for the "Page N of M" footer.
const PIC_MARGIN = 18;
const FOOTER_BAND = 40;

const isJpeg = (b) => b && b.length >= 3 && b[0] === 0xff && b[1] === 0xd8;

async function pictureBytes(item) {
  return item.buffer || fs.readFile(item.file);
}

/**
 * Page count of an item, or 0 when it can't be embedded — the caller reports
 * it to the applicant instead of shipping a placeholder page inside a file
 * meant for a visa officer. Uploaded PDFs never arrive here as PDFs: they are
 * rendered to pictures first (lib/packageDocs.js), which makes cropping impossible.
 */
async function pageCount(item) {
  if (item.kind === 'picture') {
    try {
      if (item.buffer) return isJpeg(item.buffer) ? 1 : 0;
      const fh = await fs.open(item.file, 'r');
      const head = Buffer.alloc(3);
      await fh.read(head, 0, 3, 0);
      await fh.close();
      return isJpeg(head) ? 1 : 0;
    } catch {
      return 0;
    }
  }
  if (item.mime === 'application/pdf') {
    try {
      const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
      return src.getPageCount();
    } catch {
      return 0;
    }
  }
  return 0; // unsupported type (e.g. .docx)
}

function footer(page, font, n, total) {
  const s = `Page ${n} of ${total}`;
  const w = font.widthOfTextAtSize(s, 9);
  page.drawText(s, { x: (PAGE_W - w) / 2, y: 24, size: 9, font, color: MUTED });
}

async function drawBlock(doc, fonts, block) {
  if (block.type === 'divider') {
    const dp = doc.addPage([PAGE_W, PAGE_H]);
    dp.drawText(`${block.number})`, { x: MARGIN, y: PAGE_H / 2 + 20, size: 22, font: fonts.bold, color: INK });
    wrapText(dp, fonts.bold, block.name, MARGIN, PAGE_H / 2 - 12, 22, PAGE_W - MARGIN * 2, INK);
    return [dp];
  }
  const item = block.item;
  if (item.kind === 'picture') {
    const img = await doc.embedJpg(await pictureBytes(item));
    const boxW = PAGE_W - PIC_MARGIN * 2;
    const boxH = PAGE_H - PIC_MARGIN - FOOTER_BAND;
    const sc = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * sc;
    const h = img.height * sc;
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawImage(img, { x: (PAGE_W - w) / 2, y: FOOTER_BAND + (boxH - h) / 2, width: w, height: h });
    return [page];
  }
  const src = await PDFDocument.load(item.bytes, { ignoreEncryption: true, throwOnInvalidObject: false });
  const embedded = await doc.embedPages(src.getPages());
  return embedded.map((ep) => {
    // Generated documents are Letter portrait already; fit defensively.
    const sc = Math.min(PAGE_W / ep.width, PAGE_H / ep.height);
    const w = ep.width * sc;
    const h = ep.height * sc;
    const page = doc.addPage([PAGE_W, PAGE_H]);
    page.drawPage(ep, { x: (PAGE_W - w) / 2, y: (PAGE_H - h) / 2, width: w, height: h });
    return page;
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} failed: ${err.slice(0, 300)}`))));
  });
}

export async function compilePackage(title, applicantName, sections, { outPath = null, onProgress = () => {}, plain = false } = {}) {
  // 1. Layout: which items embed, and where every page will fall.
  const skipped = []; // filenames that could not be embedded
  const blocks = []; // { type: 'divider' | 'item', pages, ... } in body order
  const marks = []; // { label, page (0-based in body), level }
  let bodyPages = 0;
  let number = 0;
  for (const sec of sections) {
    const own = [];
    for (const item of sec.items || []) {
      const n = await pageCount(item);
      if (n) own.push({ type: 'item', item, pages: n });
      else skipped.push(item.filename || 'document');
    }
    const kids = [];
    for (const child of sec.children || []) {
      const its = [];
      for (const item of child.items || []) {
        const n = await pageCount(item);
        if (n) its.push({ type: 'item', item, pages: n });
        else skipped.push(item.filename || 'document');
      }
      if (its.length) kids.push({ name: child.name, blocks: its });
    }
    // A section with nothing that embeds gets no divider and no TOC entry.
    if (!own.length && !kids.length) continue;
    if (plain) {
      // A single document for its own portal slot: just its pages, in order.
      for (const b of [...own, ...kids.flatMap((k) => k.blocks)]) {
        blocks.push(b);
        bodyPages += b.pages;
      }
      continue;
    }
    number++;
    marks.push({ label: `${number}) ${sec.name}`, page: bodyPages, level: 0 });
    blocks.push({ type: 'divider', number, name: sec.name, pages: 1 });
    bodyPages += 1;
    for (const b of own) {
      blocks.push(b);
      bodyPages += b.pages;
    }
    let letter = 97; // 'a'
    for (const k of kids) {
      marks.push({ label: `${String.fromCharCode(letter++)}) ${k.name}`, page: bodyPages, level: 1 });
      for (const b of k.blocks) {
        blocks.push(b);
        bodyPages += b.pages;
      }
    }
  }

  const perPage = 26;
  const tocPageCount = plain ? 0 : Math.max(1, Math.ceil((marks.length + 4) / perPage));
  const total = tocPageCount + bodyPages;

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'package-'));
  try {
    const parts = [];
    // 2. Table of contents (title block, dotted leaders, children indented).
    if (!plain) {
    const toc = await PDFDocument.create();
    const tBold = await toc.embedFont(StandardFonts.HelveticaBold);
    const tFont = await toc.embedFont(StandardFonts.Helvetica);
    const tocPages = [];
    for (let i = 0; i < tocPageCount; i++) tocPages.push(toc.addPage([PAGE_W, PAGE_H]));
    const w1 = tBold.widthOfTextAtSize(title, 16);
    tocPages[0].drawText(title, { x: (PAGE_W - w1) / 2, y: PAGE_H - MARGIN - 4, size: 16, font: tBold, color: INK });
    if (applicantName) {
      const w2 = tBold.widthOfTextAtSize(applicantName, 14);
      tocPages[0].drawText(applicantName, { x: (PAGE_W - w2) / 2, y: PAGE_H - MARGIN - 26, size: 14, font: tBold, color: INK });
    }
    tocPages[0].drawText('Contents', { x: MARGIN, y: PAGE_H - MARGIN - 64, size: 13, font: tBold, color: INK });
    let y = PAGE_H - MARGIN - 94;
    let tp = 0;
    for (const m of marks) {
      if (y < MARGIN + 30) {
        tp = Math.min(tp + 1, tocPages.length - 1);
        y = PAGE_H - MARGIN;
      }
      const page = tocPages[tp];
      const x = MARGIN + (m.level ? 26 : 0);
      const numStr = String(tocPageCount + m.page + 1); // 1-based page in the final doc
      const numW = tFont.widthOfTextAtSize(numStr, 11);
      page.drawText(m.label, { x, y, size: 11, font: tFont, color: INK });
      page.drawText(numStr, { x: PAGE_W - MARGIN - numW, y, size: 11, font: tFont, color: INK });
      const dotsStart = x + tFont.widthOfTextAtSize(m.label, 11) + 6;
      const dotsEnd = PAGE_W - MARGIN - numW - 6;
      if (dotsEnd > dotsStart) {
        page.drawText('.'.repeat(Math.max(0, Math.floor((dotsEnd - dotsStart) / 3))), { x: dotsStart, y, size: 11, font: tFont, color: MUTED });
      }
      y -= 22;
    }
    tocPages.forEach((p, i) => footer(p, tFont, i + 1, total));
    parts.push(path.join(dir, 'part-000.pdf'));
    await fs.writeFile(parts[0], await toc.save());
    }

    // 3. The body, in parts of at most PART_PAGES pages, each released once saved.
    let doc = null;
    let fonts = null;
    let written = 0;
    const flush = async () => {
      if (!doc) return;
      const file = path.join(dir, `part-${String(parts.length + 1).padStart(3, '0')}.pdf`);
      await fs.writeFile(file, await doc.save());
      parts.push(file);
      doc = null;
    };
    for (const block of blocks) {
      if (!doc) {
        doc = await PDFDocument.create();
        fonts = { bold: await doc.embedFont(StandardFonts.HelveticaBold), regular: await doc.embedFont(StandardFonts.Helvetica) };
      }
      const pages = await drawBlock(doc, fonts, block);
      for (const p of pages) {
        ++written;
        if (!plain) footer(p, fonts.regular, tocPageCount + written, total);
      }
      onProgress(written, bodyPages);
      if (doc.getPageCount() >= PART_PAGES) await flush();
    }
    await flush();

    // 4. Join the parts.
    const out = path.join(dir, 'package.pdf');
    if (!parts.length) throw new Error('nothing to write');
    if (parts.length === 1) await fs.copyFile(parts[0], out);
    else await run('pdfunite', [...parts, out]);

    if (outPath) {
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.copyFile(out, outPath);
      return { path: outPath, pages: total, skipped };
    }
    return { bytes: await fs.readFile(out), pages: total, skipped };
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Package layouts live in the application-type registry (lib/appTypes.js).
export { packagesFor as getPackages, packageCategories } from './appTypes';

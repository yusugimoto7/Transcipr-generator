// Geometry regression test for package compilation.
//
// Builds a corpus of nasty-but-realistic inputs (landscape pages, /Rotate
// flags, offset CropBoxes, shifted MediaBox origins, oversized and tiny
// pages, photos with EXIF rotation, PNG with transparency, WEBP), compiles
// them into a package, renders the result, and checks that every page's
// content arrived COMPLETE: a border drawn around each source page must be
// present on all four sides in the output, and landscape sources must still
// be landscape.
//
//   node test/geometry.test.mjs
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import sharp from 'sharp';
import { loadLib } from './_load.mjs';

const { prepareDocument } = await loadLib('packageDocs.js');
const { compilePackage } = await loadLib('compile.js');

const BORDER = 6; // pt, thick enough to survive JPEG + downscaling

// ---------- corpus ----------------------------------------------------------

// Draw a test page in the given box (page coordinates): white fill, thick
// black border inset 8pt, and a label. `box` = {x, y, w, h}.
function paint(page, font, box, label) {
  const inset = 8;
  page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: rgb(1, 1, 1) });
  page.drawRectangle({
    x: box.x + inset,
    y: box.y + inset,
    width: box.w - inset * 2,
    height: box.h - inset * 2,
    borderColor: rgb(0, 0, 0),
    borderWidth: BORDER,
  });
  page.drawText(label, { x: box.x + 30, y: box.y + box.h - 40, size: 14, font, color: rgb(0, 0, 0) });
}

async function pdfCase(name, build) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  await build(doc, font);
  return { name, mime: 'application/pdf', bytes: Buffer.from(await doc.save()) };
}

async function imageCase(name, mime, make) {
  return { name, mime, bytes: await make() };
}

// A raster test image: white with a thick black border.
async function borderImage(w, h, fmt, extra = (s) => s) {
  const t = Math.max(8, Math.round(Math.min(w, h) * 0.02));
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="white"/>
    <rect x="${t}" y="${t}" width="${w - 2 * t}" height="${h - 2 * t}" fill="none" stroke="black" stroke-width="${t}"/>
  </svg>`;
  let s = sharp(Buffer.from(svg));
  s = extra(s);
  if (fmt === 'jpeg') return s.jpeg({ quality: 90 }).toBuffer();
  if (fmt === 'png') return s.png().toBuffer();
  if (fmt === 'webp') return s.webp().toBuffer();
  throw new Error(fmt);
}

async function buildCorpus() {
  const cases = [];
  // expect: 'landscape' | 'portrait' — orientation of the content as a viewer shows it.
  const add = (c, expect) => cases.push({ ...c, expect });

  add(await pdfCase('landscape MediaBox, no /Rotate', async (d, f) => {
    const p = d.addPage([842, 595]);
    paint(p, f, { x: 0, y: 0, w: 842, h: 595 }, 'A landscape');
  }), 'landscape');

  add(await pdfCase('portrait MediaBox + /Rotate 90 (scanner landscape)', async (d, f) => {
    const p = d.addPage([595, 842]);
    paint(p, f, { x: 0, y: 0, w: 595, h: 842 }, 'B rotate90');
    p.setRotation(degrees(90));
  }), 'landscape');

  add(await pdfCase('portrait MediaBox + /Rotate 270', async (d, f) => {
    const p = d.addPage([595, 842]);
    paint(p, f, { x: 0, y: 0, w: 595, h: 842 }, 'C rotate270');
    p.setRotation(degrees(270));
  }), 'landscape');

  add(await pdfCase('portrait MediaBox + /Rotate 180', async (d, f) => {
    const p = d.addPage([595, 842]);
    paint(p, f, { x: 0, y: 0, w: 595, h: 842 }, 'D rotate180');
    p.setRotation(degrees(180));
  }), 'portrait');

  add(await pdfCase('landscape MediaBox + /Rotate 90 (shows portrait)', async (d, f) => {
    const p = d.addPage([842, 595]);
    paint(p, f, { x: 0, y: 0, w: 842, h: 595 }, 'E land+rot90');
    p.setRotation(degrees(90));
  }), 'portrait');

  add(await pdfCase('CropBox offset inside a larger MediaBox', async (d, f) => {
    const p = d.addPage([1000, 800]);
    // Junk outside the crop box that a viewer must NOT show.
    p.drawRectangle({ x: 0, y: 0, width: 1000, height: 800, color: rgb(0.5, 0.5, 0.5) });
    paint(p, f, { x: 150, y: 100, w: 700, h: 600 }, 'F cropbox');
    p.setCropBox(150, 100, 700, 600);
  }), 'landscape');

  add(await pdfCase('MediaBox with non-zero origin', async (d, f) => {
    const p = d.addPage([842, 595]);
    p.setMediaBox(100, 100, 842, 595); // origin (100,100)
    paint(p, f, { x: 100, y: 100, w: 842, h: 595 }, 'G origin');
  }), 'landscape');

  add(await pdfCase('A3 landscape (oversized)', async (d, f) => {
    const p = d.addPage([1190, 842]);
    paint(p, f, { x: 0, y: 0, w: 1190, h: 842 }, 'H A3');
  }), 'landscape');

  add(await pdfCase('tiny page (business-card size)', async (d, f) => {
    const p = d.addPage([200, 120]);
    paint(p, f, { x: 0, y: 0, w: 200, h: 120 }, 'I');
  }), 'landscape');

  add(await pdfCase('portrait Letter (control)', async (d, f) => {
    const p = d.addPage([612, 792]);
    paint(p, f, { x: 0, y: 0, w: 612, h: 792 }, 'J control');
  }), 'portrait');

  add(await imageCase('landscape JPEG 3000x2000', 'image/jpeg', () => borderImage(3000, 2000, 'jpeg')), 'landscape');
  add(await imageCase('portrait PNG with transparency', 'image/png', () =>
    borderImage(1200, 1600, 'png')), 'portrait');
  add(await imageCase('JPEG with EXIF orientation 6 (stored landscape, shows portrait)', 'image/jpeg', () =>
    borderImage(2000, 1500, 'jpeg', (s) => s.withMetadata({ orientation: 6 }))), 'portrait');
  add(await imageCase('WEBP landscape', 'image/webp', () => borderImage(1600, 900, 'webp')), 'landscape');

  // Scanner-app style: a full-page JPEG image object, page stored portrait
  // with /Rotate 90 so viewers show it landscape (CamScanner / phone scans).
  add(await pdfCase('scanner-style JPEG XObject page + /Rotate 90', async (d) => {
    const jpg = await d.embedJpg(await borderImage(2480, 3508, 'jpeg'));
    const p = d.addPage([595, 842]);
    p.drawImage(jpg, { x: 0, y: 0, width: 595, height: 842 });
    p.setRotation(degrees(90));
  }), 'landscape');

  // Same, landscape image placed on a landscape page with an offset CropBox
  // (what "auto-crop" scanners write).
  add(await pdfCase('scanner-style landscape JPEG + CropBox trim', async (d) => {
    const jpg = await d.embedJpg(await borderImage(3508, 2480, 'jpeg'));
    const p = d.addPage([900, 650]);
    p.drawImage(jpg, { x: 29, y: 27, width: 842, height: 595 });
    p.setCropBox(29, 27, 842, 595);
  }), 'landscape');

  // Blank-page drop: 3 pages, middle one empty → expect 2 pages out.
  add(await pdfCase('blank middle page (should be dropped)', async (d, f) => {
    const p1 = d.addPage([612, 792]);
    paint(p1, f, { x: 0, y: 0, w: 612, h: 792 }, 'K1');
    d.addPage([612, 792]);
    const p3 = d.addPage([612, 792]);
    paint(p3, f, { x: 0, y: 0, w: 612, h: 792 }, 'K3');
  }), 'portrait');
  cases[cases.length - 1].expectPages = 2;

  return cases;
}

// ---------- checks ----------------------------------------------------------

function render(pdfPath, dir, dpi = 60) {
  const r = spawnSync('pdftoppm', ['-r', String(dpi), '-png', '-gray', pdfPath, path.join(dir, 'o')]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
}

async function analyze(pngPath, dpi = 60) {
  // Ignore the compiler's own "Page N of M" footer band (40pt) so it can't
  // stretch the content bounding box.
  const meta = await sharp(pngPath).metadata();
  const footerPx = Math.floor((40 / 72) * dpi) - 2;
  const { data, info } = await sharp(pngPath)
    .extract({ left: 0, top: 0, width: meta.width, height: meta.height - footerPx })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const dark = (x, y) => data[(y * W + x) * C] < 128;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark(x, y)) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { empty: true };
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  // Coverage of dark pixels along each edge of the content bbox (a few px in).
  const band = 3;
  const cov = (pts) => pts.filter(([x, y]) => {
    for (let dx = -band; dx <= band; dx++) for (let dy = -band; dy <= band; dy++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && dark(xx, yy)) return true;
    }
    return false;
  }).length / pts.length;
  const xs = Array.from({ length: bw }, (_, i) => minX + i);
  const ys = Array.from({ length: bh }, (_, i) => minY + i);
  return {
    empty: false,
    bw, bh, W, H,
    top: cov(xs.map((x) => [x, minY])),
    bottom: cov(xs.map((x) => [x, maxY])),
    left: cov(ys.map((y) => [minX, y])),
    right: cov(ys.map((y) => [maxX, y])),
    touchesEdge: minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1,
  };
}

// ---------- run ---------------------------------------------------------------

const cases = await buildCorpus();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-'));

// Prepare every case (no AI: fixRotation off so the test is deterministic).
const items = [];
const perCase = [];
for (const c of cases) {
  const prep = await prepareDocument({ bytes: c.bytes, mime: c.mime }, { cleanPages: true, fixRotation: false });
  perCase.push({ c, pages: prep.pages.length, dropped: prep.dropped });
  for (const p of prep.pages) items.push({ kind: 'picture', ...p, filename: c.name, _case: c });
}
const out = await compilePackage('Geometry Test', 'Corpus', [{ name: 'All cases', items, children: [] }]);
const outPdf = path.join(tmp, 'out.pdf');
await fs.writeFile(outPdf, out.bytes);
render(outPdf, tmp);
const pages = (await fs.readdir(tmp)).filter((f) => /^o-\d+\.png$/.test(f)).sort();

// Output layout: [TOC, divider, content...]
let fail = 0;
let idx = 2;
console.log(`\n${'CASE'.padEnd(62)} pages  top  bot  left right  shape   result`);
for (const { c, pages: n, dropped } of perCase) {
  const want = c.expectPages ?? 1;
  let line = `${c.name.padEnd(62)} ${String(n).padStart(2)}/${want}`;
  let ok = n === want;
  for (let k = 0; k < n; k++) {
    const a = await analyze(path.join(tmp, pages[idx++]));
    if (a.empty) { line += '  EMPTY'; ok = false; continue; }
    const shape = a.bw > a.bh ? 'landscape' : 'portrait';
    const edgesOk = a.top > 0.97 && a.bottom > 0.97 && a.left > 0.97 && a.right > 0.97;
    const shapeOk = shape === c.expect;
    ok = ok && edgesOk && shapeOk && !a.touchesEdge;
    line += `  ${a.top.toFixed(2)} ${a.bottom.toFixed(2)} ${a.left.toFixed(2)} ${a.right.toFixed(2)}  ${shape.padEnd(9)}`;
  }
  line += ok ? ' PASS' : ' FAIL';
  if (!ok) fail++;
  console.log(line);
}
console.log(`\noutput: ${outPdf} (${(out.bytes.length / 1024).toFixed(0)} KB, ${pages.length} pages)`);
console.log(fail ? `\n${fail} case(s) FAILED` : '\nALL CASES PASS');
process.exit(fail ? 1 : 0);

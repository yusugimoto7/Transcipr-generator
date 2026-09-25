import fs from 'fs/promises';
import { completeJson } from '../ai';

/**
 * Decide how each scanned page must be rotated to sit upright, by *looking* at
 * a thumbnail of it with a vision model.
 *
 * Tesseract's OSD is trained mainly on Latin script and misjudges Persian /
 * Arabic documents (the common case here), so orientation is decided visually.
 *
 * Thumbnails are rendered by pdftoppm, which already applies each page's
 * /Rotate flag — so the angle returned here is ADDITIONAL to that flag.
 *
 * Best-effort: any failure yields no rotation for the affected pages.
 */

const BATCH = 8; // pages per vision request
const MAX_PAGES = 120; // safety cap per document

const SYSTEM = `You inspect scanned document pages and report how each one must be
rotated to be upright and readable. Many pages are Persian/Arabic, Iranian
official documents (certificates, transcripts, ID booklets, bank statements).
Judge orientation from the text baselines, headers, stamps and page layout —
NOT from the language. A page is "upright" when its text reads normally without
tilting your head.`;

function instructionFor(pageNumbers) {
  return `You are given ${pageNumbers.length} page image(s), in order, for pages
${pageNumbers.join(', ')}.

For EACH image, decide the CLOCKWISE rotation in degrees needed to make it
upright: 0, 90, 180 or 270.
 - 0   = already upright
 - 180 = upside down
 - 90  = currently rotated so the top of the text points LEFT
 - 270 = currently rotated so the top of the text points RIGHT

Separately, report any page that is MIRRORED (a left-right flipped scan: every
letter and digit reads backwards, as if seen in a mirror — no rotation can fix
it). Stamps and seals reading backwards while the main text reads normally is
NOT mirroring; the WHOLE page must read backwards.

Return ONLY JSON:
{"rotations": {"<page number>": <0|90|180|270>, ...}, "mirrored": [<page number>, ...]}
Include every page in "rotations". If you are unsure about a page, answer 0 and
do not list it as mirrored.`;
}

async function detectBatch(entries) {
  const content = [{ type: 'text', text: instructionFor(entries.map((e) => e.page)) }];
  for (const e of entries) {
    content.push({ type: 'text', text: `Page ${e.page}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: e.b64 },
    });
  }
  const res = await completeJson({ system: SYSTEM, content, maxTokens: 600 });
  const rotations = {};
  for (const [k, v] of Object.entries(res.rotations || {})) {
    const deg = Number(v);
    if ([90, 180, 270].includes(deg)) rotations[String(Number(k))] = deg;
  }
  const wanted = new Set(entries.map((e) => e.page));
  const mirrored = (Array.isArray(res.mirrored) ? res.mirrored : [])
    .map(Number)
    .filter((n) => wanted.has(n));
  return { rotations, mirrored };
}

/**
 * @param {Record<string, string|Buffer>} thumbs - { pageNumber: pngPath | pngBase64 }
 * @returns {Promise<{rotate: Record<string, number>, mirrored: number[]}>}
 *   rotate   - { pageNumber: clockwiseDegrees } for rotated pages
 *   mirrored - page numbers that are left-right flipped (unfixable by rotation)
 */
export async function detectOrientations(thumbs) {
  const pages = Object.keys(thumbs)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .slice(0, MAX_PAGES);
  if (!pages.length) return { rotate: {}, mirrored: [] };

  // Thumbnails arrive as base64 PNG strings (in-memory pipeline) or file
  // paths; skip any that can't be read.
  const entries = [];
  for (const page of pages) {
    const v = thumbs[String(page)];
    try {
      if (typeof v === 'string' && !v.startsWith('/') && !v.startsWith('.')) {
        entries.push({ page, b64: v });
      } else {
        const buf = await fs.readFile(v);
        entries.push({ page, b64: buf.toString('base64') });
      }
    } catch {
      /* skip */
    }
  }
  if (!entries.length) return { rotate: {}, mirrored: [] };

  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

  // Sequential (not parallel): many simultaneous image-heavy requests trip API
  // rate limits, and a failed batch used to silently mean "no rotation" for
  // its pages. One retry per batch, and failures are logged so they show up in
  // the server logs instead of vanishing.
  const rotate = {};
  const mirrored = [];
  for (const b of batches) {
    let out = null;
    try {
      out = await detectBatch(b);
    } catch (e1) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        out = await detectBatch(b);
      } catch (e2) {
        console.error(
          `[orientation] batch for pages ${b.map((e) => e.page).join(',')} failed twice: ${e2.message}`
        );
      }
    }
    if (out) {
      Object.assign(rotate, out.rotations);
      mirrored.push(...out.mirrored);
    }
  }
  console.log(
    `[orientation] checked ${entries.length} page(s): ${Object.keys(rotate).length} rotated, ${mirrored.length} mirrored`
  );
  return { rotate, mirrored };
}

/**
 * Orientation for a single standalone image (uploaded photo).
 * @param {string} pngB64 - base64 PNG thumbnail of the image
 * @returns {Promise<{rotate: number, mirrored: boolean}>}
 *   rotate 0 when upright/unsure; mirrored true when left-right flipped
 */
export async function detectImageOrientation(pngB64) {
  try {
    const out = await detectBatch([{ page: 1, b64: pngB64 }]);
    return { rotate: out.rotations['1'] || 0, mirrored: out.mirrored.includes(1) };
  } catch (e) {
    console.error(`[orientation] single-image check failed: ${e.message}`);
    return { rotate: 0, mirrored: false };
  }
}

/**
 * For pages the OCR couldn't judge (too little text): show the model each page
 * in all four orientations and ask which one is upright. Picking the upright
 * picture is reliable; working out a rotation direction (90° vs 270°) is not.
 *
 * @param {Array<{page:number, b64:string}>} entries  PNG thumbnails, as scanned
 * @returns {Promise<Record<string, number>>} { page: clockwise rotation } for
 *   pages the model is sure about (others are left out)
 */
export async function pickUpright(entries, rotateThumb) {
  const out = {};
  const LETTERS = ['A', 'B', 'C', 'D'];
  const ROTS = [0, 90, 180, 270];
  for (let i = 0; i < entries.length; i += 3) {
    const batch = entries.slice(i, i + 3);
    const content = [
      {
        type: 'text',
        text: `Each page below is shown four times, turned differently (A, B, C, D). For each page,
say which picture shows it UPRIGHT — text reads normally, headings at the top. Answer "none" if
you cannot tell (e.g. a photo or a page without text). Return ONLY JSON:
{"pages": {"<page number>": "A" | "B" | "C" | "D" | "none", ...}, "sure": {"<page number>": true | false, ...}}`,
      },
    ];
    for (const e of batch) {
      for (let k = 0; k < 4; k++) {
        content.push({ type: 'text', text: `Page ${e.page} — ${LETTERS[k]}:` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: await rotateThumb(e.b64, ROTS[k]) } });
      }
    }
    try {
      const res = await completeJson({ system: SYSTEM, content, maxTokens: 300 });
      for (const e of batch) {
        const letter = String(res.pages?.[e.page] || '').toUpperCase();
        const k = LETTERS.indexOf(letter);
        if (k >= 0 && res.sure?.[e.page] !== false) out[String(e.page)] = ROTS[k];
      }
    } catch (err) {
      console.error(`[orientation] upright check failed: ${err.message}`);
    }
  }
  return out;
}

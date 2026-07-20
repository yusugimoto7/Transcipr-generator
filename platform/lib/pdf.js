import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Render a simple, clean multi-page PDF from a lightweight "document model".
 *
 * blocks: array of { type, text } where type is one of:
 *   'title'   -> large bold, centered-ish heading
 *   'heading' -> bold section heading
 *   'para'    -> normal paragraph (word-wrapped)
 *   'spacer'  -> blank vertical gap
 *
 * Returns a Uint8Array (PDF bytes).
 */
export async function renderDocPdf({ blocks, meta = {} }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  if (meta.title) doc.setTitle(meta.title);
  if (meta.author) doc.setAuthor(meta.author);
  doc.setProducer('Canada Visa Platform');

  const pageWidth = 612; // US Letter
  const pageHeight = 792;
  const margin = 64;
  const maxWidth = pageWidth - margin * 2;
  const color = rgb(0.1, 0.12, 0.16);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const styles = {
    title: { font: bold, size: 20, lead: 26, gap: 14 },
    heading: { font: bold, size: 13, lead: 18, gap: 8 },
    para: { font, size: 11, lead: 16, gap: 8 },
  };

  function newPage() {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function wrap(text, f, size) {
    const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  for (const block of blocks) {
    if (block.type === 'spacer') {
      y -= block.size || 12;
      continue;
    }
    const st = styles[block.type] || styles.para;
    const paragraphs = String(block.text || '').split(/\n{2,}/);
    for (const p of paragraphs) {
      const lines = wrap(p, st.font, st.size);
      for (const line of lines) {
        if (y < margin + st.lead) newPage();
        page.drawText(line, { x: margin, y, size: st.size, font: st.font, color });
        y -= st.lead;
      }
      y -= st.gap;
    }
  }

  return doc.save();
}

/** Convenience: turn a markdown-ish string into blocks. */
export function textToBlocks(text, title) {
  const blocks = [];
  if (title) {
    blocks.push({ type: 'title', text: title });
    blocks.push({ type: 'spacer', size: 8 });
  }
  const lines = String(text || '').split('\n');
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'para', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: 'heading', text: h[1] });
      continue;
    }
    // Bold-only line used as a heading (e.g. **Section**)
    const b = line.match(/^\*\*(.+)\*\*:?$/);
    if (b) {
      flush();
      blocks.push({ type: 'heading', text: b[1] });
      continue;
    }
    // List items ("- x", "• x", "1. x") stay on their own line.
    if (/^(\s*[-•*]\s+|\s*\d+[.)]\s+)/.test(line)) {
      flush();
      blocks.push({ type: 'para', text: line.replace(/\*\*/g, '') });
      continue;
    }
    paragraph.push(line.replace(/\*\*/g, ''));
  }
  flush();
  return blocks;
}

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

/**
 * Render a lightweight markdown-ish text (the same format the generators output)
 * into a .docx Buffer. Supports: '# / ## / ###' or '**bold line**' headings,
 * '- ' / '1. ' list items, and normal paragraphs with inline **bold**.
 */
export async function renderDocx({ text, title }) {
  const children = [];

  if (title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: title, bold: true, size: 40 })],
        spacing: { after: 200 },
      })
    );
  }

  const lines = String(text || '').split('\n');
  let paragraph = [];
  const flushPara = () => {
    if (paragraph.length) {
      children.push(new Paragraph({ children: inlineRuns(paragraph.join(' ')), spacing: { after: 160 } }));
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const b = line.match(/^\*\*(.+?)\*\*:?$/);
    if (h || b) {
      flushPara();
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: (h ? h[2] : b[1]).replace(/\*\*/g, ''), bold: true })],
          spacing: { before: 160, after: 80 },
        })
      );
      continue;
    }
    if (/^(\s*[-•*]\s+|\s*\d+[.)]\s+)/.test(line)) {
      flushPara();
      const clean = line.replace(/^\s*([-•*]|\d+[.)])\s+/, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: inlineRuns(clean),
          spacing: { after: 60 },
        })
      );
      continue;
    }
    paragraph.push(line);
  }
  flushPara();

  const doc = new Document({
    creator: 'Canada Visa Platform',
    title: title || 'Document',
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

/** Split a line into runs, honoring inline **bold**. */
function inlineRuns(line) {
  const parts = String(line).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return new TextRun({ text: m ? m[1] : p, bold: Boolean(m) });
  });
}

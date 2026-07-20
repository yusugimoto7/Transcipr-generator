import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  [DOCX_MIME]: 'docx',
};

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export function isAllowedType(mime) {
  return Boolean(ALLOWED[mime]);
}

/**
 * Extract plain text from a .docx buffer. A docx is a ZIP whose main content
 * lives in word/document.xml — we unzip it and strip the XML down to text.
 */
async function docxToText(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('word/document.xml');
  if (!entry) return '';
  const xml = await entry.async('string');
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Save a file for an application. Returns metadata to store on the application. */
export async function saveUpload(appId, { buffer, filename, mime, category }) {
  if (!isAllowedType(mime)) {
    const e = new Error('Unsupported file type. Upload PDF, DOCX, JPG, PNG or WEBP.');
    e.status = 400;
    throw e;
  }
  if (buffer.length > MAX_BYTES) {
    const e = new Error('File is too large (max 12 MB).');
    e.status = 400;
    throw e;
  }
  const dir = path.join(UPLOAD_DIR, appId);
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const ext = ALLOWED[mime];
  const stored = `${id}.${ext}`;
  await fs.writeFile(path.join(dir, stored), buffer);
  return {
    id,
    filename: filename || stored,
    stored,
    mime,
    size: buffer.length,
    category: category || null,
    uploadedAt: new Date().toISOString(),
  };
}

export async function readUpload(appId, stored) {
  return fs.readFile(path.join(UPLOAD_DIR, appId, stored));
}

/** Save a generated output file (PDF/text). Returns metadata. */
export async function saveGenerated(appId, { key, filename, bytes, mime = 'application/pdf' }) {
  const dir = path.join(UPLOAD_DIR, appId, 'generated');
  await fs.mkdir(dir, { recursive: true });
  const ext = mime === 'application/pdf' ? 'pdf' : 'txt';
  const stored = `${key}.${ext}`;
  await fs.writeFile(path.join(dir, stored), bytes);
  return {
    key,
    filename: filename || stored,
    stored,
    mime,
    size: bytes.length ?? bytes.byteLength ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

export async function readGenerated(appId, stored) {
  return fs.readFile(path.join(UPLOAD_DIR, appId, 'generated', stored));
}

export async function deleteUpload(appId, stored) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, appId, stored));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Build Anthropic content blocks from a set of stored documents so Claude can read them.
 * PDFs -> document blocks; images -> image blocks; DOCX -> extracted text.
 * Each document is numbered so the model can refer back to it (classification).
 */
export async function buildDocBlocks(appId, docs) {
  const blocks = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const buf = await readUpload(appId, doc.stored);
    blocks.push({
      type: 'text',
      text: `--- Document ${i + 1}: ${doc.filename} ---`,
    });
    if (doc.mime === 'application/pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
      });
    } else if (doc.mime === DOCX_MIME) {
      let text = '';
      try {
        text = await docxToText(buf);
      } catch {
        text = '(could not read this .docx file)';
      }
      blocks.push({ type: 'text', text: text || '(empty document)' });
    } else {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: doc.mime, data: buf.toString('base64') },
      });
    }
  }
  return blocks;
}

export { UPLOAD_DIR };

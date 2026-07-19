import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export function isAllowedType(mime) {
  return Boolean(ALLOWED[mime]);
}

/** Save a file for an application. Returns metadata to store on the application. */
export async function saveUpload(appId, { buffer, filename, mime, category }) {
  if (!isAllowedType(mime)) {
    const e = new Error('Unsupported file type. Upload PDF, JPG, PNG or WEBP.');
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
 * PDFs -> document blocks; images -> image blocks.
 */
export async function buildDocBlocks(appId, docs) {
  const blocks = [];
  for (const doc of docs) {
    const buf = await readUpload(appId, doc.stored);
    const b64 = buf.toString('base64');
    blocks.push({
      type: 'text',
      text: `--- Document: ${doc.filename}${doc.category ? ` (category: ${doc.category})` : ''} ---`,
    });
    if (doc.mime === 'application/pdf') {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: b64 },
      });
    } else {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: doc.mime, data: b64 },
      });
    }
  }
  return blocks;
}

export { UPLOAD_DIR };

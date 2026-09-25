import path from 'path';
import {
  parseDriveLink,
  getItem,
  listChildren,
  downloadFile,
  exportFile,
  DriveError,
  FOLDER_MIME,
  SHORTCUT_MIME,
} from './drive';

/**
 * Walk a client's Drive folder and collect every document the platform can
 * use, ready to be saved as uploads.
 *
 * Mirrors how the firm's folders actually look: per-applicant subfolders are
 * followed; backup/scratch folders ("bk", "BK", "used", "OLD Forms",
 * "Recovered files", "Original Files, for compression") are skipped because
 * they duplicate what's already in the parent; zip archives the client sent
 * are unpacked; Google Docs are exported to PDF.
 *
 * Unchanged files (same Drive ID and modified time as a previous import) are
 * not downloaded again, so "Sync again" is cheap.
 */

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BY_MIME = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  [DOCX]: DOCX,
};
const BY_EXT = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.docx': DOCX };
const GOOGLE_NATIVE = /^application\/vnd\.google-apps\.(document|spreadsheet|presentation|drawing)$/;
const ZIP = /^application\/(zip|x-zip-compressed|x-zip)$/;

const BACKUP_FOLDER = /(^|[\s\-_.(])(bk|backup|backups|old|used|recovered|archive|trash)([\s\-_.)]|$)|original files/i;

export const LIMITS = {
  fileBytes: Number(process.env.DRIVE_MAX_FILE_MB || 25) * 1024 * 1024,
  totalBytes: Number(process.env.DRIVE_MAX_TOTAL_MB || 400) * 1024 * 1024,
  files: Number(process.env.DRIVE_MAX_FILES || 300),
  depth: 4,
};

const human = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * @param {string} link   folder or file link (or bare ID)
 * @param {object} opts
 *   known           Map<driveId, modifiedTime> of files already imported
 *   includeBackups  also descend into bk/old/used folders
 *   onFile          async (file) => void — called with each file as it is downloaded;
 *                   the returned `files` then carry no buffers
 * @returns {{ root, files: [{buffer, filename, mime, driveId, driveModified, drivePath}],
 *            unchanged: [...], skipped: [{name, reason}] }}
 */
export async function collectDriveFiles(link, { known = new Map(), includeBackups = false, onFile = null } = {}) {
  const parsed = parseDriveLink(link);
  if (!parsed) throw new DriveError('That does not look like a Google Drive link.');

  const root = await getItem(parsed.id);
  const files = [];
  const unchanged = [];
  const skipped = [];
  let total = 0;
  // With onFile, each file is handed over (and saved) as soon as it arrives,
  // so a 100-file folder never sits in memory all at once.
  const emit = async (f) => {
    if (onFile) {
      await onFile(f);
      files.push({ ...f, buffer: undefined });
    } else {
      files.push(f);
    }
  };

  const take = async (item, dir) => {
    if (files.length >= LIMITS.files) {
      skipped.push({ name: `${dir}${item.name}`, reason: `import limit of ${LIMITS.files} files reached` });
      return;
    }
    if (item.mimeType === SHORTCUT_MIME && item.shortcutDetails?.targetId) {
      if (item.shortcutDetails.targetMimeType === FOLDER_MIME) {
        return walk({ id: item.shortcutDetails.targetId, name: item.name }, `${dir}${item.name}/`, 1);
      }
      // Use the target's own name, size and modified time: the shortcut's name
      // ("Shortcut to LOA") has no extension or checklist code, and its
      // modified time doesn't change when the real file does.
      try {
        item = await getItem(item.shortcutDetails.targetId);
      } catch (e) {
        skipped.push({ name: `${dir}${item.name}`, reason: `shortcut target unavailable: ${e.message}` });
        return;
      }
    }
    const { id, mimeType, name } = item;
    const drivePath = `${dir}${name}`;

    // A zip is "known" through its unpacked entries (driveId "<zipId>:<entry>").
    const seen = known.has(id)
      ? known.get(id) === item.modifiedTime
      : [...known].some(([k, v]) => k.startsWith(`${id}:`) && v === item.modifiedTime);
    if (seen) {
      unchanged.push({ name: drivePath, driveId: id });
      return;
    }

    const size = Number(item.size || 0);
    if (size && size > LIMITS.fileBytes) {
      skipped.push({ name: drivePath, reason: `too large (${human(size)}; limit ${human(LIMITS.fileBytes)})` });
      return;
    }
    if (total + size > LIMITS.totalBytes) {
      skipped.push({ name: drivePath, reason: `total import size limit (${human(LIMITS.totalBytes)}) reached` });
      return;
    }

    try {
      if (GOOGLE_NATIVE.test(mimeType)) {
        const buffer = await exportFile(id, 'application/pdf');
        total += buffer.length;
        await emit({ buffer, filename: `${name}.pdf`, mime: 'application/pdf', driveId: id, driveModified: item.modifiedTime, drivePath });
        return;
      }
      const ext = path.extname(name).toLowerCase();
      if (ZIP.test(mimeType) || ext === '.zip') {
        const buffer = await downloadFile(id);
        total += buffer.length;
        await unzipInto(buffer, { id, name, drivePath, modified: item.modifiedTime }, emit, skipped);
        return;
      }
      const mime = BY_MIME[mimeType] || BY_EXT[ext];
      if (!mime) {
        skipped.push({ name: drivePath, reason: reasonForType(mimeType, ext) });
        return;
      }
      const buffer = await downloadFile(id);
      if (buffer.length > LIMITS.fileBytes) {
        skipped.push({ name: drivePath, reason: `too large (${human(buffer.length)})` });
        return;
      }
      total += buffer.length;
      await emit({ buffer, filename: name, mime, driveId: id, driveModified: item.modifiedTime, drivePath });
    } catch (e) {
      skipped.push({ name: drivePath, reason: `download failed: ${e.message}` });
    }
  };

  const walk = async (folder, dir, depth) => {
    if (depth > LIMITS.depth) {
      skipped.push({ name: dir, reason: 'folder nested too deeply' });
      return;
    }
    const children = await listChildren(folder.id);
    children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const c of children) {
      const isFolder = c.mimeType === FOLDER_MIME || (c.mimeType === SHORTCUT_MIME && c.shortcutDetails?.targetMimeType === FOLDER_MIME);
      if (isFolder) {
        if (!includeBackups && BACKUP_FOLDER.test(c.name)) {
          skipped.push({ name: `${dir}${c.name}/`, reason: 'backup / scratch folder (not imported)' });
          continue;
        }
        const target = c.mimeType === SHORTCUT_MIME ? { id: c.shortcutDetails.targetId, name: c.name } : c;
        await walk(target, `${dir}${c.name}/`, depth + 1);
      } else {
        await take(c, dir);
      }
    }
  };

  if (root.mimeType === FOLDER_MIME) await walk(root, '', 1);
  else await take(root, '');

  return { root: { id: root.id, name: root.name, isFolder: root.mimeType === FOLDER_MIME }, files, unchanged, skipped };
}

function reasonForType(mimeType, ext) {
  if (ext === '.rar' || ext === '.7z' || /rar|7z/.test(mimeType || '')) return 'RAR/7z archive — unpack it and upload the files, or re-save as .zip';
  if (ext === '.heic' || ext === '.heif' || /heic|heif/.test(mimeType || '')) return 'HEIC photo — export as JPG from the phone and re-upload';
  if (ext === '.doc') return 'old Word .doc — save as .docx or PDF';
  return `unsupported type (${mimeType || ext || 'unknown'})`;
}

async function unzipInto(buffer, zipInfo, emit, skipped) {
  const { default: JSZip } = await import('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    skipped.push({ name: zipInfo.drivePath, reason: 'could not open zip archive' });
    return;
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name));
  for (const entry of entries) {
    const base = path.basename(entry.name);
    const mime = BY_EXT[path.extname(base).toLowerCase()];
    const entryPath = `${zipInfo.drivePath}/${entry.name}`;
    if (!mime) {
      skipped.push({ name: entryPath, reason: reasonForType('', path.extname(base).toLowerCase()) });
      continue;
    }
    const data = await entry.async('nodebuffer');
    if (data.length > LIMITS.fileBytes) {
      skipped.push({ name: entryPath, reason: `too large (${human(data.length)})` });
      continue;
    }
    await emit({
      buffer: data,
      filename: base,
      mime,
      driveId: `${zipInfo.id}:${entry.name}`,
      driveModified: zipInfo.modified,
      drivePath: entryPath,
    });
  }
}

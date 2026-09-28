import fs from 'fs/promises';
import path from 'path';
import { getApplication, deleteApplication } from '@/lib/store';
import { UPLOAD_DIR } from '@/lib/paths';
import { unusedReason } from '@/lib/unused';
import { json, error, requireAdmin } from '@/lib/api';

/**
 * Body: { ids: [appId...] } — removes the listed files, but only those that
 * are still unused (lib/unused.js) when the request arrives; anything that got
 * content in the meantime is kept. Drive folders and Odoo cards are untouched.
 */
export async function POST(req) {
  const { user, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].filter((id) => /^[\w-]+$/.test(id));
  if (!ids.length) return error('No files selected.');
  let deleted = 0;
  const kept = [];
  for (const id of ids) {
    const app = await getApplication(id);
    if (!app) continue;
    if (!unusedReason(app)) {
      kept.push({ id, title: app.title });
      continue;
    }
    if (await deleteApplication(id, { by: user.id })) {
      deleted++;
      await fs.rm(path.join(UPLOAD_DIR, id), { recursive: true, force: true }).catch(() => {});
    }
  }
  console.log(`[admin] ${user.email} removed ${deleted} unused file(s)`);
  return json({ deleted, kept });
}

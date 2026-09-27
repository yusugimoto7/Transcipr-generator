import { odooConfig } from '@/lib/odoo';
import { readOdooStore, syncOdoo, ensureOdooSync } from '@/lib/odooSync';
import { listAllApplications } from '@/lib/store';
import { displayName } from '@/lib/cases';
import { json, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function status() {
  const cfg = odooConfig();
  const store = await readOdooStore();
  const apps = new Map((await listAllApplications()).map((a) => [a.id, a]));
  return {
    configured: cfg.configured,
    url: cfg.url,
    project: cfg.project,
    lastSyncAt: store.lastSyncAt,
    lastError: store.lastError,
    lastResult: store.lastResult,
    log: store.log.slice(0, 30).map((l) => ({ ...l, file: l.appId && apps.get(l.appId) ? { id: l.appId, name: displayName(apps.get(l.appId)), clientNumber: apps.get(l.appId).clientNumber || '' } : null })),
  };
}

/** Odoo connection and the last sync. */
export async function GET() {
  const { error: err } = await requireAdmin();
  if (err) return err;
  ensureOdooSync();
  return json(await status());
}

/** Sync with Odoo now. */
export async function POST() {
  const { error: err } = await requireAdmin();
  if (err) return err;
  await syncOdoo();
  return json(await status());
}

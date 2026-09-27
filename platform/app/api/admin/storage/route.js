import { cacheStatus, sweep, evictCache, ensureDriveSync } from '@/lib/driveStore';
import { json, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Storage: Google Drive connection, the server cache, and what is still waiting to go to Drive. */
export async function GET() {
  const { error: err } = await requireAdmin();
  if (err) return err;
  ensureDriveSync();
  return json(await cacheStatus());
}

/** Save everything pending to Drive now, then trim the cache. */
export async function POST() {
  const { error: err } = await requireAdmin();
  if (err) return err;
  await sweep();
  const evicted = await evictCache();
  return json({ ...(await cacheStatus()), evicted });
}

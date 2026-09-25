import { readStore, refreshAll, checking } from '@/lib/irccChecklists';
import { json, requireStaff } from '@/lib/api';

export const runtime = 'nodejs';

/** Every IRCC source the platform tracks, with its last check and changes. */
export async function GET() {
  const { error: err } = await requireStaff();
  if (err) return err;
  const store = await readStore();
  const busy = new Set(checking());
  const sources = Object.values(store.sources)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      code: r.code || null,
      url: r.url || r.page,
      documents: r.documents || [],
      version: r.version || null,
      visaOffice: r.visaOffice || null,
      checkedAt: r.checkedAt || null,
      changedAt: r.changedAt || null,
      changes: r.changes || [],
      items: r.items || [],
      error: r.error || null,
      checking: busy.has(r.id),
    }))
    .sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === 'general' ? -1 : 1));
  return json({ sources, checking: busy.size > 0 });
}

/** Re-check every source now (runs in the background; GET shows progress). */
export async function POST() {
  const { error: err } = await requireStaff();
  if (err) return err;
  const count = await refreshAll({ force: true });
  return json({ started: count }, 202);
}

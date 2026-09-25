import { updateApplication } from '@/lib/store';
import { buildChecklist } from '@/lib/checklist';
import { irccFor, compareWithChecklist } from '@/lib/irccChecklists';
import { json, requireAppAccess } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * IRCC's current requirements for this file: the general checklist and the
 * visa office instructions for the country the client applies from, compared
 * with the firm's checklist. Sources older than a day are re-checked in the
 * background (`checking` lists them; the page polls). Documents IRCC asks for
 * that the firm's list lacks are saved on the file, so they appear in its
 * checklist, missing-documents note and review everywhere.
 */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireAppAccess(params.id);
  if (err) return err;

  const records = await irccFor(app);
  const ready = records.filter((r) => Array.isArray(r.items));
  const { covered, extra, handled } = compareWithChecklist(ready, buildChecklist(app.data || {}, app.type));

  const saved = {
    extra,
    sources: ready.map((r) => ({ id: r.id, title: r.title, code: r.code || null, version: r.version || null, checkedAt: r.checkedAt, changedAt: r.changedAt })),
  };
  let application = null;
  if (JSON.stringify(saved) !== JSON.stringify({ extra: app.ircc?.extra, sources: app.ircc?.sources })) {
    // Not an intake edit: the intake version (dataVersion) is untouched.
    const updated = await updateApplication(app.id, (a) => {
      a.ircc = { ...saved, updatedAt: new Date().toISOString() };
      return a;
    });
    application = { ircc: updated.ircc };
  }

  return json({
    sources: records.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      code: r.code || null,
      page: r.page,
      url: r.url || r.page,
      documents: r.documents || [],
      version: r.version || null,
      visaOffice: r.visaOffice || null,
      checkedAt: r.checkedAt || null,
      changedAt: r.changedAt || null,
      lastChange: r.changes?.[0] || null,
      itemCount: r.items?.length || 0,
      checking: r.checking,
      error: r.error || null,
    })),
    covered,
    extra,
    handled,
    checking: records.some((r) => r.checking),
    ...(application ? { application } : {}),
  });
}

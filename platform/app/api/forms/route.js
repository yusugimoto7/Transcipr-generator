import { listForms, refreshAll } from '@/lib/forms/fetchForms';
import { json, error, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

// List tracked IRCC forms with their latest cached version.
export async function GET() {
  const { error: authErr } = await requireUser();
  if (authErr) return authErr;
  try {
    let forms = await listForms();
    // First-run convenience: if nothing is cached yet, fetch once.
    if (!forms.some((f) => f.cached)) {
      await refreshAll();
      forms = await listForms();
    }
    return json({ forms });
  } catch (e) {
    return error(`Could not list forms: ${e.message}`, 500);
  }
}

// Force a refresh from canada.ca.
export async function POST() {
  const { error: authErr } = await requireUser();
  if (authErr) return authErr;
  try {
    const results = await refreshAll({ force: true });
    return json({ results });
  } catch (e) {
    return error(`Refresh failed: ${e.message}`, 502);
  }
}

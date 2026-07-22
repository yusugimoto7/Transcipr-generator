import { dumpFormSchema } from '@/lib/generators/xfaFill';
import { IRCC_FORMS } from '@/lib/forms/registry';
import { json, error, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Dump the XFA leaf-field paths of a form's latest blank template. Used to
// author/verify field maps. Structural only — no values. Auth-gated.
export async function GET(_req, { params }) {
  const { error: authErr } = await requireUser();
  if (authErr) return authErr;
  if (!IRCC_FORMS[params.key]) return error('Unknown form.', 404);
  try {
    const result = await dumpFormSchema(params.key);
    return json(result);
  } catch (e) {
    return error(`Schema dump failed: ${e.message}`, 502);
  }
}

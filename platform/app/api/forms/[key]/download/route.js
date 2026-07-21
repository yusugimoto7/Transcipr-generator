import { getFormPdf } from '@/lib/forms/fetchForms';
import { IRCC_FORMS } from '@/lib/forms/registry';
import { error, requireUser } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Download the latest official blank IRCC PDF for a form key.
export async function GET(_req, { params }) {
  const { error: authErr } = await requireUser();
  if (authErr) return authErr;

  const key = params.key;
  if (!IRCC_FORMS[key]) return error('Unknown form.', 404);

  try {
    const { bytes, meta } = await getFormPdf(key);
    const name = `${key}e_${meta.version || 'latest'}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return error(`Could not fetch the official form: ${e.message}`, 502);
  }
}

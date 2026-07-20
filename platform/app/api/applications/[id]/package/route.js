import { buildSubmissionZip } from '@/lib/package';
import { error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

// Download all generated documents + a submission guide as a single ZIP.
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  if (!(app.generated || []).length) {
    return error('Generate at least one document first.', 400);
  }

  let bytes;
  try {
    bytes = await buildSubmissionZip(app);
  } catch (e) {
    return error(`Could not build package: ${e.message}`, 500);
  }

  const d = app.data || {};
  const base = `${d.familyName || 'applicant'}_study_permit_package`
    .replace(/[^\w.\-]+/g, '_')
    .toLowerCase();

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${base}.zip"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}

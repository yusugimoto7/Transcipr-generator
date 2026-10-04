import { updateApplication } from './store';
import { saveGenerated } from './uploads';
import { queueSync } from './driveStore';
import { renderClientFormPdf, clientFormFilename, CLIENT_FORM_KEY } from './clientFormPdf';

/**
 * Keep the client's submitted questionnaire as a PDF on the file, and in the
 * client's main folder on Google Drive (lib/driveStore.js). Submitted again
 * after the team reopens it: the PDF is replaced (Drive keeps the earlier
 * version in the file's history).
 */
export async function storeClientFormPdf(app) {
  const bytes = await renderClientFormPdf(app);
  const meta = await saveGenerated(app.id, { key: CLIENT_FORM_KEY, filename: clientFormFilename(app), bytes: Buffer.from(bytes) });
  const updated = await updateApplication(app.id, (a) => {
    a.generated = [...(a.generated || []).filter((g) => g.key !== CLIENT_FORM_KEY), meta];
    return a;
  }, { quiet: true });
  queueSync(app.id);
  return updated;
}

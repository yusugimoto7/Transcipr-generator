import { updateApplication } from './store';
import { saveGenerated } from './uploads';
import { queueSync } from './driveStore';
import { renderClientFormPdf, clientFormFilename, CLIENT_FORM_KEY, CLIENT_FORM_DOCX_KEY } from './clientFormPdf';
import { renderClientFormDocx } from './clientFormDocx';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Keep the client's submitted questionnaire as a PDF and a Word file on the file, and in the
 * client's main folder on Google Drive (lib/driveStore.js). Submitted again
 * after the team reopens it: the PDF is replaced (Drive keeps the earlier
 * version in the file's history).
 */
export async function storeClientFormPdf(app) {
  const pdf = await saveGenerated(app.id, { key: CLIENT_FORM_KEY, filename: clientFormFilename(app, 'pdf'), bytes: Buffer.from(await renderClientFormPdf(app)) });
  const docx = await saveGenerated(app.id, { key: CLIENT_FORM_DOCX_KEY, filename: clientFormFilename(app, 'docx'), bytes: await renderClientFormDocx(app), mime: DOCX });
  const updated = await updateApplication(app.id, (a) => {
    a.generated = [...(a.generated || []).filter((g) => g.key !== CLIENT_FORM_KEY && g.key !== CLIENT_FORM_DOCX_KEY), pdf, docx];
    return a;
  }, { quiet: true });
  queueSync(app.id);
  return updated;
}

/**
 * Registry of official IRCC forms the platform tracks. For each form we know its
 * canada.ca form page; the fetcher scrapes that page for the current versioned
 * PDF link (IRCC embeds the version date in the URL path, e.g.
 * .../kits/forms/imm1294/01-06-2026/imm1294e.pdf). `fallbackPdf` is the
 * last-known-good URL captured at build time, used only if scraping the page
 * fails, so the platform always has a working link.
 */

const PAGE = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides';

export const IRCC_FORMS = {
  imm1294: {
    code: 'IMM 1294',
    title: 'Application for a Study Permit Made Outside of Canada',
    role: 'form',
    page: `${PAGE}/imm1294.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm1294/01-06-2026/imm1294e.pdf',
  },
  imm5257: {
    code: 'IMM 5257',
    title: 'Application for a Temporary Resident Visa (visitor visa)',
    role: 'form',
    page: `${PAGE}/imm5257.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257/01-09-2023/imm5257e.pdf',
  },
  imm5645: {
    code: 'IMM 5645',
    title: 'Family Information Form',
    role: 'form',
    page: `${PAGE}/imm5645.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5645/01-01-2021/imm5645e.pdf',
  },
  imm5483: {
    code: 'IMM 5483',
    title: 'Document Checklist: Study Permit',
    role: 'checklist',
    page: `${PAGE}/imm5483.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5483/01-08-2025/imm5483e.pdf',
  },
};

/** The forms (not checklists) required for a study permit application. */
export const STUDY_PERMIT_FORM_KEYS = ['imm1294', 'imm5257', 'imm5645'];

/** Parse the IRCC version date (DD-MM-YYYY) out of a form PDF URL. */
export function versionFromUrl(url) {
  const m = String(url || '').match(/\/forms\/[^/]+\/(\d{2}-\d{2}-\d{4})\//);
  return m ? m[1] : null;
}

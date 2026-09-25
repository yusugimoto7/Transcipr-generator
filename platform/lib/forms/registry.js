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
  imm1295: {
    code: 'IMM 1295',
    title: 'Application for a Work Permit Made Outside of Canada',
    role: 'form',
    page: `${PAGE}/imm1295.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm1295/01-06-2026/imm1295e.pdf',
  },
  imm5710: {
    code: 'IMM 5710',
    title: 'Application to Change Conditions, Extend My Stay or Remain in Canada as a Worker',
    role: 'form',
    page: `${PAGE}/imm5710.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5710/01-06-2026/imm5710e.pdf',
  },
  imm5709: {
    code: 'IMM 5709',
    title: 'Application to Change Conditions, Extend My Stay or Remain in Canada as a Student',
    role: 'form',
    page: `${PAGE}/imm5709.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5709/01-06-2026/imm5709e.pdf',
  },
  imm5708: {
    code: 'IMM 5708',
    title: 'Application to Change Conditions or Extend Your Stay in Canada as a Visitor',
    role: 'form',
    page: `${PAGE}/imm5708.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5708/01-06-2026/imm5708e.pdf',
  },
  imm5257b: {
    code: 'IMM 5257B',
    title: 'Schedule 1 — Application for a Temporary Resident Visa Made Outside Canada',
    role: 'form',
    pdfBase: 'imm5257b_1e',
    page: `${PAGE}/imm5257b.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5257b/01-01-2021/imm5257b_1e.pdf',
  },
  imm5476: {
    code: 'IMM 5476',
    title: 'Use of a Representative',
    role: 'form',
    page: `${PAGE}/imm5476.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5476/01-09-2023/imm5476e.pdf',
  },
  imm5744: {
    code: 'IMM 5744',
    title: 'Consent for an Access to Information and Personal Information Request',
    role: 'form',
    page: `${PAGE}/imm5744.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5744/01-01-2021/imm5744e.pdf',
  },
  imm5713: {
    code: 'IMM 5713',
    title: 'Use of a Family Member Representative (online applications)',
    role: 'form',
    page: `${PAGE}/imm5713.html`,
    fallbackPdf: 'https://ircc.canada.ca/english/pdf/kits/forms/imm5713e.pdf',
  },
  imm5646: {
    code: 'IMM 5646',
    title: 'Custodianship Declaration — Custodian for Minors Studying in Canada',
    role: 'form',
    page: `${PAGE}/imm5646.html`,
    fallbackPdf:
      'https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5646/01-01-2023/imm5646e.pdf',
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

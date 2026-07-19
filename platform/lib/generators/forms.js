import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';
import { renderDocPdf } from '../pdf';

/**
 * Official IRCC form support.
 *
 * IMPORTANT: Several IRCC forms (e.g. IMM 1294, IMM 5257) are Adobe XFA "dynamic"
 * PDFs that also require the applicant to click "Validate" to generate a 2D barcode.
 * No open-source library can fully fill + validate those. So we support two paths:
 *
 *  1) DATA SHEET (always available): a clean PDF that maps every official form field
 *     to the applicant's value, section by section, so the applicant can transcribe
 *     into the official validated form quickly and accurately.
 *
 *  2) DIRECT FILL (when a fillable AcroForm template with known field names exists):
 *     `fillAcroForm` fills a template PDF by field name. Provide the template under
 *     lib/forms/templates and its field map, then call fillAcroForm.
 */

/* --------- IMM 1294: Application for Study Permit (made outside Canada) --------- */

export const IMM1294_MAP = [
  { section: '1. Personal details', rows: [
    ['Family name', (d) => d.familyName],
    ['Given name(s)', (d) => d.givenName],
    ['Other name(s) used', (d) => d.otherNames],
    ['UCI', (d) => d.uci],
    ['Sex', (d) => d.sex],
    ['Date of birth (YYYY-MM-DD)', (d) => d.dob],
    ['Place of birth — city/town', (d) => d.cityOfBirth],
    ['Place of birth — country', (d) => d.countryOfBirth],
    ['Country of citizenship', (d) => d.citizenship],
    ['Current country of residence', (d) => d.countryOfResidence],
    ['Status in country of residence', (d) => d.residenceStatus],
    ['Status from', (d) => d.residenceFrom],
    ['Status to', (d) => d.residenceTo],
    ['Marital status', (d) => d.maritalStatus],
  ]},
  { section: '2. Passport', rows: [
    ['Passport number', (d) => d.passportNumber],
    ['Country of issue', (d) => d.passportCountry],
    ['Issue date', (d) => d.passportIssue],
    ['Expiry date', (d) => d.passportExpiry],
  ]},
  { section: '3. Contact information', rows: [
    ['Mailing address', (d) => d.mailingAddress],
    ['Residential address', (d) => d.residentialAddress || d.mailingAddress],
    ['Telephone', (d) => d.phone],
    ['Email', (d) => d.email],
  ]},
  { section: '4. Details of intended study', rows: [
    ['School / DLI name', (d) => d.schoolName],
    ['DLI number', (d) => d.dliNumber],
    ['Field of study', (d) => d.programName],
    ['Level of study', (d) => d.levelOfStudy],
    ['City', (d) => d.schoolCity],
    ['Province', (d) => d.schoolProvince],
    ['Duration — from', (d) => d.programStart],
    ['Duration — to', (d) => d.programEnd],
    ['Tuition cost (CAD)', (d) => d.tuitionCost],
    ['Funds available (CAD)', (d) => d.totalFunds],
    ['Expenses paid by', (d) => d.fundingSource],
  ]},
  { section: '5. Coming into Canada', rows: [
    ['Intended date of entry', (d) => d.entryDate],
  ]},
  { section: '6. Education', rows: [
    ['Highest level of education', (d) => d.highestEducation],
    ['Institution', (d) => d.lastInstitution],
    ['Field of study', (d) => d.lastFieldOfStudy],
    ['From', (d) => d.lastEduFrom],
    ['To', (d) => d.lastEduTo],
    ['Country', (d) => d.lastEduCountry],
  ]},
  { section: '7. Language', rows: [
    ['Native language', (d) => d.firstLanguage],
    ['Test taken', (d) => d.languageTest],
    ['Score', (d) => d.languageScore],
  ]},
  { section: '8. Background information', rows: [
    ['Previously been to Canada', (d) => yesNo(d.previousCanada)],
    ['Ever refused a visa/permit or removed', (d) => yesNo(d.previousRefusal)],
    ['Refusal details', (d) => d.refusalDetails],
  ]},
];

/* --------------------- IMM 5645: Family Information --------------------- */

export const IMM5645_MAP = [
  { section: 'Applicant', rows: [
    ['Family name', (d) => d.familyName],
    ['Given name(s)', (d) => d.givenName],
    ['Date of birth', (d) => d.dob],
    ['Country of birth', (d) => d.countryOfBirth],
    ['Marital status', (d) => d.maritalStatus],
    ['Present address', (d) => d.residentialAddress || d.mailingAddress],
  ]},
  { section: "Father (complete on the official form)", rows: [
    ['Father — full name', () => ''],
    ['Father — date of birth', () => ''],
    ['Father — country of birth', () => ''],
    ['Father — present address / deceased', () => ''],
  ]},
  { section: 'Mother (complete on the official form)', rows: [
    ['Mother — full name', () => ''],
    ['Mother — date of birth', () => ''],
    ['Mother — country of birth', () => ''],
    ['Mother — present address / deceased', () => ''],
  ]},
  { section: 'Siblings (complete on the official form)', rows: [
    ['List each brother/sister: name, DOB, marital status, present address', () => ''],
  ]},
];

const FORMS = {
  imm1294: { title: 'IMM 1294 — Application for a Study Permit (data sheet)', map: IMM1294_MAP },
  imm5645: { title: 'IMM 5645 — Family Information (data sheet)', map: IMM5645_MAP },
};

function yesNo(v) {
  if (v === true || v === 'true' || v === 'yes') return 'Yes';
  if (v === false || v === 'false' || v === 'no') return 'No';
  return '';
}

/** Build a data-sheet PDF for an official form. */
export async function generateFormDataSheet(formKey, app) {
  const form = FORMS[formKey];
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  const d = app.data || {};

  const blocks = [
    { type: 'title', text: form.title },
    {
      type: 'para',
      text:
        'This is a field-by-field data sheet generated from your intake answers. ' +
        'Transcribe these values into the official fillable IRCC PDF, then click ' +
        '"Validate" on the form to generate the required barcode. Empty rows need ' +
        'information you have not provided yet.',
    },
    { type: 'spacer', size: 10 },
  ];

  for (const sec of form.map) {
    blocks.push({ type: 'heading', text: sec.section });
    for (const [label, getter] of sec.rows) {
      const val = getter(d);
      const shown = val === undefined || val === null || val === '' ? '—' : String(val);
      blocks.push({ type: 'para', text: `${label}:  ${shown}` });
    }
    blocks.push({ type: 'spacer', size: 8 });
  }

  return renderDocPdf({ blocks, meta: { title: form.title, author: 'Canada Visa Platform' } });
}

/**
 * Fill a fillable AcroForm template by field name.
 * @param {string} templatePath - path to a fillable PDF whose field names are known.
 * @param {object} fieldValues - { pdfFieldName: value }
 * Returns filled PDF bytes. Throws on XFA-only forms (no AcroForm fields).
 */
export async function fillAcroForm(templatePath, fieldValues) {
  const bytes = await fs.readFile(templatePath);
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const fields = form.getFields();
  if (!fields.length) {
    throw new Error(
      'This PDF has no fillable AcroForm fields (likely an XFA form). Use the data sheet instead.'
    );
  }
  for (const [name, value] of Object.entries(fieldValues)) {
    if (value == null || value === '') continue;
    try {
      const field = form.getField(name);
      const kind = field.constructor.name;
      if (kind === 'PDFTextField') field.setText(String(value));
      else if (kind === 'PDFCheckBox') value ? field.check() : field.uncheck();
      else if (kind === 'PDFRadioGroup' || kind === 'PDFDropdown') field.select(String(value));
    } catch {
      // Field not present in this template version — skip quietly.
    }
  }
  return pdf.save();
}

export const AVAILABLE_FORMS = Object.keys(FORMS).map((k) => ({ key: k, title: FORMS[k].title }));

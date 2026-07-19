/**
 * Document checklist for a Study Permit (single applicant, outside Canada).
 * `key` is used to match uploaded documents to a checklist item.
 * `always` items are required for essentially every applicant; conditional
 * items include a `when(data)` predicate.
 */

export const STUDY_PERMIT_CHECKLIST = [
  {
    key: 'passport',
    label: 'Valid passport (bio page)',
    always: true,
    hint: 'Must be valid for the full study period. Include the biographical data page.',
  },
  {
    key: 'loa',
    label: 'Letter of Acceptance (LOA) from a DLI',
    always: true,
    hint: 'From a Designated Learning Institution, showing the DLI number.',
  },
  {
    key: 'pal',
    label: 'Provincial Attestation Letter (PAL/TAL)',
    always: true,
    hint: 'Required for most study permit applications since 2024, issued by the province/territory.',
  },
  {
    key: 'proof-of-funds',
    label: 'Proof of financial support',
    always: true,
    hint: 'Bank statements, GIC certificate, education loan, sponsor letter — enough for tuition + living costs.',
  },
  {
    key: 'gic',
    label: 'GIC certificate',
    when: (d) => Number(d.gicAmount) > 0,
    hint: 'Guaranteed Investment Certificate confirmation (common for Student Direct Stream).',
  },
  {
    key: 'photo',
    label: 'Digital photo (passport style)',
    always: true,
    hint: 'Meets IRCC photo specifications.',
  },
  {
    key: 'transcripts',
    label: 'Academic transcripts & diplomas',
    always: true,
    hint: 'Most recent degree/diploma and transcripts.',
  },
  {
    key: 'language',
    label: 'Language test results',
    when: (d) => d.languageTest && d.languageTest !== 'None yet',
    hint: 'IELTS/TOEFL/PTE/CELPIP score report.',
  },
  {
    key: 'sop',
    label: 'Statement of Purpose / Study Plan',
    always: true,
    hint: 'Explains why this program, why Canada, and your intent to return. The platform can draft this.',
  },
  {
    key: 'tuition-receipt',
    label: 'Tuition payment receipt',
    when: (d) => Number(d.tuitionPaid) > 0,
    hint: 'Receipt for any tuition already paid to the school.',
  },
  {
    key: 'medical',
    label: 'Upfront medical exam (if applicable)',
    when: () => true,
    hint: 'Required from many countries or for certain programs. Check IRCC country instructions.',
  },
  {
    key: 'family-info',
    label: 'Family Information form (IMM 5645)',
    always: true,
    hint: 'Lists parents and siblings. The platform generates a data sheet for this.',
  },
];

/** Build a personalized checklist for an application's data. */
export function buildChecklist(data = {}) {
  return STUDY_PERMIT_CHECKLIST.filter((item) => item.always || (item.when && item.when(data))).map(
    (item) => ({ key: item.key, label: item.label, hint: item.hint })
  );
}

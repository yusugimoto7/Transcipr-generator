/**
 * Document checklist for a Study Permit (single applicant, outside Canada),
 * modelled on Sugimoto Visa's real submission packages.
 * `key` matches uploaded documents to a checklist item.
 * `always` items apply to essentially every applicant; conditional items
 * include a `when(data)` predicate.
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
    label: 'Provincial Attestation Letter (PAL/TAL) or PAL exemption',
    always: true,
    hint: 'Required for most applications since 2024. Some graduate programs are exempt — include the exemption note instead.',
  },
  {
    key: 'proof-of-funds',
    label: 'Proof of financial support (bank statements)',
    always: true,
    hint: 'Applicant and supporter bank statements showing enough for tuition + living costs.',
  },
  {
    key: 'source-of-funds',
    label: 'Source of funds evidence',
    always: true,
    hint: 'Explains where large funds came from (property/vehicle sale, salary, business) so they are traceable.',
  },
  {
    key: 'affidavit-support',
    label: 'Affidavit / letter of financial support',
    when: (d) => d.fundingSource && d.fundingSource !== 'Self',
    hint: 'From the parent, spouse or sponsor funding the studies, with their own ID.',
  },
  {
    key: 'gic',
    label: 'GIC certificate',
    when: (d) => Number(d.gicAmount) > 0,
    hint: 'Guaranteed Investment Certificate (only if used — not applicable for many non-SDS countries).',
  },
  {
    key: 'deposit',
    label: 'Tuition deposit / payment confirmation',
    when: (d) => Number(d.tuitionPaid) > 0,
    hint: 'Receipt confirming the tuition down-payment made to the institution.',
  },
  {
    key: 'photo',
    label: 'Digital photo (passport style)',
    always: true,
    hint: 'Meets IRCC photo specifications.',
  },
  {
    key: 'transcripts',
    label: 'Academic degrees & transcripts',
    always: true,
    hint: 'Most recent degree/diploma and transcripts.',
  },
  {
    key: 'language',
    label: 'Language test result (IELTS/TOEFL/etc.)',
    when: (d) => d.languageTest && d.languageTest !== 'None yet',
    hint: 'Official score report.',
  },
  {
    key: 'sop',
    label: 'Statement of Purpose / Study Plan',
    always: true,
    hint: 'Explains why this program, why Canada, and intent to return. The platform drafts this.',
  },
  {
    key: 'job-offer',
    label: 'Job offer / employment & leave-of-absence letter',
    when: (d) => (d.employer || '').trim() || (d.currentOccupation || '').trim(),
    hint: 'Strengthens temporary intent — a promotion or job awaiting return, plus approved leave.',
  },
  {
    key: 'police-clearance',
    label: 'Police clearance certificate',
    always: true,
    hint: 'Police/character certificate from your country of residence.',
  },
  {
    key: 'military',
    label: 'Military service card (completion/exemption)',
    when: (d) => String(d.sex || '').toLowerCase().startsWith('m'),
    hint: 'Where applicable (e.g. male applicants from countries with mandatory service).',
  },
  {
    key: 'flight',
    label: 'Flight reservation',
    when: () => true,
    hint: 'A tentative flight booking to Canada (optional but common in strong packages).',
  },
  {
    key: 'accommodation',
    label: 'Accommodation arrangement',
    when: () => true,
    hint: 'Where you will stay in Canada (relative/friend letter, rental, or homestay).',
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

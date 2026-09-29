/**
 * Field map: intake fields -> IMM 5645 (Family Information) XFA paths, form
 * version 01-01-2021, read from the blank template's datasets.
 *
 * Section A: the applicant, their spouse, mother and father. Section B: the
 * first child; Section C: the first brother or sister (the form has one row
 * each in its data; further rows are added by hand from the data sheet).
 * Checkboxes on this form take 1 (ticked) / 0. Marital-status drop-downs are
 * left for the applicant: the form's wording ("Married — physically present")
 * needs a judgement the intake does not hold.
 */

const has = (v) => String(v || '').trim().length > 0;
const P = 'IMM_5645/page1';

/** Name, date of birth, country from one line of the intake's children / siblings list. */
function person(text, n = 0) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[n];
  if (!line) return null;
  const parts = line.split(/\s*[,;|–-]\s+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  const dob = parts.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) || '';
  const rest = parts.filter((p) => p !== dob);
  return { name: rest[0] || '', dob, country: rest[1] || '' };
}

/** The applicant's address in one line, from the structured contact fields. */
function address(d) {
  const street = [d.mailingUnit && `${d.mailingUnit}-`, d.mailingStreetNo, d.mailingStreet].filter(Boolean).join(' ').replace(/- /, '-');
  return [d.mailingPobox && `P.O. Box ${d.mailingPobox}`, street, d.mailingCity, d.mailingProvince, d.mailingPostal, d.mailingCountry].filter(Boolean).join(', ');
}

const kind = (type) => (/study/.test(type) ? 'Student' : /owp|work|pgwp|imp-|sowp/.test(type) ? 'Worker' : 'Visitor');

export function imm5645FieldMap(type = '') {
  const which = kind(type);
  return [
    // What the form is for.
    ...['Visitor', 'Worker', 'Student'].map((k) => ({ som: `${P}/Subform1/${k}`, const: k === which ? '1' : '0' })),

    // --- Section A: applicant ---
    { som: `${P}/SectionA/Applicant/AppName`, from: '_fullName' },
    { som: `${P}/SectionA/Applicant/AppDOB`, from: 'dob' },
    { som: `${P}/SectionA/Applicant/AppCOB`, from: '_placeOfBirth' },
    { som: `${P}/SectionA/Applicant/AppAddress`, from: '_address' },
    { som: `${P}/SectionA/Applicant/AppOccupation`, from: 'currentOccupation' },

    // --- Spouse ---
    { som: `${P}/SectionA/Spouse/SpouseName`, from: 'spouseName' },
    { som: `${P}/SectionA/Spouse/SpouseDOB`, from: 'spouseDob' },
    { som: `${P}/SectionA/Spouse/SpouseCOB`, from: 'spouseCitizenship' },
    { som: `${P}/SectionA/Spouse/SpouseAddress`, from: '_spouseAddress' },
    { som: `${P}/SectionA/Spouse/SpouseOccupation`, from: '_spouseOccupation' },
    { som: `${P}/SectionA/Spouse/SpouseYes`, const: '1', when: (d) => has(d.spouseName) && d.spouseAccompanying === true },
    { som: `${P}/SectionA/Spouse/SpouseNo`, const: '1', when: (d) => has(d.spouseName) && d.spouseAccompanying === false },

    // --- Parents ---
    { som: `${P}/SectionA/Mother/MotherName`, from: 'motherName' },
    { som: `${P}/SectionA/Mother/MotherDOB`, from: 'motherDob' },
    { som: `${P}/SectionA/Father/FatherName`, from: 'fatherName' },
    { som: `${P}/SectionA/Father/FatherDOB`, from: 'fatherDob' },

    // --- Section B: first child · Section C: first brother or sister ---
    { som: `${P}/SectionB/Child/ChildName`, from: '_child1Name' },
    { som: `${P}/SectionB/Child/ChildDOB`, from: '_child1Dob' },
    { som: `${P}/SectionB/Child/ChildCOB`, from: '_child1Country' },
    { som: `${P}/SectionC/Child/ChildName`, from: '_sibling1Name' },
    { som: `${P}/SectionC/Child/ChildDOB`, from: '_sibling1Dob' },
    { som: `${P}/SectionC/Child/ChildCOB`, from: '_sibling1Country' },
  ];
}

/** Intake data plus the composed values the map reads (keys starting with "_"). */
export function imm5645Data(d = {}) {
  const child = person(d.children, 0) || {};
  const sib = person(d.siblings, 0) || {};
  return {
    ...d,
    _fullName: [d.familyName, d.givenName].filter(Boolean).join(', '),
    _placeOfBirth: [d.cityOfBirth, d.countryOfBirth].filter(Boolean).join(', '),
    _address: address(d),
    // A spouse in Canada (spouse-based applications) lives at the address on the intake's spouse step.
    _spouseAddress: d.inviterAddress || '',
    _spouseOccupation: d.inviterProgramOrJob || d.spouseOccupation || '',
    _child1Name: child.name,
    _child1Dob: child.dob,
    _child1Country: child.country,
    _sibling1Name: sib.name,
    _sibling1Dob: sib.dob,
    _sibling1Country: sib.country,
  };
}

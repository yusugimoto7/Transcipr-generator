/**
 * Field map: intake fields -> IMM 5645 (Family Information), form version
 * 01-01-2021, paths as resolved from the form (lib/forms/xfa_fields.py).
 *
 * Section A: the applicant, their spouse, mother and father. Section B: up to
 * four children; Section C: up to seven brothers and sisters.
 *
 * Names are written in English followed by the native-language spelling
 * ("Sara Rahimi سارا رحیمی"), as the form asks. Every other box — country of
 * birth, address, occupation, relationship — is English only (the filler
 * leaves a box blank and reports it rather than write another script).
 * "Will accompany you to Canada?" is ticked Yes or No for every person listed.
 */

const has = (v) => String(v ?? '').trim().length > 0;
const P = 'IMM_5645/page1';

/** Our marital statuses → the form's list. */
const MARITAL = {
  'Never Married / Single': 'Single',
  Single: 'Single',
  Married: 'Married-physically present',
  'Common-Law': 'Common-law',
  Divorced: 'Divorced',
  Separated: 'Legally separated',
  Widowed: 'Widowed',
  'Annulled Marriage': 'Annulled marriage',
};

const yesNo = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return v === true || /^(y|yes|true|accompany|accompanying)$/.test(s) ? true : v === false || /^(n|no|false)$/.test(s) ? false : undefined;
};

/** "English name native name" — either part may be missing. */
const bilingual = (english, native) => [english, native].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');

/**
 * One person per line of the intake's children / siblings list:
 *   English name | native name | date of birth | country of birth | relationship | marital status | address | occupation | accompanying
 * Older entries "Name, 2015-04-02, Iran" are still read.
 */
export function people(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('|')) {
        const [name, native, dob, country, relationship, marital, address, occupation, accompany] = line.split('|').map((s) => s.trim());
        return { name, native, dob, country, relationship, marital, address, occupation, accompany: yesNo(accompany) };
      }
      const parts = line.split(/\s*[,;–]\s+|\s{2,}/).map((s) => s.trim()).filter(Boolean);
      const dob = parts.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p)) || '';
      const rest = parts.filter((p) => p !== dob);
      return { name: rest[0] || '', native: '', dob, country: rest[1] || '', relationship: '', marital: '', address: '', occupation: '', accompany: undefined };
    });
}

/** The applicant's address in one line, from the structured contact fields. */
function address(d) {
  const street = [d.mailingUnit && `${d.mailingUnit}-`, d.mailingStreetNo, d.mailingStreet].filter(Boolean).join(' ').replace(/- /, '-');
  return [d.mailingPobox && `P.O. Box ${d.mailingPobox}`, street, d.mailingCity, d.mailingProvince, d.mailingPostal, d.mailingCountry].filter(Boolean).join(', ');
}

const kind = (type) => (/study/.test(type) ? 'Student' : /owp|work|pgwp|imp-|sowp/.test(type) ? 'Worker' : 'Visitor');

/** Specs for one person's row: name, marital status, date / country of birth, address, occupation, accompany. */
function personRow(base, names, p, who) {
  const specs = [
    { som: `${base}/${names.name}`, const: p.name, native: true, need: `${who}: name` },
    { som: `${base}/${names.dob}`, const: p.dob, label: `${who}: date of birth` },
    { som: `${base}/${names.cob}`, const: p.country, need: `${who}: country of birth` },
    { som: `${base}/${names.address}`, const: p.address, need: `${who}: present address` },
    { som: `${base}/${names.occupation}`, const: p.occupation, need: `${who}: present occupation` },
    { som: `${base}/ChildMStatus`, const: MARITAL[p.marital] || p.marital, need: `${who}: marital status` },
  ];
  if (names.relationship) specs.push({ som: `${base}/${names.relationship}`, const: p.relationship, label: `${who}: relationship` });
  if (names.yes) {
    specs.push({ som: `${base}/${names.yes}`, const: p.accompany === true ? '1' : p.accompany === false ? '0' : '', need: `${who}: will accompany you to Canada? (Yes/No)` });
    specs.push({ som: `${base}/${names.no}`, const: p.accompany === false ? '1' : p.accompany === true ? '0' : '' });
  }
  return specs;
}

const CHILD = { name: 'ChildName', dob: 'ChildDOB', cob: 'ChildCOB', address: 'ChildAddress', occupation: 'ChildOccupation', relationship: 'ChildRelationship', yes: 'ChildYes', no: 'ChildNo' };

export function imm5645FieldMap(d = {}, app = {}) {
  const type = app.type || '';
  const which = kind(type);
  const married = ['Married', 'Common-Law'].includes(d.maritalStatus);
  // A spouse already in Canada (spouse-based applications) does not "accompany" the applicant.
  const spouseInCanada = has(d.inviterName) || /owp|sowp/.test(type);
  const spouseEnglish = has(d.spouseGivenName) || has(d.spouseFamilyName) ? `${d.spouseGivenName || ''} ${d.spouseFamilyName || ''}`.trim() : d.spouseName;
  const parentAccompany = (v) => (v === undefined || v === '' ? false : v);

  const applicant = {
    name: bilingual(`${d.givenName || ''} ${d.familyName || ''}`.trim(), d.nativeName),
    dob: d.dob,
    country: d.countryOfBirth,
    address: address(d),
    occupation: d.currentOccupation,
    marital: d.maritalStatus,
  };
  const spouse = married
    ? {
        name: bilingual(spouseEnglish, d.spouseNameNative),
        dob: d.spouseDob,
        country: d.spouseCountryOfBirth,
        address: d.inviterAddress || d.spouseAddress,
        occupation: d.spouseOccupation || d.inviterProgramOrJob,
        marital: d.maritalStatus,
        accompany: d.spouseAccompanying === true ? true : d.spouseAccompanying === false || spouseInCanada ? false : undefined,
      }
    : null;
  const parent = (who) => ({
    name: bilingual(d[`${who}Name`], d[`${who}NameNative`]),
    dob: d[`${who}Dob`],
    country: d[`${who}BirthCountry`],
    address: d[`${who}Address`],
    occupation: d[`${who}Occupation`],
    marital: d[`${who}MaritalStatus`],
    accompany: parentAccompany(d[`${who}Accompanying`]),
  });
  const kids = people(d.children).map((p) => ({ ...p, name: bilingual(p.name, p.native) }));
  const sibs = people(d.siblings).map((p) => ({ ...p, name: bilingual(p.name, p.native) }));

  const map = [
    ...['Visitor', 'Worker', 'Student', 'Other'].map((k) => ({ som: `${P}/Subform1/${k}`, const: k === which ? '1' : '0' })),
    ...personRow(`${P}/SectionA/Applicant`, { name: 'AppName', dob: 'AppDOB', cob: 'AppCOB', address: 'AppAddress', occupation: 'AppOccupation' }, applicant, 'Applicant'),
    ...(spouse
      ? personRow(`${P}/SectionA/Spouse`, { name: 'SpouseName', dob: 'SpouseDOB', cob: 'SpouseCOB', address: 'SpouseAddress', occupation: 'SpouseOccupation', yes: 'SpouseYes', no: 'SpouseNo' }, spouse, 'Spouse')
      : []),
    ...personRow(`${P}/SectionA/Mother`, { name: 'MotherName', dob: 'MotherDOB', cob: 'MotherCOB', address: 'MotherAddress', occupation: 'MotherOccupation', yes: 'MotherYes', no: 'MotherNo' }, parent('mother'), 'Mother'),
    ...personRow(`${P}/SectionA/Father`, { name: 'FatherName', dob: 'FatherDOB', cob: 'FatherCOB', address: 'FatherAddress', occupation: 'FatherOccupation', yes: 'FatherYes', no: 'FatherNo' }, parent('father'), 'Father'),
    ...kids.slice(0, 4).flatMap((p, i) => personRow(`${P}/SectionB/Child${i ? `[${i}]` : ''}`, CHILD, p, `Child ${i + 1}`)),
    ...sibs.slice(0, 7).flatMap((p, i) => personRow(`${P}/SectionC/Child${i ? `[${i}]` : ''}`, CHILD, p, `Brother/sister ${i + 1}`)),
  ];

  const notes = [];
  if (kids.length > 4) notes.push(`IMM 5645 has 4 rows for children; ${kids.length - 4} more go on an extra page`);
  if (sibs.length > 7) notes.push(`IMM 5645 has 7 rows for brothers and sisters; ${sibs.length - 7} more go on an extra page`);
  if (!has(d.nativeName)) notes.push('Applicant name in the native language is missing (intake: Personal details)');
  for (const who of ['mother', 'father']) if (!has(d[`${who}NameNative`])) notes.push(`${who === 'mother' ? 'Mother' : 'Father'}'s name in the native language is missing (intake: Family members)`);
  return { map, notes };
}

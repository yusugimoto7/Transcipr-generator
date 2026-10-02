/**
 * Field map: IMM 5713 (Use of a Family Member Representative for online
 * applications) — the family applies together in one submission, through one
 * member.
 *
 * Section A: the family member representative (full name, date of birth) and
 * the family members applying with them — name, relationship to the
 * representative, date of birth. For a spouse's file the representative is
 * the spouse (the principal applicant); for a child's file, a parent. Section
 * B (each adult's signature and date) and Section C are left to sign.
 */

import { people } from './imm5645';

const P = 'IMM_5713/page1';
const MINOR = /child|minor/;

/** "Arman Rezaei" → ["Rezaei", "Arman"] (family name last). */
function split(full = '') {
  const parts = String(full).replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] || '', ''];
  return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
}

/** The representative and the applicant's relationship to them. */
export function representative(d = {}, app = {}) {
  const type = app.type || '';
  const female = /^f/i.test(d.sex || '');
  if (MINOR.test(type) || d.minorArrangement) {
    // A parent represents the child: the one travelling with them, else the father.
    const motherFirst = /mother|mom|madar/i.test(d.accompanyingParent || '') || (d.motherName && String(d.accompanyingParent || '').includes(String(d.motherName).split(' ')[0]));
    const who = motherFirst ? 'mother' : 'father';
    const [family, given] = split(d[`${who}Name`]);
    return { family, given, dob: d[`${who}Dob`] || '', relationship: female ? 'Daughter' : 'Son', field: `${who}Name` };
  }
  return {
    family: d.spouseFamilyName || split(d.spouseName)[0],
    given: d.spouseGivenName || split(d.spouseName)[1],
    dob: d.spouseDob || '',
    relationship: 'Spouse',
    field: 'spouseGivenName',
  };
}

export function imm5713FieldMap(d = {}, app = {}) {
  const rep = representative(d, app);
  const members = [
    { name: [d.givenName, d.familyName].filter(Boolean).join(' '), relationship: rep.relationship, dob: d.dob, field: 'givenName' },
    // Children travelling too: a child of the applicant is the representative's child as well when the representative is the spouse.
    ...(rep.relationship === 'Spouse'
      ? people(d.children)
          .filter((c) => c.accompany === true)
          .map((c) => ({ name: c.name, relationship: c.relationship || 'Child', dob: c.dob, field: 'children' }))
      : []),
  ];
  const notes = [];
  if (members.length > 5) notes.push({ text: `IMM 5713 has 5 rows for family members; add the other ${members.length - 5} by hand`, field: 'children' });
  const map = [
    { som: `${P}/subNo1/familyName`, const: rep.family, need: 'Family member representative: family name', field: rep.field },
    { som: `${P}/subNo1/givenName`, const: rep.given, field: rep.field },
    { som: `${P}/subNo1/subNo2/dateBox/theDate`, const: rep.dob, need: 'Family member representative: date of birth', field: rep.field === 'spouseGivenName' ? 'spouseDob' : rep.field.replace(/Name$/, 'Dob') },
    ...members.slice(0, 5).flatMap((m, i) => [
      { som: `${P}/subNo3/subRow${i + 1}/TextField1`, const: m.name, label: `Family member ${i + 1}: name`, field: m.field },
      { som: `${P}/subNo3/subRow${i + 1}/TextField1[1]`, const: m.relationship, label: `Family member ${i + 1}: relationship`, field: m.field },
      { som: `${P}/subNo3/subRow${i + 1}/DateTimeField1`, const: m.dob, label: `Family member ${i + 1}: date of birth`, field: m.field === 'givenName' ? 'dob' : m.field },
    ]),
  ];
  return { map, notes };
}

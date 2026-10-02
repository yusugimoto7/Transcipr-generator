/**
 * Field map: IMM 5646 (Custodianship Declaration — Custodian for Minors
 * Studying in Canada), form version 01-01-2023.
 *
 * Page 1 is the custodian's declaration, page 2 the parents'; each repeats
 * the student, the parents (or legal guardians) and the custodian. The
 * student and parents come from the intake, the custodian from the minor
 * step's custodian questions. Signatures, notary and the "sworn at" lines
 * are left for the notary.
 */

import { ONE_PARENT } from '../../minor';

const P = 'IMM_5646';
const SEX = { Female: '1', Male: '2', 'Another gender': '3' };
const STATUS = { 'Canadian citizen': '1', 'Permanent resident': '2' };
const RESIDES = { 'With the custodian': '1', 'In the school dormitory': '2', 'With another person': '3' };

/** "Mahmoud Moradi" → ["Moradi", "Mahmoud"] (family name last). */
function split(full = '') {
  const parts = String(full).replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [parts[0] || '', ''];
  return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
}
const full = (...xs) => xs.filter(Boolean).join(' ').trim();

export function imm5646FieldMap(d = {}) {
  const [fFam, fGiv] = split(d.fatherName);
  const [mFam, mGiv] = split(d.motherName);
  const phone = [d.phoneCountryCode && `+${String(d.phoneCountryCode).replace(/^\+/, '')}`, d.phoneNumber].filter(Boolean).join(' ');
  const custodian = full(d.custodianGivenName, d.custodianFamilyName);
  const student = full(d.givenName, d.familyName);
  const school = [d.schoolName, d.schoolAddress].filter(Boolean).join(', ');
  // Travelling with one parent, the child lives with that parent unless the intake says otherwise.
  const withParent = d.minorArrangement === ONE_PARENT;
  const resides = d.childResides || (withParent ? 'With another person' : custodian ? 'With the custodian' : '');
  const residesWith = d.childResidesWith || (withParent && !d.childResides ? d.accompanyingParent : '');
  // Where the child lives: the dormitory, the custodian, or the parent in Canada.
  const residence =
    resides === 'In the school dormitory' ? d.schoolAddress
    : resides === 'With the custodian' ? d.custodianAddress
    : resides === 'With another person' ? (withParent ? d.parentAddress : '')
    : d.custodianAddress || d.parentAddress;
  const map = [];
  for (const page of ['Page1', 'Page2']) {
    const b = `${P}/${page}`;
    map.push(
      { som: `${b}/subStudentInfo/FamilyName`, from: 'familyName', need: page === 'Page1' ? 'Student family name' : undefined, field: 'familyName' },
      { som: `${b}/subStudentInfo/GivenNames`, from: 'givenName', field: 'givenName' },
      { som: `${b}/subStudentInfo/Citizenship`, from: 'citizenship', field: 'citizenship' },
      { som: `${b}/subStudentInfo/DOB/theDate`, from: 'dob', field: 'dob' },
      { som: `${b}/subStudentInfo/sex/mfGroup`, const: SEX[d.sex] || '', field: 'sex' },
      { som: `${b}/subStudentInfo/schoolAddress`, const: school, need: page === 'Page1' ? 'School name and address' : undefined, field: 'schoolAddress' },
      { som: `${b}/subStudentInfo/studentAddress`, const: residence || '', need: page === 'Page1' ? "Student's address in Canada" : undefined, field: 'custodianAddress' },
      { som: `${b}/subParent/Parents/Parent/parentFamilyName`, const: fFam, need: page === 'Page1' ? 'Father: name' : undefined, field: 'fatherName' },
      { som: `${b}/subParent/Parents/Parent/parentGivenNames`, const: fGiv, field: 'fatherName' },
      { som: `${b}/subParent/Parents/Parent/parentDOB/theDate`, from: 'fatherDob', field: 'fatherDob' },
      { som: `${b}/subParent/Parents/Parent/parentAddress`, from: 'fatherAddress', field: 'fatherAddress' },
      { som: `${b}/subParent/Parents/Parent/parentTelephone`, const: phone, field: 'phoneNumber' },
      { som: `${b}/subParent/Parents/Parent[1]/parentFamilyName`, const: mFam, need: page === 'Page1' ? 'Mother: name' : undefined, field: 'motherName' },
      { som: `${b}/subParent/Parents/Parent[1]/parentGivenNames`, const: mGiv, field: 'motherName' },
      { som: `${b}/subParent/Parents/Parent[1]/parentDOB/theDate`, from: 'motherDob', field: 'motherDob' },
      { som: `${b}/subParent/Parents/Parent[1]/parentAddress`, from: 'motherAddress', field: 'motherAddress' },
      { som: `${b}/subParent/Parents/Parent[1]/parentTelephone`, const: phone, field: 'phoneNumber' },
      { som: `${b}/subCustodian/FamilyName`, from: 'custodianFamilyName', need: page === 'Page1' ? 'Custodian: family name' : undefined, field: 'custodianFamilyName' },
      { som: `${b}/subCustodian/GivenNames`, from: 'custodianGivenName', field: 'custodianGivenName' },
      { som: `${b}/subCustodian/subStatus/statusGroup`, const: STATUS[d.custodianStatus] || '', need: page === 'Page1' ? 'Custodian: Canadian citizen or permanent resident' : undefined, field: 'custodianStatus' },
      { som: `${b}/subCustodian/DOB/theDate`, from: 'custodianDob', need: page === 'Page1' ? 'Custodian: date of birth' : undefined, field: 'custodianDob' },
      { som: `${b}/subCustodian/Address`, from: 'custodianAddress', need: page === 'Page1' ? 'Custodian: address' : undefined, field: 'custodianAddress' },
      { som: `${b}/subCustodian/Telephone`, from: 'custodianPhone', field: 'custodianPhone' },
    );
  }
  map.push(
    { som: `${P}/Page1/subDeclaration/nameCustodian`, const: custodian, field: 'custodianGivenName' },
    { som: `${P}/Page1/subDeclaration/nameStudent`, const: student },
    { som: `${P}/Page2/subDeclaration/childResideGroup`, const: RESIDES[resides] || '', field: 'childResides' },
    { som: `${P}/Page2/subDeclaration/nameOther`, const: resides === 'With another person' ? residesWith : '', field: 'childResidesWith' },
    { som: `${P}/Page2/subDeclaration/nameParent1`, const: full(fGiv, fFam) },
    { som: `${P}/Page2/subDeclaration/nameParent2`, const: full(mGiv, mFam) },
    { som: `${P}/Page2/subDeclaration/nameStudent`, const: student },
    { som: `${P}/Page2/subDeclaration/nameCust`, const: custodian, field: 'custodianGivenName' },
  );
  return { map: map.map((m) => (m.need === undefined ? (({ need, ...rest }) => rest)(m) : m)), notes: [] };
}

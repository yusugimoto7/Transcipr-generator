/**
 * Field map: IMM 5476 (Use of a Representative), form version 01-11-2025.
 *
 * Section A: the applicant. Section B: the representative — the firm's RCIC
 * (lib/firm.js), with the membership number and the office address, phone and
 * email. The Yes/No radio groups (appointing, paid / unpaid) and signatures are
 * left for the client to tick and sign; the text fields are the bulk of the form.
 */

const P = 'IMM_5476/Page1';

export function imm5476FieldMap() {
  return [
    // --- Section A: applicant ---
    { som: `${P}/SectionA/familyName/body/p/span`, from: 'familyName' },
    { som: `${P}/SectionA/givenName`, from: 'givenName' },
    { som: `${P}/SectionA/DOB`, from: 'dob' },
    { som: `${P}/SectionA/UCI`, from: 'uci' },
    { som: `${P}/SectionA/application`, from: '_applicationType' },

    // --- Section B: representative ---
    { som: `${P}/SectionB/familyName/body/p/span`, from: '_repFamilyName' },
    { som: `${P}/SectionB/givenName`, from: '_repGivenName' },
    { som: `${P}/SectionB/question6/questionII/ICCRCMember`, from: '_rcicNumber' },
    { som: `${P}/SectionB/question7/organization`, from: '_firmName' },
    { som: `${P}/SectionB/question7/membershipID`, from: '_rcicNumber' },
    { som: `${P}/SectionB/question7/unit`, from: '_firmUnit' },
    { som: `${P}/SectionB/question7/streetNo`, from: '_firmStreetNo' },
    { som: `${P}/SectionB/question7/streetName`, from: '_firmStreet' },
    { som: `${P}/SectionB/question7/city`, from: '_firmCity' },
    { som: `${P}/SectionB/question7/province`, from: '_firmProvince' },
    { som: `${P}/SectionB/question7/country`, from: '_firmCountry' },
    { som: `${P}/SectionB/question7/postalcode`, from: '_firmPostal' },
    { som: `${P}/SectionB/question7/phoneCountryCode`, from: '_firmPhoneCountry' },
    { som: `${P}/SectionB/question7/phoneNumber`, from: '_firmPhone' },
    { som: `${P}/SectionB/question7/email`, from: '_firmEmail' },
  ];
}

/** Intake data plus the firm's details the map reads (keys starting with "_"). */
export function imm5476Data(d = {}, firm = {}, applicationTitle = '') {
  const phone = String(firm.officePhone || firm.phone || '').replace(/[^\d+]/g, '');
  const m = phone.match(/^\+?(1)(\d{10})$/);
  return {
    ...d,
    _applicationType: applicationTitle,
    _repFamilyName: firm.repFamilyName || '',
    _repGivenName: firm.repGivenName || '',
    _rcicNumber: firm.rcicNumber || '',
    _firmName: firm.company || '',
    _firmUnit: firm.unit || '',
    _firmStreetNo: firm.streetNo || '',
    _firmStreet: firm.street || '',
    _firmCity: firm.city || '',
    _firmProvince: firm.province || '',
    _firmCountry: firm.country || '',
    _firmPostal: firm.postal || '',
    _firmPhoneCountry: m ? m[1] : '',
    _firmPhone: m ? m[2] : phone,
    _firmEmail: firm.officeEmail || firm.email || '',
  };
}

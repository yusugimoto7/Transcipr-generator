/**
 * Field map: IMM 5476 (Use of a Representative), form version 01-11-2025.
 *
 * Top: the client is appointing a representative. Section A: the applicant —
 * name, date of birth, email, UCI and the type of application (the box
 * "Application number" is left for IRCC's number). Section B: the
 * representative — the firm's RCIC (lib/firm.js), paid, a member of the
 * College of Immigration and Citizenship Consultants (CICC) with the
 * membership number, and the office address, phone and email. Signatures and
 * dates are left for the client and the RCIC.
 */

const P = 'IMM_5476/Page1';

export function imm5476FieldMap() {
  return [
    { som: `${P}/RadioButtonList`, const: '1', label: 'Appointing a representative' },

    // --- Section A: applicant ---
    { som: `${P}/SectionA/familyName`, from: 'familyName', need: 'Applicant family name', field: 'familyName' },
    { som: `${P}/SectionA/givenName`, from: 'givenName', field: 'givenName' },
    { som: `${P}/SectionA/DOB`, from: 'dob', need: 'Applicant date of birth', field: 'dob' },
    { som: `${P}/SectionA/office`, from: 'email', need: 'Applicant email address', field: 'email' },
    { som: `${P}/SectionA/UCI`, from: 'uci', field: 'uci' },
    { som: `${P}/SectionA/office[2]`, from: '_applicationType' },

    // --- Section B: representative ---
    { som: `${P}/SectionB/familyName`, from: '_repFamilyName' },
    { som: `${P}/SectionB/givenName`, from: '_repGivenName' },
    { som: `${P}/SectionB/question6/questionII/compensated`, const: '1', label: 'Paid representative: member of the CICC' },
    { som: `${P}/SectionB/question6/questionII/ICCRCMember`, from: '_rcicNumber' },
    { som: `${P}/SectionB/question7/organization`, from: '_firmName' },
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
    _firmAddress: [[firm.unit, firm.streetNo].filter(Boolean).join('-'), firm.street, firm.city, firm.province, firm.postal, firm.country].filter(Boolean).join(', ').replace(/^(\S+) /, '$1 '),
  };
}

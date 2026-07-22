/**
 * Field map: our intake fields -> IMM 1294 XFA SOM paths.
 *
 * Each entry:
 *   som       - full path under the XFA data root (verified against the form)
 *   from      - intake field id to read (omit if `const`)
 *   const     - a fixed value to write
 *   transform - 'year' | 'month' | 'day' to split an ISO date
 *   lov       - a value-list group name for coded fields (country/marital/...);
 *               the value is mapped to the IRCC code, and skipped if unmatched.
 *
 * NOTE: This is the personal-details + marital section, verified from the real
 * form schema. Remaining sections (passport, study, education, background) are
 * added as their SOM paths are confirmed via /api/forms/imm1294/schema.
 */
export const IMM1294_FIELD_MAP = [
  { som: 'form1/Page1/PersonalDetails/ServiceIn/ServiceIn', const: '01' },
  { som: 'form1/Page1/PersonalDetails/UCIClientID', from: 'uci' },
  { som: 'form1/Page1/PersonalDetails/Name/FamilyName', from: 'familyName' },
  { som: 'form1/Page1/PersonalDetails/Name/GivenName', from: 'givenName' },
  { som: 'form1/Page1/PersonalDetails/AliasName/AliasNameIndicator/AliasNameIndicator', const: 'N' },
  { som: 'form1/Page1/PersonalDetails/Sex/Sex', from: 'sex' },
  { som: 'form1/Page1/PersonalDetails/DOBYear', from: 'dob', transform: 'year' },
  { som: 'form1/Page1/PersonalDetails/DOBMonth', from: 'dob', transform: 'month' },
  { som: 'form1/Page1/PersonalDetails/DOBDay', from: 'dob', transform: 'day' },
  { som: 'form1/Page1/PersonalDetails/PlaceBirthCity', from: 'cityOfBirth' },
  { som: 'form1/Page1/PersonalDetails/PlaceBirthCountry', from: 'countryOfBirth', lov: 'CountryOfBirthList' },
  { som: 'form1/Page1/PersonalDetails/Citizenship/Citizenship', from: 'citizenship', lov: 'CountryOfCitizenshipList' },
  { som: 'form1/Page1/PersonalDetails/CurrentCOR/Row2/Country', from: 'countryOfResidence', lov: 'CountryList' },
  { som: 'form1/Page1/MaritalStatus/SectionA/MaritalStatus', from: 'maritalStatus', lov: 'MaritalStatusList' },
];

export const FIELD_MAPS = {
  imm1294: IMM1294_FIELD_MAP,
};

/**
 * Field map: intake fields -> IMM 1294 XFA SOM paths (form version 01-06-2026,
 * verified against the blank form's full 259-field schema).
 *
 * Entry: { som, from?, const?, transform?, lov?, valueMap?, when? }
 *   transform: 'year'|'month'|'day' splits an ISO date (YYYY-MM-DD)
 *   lov:       IRCC value-list name; value is mapped to its code, skipped if unmatched
 *   valueMap:  translate our option label to the form's expected text before lookup
 *   when:      predicate on data to include the field
 *
 * Coded fields use `lov`, so a mismatch is skipped (left blank for the applicant)
 * rather than filled with a wrong value. Structured mailing address & phone are
 * intentionally left for the applicant (we only hold free-text blobs).
 */

const has = (v) => String(v || '').trim().length > 0;

export const IMM1294_FIELD_MAP = [
  // --- Personal details (Page 1) ---
  { som: 'form1/Page1/PersonalDetails/UCIClientID', from: 'uci' },
  { som: 'form1/Page1/PersonalDetails/Name/FamilyName', from: 'familyName' },
  { som: 'form1/Page1/PersonalDetails/Name/GivenName', from: 'givenName' },
  // Alias indicator: Y when other names exist, else N.
  { som: 'form1/Page1/PersonalDetails/AliasName/AliasNameIndicator/AliasNameIndicator', const: 'Y', when: (d) => has(d.otherNames) },
  { som: 'form1/Page1/PersonalDetails/AliasName/AliasNameIndicator/AliasNameIndicator', const: 'N', when: (d) => !has(d.otherNames) },
  { som: 'form1/Page1/PersonalDetails/AliasName/AliasFamilyName', from: 'otherNames' },
  { som: 'form1/Page1/PersonalDetails/Sex/Sex', from: 'sex' },
  { som: 'form1/Page1/PersonalDetails/DOBYear', from: 'dob', transform: 'year' },
  { som: 'form1/Page1/PersonalDetails/DOBMonth', from: 'dob', transform: 'month' },
  { som: 'form1/Page1/PersonalDetails/DOBDay', from: 'dob', transform: 'day' },
  { som: 'form1/Page1/PersonalDetails/PlaceBirthCity', from: 'cityOfBirth' },
  { som: 'form1/Page1/PersonalDetails/PlaceBirthCountry', from: 'countryOfBirth', lov: 'CountryOfBirthList' },
  { som: 'form1/Page1/PersonalDetails/Citizenship/Citizenship', from: 'citizenship', lov: 'CountryOfCitizenshipList' },
  { som: 'form1/Page1/PersonalDetails/CurrentCOR/Row2/Country', from: 'countryOfResidence', lov: 'CountryList' },
  { som: 'form1/Page1/PersonalDetails/CurrentCOR/Row2/Status', from: 'residenceStatus', lov: 'ImmigrationStatusList' },
  {
    som: 'form1/Page1/MaritalStatus/SectionA/MaritalStatus',
    from: 'maritalStatus',
    valueMap: { 'Never Married / Single': 'Never Married/Single' },
    lov: 'MaritalStatusList',
  },

  // --- Language & passport (Page 2) ---
  { som: 'form1/Page2/MaritalStatus/SectionA/Languages/languages/nativeLang/nativeLang', from: 'firstLanguage', lov: 'ContactLanguageList' },
  {
    som: 'form1/Page2/MaritalStatus/SectionA/Languages/LanguageTest',
    from: 'languageTest',
    valueMap: {
      IELTS: 'Y', TOEFL: 'Y', PTE: 'Y', CELPIP: 'Y', 'TEF/TCF (French)': 'Y', Duolingo: 'Y', 'None yet': 'N',
    },
  },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/PassportNum/PassportNum', from: 'passportNumber' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/CountryofIssue/CountryofIssue', from: 'passportCountry', lov: 'CountryOfIssueList' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/IssueYYYY', from: 'passportIssue', transform: 'year' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/IssueMM', from: 'passportIssue', transform: 'month' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/IssueDD', from: 'passportIssue', transform: 'day' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/expiryYYYY', from: 'passportExpiry', transform: 'year' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/expiryMM', from: 'passportExpiry', transform: 'month' },
  { som: 'form1/Page2/MaritalStatus/SectionA/Passport/expiryDD', from: 'passportExpiry', transform: 'day' },

  // --- Contact (Page 2/3): only clean fields; structured address left to applicant ---
  { som: 'form1/Page2/contact/AddressRow2/Country/Country', from: 'countryOfResidence', lov: 'CountryList' },
  { som: 'form1/Page3/FaxEmail/Email', from: 'email' },

  // --- Details of intended study (Page 3) ---
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/schoolName/SchoolName', from: 'schoolName' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/schoolName/Level', from: 'levelOfStudy', lov: 'LevelOfStudyList' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/schoolName/Program', from: 'programName' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/ProvinceState/Prov', from: 'schoolProvince', lov: 'ProvinceAbbrevList' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/CityTown/CityTown', from: 'schoolCity' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/DLI', from: 'dliNumber' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/HowLongStudy/FromDate', from: 'programStart' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/HowLongStudy/ToDate', from: 'programEnd' },
  { som: 'form1/Page3/DetailsOfStudy/PurposeRow1/PAL/DocNum', from: 'palNumber' },
  { som: 'form1/Page3/Contacts_Row1/tuition/amount', from: 'tuitionCost' },
  { som: 'form1/Page3/Contacts_Row1/expensesPaid/Funds/Funds', from: 'totalFunds' },
  { som: 'form1/Page3/Contacts_Row1/expensesPaid/expensesPaidBy', from: 'fundingSource', lov: 'ExpensesPaidBySPList' },

  // --- Education history (Page 3) ---
  { som: 'form1/Page3/Education/EducationIndicator', const: 'Y', when: (d) => has(d.lastInstitution) },
  { som: 'form1/Page3/Education/Edu_Row1/FieldOfStudy', from: 'lastFieldOfStudy' },
  { som: 'form1/Page3/Education/Edu_Row1/School', from: 'lastInstitution' },
  { som: 'form1/Page3/Education/Edu_Row1/Country/Country', from: 'lastEduCountry', lov: 'CountryList' },
  { som: 'form1/Page3/Education/Edu_Row1/FromYear', from: 'lastEduFrom', transform: 'year' },
  { som: 'form1/Page3/Education/Edu_Row1/FromMonth', from: 'lastEduFrom', transform: 'month' },
  { som: 'form1/Page3/Education/Edu_Row1/ToYear', from: 'lastEduTo', transform: 'year' },
  { som: 'form1/Page3/Education/Edu_Row1/ToMonth', from: 'lastEduTo', transform: 'month' },

  // --- Current occupation (Page 3) ---
  { som: 'form1/Page3/Occupation/OccupationRow1/Occupation/Occupation', from: 'currentOccupation' },
  { som: 'form1/Page3/Occupation/OccupationRow1/Employer', from: 'employer' },
  { som: 'form1/Page3/Occupation/OccupationRow1/Country/Country', from: 'countryOfResidence', lov: 'CountryList', when: (d) => has(d.currentOccupation) },

  // --- Background (Page 4): fill refusal details; leave Y/N toggles to the applicant ---
  { som: 'form1/Page4/PageWrapper/BackgroundInfo2/Details/refusedDetails', from: 'refusalDetails', when: (d) => d.previousRefusal },
];

export const FIELD_MAPS = {
  imm1294: IMM1294_FIELD_MAP,
};

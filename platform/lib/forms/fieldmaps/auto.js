/**
 * Best-effort field map for ANY IRCC XFA form.
 *
 * IRCC builds its forms from one component library, so field paths end in
 * the same names across IMM 1294 / 1295 / 5257 / 5710 / 5709 (…/Name/FamilyName,
 * …/DOBYear, …/Passport/PassportNum/PassportNum, …). Given a form's real leaf
 * paths (dumped from the blank template), this matches each rule's suffix to
 * exactly one path and maps it to the intake field. Anything ambiguous or
 * unmatched is left blank for the applicant — never guessed.
 *
 * Forms with a hand-verified map (imm1294) use that instead.
 */

const has = (v) => String(v || '').trim().length > 0;

// [suffix regex, spec without `som`]
const RULES = [
  [/PersonalDetails\/UCIClientID$/, { from: 'uci' }],
  [/PersonalDetails\/Name\/FamilyName$/, { from: 'familyName' }],
  [/PersonalDetails\/Name\/GivenName$/, { from: 'givenName' }],
  [/AliasName\/AliasFamilyName$/, { from: 'otherNames' }],
  [/PersonalDetails\/Sex\/Sex$/, { from: 'sex' }],
  [/PersonalDetails\/DOBYear$/, { from: 'dob', transform: 'year' }],
  [/PersonalDetails\/DOBMonth$/, { from: 'dob', transform: 'month' }],
  [/PersonalDetails\/DOBDay$/, { from: 'dob', transform: 'day' }],
  [/PersonalDetails\/PlaceBirthCity$/, { from: 'cityOfBirth' }],
  [/PersonalDetails\/PlaceBirthCountry$/, { from: 'countryOfBirth', lov: 'CountryOfBirthList' }],
  [/Citizenship\/Citizenship$/, { from: 'citizenship', lov: 'CountryOfCitizenshipList' }],
  [/CurrentCOR\/Row2\/Country$/, { from: 'countryOfResidence', lov: 'CountryList' }],
  [/CurrentCOR\/Row2\/Status$/, { from: 'residenceStatus', lov: 'ImmigrationStatusList' }],
  [/SectionA\/MaritalStatus$/, { from: 'maritalStatus', valueMap: { 'Never Married / Single': 'Never Married/Single', 'Common-Law': 'Common-Law' }, lov: 'MaritalStatusList' }],
  [/Languages\/languages\/nativeLang\/nativeLang$/, { from: 'firstLanguage', lov: 'ContactLanguageList' }],
  [/Passport\/PassportNum\/PassportNum$/, { from: 'passportNumber' }],
  [/Passport\/CountryofIssue\/CountryofIssue$/, { from: 'passportCountry', lov: 'CountryOfIssueList' }],
  [/Passport\/IssueYYYY$/, { from: 'passportIssue', transform: 'year' }],
  [/Passport\/IssueMM$/, { from: 'passportIssue', transform: 'month' }],
  [/Passport\/IssueDD$/, { from: 'passportIssue', transform: 'day' }],
  [/Passport\/expiryYYYY$/, { from: 'passportExpiry', transform: 'year' }],
  [/Passport\/expiryMM$/, { from: 'passportExpiry', transform: 'month' }],
  [/Passport\/expiryDD$/, { from: 'passportExpiry', transform: 'day' }],
  [/contact\/AddressRow1\/POBox\/POBox$/, { from: 'mailingPobox' }],
  [/contact\/AddressRow1\/Apt\/AptUnit$/, { from: 'mailingUnit' }],
  [/contact\/AddressRow1\/StreetNum\/StreetNum$/, { from: 'mailingStreetNo' }],
  [/contact\/AddressRow1\/Streetname\/Streetname$/, { from: 'mailingStreet' }],
  [/contact\/AddressRow2\/CityTow\/CityTown$/, { from: 'mailingCity' }],
  [/contact\/AddressRow2\/Country\/Country$/, { from: 'mailingCountry', lov: 'CountryList' }],
  [/contact\/AddressRow2\/ProvinceState\/ProvinceState$/, { from: 'mailingProvince' }],
  [/contact\/AddressRow2\/PostalCode\/PostalCode$/, { from: 'mailingPostal' }],
  [/PhoneNumbers\/Phone\/Type$/, { from: 'phoneType', lov: 'PhoneTypeList' }],
  [/PhoneNumbers\/Phone\/NumberCountry$/, { from: 'phoneCountryCode' }],
  [/PhoneNumbers\/Phone\/IntlNumber\/IntlNumber$/, { from: 'phoneNumber' }],
  [/FaxEmail\/Email$/, { from: 'email' }],
  [/Education\/Edu_Row1\/FieldOfStudy$/, { from: 'lastFieldOfStudy' }],
  [/Education\/Edu_Row1\/School$/, { from: 'lastInstitution' }],
  [/Education\/Edu_Row1\/Country\/Country$/, { from: 'lastEduCountry', lov: 'CountryList' }],
  [/Occupation\/OccupationRow1\/Occupation\/Occupation$/, { from: 'currentOccupation' }],
  [/Occupation\/OccupationRow1\/Employer$/, { from: 'employer' }],
  // Inside-Canada forms: current permit / last entry.
  [/PrevCOR|PreviousCOR/, null], // explicitly skip previous-residence rows
  [/DateLastEntry|LastEntry.*Date/, { from: 'lastEntryDate' }],
  [/PlaceLastEntry|LastEntry.*Place/, { from: 'lastEntryPlace' }],
  [/refusedDetails$/, { from: 'refusalDetails', when: (d) => d.previousRefusal }],
];

/**
 * @param {string[]} paths - leaf SOM paths of the blank form
 * @returns {Array<{som:string, from?:string, transform?:string, lov?:string, valueMap?:object, when?:Function}>}
 */
export function autoFieldMap(paths) {
  const map = [];
  const used = new Set();
  for (const [re, spec] of RULES) {
    if (!spec) continue;
    const matches = paths.filter((p) => re.test(p));
    // Only map when the suffix identifies exactly one field on this form.
    if (matches.length !== 1 || used.has(matches[0])) continue;
    used.add(matches[0]);
    map.push({ som: matches[0], ...spec });
  }
  return map;
}

export { has };

/**
 * Field map for the IRCC main application forms — IMM 1294, 1295, 5257, 5708,
 * 5709 and 5710 — matched against each form's own resolved fields.
 *
 * IRCC builds these forms from one component library, so each section ends in
 * the same names on every form, under slightly different parents (the forms
 * for applicants outside Canada: …/PersonalDetails/CurrentCOR/Row2/Country;
 * inside Canada: …/CurrentCOR/CurrentCOR/Row2/Country). Each rule below is a
 * path ending that matches exactly one field on a form; a rule matching none
 * (the section is not on that form) or several is skipped, never guessed.
 *
 * Every Yes/No question is ticked from an intake answer; every date is written
 * to the date box the form shows (and to the hidden year / month / day copies
 * the form keeps for its barcode). A required answer missing from the intake
 * is reported as a blank to complete — so the file shows what is left to do.
 */

const has = (v) => String(v ?? '').trim().length > 0;
const yn = (v) => (v === true ? 'Y' : v === false ? 'N' : '');
const digits = (v) => String(v ?? '').replace(/[۰-۹]/g, (c) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/\D/g, '');

export const PROVINCE_ABBR = {
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
  newfoundland: 'NL', 'northwest territories': 'NT', 'nova scotia': 'NS', nunavut: 'NU', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', québec: 'QC', saskatchewan: 'SK', yukon: 'YT',
};
export function provinceAbbr(v) {
  const s = String(v ?? '').trim();
  if (/^[A-Z]{2}$/.test(s)) return s;
  return PROVINCE_ABBR[s.toLowerCase()] || '';
}

/** A UCI is 8 or 10 digits; anything else is not written. */
export function normalizeUci(v) {
  const d = digits(v);
  return d.length === 8 || d.length === 10 ? d : '';
}

/** "2019-06", "2019/6", "2019-06-15" or "2019" → ['2019', '06'] */
export function ym(v) {
  const m = String(v ?? '').trim().match(/^(\d{4})(?:[-/.](\d{1,2}))?/);
  return m ? [m[1], m[2] ? m[2].padStart(2, '0') : ''] : ['', ''];
}

/** Rows of a "a | b | c" list (one per line), trimmed; lines without "|" become one column. */
export function rows(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()));
}

const isCanada = (c) => /^canada$/i.test(String(c ?? '').trim());
const POST_SECONDARY = /trade|college|bachelor|post-graduate|master|doctor|professional/i;
const NO_POST_SECONDARY = /^(none|primary|secondary)/i;
const MARRIED = (d) => ['Married', 'Common-Law'].includes(d.maritalStatus);

/** Intake data plus the composed values the rules read (keys starting with "_"). */
export function irccData(d = {}, app = {}) {
  const [eduFromY, eduFromM] = ym(d.lastEduFrom);
  const [eduToY, eduToM] = ym(d.lastEduTo);
  const [jobFromY, jobFromM] = ym(d.currentJobFrom);
  const cc = digits(d.phoneCountryCode);
  const phone = digits(d.phoneNumber);
  const na = cc === '1' && phone.length === 10;
  const jobs = rows(d.employmentHistory).map(([from, to, occupation, employer, city, country]) => {
    const [fy, fm] = ym(from);
    const [ty, tm] = ym(to);
    return { fy, fm, ty, tm, occupation, employer, city, country };
  });
  let spouseFamily = d.spouseFamilyName || '';
  let spouseGiven = d.spouseGivenName || '';
  if (!spouseFamily && /,/.test(d.spouseName || '')) [spouseFamily, spouseGiven] = d.spouseName.split(',').map((s) => s.trim());
  const type = app.type || '';
  const out = {
    ...d,
    _uci: normalizeUci(d.uci),
    _aliasYN: has(d.otherNames) ? 'Y' : 'N',
    _pcrYN: yn(d.livedElsewhere5y),
    _cwaYN: yn(d.applyingFromResidence),
    _married: MARRIED(d),
    _spouseFamily: MARRIED(d) ? spouseFamily : '',
    _spouseGiven: MARRIED(d) ? spouseGiven : '',
    _marriageDate: MARRIED(d) ? d.marriageDate : '',
    _spouseCanadianYN: !MARRIED(d)
      ? ''
      : /permanent resident|citizen/i.test(d.inviterStatus || d.hostStatus || '')
        ? 'Y'
        : has(d.inviterStatus)
          ? 'N'
          : '',
    _prevMarriedYN: yn(d.previouslyMarried),
    _langTestYN: d.languageTest === 'None yet' ? 'N' : has(d.languageTest) ? 'Y' : '',
    _mostAtEase: d.ableToCommunicate === 'Both' ? d.mostAtEase : ['English', 'French'].includes(d.ableToCommunicate) ? d.ableToCommunicate : '',
    _natIdYN: has(d.nationalIdNumber) ? 'Y' : d.hasNationalId === false ? 'N' : '',
    _natIdNumber: digits(d.nationalIdNumber) || d.nationalIdNumber || '',
    _natIdCountry: d.nationalIdCountry || d.citizenship || '',
    _usYN: yn(d.usPermanentResident),
    _mailingProv: isCanada(d.mailingCountry) ? provinceAbbr(d.mailingProvince) : '',
    _mailingDistrict: isCanada(d.mailingCountry) ? '' : d.mailingProvince,
    _sameResYN: yn(d.sameResidential),
    _resProv: isCanada(d.resCountry) ? provinceAbbr(d.resProvince) : '',
    _resDistrict: isCanada(d.resCountry) ? '' : d.resProvince,
    _phoneCanUS: phone ? (cc === '1' ? '1' : '0') : '',
    _phoneOther: phone ? (cc === '1' ? '0' : '1') : '',
    _phoneCC: cc,
    _phoneIntl: na ? '' : phone,
    _phoneArea: na ? phone.slice(0, 3) : '',
    _phoneFirst3: na ? phone.slice(3, 6) : '',
    _phoneLast: na ? phone.slice(6) : '',
    _phoneActual: phone,
    _eduYN: POST_SECONDARY.test(d.highestEducation || '') ? 'Y' : NO_POST_SECONDARY.test(d.highestEducation || '') ? 'N' : '',
    _eduFieldLevel: [d.lastFieldOfStudy, d.highestEducation].filter(has).join(', '),
    _eduFromY: eduFromY,
    _eduFromM: eduFromM,
    _eduToY: eduToY,
    _eduToM: eduToM,
    _jobFromY: jobFromY,
    _jobFromM: jobFromM,
    _bgTb: yn(d.bgTbContact),
    _bgMedical: yn(d.bgMedicalCondition),
    _bgOverstay: yn(d.bgOverstay),
    _bgRefused: yn(d.previousRefusal),
    _bgPrevApplied: yn(d.previousCanadaApplication),
    _bgCriminal: yn(d.bgCriminal),
    _bgMilitary: yn(d.bgMilitary),
    _bgOrganization: yn(d.bgOrganization),
    _bgWitnessed: yn(d.bgWitnessed),
    _consentYN: yn(d.consentContact),
    _militaryText: rows(d.militaryDetails).map((r) => r.filter(has).join(', ')).join('; '),
    _workPermitType: d.workPermitType || (/^owp|sowp/.test(type) ? 'Open Work Permit' : type === 'imp-c11' ? 'Exemption from Labour Market Impact Assessment' : ''),
    _intendedProv: provinceAbbr(d.intendedProvince),
    _schoolProv: provinceAbbr(d.schoolProvince),
  };
  for (let i = 0; i < 2; i++) {
    const j = jobs[i] || {};
    Object.assign(out, {
      [`_job${i + 2}FromY`]: j.fy, [`_job${i + 2}FromM`]: j.fm, [`_job${i + 2}ToY`]: j.ty, [`_job${i + 2}ToM`]: j.tm,
      [`_job${i + 2}Occupation`]: j.occupation, [`_job${i + 2}Employer`]: j.employer,
      [`_job${i + 2}City`]: j.city, [`_job${i + 2}Country`]: j.country,
    });
  }
  return out;
}

/** A date field shown on the form, plus its hidden year / month / day copies. */
const date = (visible, hiddenBase, from, extra = {}) => [
  [visible, { from, ...extra }],
  ...(hiddenBase
    ? [
        [new RegExp(`${hiddenBase[0].source}$`), { from, transform: 'year' }],
        [new RegExp(`${hiddenBase[1].source}$`), { from, transform: 'month' }],
        [new RegExp(`${hiddenBase[2].source}$`), { from, transform: 'day' }],
      ]
    : []),
];

/** The sections every IRCC main form shares: [path ending, spec]. */
export const COMMON_RULES = [
  // --- Personal details ---
  [/PersonalDetails\/(ServiceIn\/)?UCIClientID$/, { from: '_uci', label: 'UCI (8 or 10 digits)' }],
  [/PersonalDetails\/ServiceIn\/ServiceIn$/, { const: 'English' }],
  [/PersonalDetails\/Name\/FamilyName$/, { from: 'familyName', need: 'Family name' }],
  [/PersonalDetails\/Name\/GivenName$/, { from: 'givenName' }],
  [/AliasName\/AliasNameIndicator\/AliasNameIndicator$/, { from: '_aliasYN' }],
  [/AliasName\/AliasFamilyName$/, { from: 'otherNames' }],
  [/[Ss]ex\/Sex$/, { from: 'sex', need: 'Sex' }],
  [/PersonalDetails\/(q3-4-5\/dob\/)?DOBYear$/, { from: 'dob', transform: 'year', need: 'Date of birth' }],
  [/PersonalDetails\/(q3-4-5\/dob\/)?DOBMonth$/, { from: 'dob', transform: 'month' }],
  [/PersonalDetails\/(q3-4-5\/dob\/)?DOBDay$/, { from: 'dob', transform: 'day' }],
  [/PlaceBirthCity$/, { from: 'cityOfBirth', need: 'City of birth (in English)' }],
  [/PlaceBirthCountry$/, { from: 'countryOfBirth', need: 'Country of birth' }],
  [/Citizenship\/Citizenship$/, { from: 'citizenship', need: 'Citizenship' }],

  // --- Current country of residence ---
  [/CurrentCOR\/Row2\/Country$/, { from: 'countryOfResidence', need: 'Country of residence' }],
  [/CurrentCOR\/Row2\/Status$/, { from: 'residenceStatus', need: 'Status in the country of residence' }],
  ...date(/CurrentCOR\/Row2\/FromDate$/, [/CORDates\/FromYr/, /CORDates\/FromMM/, /CORDates\/FromDD/], 'residenceFrom'),
  ...date(/CurrentCOR\/Row2\/ToDate$/, [/CORDates\/ToYr/, /CORDates\/ToMM/, /CORDates\/ToDD/], 'residenceTo'),

  // --- Previous countries of residence (past 5 years) ---
  [/PCRIndicator$/, { from: '_pcrYN', need: 'Lived in another country in the past 5 years? (Yes/No)' }],
  [/PreviousCOR\/Row2\/Country$/, { from: 'prevResidenceCountry', when: (d) => d.livedElsewhere5y === true }],
  [/PreviousCOR\/Row2\/Status$/, { from: 'prevResidenceStatus', when: (d) => d.livedElsewhere5y === true }],
  ...date(/PreviousCOR\/Row2\/FromDate$/, [/PCRDatesR1\/FromYr/, /PCRDatesR1\/FromMM/, /PCRDatesR1\/FromDD/], 'prevResidenceFrom', { when: (d) => d.livedElsewhere5y === true }),
  ...date(/PreviousCOR\/Row2\/ToDate$/, [/PCRDatesR1\/ToYr/, /PCRDatesR1\/ToMM/, /PCRDatesR1\/ToDD/], 'prevResidenceTo', { when: (d) => d.livedElsewhere5y === true }),

  // --- Country where applying (forms for applicants outside Canada) ---
  [/SameAsCORIndicator$/, { from: '_cwaYN', need: 'Applying from the country of residence? (Yes/No)' }],
  [/CountryWhereApplying\/Row2\/Country$/, { from: 'applyCountry', when: (d) => d.applyingFromResidence === false, need: 'Country applying from' }],
  [/CountryWhereApplying\/Row2\/Status$/, { from: 'applyStatus', when: (d) => d.applyingFromResidence === false }],
  ...date(/CountryWhereApplying\/Row2\/FromDate$/, [/CWADates\/FromYr/, /CWADates\/FromMM/, /CWADates\/FromDD/], 'applyFrom', { when: (d) => d.applyingFromResidence === false }),
  ...date(/CountryWhereApplying\/Row2\/ToDate$/, [/CWADates\/ToYr/, /CWADates\/ToMM/, /CWADates\/ToDD/], 'applyTo', { when: (d) => d.applyingFromResidence === false }),

  // --- Marital status, spouse ---
  [/MaritalStatus\/(SectionA|Current)\/MaritalStatus$/, { from: 'maritalStatus', need: 'Marital status' }],
  ...date(/DateOfMarriage$/, [/MarriageDate\/FromYr/, /MarriageDate\/FromMM/, /MarriageDate\/FromDD/], '_marriageDate', { need: 'Date of marriage', when: MARRIED }),
  [/MaritalStatus\/(SectionA|Current\/c)\/FamilyName$/, { from: '_spouseFamily', need: 'Spouse family name', when: MARRIED }],
  [/MaritalStatus\/(SectionA|Current\/c)\/GivenName$/, { from: '_spouseGiven', when: MARRIED }],
  [/MaritalStatus\/d\/SpouseStatus$/, { from: '_spouseCanadianYN', when: MARRIED }],

  // --- Previous marriage ---
  [/PrevMarriedIndicator$/, { from: '_prevMarriedYN', need: 'Previously married? (Yes/No)' }],
  [/PMFamilyName$/, { from: 'prevSpouseFamilyName', when: (d) => d.previouslyMarried === true }],
  [/PMGivenName$/, { from: 'prevSpouseGivenName', when: (d) => d.previouslyMarried === true }],
  [/(PrevSpouseDOB|PrevMarriage\/dob)\/DOBYear$/, { from: 'prevSpouseDob', transform: 'year', when: (d) => d.previouslyMarried === true }],
  [/(PrevSpouseDOB|PrevMarriage\/dob)\/DOBMonth$/, { from: 'prevSpouseDob', transform: 'month', when: (d) => d.previouslyMarried === true }],
  [/(PrevSpouseDOB|PrevMarriage\/dob)\/DOBDay$/, { from: 'prevSpouseDob', transform: 'day', when: (d) => d.previouslyMarried === true }],
  [/TypeOfRelationship$/, { from: 'prevRelationshipType', when: (d) => d.previouslyMarried === true }],
  ...date(/(MaritalStatus\/SectionA\/FromDate|PrevMarriage\/From\/FromDate)$/, [/PreviouslyMarriedDates\/FromYr/, /PreviouslyMarriedDates\/FromMM/, /PreviouslyMarriedDates\/FromDD/], 'prevRelationshipFrom', { when: (d) => d.previouslyMarried === true }),
  ...date(/(MaritalStatus\/SectionA\/ToDate\/ToDate|PrevMarriage\/To\/ToDate)$/, [/PreviouslyMarriedDates\/ToYr/, /PreviouslyMarriedDates\/ToMM/, /PreviouslyMarriedDates\/ToDD/], 'prevRelationshipTo', { when: (d) => d.previouslyMarried === true }),

  // --- Languages ---
  [/nativeLang(\/nativeLang)?$/, { from: 'firstLanguage', need: 'Native language' }],
  [/(ableToCommunicate\/ableToCommunicate|Languages\/communicateLang)$/, { from: 'ableToCommunicate', need: 'Able to communicate in English/French' }],
  [/(languages\/lov|Languages\/FreqLang)$/, { from: '_mostAtEase' }],
  [/(Languages\/LanguageTest|Languages\/LangTestIndicator)$/, { from: '_langTestYN', need: 'Language test taken? (Yes/No)' }],

  // --- Passport ---
  [/Passport\/PassportNum(\/PassportNum)?$/, { from: 'passportNumber', need: 'Passport number' }],
  [/Passport\/CountryofIssue(\/CountryofIssue)?$/, { from: 'passportCountry', need: 'Passport country of issue' }],
  ...date(/Passport\/IssueDate(\/IssueDate)?$/, [/Passport\/(IssueYYYY|Issue\/YYYY)/, /Passport\/(IssueMM|Issue\/MM)/, /Passport\/(IssueDD|Issue\/DD)/], 'passportIssue', { need: 'Passport issue date' }),
  ...date(/Passport\/ExpiryDate$/, [/Passport\/(expiryYYYY|Expiry\/YYYY)/, /Passport\/(expiryMM|Expiry\/MM)/, /Passport\/(expiryDD|Expiry\/DD)/], 'passportExpiry', { need: 'Passport expiry date' }),

  // --- National identity document, US PR card ---
  [/natID\/q1\/natIDIndicator$/, { from: '_natIdYN', need: 'National ID (number)' }],
  [/natIDdocs\/DocNum\/DocNum$/, { from: '_natIdNumber', when: (d) => d._natIdYN === 'Y' }],
  [/natIDdocs\/CountryofIssue\/CountryofIssue$/, { from: '_natIdCountry', when: (d) => d._natIdYN === 'Y' }],
  [/natIDdocs\/IssueDate\/IssueDate$/, { from: 'nationalIdIssue', when: (d) => d._natIdYN === 'Y' }],
  [/natIDdocs\/ExpiryDate$/, { from: 'nationalIdExpiry', when: (d) => d._natIdYN === 'Y' }],
  [/USCard\/q1\/usCardIndicator$/, { from: '_usYN', need: 'US permanent resident? (Yes/No)' }],

  // --- Mailing address ---
  [/(contact\/AddressRow1\/POBox\/POBox|Mailing\/AddrLine1\/POBox)$/, { from: 'mailingPobox' }],
  [/(contact\/AddressRow1\/Apt\/AptUnit|Mailing\/AddrLine1\/AptUnit)$/, { from: 'mailingUnit' }],
  [/(contact\/AddressRow1\/StreetNum\/StreetNum|Mailing\/AddrLine1\/StreetNum)$/, { from: 'mailingStreetNo' }],
  [/(contact\/AddressRow1\/Streetname\/Streetname|Mailing\/AddrLine1\/Streetname)$/, { from: 'mailingStreet', need: 'Mailing address: street' }],
  [/(contact\/AddressRow2\/CityTow\/CityTown|Mailing\/AddrLine2\/City)$/, { from: 'mailingCity', need: 'Mailing address: city' }],
  [/(contact\/AddressRow2\/Country\/Country|Mailing\/AddrLine2\/Country)$/, { from: 'mailingCountry', need: 'Mailing address: country' }],
  [/(contact\/AddressRow2\/ProvinceState\/ProvinceState|Mailing\/AddrLine2\/Prov)$/, { from: '_mailingProv' }],
  [/(contact\/AddressRow2\/PostalCode\/PostalCode|Mailing\/AddrLine2\/PostalCode)$/, { from: 'mailingPostal' }],
  [/(contact\/AddressRow2\/District|Mailing\/AddrLine2\/District)$/, { from: '_mailingDistrict' }],
  [/(SameAsMailingIndicator|SameAsMailingInd)$/, { from: '_sameResYN', need: 'Residential address same as mailing? (Yes/No)' }],

  // --- Residential address (when different) ---
  [/(ResidentialAddressRow1\/AptUnit\/AptUnit|Resi\/AddrLine1\/AptUnit)$/, { from: 'resUnit', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow1\/StreetNum\/StreetNum|Resi\/AddrLine1\/StreetNum)$/, { from: 'resStreetNo', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow1\/StreetName\/Streetname|Resi\/AddrLine1\/Streetname)$/, { from: 'resStreet', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow1\/CityTown\/CityTown|Resi\/AddrLine2\/City)$/, { from: 'resCity', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow2\/Country\/Country|Resi\/AddrLine2\/Country)$/, { from: 'resCountry', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow2\/ProvinceState\/ProvinceState|Resi\/AddrLine2\/Prov)$/, { from: '_resProv', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow2\/PostalCode\/PostalCode|Resi\/AddrLine2\/PostalCode)$/, { from: 'resPostal', when: (d) => d.sameResidential === false }],
  [/(ResidentialAddressRow2\/District|Resi\/AddrLine2\/District)$/, { from: '_resDistrict', when: (d) => d.sameResidential === false }],

  // --- Telephone, email ---
  [/(PhoneNumbers\/Phone|q3-4\/Phone)\/Type$/, { from: 'phoneType' }],
  [/(PhoneNumbers\/Phone|q3-4\/Phone\/CanOtherInd)\/CanadaUS$/, { from: '_phoneCanUS' }],
  [/(PhoneNumbers\/Phone|q3-4\/Phone\/CanOtherInd)\/Other$/, { from: '_phoneOther' }],
  [/(PhoneNumbers|q3-4)\/Phone\/NumberCountry$/, { from: '_phoneCC' }],
  [/(PhoneNumbers|q3-4)\/Phone\/IntlNumber\/IntlNumber$/, { from: '_phoneIntl' }],
  [/(PhoneNumbers|q3-4)\/Phone\/NANumber\/AreaCode$/, { from: '_phoneArea' }],
  [/(PhoneNumbers|q3-4)\/Phone\/NANumber\/FirstThree$/, { from: '_phoneFirst3' }],
  [/(PhoneNumbers|q3-4)\/Phone\/NANumber\/LastFive$/, { from: '_phoneLast' }],
  [/(PhoneNumbers|q3-4)\/Phone\/ActualNumber$/, { from: '_phoneActual', need: 'Phone number' }],
  [/(FaxEmail\/Email|Email\/Email)$/, { from: 'email', need: 'Email' }],

  // --- Education (the most recent post-secondary studies) ---
  [/Education\/EducationIndicator$/, { from: '_eduYN', need: 'Highest level of education' }],
  [/(Edu_Row1\/FromYear|EduLine1\/From\/YYYY)$/, { from: '_eduFromY', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1\/FromMonth|EduLine1\/From\/MM)$/, { from: '_eduFromM', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1\/ToYear|EduLine2\/To\/YYYY)$/, { from: '_eduToY', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1\/ToMonth|EduLine2\/To\/MM)$/, { from: '_eduToM', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1|EduLine1)\/FieldOfStudy$/, { from: '_eduFieldLevel', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1|EduLine1)\/School$/, { from: 'lastInstitution', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1\/CityTown|EduLine2\/City)$/, { from: 'lastEduCity', when: (d) => d._eduYN === 'Y' }],
  [/(Edu_Row1\/Country\/Country|EduLine2\/Country)$/, { from: 'lastEduCountry', when: (d) => d._eduYN === 'Y' }],

  // --- Employment: current, then two previous ---
  [/(OccupationRow1\/FromYear|EmpRec1\/Line1\/From\/YYYY)$/, { from: '_jobFromY', need: 'Current occupation: since (YYYY-MM)' }],
  [/(OccupationRow1\/FromMonth|EmpRec1\/Line1\/From\/MM)$/, { from: '_jobFromM' }],
  [/(OccupationRow1\/Occupation\/Occupation|EmpRec1\/Line1\/Occupation)$/, { from: 'currentOccupation', need: 'Current occupation (in English)' }],
  [/(OccupationRow1\/Employer|EmpRec1\/Line1\/Employer)$/, { from: 'employer' }],
  [/(OccupationRow1\/CityTown\/CityTown|EmpRec1\/Line2\/City)$/, { from: 'currentJobCity', need: 'Current occupation: city' }],
  [/(OccupationRow1\/Country\/Country|EmpRec1\/Line2\/Country)$/, { from: 'currentJobCountry', need: 'Current occupation: country' }],
  ...[2, 3].flatMap((n) => [
    [new RegExp(`(OccupationRow${n}\\/FromYear|EmpRec${n}\\/Line1\\/From\\/YYYY)$`), { from: `_job${n}FromY` }],
    [new RegExp(`(OccupationRow${n}\\/FromMonth|EmpRec${n}\\/Line1\\/From\\/MM)$`), { from: `_job${n}FromM` }],
    [new RegExp(`(OccupationRow${n}\\/ToYear|EmpRec${n}\\/Line2\\/To\\/YYYY)$`), { from: `_job${n}ToY` }],
    [new RegExp(`(OccupationRow${n}\\/ToMonth|EmpRec${n}\\/Line2\\/To\\/MM)$`), { from: `_job${n}ToM` }],
    [new RegExp(`(OccupationRow${n}\\/Occupation\\/Occupation|EmpRec${n}\\/Line1\\/Occupation)$`), { from: `_job${n}Occupation` }],
    [new RegExp(`(OccupationRow${n}\\/Employer|EmpRec${n}\\/Line1\\/Employer)$`), { from: `_job${n}Employer` }],
    [new RegExp(`(OccupationRow${n}\\/CityTown\\/CityTown|EmpRec${n}\\/Line2\\/City)$`), { from: `_job${n}City` }],
    [new RegExp(`(OccupationRow${n}\\/Country\\/Country|EmpRec${n}\\/Line2\\/Country)$`), { from: `_job${n}Country` }],
  ]),

  // --- Background questions: forms for applicants outside Canada (1294, 1295, 5257) ---
  [/BackgroundInfo\/Choice$/, { from: '_bgTb', need: 'Background 1a: tuberculosis (Yes/No)' }],
  [/BackgroundInfo\/Choice\[1\]$/, { from: '_bgMedical', need: 'Background 1b: medical disorder (Yes/No)' }],
  [/BackgroundInfo\/Details\/MedicalDetails$/, { from: 'medicalDetails' }],
  [/BackgroundInfo2\/VisaChoice1$/, { from: '_bgOverstay', need: 'Background 2a: overstayed / worked or studied without authorization (Yes/No)' }],
  [/BackgroundInfo2\/VisaChoice2$/, { from: '_bgRefused', need: 'Background 2b: refused a visa or permit (Yes/No)' }],
  [/BackgroundInfo2\/(Details\/)?VisaChoice3$/, { from: '_bgPrevApplied', need: 'Background 2c: previously applied to Canada (Yes/No)' }],
  [/BackgroundInfo2\/Details\/refusedDetails$/, { from: 'refusalDetails' }],
  [/BackgroundInfo3\/Choice$/, { from: '_bgCriminal', need: 'Background 3a: criminal offence (Yes/No)' }],
  [/BackgroundInfo3\/(Details|details|militaryServiceDetails)$/, { from: 'criminalDetails' }],
  [/Military\/Choice$/, { from: '_bgMilitary', need: 'Background 4a: military service (Yes/No)' }],
  [/Military\/militaryServiceDetails$/, { from: '_militaryText' }],
  [/PageWrapper\/Occupation\/Choice$/, { from: '_bgOrganization', need: 'Background 5: political / violent organization (Yes/No)' }],
  [/PageWrapper\/GovPosition\/Choice$/, { from: '_bgWitnessed', need: 'Background 6: witnessed ill treatment (Yes/No)' }],

  // --- Background questions: forms for applicants inside Canada (5708, 5709, 5710) ---
  [/HealthQ\/qANY$/, { from: '_bgTb', need: 'Background 1a: tuberculosis (Yes/No)' }],
  [/HealthQ\/qBNY$/, { from: '_bgMedical', need: 'Background 1b: medical disorder (Yes/No)' }],
  [/HealthQ\/MedicalDetails$/, { from: 'medicalDetails' }],
  [/PrevApplied\/qANY$/, { from: '_bgOverstay', need: 'Background 2a: overstayed / worked or studied without authorization (Yes/No)' }],
  [/PrevApplied\/qBNY$/, { from: '_bgRefused', need: 'Background 2b: refused a visa or permit (Yes/No)' }],
  [/PrevApplied\/qCNY$/, { from: '_bgPrevApplied', need: 'Background 2c: previously applied to Canada (Yes/No)' }],
  [/PrevApplied\/refusedDetails$/, { from: 'refusalDetails' }],
  [/Criminal\/qANY$/, { from: '_bgCriminal', need: 'Background 3a: criminal offence (Yes/No)' }],
  [/Criminal\/refusedDetails$/, { from: 'criminalDetails' }],
  [/Military\/qANY$/, { from: '_bgMilitary', need: 'Background 4a: military service (Yes/No)' }],
  [/GovPosition\/qGovtNY$/, { from: '_bgOrganization', need: 'Background 5: political / violent organization (Yes/No)' }],
  [/Illtreatment\/qWitnessNY$/, { from: '_bgWitnessed', need: 'Background 6: witnessed ill treatment (Yes/No)' }],

  // --- Signature section: consent to be contacted by IRCC in the future ---
  [/(Consent0\/Choice|Signature\/FutureComm)$/, { from: '_consentYN', need: 'Consent to be contacted by IRCC (Yes/No)' }],
];

const LEVEL_OF_STUDY = {
  'Secondary / high school': 'Secondary',
  'College diploma / certificate': 'College - Diploma',
  'Bachelor’s degree': "University - Bachelor's Degree",
  'Post-graduate diploma': 'College - Post Graduate Diploma',
  'Master’s degree': "University - Master's Degree",
  'Doctorate (PhD)': 'University - Doctorate',
};
const EXPENSES_PAID_BY = { Self: 'Myself', 'Parents / family': 'Parents', Scholarship: 'Other', Sponsor: 'Other', Loan: 'Myself', Combination: 'Other' };
const VISIT_PURPOSE = {
  Tourism: 'Tourism',
  'Visiting family': 'Family Visit',
  'Visiting a friend': 'Visit',
  Business: 'Business',
  'Attending an event (graduation, wedding)': 'Other',
  'Accompanying a family member': 'Family Visit',
  Other: 'Other',
};

/** Form-specific sections. */
export const EXTRA_RULES = {
  imm1295: [
    [/PersonalDetails\/VisaType\/VisaType$/, { from: 'visaRequested', need: 'Visa requested (Single / Multiple)' }],
    [/TypeofWork\/WorkPermitType$/, { from: '_workPermitType', need: 'Type of work permit' }],
    [/PurposeRow1\/EmployerName\/EmployerName$/, { from: 'intendedEmployer' }],
    [/PurposeRow1\/Address\/Address$/, { from: 'intendedEmployerAddress' }],
    [/intendedLocation\/ProvinceState\/ProvinceState$/, { from: '_intendedProv', need: 'Intended province in Canada' }],
    [/intendedLocation\/CityTown\/CityTown$/, { from: 'intendedCity', lov: (d) => d._intendedProv && `CityList.${d._intendedProv}`, need: 'Intended city in Canada' }],
    [/intendedLocation\/Address$/, { from: 'intendedAddress' }],
    [/DetailsOfWorkCont\/details\/jobTitle$/, { from: 'intendedJobTitle' }],
    [/DetailsOfWorkCont\/details\/posDesc$/, { from: 'intendedDuties' }],
    [/DetailsOfWorkCont\/details\/HowLongStudy\/FromDate$/, { from: 'intendedFrom', need: 'Work permit from (date)' }],
    [/DetailsOfWorkCont\/details\/HowLongStudy\/ToDate$/, { from: 'intendedTo', need: 'Work permit until (date)' }],
    [/DetailsOfWorkCont\/details\/LMO\/LMO$/, { from: 'lmiaNumber' }],
  ],
  imm1294: [
    [/DetailsOfStudy\/PurposeRow1\/schoolName\/SchoolName$/, { from: 'schoolName', need: 'School name' }],
    [/DetailsOfStudy\/PurposeRow1\/schoolName\/Level$/, { from: 'levelOfStudy', valueMap: LEVEL_OF_STUDY, need: 'Level of study' }],
    [/DetailsOfStudy\/PurposeRow1\/ProvinceState\/Prov$/, { from: '_schoolProv', need: 'School province' }],
    [/DetailsOfStudy\/PurposeRow1\/CityTown\/CityTown$/, { from: 'schoolCity', lov: (d) => d._schoolProv && `CityList.${d._schoolProv}`, need: 'School city' }],
    [/DetailsOfStudy\/PurposeRow1\/DLI$/, { from: 'dliNumber', need: 'DLI number' }],
    [/DetailsOfStudy\/PurposeRow1\/HowLongStudy\/FromDate$/, { from: 'programStart', need: 'Program start date' }],
    [/DetailsOfStudy\/PurposeRow1\/HowLongStudy\/ToDate$/, { from: 'programEnd', need: 'Program end date' }],
    [/Contacts_Row1\/PAL\/DocNum$/, { from: 'palNumber' }],
    [/Contacts_Row1\/tuition\/amount$/, { from: 'tuitionCost', need: 'Tuition cost' }],
    [/Contacts_Row1\/expensesPaid\/Funds\/Funds$/, { from: 'totalFunds', need: 'Funds available' }],
    [/Contacts_Row1\/expensesPaid\/expensesPaidBy$/, { from: 'fundingSource', valueMap: EXPENSES_PAID_BY }],
  ],
  imm5257: [
    [/PersonalDetails\/VisaType\/VisaType$/, { const: 'Visitor Visa' }],
    [/PurposeOfVisit\/PurposeOfVisit$/, { from: 'visitPurpose', valueMap: VISIT_PURPOSE, need: 'Purpose of visit' }],
    [/DetailsOfVisit\/PurposeRow1\/Other\/Other$/, { from: 'visitPurpose', when: (d) => VISIT_PURPOSE[d.visitPurpose] === 'Other' }],
    [/HowLongStay\/FromDate$/, { from: 'visitFrom', need: 'Visit from (date)' }],
    [/HowLongStay\/ToDate$/, { from: 'visitTo', need: 'Visit to (date)' }],
    [/DetailsOfVisit\/PurposeRow1\/Funds\/Funds$/, { from: 'totalFunds', need: 'Funds available for the stay' }],
    [/DetailsOfVisit\/Contacts_Row1\/Name\/Name$/, { from: 'hostName' }],
    [/DetailsOfVisit\/Contacts_Row1\/RelationshipToMe\/RelationshipToMe$/, { from: 'hostRelationship' }],
    [/DetailsOfVisit\/Contacts_Row1\/AddressInCanada\/AddressInCanada$/, { from: 'hostAddress' }],
  ],
  // Inside Canada: how and when the applicant came in.
  inside: [
    [/ComingIntoCda\/OrigEntry\/DateLastEntry$/, { from: 'lastEntryDate', need: 'Date of first entry to Canada' }],
    [/ComingIntoCda\/OrigEntry\/Place$/, { from: 'lastEntryPlace', need: 'Place of entry to Canada' }],
    [/ComingIntoCda\/PrevDocNum\/docNum$/, { from: 'permitNumber' }],
  ],
  imm5708: [
    [/ApplyingFor\/Extend$/, { const: '1' }],
    [/DetailsOfVisit\/Purpose\/Stay\/ToDate$/, { from: 'extendUntil', need: 'Stay until (date)' }],
    [/DetailsOfVisit\/Funds\/FundsAvail$/, { from: 'extendFunds', need: 'Funds for the extended stay' }],
  ],
};
EXTRA_RULES.imm5708.push(...EXTRA_RULES.inside);
EXTRA_RULES.imm5709 = [...EXTRA_RULES.inside];
EXTRA_RULES.imm5710 = [...EXTRA_RULES.inside];

/**
 * The field map of one form: every rule whose path ending matches exactly one
 * of the form's fields, as { som, ...spec }.
 */
export function irccFieldMap(formKey, fields) {
  const paths = fields.map((f) => (typeof f === 'string' ? f : f.path));
  const map = [];
  const used = new Set();
  for (const [re, spec] of [...COMMON_RULES, ...(EXTRA_RULES[formKey] || [])]) {
    const hits = paths.filter((p) => re.test(p));
    if (hits.length !== 1 || used.has(hits[0])) continue;
    used.add(hits[0]);
    map.push({ som: hits[0], ...spec });
  }
  return map;
}

export const IRCC_MAIN_FORMS = new Set(['imm1294', 'imm1295', 'imm5257', 'imm5708', 'imm5709', 'imm5710']);
export { has, yn, digits };

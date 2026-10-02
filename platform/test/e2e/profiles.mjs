// Fictional clients for the end-to-end runs (test/e2e/run.mjs): one per
// application type. Every name, number and address here is invented.
//
// Each client has:
//   file      how the team opens the file (number, title)
//   emailed   documents the client emails in (their own messy file names)
//   uploaded  documents the team uploads (named the team's way)
//   reads     what a careful reader finds in each document (the stub AI
//             answers with exactly this, so the run tests the platform, not
//             the model): { tag: { category, owner, fields } }
//   team      the answers the team adds by hand in the intake afterwards
//   expect    what the filled forms must show: { formKey: { pathEnd: value } }

const iranAddress = {
  mailingUnit: '4', mailingStreetNo: '27', mailingStreet: 'Chaharbagh Abbasi Street', mailingCity: 'Isfahan',
  mailingProvince: 'Isfahan', mailingCountry: 'Iran', mailingPostal: '8174673111', sameResidential: true,
};


/* ------------------------------ a fictional person ------------------------------ */
// Everything a client's own documents say, and what the team adds, for one
// adult (or child) applicant. The type-specific answers come on top.
let serial = 0;
function person(o) {
  serial++;
  const first = o.given;
  const minor = !!o.minor;
  const married = ['Married', 'Common-Law'].includes(o.marital);
  const reads = {
    PASSPORT: { category: 'passport', fields: { familyName: o.family, givenName: o.given, sex: o.sex, dob: o.dob, cityOfBirth: o.city || 'Tehran', countryOfBirth: 'Iran', citizenship: 'Iran', passportNumber: `Z${String(10000000 + serial * 7919).slice(0, 8)}`, passportCountry: 'Iran', passportIssue: '2024-03-02', passportExpiry: '2029-03-01' } },
    BIRTH: { category: 'national-id', fields: { nativeName: o.native, fatherName: `${o.father || 'Mahmoud'} ${o.family}`, fatherNameNative: o.fatherFa || 'محمود', motherName: o.mother || 'Fatemeh Rahimi', motherNameNative: o.motherFa || 'فاطمه رحیمی' } },
    NATIONALID: { category: 'national-id', fields: { nationalIdNumber: String(1000000000 + serial * 104729).slice(0, 10), nationalIdIssue: '2020-01-15', nationalIdExpiry: '2030-01-15' } },
    PHOTO: { category: 'photo', fields: {} },
  };
  if (!minor && o.degree !== false) {
    reads.DEGREE = { category: 'transcripts', fields: { highestEducation: o.degreeLevel || "Bachelor's degree", lastInstitution: o.school || 'University of Tehran', lastFieldOfStudy: o.field || 'Civil Engineering', lastEduFrom: o.eduFrom || '2009-09', lastEduTo: o.eduTo || '2013-07', lastEduCity: o.eduCity || 'Tehran', lastEduCountry: 'Iran' } };
  }
  if (o.job) reads.JOB = { category: 'employment-letter', fields: { jobs: [o.job, ...(o.prevJobs || [])] } };
  if (o.military) reads.MILITARY = { category: 'military', fields: { bgMilitary: true, militaryService: [o.military] } };
  if (married && !minor) reads.MARRIAGE = { category: 'marriage-cert', fields: { maritalStatus: o.marital, marriageDate: o.marriageDate || '2012-06-20', spouseGivenName: o.spouseGiven, spouseFamilyName: o.spouseFamily, spouseNameNative: o.spouseFa, spouseDob: o.spouseDob || '1985-04-04', spouseCountryOfBirth: 'Iran' } };
  const emailed = [
    { name: 'passport.pdf', tag: 'PASSPORT', pages: 3 },
    { name: `shenasnameh ${first}.pdf`, tag: 'BIRTH', pages: 2 },
    { name: 'kart melli.pdf', tag: 'NATIONALID' },
    ...(reads.DEGREE ? [{ name: 'daneshname.pdf', tag: 'DEGREE', pages: 2 }] : []),
  ];
  const tagged = [
    { name: `104 - Photo - ${first}.jpg`, tag: 'PHOTO', image: true },
    ...(reads.JOB ? [{ name: `113 - Employment Letter - ${first}.pdf`, tag: 'JOB' }] : []),
    ...(reads.MILITARY ? [{ name: `130 - Military Service - ${first}.pdf`, tag: 'MILITARY' }] : []),
    ...(reads.MARRIAGE ? [{ name: `116 - Marriage Certificate - ${first}.pdf`, tag: 'MARRIAGE', pages: 2 }] : []),
  ];
  const inside = o.inside;
  const address = inside
    ? { mailingUnit: '1205', mailingStreetNo: '889', mailingStreet: 'Demo Avenue', mailingCity: o.caCity || 'Vancouver', mailingProvince: o.caProv || 'British Columbia', mailingCountry: 'Canada', mailingPostal: 'V6B 0A1', sameResidential: true }
    : { mailingUnit: String(serial), mailingStreetNo: String(10 + serial), mailingStreet: o.street || 'Valiasr Street', mailingCity: o.homeCity || 'Tehran', mailingProvince: o.homeCity || 'Tehran', mailingCountry: 'Iran', mailingPostal: `19${String(10000000 + serial * 12345).slice(0, 8)}`, sameResidential: true };
  const team = {
    ...address,
    usPermanentResident: false,
    countryOfResidence: inside ? 'Canada' : 'Iran',
    residenceStatus: inside ? o.caStatus || 'Worker' : 'Citizen',
    residenceFrom: inside ? o.caFrom || '2024-08-20' : o.dob,
    ...(inside ? { residenceTo: o.caTo || '2026-12-31' } : {}),
    applyingFromResidence: true,
    livedElsewhere5y: false,
    phoneType: 'Cellular',
    phoneCountryCode: inside ? '1' : '98',
    phoneNumber: inside ? `604555${String(1000 + serial).slice(-4)}` : `912${String(1000000 + serial * 1111).slice(-7)}`,
    email: o.email,
    ...(married
      ? { spouseCitizenship: 'Iran', spouseAddress: o.spouseAddress || 'Same as the applicant', spouseOccupation: o.spouseJob || 'Accountant', spouseAccompanying: !!o.spouseAccompanying }
      : {}),
    maritalStatus: o.marital || 'Never Married / Single',
    previouslyMarried: false,
    fatherDob: o.fatherDob || '1955-01-01', fatherBirthCountry: 'Iran', fatherAddress: o.parentsAddress || 'Tehran, Iran', fatherOccupation: o.fatherJob || 'Retired', fatherMaritalStatus: 'Married-physically present', fatherAccompanying: false,
    motherDob: o.motherDob || '1958-01-01', motherBirthCountry: 'Iran', motherAddress: o.parentsAddress || 'Tehran, Iran', motherOccupation: 'Homemaker', motherMaritalStatus: 'Married-physically present', motherAccompanying: false,
    ...(o.siblings ? { siblings: o.siblings } : {}),
    ...(o.children ? { children: o.children } : {}),
    bgTbContact: false, bgMedicalCondition: false, bgOverstay: false, previousRefusal: false, previousCanadaApplication: !!inside, bgCriminal: false,
    ...(o.military ? {} : { bgMilitary: false }),
    bgOrganization: false, bgGovPosition: false, bgWitnessed: false, consentContact: true,
    ...(inside && o.team?.canadaHistory ? { refusalDetails: o.team.canadaHistory } : {}),
    firstLanguage: 'Persian', ableToCommunicate: o.english === false ? 'Neither' : 'English',
    languageTest: o.ielts ? 'IELTS' : 'None yet',
    ...(o.ielts ? { languageScore: o.ielts, languageTestDate: '2026-05-20' } : {}),
    previousCanada: !!inside,
    travelledAbroad: o.trips !== false,
    ...(o.trips !== false ? { trips: o.trips || [{ from: '2025-04', to: '2025-04', country: 'Turkey', city: 'Istanbul', purpose: 'Tourism' }] } : {}),
    ...(o.noJob ? { jobs: [{ from: o.noJobFrom || '2023-01', to: '', occupation: o.noJob, employer: '', city: o.homeCity || 'Tehran', country: inside ? 'Canada' : 'Iran' }] } : {}),
    ...(o.immigrationApps ? { immigrationApps: o.immigrationApps } : {}),
    homeTies: o.ties || 'Owns an apartment in Tehran; parents and siblings live in Iran.',
    ...(o.team || {}),
  };
  return {
    file: { clientNumber: o.number, title: `${o.given} ${o.family}`, representation: 'firm' },
    email: o.email,
    emailed,
    uploaded: tagged,
    fromChecklist: true,
    reads,
    team,
    expect: o.expect || {},
  };
}

// Shorter rows for the profiles below.
const job = (occupation, employer, from, city = 'Tehran', to = '') => ({ from, to, occupation, employer, city, country: 'Iran' });
const army = (from, to, location = 'Army of the Islamic Republic of Iran, 21st Division', province = 'Tehran') => ({ from, to, location, province, country: 'Iran' });
const caApp = (kind, applied, decided, result = 'Approved', details = '') => ({ country: 'Canada', kind, applied, result, decided, details });

export const PROFILES = {
  'study-permit': {
    file: { clientNumber: 'S27101', title: 'Arman Rezaei', representation: 'firm' },
    email: 'arman.rezaei@example.test',
    emailed: [
      { name: 'passport scan.pdf', tag: 'PASSPORT', pages: 3 },
      { name: 'shenasnameh.pdf', tag: 'BIRTH', pages: 2 },
      { name: 'melli card.pdf', tag: 'NATIONALID' },
      { name: 'IMG_2041.pdf', tag: 'DEGREE' },
      { name: 'military card.pdf', tag: 'MILITARY' },
    ],
    uploaded: [
      { name: '104 - Photo - Arman.jpg', tag: 'PHOTO', image: true },
      { name: '106 - Transcript - Arman.pdf', tag: 'TRANSCRIPT', pages: 2 },
      { name: '107 - Letter of Acceptance - Arman.pdf', tag: 'LOA', pages: 2 },
      { name: '107-1 - PAL - Arman.pdf', tag: 'PAL' },
      { name: '109 - Tuition Receipt - Arman.pdf', tag: 'TUITION' },
      { name: '110 - IELTS - Arman.pdf', tag: 'IELTS' },
      { name: '112 - Bank Statement - Arman.pdf', tag: 'BANK', pages: 3 },
      { name: '123 - Bank Statement - Father.pdf', tag: 'BANKFATHER', pages: 2 },
      { name: '113 - Employment Letter - Arman.pdf', tag: 'JOB' },
      { name: '115 - Police Clearance - Arman.pdf', tag: 'POLICE' },
      { name: '116 - Marriage Certificate - Arman.pdf', tag: 'MARRIAGE', pages: 2 },
      { name: '120 - Property Deed - Father.pdf', tag: 'DEED', pages: 2 },
      { name: 'Affidavit of Support - Father.pdf', tag: 'SPONSOR' },
      { name: '127 - CV - Arman.pdf', tag: 'CV' },
      { name: '131 - Refusal Letter - Arman.pdf', tag: 'REFUSAL' },
    ],
    reads: {
      PASSPORT: { category: 'passport', fields: { familyName: 'Rezaei', givenName: 'Arman', sex: 'Male', dob: '1998-05-14', cityOfBirth: 'Isfahan', countryOfBirth: 'Iran', citizenship: 'Iran', passportNumber: 'Z00000001', passportCountry: 'Iran', passportIssue: '2024-02-11', passportExpiry: '2029-02-10' } },
      BIRTH: { category: 'national-id', fields: { nativeName: 'آرمان رضایی', fatherName: 'Hossein Rezaei', fatherNameNative: 'حسین رضایی', motherName: 'Maryam Ahmadi', motherNameNative: 'مریم احمدی' } },
      NATIONALID: { category: 'national-id', fields: { nationalIdNumber: '1270000001', nationalIdIssue: '2019-06-01', nationalIdExpiry: '2029-06-01' } },
      DEGREE: { category: 'transcripts', fields: { highestEducation: "Bachelor's degree", lastInstitution: 'Isfahan University of Technology', lastFieldOfStudy: 'Software Engineering', lastEduFrom: '2016-09', lastEduTo: '2020-06', lastEduCity: 'Isfahan', lastEduCountry: 'Iran' } },
      MILITARY: { category: 'military', fields: { bgMilitary: true, militaryService: [{ from: '2020-08', to: '2022-02', location: 'Army of the Islamic Republic of Iran, 16th Armoured Division', province: 'Isfahan', country: 'Iran' }] } },
      PHOTO: { category: 'photo', fields: {} },
      TRANSCRIPT: { category: 'transcripts', fields: { gpa: '16.8 / 20' } },
      LOA: { category: 'loa', fields: { schoolName: 'Northwind College of Technology', dliNumber: 'O000000000001', programName: 'Post-Graduate Diploma in Data Analytics', levelOfStudy: 'Post-graduate diploma', schoolCity: 'Vancouver', schoolProvince: 'British Columbia', schoolAddress: '1200 West Demo Street, Vancouver, BC V6E 0A1', studentId: 'NW2026-00042', programStart: '2027-01-05', programEnd: '2028-04-30', tuitionCost: 18500 } },
      PAL: { category: 'pal', fields: { palNumber: 'BC-PAL-2026-000001', palExpiry: '2027-01-31' } },
      TUITION: { category: 'deposit', fields: { tuitionPaid: 9250 } },
      IELTS: { category: 'language', fields: { languageTest: 'IELTS', languageScore: 'Overall 6.5 (L7 R6.5 W6 S6.5)', languageTestDate: '2026-07-10' } },
      BANK: { category: 'proof-of-funds', fields: { totalFunds: 42000 } },
      BANKFATHER: { category: 'supporter-bank', owner: 'father', fields: {} },
      JOB: { category: 'employment-letter', fields: { jobs: [{ from: '2022-04', to: '', occupation: 'Software Developer', employer: 'Zayandeh Demo Software Co.', city: 'Isfahan', country: 'Iran' }] } },
      POLICE: { category: 'police-clearance', fields: {} },
      MARRIAGE: { category: 'marriage-cert', fields: { maritalStatus: 'Married', marriageDate: '2023-09-15', spouseGivenName: 'Neda', spouseFamilyName: 'Karimi', spouseNameNative: 'ندا کریمی', spouseDob: '1999-11-02', spouseCountryOfBirth: 'Iran' } },
      DEED: { category: 'ties-docs', owner: 'father', fields: {} },
      SPONSOR: { category: 'affidavit-support', owner: 'father', fields: { fundingSource: 'Combination', sponsorName: 'Hossein Rezaei (father)' } },
      CV: { category: 'cv', fields: {} },
      REFUSAL: { category: 'refusal-letter', fields: { previousRefusal: true, previousCanadaApplication: true, immigrationApps: [{ country: 'Canada', kind: 'Visitor visa', applied: '2023-03', result: 'Refused', decided: '2023-05', details: 'Visitor visa to attend a software conference in Toronto; refused (purpose of visit, ties to Iran)' }] } },
    },
    team: {
      ...iranAddress,
      otherNames: '', uci: '',
      usPermanentResident: false, countryOfResidence: 'Iran', residenceStatus: 'Citizen', residenceFrom: '1998-05-14',
      applyingFromResidence: true, livedElsewhere5y: false,
      phoneType: 'Cellular', phoneCountryCode: '98', phoneNumber: '9130000001', email: 'arman.rezaei@example.test',
      spouseCitizenship: 'Iran', spouseAddress: 'Unit 4, 27 Chaharbagh Abbasi Street, Isfahan, Iran', spouseOccupation: 'Graphic Designer', spouseAccompanying: false,
      previouslyMarried: false,
      fatherDob: '1965-02-02', fatherBirthCountry: 'Iran', fatherAddress: '12 Bozorgmehr Street, Isfahan, Iran', fatherOccupation: 'Retired teacher', fatherMaritalStatus: 'Married-physically present', fatherAccompanying: false,
      motherDob: '1968-07-09', motherBirthCountry: 'Iran', motherAddress: '12 Bozorgmehr Street, Isfahan, Iran', motherOccupation: 'Homemaker', motherMaritalStatus: 'Married-physically present', motherAccompanying: false,
      siblings: 'Sara Rezaei | سارا رضایی | 1995-03-03 | Iran | Sister | Married | 8 Hakim Nezami Street, Isfahan, Iran | Pharmacist | no',
      palExempt: false, entryDate: '2026-12-20', roomBoardCost: 15000, otherCosts: 2500,
      bgTbContact: false, bgMedicalCondition: false, bgOverstay: false, bgCriminal: false, bgOrganization: false, bgGovPosition: false, bgWitnessed: false, consentContact: true,
      refusalDetails: 'Canada visitor visa (conference in Toronto), applied March 2023, refused May 2023 — purpose of visit and ties to Iran.',
      gicAmount: 0, fundsDetails: 'Own savings CAD 22,000; father (sponsor) CAD 20,000.',
      firstLanguage: 'Persian', ableToCommunicate: 'English',
      previousCanada: false, travelledAbroad: true,
      trips: [
        { from: '2024-03', to: '2024-03', country: 'Turkey', city: 'Istanbul', purpose: 'Tourism' },
        { from: '2022-11', to: '2022-12', country: 'United Arab Emirates', city: 'Dubai', purpose: 'Business' },
      ],
      homeTies: 'Married; wife works in Isfahan; owns a share in the family home; a job offer to return to Zayandeh Demo Software Co.',
      careerGoal: 'Lead data analytics projects at Zayandeh Demo Software Co. after graduating.',
      whyProgram: 'Builds on a software engineering degree and four years as a developer; adds the data skills the employer needs.',
      whyCanada: 'Practical, co-op based programs and recognized credentials.',
    },
    expect: {
      imm1294: {
        'PersonalDetails/Name/FamilyName': 'REZAEI|Rezaei',
        'PersonalDetails/Name/GivenName': 'ARMAN|Arman',
        'PersonalDetails/PlaceBirthCity': 'Isfahan',
        'Passport/PassportNum/PassportNum': 'Z00000001',
        'schoolName/Program': '04',
        'PurposeRow1/Address/Address': '1200 West Demo Street, Vancouver, BC V6E 0A1',
        'roomBoard/amount': '15000',
        'expensesPaid/Other': 'Myself and Hossein Rezaei \\(father\\)',
        'OccupationRow2/Occupation/Occupation': 'Military service \\(conscription\\)',
        'OccupationRow3/Occupation/Occupation': 'Student \\(Software Engineering\\)',
        'OccupationRow3/FromYear': '2016',
      },
      imm5257b: {
        'MilitaryServiceInfo/ServedInMilitary': 'true',
        'MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail/From/Year': '2020',
        'PreviousTravelInfo/TraveledOtherCountry': 'true',
        'PrincipalApplicant': 'true',
      },
    },
  },

  // --- Work — outside Canada -------------------------------------------------
  'owp-outside': person({
    number: 'S27102', given: 'Neda', family: 'Karimi', native: 'ندا کریمی', sex: 'Female', dob: '1999-11-02', city: 'Isfahan', homeCity: 'Isfahan', email: 'neda.karimi@example.test',
    marital: 'Married', spouseGiven: 'Arman', spouseFamily: 'Rezaei', spouseFa: 'آرمان رضایی', spouseDob: '1998-05-14', marriageDate: '2023-09-15', spouseJob: 'Student (Post-Graduate Diploma, Northwind College of Technology)', spouseAddress: '1200 West Demo Street, Vancouver, BC V6E 0A1, Canada',
    degreeLevel: "Bachelor's degree", school: 'Art University of Isfahan', field: 'Graphic Design', eduFrom: '2017-09', eduTo: '2021-06', eduCity: 'Isfahan',
    job: job('Graphic Designer', 'Naqsh Demo Studio', '2021-09', 'Isfahan'),
    team: {
      inviterStatus: 'Study permit holder', inviterPermitExpiry: '2028-08-31', inviterInstitution: 'Northwind College of Technology', inviterProgramOrJob: 'Post-Graduate Diploma in Data Analytics', inviterAddress: '1200 West Demo Street, Vancouver, BC V6E 0A1',
      relationshipHistory: 'Met in 2021, married September 2023; living together in Isfahan.',
      workPermitType: 'Open Work Permit', intendedFrom: '2027-01-05', intendedTo: '2028-08-31',
      totalFunds: 30000, supportSource: 'Combination', sponsorName: 'Arman Rezaei (husband)', fundsDetails: 'Joint savings and the husband’s funds.',
      returnPlan: 'Return to Naqsh Demo Studio after the husband’s studies.',
    },
  }),
  'owp-worker-spouse': person({
    number: 'S27103', given: 'Mina', family: 'Sadeghi', native: 'مینا صادقی', sex: 'Female', dob: '1988-03-12', city: 'Shiraz', homeCity: 'Shiraz', email: 'mina.sadeghi@example.test',
    marital: 'Married', spouseGiven: 'Reza', spouseFamily: 'Sadeghi', spouseFa: 'رضا صادقی', spouseDob: '1986-07-07', marriageDate: '2013-05-01', spouseJob: 'Mechanical Engineer, Demo Industries Ltd., Calgary', spouseAddress: '45 Demo Crescent SW, Calgary, AB T2P 0B1, Canada',
    children: 'Sam Sadeghi | سام صادقی | 2016-02-02 | Iran | Son | Single | Shiraz, Iran | Student | yes',
    school: 'Shiraz University', field: 'Accounting', eduFrom: '2006-09', eduTo: '2010-07', eduCity: 'Shiraz',
    job: job('Accountant', 'Pars Demo Trading Co.', '2014-02', 'Shiraz'),
    team: {
      inviterStatus: 'Work permit holder (skilled job)', inviterPermitExpiry: '2028-03-31', inviterInstitution: 'Demo Industries Ltd.', inviterProgramOrJob: 'Mechanical Engineer (NOC 21301, TEER 1)', inviterIncome: 98000, inviterAddress: '45 Demo Crescent SW, Calgary, AB T2P 0B1',
      workPermitType: 'Open Work Permit', intendedFrom: '2027-02-01', intendedTo: '2028-03-31',
      totalFunds: 25000, supportSource: 'My spouse / partner', sponsorName: 'Reza Sadeghi (husband)',
    },
  }),
  'wp-employer-outside': person({
    number: 'S27104', given: 'Omid', family: 'Rahmani', native: 'امید رحمانی', sex: 'Male', dob: '1990-09-09', city: 'Tabriz', homeCity: 'Tabriz', email: 'omid.rahmani@example.test',
    marital: 'Never Married / Single', school: 'University of Tabriz', field: 'Electrical Engineering', eduFrom: '2008-09', eduTo: '2012-07', eduCity: 'Tabriz',
    military: army('2012-10', '2014-04', 'Army of the Islamic Republic of Iran, 64th Division', 'East Azerbaijan'),
    job: job('Electrical Engineer', 'Azar Demo Power Co.', '2014-06', 'Tabriz'),
    ielts: 'Overall 7.0',
    team: {
      workPermitType: 'Labour Market Impact Assessment Stream', intendedEmployer: 'Maple Demo Electric Inc.', intendedEmployerAddress: '300 Demo Road, Mississauga, ON L5B 0C1',
      intendedProvince: 'Ontario', intendedCity: 'Mississauga', intendedAddress: '300 Demo Road, Mississauga, ON L5B 0C1', intendedJobTitle: 'Electrical Engineer', intendedDuties: 'Design and supervise electrical systems for commercial buildings.',
      intendedFrom: '2027-03-01', intendedTo: '2029-02-28', lmiaNumber: '1234567',
      totalFunds: 15000, supportSource: 'Myself', returnPlan: 'Temporary assignment; family home in Tabriz.',
    },
  }),
  'imp-c11': person({
    number: 'S27105', given: 'Farhad', family: 'Tehrani', native: 'فرهاد تهرانی', sex: 'Male', dob: '1980-12-12', city: 'Tehran', email: 'farhad.tehrani@example.test',
    marital: 'Married', spouseGiven: 'Sima', spouseFamily: 'Ahmadi', spouseFa: 'سیما احمدی', spouseDob: '1983-03-03', marriageDate: '2008-08-08',
    degreeLevel: "Master's degree", school: 'Sharif University of Technology', field: 'Industrial Engineering', eduFrom: '2003-09', eduTo: '2006-07',
    military: army('2006-09', '2008-03'),
    job: job('Managing Director', 'Tehrani Demo Packaging Co.', '2010-01'),
    ielts: 'Overall 6.0',
    team: {
      c11BusinessName: 'Prairie Demo Packaging Ltd.', c11BusinessAddress: '12 Demo Industrial Way, Winnipeg, MB R2C 0A1', c11Activity: 'Manufacture of eco-friendly food packaging.',
      c11Ownership: 100, c11Investment: 250000, c11Jobs: 6, c11OfferNumber: 'A1234567', c11Progress: 'Lease signed; equipment ordered.', c11HomeBusiness: 'Tehrani Demo Packaging Co. (since 2010, 40 employees)',
      c11Benefit: 'Six Canadian jobs and new packaging capacity in Manitoba.',
      workPermitType: 'Exemption from Labour Market Impact Assessment', intendedEmployer: 'Prairie Demo Packaging Ltd.', intendedEmployerAddress: '12 Demo Industrial Way, Winnipeg, MB R2C 0A1',
      intendedProvince: 'Manitoba', intendedCity: 'Winnipeg', intendedAddress: '12 Demo Industrial Way, Winnipeg, MB R2C 0A1', intendedJobTitle: 'Owner and Chief Executive Officer', intendedDuties: 'Set up and run the Canadian packaging plant.',
      intendedFrom: '2027-04-01', intendedTo: '2029-03-31', lmiaNumber: '',
      totalFunds: 300000, supportSource: 'Myself',
    },
  }),
  // --- Study — outside Canada (children) --------------------------------------
  'study-permit-minor': person({
    number: 'S27106', given: 'Ava', family: 'Moradi', native: 'آوا مرادی', sex: 'Female', dob: '2011-04-04', city: 'Mashhad', homeCity: 'Mashhad', email: 'ava.parents@example.test', minor: true,
    father: 'Kamran', fatherFa: 'کامران', mother: 'Nasrin Moradi', motherFa: 'نسرین مرادی', fatherJob: 'Dentist', parentsAddress: '20 Demo Boulevard, Mashhad, Iran',
    noJob: 'Student (secondary school)', noJobFrom: '2017-09', trips: false,
    team: {
      minorArrangement: "Without a parent — custodian in Canada (IMM 5646)", accompanyingParent: 'None — studies alone with a custodian', parentStatusCanada: 'No status / other', otherParentName: 'Nasrin Moradi', otherParentConsent: true,
      custodianRequired: true, custodianName: 'Leyla Demo (aunt), 77 Demo Street, Toronto, ON M4B 0A1', travelsWith: 'A relative', gradeInCanada: 'Grade 10', schoolBoard: 'Demo District School Board',
      schoolName: 'Lakeview Demo Secondary School', dliNumber: 'O000000000002', programName: 'Grade 10 — Ontario Secondary School Diploma', levelOfStudy: 'Secondary / high school', schoolCity: 'Toronto', schoolProvince: 'Ontario',
      schoolAddress: '500 Demo Avenue, Toronto, ON M4B 0A2', programStart: '2027-02-01', programEnd: '2028-06-30', tuitionCost: 16000, roomBoardCost: 12000, entryDate: '2027-01-20',
      totalFunds: 60000, fundingSource: 'Parents / family', sponsorName: 'Kamran Moradi (father)',
      highestEducation: 'Primary / middle school', lastInstitution: 'Farzanegan Demo School', lastEduCity: 'Mashhad', lastEduCountry: 'Iran',
    },
  }),
  'study-permit-child-of-worker': person({
    number: 'S27107', given: 'Sam', family: 'Sadeghi', native: 'سام صادقی', sex: 'Male', dob: '2016-02-02', city: 'Shiraz', homeCity: 'Shiraz', email: 'mina.sadeghi@example.test', minor: true,
    father: 'Reza', fatherFa: 'رضا', mother: 'Mina Sadeghi', motherFa: 'مینا صادقی', fatherJob: 'Mechanical Engineer', parentsAddress: '45 Demo Crescent SW, Calgary, AB T2P 0B1, Canada',
    noJob: 'Student (primary school)', noJobFrom: '2022-09', trips: false,
    team: {
      minorArrangement: 'Accompanied by both parents', accompanyingParent: 'Mina Sadeghi (mother)', parentStatusCanada: 'Worker (work permit)', parentPermitType: 'Work permit', parentPermitExpiry: '2028-03-31',
      parentEmployerOrSchool: 'Demo Industries Ltd., Calgary', parentIncome: 98000, parentAddress: '45 Demo Crescent SW, Calgary, AB T2P 0B1', travelsWith: 'The other parent', gradeInCanada: 'Grade 5', schoolBoard: 'Calgary Demo School Board',
      schoolName: 'Bowness Demo Elementary School', dliNumber: 'O000000000003', programName: 'Grade 5 — elementary', levelOfStudy: 'Secondary / high school', schoolCity: 'Calgary', schoolProvince: 'Alberta',
      schoolAddress: '10 Demo Way NW, Calgary, AB T3B 0A1', programStart: '2027-02-01', programEnd: '2028-06-30', tuitionCost: 0, roomBoardCost: 0, entryDate: '2027-01-25',
      totalFunds: 25000, fundingSource: 'Parents / family', sponsorName: 'Reza Sadeghi (father)',
      highestEducation: 'Primary / middle school', lastInstitution: 'Hafez Demo Primary School', lastEduCity: 'Shiraz', lastEduCountry: 'Iran',
    },
  }),
  // --- Visit — outside Canada ------------------------------------------------
  'trv-outside': person({
    number: 'S27108', given: 'Parisa', family: 'Jafari', native: 'پریسا جعفری', sex: 'Female', dob: '1975-06-15', city: 'Tehran', email: 'parisa.jafari@example.test',
    marital: 'Married', spouseGiven: 'Mehdi', spouseFamily: 'Jafari', spouseFa: 'مهدی جعفری', spouseDob: '1972-02-20', marriageDate: '1998-09-10', spouseJob: 'Civil Engineer',
    children: 'Tara Jafari | تارا جعفری | 2014-08-08 | Iran | Daughter | Single | Tehran, Iran | Student | yes',
    school: 'Tehran University of Medical Sciences', field: 'Pharmacy', degreeLevel: "Master's degree", eduFrom: '1993-09', eduTo: '1999-06',
    job: job('Pharmacist', 'Jafari Demo Pharmacy', '2001-03'),
    trips: [{ from: '2024-07', to: '2024-08', country: 'Germany', city: 'Berlin', purpose: 'Tourism' }, { from: '2023-03', to: '2023-03', country: 'United Arab Emirates', city: 'Dubai', purpose: 'Tourism' }],
    immigrationApps: [{ country: 'Germany', kind: 'Visitor visa', applied: '2024-05', result: 'Approved', decided: '2024-06', details: 'Schengen visa' }],
    team: {
      visitPurpose: 'Visiting family', visitFrom: '2027-06-01', visitTo: '2027-07-15', visitCities: 'Toronto, Niagara Falls', visitPlan: 'Visit sister and her family; sightseeing.', visitPayer: 'Myself', visitBudget: 8000,
      hostName: 'Shadi Demo', hostRelationship: 'Sister', hostStatus: 'Citizen', hostAddress: '77 Demo Street, Toronto, ON M4B 0A1', hostPhone: '+1 416 555 0101', hostEmail: 'shadi.demo@example.test', hostOccupation: 'Nurse', hostProvidesLodging: true,
      totalFunds: 20000, supportSource: 'Myself', returnPlan: 'Return to the pharmacy she owns in Tehran.',
    },
  }),
  'trv-spouse': person({
    number: 'S27109', given: 'Mehdi', family: 'Jafari', native: 'مهدی جعفری', sex: 'Male', dob: '1972-02-20', city: 'Tehran', email: 'mehdi.jafari@example.test',
    marital: 'Married', spouseGiven: 'Parisa', spouseFamily: 'Jafari', spouseFa: 'پریسا جعفری', spouseDob: '1975-06-15', marriageDate: '1998-09-10', spouseJob: 'Pharmacist', spouseAccompanying: true,
    school: 'Amirkabir University of Technology', field: 'Civil Engineering', eduFrom: '1990-09', eduTo: '1995-06',
    military: army('1995-09', '1997-03'),
    job: job('Civil Engineer', 'Alborz Demo Construction', '1998-01'),
    trips: [{ from: '2024-07', to: '2024-08', country: 'Germany', city: 'Berlin', purpose: 'Tourism' }],
    team: {
      visitPurpose: 'Accompanying a family member', visitFrom: '2027-06-01', visitTo: '2027-07-15', visitCities: 'Toronto', visitPayer: 'Myself', visitBudget: 8000,
      hostName: 'Shadi Demo', hostRelationship: 'Sister-in-law', hostStatus: 'Citizen', hostAddress: '77 Demo Street, Toronto, ON M4B 0A1',
      totalFunds: 20000, supportSource: 'Combination', returnPlan: 'Return to his job at Alborz Demo Construction.',
    },
  }),
  'trv-child': person({
    number: 'S27110', given: 'Tara', family: 'Jafari', native: 'تارا جعفری', sex: 'Female', dob: '2014-08-08', city: 'Tehran', email: 'parisa.jafari@example.test', minor: true,
    father: 'Mehdi', fatherFa: 'مهدی', mother: 'Parisa Jafari', motherFa: 'پریسا جعفری', fatherJob: 'Civil Engineer',
    noJob: 'Student (primary school)', noJobFrom: '2020-09',
    trips: [{ from: '2024-07', to: '2024-08', country: 'Germany', city: 'Berlin', purpose: 'Tourism' }],
    team: {
      minorArrangement: 'Accompanied by both parents', accompanyingParent: 'Parisa and Mehdi Jafari', parentStatusCanada: 'Visitor', travelsWith: 'Both parents', gradeInCanada: 'Not studying (visit)',
      visitPurpose: 'Visiting family', visitFrom: '2027-06-01', visitTo: '2027-07-15', visitCities: 'Toronto', visitPayer: 'My spouse / parents', visitBudget: 8000,
      hostName: 'Shadi Demo', hostRelationship: 'Aunt', hostAddress: '77 Demo Street, Toronto, ON M4B 0A1',
    },
  }),
  'trv-child-of-student': person({
    number: 'S27111', given: 'Kian', family: 'Rezaei', native: 'کیان رضایی', sex: 'Male', dob: '2019-01-10', city: 'Isfahan', homeCity: 'Isfahan', email: 'neda.karimi@example.test', minor: true,
    father: 'Arman', fatherFa: 'آرمان', mother: 'Neda Karimi', motherFa: 'ندا کریمی', fatherJob: 'Student (Northwind College of Technology)', parentsAddress: '1200 West Demo Street, Vancouver, BC V6E 0A1, Canada',
    noJob: 'Child (not in school)', noJobFrom: '2019-01', trips: false,
    team: {
      minorArrangement: 'Accompanied by both parents', accompanyingParent: 'Neda Karimi (mother)', parentStatusCanada: 'Student (study permit)', parentPermitType: 'Study permit', parentPermitExpiry: '2028-08-31',
      parentEmployerOrSchool: 'Northwind College of Technology', parentAddress: '1200 West Demo Street, Vancouver, BC V6E 0A1', travelsWith: 'Both parents', gradeInCanada: 'Kindergarten',
      visitPurpose: 'Accompanying a family member', visitFrom: '2027-01-05', visitTo: '2028-08-31', visitCities: 'Vancouver', visitPayer: 'My spouse / parents', visitBudget: 10000,
    },
  }),
  'trv-business': person({
    number: 'S27112', given: 'Behzad', family: 'Nouri', native: 'بهزاد نوری', sex: 'Male', dob: '1983-10-10', city: 'Karaj', homeCity: 'Karaj', email: 'behzad.nouri@example.test',
    marital: 'Married', spouseGiven: 'Laleh', spouseFamily: 'Nouri', spouseFa: 'لاله نوری', spouseDob: '1985-05-05', marriageDate: '2010-10-10',
    school: 'K. N. Toosi University of Technology', field: 'Mechanical Engineering', eduFrom: '2001-09', eduTo: '2005-07',
    military: army('2005-09', '2007-03'),
    job: job('Sales Director', 'Karaj Demo Machinery Co.', '2009-01', 'Karaj'),
    trips: [{ from: '2025-02', to: '2025-02', country: 'China', city: 'Shanghai', purpose: 'Business' }],
    team: {
      applicantCompany: 'Karaj Demo Machinery Co.', applicantRole: 'Sales Director', ownsBusiness: false, businessPurpose: 'Attend the Demo Machinery Expo and meet a Canadian distributor.',
      canadianCounterpart: 'North Demo Equipment Ltd.', canadianCounterpartAddress: '900 Demo Drive, Montreal, QC H3B 0A1', businessWhoPays: 'My company',
      visitPurpose: 'Business', visitFrom: '2027-05-10', visitTo: '2027-05-20', visitCities: 'Montreal', visitPayer: 'My employer', visitBudget: 6000,
      totalFunds: 15000, supportSource: 'My employer', returnPlan: 'Return to his position as Sales Director.',
    },
  }),
  'super-visa': person({
    number: 'S27113', given: 'Mahin', family: 'Hosseini', native: 'مهین حسینی', sex: 'Female', dob: '1962-01-20', city: 'Qom', homeCity: 'Qom', email: 'mahin.hosseini@example.test',
    marital: 'Widowed', degree: false, noJob: 'Retired', noJobFrom: '2017-01',
    trips: [{ from: '2024-09', to: '2024-09', country: 'Iraq', city: 'Karbala', purpose: 'Tourism' }],
    team: {
      highestEducation: 'Secondary school (high school diploma)', lastInstitution: 'Demo Girls High School', lastEduCity: 'Qom', lastEduCountry: 'Iran',
      visitPurpose: 'Visiting family', visitFrom: '2027-04-01', visitTo: '2029-03-31', visitCities: 'Calgary', visitPayer: 'My host in Canada', visitBudget: 0,
      hostName: 'Ali Hosseini', hostRelationship: 'Son', hostStatus: 'Permanent resident', hostAddress: '15 Demo Park NE, Calgary, AB T1Y 0A1', hostPhone: '+1 403 555 0177', hostEmail: 'ali.hosseini@example.test', hostOccupation: 'Software Engineer', hostProvidesLodging: true,
      svHostRelation: 'Child', svHostStatus: 'Permanent resident', svHousehold: 4, svHostIncome: 92000, svInsurer: 'Demo Mutual Insurance Co.', svCoverage: 100000, svInsuranceStart: '2027-04-01', svMedicalDone: true,
      returnPlan: 'Owns her home in Qom; other children in Iran.',
    },
  }),
  // --- Inside Canada ---------------------------------------------------------
  'wp-extension': person({
    number: 'S27114', given: 'Sina', family: 'Kazemi', native: 'سینا کاظمی', sex: 'Male', dob: '1991-03-30', city: 'Tehran', email: 'sina.kazemi@example.test', inside: true, caStatus: 'Worker', caFrom: '2024-06-15', caTo: '2026-12-15', caCity: 'Toronto', caProv: 'Ontario',
    marital: 'Never Married / Single', school: 'Iran University of Science and Technology', field: 'Computer Engineering', eduFrom: '2009-09', eduTo: '2013-07',
    military: army('2013-09', '2015-03'),
    job: { from: '2024-07', to: '', occupation: 'Software Developer', employer: 'Lakeshore Demo Software Inc.', city: 'Toronto', country: 'Canada' },
    prevJobs: [job('Software Developer', 'Tehran Demo Systems', '2015-06', 'Tehran', '2024-05')],
    ielts: 'Overall 7.5',
    immigrationApps: [caApp('Work permit', '2024-02', '2024-05', 'Approved', 'LMIA-based work permit')],
    team: {
      currentStatusCanada: 'Worker (work permit)', permitNumber: 'U000000001', permitExpiry: '2026-12-15', firstEntryDate: '2024-06-15', firstEntryPlace: 'Toronto Pearson International Airport', originalEntryPurpose: 'Work', lastEntryDate: '2024-06-15', lastEntryPlace: 'Toronto Pearson International Airport', canadaEmployerOrSchool: 'Lakeshore Demo Software Inc.',
      wpApplyingFor: 'Extend my permit with the same employer', workPermitTypeInside: 'Labour Market Impact Assessment Stream', intendedEmployer: 'Lakeshore Demo Software Inc.', intendedEmployerAddress: '100 Demo Quay, Toronto, ON M5J 0A1',
      intendedProvince: 'Ontario', intendedCity: 'Toronto', intendedAddress: '100 Demo Quay, Toronto, ON M5J 0A1', intendedJobTitle: 'Software Developer', intendedDuties: 'Develop and maintain web applications.', intendedFrom: '2026-12-16', intendedTo: '2028-12-15', lmiaNumber: '7654321',
      canadaHistory: 'Work permit (LMIA) approved May 2024; entered Toronto 15 June 2024.',
    },
  }),
  'iranian-owp': person({
    number: 'S27115', given: 'Leila', family: 'Bahrami', native: 'لیلا بهرامی', sex: 'Female', dob: '1994-07-07', city: 'Rasht', email: 'leila.bahrami@example.test', inside: true, caStatus: 'Visitor', caFrom: '2025-11-01', caTo: '2026-11-01', caCity: 'North Vancouver',
    marital: 'Never Married / Single', school: 'University of Guilan', field: 'Biology', eduFrom: '2012-09', eduTo: '2016-07', eduCity: 'Rasht',
    job: job('Laboratory Technician', 'Guilan Demo Laboratory', '2017-01', 'Rasht', '2025-09'),
    immigrationApps: [caApp('Visitor visa', '2025-07', '2025-09', 'Approved', 'Multiple-entry visitor visa')],
    team: {
      currentStatusCanada: 'Visitor', permitExpiry: '2026-11-01', firstEntryDate: '2025-11-01', firstEntryPlace: 'Vancouver International Airport', originalEntryPurpose: 'Family Visit', lastEntryDate: '2025-11-01', lastEntryPlace: 'Vancouver International Airport',
      wpApplyingFor: 'Get a permit for the first time or with a new employer', workPermitTypeInside: 'Open Work Permit', intendedFrom: '2026-12-01', intendedTo: '2028-11-30',
      totalFunds: 12000, supportSource: 'Myself', canadaHistory: 'Visitor visa approved September 2025; entered Vancouver 1 November 2025.',
    },
  }),
  pgwp: person({
    number: 'S27116', given: 'Arash', family: 'Mohammadi', native: 'آرش محمدی', sex: 'Male', dob: '1997-12-01', city: 'Kerman', email: 'arash.mohammadi@example.test', inside: true, caStatus: 'Student', caFrom: '2024-08-25', caTo: '2026-12-31', caCity: 'Surrey',
    marital: 'Never Married / Single', degreeLevel: 'Post-graduate diploma', school: 'Fraser Demo College', field: 'Supply Chain Management', eduFrom: '2024-09', eduTo: '2026-08', eduCity: 'Surrey',
    prevJobs: [], job: { from: '2024-09', to: '2026-08', occupation: 'Student (Supply Chain Management)', employer: 'Fraser Demo College', city: 'Surrey', country: 'Canada' },
    military: army('2020-01', '2021-07', 'Army of the Islamic Republic of Iran, 30th Division', 'Kerman'),
    ielts: 'Overall 6.5',
    immigrationApps: [caApp('Study permit', '2024-04', '2024-07', 'Approved', 'Study permit, Fraser Demo College')],
    team: {
      lastEduCountry: 'Canada',
      currentStatusCanada: 'Student (study permit)', permitNumber: 'S000000001', permitExpiry: '2026-12-31', firstEntryDate: '2024-08-25', firstEntryPlace: 'Vancouver International Airport', originalEntryPurpose: 'Study', lastEntryDate: '2024-08-25', lastEntryPlace: 'Vancouver International Airport', canadaEmployerOrSchool: 'Fraser Demo College',
      pgwpInstitution: 'Fraser Demo College', pgwpProgram: 'Post-Graduate Diploma in Supply Chain Management', pgwpLevel: 'Post-graduate certificate', pgwpProgramLength: 24, pgwpStart: '2024-09-03', pgwpCompletionDate: '2026-08-20', pgwpFullTime: true,
      wpApplyingFor: 'Get a permit for the first time or with a new employer', workPermitTypeInside: 'Post Graduation Work Permit', intendedFrom: '2026-10-15', intendedTo: '2029-10-14',
      canadaHistory: 'Study permit approved July 2024; entered Vancouver 25 August 2024.',
    },
  }),
  'trv-inside': person({
    number: 'S27117', given: 'Hamid', family: 'Zand', native: 'حمید زند', sex: 'Male', dob: '1993-05-05', city: 'Tehran', email: 'hamid.zand@example.test', inside: true, caStatus: 'Student', caFrom: '2025-01-05', caTo: '2027-06-30', caCity: 'Montreal', caProv: 'Quebec',
    marital: 'Married', spouseGiven: 'Sara', spouseFamily: 'Zand', spouseFa: 'سارا زند', spouseDob: '1995-09-09', marriageDate: '2018-06-06', spouseAccompanying: true, spouseAddress: 'Same as the applicant (Montreal)',
    children: 'Nika Zand | نیکا زند | 2017-03-03 | Iran | Daughter | Single | Montreal, Canada | Student | yes',
    degreeLevel: "Master's degree", school: 'McGill Demo University', field: 'Mechanical Engineering', eduFrom: '2025-01', eduTo: '', eduCity: 'Montreal',
    military: army('2015-09', '2017-03'),
    job: { from: '2025-01', to: '', occupation: 'Student (Master of Engineering)', employer: 'McGill Demo University', city: 'Montreal', country: 'Canada' },
    prevJobs: [job('Mechanical Engineer', 'Tehran Demo Auto Parts', '2017-06', 'Tehran', '2024-11')],
    immigrationApps: [caApp('Study permit', '2024-08', '2024-11', 'Approved', 'Study permit and single-entry visa')],
    team: {
      currentStatusCanada: 'Student (study permit)', permitNumber: 'S000000002', permitExpiry: '2027-06-30', firstEntryDate: '2025-01-05', firstEntryPlace: 'Montreal-Trudeau International Airport', originalEntryPurpose: 'Study', lastEntryDate: '2025-01-05', lastEntryPlace: 'Montreal-Trudeau International Airport', canadaEmployerOrSchool: 'McGill Demo University',
      visitPurpose: 'Other', visitFrom: '2026-12-15', visitTo: '2027-06-30', visitPlan: 'A visa to re-enter Canada after visiting family in Iran during the winter break.',
      totalFunds: 35000, supportSource: 'Myself',
      canadaHistory: 'Study permit approved November 2024; entered Montreal 5 January 2025.',
    },
  }),
  'visitor-record': person({
    number: 'S27118', given: 'Shirin', family: 'Akbari', native: 'شیرین اکبری', sex: 'Female', dob: '1960-02-02', city: 'Tehran', email: 'shirin.akbari@example.test', inside: true, caStatus: 'Visitor', caFrom: '2026-05-01', caTo: '2026-11-01', caCity: 'Richmond Hill', caProv: 'Ontario',
    marital: 'Married', spouseGiven: 'Javad', spouseFamily: 'Akbari', spouseFa: 'جواد اکبری', spouseDob: '1957-07-07', marriageDate: '1982-03-03', spouseJob: 'Retired', spouseAddress: 'Tehran, Iran',
    degree: false, noJob: 'Retired', noJobFrom: '2015-01',
    immigrationApps: [caApp('Visitor visa', '2026-01', '2026-03', 'Approved', 'Visitor visa to see her daughter')],
    team: {
      highestEducation: 'Secondary school (high school diploma)', lastInstitution: 'Demo High School', lastEduCity: 'Tehran', lastEduCountry: 'Iran',
      currentStatusCanada: 'Visitor', permitExpiry: '2026-11-01', firstEntryDate: '2026-05-01', firstEntryPlace: 'Toronto Pearson International Airport', originalEntryPurpose: 'Family Visit', lastEntryDate: '2026-05-01', lastEntryPlace: 'Toronto Pearson International Airport',
      extendReason: 'Caring for a family member', extendReasonDetail: 'Caring for her daughter after the birth of a grandchild in October 2026.', extendUntil: '2027-03-31', extendSupport: 'My host / family in Canada', extendFunds: 10000, extendDeparturePlan: 'Return ticket booked for 28 March 2027.',
      hostName: 'Maryam Akbari', hostRelationship: 'Daughter', hostAddress: '9 Demo Court, Richmond Hill, ON L4B 0A1',
      totalFunds: 10000, supportSource: 'My host in Canada', canadaHistory: 'Visitor visa approved March 2026; entered Toronto 1 May 2026.',
    },
  }),
  'study-permit-inside': person({
    number: 'S27119', given: 'Pouya', family: 'Rad', native: 'پویا راد', sex: 'Male', dob: '2000-08-08', city: 'Tehran', email: 'pouya.rad@example.test', inside: true, caStatus: 'Student', caFrom: '2024-09-01', caTo: '2026-12-31', caCity: 'Halifax', caProv: 'Nova Scotia',
    marital: 'Never Married / Single', degreeLevel: 'Secondary school (high school diploma)', school: 'Alborz Demo High School', field: 'Mathematics', eduFrom: '2014-09', eduTo: '2018-06',
    military: army('2018-09', '2020-03'),
    job: { from: '2024-09', to: '', occupation: 'Student (Bachelor of Commerce)', employer: 'Atlantic Demo University', city: 'Halifax', country: 'Canada' },
    ielts: 'Overall 6.5',
    immigrationApps: [caApp('Study permit', '2024-05', '2024-07', 'Approved', 'Study permit, Atlantic Demo University')],
    team: {
      currentStatusCanada: 'Student (study permit)', permitNumber: 'S000000003', permitExpiry: '2026-12-31', firstEntryDate: '2024-09-01', firstEntryPlace: 'Halifax Stanfield International Airport', originalEntryPurpose: 'Study', lastEntryDate: '2024-09-01', lastEntryPlace: 'Halifax Stanfield International Airport', canadaEmployerOrSchool: 'Atlantic Demo University',
      studyInsideReason: 'Extend my current study permit (same school and program)', currentDli: 'O000000000004', semestersCompleted: '4', academicStanding: 'Good standing (GPA 3.4)', newProgramEnd: '2028-04-30',
      schoolName: 'Atlantic Demo University', dliNumber: 'O000000000004', programName: 'Bachelor of Commerce', levelOfStudy: 'Bachelor’s degree', schoolCity: 'Halifax', schoolProvince: 'Nova Scotia', schoolAddress: '1 Demo University Avenue, Halifax, NS B3H 0A1',
      programStart: '2024-09-03', programEnd: '2028-04-30', tuitionCost: 21000, roomBoardCost: 13000, entryDate: '2024-09-01',
      totalFunds: 40000, fundingSource: 'Parents / family', sponsorName: 'Ahmad Rad (father)', careerGoal: 'Supply chain analyst', whyProgram: 'Commerce degree in progress.',
      canadaHistory: 'Study permit approved July 2024; entered Halifax 1 September 2024.',
    },
  }),
  'study-permit-inside-child': person({
    number: 'S27120', given: 'Nika', family: 'Zand', native: 'نیکا زند', sex: 'Female', dob: '2017-03-03', city: 'Tehran', email: 'hamid.zand@example.test', minor: true, inside: true, caStatus: 'Visitor', caFrom: '2025-01-05', caTo: '2027-06-30', caCity: 'Montreal', caProv: 'Quebec',
    father: 'Hamid', fatherFa: 'حمید', mother: 'Sara Zand', motherFa: 'سارا زند', fatherJob: 'Graduate student, McGill Demo University', parentsAddress: '1205-889 Demo Avenue, Montreal, QC H3B 0A1, Canada',
    noJob: 'Student (primary school)', noJobFrom: '2023-09', noJobCountry: 'Canada', trips: false,
    immigrationApps: [caApp('Visitor visa', '2024-08', '2024-11', 'Approved', 'Visitor visa to accompany her father')],
    team: {
      currentStatusCanada: 'Visitor', permitExpiry: '2027-06-30', firstEntryDate: '2025-01-05', firstEntryPlace: 'Montreal-Trudeau International Airport', originalEntryPurpose: 'Family Visit', lastEntryDate: '2025-01-05', lastEntryPlace: 'Montreal-Trudeau International Airport',
      minorArrangement: 'Accompanied by both parents', accompanyingParent: 'Hamid Zand (father)', parentStatusCanada: 'Student (study permit)', parentPermitType: 'Study permit', parentPermitExpiry: '2027-06-30', parentEmployerOrSchool: 'McGill Demo University', parentAddress: '1205-889 Demo Avenue, Montreal, QC H3B 0A1', travelsWith: 'Both parents', gradeInCanada: 'Grade 4',
      schoolName: 'Mont-Royal Demo Elementary School', dliNumber: 'O000000000005', programName: 'Grade 4 — elementary', levelOfStudy: 'Secondary / high school', schoolCity: 'Montreal', schoolProvince: 'Quebec', schoolAddress: '50 Demo Rue, Montreal, QC H3B 0A2',
      programStart: '2026-09-01', programEnd: '2027-06-30', tuitionCost: 0, entryDate: '2025-01-05',
      totalFunds: 20000, fundingSource: 'Parents / family', sponsorName: 'Hamid Zand (father)',
      highestEducation: 'Primary / middle school', lastInstitution: 'Demo Primary School', lastEduCity: 'Tehran', lastEduCountry: 'Iran',
      canadaHistory: 'Visitor visa approved November 2024; entered Montreal 5 January 2025.',
    },
  }),
  'sowp-inside': person({
    number: 'S27121', given: 'Elham', family: 'Shams', native: 'الهام شمس', sex: 'Female', dob: '1992-10-10', city: 'Yazd', email: 'elham.shams@example.test', inside: true, caStatus: 'Visitor', caFrom: '2025-08-01', caTo: '2026-12-31', caCity: 'Ottawa', caProv: 'Ontario',
    marital: 'Married', spouseGiven: 'Babak', spouseFamily: 'Shams', spouseFa: 'بابک شمس', spouseDob: '1990-01-01', marriageDate: '2016-04-04', spouseJob: 'PhD student, Capital Demo University', spouseAddress: 'Same as the applicant (Ottawa)',
    school: 'Yazd University', field: 'Architecture', eduFrom: '2010-09', eduTo: '2015-07', eduCity: 'Yazd',
    job: job('Architect', 'Yazd Demo Design Office', '2015-10', 'Yazd', '2025-07'),
    immigrationApps: [caApp('Visitor visa', '2025-04', '2025-06', 'Approved', 'Visitor visa to join her husband')],
    team: {
      currentStatusCanada: 'Visitor', permitExpiry: '2026-12-31', firstEntryDate: '2025-08-01', firstEntryPlace: 'Ottawa Macdonald-Cartier International Airport', originalEntryPurpose: 'Family Visit', lastEntryDate: '2025-08-01', lastEntryPlace: 'Ottawa Macdonald-Cartier International Airport',
      inviterStatus: 'Study permit holder', inviterPermitExpiry: '2028-08-31', inviterInstitution: 'Capital Demo University', inviterProgramOrJob: 'PhD in Civil Engineering', inviterAddress: '1205-889 Demo Avenue, Ottawa, ON K1P 0A1',
      wpApplyingFor: 'Get a permit for the first time or with a new employer', workPermitTypeInside: 'Open Work Permit', intendedFrom: '2026-12-01', intendedTo: '2028-08-31',
      totalFunds: 20000, supportSource: 'My spouse / partner', canadaHistory: 'Visitor visa approved June 2025; entered Ottawa 1 August 2025.',
    },
  }),
  reconsideration: person({
    number: 'S27122', given: 'Kaveh', family: 'Amini', native: 'کاوه امینی', sex: 'Male', dob: '1987-04-14', city: 'Tehran', email: 'kaveh.amini@example.test',
    marital: 'Never Married / Single',
    job: job('Dentist', 'Amini Demo Dental Clinic', '2013-01'),
    team: {
      refusalAppType: 'Visitor visa', refusalDate: '2026-08-20', refusalAppNumber: 'V000000001', refusalReasons: 'Purpose of visit; ties to Iran.',
      reconsiderationError: 'The officer did not consider the clinic ownership documents submitted.', newEvidence: 'None — the request points to the evidence already on file.',
    },
  }),

  // A second study permit, different on purpose: single, a PAL-exempt master's,
  // parents paying, two years as a student in Turkey, a UK refusal, an alias,
  // English and French.
  'study-permit#2': {
    ...person({
      number: 'S27123', given: 'Sara', family: 'Mohseni', native: 'سارا محسنی', sex: 'Female', dob: '2000-02-29', city: 'Tabriz', homeCity: 'Tabriz', email: 'sara.mohseni@example.test',
      marital: 'Never Married / Single', degreeLevel: "Bachelor's degree", school: 'Middle East Demo Technical University', field: 'Biology', eduFrom: '2019-09', eduTo: '2023-06', eduCity: 'Ankara',
      job: job('Research Assistant', 'Tabriz Demo Biotech Institute', '2023-09', 'Tabriz'),
      ielts: 'Overall 7.5',
      trips: [{ from: '2025-08', to: '2025-08', country: 'Armenia', city: 'Yerevan', purpose: 'Tourism' }],
      immigrationApps: [{ country: 'United Kingdom', kind: 'Study permit', applied: '2023-01', result: 'Refused', decided: '2023-03', details: 'UK student visa refused (funds not shown for 28 days)' }],
      team: {
        lastEduCountry: 'Turkey',
        otherNames: 'Sarah Mohseni',
        livedElsewhere5y: true, prevResidenceCountry: 'Turkey', prevResidenceStatus: 'Student', prevResidenceFrom: '2019-09-01', prevResidenceTo: '2023-06-30',
        ableToCommunicate: 'Both', mostAtEase: 'English',
        previousRefusal: true, refusalDetails: 'UK student visa refused in March 2023 because the funds were not held for 28 days.',
        schoolName: 'Lakeshore Demo University', dliNumber: 'O000000000006', programName: 'Master of Science in Biomedical Engineering', levelOfStudy: 'Master’s degree',
        palExempt: true, palExemptReason: "Master's degree program",
        schoolCity: 'Toronto', schoolProvince: 'Ontario', schoolAddress: '27 Demo College Street, Toronto, ON M5S 0A1', studentId: 'LDU-7731', programStart: '2027-09-08', programEnd: '2029-08-31',
        tuitionCost: 32000, roomBoardCost: 18000, otherCosts: 3000, entryDate: '2027-08-25',
        totalFunds: 95000, gicAmount: 22895, tuitionPaid: 16000, fundingSource: 'Parents / family', sponsorName: 'Ali Mohseni (father)',
        careerGoal: 'Biomedical device research in Iran', whyProgram: 'Builds on her biology degree and lab work.', whyCanada: 'Research facilities and co-op terms.',
      },
    }),
    type: 'study-permit',
    expect: {
      imm1294: {
        'AliasName/AliasNameIndicator/AliasNameIndicator': 'Y|Yes',
        'AliasName/AliasFamilyName': 'Mohseni',
        'PreviousCOR/Row2/Country': '.+',
        'PreviousCOR/Row2/FromDate': '2019-09-01',
        'schoolName/Level': '05',
        'schoolName/Program': '18',
        'expensesPaid/expensesPaidBy': 'Parents',
        'Languages/languages/ableToCommunicate/ableToCommunicate': 'Both',
        'PageWrapper/BackgroundInfo2/VisaChoice2': 'Y|Yes',
      },
    },
  },
};

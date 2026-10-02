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
};

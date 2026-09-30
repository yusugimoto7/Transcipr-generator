// IRCC form pre-filling: field resolution, value conversion (codes, ticks,
// dates, English only), the shared main-form map, Schedule 1 and IMM 5645.
//
//   node test/forms.test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLib } from './_load.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
};

const { irccData, irccFieldMap, normalizeUci, ym, rows } = await loadLib('forms/fieldmaps/ircc.js');
const { imm5645FieldMap, people } = await loadLib('forms/fieldmaps/imm5645.js');
const { imm5257bFieldMap } = await loadLib('forms/fieldmaps/imm5257b.js');
const { buildInstructions } = await loadLib('generators/xfaFill.js');
const { getSchema, fieldShown, isRequired, requiredMissing, deriveData } = await loadLib('schema.js');

// --- small helpers ---
ok(normalizeUci('11-2233-4455') === '1122334455', 'UCI with dashes becomes 10 digits');
ok(normalizeUci('1234-5678') === '12345678', 'UCI of 8 digits is kept');
ok(normalizeUci('123456789') === '', 'a 9-digit UCI is not written');
ok(normalizeUci('۱۲۳۴۵۶۷۸') === '12345678', 'Persian digits in a UCI are converted');
ok(ym('2019-6').join() === '2019,06' && ym('2019').join() === '2019,', 'year-month parsing');
ok(rows('a | b\nc').length === 2 && rows('a | b')[0][1] === 'b', 'pipe rows');

// --- the shared map, on IMM 1295-like paths (outside Canada) ---
const P1295 = [
  'form1/Page1/PersonalDetails/UCIClientID',
  'form1/Page1/PersonalDetails/Sex/Sex',
  'form1/Page1/PersonalDetails/PlaceBirthCity',
  'form1/Page1/PersonalDetails/SameAsCORIndicator',
  'form1/Page1/MaritalStatus/SectionA/MaritalStatus',
  'form1/Page1/MaritalStatus/SectionA/DateOfMarriage',
  'form1/Page1/MaritalStatus/SectionA/MarriageDate/FromYr',
  'form1/Page1/MaritalStatus/SectionA/FamilyName',
  'form1/Page1/MaritalStatus/SectionA/GivenName',
  'form1/Page2/MaritalStatus/SectionA/Languages/languages/nativeLang/nativeLang',
  'form1/Page2/MaritalStatus/SectionA/Languages/LanguageTest',
  'form1/Page2/MaritalStatus/SectionA/Passport/IssueDate/IssueDate',
  'form1/Page2/MaritalStatus/SectionA/Passport/IssueYYYY',
  'form1/Page2/natID/q1/natIDIndicator',
  'form1/Page2/natID/natIDdocs/DocNum/DocNum',
  'form1/Page2/ContactInformation/contact/AddressRow1/StreetNum/StreetNum',
  'form1/Page2/ContactInformation/contact/ResidentialAddressRow1/StreetNum/StreetNum',
  'form1/Page3/PageWrapper/Occupation/OccupationRow1/Occupation/Occupation',
  'form1/Page4/BackgroundInfo/Choice',
  'form1/Page4/BackgroundInfo/Choice[1]',
  'form1/Page4/PageWrapper/Military/Choice',
  'form1/Page3/IntendedLocationInCanada/intendedLocation/ProvinceState/ProvinceState',
  'form1/Page3/IntendedLocationInCanada/intendedLocation/CityTown/CityTown',
  'form1/Page3/DetailsOfIntendedWork/DetailsOfWork/TypeofWork/WorkPermitType',
];
const intake = {
  uci: '1234-5678', sex: 'Female', cityOfBirth: 'Tehran', applyingFromResidence: true, maritalStatus: 'Married',
  marriageDate: '2015-06-20', spouseFamilyName: 'Karimi', spouseGivenName: 'Arash', firstLanguage: 'Persian', languageTest: 'None yet',
  passportIssue: '2022-01-10', nationalIdNumber: '001-234567-8', mailingStreetNo: '12', currentOccupation: 'Accountant',
  bgTbContact: false, bgMedicalCondition: true, intendedProvince: 'British Columbia', intendedCity: 'Vancouver',
};
const app = { type: 'owp-worker-spouse', data: intake };
const data = irccData(intake, app);
const map = irccFieldMap('imm1295', P1295);
const blanks = [];
const ins = buildInstructions(map, data, blanks);
const at = (p) => ins.find((i) => i.som.endsWith(p))?.value;
ok(at('UCIClientID') === '12345678', 'UCI written without dashes');
ok(at('SameAsCORIndicator') === 'Y', '"Country where applying" is ticked from the intake');
ok(at('SectionA/FamilyName') === 'Karimi' && at('SectionA/GivenName') === 'Arash', 'spouse family and given names');
ok(at('DateOfMarriage') === '2015-06-20' && at('MarriageDate/FromYr') === '2015', 'marriage date in the visible box and its hidden copy');
ok(at('LanguageTest') === 'N', 'no language test ticks No');
ok(at('IssueDate/IssueDate') === '2022-01-10' && at('Passport/IssueYYYY') === '2022', 'passport issue date shown (not only the hidden copy)');
ok(at('natIDIndicator') === 'Y' && at('DocNum/DocNum') === '0012345678', 'national ID ticked and its number filled');
ok(at('AddressRow1/StreetNum/StreetNum') === '12' && !ins.some((i) => i.som.includes('ResidentialAddressRow1')), 'mailing street number, not the residential one');
ok(at('BackgroundInfo/Choice') === 'N' && at('BackgroundInfo/Choice[1]') === 'Y', 'the two background "Choice" questions are told apart');
ok(blanks.some((b) => /military/i.test(b)), 'an unanswered Yes/No question is reported as a blank');
ok(at('WorkPermitType') === 'Open Work Permit', 'a spouse gets an open work permit');
ok(ins.find((i) => i.som.endsWith('CityTown/CityTown'))?.lov === 'CityList.BC', 'the intended city is looked up in its province list');

// --- IMM 5645: English + native names, English elsewhere, accompany ticks ---
const fam = {
  givenName: 'Laleh', familyName: 'Rahimi', nativeName: 'لاله رحیمی', maritalStatus: 'Married', countryOfBirth: 'Iran',
  spouseGivenName: 'Arash', spouseFamilyName: 'Karimi', spouseNameNative: 'آرش کریمی', inviterName: 'Arash Karimi',
  motherName: 'Mina Ahmadi', motherNameNative: 'مینا احمدی', fatherName: 'Reza Rahimi',
  children: 'Sara Karimi | سارا کریمی | 2016-04-02 | Iran | Daughter | Single | Tehran, Iran | Student | yes',
};
const { map: m5645, notes } = imm5645FieldMap(fam, { type: 'owp-worker-spouse' });
const v5645 = (p) => m5645.find((s) => s.som.endsWith(p));
ok(v5645('AppName').const === 'Laleh Rahimi لاله رحیمی' && v5645('AppName').native, 'applicant name in English then Persian');
ok(v5645('SpouseNo').const === '1', 'a spouse already in Canada: "Will accompany" is No');
ok(v5645('MotherNo').const === '1', 'parents are ticked (No unless the intake says Yes)');
ok(v5645('SectionB/Child/ChildYes').const === '1' && v5645('SectionB/Child/ChildName').const === 'Sara Karimi سارا کریمی', 'child row with both names and a Yes tick');
ok(!m5645.some((s) => s.native && !/Name$/.test(s.som)), 'only name boxes may hold the native script');
ok(notes.some((n) => /Father's name in the native language/.test(n)), 'a missing native name is reported');
ok(people('A, 2010-01-01, Iran')[0].dob === '2010-01-01', 'older "name, date, country" lines still read');

// --- Schedule 1: real data names, true/false answers, table rows ---
const { map: s1 } = imm5257bFieldMap(
  { familyName: 'Rahimi', bgMilitary: true, militaryDetails: '2008-02 | 2010-01 | Army, Tehran | Tehran | Iran', bgWitnessed: false, bgOrganization: false, bgGovPosition: false, travelledAbroad: false },
  { type: 'trv-outside' }
);
const vs1 = (p) => s1.find((s) => s.som === `Schedule1/${p}`)?.const;
ok(vs1('MilitaryServiceInfo/ServedInMilitary') === 'Y' && vs1('MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail/From/Year') === '2008', 'Schedule 1 military answer and first row');
ok(vs1('MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail/CountryCode') === 'Iran', 'Schedule 1 country goes to its coded list');
ok(vs1('PreviousTravelInfo/TraveledOtherCountry') === 'N' && vs1('PrincipalApplicant') === 'true', 'Schedule 1 travel No, principal applicant');
ok(s1.some((s) => s.som === 'Schedule1/FamilyName'), 'Schedule 1 name is written where the form reads it');

// --- intake: follow-up questions shown and required only when relevant ---
const spouseField = getSchema('owp-worker-spouse').steps.flatMap((s) => s.fields).find((f) => f.id === 'spouseFamilyName');
ok(!fieldShown(spouseField, { maritalStatus: 'Never Married / Single' }) && isRequired(spouseField, { maritalStatus: 'Married' }), 'spouse names asked only when married');
const steps = getSchema('owp-worker-spouse').steps.map((s) => s.id);
ok(['language', 'background', 'workDetails'].every((s) => steps.includes(s)), 'a work permit (IMM 1295) intake asks languages, background and intended work');
ok(!requiredMissing({ bgTbContact: false }, 'owp-worker-spouse').some((f) => f.id === 'bgTbContact'), 'a No answer counts as answered');
const derived = deriveData({ spouseGivenName: 'Arash', spouseFamilyName: 'Karimi', spouseName: 'Arash' });
ok(derived.spouseName === 'Arash Karimi' && derived.inviterName === 'Arash Karimi', "the spouse's full name is built from given + family name");
ok(deriveData({ spouseName: 'Old Name' }).spouseName === 'Old Name', 'an older full name stays until the two names are entered');
const allOwp = getSchema('owp-worker-spouse').steps.flatMap((s) => s.fields);
ok(['spouseName', 'inviterName'].every((id) => !fieldShown(allOwp.find((f) => f.id === id), { maritalStatus: 'Married' })), 'the spouse full name is not asked — it is built');
ok(!requiredMissing({ maritalStatus: 'Married' }, 'owp-worker-spouse').some((f) => ['spouseName', 'inviterName'].includes(f.id)), 'the built full name is never "missing"');

// --- the Python side: resolver + filler conversions (needs lxml) ---
const PY = process.env.PYTHON_BIN || 'python3';
if (spawnSync(PY, ['-c', 'import lxml, pikepdf']).status === 0) {
  const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.join(here, '..', 'lib', 'forms'))})
from lxml import etree
from xfa_fields import Resolver
from fill_form import convert
T = '''<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/"><subform name="S">
<subform><bind match="none"/>
  <field name="familyName"><bind match="dataRef" ref="$.FamilyName"/><ui><textEdit/></ui></field>
  <exclGroup name="q"><bind match="dataRef" ref="$.Info.Served"/>
    <field name="Yes"><ui><checkButton/></ui><items><text>true</text></items></field>
    <field name="No"><ui><checkButton/></ui><items><text>false</text></items></field></exclGroup>
  <subform name="Row"><bind match="dataRef" ref="$.Info.Details.Detail[*]"/><occur min="0" max="-1" initial="2"/>
    <field name="Year"><bind match="dataRef" ref="$.From.Year"/><ui><textEdit/></ui></field></subform>
  <exclGroup name="Choice"><field name="No"><ui><checkButton/></ui><items><text>N</text></items></field><field name="Yes"><ui><checkButton/></ui><items><text>Y</text></items></field></exclGroup>
  <exclGroup name="Choice"><field name="No"><ui><checkButton/></ui><items><text>N</text></items></field><field name="Yes"><ui><checkButton/></ui><items><text>Y</text></items></field></exclGroup>
  <field name="Sex"><ui><choiceList/></ui><bindItems ref="$record.LOVFile.LOV.GenderMelList.GenderMel[*]"/></field>
  <field name="D"><ui><dateTimeEdit/></ui></field>
</subform></subform></template>'''
f = Resolver(etree.fromstring(T)).run()
paths = [x['path'] for x in f]
lov = {'GenderMelList': [('Female', 'F Female'), ('Male', 'M Male')], 'CountryTravelDocumentList': [('223', 'IRN (Iran)')], 'P': [('01', 'Business'), ('05', 'Work')], 'M': [('5', 'Married'), ('6', 'Single')]}
out = {
  'paths': paths,
  'radioTrue': convert(f[1], 'Y', False, lov)[0],
  'sex': convert([x for x in f if x['path'].endswith('Sex')][0], 'Female', False, lov)[0],
  'passportCountry': convert({'kind': 'choice', 'lov': 'CountryTravelDocumentList'}, 'Iran', False, lov)[0],
  'persian': convert({'kind': 'text'}, 'تهران', False, lov),
  'nativeOk': convert({'kind': 'text'}, 'Sara سارا', True, lov)[0],
  'date': convert({'kind': 'date'}, '2022-3-5', False, lov)[0],
  'work': convert({'kind': 'choice', 'lov': 'P'}, 'Work', False, lov)[0],
  'marriedFiner': convert({'kind': 'choice', 'lov': 'M'}, 'Married-physically present', False, lov)[0],
  'badDate': convert({'kind': 'date'}, '1401/01/01x', False, lov)[1],
}
print(json.dumps(out, ensure_ascii=False))
`;
  const r = spawnSync(PY, ['-c', script], { encoding: 'utf8' });
  if (r.status !== 0) {
    ok(false, `python checks ran (${r.stderr.slice(-300)})`);
  } else {
    const o = JSON.parse(r.stdout);
    ok(o.paths.includes('S/FamilyName') && o.paths.includes('S/Info/Served'), 'dataRef bindings resolve to their data names');
    ok(o.paths.includes('S/Info/Details/Detail/From/Year') && o.paths.includes('S/Info/Details/Detail[1]/From/Year'), 'repeating rows get one data group each');
    ok(o.paths.includes('S/Choice') && o.paths.includes('S/Choice[1]'), 'two groups of the same name are told apart');
    ok(o.radioTrue === 'true', 'a Yes answer ticks a true/false radio group');
    ok(o.sex === 'Female', '"Female" matches the list entry "F Female"');
    ok(o.passportCountry === '223', '"Iran" matches "IRN (Iran)"');
    ok(o.persian[0] === null && /English/.test(o.persian[1]), 'Persian text is refused in an English-only box');
    ok(o.nativeOk === 'Sara سارا', 'a native-name box keeps the Persian spelling');
    ok(o.date === '2022-03-05' && o.badDate, 'dates are normalised; a non-date is refused');
    ok(o.work === '05', '"Work" is Work, never another entry');
    ok(o.marriedFiner === '5', 'a finer answer falls back to the list\'s broader entry');
  }
} else {
  console.log('- python/lxml not available: resolver checks skipped');
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nforms: all checks passed');

// Intake rules: lists of records (jobs, trips, applications), month answers,
// end dates never in the future, English-only answers, required-when rules,
// and answers saved before the lists existed.
//   node test/intake.test.mjs
import { loadLib } from './_load.mjs';

const S = await loadLib('schema.js');
let bad = 0;
const check = (ok, m) => { if (!ok) bad++; console.log(ok ? 'PASS ' : 'FAIL ', m); };
const field = (type, id) => S.allFields(type).find((f) => f.id === id);
const next = new Date(); next.setMonth(next.getMonth() + 2);
const future = next.toISOString().slice(0, 7);

const ids = S.getSchema('owp-outside').steps.map((s) => s.id);
check(ids.indexOf('employment') >= 0 && ids.indexOf('immigrationHistory') >= 0 && ids.indexOf('employment') < ids.indexOf('history'), `employment and immigration history come before travel history (${ids.join(', ')})`);
check(S.getSchema('trv-outside').steps.some((s) => s.id === 'employment') && !S.getSchema('reconsideration').steps.some((s) => s.id === 'employment'), 'every type with a travel history asks the employment history');

const jobs = field('owp-outside', 'jobs');
check(S.isRequired(jobs, {}) && !S.answered(jobs, {}), 'the employment history is required');
check(S.answered(jobs, { jobs: [{ from: '2018-05', occupation: 'Teacher', city: 'Tehran', country: 'Iran' }] }), 'one complete current activity answers it (no "To")');
const two = [{ from: '2018-05', occupation: 'Teacher', city: 'Tehran', country: 'Iran' }, { from: '2012-01', occupation: 'Clerk', city: 'Tehran', country: 'Iran' }];
check(!S.answered(jobs, { jobs: two }) && S.rowProblems(jobs, two).some((p) => p.row === 1 && p.col === 'to'), 'a previous activity needs its "To"');
check(S.rowProblems(jobs, [{ from: '2018-05', to: future, occupation: 'x', city: 'y', country: 'Iran' }]).some((p) => /later than this month/.test(p.text)), 'a "To" later than this month is refused');
check(S.rowProblems(jobs, [{ from: '2018-05', to: '2017-01', occupation: 'x', city: 'y', country: 'Iran' }]).some((p) => /before the start/.test(p.text)), 'a "To" before "From" is refused');
check(S.rowProblems(jobs, [{ from: '2018-05', occupation: 'معلم', city: 'Tehran', country: 'Iran' }]).some((p) => /English/.test(p.text)), 'Persian script in an English-only column is refused');

const eduTo = field('owp-outside', 'lastEduTo');
const city = field('owp-outside', 'cityOfBirth');
check(S.isRequired(eduTo, { highestEducation: "Bachelor's degree" }) && !S.isRequired(eduTo, { highestEducation: 'Secondary school (high school diploma)' }), 'education dates and place are required for post-secondary studies only');
check(S.valueProblem(eduTo, future) && !S.valueProblem(eduTo, '2019-06'), 'education "To" cannot be in the future');
check(/English/.test(S.valueProblem(city, 'تهران') || ''), 'city of birth in Persian is flagged');
check(!S.answered(city, { cityOfBirth: 'تهران' }), 'and does not count as answered');

const owp = S.allFields('owp-outside');
const prov = owp.find((f) => f.id === 'intendedProvince');
check(!S.fieldShown(prov, { workPermitType: 'Open Work Permit' }) && S.fieldShown(prov, { workPermitType: 'Labour Market Impact Assessment Stream' }), 'an open work permit does not ask the employer / location / job');

const apps = field('owp-outside', 'immigrationApps');
check(S.isRequired(apps, { previousRefusal: true }) && !S.isRequired(apps, { previousRefusal: false, previousCanadaApplication: false }), 'the immigration history is required after a refusal or an earlier Canadian application');

// Answers saved before the lists existed.
const old = S.deriveData({ currentOccupation: 'Teacher', employer: 'School', currentJobFrom: '2018-05', currentJobCity: 'Tehran', currentJobCountry: 'Iran', employmentHistory: '2012-01 | 2018-04 | Clerk | Bank | Tehran | Iran', countriesVisited: '2022-03 | 2022-03 | Turkey | Istanbul | Tourism' });
check(old.jobs.length === 2 && old.jobs[1].to === '2018-04' && old.jobs[0].occupation === 'Teacher', 'earlier job answers become rows');
check(old.trips.length === 1 && old.trips[0].country === 'Turkey' && old.travelledAbroad === true, 'earlier trips become rows');
const back = S.deriveData({ jobs: [{ from: '2020-01', occupation: 'Engineer', employer: 'X', city: 'Shiraz', country: 'Iran' }], immigrationApps: [{ country: 'Canada', kind: 'Visitor visa', applied: '2023-01', result: 'Refused' }] });
check(back.currentOccupation === 'Engineer' && back.currentJobCity === 'Shiraz', 'the current activity fills the single answers letters still read');
check(back.previousRefusal === true && back.previousCanadaApplication === true, 'a refused application to Canada answers the background questions');

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

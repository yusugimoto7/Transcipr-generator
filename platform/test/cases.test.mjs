// Client cases: a main applicant and the family members applying with them.
//   node test/cases.test.mjs
import { loadLib } from './_load.mjs';

const { groupCases, caseKeyOf, caseLabel } = await loadLib('cases.js');
const { matchApplication } = await loadLib('mailIntake.js');

let bad = 0;
const check = (ok, m) => { if (!ok) bad++; console.log(ok ? 'PASS ' : 'FAIL ', m); };

const f = (id, title, extra = {}) => ({ id, title, applicantRole: 'main', createdAt: `2026-09-0${id.length}T00:00:00Z`, updatedAt: '2026-09-20T00:00:00Z', ...extra });
const apps = [
  f('a', 'Amir Hosseini', { clientNumber: 's26901', applicantRole: 'spouse', data: { email: 'amir@example.com' } }),
  f('bb', 'Sara Karimi', { clientNumber: 'S26901' }),
  f('ccc', 'Ava Hosseini', { clientNumber: 'S26901', applicantRole: 'child' }),
  f('dddd', 'Nima Rostami'),
  f('eeeee', 'Leila Rostami', { groupId: 'dddd', applicantRole: 'spouse' }),
  f('ffffff', 'Visitor Visa (TRV) Application'),
];

const cases = groupCases(apps);
const sara = cases.find((c) => c.key === 'S26901');
check(cases.length === 3, 'files group into three clients');
check(sara && sara.main.id === 'bb', 'the main applicant leads the family (the number is case-insensitive)');
check(sara.members.map((m) => m.id).join() === 'bb,a,ccc', 'members are listed main, spouse, child');
check(caseLabel(sara) === 'S26901 · Sara Karimi', 'the label is the file number and the main applicant’s name');
const nima = cases.find((c) => c.key === 'dddd');
check(nima && nima.members.length === 2, 'a file without a number joins its family by groupId');
check(caseKeyOf(apps[5]) === 'ffffff' && caseLabel(cases.find((c) => c.key === 'ffffff')) === 'Unnamed client', 'a lone unnamed file is its own client');

const mail = (text, address) => ({ text, from: { address } });
let m = await matchApplication(mail('S26901 documents', 'amir@example.com'), apps, []);
check(m.app?.id === 'a', 'a family member’s own email goes to their file');
m = await matchApplication(mail('S26901 documents', 'someone@example.com'), apps, []);
check(m.app?.id === 'bb', 'otherwise a family email goes to the main applicant’s file');

console.log(bad ? `\n${bad} problem(s)` : '\nALL CASE CHECKS PASS');
process.exit(bad ? 1 : 0);

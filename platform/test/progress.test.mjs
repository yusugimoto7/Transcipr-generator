// The checklist ↔ file links and the progress numbers the workspace shows.
//   node test/progress.test.mjs
import { loadLib } from './_load.mjs';

const { checklistStatus } = await loadLib('checklist.js');
const { fileProgress, stageOf } = await loadLib('progress.js');
const { fmtDay } = await loadLib('format.js');

let bad = 0;
const check = (ok, m) => { if (!ok) bad++; console.log(ok ? 'PASS ' : 'FAIL ', m); };

const doc = (id, filename, extra = {}) => ({ id, filename, uploadedAt: '2026-09-20T10:00:00Z', ...extra });
const app = {
  type: 'owp-worker-spouse',
  data: { givenName: 'Sara', maritalStatus: 'Married' },
  documents: [
    doc('a', '101 - Birth Certificate - Sara.pdf', { verification: { status: 'red', findings: [{ severity: 'high' }] } }),
    doc('b', '103 - Passport - Sara.pdf', { verification: { status: 'green', findings: [], reviewedBy: 'Maryam' } }),
    doc('c', '103 - Passport old - Sara.pdf', { verification: { status: 'green', findings: [] } }),
    doc('d', 'scan0042.pdf', { category: 'marriage-cert' }),
    doc('e', 'random.pdf'),
  ],
  finalFiles: { builtAt: '2026-09-19T10:00:00Z', files: [{ n: 1 }] },
};

const status = checklistStatus(app);
const item = (code) => status.find((c) => c.code === code);
check(JSON.stringify(item('101').docIds) === '["a"]', 'a coded file is linked to its item');
check(item('103').docIds.length === 2, 'several files for one item are all linked');
check(item('116').provided && item('116').docIds.includes('d'), 'a file without a code counts by its detected type');
check(!item('115').provided && item('115').docIds.length === 0, 'a missing item has no files');
check(!status.some((c) => (c.docIds || []).includes('e')), 'an unidentified file is linked to nothing');

const p = fileProgress(app);
check(p.check.red === 1 && p.check.green === 2, 'check colours are counted');
check(p.check.toSign === 2, 'checked documents without a sign-off are counted');
check(p.final.stale === true, 'final files built before the latest upload are out of date');
check(stageOf(p) === 'documents', 'a serious finding keeps the file at the documents stage');
check(fmtDay('1992-04-18') === '18 Apr 1992', 'a date of birth is never shifted by time zone');

console.log(bad ? `\n${bad} problem(s)` : '\nALL PROGRESS CHECKS PASS');
process.exit(bad ? 1 : 0);

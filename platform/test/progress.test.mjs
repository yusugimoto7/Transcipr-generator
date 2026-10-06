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

// "Already checked": the team marks a serious finding OK to move forward.
const { findingsKey, shownStatus, isCleared } = await loadLib('docStatus.js');
const red = app.documents.find((d) => d.verification?.status === 'red');
const v0 = red.verification;
const cleared = { ...v0, findings: v0.findings || [{ severity: 'high', text: 'Name differs from the passport' }] };
cleared.cleared = { by: 'Team', at: '2026-10-06T10:00:00Z', key: findingsKey(cleared), status: 'red' };
red.verification = cleared;
const p2 = fileProgress(app);
check(shownStatus(cleared) === 'green' && isCleared(cleared), 'a finding marked already checked shows green');
check(p2.check.red === 0 && p2.check.green === 3 && p2.check.cleared === 1, 'and counts as OK, not serious');
check(stageOf(p2) !== 'documents' || p2.documents.missing.length > 0, 'a checked finding no longer holds the file back');
red.verification = { ...cleared, findings: [...cleared.findings, { severity: 'high', text: 'Passport expired' }] };
check(shownStatus(red.verification) === 'red' && !isCleared(red.verification), 'a new finding after the check brings the alert back');
red.verification = v0;

console.log(bad ? `\n${bad} problem(s)` : '\nALL PROGRESS CHECKS PASS');
process.exit(bad ? 1 : 0);

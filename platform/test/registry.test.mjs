// Consistency checks for the application-type registry: every intake step,
// question set, letter kind, form, package category and checklist category
// referenced by a type actually exists.
//   node test/registry.test.mjs
import fs from 'fs';
import { loadLib } from './_load.mjs';

const { APP_TYPE_LIST, codeMapFor, lettersFor, primaryLetter, formsFor } = await loadLib('appTypes.js');
const { buildChecklist } = await loadLib('checklist.js');
const { getSchema, stepIds } = await loadLib('schema.js');
const { QUESTION_SETS } = await loadLib('sopQuestions.js');
const { CATEGORY_KEYS } = await loadLib('generators/classify.js');
const { IRCC_FORMS } = await loadLib('forms/registry.js');
const lettersSrc = fs.readFileSync(new URL('../lib/generators/letters.js', import.meta.url), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ', m); };
const cats = new Set(CATEGORY_KEYS);
const kindsWithPrompt = new Set([...lettersSrc.matchAll(/K === '([a-z0-9-]+)'/g)].map((m) => m[1]));
const handledElsewhere = new Set(['study', 'financial-cover', 'financial-summary']);

// Questions that only make sense for a student must never reach other types.
const STUDY_ONLY = ['fundingSource', 'careerGoal', 'whyProgram', 'whyCanada', 'gicAmount', 'tuitionPaid'];

for (const t of APP_TYPE_LIST) {
  const schema = getSchema(t.key);
  if (!t.group.startsWith('Study')) {
    const ids = schema.steps.flatMap((st) => st.fields.map((f) => f.id));
    const leaked = STUDY_ONLY.filter((id) => ids.includes(id));
    if (leaked.length) fail(`${t.key}: study-only intake questions ${leaked.join(', ')}`);
  }
  const wanted = stepIds(t);
  if (schema.steps.length !== wanted.length) {
    const have = new Set(schema.steps.map((s) => s.id));
    fail(`${t.key}: unknown intake step(s) ${wanted.filter((s) => !have.has(s)).join(', ')}`);
  }
  // One question, one place: a field id asked in two steps would show twice.
  const seen = new Map();
  for (const st of schema.steps) for (const f of st.fields) {
    if (seen.has(f.id)) fail(`${t.key}: field ${f.id} in both ${seen.get(f.id)} and ${st.id}`);
    seen.set(f.id, st.id);
  }
  for (const item of t.checklist) if (!cats.has(item.key)) fail(`${t.key}: checklist ${item.code} uses unknown category '${item.key}'`);
  for (const p of t.packages) {
    const walk = (s) => { (s.categories || []).forEach((c) => cats.has(c) || fail(`${t.key}/${p.key}: unknown category '${c}'`)); (s.children || []).forEach(walk); };
    p.sections.forEach(walk);
  }
  for (const f of t.forms) if (!IRCC_FORMS[f.key]) fail(`${t.key}: form ${f.key} not in forms registry`);
  const app = { type: t.key, representation: 'firm', data: { palExempt: true, previousRefusal: true } };
  for (const l of lettersFor(app)) {
    if (!kindsWithPrompt.has(l.kind) && !handledElsewhere.has(l.kind)) fail(`${t.key}: letter kind '${l.kind}' has no prompt`);
  }
  const primary = primaryLetter(t.key);
  if (!QUESTION_SETS[primary.kind]) fail(`${t.key}: no guided question set for '${primary.kind}'`);
  if (t.service && !Object.keys(codeMapFor(t.key)).length) fail(`${t.key}: empty code map`);
}
// IMM 5646: every file of an applicant under 18 who does not travel with both parents.
const ONE = "With one parent — custody documents and the other parent's consent";
const NONE = 'Without a parent — custodian in Canada (IMM 5646)';
const BOTH = 'Accompanied by both parents';
const has5646 = (type, data) => formsFor({ type, representation: 'firm', data }).some((f) => f.key === 'imm5646');
const CASES = [
  ['study-permit', { dob: '1995-01-01' }, false],
  ['study-permit', { dob: '2010-06-01', minorArrangement: NONE }, true],
  ['trv-outside', { dob: '2012-06-01', minorArrangement: ONE }, true],
  ['study-permit-minor', { dob: '2016-01-01', minorArrangement: BOTH }, false],
  ['study-permit-minor', { dob: '2016-01-01', minorArrangement: ONE }, true],
  ['trv-child', { dob: '2016-01-01', minorArrangement: NONE }, true],
  ['study-permit-child-of-worker', { dob: '2016-01-01', minorArrangement: BOTH }, false],
  ['study-permit-inside-child', { dob: '2016-01-01', minorArrangement: ONE }, true],
  ['trv-child-of-student', { dob: '2016-01-01', minorArrangement: ONE }, true],
];
for (const [type, data, want] of CASES) {
  if (has5646(type, data) !== want) fail(`${type} ${JSON.stringify(data)}: IMM 5646 ${want ? 'missing' : 'should not be in the file'}`);
  if (buildChecklist(data, type).some((i) => i.key === 'custody-doc') !== want) fail(`${type} ${JSON.stringify(data)}: custodianship checklist item ${want ? 'missing' : 'should not be asked'}`);
}
const custodianStep = getSchema('study-permit').steps.find((s) => s.id === 'custodian');
if (!custodianStep) fail('study-permit: no "Applicant under 18" step');

// A common-law partner is asked for IMM 5409 and proof of living together, not a marriage certificate.
for (const t of APP_TYPE_LIST) {
  const items = (status) => buildChecklist({ maritalStatus: status }, t.key).filter((i) => i.code === '116').map((i) => i.label);
  const married = items('Married');
  const cl = items('Common-Law');
  if (!married.length) continue;
  if (cl.some((l) => /^Marriage certificate$/.test(l))) fail(`${t.key}: a common-law applicant is asked for a marriage certificate`);
  if (!cl.some((l) => /IMM 5409/.test(l))) fail(`${t.key}: a common-law applicant is not asked for IMM 5409`);
  if (married.some((l) => /IMM 5409/.test(l))) fail(`${t.key}: a married applicant is asked for IMM 5409`);
}

console.log(bad ? `\n${bad} problem(s)` : `registry consistent: ${APP_TYPE_LIST.length} types`);
process.exit(bad ? 1 : 0);

// Consistency checks for the application-type registry: every intake step,
// question set, letter kind, form, package category and checklist category
// referenced by a type actually exists.
//   node test/registry.test.mjs
import fs from 'fs';
import { loadLib } from './_load.mjs';

const { APP_TYPE_LIST, codeMapFor, lettersFor, primaryLetter } = await loadLib('appTypes.js');
const { getSchema } = await loadLib('schema.js');
const { QUESTION_SETS } = await loadLib('sopQuestions.js');
const { CATEGORY_KEYS } = await loadLib('generators/classify.js');
const { IRCC_FORMS } = await loadLib('forms/registry.js');
const lettersSrc = fs.readFileSync(new URL('../lib/generators/letters.js', import.meta.url), 'utf8');

let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ', m); };
const cats = new Set(CATEGORY_KEYS);
const kindsWithPrompt = new Set([...lettersSrc.matchAll(/K === '([a-z0-9-]+)'/g)].map((m) => m[1]));
const handledElsewhere = new Set(['study', 'financial-cover', 'financial-summary']);

for (const t of APP_TYPE_LIST) {
  const schema = getSchema(t.key);
  if (schema.steps.length !== t.steps.length) {
    const have = new Set(schema.steps.map((s) => s.id));
    fail(`${t.key}: unknown intake step(s) ${t.steps.filter((s) => !have.has(s)).join(', ')}`);
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
console.log(bad ? `\n${bad} problem(s)` : `registry consistent: ${APP_TYPE_LIST.length} types`);
process.exit(bad ? 1 : 0);

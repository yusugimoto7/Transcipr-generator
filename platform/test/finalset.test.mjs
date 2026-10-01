// The final-file set: the type's standard files (learned from the latest
// applications), files the team takes out or adds, files made by hand, and
// documents moved between files before building.
//   node test/finalset.test.mjs
import { loadLib } from './_load.mjs';

process.env.DATA_DIR ||= '/tmp/finalset-test-data';
const { planFinalFiles, setSlots, applySetupChange, catalogFor, documentSuggestions } = await loadLib('finalFiles.js');
const { finalSetFor } = await loadLib('finalSets.js');

let bad = 0;
const check = (ok, m) => { if (!ok) bad++; console.log(ok ? 'PASS ' : 'FAIL ', m); };

const doc = (id, category, filename) => ({ id, category, filename: filename || `${id}.pdf`, mime: 'application/pdf' });
const base = () => ({
  id: 'x', type: 'trv-outside', data: { givenName: 'Sara' },
  documents: [
    doc('pp', 'passport', 'Passport.pdf'), doc('ph', 'photo', 'Photo.jpg'), doc('bc', 'national-id', 'Birth Certificate.pdf'),
    doc('mc', 'marriage-cert', 'Marriage Certificate.pdf'), doc('bank', 'proof-of-funds', 'Bank Statement.pdf'),
    doc('inv', 'invitation-letter', 'Invitation Letter.pdf'), doc('pr', 'host-docs', 'PR Card.pdf'), doc('misc', null, 'Hotel booking.pdf'),
    doc('rel', 'relationship-proof', 'Proof of Relationship.pdf'),
  ],
  generated: [],
});
const apply = (app, change) => ({ ...app, finalSetup: applySetupChange(app, change) });
const slots = (app) => planFinalFiles(app).filter((e) => e.kind !== 'form').map((e) => e.slot);
const find = (app, slot) => planFinalFiles(app).find((e) => e.slot === slot);
const ids = (e) => (e?.contents || []).flatMap((s) => [...(s.ids || []), ...s.children.flatMap((c) => c.ids || [])]);

// 1. The standard set of a visitor visa, from the latest five applications.
let app = base();
const set = finalSetFor('trv-outside');
check(set.basis.n === 5, 'the visitor visa set is learned from five applications');
check(slots(app).join() === 'passport,photo,client-info,financial,marriage,relationship,police,submission', 'visitor visa files in the team’s order');
const fixed = Object.fromEntries(planFinalFiles(app).map((e) => [e.slot, e.fixed]));
check(fixed.passport && fixed['client-info'] && fixed.financial && fixed.relationship && fixed.marriage && fixed.submission, 'files every recent application had are fixed (marriage 4 of 5 too)');
check(fixed.police === false, 'a file only one application had (police) can be taken out');
check(planFinalFiles(app).filter((e) => e.kind === 'form').every((e) => e.fixed), 'the IRCC forms are fixed');
check(finalSetFor('trv-spouse').basis.type === 'trv-outside', 'an accompanying spouse follows the visitor visa set');

// 2. Taking out and adding files.
let threw = '';
try { applySetupChange(app, { op: 'remove', slot: 'passport' }); } catch (e) { threw = e.message; }
check(/always part/.test(threw), 'a fixed file cannot be taken out');
app = apply(app, { op: 'remove', slot: 'police' });
check(!slots(app).includes('police'), 'an optional file is taken out');
check(catalogFor(app).some((c) => c.slot === 'police' && c.seen === 1), 'a file taken out goes back to the add list, with its history');
app = apply(app, { op: 'add', slot: 'police' });
check(slots(app).includes('police') && !(app.finalSetup.removed || []).includes('police'), 'and can be added back');
app = apply(app, { op: 'add', slot: 'inviter' });
const s1 = slots(app);
check(s1.indexOf('inviter') === s1.indexOf('submission') - 1, 'an added file goes before the submission letter');
check(ids(find(app, 'inviter')).includes('inv') && ids(find(app, 'inviter')).includes('pr'), "Inviter's Documents takes the invitation letter and the host's status");
check(!ids(find(app, 'client-info')).includes('pr'), 'and Client Information leaves them out');

// 3. Moving documents.
app = apply(app, { op: 'assign', doc: 'misc', to: 'inviter' });
check(ids(find(app, 'inviter')).includes('misc') && !ids(find(app, 'client-info')).includes('misc'), 'a document moved into a file leaves Client Information');
app = apply(app, { op: 'assign', doc: 'bc', to: 'none' });
check(!planFinalFiles(app).some((e) => ids(e).includes('bc')), 'a document left out is in no file');
check(documentSuggestions(app).some((d) => d.id === 'bc' && d.options.some((o) => o.slot === 'client-info')), 'a left-out document is suggested back into Client Information');
app = apply(app, { op: 'assign', doc: 'bc', to: null });
check(ids(find(app, 'client-info')).includes('bc'), 'back to automatic: it returns to Client Information');
app = apply(app, { op: 'assign', doc: 'mc', to: 'client-info' });
check(ids(find(app, 'client-info')).includes('mc') && !ids(find(app, 'marriage')).length, 'a document with its own file can be put in Client Information instead');

// 4. A file made by hand.
app = apply(app, { op: 'custom', name: 'Proof of Status / Invitation' });
const custom = setSlots(app).find((s) => s.custom);
check(custom && find(app, custom.slot)?.name === 'Proof of Status / Invitation', 'a file made by hand joins the set');
app = apply(app, { op: 'assign', doc: 'inv', to: custom.slot });
app = apply(app, { op: 'assign', doc: 'pr', to: custom.slot });
const ce = find(app, custom.slot);
check(ce.n && ids(ce).join() === 'inv,pr' && ce.contents.length === 2, 'it holds the documents put in it, one contents entry each');
check(!ids(find(app, 'inviter')).includes('inv'), 'and they leave the file they were in');
app = apply(app, { op: 'remove', slot: custom.slot });
check(!setSlots(app).some((s) => s.custom) && !Object.values(app.finalSetup.assign).includes(custom.slot), 'removing it releases its documents');
let threw2 = '';
try { applySetupChange(app, { op: 'assign', doc: 'pp', to: 'photo' }); } catch (e) { threw2 = e.message; }
check(threw2.length > 0, 'documents cannot be put in the photo slot');

// 5. Reset.
app = apply(app, { op: 'reset' });
check(slots(app).join() === slots(base()).join(), 'reset brings back the standard set');

// 6. A type with no history keeps the planner's list, with the basics fixed.
const other = { ...base(), type: 'wp-employer-outside' };
const pe = planFinalFiles(other);
check(!finalSetFor('wp-employer-outside') && pe.some((e) => e.slot === 'lmia' && e.fixed === false) && pe.find((e) => e.slot === 'passport').fixed, 'no history: the planner’s list, basics fixed');

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

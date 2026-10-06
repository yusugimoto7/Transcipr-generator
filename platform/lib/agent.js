import crypto from 'crypto';
import { getApplication, updateApplication } from './store';
import { allFields, deriveData, valueProblem } from './schema';
import { logActivity } from './activity';
import { applySetupChange, planFinalFiles, startFinalJob, getFinalJob } from './finalFiles';
import { produceDocs, catalogue } from './generateDocs';
import { findingsKey } from './docStatus';
import { currentDocs } from './docVersions';
import { CATEGORY_LABELS } from './docLabels';
import { checklistStatus, missingItems } from './checklist';
import { getAppType } from './appTypes';

/**
 * The assistant's hands: what it can do on a client's file when a team member
 * asks — in the chat, or through a note on a final file. Each action checks
 * its input, does what the team could do on the page, and is written to the
 * file's activity as done by the assistant for that person.
 *
 * Team members only (admins and account managers): a client gets answers,
 * never actions.
 */

const by = (user) => user?.name || user?.email || 'the team';
const short = (v) => {
  const s = Array.isArray(v) ? `${v.length} row${v.length === 1 ? '' : 's'}` : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '');
  return s.length > 80 ? `${s.slice(0, 77)}…` : s || '(empty)';
};

/** The actions, as the model sees them. */
export const TOOLS = [
  {
    name: 'update_intake',
    description: 'Set answers in the intake form of this file (e.g. the father\'s name, a date, an address). Use the exact field ids from the file context. Dates are YYYY-MM-DD, months YYYY-MM. For list answers (jobs, trips, education …) give the whole list.',
    parameters: { type: 'object', properties: { fields: { type: 'object', description: '{ fieldId: value }', additionalProperties: true }, reason: { type: 'string', description: 'Where this came from, in a few words (e.g. "the team said in the chat")' } }, required: ['fields'] },
  },
  {
    name: 'remove_pages',
    description: 'Take pages out of a built final file, by their page numbers in that file (e.g. pages 3 and 4 of Client Information). They stay out on every rebuild. The file is rebuilt.',
    parameters: { type: 'object', properties: { slot: { type: 'string', description: 'The final file\'s slot id from the file context, e.g. "client-info"' }, pages: { type: 'array', items: { type: 'integer' } } }, required: ['slot', 'pages'] },
  },
  {
    name: 'restore_pages',
    description: 'Put back pages taken out of documents (all of them, or one document\'s), then rebuild the files.',
    parameters: { type: 'object', properties: { docId: { type: 'string' } } },
  },
  {
    name: 'move_document',
    description: 'Put a document in a different final file, leave it out of the final files ("none"), or back to automatic (null).',
    parameters: { type: 'object', properties: { docId: { type: 'string' }, to: { type: ['string', 'null'], description: 'slot id, "none", or null' } }, required: ['docId', 'to'] },
  },
  {
    name: 'change_final_set',
    description: 'Add a file to the final set from the catalog, or take an optional one out.',
    parameters: { type: 'object', properties: { op: { type: 'string', enum: ['add', 'remove'] }, slot: { type: 'string' } }, required: ['op', 'slot'] },
  },
  {
    name: 'redraft_letter',
    description: 'Draft a letter again with the team\'s instructions (e.g. "mention the previous UK refusal", "shorter", "add the spouse\'s employer"). The instructions are kept for later drafts of this letter.',
    parameters: { type: 'object', properties: { key: { type: 'string', description: 'The letter key from the file context, e.g. "sop", "submission-letter"' }, instructions: { type: 'string' } }, required: ['key', 'instructions'] },
  },
  {
    name: 'rebuild_final_files',
    description: 'Build the final files again: one file (slot) or all of them. Runs in the background.',
    parameters: { type: 'object', properties: { slot: { type: ['string', 'null'] } } },
  },
  {
    name: 'set_file_note',
    description: 'Save the team\'s note on a final file (what to keep in mind when it is made).',
    parameters: { type: 'object', properties: { slot: { type: 'string' }, text: { type: 'string' } }, required: ['slot', 'text'] },
  },
  {
    name: 'mark_document_checked',
    description: 'Mark a document\'s Attention / Serious findings as already checked by the team — OK to move forward.',
    parameters: { type: 'object', properties: { docId: { type: 'string' } }, required: ['docId'] },
  },
  {
    name: 'set_document_type',
    description: 'Change what a document is (its category), e.g. when it was recognised wrongly.',
    parameters: { type: 'object', properties: { docId: { type: 'string' }, category: { type: 'string', description: `One of: ${Object.keys(CATEGORY_LABELS).join(', ')}` } }, required: ['docId', 'category'] },
  },
  {
    name: 'add_team_note',
    description: 'Write a note on the file for the team (it is also given to the letters and the review).',
    parameters: { type: 'object', properties: { text: { type: 'string' }, docId: { type: 'string' } }, required: ['text'] },
  },
];

/** What the model needs to know about the file to act on it (staff only). */
export function fileContext(app) {
  const t = getAppType(app.type);
  const d = app.data || {};
  const fields = allFields(app.type);
  const answered = fields
    .filter((f) => d[f.id] !== undefined && d[f.id] !== '' && !(Array.isArray(d[f.id]) && !d[f.id].length))
    .map((f) => `${f.id} (${f.label}) = ${Array.isArray(d[f.id]) ? JSON.stringify(d[f.id]).slice(0, 400) : String(d[f.id]).slice(0, 200)}`);
  const empty = fields.filter((f) => !answered.some((x) => x.startsWith(`${f.id} `))).map((f) => `${f.id} (${f.label})`);
  const docs = currentDocs(app.documents || []).map((x) => `${x.id} · ${x.filename} · ${x.category || 'type not known'}${x.verification?.status ? ` · check ${x.verification.status}` : ''}`);
  let plan = [];
  try {
    plan = planFinalFiles(app);
  } catch {
    plan = [];
  }
  const built = new Map((app.finalFiles?.files || []).map((f) => [f.slot, f]));
  const notes = app.finalSetup?.notes || {};
  const files = plan.map((e) => `${e.slot} · ${e.n ? String(e.n).padStart(2, '0') : '--'} ${e.name}${e.kind === 'form' ? ' (form)' : ''}${built.get(e.slot)?.pages ? ` · built, ${built.get(e.slot).pages} pages` : ' · not built'}${notes[e.slot] ? ` · team note: ${notes[e.slot].text}` : ''}`);
  const letters = Object.entries(catalogue(app)).filter(([k]) => !/-filled$|^imm/.test(k)).map(([k, title]) => `${k} (${title})`);
  return [
    `File: ${app.clientNumber || ''} ${[d.givenName, d.familyName].filter(Boolean).join(' ') || app.title || ''} — ${t.title}`,
    `Intake answers (field id (label) = value):\n${answered.join('\n') || 'none yet'}`,
    `Intake fields still empty (id (label)): ${empty.slice(0, 250).join('; ')}`,
    `Documents in use (id · name · type · check):\n${docs.join('\n') || 'none'}`,
    `Final files (slot · number name · state):\n${files.join('\n') || 'none'}`,
    `Letters (key (title)): ${letters.join(', ')}`,
    `Documents still missing: ${missingItems(checklistStatus(app)).map((c) => `${c.code} ${c.label}`).join(', ') || 'none'}`,
  ].join('\n\n');
}

/** Carry out one action for `user` on file `appId`. Returns what to tell the model. */
export async function runTool(appId, user, name, args = {}) {
  const app = await getApplication(appId);
  if (!app) return { error: 'No such file.' };
  const via = { detail: `via the assistant, asked by ${by(user)}` };
  switch (name) {
    case 'update_intake': {
      const known = new Map(allFields(app.type).map((f) => [f.id, f]));
      const fields = args.fields && typeof args.fields === 'object' ? args.fields : {};
      const good = {};
      const refused = [];
      for (const [id, value] of Object.entries(fields)) {
        const f = known.get(id);
        if (!f) {
          refused.push(`${id}: no such intake field`);
          continue;
        }
        const problem = f.type === 'rows' ? null : valueProblem(f, value);
        if (problem) refused.push(`${f.label}: ${problem}`);
        else good[id] = value;
      }
      if (!Object.keys(good).length) return { error: refused.join('; ') || 'Nothing to change.' };
      const before = app.data || {};
      await updateApplication(appId, (a) => {
        a.data = { ...(a.data || {}), ...good };
        deriveData(a.data);
        a.dataVersion = (Number(a.dataVersion) || 0) + 1;
        a.dataUpdatedAt = new Date().toISOString();
        return a;
      }, { by: { id: user?.id, name: by(user) } });
      const items = Object.entries(good).map(([id, v]) => `${known.get(id).label}: ${short(before[id])} → ${short(v)}`);
      await logActivity(appId, user, `The assistant updated the intake${args.reason ? ` (${String(args.reason).slice(0, 120)})` : ''}`, { ...via, items });
      return { ok: true, changed: items, ...(refused.length ? { refused } : {}) };
    }
    case 'remove_pages': {
      const pages = (args.pages || []).map(Number);
      const next = await updateApplication(appId, (a) => {
        a.finalSetup = applySetupChange(a, { op: 'drop-pages', slot: args.slot, pages });
        return a;
      });
      const job = startFinalJob(appId, { only: args.slot });
      const name = (next.finalFiles?.files || []).find((f) => f.slot === args.slot)?.name || args.slot;
      await logActivity(appId, user, `The assistant took page${pages.length > 1 ? 's' : ''} ${pages.join(', ')} out of ${name} and rebuilt it`, via);
      return { ok: true, rebuilding: args.slot, job: job?.status };
    }
    case 'restore_pages': {
      await updateApplication(appId, (a) => {
        a.finalSetup = applySetupChange(a, { op: 'restore-pages', doc: args.docId || null });
        return a;
      });
      const job = startFinalJob(appId, {});
      await logActivity(appId, user, 'The assistant put back the pages taken out of the final files and rebuilt them', via);
      return { ok: true, rebuilding: 'all', job: job?.status };
    }
    case 'move_document': {
      await updateApplication(appId, (a) => {
        a.finalSetup = applySetupChange(a, { op: 'assign', doc: args.docId, to: args.to ?? null });
        return a;
      });
      const doc = (app.documents || []).find((x) => x.id === args.docId);
      await logActivity(appId, user, `The assistant moved a document ${args.to === 'none' ? 'out of the final files' : args.to ? `to ${args.to}` : 'back to automatic'}`, { ...via, items: [doc?.filename || args.docId] });
      return { ok: true, note: 'Rebuild the final files for this to show.' };
    }
    case 'change_final_set': {
      await updateApplication(appId, (a) => {
        a.finalSetup = applySetupChange(a, { op: args.op, slot: args.slot });
        return a;
      });
      await logActivity(appId, user, `The assistant ${args.op === 'add' ? 'added' : 'took out'} a final file`, { ...via, items: [args.slot] });
      return { ok: true };
    }
    case 'redraft_letter': {
      const title = catalogue(app)[args.key];
      if (!title) return { error: `No letter "${args.key}" in this file.` };
      const text = String(args.instructions || '').trim().slice(0, 2000);
      const updated = await updateApplication(appId, (a) => {
        a.finalSetup = { ...(a.finalSetup || {}), letterNotes: { ...(a.finalSetup?.letterNotes || {}), [args.key]: { text, by: by(user), at: new Date().toISOString() } } };
        return a;
      });
      const { errors } = await produceDocs(updated, [args.key]);
      if (errors.length) return { error: errors.map((e) => e.message).join('; ') };
      await logActivity(appId, user, `The assistant drafted ${title} again`, { ...via, items: [text] });
      return { ok: true, drafted: title, note: 'Rebuild the final file that holds it to update the file too.' };
    }
    case 'rebuild_final_files': {
      const job = startFinalJob(appId, { only: args.slot || null });
      await logActivity(appId, user, `The assistant started building ${args.slot ? `the final file ${args.slot}` : 'the final files'} again`, via);
      return { ok: true, job: job?.status, running: getFinalJob(appId)?.status };
    }
    case 'set_file_note': {
      await updateApplication(appId, (a) => {
        a.finalSetup = applySetupChange(a, { op: 'note', slot: args.slot, text: args.text, by: by(user) });
        return a;
      });
      await logActivity(appId, user, 'The assistant saved a note on a final file', { ...via, items: [`${args.slot}: ${String(args.text).slice(0, 200)}`] });
      return { ok: true };
    }
    case 'mark_document_checked': {
      const doc = (app.documents || []).find((x) => x.id === args.docId);
      if (!doc?.verification) return { error: 'That document has not been checked yet.' };
      const at = new Date().toISOString();
      await updateApplication(appId, (a) => {
        const x = (a.documents || []).find((y) => y.id === args.docId);
        if (x?.verification) Object.assign(x.verification, { cleared: { by: by(user), at, key: findingsKey(x.verification), status: x.verification.status }, reviewedBy: by(user), reviewedAt: at });
        return a;
      });
      await logActivity(appId, user, 'The assistant marked a document’s findings as already checked — OK to move forward', { ...via, items: [doc.filename] });
      return { ok: true };
    }
    case 'set_document_type': {
      if (!CATEGORY_LABELS[args.category]) return { error: `Unknown type "${args.category}".` };
      const doc = (app.documents || []).find((x) => x.id === args.docId);
      if (!doc) return { error: 'No such document.' };
      await updateApplication(appId, (a) => {
        const x = (a.documents || []).find((y) => y.id === args.docId);
        if (x) x.category = args.category;
        return a;
      });
      await logActivity(appId, user, 'The assistant changed a document’s type', { ...via, items: [`${doc.filename}: ${CATEGORY_LABELS[args.category]}`] });
      return { ok: true };
    }
    case 'add_team_note': {
      const text = String(args.text || '').trim().slice(0, 4000);
      if (!text) return { error: 'Empty note.' };
      await updateApplication(appId, (a) => {
        a.notes ||= [];
        a.notes.push({ id: crypto.randomUUID(), text, section: args.docId ? 'documents' : 'overview', ...(args.docId ? { docId: args.docId } : {}), by: { id: user?.id || null, name: by(user) }, at: new Date().toISOString(), viaAssistant: true });
        return a;
      });
      await logActivity(appId, user, 'The assistant added a team note', { ...via, items: [text.slice(0, 200)] });
      return { ok: true };
    }
    default:
      return { error: `Unknown action ${name}.` };
  }
}

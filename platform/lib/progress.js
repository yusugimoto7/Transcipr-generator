import { checklistStatus, missingItems } from './checklist';
import { getSchema, isRequired, fieldShown, answered, filledRows } from './schema';
import { shownStatus, isCleared } from './docStatus';
import { currentDocs } from './docVersions';

/**
 * Where a client file stands — one place for the numbers the workspace header,
 * the stage sidebar, the overview and the files list all show. Pure: works on
 * the server and in the browser.
 */

const NOT_CHECKED = new Set(['internal', 'questionnaire', 'photo']);

export const isFilled = (data, f) => filled(data, f);
function filled(data, f) {
  return answered(f, data);
}
/** Anything entered at all (a started but incomplete answer counts). */
function touched(data, f) {
  const v = data?.[f.id];
  if (Array.isArray(v)) return filledRows(v).length > 0;
  return typeof v === 'boolean' || String(v ?? '').trim() !== '';
}

/** Per intake section: done (all required answered), partial, or todo. */
export function intakeStatus(app, schema = getSchema(app.type)) {
  return schema.steps.map((s) => {
    // A step with nothing to ask for this applicant (e.g. "Applicant under 18" for an adult).
    if (!s.fields.some((f) => fieldShown(f, app.data))) return { id: s.id, title: s.title, state: 'done', left: 0, text: 'Not needed' };
    const req = s.fields.filter((f) => isRequired(f, app.data));
    const left = req.filter((f) => !filled(app.data, f)).length;
    const any = s.fields.some((f) => fieldShown(f, app.data) && touched(app.data, f));
    if (req.length ? left === 0 : any) return { id: s.id, title: s.title, state: 'done', left: 0, text: 'Complete' };
    if (any) return { id: s.id, title: s.title, state: 'partial', left, text: `${left} required left` };
    return { id: s.id, title: s.title, state: 'todo', left: req.length, text: req.length ? `${req.length} required` : 'Optional' };
  });
}

const latest = (...isos) => isos.filter(Boolean).sort().pop() || null;

export function fileProgress(app, schema) {
  const checklist = checklistStatus(app);
  const required = checklist.filter((c) => c.party !== 'firm' && !c.optional);
  const missing = missingItems(checklist);
  const docs = currentDocs(app.documents || []); // earlier copies are kept but not counted

  const check = { green: 0, yellow: 0, orange: 0, red: 0, unchecked: 0, toSign: 0, unread: 0, cleared: 0 };
  for (const d of docs) {
    const v = d.verification;
    if (v?.status) {
      // A finding the team checked and marked OK to move forward counts as OK.
      const s = shownStatus(v);
      check[s] = (check[s] || 0) + 1;
      if (isCleared(v)) check.cleared++;
      if (!v.reviewedBy) check.toSign++;
    } else if (!NOT_CHECKED.has(d.category)) check.unchecked++;
    if (!d.extractedAt && !NOT_CHECKED.has(d.category)) check.unread++;
  }

  const sections = intakeStatus(app, schema);
  const intakeDone = sections.filter((s) => s.state === 'done').length;

  // The final files are out of date when anything they are built from changed after the build.
  const builtAt = app.finalFiles?.builtAt || null;
  const lastInput = latest(
    ...docs.map((d) => d.uploadedAt),
    ...(app.generated || []).filter((g) => !/^final-/.test(g.key)).map((g) => g.generatedAt),
    app.finalSetup?.updatedAt, // the team changed which files the set holds, or what goes in them
    app.dataUpdatedAt // intake answers changed: the IRCC forms are filled from them
  );
  const finalCount = app.finalFiles?.files?.length || 0;

  return {
    checklist,
    documents: { provided: required.length - missing.length, required: required.length, missing, count: docs.length },
    check,
    intake: { done: intakeDone, total: sections.length, sections, next: sections.find((s) => s.state !== 'done') || null },
    letter: { done: Boolean(app.sop?.text?.trim()) },
    review: app.review ? { score: app.review.readinessScore, at: app.review.generatedAt } : null,
    final: { count: finalCount, builtAt, stale: Boolean(builtAt && lastInput && lastInput > builtAt) },
  };
}

/** The file's overall stage, for lists: the first stage that still needs work. */
export function stageOf(p) {
  if (p.check.red || p.documents.missing.length) return 'documents';
  if (p.intake.done < p.intake.total) return 'intake';
  if (!p.letter.done) return 'letter';
  if (!p.final.count || p.final.stale) return 'final';
  return 'ready';
}

export const STAGE_TEXT = {
  documents: 'Collecting documents',
  intake: 'Intake',
  letter: 'Letter',
  final: 'Final files',
  ready: 'Ready to submit',
};

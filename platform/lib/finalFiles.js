import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getApplication, updateApplication } from './store';
import { readUpload, generatedPath, generatedTarget, UPLOAD_DIR } from './uploads';
import { getAppType, formsFor, packagesFor } from './appTypes';
import { buildPackageFile, ensureGenerated } from './compileJob';
import { letterSpec } from './generators/letters';
import { rasterizePdf } from './raster';

/**
 * The files the firm uploads to the IRCC portal — one PDF per portal slot —
 * numbered and named the way the team names them in each client's
 * "02 - Final Files" folder: "05 - Client Information - Zahra.pdf".
 *
 * Learned from the firm's 2026 final folders (file names only):
 *   - forms first (main form, Schedule 1, IMM 5645, IMM 5476), then Passport
 *     and Photo, then Client Information, then documents that have their own
 *     slot (Marriage Certificate always stands alone), Submission Letter last;
 *   - which documents get their own slot depends on the application type;
 *   - everything else supporting the file goes inside Client Information.
 */

/** Portal slots: how each final file is made. */
const SLOT = {
  passport: { name: 'Passport', categories: ['passport'] },
  photo: { name: 'Photo', photo: true },
  'client-info': { name: 'Client Information', pkg: 'client-info' },
  financial: { name: 'Financial Support', pkg: 'financial-proof', categories: ['proof-of-funds', 'supporter-bank', 'supporter-income', 'supporter-deeds', 'title-deeds', 'deposit', 'gic', 'affidavit-support', 'source-of-funds'] },
  inviter: { name: "Inviter's Documents", pkg: 'inviter-docs' },
  business: { name: 'Business Documents', pkg: 'business-docs' },
  marriage: { name: 'Marriage Certificate', categories: ['marriage-cert'] },
  'birth-nid': { name: 'Birth Certificate & National ID Card', categories: ['national-id'] },
  police: { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
  education: { name: 'Education', categories: ['transcripts', 'certificates'] },
  transcript: { name: 'Recent Education Transcript', categories: ['transcripts'] },
  completion: { name: 'Completion of Studies Letter', categories: ['completion-letter'] },
  cv: { name: 'CV', categories: ['cv'] },
  language: { name: 'Language Test Result', categories: ['language'] },
  loa: { name: 'Letter of Acceptance', categories: ['loa', 'enrolment-letter'] },
  pal: { name: 'PAL', categories: ['pal'], generatedKey: 'pal-exemption', generatedName: 'PAL Exemption' },
  deposit: { name: 'Tuition Payment Confirmation', categories: ['deposit', 'gic'] },
  relationship: { name: 'Proof of Relationship', categories: ['relationship-proof'] },
  'family-status': { name: 'Family Member Proof of Status', categories: ['spouse-status'] },
  enrolment: { name: "Proof of Student's Enrolment", categories: ['enrolment-letter'] },
  medical: { name: 'Medical Exam', categories: ['medical'] },
  insurance: { name: 'Health Insurance', categories: ['medical-insurance'] },
  employment: { name: 'Employment Documents', categories: ['employment-letter', 'leave-of-absence'] },
  custody: { name: 'Custody Document', categories: ['custody-doc'] },
  consent: { name: 'Consent for Travel', categories: ['consent-letter'] },
  invitation: { name: 'Invitation Letter', categories: ['invitation-letter'] },
  submission: { name: 'Submission Letter', generatedKey: 'submission-letter' },
};

// Final-file order per application type, as in the firm's 2026 final folders.
// "forms" expands to the type's IRCC forms (main, Schedule 1, 5645, 5476 …).
const STUDY_MINOR = ['forms', 'loa', 'pal', 'passport', 'photo', 'client-info', 'financial', 'consent', 'custody', 'police', 'submission'];
const TRV = ['forms', 'passport', 'photo', 'client-info', 'financial', 'relationship', 'marriage', 'police', 'inviter', 'submission'];
const TRV_CHILD = ['forms', 'passport', 'photo', 'client-info', 'financial', 'consent', 'relationship', 'custody', 'inviter', 'submission'];
const OWP_INSIDE = ['forms', 'passport', 'photo', 'client-info', 'marriage', 'medical', 'submission'];
const LISTS = {
  'study-permit': ['forms', 'passport', 'photo', 'client-info', 'financial', 'loa', 'pal', 'police', 'language', 'deposit', 'education', 'submission'],
  'study-permit-minor': STUDY_MINOR,
  'study-permit-child-of-worker': [...STUDY_MINOR.slice(0, -1), 'inviter', 'submission'],
  'study-permit-inside': ['forms', 'passport', 'client-info', 'financial', 'photo', 'loa', 'pal', 'marriage', 'submission'],
  'study-permit-inside-child': ['forms', 'passport', 'client-info', 'financial', 'photo', 'loa', 'pal', 'consent', 'custody', 'submission'],
  'owp-outside': ['forms', 'passport', 'photo', 'client-info', 'family-status', 'enrolment', 'birth-nid', 'cv', 'education', 'marriage', 'police', 'inviter', 'submission'],
  'owp-worker-spouse': ['forms', 'passport', 'photo', 'client-info', 'family-status', 'birth-nid', 'cv', 'education', 'marriage', 'police', 'inviter', 'submission'],
  'imp-c11': ['forms', 'passport', 'photo', 'client-info', 'business', 'financial', 'cv', 'education', 'police', 'marriage', 'submission'],
  'iranian-owp': OWP_INSIDE,
  'sowp-inside': OWP_INSIDE,
  pgwp: ['forms', 'client-info', 'passport', 'photo', 'completion', 'transcript', 'marriage', 'submission'],
  'trv-outside': TRV,
  'trv-spouse': TRV,
  'trv-business': ['forms', 'passport', 'photo', 'client-info', 'business', 'financial', 'marriage', 'police', 'submission'],
  'trv-child': TRV_CHILD,
  'trv-child-of-student': TRV_CHILD,
  'trv-inside': ['forms', 'client-info', 'passport', 'photo', 'marriage', 'submission'],
  'super-visa': ['forms', 'passport', 'photo', 'employment', 'police', 'insurance', 'birth-nid', 'marriage', 'client-info', 'financial', 'relationship', 'inviter', 'submission', 'medical'],
  'visitor-record': ['forms', 'client-info', 'passport', 'photo', 'marriage', 'financial', 'relationship', 'invitation', 'submission'],
  reconsideration: ['forms', 'submission'],
};

const firstName = (app) => String(app.data?.givenName || '').trim().split(/\s+/)[0] || '';
const pad = (n) => String(n).padStart(2, '0');
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim();

/** Uploaded signed copy of a form (e.g. "02 - imm5476e Signed.pdf"), if any. */
function signedUpload(app, formKey) {
  const num = formKey.replace(/^imm/i, '');
  const re = new RegExp(`imm\\s*${num}`, 'i');
  return (app.documents || []).find((d) => d.category === 'rep-form' && re.test(d.filename) && d.mime === 'application/pdf') || null;
}

/**
 * The final-file plan for an application: ordered slots with what each one
 * would contain right now.
 * @returns {Array<{ n, slot, name, filename, kind, ready, note, ... }>}
 */
export function planFinalFiles(app) {
  const t = getAppType(app.type);
  const list = LISTS[t.key] || ['forms', 'passport', 'photo', 'client-info', 'submission'];
  const pkgs = packagesFor(app.type);
  const docs = app.documents || [];
  const gen = new Map((app.generated || []).map((g) => [g.key, g]));
  const who = firstName(app);
  const hasCat = (cats) => docs.some((d) => cats.includes(d.category));

  const entries = [];
  for (const slotKey of list) {
    if (slotKey === 'forms') {
      for (const f of formsFor(app)) {
        // IRCC's own file names: imm1295e, imm5645e — Schedule 1 is imm5257_1e.
        const code = f.key === 'imm5257b' ? 'imm5257_1' : f.key;
        const upload = signedUpload(app, f.key);
        const filled = gen.get(`${f.key}-filled`);
        entries.push({
          slot: `form:${f.key}`,
          kind: 'form',
          formKey: f.key,
          name: upload ? `${code}e Signed` : `${code}e`,
          label: f.label,
          source: upload ? { upload: upload.id } : filled ? { generated: filled.key } : null,
          ready: Boolean(upload || filled),
          note: upload ? 'signed copy uploaded' : filled ? 'pre-filled official form' : 'generate the pre-filled form (below) or upload the signed copy',
        });
      }
      continue;
    }
    const def = SLOT[slotKey];
    if (!def) continue;
    if (def.pkg && !pkgs[def.pkg] && !def.categories) continue; // the type has no such package
    let ready = false;
    let note = '';
    if (def.photo) {
      ready = hasCat(['photo']);
      note = ready ? '' : 'upload the digital photo';
    } else if (def.generatedKey && !def.categories) {
      ready = gen.has(def.generatedKey) || Boolean(letterSpec(app, def.generatedKey));
      note = gen.has(def.generatedKey) ? '' : 'drafted when built';
    } else if (def.pkg && pkgs[def.pkg]) {
      const sections = pkgs[def.pkg].sections;
      ready = sections.some((s) => s.generatedKey || s.catchAll) || hasCat(sections.flatMap((s) => s.categories || []));
    } else {
      ready = hasCat(def.categories) || Boolean(def.generatedKey && (gen.has(def.generatedKey) || (app.data?.palExempt && letterSpec(app, def.generatedKey))));
      note = ready ? '' : 'no documents of this type yet';
    }
    entries.push({ slot: slotKey, kind: def.photo ? 'photo' : def.pkg && pkgs[def.pkg] ? 'package' : def.generatedKey && !def.categories ? 'letter' : 'documents', name: def.name, ready, note });
  }

  // Number only the files that will exist; empty optional slots are listed unnumbered.
  let n = 0;
  return entries.map((e) => {
    // Forms and the photo are always part of the set (missing ones are flagged);
    // an optional slot with nothing to put in it is listed without a number.
    const optionalEmpty = !e.ready && !['form', 'photo'].includes(e.kind);
    const num = optionalEmpty ? null : ++n;
    const ext = e.kind === 'photo' ? 'jpg' : 'pdf';
    return { ...e, n: num, filename: num ? `${pad(num)} - ${safe(e.name)}${who ? ` - ${safe(who)}` : ''}.${ext}` : null };
  });
}

/** Categories that go out as their own files (so Client Information leaves them out). */
function claimedCategories(plan, app) {
  const pkgs = packagesFor(app.type);
  const claimed = new Set(['photo', 'rep-form', 'internal', 'questionnaire']);
  for (const e of plan) {
    if (e.slot === 'client-info' || e.kind === 'form') continue;
    const def = SLOT[e.slot];
    if (!def) continue;
    (def.categories || []).forEach((c) => claimed.add(c));
    if (def.pkg && pkgs[def.pkg]) pkgs[def.pkg].sections.forEach((s) => (s.categories || []).forEach((c) => claimed.add(c)));
  }
  return claimed;
}

/* ------------------------------ building ------------------------------ */

const jobs = (globalThis.__finalJobs ||= new Map()); // appId -> job

function view(job) {
  if (!job) return null;
  const { status, done, total, current, inner, startedAt, finishedAt, error, result } = job;
  return { status, done, total, current, inner, startedAt, finishedAt, error, ...(status === 'done' ? { result } : {}) };
}

export function getFinalJob(appId) {
  return view(jobs.get(appId));
}

/** Build every final file (in the background). */
export function startFinalJob(appId, { cleanPages = true, fixRotation = true } = {}) {
  const running = jobs.get(appId);
  if (running?.status === 'running') return view(running);
  const job = { status: 'running', done: 0, total: 0, current: 'planning', inner: null, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null };
  jobs.set(appId, job);
  build(appId, { cleanPages, fixRotation }, job)
    .then((result) => {
      job.result = result;
      job.status = 'done';
    })
    .catch((e) => {
      job.status = 'failed';
      job.error = e.message || 'Building the final files failed.';
    })
    .finally(() => {
      job.current = null;
      job.inner = null;
      job.finishedAt = new Date().toISOString();
    });
  return view(job);
}

async function build(appId, { cleanPages, fixRotation }, job) {
  let app = await getApplication(appId);
  const plan = planFinalFiles(app).filter((e) => e.n);
  const claimed = claimedCategories(plan, app);
  const pkgs = packagesFor(app.type);
  job.total = plan.length;

  const built = [];
  const problems = [];
  const stats = { rotatedPages: 0, droppedPages: 0, mirroredPages: 0, skippedFiles: [], uncertainPages: [] };
  const addStats = (s) => {
    if (!s) return;
    stats.rotatedPages += s.rotatedPages || 0;
    stats.droppedPages += s.droppedPages || 0;
    stats.mirroredPages += s.mirroredPages || 0;
    stats.skippedFiles.push(...(s.skippedFiles || []));
    stats.uncertainPages.push(...(s.uncertainPages || []));
  };
  const record = async (key, meta) => {
    app = await updateApplication(app.id, (a) => {
      const m = new Map((a.generated || []).map((g) => [g.key, g]));
      m.set(key, meta);
      a.generated = [...m.values()];
      return a;
    });
  };

  for (const e of plan) {
    job.current = e.filename;
    job.inner = {};
    const key = `final-${pad(e.n)}`;
    try {
      if (e.kind === 'form') {
        // Official forms go out untouched (their barcodes and XFA must survive).
        if (!e.source) throw new Error(e.note);
        const src = e.source.upload
          ? path.join(UPLOAD_DIR, app.id, (app.documents || []).find((d) => d.id === e.source.upload).stored)
          : generatedPath(app.id, (app.generated || []).find((g) => g.key === e.source.generated).stored);
        const target = await generatedTarget(app.id, { key, filename: e.filename });
        await fs.copyFile(src, target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else if (e.kind === 'photo') {
        const doc = (app.documents || []).find((d) => d.category === 'photo');
        if (!doc) throw new Error(e.note);
        let img = await readUpload(app.id, doc.stored);
        if (doc.mime === 'application/pdf') img = (await rasterizePdf(img, { dpi: 300, lastPage: 1 }))[0]?.buffer;
        const target = await generatedTarget(app.id, { key, filename: e.filename, mime: 'image/jpeg' });
        await sharp(img).rotate().jpeg({ quality: 92 }).toFile(target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else if (e.kind === 'letter') {
        app = await ensureGenerated(app, SLOT[e.slot].generatedKey);
        const g = (app.generated || []).find((x) => x.key === SLOT[e.slot].generatedKey);
        if (!g?.stored) throw new Error('the letter could not be drafted');
        const target = await generatedTarget(app.id, { key, filename: e.filename });
        await fs.copyFile(generatedPath(app.id, g.stored), target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else {
        // A package with a table of contents (Client Information, Financial
        // Support, Inviter's Documents), or a plain file of one document type.
        const def = SLOT[e.slot];
        let pkgDef;
        let plain = false;
        let opts = {};
        if (e.kind === 'package') {
          pkgDef = pkgs[def.pkg];
          if (e.slot === 'client-info') {
            // Leave out everything that has its own portal slot.
            pkgDef = {
              ...pkgDef,
              sections: pkgDef.sections
                .map((s) => (s.categories ? { ...s, categories: s.categories.filter((c) => !claimed.has(c)) } : s))
                .filter((s) => s.generatedKey || s.catchAll || s.categories?.length),
            };
            opts = { claimed };
          } else {
            opts = { owned: new Set() };
          }
        } else {
          plain = true;
          const sections = [];
          if (def.generatedKey && app.data?.palExempt && letterSpec(app, def.generatedKey)) sections.push({ name: def.generatedName || def.name, generatedKey: def.generatedKey });
          sections.push({ name: def.name, categories: def.categories });
          pkgDef = { title: def.name, sections };
          opts = { owned: new Set() };
        }
        const out = await buildPackageFile(app, pkgDef, { cleanPages, fixRotation, job: job.inner, plain, key, filename: e.filename, ...opts });
        app = out.app;
        addStats(out.stats);
        built.push({ ...e, key, size: out.meta.size, pages: out.stats.pages });
      }
    } catch (err) {
      problems.push({ filename: e.filename, name: e.name, reason: err.message });
    }
    job.done++;
  }

  // Drop final files left over from an earlier build that no longer exist.
  const keep = new Set(built.map((b) => b.key));
  app = await updateApplication(app.id, (a) => {
    a.generated = (a.generated || []).filter((g) => !g.key.startsWith('final-') || keep.has(g.key));
    a.finalFiles = { builtAt: new Date().toISOString(), files: built.map(({ n, slot, name, filename, key, size, pages }) => ({ n, slot, name, filename, key, size, pages })) };
    return a;
  });

  return { files: app.finalFiles.files, problems, generated: app.generated, ...stats, skippedFiles: [...new Set(stats.skippedFiles)] };
}

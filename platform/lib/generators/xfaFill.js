import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getFormPdf } from '../forms/fetchForms';
import { imm5645FieldMap } from '../forms/fieldmaps/imm5645';
import { imm5476FieldMap, imm5476Data } from '../forms/fieldmaps/imm5476';
import { imm5257bFieldMap } from '../forms/fieldmaps/imm5257b';
import { imm5713FieldMap } from '../forms/fieldmaps/imm5713';
import { irccData, irccFieldMap, IRCC_MAIN_FORMS, sourceOf, activities, activityGaps } from '../forms/fieldmaps/ircc';
import { autoFieldMap } from '../forms/fieldmaps/auto';
import { getFirm } from '../firm';
import { getAppType } from '../appTypes';

const FILLER = path.join(process.cwd(), 'lib', 'forms', 'fill_form.py');
const DUMPER = path.join(process.cwd(), 'lib', 'forms', 'dump_schema.py');

function pickPython() {
  return process.env.PYTHON_BIN || 'python3';
}

function transformDate(iso, part) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return part === 'year' ? m[1] : part === 'month' ? m[2] : m[3];
}

/** Build filler instructions from a field map + application data.
 *  Field spec: { som, from?, const?, transform?, lov?, valueMap?, when?, native?, need?, label? }
 *   - transform: 'year'|'month'|'day' splits an ISO date
 *   - valueMap:  translate our option label to the form's expected value/list text
 *   - when(data): optional predicate to include the field
 *   - lov:       value list for a drop-down the form fills by script (string or fn(data))
 *   - native:    the box may hold a name in its native script (IMM 5645 names)
 *   - need:      what to ask for when the answer is missing — pushed to `blanks`
 *  The filler converts each value to what its field stores (codes, Y/N, 1/0).
 */
export function buildInstructions(fieldMap, data = {}, blanks = []) {
  const out = [];
  for (const f of fieldMap) {
    if (f.when && !f.when(data)) continue;
    let value;
    if (f.const !== undefined) value = f.const;
    else if (f.transform) value = transformDate(data[f.from], f.transform);
    else value = data[f.from];
    if (value !== undefined && value !== null) value = String(value);
    if (value && f.valueMap && f.valueMap[value] !== undefined) value = f.valueMap[value];
    if (value === undefined || value === null || String(value).trim() === '') {
      if (f.need) blanks.push(f.need);
      continue;
    }
    const lov = typeof f.lov === 'function' ? f.lov(data) : f.lov;
    const label = f.need || f.label;
    out.push({ som: f.som, value, ...(lov ? { lov } : {}), ...(f.native ? { native: true } : {}), ...(label ? { label } : {}) });
  }
  return out;
}

/** "*City/Town" / "Question 2 A Have you…" → a short label for a warning. */
function cleanLabel(s) {
  return String(s || '').replace(/^\*\s*/, '').replace(/\s+/g, ' ').replace(/:\s*$/, '').slice(0, 90);
}

function runFiller(templatePath, outPath, instructions) {
  return new Promise((resolve, reject) => {
    let py;
    try {
      py = spawn(pickPython(), [FILLER, templatePath, outPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      reject(new Error(`cannot start python: ${e.message}`));
      return;
    }
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d) => (stdout += d));
    py.stderr.on('data', (d) => (stderr += d));
    py.on('error', (e) => reject(new Error(`python error: ${e.message}`)));
    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`filler exited ${code}: ${stderr || stdout}`.slice(0, 300)));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`bad filler output: ${stdout.slice(0, 200)}`));
      }
    });
    py.stdin.write(JSON.stringify({ instructions }));
    py.stdin.end();
  });
}

/**
 * Produce a filled official IRCC form (XFA) for an application.
 * Returns { bytes, summary, version }. Throws if the form is unsupported, the
 * template/python is unavailable, or filling fails — callers should fall back
 * to the data sheet.
 */
export async function fillOfficialForm(formKey, app) {
  const { bytes: templateBytes, meta } = await getFormPdf(formKey);

  // The main application forms share one map matched to the form's own
  // fields; the family, representative and Schedule 1 forms have their own.
  let fieldMap;
  let data = app.data || {};
  let notes = [];
  if (IRCC_MAIN_FORMS.has(formKey)) {
    const schema = await dumpFormSchema(formKey);
    if (!schema?.ok || !Array.isArray(schema.fields)) throw new Error(`cannot read fields of ${formKey}`);
    data = irccData(data, app);
    fieldMap = irccFieldMap(formKey, schema.fields);
    if (String(app.data?.uci || '').trim() && !data._uci) notes.push({ text: 'UCI: must be 8 or 10 digits — left blank (check the number in the intake)', field: 'uci' });
    // The employment section: 3 rows for the past 10 years, with no gaps.
    const acts = activities(data);
    if (acts.length > 3) notes.push({ field: 'jobs', text: `Employment: the form has 3 rows — add the other ${acts.length - 3} activit${acts.length - 3 === 1 ? 'y' : 'ies'} on a separate sheet (${acts.slice(3).map((j) => `${j.from || ''}–${j.to || ''} ${j.occupation || ''}`.trim()).join('; ')})` });
    const adultAt = /^\d{4}-\d{2}/.test(app.data?.dob || '') ? `${Number(app.data.dob.slice(0, 4)) + 18}${app.data.dob.slice(4, 7)}` : '';
    for (const g of activityGaps(data)) {
      const school = adultAt && g.to < adultAt;
      notes.push({ field: 'jobs', text: `Employment: nothing is listed for ${g.from} to ${g.to} — IRCC asks for the past 10 years with no gaps (${school ? 'the applicant was under 18: add their school as "Student"' : 'add the job, studies, or "unemployed" / "homemaker"'})` });
    }
  } else if (formKey === 'imm5645') {
    ({ map: fieldMap, notes } = imm5645FieldMap(data, app));
  } else if (formKey === 'imm5476') {
    fieldMap = imm5476FieldMap();
    data = imm5476Data(data, getFirm(), getAppType(app.type).title);
  } else if (formKey === 'imm5257b') {
    ({ map: fieldMap, notes } = imm5257bFieldMap(data, app));
  } else if (formKey === 'imm5713') {
    ({ map: fieldMap, notes } = imm5713FieldMap(data, app));
  } else {
    // Any other IRCC form: a best-effort map from its field names.
    const schema = await dumpFormSchema(formKey);
    if (!schema?.ok || !Array.isArray(schema.paths)) throw new Error(`cannot read fields of ${formKey}`);
    fieldMap = autoFieldMap(schema.paths);
    if (!fieldMap.length) throw new Error(`no recognizable fields on ${formKey}`);
  }

  // A hand-made map (IMM 5645, 5476, Schedule 1) written for one version of
  // the form: a box this version does not have is reported, not written.
  if (!IRCC_MAIN_FORMS.has(formKey) && ['imm5645', 'imm5476', 'imm5257b', 'imm5713'].includes(formKey)) {
    const schema = await dumpFormSchema(formKey).catch(() => null);
    if (schema?.ok && Array.isArray(schema.paths)) {
      const canon = (p) => p.split('/').filter(Boolean).map((x) => x.replace(/\[0\]$/, '')).join('/');
      const strip = (p) => canon(p).replace(/\[\d+\]/g, '');
      const have = new Set(schema.paths.map(strip));
      const missing = fieldMap.filter((f) => !have.has(strip(f.som)) && (f.need || f.from || f.const));
      if (missing.length) notes.push({ text: `This version of ${formKey.toUpperCase()} (${meta.version}) has no box for: ${[...new Set(missing.map((f) => f.need || f.label || f.som.split('/').pop()))].join(', ')} — check the form`, field: null });
      fieldMap = fieldMap.filter((f) => have.has(strip(f.som)));
    }
  }

  const tmp = path.join(os.tmpdir(), `xfa-${crypto.randomBytes(6).toString('hex')}`);
  const templatePath = `${tmp}-tpl.pdf`;
  const outPath = `${tmp}-out.pdf`;
  await fs.writeFile(templatePath, templateBytes);

  try {
    const blanks = [];
    const instructions = buildInstructions(fieldMap, data, blanks);
    if (!instructions.length) throw new Error('no fields to fill');
    const summary = await runFiller(templatePath, outPath, instructions);
    if (!summary.ok) throw new Error(summary.error || 'filler failed');
    const bytes = await fs.readFile(outPath);
    // What is left to do on this form: answers missing from the intake, and
    // answers the form could not take (not in English, not in its list).
    // Each with the intake answer it comes from, so the team can go straight to it.
    const fieldOf = (f) => f.field || sourceOf(f.from) || null;
    const byNeed = new Map(fieldMap.filter((f) => f.need).map((f) => [f.need, fieldOf(f)]));
    const bySom = new Map(fieldMap.map((f) => [f.som, fieldOf(f)]));
    const checks = [
      ...notes.map((n) => (typeof n === 'string' ? { text: n, field: null } : n)),
      ...blanks.map((b) => ({ text: `${b} — not answered in the intake`, field: byNeed.get(b) || null })),
      ...(summary.warnings || []).map((w) => ({ text: `${cleanLabel(w.label)}: ${w.reason}`, field: bySom.get(w.path) || null })),
    ];
    const seen = new Set();
    return { bytes, summary, version: meta.version, checks: checks.filter((c) => !seen.has(c.text) && seen.add(c.text)) };
  } finally {
    fs.unlink(templatePath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}

/** Dump the XFA leaf paths of a form's latest blank template (for map authoring). */
export async function dumpFormSchema(formKey) {
  const { bytes, meta } = await getFormPdf(formKey);
  const tmp = path.join(os.tmpdir(), `xfa-${crypto.randomBytes(6).toString('hex')}-schema.pdf`);
  await fs.writeFile(tmp, bytes);
  try {
    const result = await new Promise((resolve, reject) => {
      let out = '';
      let err = '';
      const py = spawn(pickPython(), [DUMPER, tmp]);
      py.stdout.on('data', (d) => (out += d));
      py.stderr.on('data', (d) => (err += d));
      py.on('error', (e) => reject(new Error(e.message)));
      py.on('close', (code) => {
        if (code !== 0) return reject(new Error(err || out || `exit ${code}`));
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error(`bad output: ${out.slice(0, 200)}`));
        }
      });
    });
    return { ...result, version: meta.version };
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

/** Cheap capability probe: is python + the filler available? */
export async function fillerAvailable() {
  try {
    await fs.access(FILLER);
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    let py;
    try {
      py = spawn(pickPython(), ['-c', 'import pikepdf, lxml.etree']);
    } catch {
      resolve(false);
      return;
    }
    py.on('error', () => resolve(false));
    py.on('close', (code) => resolve(code === 0));
  });
}

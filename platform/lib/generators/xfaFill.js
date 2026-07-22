import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getFormPdf } from '../forms/fetchForms';
import { FIELD_MAPS } from '../forms/fieldmaps/imm1294';

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
 *  Field spec: { som, from?, const?, transform?, lov?, valueMap?, when? }
 *   - transform: 'year'|'month'|'day' splits an ISO date
 *   - valueMap:  translate our option label to the form's expected value/LOV text
 *   - when(data): optional predicate to include the field
 */
export function buildInstructions(fieldMap, data = {}) {
  const out = [];
  for (const f of fieldMap) {
    if (f.when && !f.when(data)) continue;
    let value;
    if (f.const !== undefined) value = f.const;
    else if (f.transform) value = transformDate(data[f.from], f.transform);
    else value = data[f.from];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    value = String(value);
    if (f.valueMap && f.valueMap[value] !== undefined) value = f.valueMap[value];
    if (value === '') continue;
    out.push({ som: f.som, value, ...(f.lov ? { lov: f.lov } : {}) });
  }
  return out;
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
  const fieldMap = FIELD_MAPS[formKey];
  if (!fieldMap) throw new Error(`no field map for ${formKey}`);

  const { bytes: templateBytes, meta } = await getFormPdf(formKey);

  const tmp = path.join(os.tmpdir(), `xfa-${crypto.randomBytes(6).toString('hex')}`);
  const templatePath = `${tmp}-tpl.pdf`;
  const outPath = `${tmp}-out.pdf`;
  await fs.writeFile(templatePath, templateBytes);

  try {
    const instructions = buildInstructions(fieldMap, app.data || {});
    if (!instructions.length) throw new Error('no fields to fill');
    const summary = await runFiller(templatePath, outPath, instructions);
    if (!summary.ok) throw new Error(summary.error || 'filler failed');
    const bytes = await fs.readFile(outPath);
    return { bytes, summary, version: meta.version };
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

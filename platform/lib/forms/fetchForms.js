import fs from 'fs/promises';
import path from 'path';
import { IRCC_FORMS, versionFromUrl } from './registry';

/**
 * Fetches the latest official IRCC form/checklist PDFs directly from canada.ca,
 * caches them on disk, and tracks versions. Runs server-side (the deployment has
 * open internet). Everything is best-effort: a network failure falls back to the
 * last-known-good URL / previously cached copy.
 */

const CACHE_DIR = process.env.UPLOAD_DIR
  ? path.join(path.resolve(process.env.UPLOAD_DIR), 'forms-cache')
  : path.join(process.cwd(), 'uploads', 'forms-cache');

const MANIFEST = path.join(CACHE_DIR, 'manifest.json');
// Re-check canada.ca for new versions at most this often.
const REFRESH_MS = 24 * 60 * 60 * 1000; // 24h
const UA = 'Mozilla/5.0 (compatible; CanadaVisaPlatform/1.0; +forms-updater)';

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

async function writeManifest(m) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(MANIFEST, JSON.stringify(m, null, 2));
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

/** Resolve the current PDF URL for a form by scraping its canada.ca page. */
export async function resolveLatestPdfUrl(key) {
  const form = IRCC_FORMS[key];
  if (!form) throw new Error(`Unknown form: ${key}`);
  try {
    const res = await fetchWithTimeout(form.page, {}, 15000);
    if (res.ok) {
      const html = await res.text();
      // Find the versioned PDF link for this exact form on the page.
      const re = new RegExp(
        `https://www\\.canada\\.ca/content/dam/ircc/[^"']*?/forms/${key}/\\d{2}-\\d{2}-\\d{4}/${key}e\\.pdf`,
        'i'
      );
      const m = html.match(re);
      if (m) return { url: m[0], source: 'scrape' };
    }
  } catch {
    /* fall through to fallback */
  }
  return { url: form.fallbackPdf, source: 'fallback' };
}

/**
 * Ensure the latest PDF for `key` is cached. Returns metadata:
 * { key, code, title, role, version, url, source, path, size, fetchedAt }.
 * Skips the network if the cached copy is fresh (< REFRESH_MS) unless force=true.
 */
export async function ensureForm(key, { force = false } = {}) {
  const form = IRCC_FORMS[key];
  if (!form) throw new Error(`Unknown form: ${key}`);
  const manifest = await readManifest();
  const prev = manifest[key];
  const fresh = prev && Date.now() - new Date(prev.fetchedAt).getTime() < REFRESH_MS;

  if (fresh && !force && prev.path) {
    try {
      await fs.access(prev.path);
      return prev;
    } catch {
      /* cached file vanished — re-fetch */
    }
  }

  const { url, source } = await resolveLatestPdfUrl(key);
  const version = versionFromUrl(url) || 'unknown';

  // If we already have this exact version cached, just refresh the timestamp.
  if (prev && prev.version === version && prev.path) {
    try {
      await fs.access(prev.path);
      const updated = { ...prev, fetchedAt: new Date().toISOString(), source };
      manifest[key] = updated;
      await writeManifest(manifest);
      return updated;
    } catch {
      /* fall through and download */
    }
  }

  const res = await fetchWithTimeout(url, {}, 30000);
  if (!res.ok) {
    if (prev) return prev; // keep the old copy on failure
    throw new Error(`Download failed (${res.status}) for ${key}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `${key}_${version}.pdf`);
  await fs.writeFile(file, bytes);

  const meta = {
    key,
    code: form.code,
    title: form.title,
    role: form.role,
    version,
    url,
    source,
    path: file,
    size: bytes.length,
    fetchedAt: new Date().toISOString(),
  };
  manifest[key] = meta;
  await writeManifest(manifest);
  return meta;
}

/** Refresh every registered form. Returns an array of metadata (or error stubs). */
export async function refreshAll(opts = {}) {
  const out = [];
  for (const key of Object.keys(IRCC_FORMS)) {
    try {
      out.push(await ensureForm(key, opts));
    } catch (e) {
      out.push({ key, error: e.message });
    }
  }
  return out;
}

/** Return current manifest as an array (does not hit the network). */
export async function listForms() {
  const manifest = await readManifest();
  return Object.keys(IRCC_FORMS).map((key) => {
    const f = IRCC_FORMS[key];
    const cached = manifest[key];
    return {
      key,
      code: f.code,
      title: f.title,
      role: f.role,
      page: f.page,
      version: cached?.version || null,
      source: cached?.source || null,
      fetchedAt: cached?.fetchedAt || null,
      cached: Boolean(cached?.path),
    };
  });
}

/** Read the cached PDF bytes for a form, fetching if needed. */
export async function getFormPdf(key) {
  const meta = await ensureForm(key);
  if (!meta?.path) throw new Error(`No cached PDF for ${key}`);
  const bytes = await fs.readFile(meta.path);
  return { bytes, meta };
}

export { CACHE_DIR };

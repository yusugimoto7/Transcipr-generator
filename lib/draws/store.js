// Dedup memory: which draws have already been posted.
//
// Stored in the Google Sheet's Library tab as records of type "posted_draw",
// through the Apps Script web app that is already deployed.
//
// THE RULE THAT MATTERS: never trust a write. After recording, the key is read
// back and confirmed. An unverified write is reported as a failure, so the
// caller can refuse to publish rather than risk republishing forever.
//
// On Apps Script specifically: a POST to /exec runs doPost and then answers with
// a 302 to a script.googleusercontent.com echo URL that serves the result. That
// echo URL accepts GET only, so redirects must be followed the normal way —
// re-issuing the POST to it returns 405. The write has already happened by then.

const RECORD_TYPE = "posted_draw";
const memory = new Set();

function sheetUrl() {
  return process.env.SHEET_WEBHOOK_URL;
}
function sheetSecret() {
  return process.env.SHEET_SECRET;
}

export function storeIsDurable() {
  return !!sheetUrl() && !!sheetSecret();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Apps Script runs doPost first, then redirects to a GET-only echo URL for
    // the response. Following normally is correct; re-POSTing there gives 405.
    redirect: "follow",
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`dedup POST ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    // Apps Script answers with an HTML error page when the script itself throws.
    throw new Error(`dedup POST returned non-JSON: ${text.slice(0, 120)}`);
  }
}

// Works with either backend, detected from the reply:
//   dedicated draws sheet -> { keys: [...] }        (preferred)
//   shared Topic Engine sheet -> { items: [...] }   (still supported)
let backend = null; // "keys" | "library"

async function fetchKeys() {
  const res = await fetch(
    `${sheetUrl()}?secret=${encodeURIComponent(sheetSecret())}&type=library`,
    { method: "GET", redirect: "follow" }
  );
  if (!res.ok) throw new Error(`dedup GET ${res.status}`);
  const data = await res.json();
  if (data?.error) throw new Error(`dedup GET: ${data.error}`);

  if (Array.isArray(data?.keys)) {
    backend = "keys";
    return new Set(data.keys.map(String));
  }

  backend = "library";
  const keys = new Set();
  for (const item of Array.isArray(data?.items) ? data.items : []) {
    if (item?.type === RECORD_TYPE && item.id) keys.add(String(item.id));
  }
  return keys;
}

// Shape the write to match whichever backend answered.
function writeBody(record) {
  return backend === "keys"
    ? { secret: sheetSecret(), keys: [record] }
    : { secret: sheetSecret(), library: [record] };
}

export function backendKind() {
  return backend;
}

// All previously posted dedup keys.
export async function getPostedKeys() {
  if (!storeIsDurable()) return new Set(memory);
  const keys = await fetchKeys();
  for (const k of memory) keys.add(k);
  return keys;
}

// Record a draw as posted, then PROVE it landed.
// Returns { ok, verified }. Throws when the write cannot be confirmed, so the
// caller can refuse to publish rather than risk republishing forever.
export async function markPosted(item, results = {}) {
  memory.add(item.dedupKey);
  if (!storeIsDurable()) {
    return { ok: false, skipped: true, verified: false, reason: "no durable store" };
  }

  const record = {
    id: item.dedupKey,
    type: RECORD_TYPE,
    title_fa: item.record?.name || item.program,
    title_en: item.program,
    posted_at: new Date().toISOString(),
    draw_crs: item.record?.crs || "",
    draw_size: item.record?.size || "",
    channels: Object.entries(results)
      .filter(([, v]) => v?.ok)
      .map(([k]) => k)
      .join(","),
  };

  // Read once first so the backend is known before writing.
  if (!backend) await fetchKeys();
  const wrote = await postJson(sheetUrl(), writeBody(record));
  if (wrote?.error) throw new Error(`dedup write rejected: ${wrote.error}`);

  // Read it back. This is the check that would have caught the flood.
  const keys = await fetchKeys();
  if (!keys.has(String(item.dedupKey))) {
    throw new Error(
      `dedup write did not stick for "${item.dedupKey}" — the Sheet accepted the ` +
        `call but the record is not there. Posting is halted so this draw cannot repeat.`
    );
  }

  return { ok: true, verified: true };
}

// Round-trip probe for /api/draws/selftest: writes a throwaway record and reads
// it back, so a broken memory is caught before anything is published.
export async function verifyStore() {
  if (!storeIsDurable()) {
    return {
      ok: false,
      durable: false,
      error: "SHEET_WEBHOOK_URL / SHEET_SECRET are not set",
    };
  }

  const probeKey = `__selftest__${Date.now()}`;
  try {
    const before = await fetchKeys();
    const sent = writeBody({
      id: probeKey,
      type: RECORD_TYPE,
      title_fa: "self test",
      title_en: "self test",
      posted_at: new Date().toISOString(),
    });
    const wrote = await postJson(sheetUrl(), sent);
    const after = await fetchKeys();
    const stuck = after.has(probeKey);
    return {
      ok: stuck,
      durable: true,
      canRead: true,
      canWrite: stuck,
      backend:
        backend === "keys"
          ? "dedicated draws sheet"
          : "shared Topic Engine sheet (Library tab)",
      keysBefore: before.size,
      keysAfter: after.size,
      probeKey,
      // What the Sheet actually said. Without this a silent no-op is
      // indistinguishable from a rejected write, and both look like canWrite:false.
      sentFields: Object.keys(sent),
      writeResponse: wrote,
      note: stuck
        ? "Read and write both confirmed. Safe to post."
        : explainDeadWrite(wrote),
    };
  } catch (e) {
    return { ok: false, durable: true, error: String(e?.message || e) };
  }
}

// The write came back without an exception but the row is not there. The reply
// says why; translate it into the one thing to go and do.
function explainDeadWrite(wrote) {
  if (wrote?.error === "unauthorized") {
    return "The Sheet rejected the write as unauthorized: SHEET_SECRET here does not match SECRET in the Apps Script. Note the read succeeded, so this is a doPost-side mismatch — usually a deployment still serving older code.";
  }
  if (wrote && wrote.version === undefined) {
    return "The deployed Apps Script is older than the current google-apps-script.gs — its doPost does not report a version, so it is ignoring the payload this app sends. Redeploy: Deploy -> Manage deployments -> pencil -> Version: New version -> Deploy (not 'New deployment', which would change the URL).";
  }
  if (wrote?.added === 0 && wrote?.received > 0) {
    return "The Apps Script received the record but added nothing — it already considered that key present, which should be impossible for a fresh probe key. Check the PostedDraws tab.";
  }
  if (wrote?.received === 0) {
    return "The Apps Script ran but saw no records in the payload — the field name it reads does not match what this app sends. Redeploy the current google-apps-script.gs.";
  }
  return "The Sheet accepted the write but the record is not there — posting will stay blocked until this is fixed.";
}

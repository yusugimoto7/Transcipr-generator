// Saved visa-result cases ("خبر ویزا"), one per client, in the shared Sheet like the rest of the
// workspace (records "visacase:<id>"). A case is saved only once its stories are made, and holds
// only what is safe to keep: the covered pictures, the story text, the design choices and the
// stories. The original pictures are never saved, so a saved case can be redrawn with new text or
// a new design, but not uncovered.

import { getRecords, saveRecord } from "../workspace.js";

const ID_RE = /^vc-[a-z0-9]{6,24}$/;

export async function listCases() {
  return (await getRecords("visacase:"))
    .map((r) => ({ ...r, id: String(r.id).slice("visacase:".length) }))
    .filter((c) => ID_RE.test(c.id) && !c.archived)
    .sort((a, b) => (b.created || b.ts || 0) - (a.created || a.ts || 0));
}

export async function saveCase(c) {
  if (!ID_RE.test(String(c.id || ""))) throw new Error("bad case id");
  const { id, ...rest } = c;
  const rec = { id: `visacase:${id}`, type: "visacase", ...rest, ts: Date.now() };
  // One Sheet cell holds the record (50,000 characters at most): a case with very many marks is
  // saved without the marks it can do without (the story pictures themselves are already drawn).
  if (JSON.stringify(rec).length > 45000) rec.marks = (rec.marks || []).map((m) => (Array.isArray(m) ? m.filter((x) => x && x.kind !== "keep").slice(0, 30) : []));
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      return await saveRecord(rec, { strict: true });
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function archiveCase(id) {
  const c = (await listCases()).find((x) => x.id === id);
  if (!c) throw new Error("not found");
  return saveCase({ ...c, archived: true });
}

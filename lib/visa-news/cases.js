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
  return saveRecord({ id: `visacase:${id}`, type: "visacase", ...rest, ts: Date.now() });
}

export async function archiveCase(id) {
  const c = (await listCases()).find((x) => x.id === id);
  if (!c) throw new Error("not found");
  return saveCase({ ...c, archived: true });
}

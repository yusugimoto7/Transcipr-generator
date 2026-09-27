import { getAppType } from './appTypes';
import { getSchema } from './schema';
import { fileProgress, stageOf } from './progress';
import { caseKeyOf } from './cases';

/**
 * What the file lists show about one application: who, what, where it stands.
 * `people` maps user ids to users (for the assigned team).
 */
export function summarizeFile(a, people = new Map()) {
  const type = getAppType(a.type);
  let p = null;
  try {
    p = fileProgress(a, getSchema(a.type));
  } catch {
    /* an unreadable file still lists */
  }
  return {
    id: a.id,
    caseKey: caseKeyOf(a),
    title: a.title,
    type: a.type,
    typeTitle: type.title,
    group: type.group,
    service: type.service || '',
    clientNumber: a.clientNumber || '',
    groupId: a.groupId || null,
    applicantRole: a.applicantRole || 'main',
    assignedTo: (a.assignedTo || []).map((id) => ({ id, name: people.get(id)?.name || people.get(id)?.email || '?' })),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    stage: p ? stageOf(p) : 'documents',
    docs: p ? { provided: p.documents.provided, required: p.documents.required } : null,
    intake: p ? { done: p.intake.done, total: p.intake.total } : null,
    check: p ? { red: p.check.red, orange: p.check.orange, toSign: p.check.toSign } : null,
    finalStale: Boolean(p?.final.stale),
  };
}

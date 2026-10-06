import { updateApplication, effectiveRole } from '@/lib/store';
import { applySetupChange, planFinalFiles } from '@/lib/finalFiles';
import { chatTools } from '@/lib/ai';
import { TOOLS, fileContext, runTool } from '@/lib/agent';
import { logActivity } from '@/lib/activity';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The team's note on one final file. Body: { slot, text, apply? }.
 * Saved on the file's set; with apply, the assistant carries it out on that
 * file now (take pages out, move documents, draft its letter again …) and
 * rebuilds it — each action in the file's activity.
 */
export async function POST(req, { params }) {
  const { app, user, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  if (!['admin', 'manager'].includes(effectiveRole(user))) return error('Only the team can add notes to the final files.', 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const slot = String(body.slot || '');
  const text = String(body.text || '').trim().slice(0, 4000);
  const entry = planFinalFiles(app).find((e) => e.slot === slot);
  if (!entry) return error('That file is not in the set.');
  if (entry.kind === 'form') return error('Notes are for the files the platform makes, not the official forms.');
  let next;
  try {
    next = await updateApplication(app.id, (a) => {
      a.finalSetup = applySetupChange(a, { op: 'note', slot, text, by: user.name || user.email });
      return a;
    });
  } catch (e) {
    return error(e.message, 400);
  }
  await logActivity(app.id, user, text ? `Wrote a note for the final file ${entry.name}` : `Cleared the note on ${entry.name}`, text ? { items: [text.slice(0, 300)] } : {});
  if (!body.apply || !text) return json({ finalSetup: next.finalSetup });

  const system = `You are the firm's assistant, acting on one final file of this client's file with your tools.
Carry out the team's note on the final file "${entry.name}" (slot "${slot}") now: take pages out (page numbers
are of the built file), move documents in or out, add or remove files, or draft its letter again with the
note as instructions — whatever the note asks. Then rebuild this file (rebuild_final_files with its slot),
unless an action already rebuilt it. Do only what the note asks; if part of it can't be done with the tools,
say so. Answer in a few lines: what you did. Answer in the language of the note.\n\n${fileContext(next)}`;
  try {
    const out = await chatTools({ system, history: [{ role: 'user', content: `Note on ${entry.name}: ${text}` }], tools: TOOLS, run: (name, args) => runTool(app.id, user, name, args), maxTokens: 1500 });
    return json({ finalSetup: next.finalSetup, reply: out.text, actions: out.actions.map((x) => ({ name: x.name, ok: !x.result?.error, error: x.result?.error || null })) });
  } catch (e) {
    return error(`The note is saved, but the assistant could not apply it: ${e.message}`, 502);
  }
}

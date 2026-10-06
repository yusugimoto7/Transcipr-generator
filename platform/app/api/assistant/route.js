import { chat, chatTools } from '@/lib/ai';
import { TOOLS, fileContext, runTool } from '@/lib/agent';
import { getApplication, updateApplication, canAccess, effectiveRole } from '@/lib/store';
import { emailFactsText } from '@/lib/emails';
import { notesText } from '@/lib/notes';
import { checklistStatus, missingItems } from '@/lib/checklist';
import { getAppType } from '@/lib/appTypes';
import { json, error, requireUser } from '@/lib/api';

const MAX_HISTORY = 40; // messages kept per application

export const runtime = 'nodejs';
export const maxDuration = 120;

const SYSTEM = `You are the friendly in-app assistant for a platform that helps people
prepare Canadian temporary-residence applications (study and work permits, visitor visas,
visitor records, super visas and related requests). You help with the process, what
documents are needed, how to answer the intake, how to strengthen the file, and how to use
the platform's features (Documents, Intake, letter builder, Review, Generate). Answer for
the application type given in the file context.

Style: warm, concise, practical. Prefer short answers and bullet points. If you are unsure
or the question needs a lawyer/RCIC, say so. Always add a brief reminder, when relevant,
that this is general information and not legal advice, and that applicants must follow the
current official IRCC instructions for their country. Never invent facts about the
applicant — if you need a detail, ask.`;

const AGENT = `You work for the firm's team on this client's file, and you can act on it with your tools:
change intake answers, take pages out of a final file, move documents between final files, add or
remove optional final files, draft a letter again with instructions, rebuild final files, save notes,
mark a document's findings as already checked, change a document's type.

- When the team tells you a fact about the client ("the father's name is Ali Rezaei"), put it in the
  right intake field (update_intake) with the exact field id, then say what you changed.
- When they ask for a change to a file ("remove pages 3 and 4 of Client Information"), do it with the
  tools right away; page numbers are the page numbers of the built file. Then say what you did.
- Only change what was asked. If a request is unclear (which field, which file, which document), ask
  one short question instead of guessing. Never invent client facts.
- After acting, answer in a few lines: what changed, and anything the team should check. Every action
  is recorded in the file's activity.
- Answer in the language the team member wrote in (Persian or English).`;

export async function POST(req) {
  const { user, error: authErr } = await requireUser();
  if (authErr) return authErr;

  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return error('No question provided.');
  }

  // Optional: ground the assistant in the applicant's current file.
  let context = '';
  let ownedApp = null;
  if (body.appId) {
    const app = await getApplication(body.appId);
    if (app && canAccess(user, app)) {
      ownedApp = app;
      const d = app.data || {};
      const missing = missingItems(checklistStatus(app)).map((c) => `${c.code} ${c.label}`);
      const t = getAppType(app.type);
      context = `\n\nCurrent applicant file (their own data, for your reference):
- Application type: ${t.title}${t.service ? ` (service ${t.service})` : ''}
- Name: ${d.givenName || ''} ${d.familyName || ''}
- Citizenship: ${d.citizenship || 'unknown'}
- Program: ${d.programName || 'unknown'} at ${d.schoolName || 'unknown'} (${d.schoolProvince || ''})
- Funds declared (CAD): ${d.totalFunds || 'unknown'}
- Documents still missing: ${missing.length ? missing.join(', ') : 'none'}${['admin', 'manager'].includes(effectiveRole(user)) && emailFactsText(app, 30) ? `\n${emailFactsText(app, 30)}` : ''}${['admin', 'manager'].includes(effectiveRole(user)) && notesText(app, 30) ? `\n${notesText(app, 30)}` : ''}`;
    }
  }

  // Attach the file summary to the newest question only, so it stays current.
  const history = messages.map((m, i) =>
    i === messages.length - 1 && context ? { role: m.role, content: m.content + context } : m
  );

  let reply;
  let actions = [];
  const staff = ownedApp && ['admin', 'manager'].includes(effectiveRole(user));
  try {
    if (staff) {
      // A team member on a file: the assistant can also act on it (lib/agent.js).
      const system = `${SYSTEM}\n\n${AGENT}\n\n${fileContext(ownedApp)}`;
      const out = await chatTools({ system, history: messages, tools: TOOLS, run: (name, args) => runTool(ownedApp.id, user, name, args), maxTokens: 1500 });
      reply = out.text || 'Done.';
      actions = out.actions.map((x) => ({ name: x.name, ok: !x.result?.error, error: x.result?.error || null }));
    } else {
      reply = await chat({ system: SYSTEM, history, maxTokens: 1024 });
    }
  } catch (e) {
    return error(`Assistant unavailable: ${e.message}`, 502);
  }

  // Persist the conversation on the application so it's remembered next time.
  if (ownedApp) {
    const lastUser = messages[messages.length - 1];
    const now = new Date().toISOString();
    await updateApplication(ownedApp.id, (a) => {
      const hist = Array.isArray(a.assistantHistory) ? a.assistantHistory : [];
      hist.push({ role: 'user', content: lastUser.content, ts: now });
      hist.push({ role: 'assistant', content: reply, ts: now });
      a.assistantHistory = hist.slice(-MAX_HISTORY);
      return a;
    });
  }

  return json({ reply, actions });
}

import { getClient, MODEL } from '@/lib/anthropic';
import { getApplication, updateApplication } from '@/lib/store';
import { buildChecklist } from '@/lib/checklist';
import { json, error, requireUser } from '@/lib/api';

const MAX_HISTORY = 40; // messages kept per application

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM = `You are the friendly in-app assistant for a platform that helps people
prepare a Canadian Study Permit application. You help applicants understand the process,
what documents they need, how to answer the intake, how to strengthen their file, and how
to use the platform's features (Documents, Intake, Study Plan builder, Review, Generate).

Style: warm, concise, practical. Prefer short answers and bullet points. If you are unsure
or the question needs a lawyer/RCIC, say so. Always add a brief reminder, when relevant,
that this is general information and not legal advice, and that applicants must follow the
current official IRCC instructions for their country. Never invent facts about the
applicant — if you need a detail, ask.`;

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
    if (app && app.userId === user.id) {
      ownedApp = app;
      const d = app.data || {};
      const checklist = buildChecklist(d);
      const uploaded = new Set((app.documents || []).map((x) => x.category).filter(Boolean));
      const missing = checklist.filter((c) => !uploaded.has(c.key)).map((c) => c.label);
      context = `\n\nCurrent applicant file (their own data, for your reference):
- Name: ${d.givenName || ''} ${d.familyName || ''}
- Citizenship: ${d.citizenship || 'unknown'}
- Program: ${d.programName || 'unknown'} at ${d.schoolName || 'unknown'} (${d.schoolProvince || ''})
- Funds declared (CAD): ${d.totalFunds || 'unknown'}
- Documents still missing: ${missing.length ? missing.join(', ') : 'none'}`;
    }
  }

  const anthropicMessages = messages.map((m, i) =>
    i === messages.length - 1 && context
      ? { role: m.role, content: [{ type: 'text', text: m.content + context }] }
      : m
  );

  let reply;
  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      messages: anthropicMessages,
    });
    reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
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

  return json({ reply });
}

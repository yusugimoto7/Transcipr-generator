import crypto from 'crypto';
import { completeJson } from './ai';
import { allFields, deriveData } from './schema';
import { getAppType } from './appTypes';
import { getApplication, updateApplication } from './store';
import { fieldGuide } from './generators/extract';
import { TOPICS, ABOUT, MAX_BODY, cleanBody } from './emails';
import { displayName } from './cases';

/**
 * Client emails on the file: every message filed from the mailbox keeps its
 * text on the file (app.emails), and is read for the facts it states that may
 * matter to the application — travel dates, who pays, jobs, family, earlier
 * refusals, promises of documents… Those facts:
 *   - are listed in the file's Emails section, with the quote they come from;
 *   - fill intake fields that are still empty (never overwrite an answer — a
 *     different value is shown for the team to choose);
 *   - are given to the letter drafts and the readiness review as the client's
 *     own statements (lib/emails.js emailFactsText).
 */

/** Keep the message on the file (once). */
export async function recordEmail(appId, msg, how = '') {
  await updateApplication(
    appId,
    (a) => {
      a.emails ||= [];
      if (a.emails.some((e) => e.id === msg.id)) return false;
      a.emails.push({
        id: msg.id,
        date: msg.date,
        from: msg.from,
        subject: msg.subject || '',
        body: String(msg.body ?? msg.text ?? '').slice(0, MAX_BODY),
        attachments: (msg.attachments || []).map((x) => x.name),
        how,
        receivedAt: new Date().toISOString(),
      });
      return a;
    },
    { quiet: true }
  );
}

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Read one email of the file for facts; fill empty intake fields from it. */
export async function analyzeEmail(appId, emailId) {
  const app = await getApplication(appId);
  const email = (app?.emails || []).find((e) => e.id === emailId);
  if (!email) throw new Error('Email not found on this file.');
  const text = cleanBody(email.body) || email.body || '';
  const t = getAppType(app.type);
  const fields = new Map(allFields(app.type).filter((f) => f.type !== 'bool').map((f) => [f.id, f]));

  const system = `You work for a Canadian immigration consultancy. You read an email a client (or someone
writing for them) sent to the firm, for this file: ${t.title}${t.service ? ` (service ${t.service})` : ''}, main person ${displayName(app)}.
Pull out the FACTS the email states that may be used in preparing the application: identity details,
family members, the purpose and dates of travel, study or work plans, jobs and employers, money
(who pays, balances, property, income), ties to the home country, earlier visas, travel or refusals,
the spouse/host in Canada, and which documents they are sending, will send, or cannot get.

Rules:
- Only what the email itself says. Never invent or infer beyond it. Ignore greetings, signatures,
  legal disclaimers and any quoted earlier messages.
- The email may be in Persian or mixed. Write each fact in plain English; keep the quote in the
  email's own words (short, exact).
- Say whom each fact is about: ${ABOUT.join(' | ')}.
- Also give intake values the email states outright (dates as YYYY-MM-DD, numbers without symbols,
  select fields exactly as one of the options). Leave a field out unless the email clearly states it.`;

  const instruction = `Return JSON:
{
  "summary": "one sentence: what this email is about",
  "facts": [ { "topic": "${Object.keys(TOPICS).join('|')}", "about": "${ABOUT.join('|')}", "text": "the fact, one sentence", "quote": "exact words from the email" } ],
  "fields": { "<field id>": "value" },
  "requests": [ "questions the client asks the firm, or things they say they will do or send" ]
}

Intake fields (id, type, label) by section:
${fieldGuide(app.type)}

Email from ${email.from?.name ? `${email.from.name} <${email.from.address}>` : email.from?.address || 'unknown'}, ${String(email.date).slice(0, 10)}
Subject: ${email.subject}

${text.slice(0, 20000)}`;

  const out = await completeJson({ system, content: instruction, maxTokens: 3000 });

  const facts = (Array.isArray(out.facts) ? out.facts : [])
    .filter((f) => f && String(f.text || '').trim())
    .slice(0, 60)
    .map((f) => ({
      id: crypto.randomBytes(4).toString('hex'),
      topic: TOPICS[f.topic] ? f.topic : 'other',
      about: ABOUT.includes(f.about) ? f.about : 'applicant',
      text: String(f.text).trim().slice(0, 500),
      quote: String(f.quote || '').trim().slice(0, 300),
    }));
  const proposed = {};
  for (const [k, v] of Object.entries(out.fields && typeof out.fields === 'object' ? out.fields : {})) {
    const f = fields.get(k);
    if (!f || v == null || String(v).trim() === '') continue;
    if (f.options && !f.options.includes(v)) continue;
    proposed[k] = typeof v === 'string' ? v.trim() : v;
  }

  let result = null;
  await updateApplication(appId, (a) => {
    const e = (a.emails || []).find((x) => x.id === emailId);
    if (!e) return false;
    const filled = [];
    const conflicts = [];
    for (const [k, v] of Object.entries(proposed)) {
      const cur = a.data?.[k];
      if (cur == null || String(cur).trim() === '') {
        a.data[k] = v;
        filled.push(k);
      } else if (norm(cur) !== norm(v)) {
        conflicts.push({ field: k, label: fields.get(k)?.label || k, entered: cur, email: v });
      }
    }
    if (filled.length) {
      deriveData(a.data);
      a.dataVersion = (Number(a.dataVersion) || 0) + 1;
    }
    e.analysis = {
      summary: String(out.summary || '').slice(0, 400),
      facts,
      fields: proposed,
      filled,
      conflicts,
      requests: (Array.isArray(out.requests) ? out.requests : []).map((r) => String(r).slice(0, 300)).filter(Boolean).slice(0, 20),
      at: new Date().toISOString(),
    };
    delete e.analysisError;
    result = e.analysis;
    return a;
  });
  return result;
}

/** Analyse without throwing: a failure is recorded on the email for the team to retry. */
export async function analyzeEmailSafe(appId, emailId) {
  try {
    return await analyzeEmail(appId, emailId);
  } catch (err) {
    await updateApplication(appId, (a) => {
      const e = (a.emails || []).find((x) => x.id === emailId);
      if (!e) return false;
      e.analysisError = err.message;
      return a;
    }, { quiet: true }).catch(() => {});
    return null;
  }
}

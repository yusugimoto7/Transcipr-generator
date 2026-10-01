/**
 * Client emails kept on a file (app.emails) and the facts read from them.
 * Pure helpers shared by the server (analysis, letters, review) and the
 * Emails panel. The analysis itself is in lib/emailFacts.js.
 *
 * app.emails: [{ id, date, from: { address, name }, subject, body, attachments: [name],
 *                how, receivedAt, analysis?: { summary, facts, fields, filled, conflicts,
 *                requests, at }, analysisError? }]
 */

export const TOPICS = {
  identity: 'Identity',
  family: 'Family',
  purpose: 'Purpose',
  travel: 'Travel plans',
  education: 'Education',
  work: 'Work',
  finances: 'Finances',
  ties: 'Ties to home',
  history: 'Immigration history',
  host: 'Spouse / host in Canada',
  documents: 'Documents',
  other: 'Other',
};
export const ABOUT = ['applicant', 'spouse', 'child', 'parent', 'host', 'other'];

export const MAX_BODY = 50000;

/**
 * The new part of an email: stops at the quoted earlier message ("On … wrote:",
 * "-----Original Message-----", Persian Gmail's "… نوشت:", "> " lines).
 */
export function cleanBody(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const next = lines[i + 1] || '';
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(l.trim())) break;
    if (/^On .{4,200}(wrote|a écrit):?\s*$/i.test(l.trim()) || /^On .{4,200}$/.test(l.trim()) && /wrote:?\s*$/i.test(next.trim())) break;
    if (/نوشت:?\s*$/.test(l.trim()) && /^(در|On)\s/.test(l.trim())) break;
    if (/^From:\s.+/i.test(l.trim()) && out.join('').trim() && /^(Sent|Date|To):/i.test(next.trim())) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Facts from the file's emails, as text for the letter, review and assistant prompts. */
export function emailFactsText(app, max = 80) {
  const lines = [];
  for (const e of [...(app.emails || [])].sort((a, b) => String(a.date).localeCompare(b.date))) {
    const day = String(e.date || '').slice(0, 10);
    for (const f of e.analysis?.facts || []) {
      if (f.dismissed) continue;
      lines.push(`- [${TOPICS[f.topic] || 'Other'}${f.about && f.about !== 'applicant' ? `, about the ${f.about}` : ''}] ${f.text} (client email ${day})`);
    }
  }
  if (!lines.length) return '';
  return `Facts the client stated in their emails (their own words — not yet proven by documents; use them where relevant, never contradict a document with them):\n${lines.slice(-max).join('\n')}`;
}

/** What a viewer may see of a file: the emails, their analysis and the team's notes are for the team. */
export function forViewer(app, staff) {
  if (staff || !app) return app;
  const { emails, notes, clientLink, ...rest } = app;
  return rest;
}

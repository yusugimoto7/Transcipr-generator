'use client';

import { AlertOctagon, AlertTriangle, FileQuestion, Sparkles, UserCheck, ClipboardList, PenLine, ShieldCheck, PackageCheck, CheckCircle2, ChevronRight, Mail, HardDrive, Upload, FileSearch, Hammer } from 'lucide-react';
import { fmtDay, fmtAgo } from '@/lib/format';
import { NotesBox, NotesFeed } from '@/components/Notes';


const fmtDate = fmtDay;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The actions this file needs, most urgent first. */
function nextSteps(app, p, staff, showFinal, letterTitle) {
  const out = [];
  if (p.check.red) out.push({ tone: 'danger', icon: AlertOctagon, t: `${plural(p.check.red, 'document')} with a serious problem`, d: 'Wrong dates or names, a missing certified copy, an expired document. Fix before submission.', go: ['documents', 'filter=serious'] });
  if (p.check.orange) out.push({ tone: 'warn', icon: AlertTriangle, t: `${plural(p.check.orange, 'document')} need${p.check.orange === 1 ? 's' : ''} attention`, d: 'Spelling differences, vague statements, missing details.', go: ['documents', 'filter=attention'] });
  if (p.documents.missing.length) {
    const names = p.documents.missing.slice(0, 3).map((m) => m.label).join(' · ');
    out.push({ tone: 'info', icon: FileQuestion, t: `${plural(p.documents.missing.length, 'document')} still missing`, d: names + (p.documents.missing.length > 3 ? ` · +${p.documents.missing.length - 3} more` : ''), go: ['documents', 'filter=missing'] });
  }
  if (p.check.unread) out.push({ tone: 'info', icon: Sparkles, t: `${plural(p.check.unread, 'new file')} not read yet`, d: 'Read them to fill the intake and check each document.', go: ['documents', 'filter=all'] });
  if (staff && p.check.toSign) out.push({ tone: '', icon: UserCheck, t: `${plural(p.check.toSign, 'checked document')} waiting for sign-off`, d: 'Look at each one and confirm it with "I checked this document".', go: ['documents', 'filter=sign'] });
  if (p.intake.next) out.push({ tone: '', icon: ClipboardList, t: `${staff ? 'Intake' : 'Your details'}: ${plural(p.intake.total - p.intake.done, 'section')} to complete`, d: `Next: ${p.intake.next.title} — ${p.intake.next.text.toLowerCase()}`, go: ['intake', p.intake.next.id] });
  if (!p.letter.done) out.push({ tone: '', icon: PenLine, t: `Write the ${letterTitle}`, d: 'Answer a few questions; a draft is written for you to edit.', go: ['sop'] });
  if (staff && !p.review) out.push({ tone: '', icon: ShieldCheck, t: 'Run the readiness review', d: 'A score out of 100 with what to fix before submitting.', go: ['review'] });
  if (showFinal && (!p.final.count || p.final.stale)) {
    out.push({ tone: p.final.stale ? 'warn' : '', icon: Hammer, t: p.final.stale ? 'Final files are out of date' : 'Build the final files', d: p.final.stale ? 'Documents or letters changed after the last build. Rebuild before uploading.' : 'Letters, forms and numbered files for the IRCC portal, in one click.', go: ['generate'] });
  }
  return out;
}

/** Recent events on the file, newest first. Uploads that arrived together are grouped. */
function activity(app) {
  const ev = [];
  const groups = new Map();
  for (const d of app.documents || []) {
    const at = d.mailDate || d.uploadedAt;
    if (!at) continue;
    const key = `${d.source || 'upload'}|${String(at).slice(0, 16)}`;
    const g = groups.get(key) || { at, source: d.source || 'upload', files: [] };
    g.files.push(d.filename);
    groups.set(key, g);
    if (d.verification?.reviewedAt) ev.push({ at: d.verification.reviewedAt, icon: UserCheck, text: `${d.verification.reviewedBy} signed off ${d.filename}` });
  }
  for (const g of groups.values()) {
    const what = g.files.length === 1 ? g.files[0] : `${g.files.length} files`;
    const icon = g.source === 'email' ? Mail : g.source === 'drive' ? HardDrive : Upload;
    const text = g.source === 'email' ? `Client emailed ${what}` : g.source === 'drive' ? `Imported ${what} from Google Drive` : `Uploaded ${what}`;
    ev.push({ at: g.at, icon, text });
  }
  const read = (app.documents || []).map((d) => d.extractedAt).filter(Boolean).sort().pop();
  if (read) ev.push({ at: read, icon: FileSearch, text: 'Documents read and checked' });
  if (app.review?.generatedAt) ev.push({ at: app.review.generatedAt, icon: ShieldCheck, text: `Readiness review: ${app.review.readinessScore}/100` });
  if (app.finalFiles?.builtAt) ev.push({ at: app.finalFiles.builtAt, icon: PackageCheck, text: `Built ${plural(app.finalFiles.files?.length || 0, 'final file')}` });
  if (app.createdAt) ev.push({ at: app.createdAt, icon: CheckCircle2, text: 'File opened' });
  return ev.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
}

export default function OverviewPanel({ app, progress: p, staff, showFinal, go, letterTitle, patchLocal, viewer, openDoc }) {
  const steps = nextSteps(app, p, staff, showFinal, letterTitle);
  const events = activity(app);
  const d = app.data || {};
  const passportSoon = d.passportExpiry && new Date(d.passportExpiry).getTime() - Date.now() < 365 * 86400000;
  const details = [
    ['Name', [d.givenName, d.familyName].filter(Boolean).join(' ')],
    ['Date of birth', d.dob && fmtDate(d.dob)],
    ['Citizenship', d.citizenship],
    ['Lives in', d.countryOfResidence],
    ['Passport', d.passportNumber && (
      <span>
        <span className="mono">{d.passportNumber}</span>
        {d.passportExpiry && <span className={passportSoon ? 'chip danger' : 'faint'} style={{ marginLeft: 6 }}>{passportSoon ? 'expires ' : 'exp. '}{fmtDate(d.passportExpiry)}</span>}
      </span>
    )],
    ['Marital status', d.maritalStatus],
    ['Spouse', d.spouseName],
    ['Email', d.email],
    ['Phone', d.phoneNumber && `${d.phoneCountryCode ? `+${d.phoneCountryCode} ` : ''}${d.phoneNumber}`],
  ].filter(([, v]) => v);

  const stages = [
    { id: 'documents', icon: FileQuestion, label: 'Documents', big: <>{p.documents.provided}<small> / {p.documents.required}</small></>, ratio: p.documents.required ? p.documents.provided / p.documents.required : 0 },
    { id: 'intake', icon: ClipboardList, label: staff ? 'Intake' : 'Your details', big: <>{p.intake.done}<small> / {p.intake.total}</small></>, ratio: p.intake.total ? p.intake.done / p.intake.total : 0 },
    { id: 'sop', icon: PenLine, label: letterTitle, big: p.letter.done ? 'Drafted' : <small>Not written</small>, ratio: p.letter.done ? 1 : 0 },
    ...(staff ? [{ id: 'review', icon: ShieldCheck, label: 'Readiness', big: p.review ? <>{p.review.score}<small> / 100</small></> : <small>Not run</small>, ratio: p.review ? p.review.score / 100 : 0 }] : []),
    ...(showFinal ? [{ id: 'generate', icon: PackageCheck, label: 'Final files', big: p.final.count ? <>{p.final.count}<small> built{p.final.stale ? ' · outdated' : ''}</small></> : <small>Not built</small>, ratio: p.final.count && !p.final.stale ? 1 : 0 }] : []),
  ];

  return (
    <div className="stack">
      <div className="ov">
        <div className="stack">
          <section className="card card-flush" aria-labelledby="next-h">
            <div className="card-head">
              <div>
                <h2 id="next-h">{staff ? 'Next steps' : 'What we need from you'}</h2>
                <p className="muted small">{steps.length ? 'Most urgent first. Click one to go there.' : ''}</p>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              {steps.length === 0 ? (
                <div className="empty">
                  <CheckCircle2 size={30} color="var(--ok)" aria-hidden="true" />
                  <h2>Everything is in place</h2>
                  <p>{showFinal ? 'Download the final files and upload them to the IRCC portal.' : 'Your case officer will contact you with the next step.'}</p>
                </div>
              ) : (
                steps.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button key={i} type="button" className="next-item" onClick={() => go(...s.go)}>
                      <span className={`ico ${s.tone}`}><Icon size={17} aria-hidden="true" /></span>
                      <span className="grow">
                        <span className="t">{s.t}</span>
                        <span className="d" style={{ display: 'block' }}>{s.d}</span>
                      </span>
                      <ChevronRight size={17} className="chev" aria-hidden="true" />
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <div className="stages">
            {stages.map((s) => (
              <button key={s.id} type="button" className="stage-card" onClick={() => go(s.id)}>
                <span className="top"><span>{s.label}</span><ChevronRight size={15} aria-hidden="true" /></span>
                <span className="big">{s.big}</span>
                <span className="meter" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, s.ratio) * 100)}%` }} /></span>
              </button>
            ))}
          </div>
          {staff && patchLocal && (
            <section className="card" aria-labelledby="notes-h">
              <div className="card-head">
                <div>
                  <h2 id="notes-h">Team notes</h2>
                  <p className="muted small">Notes from account managers and admins on this file, its documents and each section. The review, letters and assistant take them into account.</p>
                </div>
              </div>
              <NotesBox app={app} patchLocal={patchLocal} viewer={viewer} section="overview" title="Add a note on the file" placeholder="e.g. Client prefers WhatsApp; call before sending anything to IRCC." compact hideList />
              <NotesFeed app={app} viewer={viewer} patchLocal={patchLocal} onOpen={(n) => (n.docId ? openDoc(n.docId) : go(n.section === 'overview' ? 'overview' : n.section))} />
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="details-h">
            <div className="card-head">
              <h2 id="details-h">{staff ? 'Client details' : 'Your details'}</h2>
              <button type="button" className="btn-ghost btn-sm" onClick={() => go('intake')}>Edit</button>
            </div>
            {details.length ? (
              <dl className="kv">
                {details.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd suppressHydrationWarning>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted small">Nothing yet. {staff ? 'Read the documents to fill these in, or complete the intake.' : 'Upload your documents or fill in your details.'}</p>
            )}
          </section>

          <section className="card" aria-labelledby="act-h">
            <h2 id="act-h">Activity</h2>
            {events.length ? (
              <ul className="timeline">
                {events.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <li key={i}>
                      <span className="ti"><Icon size={13} aria-hidden="true" /></span>
                      <span>
                        <span style={{ overflowWrap: 'anywhere' }}>{e.text}</span>
                        <span className="when" style={{ display: 'block' }} suppressHydrationWarning>{fmtAgo(e.at)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted small">No activity yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

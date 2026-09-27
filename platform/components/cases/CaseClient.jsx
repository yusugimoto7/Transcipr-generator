'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, UserPlus, Pencil, X, ArrowLeft, Link2, FilePlus2, Crown, User } from 'lucide-react';
import { getAppType, APP_TYPE_LIST } from '@/lib/appTypes';
import { groupCases, caseLabel, caseKeyOf, isDefaultTitle, normNumber, ROLE_LABEL } from '@/lib/cases';
import { fmtAgo } from '@/lib/format';
import TypePicker from '@/components/cases/TypePicker';
import { Meter, CheckCell, StageChip, sumChecks } from '@/components/cases/bits';

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`The server did not answer properly (HTTP ${res.status}). Wait a minute and try again.`);
  }
  if (!res.ok) throw new Error(data.error || 'Could not save.');
  return data;
}

/**
 * One client: the main applicant's file and the family members applying with
 * them. Each card opens that person's own file.
 */
export default function CaseClient({ caseKey, files, others, staff, odooOn }) {
  const router = useRouter();
  const c = groupCases(files)[0];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const check = sumChecks(c.members);

  return (
    <>
      <div className="crumbs" style={{ marginBottom: 6 }}>
        <Link href="/dashboard">Client files</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span>{c.clientNumber || 'Client'}</span>
      </div>
      <div className="page-head">
        <div>
          <div className="cluster" style={{ gap: 10 }}>
            <h1 style={{ margin: 0 }}>{caseLabel(c)}</h1>
            {staff && (
              <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit the client's name and file number" title="Edit name and file number">
                <Pencil size={16} />
              </button>
            )}
          </div>
          <p className="muted" style={{ marginTop: 4 }}>
            {c.members.length === 1 ? 'One applicant' : `${c.members.length} people in this file`}
            {check.red ? <> · <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{check.red} serious finding{check.red === 1 ? '' : 's'}</span></> : null}
            <span suppressHydrationWarning> · updated {fmtAgo(c.updatedAt)}</span>
          </p>
          {c.main.odoo && (
            <p className="small" style={{ margin: '4px 0 0' }}>
              <span className="faint">Odoo card:</span>{' '}
              {c.main.odoo.url ? <a href={c.main.odoo.url} target="_blank" rel="noreferrer">{c.main.odoo.title}</a> : c.main.odoo.title}
            </p>
          )}
        </div>
        {staff && (
          <button type="button" onClick={() => setAdding(true)}>
            <UserPlus size={16} aria-hidden="true" /> Add family member
          </button>
        )}
      </div>

      <div className="members">
        {c.members.map((m) => {
          const main = m.id === c.main.id;
          const Icon = main ? Crown : User;
          return (
            <Link key={m.id} href={`/application/${m.id}`} className={`card member${main ? ' main' : ''}`}>
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow cluster" style={{ gap: 5 }}><Icon size={13} aria-hidden="true" /> {main ? 'Main applicant' : ROLE_LABEL[m.applicantRole] || 'Family member'}</div>
                  <div className="m-name">{isDefaultTitle(m.title) ? <span className="faint">Name not entered</span> : m.title}</div>
                  <div className="small muted">{m.typeTitle}{m.service ? ` · ${m.service}` : ''}</div>
                </div>
                <div className="stack-sm" style={{ justifyItems: 'end' }}>
                  <StageChip f={m} />
                  {m.typeGuessed && <span className="chip warn" title="The Odoo card didn't say which application this is — set it in Client details">Check the type</span>}
                </div>
              </div>
              <div className="cluster" style={{ gap: 24, alignItems: 'flex-end' }}>
                <Meter v={m.docs} label="Documents" />
                <Meter v={m.intake} label="Intake" />
                <div style={{ marginLeft: 'auto' }}><CheckCell c={m.check} /></div>
              </div>
              <div className="m-foot">
                <span className="small faint" suppressHydrationWarning>Updated {fmtAgo(m.updatedAt)}</span>
                <span className="small strong" style={{ color: 'var(--accent)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open file <ChevronRight size={15} aria-hidden="true" /></span>
              </div>
            </Link>
          );
        })}
        {staff && (
          <button type="button" className="member-add" onClick={() => setAdding(true)}>
            <UserPlus size={22} aria-hidden="true" />
            <span className="strong">Add family member</span>
            <span className="small muted">Spouse, child or parent applying with {isDefaultTitle(c.name) ? 'this client' : c.name.split(' ')[0]}</span>
          </button>
        )}
      </div>

      {adding && <AddMember c={c} caseKey={caseKey} others={others} onClose={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }} />}
      {editing && <EditClient c={c} odooOn={odooOn} onClose={() => setEditing(false)} onDone={(key) => { setEditing(false); if (key !== caseKey) router.replace(`/case/${encodeURIComponent(key)}`); router.refresh(); }} />}
    </>
  );
}

const MEMBER_ROLES = ['spouse', 'child', 'parent', 'other'];

/** Add a family member: a new file for them, or link a file that already exists. */
function AddMember({ c, caseKey, others, onClose, onDone }) {
  const [mode, setMode] = useState('new'); // new | link
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('spouse');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [linkId, setLinkId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = type ? getAppType(type) : null;

  async function createNew() {
    setBusy(true);
    setErr('');
    try {
      await send('/api/applications', 'POST', {
        type,
        title: name,
        clientNumber: c.clientNumber,
        applicantRole: role,
        groupId: caseKey,
        representation: 'firm',
      });
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  async function link() {
    setBusy(true);
    setErr('');
    try {
      await send(`/api/applications/${linkId}`, 'PATCH', { clientNumber: c.clientNumber, groupId: caseKey, applicantRole: role });
      onDone();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const roleField = (
    <div className="field">
      <label htmlFor="am-role">Relationship to {isDefaultTitle(c.name) ? 'the main applicant' : c.name.split(' ')[0]}</label>
      <select id="am-role" value={role} onChange={(e) => setRole(e.target.value)}>
        {MEMBER_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="am-h" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="am-h">Add a family member to {caseLabel(c)}</h2>
            <p className="muted small">Each person has their own file: their documents, intake, letters and final files.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'new'} className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}><FilePlus2 size={15} aria-hidden="true" /> New file</button>
            <button type="button" role="tab" aria-selected={mode === 'link'} className={mode === 'link' ? 'on' : ''} onClick={() => setMode('link')}><Link2 size={15} aria-hidden="true" /> Link an existing file</button>
          </div>

          {mode === 'new' && step === 1 && (
            <div className="grid2">
              {roleField}
              <div className="field">
                <label htmlFor="am-name">Name<span className="req" aria-hidden="true">*</span></label>
                <input id="am-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="As in the passport" />
              </div>
            </div>
          )}
          {mode === 'new' && step === 2 && (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>What is {name.split(' ')[0] || 'this person'} applying for?</p>
              <TypePicker value={type} onChange={setType} onPick={setType} />
            </>
          )}

          {mode === 'link' && (
            c.clientNumber ? (
              <>
                {roleField}
                <div className="field">
                  <label htmlFor="am-link">File to link</label>
                  <select id="am-link" value={linkId} onChange={(e) => setLinkId(e.target.value)}>
                    <option value="">— choose a file —</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.clientNumber ? `${o.clientNumber} · ` : ''}{isDefaultTitle(o.title) ? 'Unnamed' : o.title} — {getAppType(o.type).title}
                      </option>
                    ))}
                  </select>
                  <div className="note">The file takes this client’s number ({c.clientNumber}) and appears on this page.</div>
                </div>
              </>
            ) : (
              <div className="alert info"><span>Give this client a file number first (the pencil next to the name), then link other files to it.</span></div>
            )
          )}
          {err && <div className="alert err">{err}</div>}
        </div>
        <div className="modal-foot">
          {mode === 'new' && step === 2 && <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ marginRight: 'auto' }}><ArrowLeft size={15} aria-hidden="true" /> Back</button>}
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          {mode === 'new' && step === 1 && <button type="button" onClick={() => setStep(2)} disabled={!name.trim()}>Continue</button>}
          {mode === 'new' && step === 2 && (
            <button type="button" onClick={createNew} disabled={!type || busy}>
              {busy ? <span className="spinner" /> : `Create ${chosen ? chosen.title.split(' — ')[0] : 'file'}`}
            </button>
          )}
          {mode === 'link' && c.clientNumber && <button type="button" onClick={link} disabled={!linkId || busy}>{busy ? <span className="spinner" /> : 'Link file'}</button>}
        </div>
      </div>
    </div>
  );
}

/** Rename the client and set the file number shared by everyone in the file. */
function EditClient({ c, odooOn, onClose, onDone }) {
  const [name, setName] = useState(isDefaultTitle(c.name) ? '' : c.name);
  const [number, setNumber] = useState(c.clientNumber);
  const [type, setType] = useState(c.main.type);
  const [q, setQ] = useState(isDefaultTitle(c.name) ? c.clientNumber : c.name);
  const [cards, setCards] = useState(null);
  const [searching, setSearching] = useState(false);

  async function search(e) {
    e?.preventDefault();
    setSearching(true);
    setErr('');
    try {
      const res = await fetch(`/api/odoo/cards?q=${encodeURIComponent(q)}`);
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not search Odoo.');
      setCards(d.cards);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSearching(false);
    }
  }

  async function linkCard(card) {
    setBusy(true);
    setErr('');
    try {
      await send(`/api/applications/${c.main.id}/odoo`, 'POST', { taskId: card.taskId });
      onDone(card.number || caseKeyOf(c.main));
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const num = normNumber(number);
      // Everyone in the family carries the same number; the old key stays as groupId so the family holds together.
      const key = num || caseKeyOf(c.main);
      for (const m of c.members) {
        await send(`/api/applications/${m.id}`, 'PATCH', {
          clientNumber: num,
          groupId: key,
          ...(m.id === c.main.id && name.trim() ? { title: name.trim() } : {}),
          ...(m.id === c.main.id && type !== c.main.type ? { type } : {}),
        });
      }
      onDone(key);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="ec-h" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="modal-head">
          <div>
            <h2 id="ec-h">Client details</h2>
            <p className="muted small">The file number is shared by everyone in this file.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="ec-num">Client file number</label>
            <input id="ec-num" className="mono" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="e.g. S26213" autoFocus />
          </div>
          <div className="field">
            <label htmlFor="ec-name">Main applicant’s name</label>
            <input id="ec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="As in the passport" />
          </div>
          <div className="field">
            <label htmlFor="ec-type">Main applicant’s application</label>
            <select id="ec-type" value={type} onChange={(e) => setType(e.target.value)}>
              {APP_TYPE_LIST.map((t) => <option key={t.key} value={t.key}>{t.title}{t.service ? ` · ${t.service}` : ''}</option>)}
            </select>
            {c.main.typeGuessed && <div className="note" style={{ color: 'var(--warn)' }}>Created from Odoo; the card didn’t say which application this is. Please check.</div>}
          </div>
          {odooOn && (
            <div className="field">
              <label htmlFor="ec-odoo">Odoo card</label>
              <div className="cluster" style={{ flexWrap: 'nowrap' }}>
                <input id="ec-odoo" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(e); }} placeholder="Name or client number" />
                <button type="button" className="btn-secondary" onClick={search} disabled={searching || !q.trim()}>{searching ? <span className="spinner dark" /> : 'Search'}</button>
              </div>
              <div className="note">Linking takes the card’s number and name for this client and the whole family.</div>
              {cards && (
                <div className="list" style={{ marginTop: 8 }}>
                  {!cards.length && <div className="list-row small muted">No cards found.</div>}
                  {cards.map((card) => (
                    <div className="list-row" key={card.taskId} style={{ padding: '8px 12px' }}>
                      <div className="grow small">
                        <div className="strong">{card.title}</div>
                        <div className="faint">{card.stage}{card.createdAt ? ` · ${fmtAgo(card.createdAt)}` : ''}{c.main.odoo?.taskId === card.taskId ? ' · linked now' : ''}</div>
                      </div>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => linkCard(card)} disabled={busy}>Link</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {err && <div className="alert err">{err}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy}>{busy ? <span className="spinner" /> : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { questionsFor } from '@/lib/sopQuestions';
import { primaryLetter } from '@/lib/appTypes';
import { Check, FileDown, FileText, PenLine, Save, Sparkles } from 'lucide-react';

export default function SopBuilderPanel({ app, patchLocal }) {
  const letter = primaryLetter(app.type);
  const QUESTIONS = questionsFor(letter.kind);
  const [answers, setAnswers] = useState(app.sopAnswers || {});
  const [text, setText] = useState(app.sop?.text || '');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  function toggle(qid, option) {
    setAnswers((prev) => {
      const cur = prev[qid] || { selected: [], note: '' };
      const has = cur.selected.includes(option);
      const selected = has ? cur.selected.filter((o) => o !== option) : [...cur.selected, option];
      return { ...prev, [qid]: { ...cur, selected } };
    });
  }

  function setNote(qid, note) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...(prev[qid] || { selected: [] }), note } }));
  }

  async function generate() {
    setBusy(true);
    setMsg(null);
    setText('');
    try {
      // Stream the draft so long generations don't time out on mobile.
      const res = await fetch(`/api/applications/${app.id}/sop/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Generation failed.');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setText(acc);
      }
      if (!acc.trim()) throw new Error('No text was generated. Please try again.');

      // Persist the final text and render the PDF (fast, no AI).
      const save = await fetch(`/api/applications/${app.id}/sop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, editedText: acc }),
      });
      const data = await save.json();
      if (save.ok) {
        patchLocal({ generated: data.generated, sopAnswers: answers, sop: { text: acc } });
        setMsg({ type: 'ok', text: 'Draft written. Edit it in the client’s own words, then save.' });
      } else {
        setMsg({ type: 'ok', text: 'Draft ready — edit it, then press "Save & update PDF".' });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdited() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/sop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, editedText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed.');
      patchLocal({ generated: data.generated, sop: { text: data.text } });
      setMsg({ type: 'ok', text: 'Saved. The PDF now reflects your edits.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setSaving(false);
    }
  }

  const answered = Object.values(answers).filter(
    (a) => (a?.selected?.length || 0) > 0 || (a?.note || '').trim()
  ).length;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{letter.title}</h1>
          <p className="muted small">Answer the questions, generate a draft, then edit it in the client&apos;s own words. It is used as-is in the final files.</p>
        </div>
        {text && (
          <div className="btn-row">
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/sop`}><FileDown size={16} aria-hidden="true" /> PDF</a>
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/sop?format=docx`}><FileText size={16} aria-hidden="true" /> Word</a>
          </div>
        )}
      </div>
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ margin: 0 }}>{msg.text}</div>}

      <div className="letter">
        <section className="card" aria-labelledby="q-h">
          <div className="card-head">
            <div>
              <h2 id="q-h">Questions</h2>
              <p className="muted small">Tap every answer that fits and add detail in your own words.</p>
            </div>
            <span className={`chip ${answered === QUESTIONS.length ? 'ok' : ''}`}>{answered}/{QUESTIONS.length} answered</span>
          </div>
          {QUESTIONS.map((q, i) => {
            const cur = answers[q.id] || { selected: [], note: '' };
            return (
              <div key={q.id} className="q">
                <div className="qt"><span className="n">{String(i + 1).padStart(2, '0')}</span><span>{q.question}</span></div>
                <div className="cluster" role="group" aria-label={q.question}>
                  {q.options.map((o) => {
                    const on = cur.selected.includes(o);
                    return (
                      <button key={o} type="button" onClick={() => toggle(q.id, o)} className={`opt${on ? ' on' : ''}`} aria-pressed={on}>
                        {on && <Check size={13} strokeWidth={3} aria-hidden="true" />}{o}
                      </button>
                    );
                  })}
                </div>
                <label htmlFor={`note-${q.id}`} className="sr-only">Your own detail</label>
                <input
                  id={`note-${q.id}`}
                  style={{ marginTop: 10 }}
                  placeholder="Add a detail (optional): a course, an employer, a reason…"
                  value={cur.note || ''}
                  onChange={(e) => setNote(q.id, e.target.value)}
                />
              </div>
            );
          })}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button type="button" onClick={generate} disabled={busy}>
              {busy ? <span className="spinner" /> : <Sparkles size={16} aria-hidden="true" />}
              {busy ? 'Writing…' : text ? 'Write a new draft' : `Generate the ${letter.title}`}
            </button>
          </div>
        </section>

        <section className="card draft" aria-labelledby="d-h">
          <div className="card-head">
            <div>
              <h2 id="d-h">Draft</h2>
              <p className="muted small">Replace anything in [square brackets] with real details.</p>
            </div>
            {text && (
              <button type="button" className="btn-navy" onClick={saveEdited} disabled={saving || busy}>
                {saving ? <span className="spinner" /> : <Save size={16} aria-hidden="true" />} Save &amp; update PDF
              </button>
            )}
          </div>
          {text || busy ? (
            <>
              <label htmlFor="draft" className="sr-only">Draft text</label>
              <textarea id="draft" value={text} onChange={(e) => setText(e.target.value)} readOnly={busy} />
              <p className="tiny faint" style={{ margin: '6px 0 0' }}>{text.trim().split(/\s+/).filter(Boolean).length} words</p>
            </>
          ) : (
            <div className="empty">
              <PenLine size={28} aria-hidden="true" />
              <h2>No draft yet</h2>
              <p className="small">Answer a few questions on the left and generate a draft. It appears here for editing.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { SOP_QUESTIONS } from '@/lib/sopQuestions';

export default function SopBuilderPanel({ app, patchLocal }) {
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
        setMsg({ type: 'ok', text: 'Study plan drafted below. Edit it in your own words, then save.' });
      } else {
        setMsg({ type: 'ok', text: 'Draft ready below — edit it, then press "Save & update PDF".' });
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
    <>
      <div className="card">
        <h2>Study Plan / SOP builder</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Answer up to 7 quick questions — tap the answers that fit and add notes in your own
          words. We combine them with your intake details to write a full Statement of Purpose.
          <br />
          <span className="chip" style={{ marginTop: 8 }}>{answered}/{SOP_QUESTIONS.length} answered</span>
        </p>

        <div style={{ marginTop: 12 }}>
          {SOP_QUESTIONS.map((q, i) => {
            const cur = answers[q.id] || { selected: [], note: '' };
            return (
              <div key={q.id} style={{ padding: '14px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{i + 1}. {q.question}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {q.options.map((o) => {
                    const on = cur.selected.includes(o);
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => toggle(q.id, o)}
                        className={on ? '' : 'btn-secondary'}
                        style={{ padding: '7px 12px', fontSize: 13 }}
                      >
                        {on ? '✓ ' : ''}{o}
                      </button>
                    );
                  })}
                </div>
                <input
                  style={{ marginTop: 10 }}
                  placeholder="Add your own detail (optional) — e.g. a specific course, employer, or reason"
                  value={cur.note || ''}
                  onChange={(e) => setNote(q.id, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : text ? 'Re-generate study plan' : 'Generate my study plan'}
          </button>
        </div>
        {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ marginTop: 14 }}>{msg.text}</div>}
      </div>

      {text && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 0 }}>Your study plan</h2>
            <div className="btn-row" style={{ gap: 6 }}>
              <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/sop`}>↓ PDF</a>
              <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/sop?format=docx`}>↓ Word</a>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>
            Edit freely so it sounds like you, then save to update the PDF. Replace anything in
            [square brackets] with your real details.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 380, marginTop: 8, fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button onClick={saveEdited} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save & update PDF'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

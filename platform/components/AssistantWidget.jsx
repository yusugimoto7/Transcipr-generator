'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, Mic, Square, Check, AlertTriangle } from 'lucide-react';

const GREETING = {
  role: 'assistant',
  content:
    "Hi! Ask me anything about Canadian visas and permits: which documents are needed, how to answer a question, how to strengthen a file, or how to use this platform.",
};

const SUGGESTIONS = [
  'What documents are needed for this application?',
  'How much proof of funds is enough?',
  'How do I write a strong Purpose of Travel?',
];

// What each action is called on the page.
const ACTION_LABEL = {
  update_intake: 'Intake updated',
  remove_pages: 'Pages taken out, file rebuilding',
  restore_pages: 'Pages put back, files rebuilding',
  move_document: 'Document moved',
  change_final_set: 'Final set changed',
  redraft_letter: 'Letter drafted again',
  rebuild_final_files: 'Final files rebuilding',
  set_file_note: 'Note saved on the file',
  mark_document_checked: 'Marked as already checked',
  set_document_type: 'Document type changed',
  add_team_note: 'Team note added',
};

export default function AssistantWidget({ appId, initialHistory = [] }) {
  const [open, setOpen] = useState(false);
  const restored = initialHistory
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: m.content }));
  const [messages, setMessages] = useState(restored.length ? [GREETING, ...restored] : [GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [hearing, setHearing] = useState(false); // turning speech into text
  const [voiceErr, setVoiceErr] = useState('');
  const recRef = useRef(null);

  /** Voice: record, then the server turns it into text (Persian or English) in the box. */
  async function toggleVoice() {
    setVoiceErr('');
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return browserSpeech();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceErr('Allow the microphone for this site to speak to the assistant.');
      return;
    }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' });
      if (!blob.size) return;
      setHearing(true);
      try {
        const fd = new FormData();
        fd.append('audio', blob, 'speech');
        const res = await fetch('/api/assistant/transcribe', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.text) setInput((v) => (v ? `${v} ${data.text}` : data.text));
        else if (res.status === 503) browserSpeech();
        else setVoiceErr(data.error || 'Could not understand the recording.');
      } catch {
        setVoiceErr('Network error — try again.');
      } finally {
        setHearing(false);
      }
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
  }

  /** The browser's own speech recognition, when recording is not possible. */
  function browserSpeech() {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setVoiceErr('Voice input is not available in this browser.');
      return;
    }
    const r = new SR();
    r.lang = /fa/i.test(navigator.language) ? 'fa-IR' : navigator.language || 'en-US';
    r.interimResults = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      if (text) setInput((v) => (v ? `${v} ${text}` : text));
    };
    r.onerror = () => setVoiceErr('Could not hear that — try again.');
    r.onend = () => setRecording(false);
    recRef.current = r;
    r.start();
    setRecording(true);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING), appId }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: res.ok ? data.reply : `Sorry — ${data.error || 'something went wrong.'}`,
          actions: res.ok ? data.actions || [] : [],
        },
      ]);
      // The assistant changed the file: the page shows it at once.
      if (res.ok && data.actions?.some((a) => a.ok)) window.dispatchEvent(new CustomEvent('assistant-acted'));
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Network error — please try again.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="assist-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        title="Need help? Ask the assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open && (
        <div className="assist-panel" role="dialog" aria-label="Assistant">
          <div className="assist-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bot size={20} aria-hidden="true" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Assistant</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Visa &amp; permit help</div>
              </div>
            </div>
            <button className="assist-x" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
          </div>

          <div className="assist-body" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assist-msg ${m.role}`} dir="auto">
                {m.content}
                {m.actions?.length > 0 && (
                  <ul className="assist-actions">
                    {m.actions.map((a, k) => (
                      <li key={k} className={a.ok ? 'ok' : 'bad'} title={a.error || ''}>
                        {a.ok ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />} {a.ok ? ACTION_LABEL[a.name] || a.name : `Not done: ${a.error}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <div className="assist-msg assistant"><span className="spinner dark" /></div>}
            {messages.length <= 1 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="assist-chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}
          </div>

          <form
            className="assist-input"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? 'Listening… press ■ when done' : hearing ? 'Turning your voice into text…' : appId ? 'Ask, or tell me what to change…' : 'Type your question…'}
              disabled={busy || hearing}
              dir="auto"
            />
            <button type="button" className={`assist-mic${recording ? ' on' : ''}`} onClick={toggleVoice} disabled={busy || hearing} aria-label={recording ? 'Stop recording' : 'Speak'} title={recording ? 'Stop recording' : 'Speak (Persian or English)'}>
              {hearing ? <span className="spinner" /> : recording ? <Square size={15} /> : <Mic size={16} />}
            </button>
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
          </form>
          {voiceErr && <div className="assist-foot" style={{ color: 'var(--danger)' }}>{voiceErr}</div>}
          <div className="assist-foot">General information, not legal advice.</div>
        </div>
      )}
    </>
  );
}

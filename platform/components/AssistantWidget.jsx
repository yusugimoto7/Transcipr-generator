'use client';

import { useState, useRef, useEffect } from 'react';

const GREETING = {
  role: 'assistant',
  content:
    "Hi! I'm your study permit assistant. Ask me anything — what documents you need, how to answer a question, how to strengthen your file, or how to use this platform.",
};

const SUGGESTIONS = [
  'What documents do I need?',
  'How much proof of funds is required?',
  'How do I write a strong study plan?',
];

export default function AssistantWidget({ appId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

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
        },
      ]);
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
        aria-label="Open assistant"
        title="Need help? Ask the assistant"
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="assist-panel" role="dialog" aria-label="Study permit assistant">
          <div className="assist-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🍁</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Assistant</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>Study permit help</div>
              </div>
            </div>
            <button className="assist-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          <div className="assist-body" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`assist-msg ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="assist-msg assistant"><span className="spinner" style={{ borderTopColor: '#666', borderColor: '#ccc', borderTopWidth: 2 }} /></div>}
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
              placeholder="Type your question…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
          <div className="assist-foot">General information, not legal advice.</div>
        </div>
      )}
    </>
  );
}

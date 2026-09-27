'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot } from 'lucide-react';

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

export default function AssistantWidget({ appId, initialHistory = [] }) {
  const [open, setOpen] = useState(false);
  const restored = initialHistory
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: m.content }));
  const [messages, setMessages] = useState(restored.length ? [GREETING, ...restored] : [GREETING]);
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
              <div key={i} className={`assist-msg ${m.role}`}>
                {m.content}
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
              placeholder="Type your question…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
          </form>
          <div className="assist-foot">General information, not legal advice.</div>
        </div>
      )}
    </>
  );
}

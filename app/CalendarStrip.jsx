"use client";

// The topic page's link to the content calendar: everything made from this topic, and for each one
// either "Add to calendar" (a draft card in the market's board, caption and files filled in) or where
// it already sits on the calendar. Posting still goes through Hamed's approval in the calendar.

import { useEffect, useState } from "react";

const KINDS = [
  ["carousel", "🖼️", "Carousel"],
  ["story", "📱", "Story"],
  ["video", "🎬", "English video"],
  ["article", "📝", "Blog article"],
  ["script", "🎙️", "Script to record"],
];
const STATUS = {
  draft: ["Draft", "#8b95a3"], pending: ["Waiting for approval", "#f28c28"], approved: ["Approved", "#2f6fde"],
  scheduled: ["Scheduled", "#2f6fde"], publishing: ["Publishing", "#7a5af8"], published: ["Published", "#12a150"], failed: ["Failed", "#e5484d"],
};

function when(iso) {
  if (!iso) return "no date yet";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CalendarStrip({ topic, version, C, FONT }) {
  const key = String((topic && (topic.title_fa || topic.title_en)) || "").trim().toLowerCase();
  const [state, setState] = useState({ phase: "loading" });
  const [board, setBoard] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`/api/calendar/topic?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) return setState({ phase: "signin" });
      if (res.status === 503) return setState({ phase: "off" });
      if (res.status === 404) return setState({ phase: "ready", made: {}, cards: [], boards: [] });
      if (!res.ok) throw new Error(d.error || `error ${res.status}`);
      setState({ phase: "ready", ...d });
      setBoard((b) => b || d.suggested_board || "");
    } catch (e) {
      setState({ phase: "error", msg: String(e.message || e) });
    }
  };
  useEffect(() => {
    if (key) load();
  }, [key, version]);

  if (!key || state.phase === "off" || state.phase === "loading") return null;

  const add = async (made, again = false) => {
    setBusy(made);
    setErr("");
    try {
      const res = await fetch("/api/calendar/topic", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, made, board_id: board, again }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `error ${res.status}`);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy("");
    }
  };

  const box = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, fontFamily: FONT, direction: "ltr", marginTop: 4 };
  const btn = (tone, solid) => ({
    font: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 12px", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${solid ? tone : C.line}`, background: solid ? tone : C.surface, color: solid ? "#fff" : C.text, textDecoration: "none",
  });

  const head = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>📅 Content calendar</div>
      <a href="/calendar" style={{ fontSize: 12.5, color: C.text2, textDecoration: "none" }}>Open the calendar ↗</a>
    </div>
  );

  if (state.phase === "signin")
    return (
      <div style={box}>
        {head}
        <div style={{ fontSize: 13, color: C.text2 }}>
          Sign in to put what you made here on the calendar. <a href="/editing/login?next=/" style={{ color: C.orange, fontWeight: 700 }}>Sign in</a>
        </div>
      </div>
    );
  if (state.phase === "error")
    return (
      <div style={box}>
        {head}
        <div style={{ fontSize: 12.5, color: C.reject }}>{state.msg}</div>
      </div>
    );

  const made = state.made || {};
  const rows = KINDS.filter(([k]) => made[k]);
  return (
    <div style={box}>
      {head}
      {rows.length === 0 && <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>Make a carousel, story, article or video above; each one can then go on the calendar as a post.</div>}
      {rows.length > 0 && state.boards.length > 1 && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text2, marginBottom: 10 }}>
          Board
          <select value={board} onChange={(e) => setBoard(e.target.value)} style={{ font: "inherit", fontSize: 13, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.text }}>
            {state.boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(([k, icon, name]) => {
          const m = made[k];
          const there = (state.cards || []).filter((c) => c.made === k);
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.line}`, background: there.length ? "rgba(18,161,80,0.05)" : "transparent", flexWrap: "wrap" }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>
                  {name}
                  {m.count ? <span style={{ color: C.text3, fontWeight: 500 }}> · {m.count}</span> : null}
                </div>
                {there.map((c) => {
                  const [label, tone] = STATUS[c.status] || STATUS.draft;
                  return (
                    <div key={c.id} style={{ fontSize: 12, color: C.text2, marginTop: 3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: tone, display: "inline-block" }} />
                      <b style={{ color: tone }}>{label}</b> · {c.board} · {when(c.publish_at)}
                    </div>
                  );
                })}
                {!m.ok && <div style={{ fontSize: 12, color: C.text3, marginTop: 3 }}>{m.why}</div>}
              </div>
              {there.length ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={`/calendar?board=${there[0].board_id}&card=${there[0].id}`} style={btn(C.orange, true)}>Open post</a>
                  <button onClick={() => window.confirm("Add another copy of this to the calendar?") && add(k, true)} disabled={!!busy} style={btn(C.text, false)} title="Add another post">+</button>
                </div>
              ) : (
                <button onClick={() => add(k)} disabled={!m.ok || !!busy} style={{ ...btn(C.orange, true), opacity: !m.ok || busy ? 0.5 : 1 }}>
                  {busy === k ? "Adding…" : "📅 Add to calendar"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {err && <div style={{ marginTop: 8, fontSize: 12.5, color: C.reject }}>{err}</div>}
      {rows.length > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: C.text3 }}>Each one is added as a draft post. Set the time and networks there; it is posted after Hamed approves it.</div>}
    </div>
  );
}

"use client";

// Under a carousel or a story: put it on the content calendar instead of sending it to Telegram.
// "Schedule" picks a time, "Post right away" means now. Both make the same card the calendar strip
// makes (lib/calendar/fromTopic.js); what happens next is the calendar's rule, never weakened here:
// Hamed (admin) approves that exact content in the same click, after a confirm; anyone else's card
// goes to him as "Waiting for approval" with the time they asked for.

import { useEffect, useState } from "react";

const STATUS = {
  draft: ["Draft", "#8b95a3"], pending: ["Waiting for Hamed's approval", "#f28c28"], approved: ["Approved", "#2f6fde"],
  scheduled: ["Scheduled", "#2f6fde"], publishing: ["Publishing…", "#7a5af8"], published: ["Published", "#12a150"], failed: ["Failed", "#e5484d"],
};

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// A datetime-local value an hour from now, in the device's time.
function inAnHour() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function call(url, body) {
  const res = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(d.error || `error ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return d;
}

const NAMES = { carousel: "carousel", story: "story" };

export default function CalendarButtons({ topic, made, version = "", C, FONT }) {
  const key = String((topic && (topic.title_fa || topic.title_en)) || "").trim().toLowerCase();
  const [state, setState] = useState({ phase: "loading" });
  const [admin, setAdmin] = useState(false);
  const [board, setBoard] = useState("");
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState(inAnHour);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ ok: "", err: "" });

  const load = async () => {
    try {
      const d = await call(`/api/calendar/topic?key=${encodeURIComponent(key)}`);
      setState({ phase: "ready", ...d });
      setBoard((b) => b || d.suggested_board || "");
    } catch (e) {
      if (e.status === 401) return setState({ phase: "signin" });
      if (e.status === 503) return setState({ phase: "off" });
      if (e.status === 404) return setState({ phase: "ready", made: {}, cards: [], boards: [] });
      setState({ phase: "error", msg: String(e.message || e) });
    }
  };
  useEffect(() => {
    if (key) load();
  }, [key, version]);
  useEffect(() => {
    call("/api/editing/me").then((d) => setAdmin(!!(d.user && d.user.role === "admin"))).catch(() => {});
  }, []);

  if (!key || state.phase === "loading" || state.phase === "off") return null;

  const box = { marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${C.line}`, background: C.surface, fontFamily: FONT, direction: "ltr" };
  const btn = (tone, solid) => ({
    font: "inherit", fontSize: 13.5, fontWeight: 700, padding: "11px 12px", borderRadius: 12, cursor: "pointer", flex: 1, minWidth: 140,
    border: `1px solid ${solid ? tone : C.line}`, background: solid ? tone : C.surface, color: solid ? "#fff" : C.text, textAlign: "center", textDecoration: "none",
  });

  if (state.phase === "signin")
    return (
      <div style={box}>
        <div style={{ fontSize: 13, color: C.text2 }}>
          📅 Sign in to schedule this {NAMES[made]} on the content calendar. <a href="/editing/login?next=/" style={{ color: C.orange, fontWeight: 700 }}>Sign in</a>
        </div>
      </div>
    );
  if (state.phase === "error")
    return (
      <div style={box}>
        <div style={{ fontSize: 12.5, color: C.reject }}>📅 Calendar: {state.msg}</div>
      </div>
    );

  const can = (state.made || {})[made];
  const there = (state.cards || []).filter((c) => c.made === made);

  // Make the card, then approve it (Hamed) or send it to him (everyone else).
  const put = async (publishAt) => {
    const now = !publishAt;
    const iso = now ? new Date().toISOString() : new Date(publishAt).toISOString();
    if (!now && new Date(iso).getTime() < Date.now() - 60000) return setMsg({ ok: "", err: "Pick a time in the future." });
    if (admin && !window.confirm(now ? `Approve this ${NAMES[made]} and post it to Instagram now?` : `Approve this ${NAMES[made]} for Instagram on ${when(iso)}?`)) return;
    setBusy(now ? "now" : "schedule");
    setMsg({ ok: "", err: "" });
    let card = null;
    try {
      card = (await call("/api/calendar/topic", { key, made, board_id: board, publish_at: iso, again: there.length > 0 })).card;
      const action = (body) => call(`/api/calendar/boards/${card.board_id}/cards/${card.id}/action`, body);
      if (admin) {
        await action({ action: "approve" });
        if (now) await action({ action: "publish_now" });
        setMsg({ ok: now ? "Approved — posting to Instagram now. The calendar shows the result." : `Approved and scheduled for ${when(iso)}.`, err: "" });
      } else {
        await action({ action: "request_review", note: now ? "Please post this right away." : `Please post this on ${when(iso)}.` });
        setMsg({ ok: now ? "Sent to Hamed for approval; it goes out as soon as he approves." : `Sent to Hamed for approval, for ${when(iso)}.`, err: "" });
      }
      setPicking(false);
    } catch (e) {
      setMsg({ ok: "", err: (card ? "The post is on the calendar, but: " : "") + String(e.message || e) });
    } finally {
      setBusy("");
      load();
    }
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5, color: C.ink }}>📅 Content calendar</b>
        {state.boards && state.boards.length > 1 && (
          <select value={board} onChange={(e) => setBoard(e.target.value)} style={{ font: "inherit", fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, color: C.text }}>
            {state.boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {there.map((c) => {
        const [label, tone] = STATUS[c.status] || STATUS.draft;
        return (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text2, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: tone, display: "inline-block" }} />
            <b style={{ color: tone }}>{label}</b>
            <span>· {c.board}{c.publish_at ? " · " + when(c.publish_at) : ""}</span>
            <a href={`/calendar?board=${c.board_id}&card=${c.id}`} style={{ marginLeft: "auto", color: C.orange, fontWeight: 700, textDecoration: "none" }}>Open post ↗</a>
          </div>
        );
      })}

      {can && !can.ok ? (
        <div style={{ fontSize: 12.5, color: C.text3 }}>{can.why}</div>
      ) : (
        <>
          {picking && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ font: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.text, flex: 1, minWidth: 190 }} />
              <button className="ui-btn" disabled={!!busy || !at} onClick={() => put(at)} style={{ ...btn(C.teal, true), flex: "0 0 auto", minWidth: 0, opacity: busy ? 0.6 : 1 }}>
                {busy === "schedule" ? "Saving…" : admin ? "Approve & schedule" : "Send for approval"}
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ui-btn" disabled={!!busy} onClick={() => setPicking((v) => !v)} style={{ ...btn(C.teal, false), opacity: busy ? 0.6 : 1 }}>
              🗓 Schedule
            </button>
            <button className="ui-btn" disabled={!!busy} onClick={() => put(null)} style={{ ...btn(C.orange, true), opacity: busy ? 0.6 : 1 }}>
              {busy === "now" ? "Posting…" : "🚀 Post right away"}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: C.text3 }}>
            {admin ? "Goes to Instagram through the calendar once you approve." : "Goes to Hamed for approval first; it is posted only after he approves."}
            {there.length > 0 ? " This adds another post." : ""}
          </div>
        </>
      )}
      {msg.ok && <div style={{ marginTop: 8, fontSize: 12.5, color: C.success }}>✓ {msg.ok}</div>}
      {msg.err && <div style={{ marginTop: 8, fontSize: 12.5, color: C.reject }}>⚠️ {msg.err}</div>}
    </div>
  );
}

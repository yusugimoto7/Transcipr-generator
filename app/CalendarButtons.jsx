"use client";

// Under a carousel or a story: put it on the content calendar instead of sending it to Telegram.
// "Schedule" picks a time, "Post right away" means now. Both make the same card the calendar strip
// makes (lib/calendar/fromTopic.js); what happens next is the calendar's rule, never weakened here:
// Hamed (admin) approves that exact content in the same click, after a confirm; anyone else's card
// goes to him as "Waiting for approval" with the time they asked for.

import { useEffect, useState } from "react";
import { whenAll, pickerNote } from "../lib/tz";
import PostFiles from "./calendar/PostFiles";
import { L, uiDir } from "../lib/i18n";

// Labels are [fa, en] pairs, read with L() when drawn.
const STATUS = {
  draft: [["پیش‌نویس", "Draft"], "#8b95a3"], pending: [["در انتظار تأیید حامد", "Waiting for Hamed's approval"], "#f28c28"], approved: [["تأییدشده", "Approved"], "#2f6fde"],
  scheduled: [["زمان‌بندی‌شده", "Scheduled"], "#2f6fde"], publishing: [["در حال انتشار…", "Publishing…"], "#7a5af8"], published: [["منتشرشده", "Published"], "#12a150"], failed: [["ناموفق", "Failed"], "#e5484d"],
};

// The team is in Vancouver and Tehran: every time is shown in the viewer's zone and the other place's.
const when = whenAll;

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
    const e = new Error(d.error || L(`خطا ${res.status}`, `error ${res.status}`));
    e.status = res.status;
    throw e;
  }
  return d;
}

const NAMES = { carousel: ["کاروسل", "carousel"], story: ["استوری", "story"], carousel_en: ["کاروسل انگلیسی", "English carousel"], story_en: ["استوری انگلیسی", "English story"] };
const nameOf = (made) => L(NAMES[made] || [made, made]);

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

  const box = { marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${C.line}`, background: C.surface, fontFamily: FONT, direction: uiDir() };
  const btn = (tone, solid) => ({
    font: "inherit", fontSize: 13.5, fontWeight: 700, padding: "11px 12px", borderRadius: 12, cursor: "pointer", flex: 1, minWidth: 140,
    border: `1px solid ${solid ? tone : C.line}`, background: solid ? tone : C.surface, color: solid ? "#fff" : C.text, textAlign: "center", textDecoration: "none",
  });

  if (state.phase === "signin")
    return (
      <div style={box}>
        <div style={{ fontSize: 13, color: C.text2 }}>
          📅 {L(`برای زمان‌بندی این ${nameOf(made)} در تقویم محتوا وارد شو.`, `Sign in to schedule this ${nameOf(made)} on the content calendar.`)} <a href="/editing/login?next=/" style={{ color: C.orange, fontWeight: 700 }}>{L("ورود", "Sign in")}</a>
        </div>
      </div>
    );
  if (state.phase === "error")
    return (
      <div style={box}>
        <div style={{ fontSize: 12.5, color: C.reject }}>📅 {L("تقویم", "Calendar")}: {state.msg}</div>
      </div>
    );

  const can = (state.made || {})[made];
  const there = (state.cards || []).filter((c) => c.made === made);

  // Make the card, then approve it (Hamed) or send it to him (everyone else).
  const put = async (publishAt) => {
    const now = !publishAt;
    const iso = now ? new Date().toISOString() : new Date(publishAt).toISOString();
    if (!now && new Date(iso).getTime() < Date.now() - 60000) return setMsg({ ok: "", err: L("یه زمان در آینده انتخاب کن.", "Pick a time in the future.") });
    const off = state.platform_posting === false;
    if (admin && !off && !window.confirm(now ? L(`این ${nameOf(made)} تأیید بشه و همین الان در Instagram پست بشه؟`, `Approve this ${nameOf(made)} and post it to Instagram now?`) : L(`این ${nameOf(made)} برای Instagram در ${when(iso)} تأیید بشه؟`, `Approve this ${nameOf(made)} for Instagram on ${when(iso)}?`))) return;
    setBusy(now ? "now" : "schedule");
    setMsg({ ok: "", err: "" });
    let card = null;
    try {
      card = (await call("/api/calendar/topic", { key, made, board_id: board, publish_at: iso, again: there.length > 0 })).card;
      const action = (body) => call(`/api/calendar/boards/${card.board_id}/cards/${card.id}/action`, body);
      if (admin) {
        await action({ action: "approve" });
        if (now) await action({ action: "publish_now" });
        setMsg({ ok: off ? L("در تقویم تأیید شد. انتشار در شبکه‌ها خاموشه، پس از همین‌جا دانلودش کن یا در Google Drive ذخیره‌اش کن.", "Approved on the calendar. Posting to the networks is off, so download it or save it to Google Drive from here.") : now ? L("تأیید شد و الان در Instagram پست می‌شه. نتیجه رو تقویم نشون می‌ده.", "Approved — posting to Instagram now. The calendar shows the result.") : L(`تأیید و برای ${when(iso)} زمان‌بندی شد.`, `Approved and scheduled for ${when(iso)}.`), err: "" });
      } else {
        await action({ action: "request_review", note: now ? "Please post this right away." : `Please post this on ${when(iso)}.` });
        setMsg({ ok: now ? L("برای تأیید به حامد فرستاده شد؛ به‌محض تأیید منتشر می‌شه.", "Sent to Hamed for approval; it goes out as soon as he approves.") : L(`برای تأیید به حامد فرستاده شد، برای ${when(iso)}.`, `Sent to Hamed for approval, for ${when(iso)}.`), err: "" });
      }
      setPicking(false);
    } catch (e) {
      setMsg({ ok: "", err: (card ? L("پست در تقویم هست، ولی: ", "The post is on the calendar, but: ") : "") + String(e.message || e) });
    } finally {
      setBusy("");
      load();
    }
  };

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5, color: C.ink }}>📅 {L("تقویم محتوا", "Content calendar")}</b>
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
          <div key={c.id} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text2, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: tone, display: "inline-block" }} />
            <b style={{ color: tone }}>{L(label)}</b>
            <span>· {c.board}{c.publish_at ? " · " + when(c.publish_at) : ""}</span>
            <a href={`/calendar?board=${c.board_id}&card=${c.id}`} style={{ marginInlineStart: "auto", color: C.orange, fontWeight: 700, textDecoration: "none" }}>{L("باز کردن پست", "Open post")} ↗</a>
          </div>
          <PostFiles boardId={c.board_id} cardId={c.id} />
          </div>
        );
      })}

      {can && !can.ok ? (
        <div style={{ fontSize: 12.5, color: C.text3 }}>{can.why}</div>
      ) : (
        <>
          {picking && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ font: "inherit", fontSize: 13.5, padding: "8px 10px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface, color: C.text, flex: 1, minWidth: 190 }} />
              <button className="ui-btn" disabled={!!busy || !at} onClick={() => put(at)} style={{ ...btn(C.teal, true), flex: "0 0 auto", minWidth: 0, opacity: busy ? 0.6 : 1 }}>
                {busy === "schedule" ? L("در حال ذخیره…", "Saving…") : admin ? L("تأیید و زمان‌بندی", "Approve & schedule") : L("ارسال برای تأیید", "Send for approval")}
              </button>
            </div>
          )}
          {picking && <div style={{ fontSize: 12, color: C.text2, marginBottom: 8, lineHeight: 1.5 }}>🕑 {pickerNote(at)}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ui-btn" disabled={!!busy} onClick={() => setPicking((v) => !v)} style={{ ...btn(C.teal, false), opacity: busy ? 0.6 : 1 }}>
              🗓 {L("زمان‌بندی", "Schedule")}
            </button>
            {state.platform_posting !== false && (
              <button className="ui-btn" disabled={!!busy} onClick={() => put(null)} style={{ ...btn(C.orange, true), opacity: busy ? 0.6 : 1 }}>
                {busy === "now" ? L("در حال انتشار…", "Posting…") : "🚀 " + L("همین الان پست کن", "Post right away")}
              </button>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: C.text3 }}>
            {state.platform_posting === false
              ? L("فعلاً انتشار در شبکه‌ها خاموشه. به تقویم اضافه‌اش کن، بعد دانلودش کن یا در Google Drive ذخیره‌اش کن.", "Posting to the networks is switched off for now. Add it to the calendar, then download it or save it to Google Drive.")
              : admin ? L("بعد از تأیید تو، از طریق تقویم به Instagram می‌ره.", "Goes to Instagram through the calendar once you approve.") : L("اول برای تأیید پیش حامد می‌ره و فقط بعد از تأیید او منتشر می‌شه.", "Goes to Hamed for approval first; it is posted only after he approves.")}
            {there.length > 0 ? " " + L("این یه پست دیگه اضافه می‌کنه.", "This adds another post.") : ""}
          </div>
        </>
      )}
      {msg.ok && <div style={{ marginTop: 8, fontSize: 12.5, color: C.success }}>✓ {msg.ok}</div>}
      {msg.err && <div style={{ marginTop: 8, fontSize: 12.5, color: C.reject }}>⚠️ {msg.err}</div>}
    </div>
  );
}

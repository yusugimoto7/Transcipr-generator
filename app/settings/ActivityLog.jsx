"use client";

// The team's activity, for the admin (Hamed, Nov 10 2026: "any activities Yegane or Farhad did, with
// date and time, Vancouver time"). One Vancouver day at a time, newest first, filtered by person;
// the same action repeated within a few minutes (autosaves) is one line with "×n". lib/activity.js.
import { useCallback, useEffect, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { s } from "../editing/ui";
import { L, getLang, uiDir } from "../../lib/i18n";

const ZONE = "America/Vancouver";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const shift = (day, n) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const clock = (at) =>
  new Date(at).toLocaleTimeString(getLang() === "fa" ? "fa-IR" : "en-CA", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const zoneAbbr = (at) =>
  (new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "short" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName") || {}).value || "PT";
const dayName = (day) =>
  new Date(day + "T12:00:00Z").toLocaleDateString(getLang() === "fa" ? "fa-IR" : "en-CA", { timeZone: "UTC", weekday: "long", year: "numeric", month: "long", day: "numeric" });

export default function ActivityLog() {
  const [day, setDay] = useState(today());
  const [who, setWho] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/activity?day=" + d, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || res.status);
      setData(j);
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  }, []);
  useEffect(() => {
    load(day);
  }, [day, load]);

  const items = ((data && data.items) || []).filter((e) => !who || e.uid === who);
  const people = (data && data.people) || [];
  const counts = new Map();
  for (const e of (data && data.items) || []) counts.set(e.uid, (counts.get(e.uid) || 0) + 1);

  return (
    <section className={s.card} dir={uiDir()}>
      <h2 className={s.h2}>
        <Activity size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {L("فعالیت‌های تیم", "Team activity")}
      </h2>
      <p className={s.muted} style={{ margin: 0 }}>
        {L("هر کاری که هر کس در برنامه کرده، با ساعت ونکوور. فقط خودت این را می‌بینی.", "What everyone did in the app, in Vancouver time. Only you see this.")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <button className={s.btn} onClick={() => setDay(shift(day, -1))} aria-label={L("روز قبل", "Previous day")}>
          <ChevronLeft size={16} aria-hidden style={{ transform: uiDir() === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <input className={s.input} type="date" value={day} max={today()} onChange={(e) => e.target.value && setDay(e.target.value)} data-no-voice style={{ flex: "0 1 170px" }} />
        <button className={s.btn} onClick={() => setDay(shift(day, 1))} disabled={day >= today()} aria-label={L("روز بعد", "Next day")}>
          <ChevronRight size={16} aria-hidden style={{ transform: uiDir() === "rtl" ? "scaleX(-1)" : "none" }} />
        </button>
        <button className={s.btn} onClick={() => load(day)} disabled={busy} aria-label={L("تازه کردن", "Refresh")}>
          <RefreshCw size={15} aria-hidden />
        </button>
      </div>
      <div className={s.muted} style={{ fontSize: 13 }}>{dayName(day)}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label={L("کی", "Who")}>
        {[{ id: "", name: L("همه", "Everyone") }, ...people].map((p) => (
          <button
            key={p.id || "all"}
            role="radio"
            aria-checked={who === p.id}
            onClick={() => setWho(p.id)}
            className={s.pill}
            style={{ border: "1px solid var(--line)", cursor: "pointer", background: who === p.id ? "var(--brand, #32515d)" : "transparent", color: who === p.id ? "#fff" : "var(--text)" }}
          >
            {p.name}
            {p.id && counts.get(p.id) ? ` · ${counts.get(p.id)}` : ""}
          </button>
        ))}
      </div>
      {error && <div className={s.error}>{error}</div>}
      {!error && data && !items.length && <div className={s.muted}>{L("این روز چیزی ثبت نشده.", "Nothing recorded on this day.")}</div>}
      {busy && !data && <div className={s.muted}>{L("در حال خواندن…", "Loading…")}</div>}
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {items.map((e) => (
          <li key={e.uid + e.at} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px", padding: "9px 0", borderTop: "1px solid var(--line)" }}>
            <time dateTime={new Date(e.at).toISOString()} style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
              {clock(e.at)} <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.6 }}>{zoneAbbr(e.at)}</span>
            </time>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              <b>{e.who}</b> {e.what ? L(e.what[0], e.what[1]) : <code style={{ fontSize: 12 }}>{e.path}</code>}
              {e.n > 1 && (
                <span className={s.muted} style={{ fontSize: 12 }}>
                  {" "}
                  {L(`(${e.n} بار، تا ${clock(e.until)})`, `(${e.n} times, until ${clock(e.until)})`)}
                </span>
              )}
              {e.about && (
                <div dir="auto" className={s.muted} style={{ fontSize: 13 }}>
                  {e.about}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

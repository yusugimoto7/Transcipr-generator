"use client";

// The bell in the top bar (Hamed, Nov 4 2026): every notification the app sent this person stays
// here, newest first, with a dot while unread; a tap opens what it was about. The list is read
// again every minute and whenever the page comes back to the front (a phone freezes the page
// when the app is switched).
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { L, getLang } from "../lib/i18n";

const ago = (at) => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (m < 1) return L("الان", "now");
  if (m < 60) return L(`${m} دقیقه پیش`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 24) return L(`${h} ساعت پیش`, `${h} h ago`);
  return new Date(at).toLocaleDateString(getLang() === "fa" ? "fa-IR" : "en-CA", { month: "short", day: "numeric" });
};

export default function NotificationBell({ btnClass, menuClass, itemClass, onOpen }) {
  const [data, setData] = useState({ items: [], seen: 0, unread: 0 });
  const [open, setOpen] = useState(false);
  const [mark, setMark] = useState(0); // what counted as unread when the list was opened

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch (_) {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !e.target.closest("[data-bell]") && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = async () => {
    if (open) return setOpen(false);
    setMark(data.seen || 0);
    setOpen(true);
    onOpen && onOpen();
    await load();
    if (data.unread) {
      fetch("/api/inbox", { method: "POST" }).catch(() => {});
      setData((d) => ({ ...d, unread: 0 }));
    }
  };

  const pick = (v) => (Array.isArray(v) ? L(v) : v || "");

  return (
    <>
      <button className={btnClass} data-bell onClick={toggle} aria-label={L("اعلان‌ها", "Notifications")} aria-expanded={open} style={{ position: "relative" }}>
        <Bell size={18} aria-hidden />
        {data.unread > 0 && (
          <span aria-hidden style={{ position: "absolute", top: 0, insetInlineEnd: 0, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99, background: "#e8702a", color: "#fff", boxShadow: "0 0 0 2px var(--brand-deep, #243b44)", fontSize: 10.5, lineHeight: 1, fontWeight: 700, display: "grid", placeItems: "center", boxSizing: "border-box" }}>
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className={menuClass} data-bell role="menu" style={{ width: "min(360px, 92vw)", maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ padding: "8px 10px 10px", fontWeight: 700, fontSize: 14, borderBottom: "1px solid var(--line)", marginBottom: 4 }}>{L("اعلان‌ها", "Notifications")}</div>
          {!data.items.length && <div style={{ padding: "18px 10px", fontSize: 13.5, opacity: 0.65 }}>{L("هنوز اعلانی نیامده. وقتی کاری آماده شود اینجا می‌بینی.", "Nothing yet. What the app tells you appears here.")}</div>}
          {data.items.map((n) => {
            const fresh = n.at > mark;
            return (
              <a key={n.id} href={n.url || "/"} className={itemClass} role="menuitem" style={{ alignItems: "flex-start", flexDirection: "column", gap: 2, background: fresh ? "rgba(232,112,42,0.08)" : undefined }}>
                <span style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.45 }}>{pick(n.title)}</span>
                {n.body ? <span style={{ fontSize: 12.5, opacity: 0.75, lineHeight: 1.45, whiteSpace: "pre-line" }}>{String(pick(n.body)).slice(0, 160)}</span> : null}
                <span style={{ fontSize: 11.5, opacity: 0.55 }}>{ago(n.at)}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

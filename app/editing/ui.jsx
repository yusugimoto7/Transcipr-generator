"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import s from "./editing.module.css";
import { CalendarDays, Check, Clapperboard, KeyRound, Languages, LogOut, Newspaper, Users } from "lucide-react";
import { L, chooseLang, getLang } from "../../lib/i18n";
import PushSwitch from "../PushSwitch";

// The bar's classes, for pages outside this folder that add their own buttons to it.
export { s as barStyles };

export { s };

// Pairs, read with L() when drawn (lib/i18n.js); statusName() gives the label.
export const STATUS = {
  queued: ["در انتظار شروع", "Waiting to start"],
  preparing: ["در حال پیاده‌سازی متن", "Transcribing"],
  deciding: ["در حال انتخاب برداشت‌ها", "Choosing takes"],
  rendering: ["در حال برش", "Cutting"],
  verifying: ["در حال بررسی برش", "Checking the cut"],
  review: ["آمادهٔ بازبینی", "Ready for review"],
  delivering: ["در حال کپی در درایو", "Copying to Drive"],
  approved: ["تأییدشده", "Approved"],
  failed: ["ناموفق", "Failed"],
};
export function statusName(status) {
  return STATUS[status] ? L(STATUS[status]) : status;
}
export const ACTIVE = ["queued", "preparing", "deciding", "rendering", "verifying", "delivering"];

export function api(path, opts) {
  return apiAt("/api/editing", path, opts);
}

export async function apiAt(base, path, { method = "GET", body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.href = "/editing/login?next=" + encodeURIComponent(window.location.pathname);
  }
  if (!res.ok || data.error) {
    const e = new Error(data.error || L("مشکلی پیش آمد", "something went wrong") + " (" + res.status + ")");
    e.status = res.status;
    throw e;
  }
  return data;
}

export function useMe(skip = false) {
  const [state, setState] = useState({ loading: true, enabled: true, user: null });
  const load = useCallback(() => {
    if (skip) return;
    api("/me").then((d) => setState({ loading: false, enabled: d.enabled, user: d.user })).catch(() => setState({ loading: false, enabled: true, user: null }));
  }, []);
  useEffect(load, [load]);
  return state;
}

// English sentences that quote Farsi («…»): each quote is isolated so the island numbers and the
// English around it keep their order.
export function Mixed({ text }) {
  const parts = String(text || "").split(/(«[^»]*»)/);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("«") ? <bdi key={i}>{p}</bdi> : <span key={i}>{p}</span>))}
    </>
  );
}

export function Pill({ status, label }) {
  return <span className={`${s.pill} ${s["s_" + status] || ""}`}>{label || statusName(status)}</span>;
}

export function fmt(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return "";
  const t = Math.max(0, Number(sec));
  return `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
}

export function when(ts) {
  if (!ts) return "";
  // With the zone's name, so a time read in Vancouver and in Tehran is never confused.
  const d = new Date(ts);
  const abbr = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName");
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + (abbr ? " " + abbr.value : "");
}

// Each person keeps one colour, as on Trello, so cards show at a glance who is on them.
const AVATAR_COLORS = ["#c9372c", "#e2483d", "#f97316", "#d97706", "#16a34a", "#0d9488", "#0284c7", "#2563eb", "#7c3aed", "#c026d3", "#db2777", "#475569"];
export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function initialsOf(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
}
export function Avatar({ user, size = 28, title }) {
  const name = (user && user.name) || "?";
  return (
    <span className={s.avatar} title={title || name} style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: avatarColor((user && user.id) || name) }}>
      {initialsOf(name)}
    </span>
  );
}

const APPS = [
  ["topics", "/", ["تاپیک انجین", "Topic Engine"], Newspaper],
  ["calendar", "/calendar", ["تقویم محتوا", "Content calendar"], CalendarDays],
  ["editing", "/editing", ["تدوین ویدیو", "Video Editing"], Clapperboard],
];

// The two languages, each written in itself so anyone can find their own.
const LANG_CHOICES = [["fa", "فارسی"], ["en", "English"]];

// The bar itself, shared by every part of the app (the Topic Engine draws it too, with its own
// buttons in `actions`), so moving between parts never feels like changing apps.
export function AppBar({ me: given, actions = null }) {
  const own = useMe(!!given);
  const me = given || own;
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = (e) => !e.target.closest("[data-menu]") && setMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/editing/login";
  };
  // The account's language wins on a device that still has another one (or none) in its cookie.
  useEffect(() => {
    const want = me.user && me.user.lang;
    if (want && want !== getLang()) chooseLang(want);
  }, [me.user]);
  const ax = (me.user && me.user.ax) || [];
  const apps = APPS.filter(([k]) => ax.includes(k));
  const current = path === "/" ? "topics" : path.startsWith("/calendar") ? "calendar" : path.startsWith("/editing") && !path.startsWith("/editing/team") && !path.startsWith("/editing/password") ? "editing" : "";
  const appLink = ([k, href, label, Icon]) => {
    const cls = `${s.app} ${current === k ? s.appOn : ""}`;
    return href === "/" ? (
      <a key={k} href={href} className={cls}>
        <Icon size={16} aria-hidden /> {L(label)}
      </a>
    ) : (
      <Link key={k} href={href} className={cls}>
        <Icon size={16} aria-hidden /> {L(label)}
      </Link>
    );
  };
  return (
    <header className={s.bar}>
        <a href={ax.includes("topics") ? "/" : current ? APPS.find(([k]) => k === current)[1] : "/"} className={s.logo} aria-label="Sugimoto Visa">
          <img src="/brand/logo-on-dark.png" alt="Sugimoto Visa" className={s.logoImg} />
          <img src="/brand/mark.png" alt="" aria-hidden className={s.logoMark} />
        </a>
        {me.user && <nav className={s.apps}>{apps.map(appLink)}</nav>}
        <span className={s.spacer} />
        {actions && <div className={s.actions}>{actions}</div>}
        {!me.user && !me.loading && (
          <button className={s.barBtn} onClick={() => chooseLang(getLang() === "fa" ? "en" : "fa")} title={L("زبان", "Language")}>
            <Languages size={16} aria-hidden /> {getLang() === "fa" ? "English" : "فارسی"}
          </button>
        )}
        {me.user && (
          <div className={s.account} data-menu>
            {ax.includes("team") && (
              <Link href="/editing/team" className={`${s.barBtn} ${path === "/editing/team" ? s.appOn : ""}`} title={L("تیم: چه کسی به چه بخشی دسترسی دارد", "Team: who can open what")}>
                <Users size={16} aria-hidden /> <span className={s.wideOnly}>{L("تیم", "Team")}</span>
              </Link>
            )}
            <button className={s.me} onClick={() => setMenu((m) => !m)} aria-label={L("حساب و بخش‌ها", "Account and apps")} aria-expanded={menu}>
              <Avatar user={me.user} size={30} />
            </button>
            {menu && (
              <div className={s.menu} role="menu">
                <div className={s.menuHead}>
                  <Avatar user={me.user} size={36} />
                  <div style={{ minWidth: 0 }}>
                    <b>{me.user.name}</b>
                    <div className={s.muted} style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis" }}>{me.user.email}</div>
                  </div>
                </div>
                <div className={s.narrowOnly}>
                  {apps.map(([k, href, label, Icon]) => (
                    <a key={k} href={href} className={s.menuItem} role="menuitem">
                      <Icon size={16} aria-hidden /> {L(label)}
                    </a>
                  ))}
                  {ax.includes("team") && (
                    <a href="/editing/team" className={s.menuItem} role="menuitem">
                      <Users size={16} aria-hidden /> {L("تیم", "Team")}
                    </a>
                  )}
                </div>
                <div className={s.menuLabel}>
                  <Languages size={14} aria-hidden /> {L("زبان برنامه", "App language")}
                </div>
                {LANG_CHOICES.map(([k, name]) => (
                  <button key={k} className={s.menuItem} role="menuitemradio" aria-checked={getLang() === k} onClick={() => getLang() !== k && chooseLang(k)} lang={k}>
                    {getLang() === k ? <Check size={16} aria-hidden /> : <span style={{ width: 16, display: "inline-block" }} />} {name}
                  </button>
                ))}
                <div className={s.menuSep} />
                <PushSwitch itemClass={s.menuItem} labelClass={s.menuLabel} mutedClass={s.muted} />
                <div className={s.menuSep} />
                <Link href="/editing/password" className={s.menuItem} role="menuitem" onClick={() => setMenu(false)}>
                  <KeyRound size={16} aria-hidden /> {L("تغییر رمز عبور", "Change password")}
                </Link>
                <button className={`${s.menuItem} ${s.danger}`} onClick={logout} role="menuitem">
                  <LogOut size={16} aria-hidden /> {L("خروج", "Sign out")}
                </button>
              </div>
            )}
          </div>
        )}
    </header>
  );
}

// One bar for the whole app (one login): the parts this person may open, and their account.
export function Shell({ children, wide }) {
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me.loading && me.enabled && !me.user) router.replace("/editing/login?next=" + encodeURIComponent(path));
    if (me.user && me.user.must_change && path !== "/editing/password") router.replace("/editing/password");
  }, [me, path, router]);
  const ax = (me.user && me.user.ax) || [];
  const current = path.startsWith("/editing") && !path.startsWith("/editing/team") && !path.startsWith("/editing/password") ? "editing" : "";
  const sub = current === "editing" && ax.includes("editing")
    ? [["/editing", ["پروژه‌ها", "Projects"]], ["/editing/new", ["پروژهٔ جدید", "New project"]], ["/editing/topics", ["موضوع‌های ضبط", "Topics to record"]], ...(me.user.role === "admin" ? [["/editing/lessons", ["درس‌ها", "Lessons"]]] : [])]
    : [];
  return (
    <div className={s.shell}>
      <AppBar me={me} />
      {sub.length > 0 && me.user && (
        <nav className={s.subnav}>
          {sub.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? s.subOn : ""}>
              {L(label)}
            </Link>
          ))}
        </nav>
      )}
      <main className={s.page} style={wide ? { maxWidth: "none" } : undefined}>
        {!me.enabled ? (
          <div className={s.card}>
            <p className={s.muted}>{L("حساب‌ها هنوز روشن نشده‌اند. مدیر EDITING_SESSION_SECRET و EDITING_GITHUB_TOKEN را روی سرور تنظیم می‌کند.", "Accounts are not switched on yet. The admin sets EDITING_SESSION_SECRET and EDITING_GITHUB_TOKEN on the server.")}</p>
          </div>
        ) : me.user ? (
          typeof children === "function" ? children(me.user) : children
        ) : (
          <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>
        )}
      </main>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import s from "./editing.module.css";
import { CalendarDays, Clapperboard, KeyRound, LogOut, Newspaper, Users } from "lucide-react";

// The bar's classes, for pages outside this folder that add their own buttons to it.
export { s as barStyles };

export { s };

export const STATUS = {
  queued: "Waiting to start",
  preparing: "Transcribing",
  deciding: "Choosing takes",
  rendering: "Cutting",
  verifying: "Checking the cut",
  review: "Ready for review",
  delivering: "Copying to Drive",
  approved: "Approved",
  failed: "Failed",
};
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
    const e = new Error(data.error || "something went wrong (" + res.status + ")");
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

export function Pill({ status }) {
  return <span className={`${s.pill} ${s["s_" + status] || ""}`}>{STATUS[status] || status}</span>;
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
  ["topics", "/", "Topic Engine", Newspaper],
  ["calendar", "/calendar", "Calendar", CalendarDays],
  ["editing", "/editing", "Video Editing", Clapperboard],
];

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
  const ax = (me.user && me.user.ax) || [];
  const apps = APPS.filter(([k]) => ax.includes(k));
  const current = path === "/" ? "topics" : path.startsWith("/calendar") ? "calendar" : path.startsWith("/editing") && !path.startsWith("/editing/team") && !path.startsWith("/editing/password") ? "editing" : "";
  const appLink = ([k, href, label, Icon]) => {
    const cls = `${s.app} ${current === k ? s.appOn : ""}`;
    return href === "/" ? (
      <a key={k} href={href} className={cls}>
        <Icon size={16} aria-hidden /> {label}
      </a>
    ) : (
      <Link key={k} href={href} className={cls}>
        <Icon size={16} aria-hidden /> {label}
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
        {me.user && (
          <div className={s.account} data-menu>
            {ax.includes("team") && (
              <Link href="/editing/team" className={`${s.barBtn} ${path === "/editing/team" ? s.appOn : ""}`} title="Team: who can open what">
                <Users size={16} aria-hidden /> <span className={s.wideOnly}>Team</span>
              </Link>
            )}
            <button className={s.me} onClick={() => setMenu((m) => !m)} aria-label="Account and apps" aria-expanded={menu}>
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
                      <Icon size={16} aria-hidden /> {label}
                    </a>
                  ))}
                  {ax.includes("team") && (
                    <a href="/editing/team" className={s.menuItem} role="menuitem">
                      <Users size={16} aria-hidden /> Team
                    </a>
                  )}
                </div>
                <Link href="/editing/password" className={s.menuItem} role="menuitem" onClick={() => setMenu(false)}>
                  <KeyRound size={16} aria-hidden /> Change password
                </Link>
                <button className={`${s.menuItem} ${s.danger}`} onClick={logout} role="menuitem">
                  <LogOut size={16} aria-hidden /> Sign out
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
    ? [["/editing", "Projects"], ["/editing/new", "New project"], ["/editing/topics", "Topics to record"], ...(me.user.role === "admin" ? [["/editing/lessons", "Lessons"]] : [])]
    : [];
  return (
    <div className={s.shell}>
      <AppBar me={me} />
      {sub.length > 0 && me.user && (
        <nav className={s.subnav}>
          {sub.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? s.subOn : ""}>
              {label}
            </Link>
          ))}
        </nav>
      )}
      <main className={s.page} style={wide ? { maxWidth: "none" } : undefined}>
        {!me.enabled ? (
          <div className={s.card}>
            <p className={s.muted}>Accounts are not switched on yet. The admin sets EDITING_SESSION_SECRET and EDITING_GITHUB_TOKEN on the server.</p>
          </div>
        ) : me.user ? (
          typeof children === "function" ? children(me.user) : children
        ) : (
          <p className={s.muted}>Loading…</p>
        )}
      </main>
    </div>
  );
}

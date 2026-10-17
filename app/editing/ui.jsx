"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import s from "./editing.module.css";

export { s };

export const STATUS = {
  queued: "Waiting to start",
  preparing: "Transcribing",
  deciding: "Choosing takes",
  rendering: "Cutting",
  verifying: "Checking joins",
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

export function useMe() {
  const [state, setState] = useState({ loading: true, enabled: true, user: null });
  const load = useCallback(() => {
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
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Shell({ children, wide }) {
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me.loading && me.enabled && !me.user) router.replace("/editing/login?next=" + encodeURIComponent(path));
    if (me.user && me.user.must_change && path !== "/editing/password") router.replace("/editing/password");
  }, [me, path, router]);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/editing/login";
  };
  // Only the parts this person may open (lib/editing/access.js).
  const ax = (me.user && me.user.ax) || [];
  const nav = [
    ...(ax.includes("topics") ? [["/", "Topic Engine"]] : []),
    ...(ax.includes("calendar") ? [["/calendar", "Calendar"]] : []),
    ...(ax.includes("editing") ? [["/editing", "Projects"], ["/editing/new", "New project"], ["/editing/topics", "Topics"]] : []),
    ...(ax.includes("team") ? [["/editing/team", "Team"]] : []),
    ["/editing/password", "Password"],
  ];
  return (
    <div className={s.page} style={wide ? { maxWidth: "none" } : undefined}>
      <header className={s.top}>
        <div className={s.brand}>
          {path.startsWith("/calendar") ? "Content calendar" : "Video Editing"}<small>Sugimoto Visa</small>
        </div>
        {me.user && (
          <nav className={s.nav}>
            {nav.map(([href, label]) =>
              href === "/" ? (
                <a key={href} href={href}>
                  {label}
                </a>
              ) : (
                <Link key={href} href={href} className={path === href ? s.on : ""}>
                  {label}
                </Link>
              )
            )}
            <button className={s.linkBtn} onClick={logout}>
              Sign out ({me.user.name})
            </button>
          </nav>
        )}
      </header>
      {!me.enabled ? (
        <div className={s.card}>
          <p className={s.muted}>Video Editing is not switched on yet. The admin sets EDITING_SESSION_SECRET and EDITING_GITHUB_TOKEN on the server.</p>
        </div>
      ) : me.user ? (
        typeof children === "function" ? children(me.user) : children
      ) : (
        <p className={s.muted}>Loading…</p>
      )}
    </div>
  );
}

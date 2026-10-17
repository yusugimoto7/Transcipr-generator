import { NextResponse } from "next/server";
import { COOKIE, TICKET, TICKET_MINUTES, readSession, readTicket, sessionSecret } from "./lib/editing/session";
import { sectionOf, isPublishing, homeOf, SECTION_NAMES } from "./lib/editing/access";

// One login for the whole app. Video Editing, the content calendar and the Team page always need
// it (once the section is switched on). The Topic Engine itself needs it only with APP_LOGIN=all;
// without that setting it stays open exactly as before.
//
// Who may open what comes from a short-lived access ticket the server signs from the stored account
// (lib/editing/access.js, /api/editing/auth/ticket). Machine callers (Telegram, the video workflow,
// the draws cron, the publishing clock, Instagram's media fetches) are listed as open in access.js
// and carry their own secrets.

async function ticketFor(req, uid) {
  const ax = await readTicket(req.cookies.get(TICKET)?.value, uid);
  if (ax) return { ax, set: "" };
  // Renew from the stored account: one call every few minutes per person.
  // Straight to this server, not through the public address: no TLS redirect can drop the cookie.
  const base = process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : req.nextUrl.origin;
  const res = await fetch(base + "/api/editing/auth/ticket", { headers: { cookie: req.headers.get("cookie") || "" }, cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  const d = await res.json().catch(() => null);
  return d && Array.isArray(d.ax) ? { ax: d.ax, set: d.ticket } : null;
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const section = sectionOf(pathname, search);
  if (section === "open") return NextResponse.next();
  const all = process.env.APP_LOGIN === "all";
  if (section === "topics" && !all) return NextResponse.next();
  if (!sessionSecret()) return NextResponse.next(); // accounts off: those pages say so

  const api = pathname.startsWith("/api/");
  const signIn = () => {
    if (api) return NextResponse.json({ error: "sign in again" }, { status: 401 });
    const url = new URL("/editing/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  };
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  if (!s || s.t) return signIn();
  if (s.mc && !api && pathname !== "/editing/password") return NextResponse.redirect(new URL("/editing/password", req.url));
  if (section === "any") return NextResponse.next();

  const t = await ticketFor(req, s.uid);
  if (!t) return signIn();
  const need = section;
  const deny = (what) => {
    if (api) return NextResponse.json({ error: `your account has no access to ${what}; ask Hamed` }, { status: 403 });
    const url = new URL(homeOf(t.ax), req.url);
    if (url.pathname === pathname) url.pathname = "/no-access";
    url.searchParams.set("denied", what);
    return NextResponse.redirect(url);
  };
  let res;
  if (!t.ax.includes(need)) res = deny(need === "team" ? "the Team page" : SECTION_NAMES[need]);
  else if (all && isPublishing(pathname, req.method) && !t.ax.includes("publishing")) res = deny(SECTION_NAMES.publishing);
  else res = NextResponse.next();
  if (t.set) {
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(TICKET, t.set, { path: "/", httpOnly: true, sameSite: "lax", maxAge: TICKET_MINUTES * 60, secure });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};

import { NextResponse } from "next/server";
import { COOKIE, readSession, sessionSecret } from "./lib/editing/session";

// Login gate. By default it guards ONLY the new Video Editing section (/editing, /api/editing);
// every existing Topic Engine page and API passes straight through, exactly as before.
//
// APP_LOGIN=all extends the same login to the whole app (members see only Video Editing; the
// admin sees everything). Off until Hamed switches it on. Machine callers keep working: they are
// listed in OPEN and carry their own secrets.

const OPEN = [
  "/editing/login",
  "/api/editing/auth/login",
  "/api/health",
  "/api/telegram/webhook",
  "/api/video/callback",
  "/api/draws/run",
];

function isEditing(p) {
  return p === "/editing" || p.startsWith("/editing/") || p.startsWith("/api/editing/");
}

export async function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;
  const editing = isEditing(pathname);
  const all = process.env.APP_LOGIN === "all";
  if (!editing && !all) return NextResponse.next();
  if (!sessionSecret()) return NextResponse.next(); // section off: its pages say so
  if (OPEN.includes(pathname)) return NextResponse.next();
  if (pathname === "/api/topics" && searchParams.get("warm") === "1") return NextResponse.next(); // keepwarm job

  const api = pathname.startsWith("/api/");
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  if (!s) {
    if (api) return NextResponse.json({ error: "sign in again" }, { status: 401 });
    const url = new URL("/editing/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (!editing && s.role !== "admin") {
    if (api) return NextResponse.json({ error: "not available for your account" }, { status: 403 });
    return NextResponse.redirect(new URL("/editing", req.url));
  }
  if (s.mc && !api && pathname !== "/editing/password") {
    return NextResponse.redirect(new URL("/editing/password", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};

// What each person may open. One login for the whole app: Hamed (admin) has everything; a member
// has the parts he ticks for them on the Team page. Edge-safe (no Node imports): the middleware
// uses it on every request, the route handlers and pages too.
//
//   topics      the Topic Engine: topics, scripts, carousel, story, article, video, Lexbase, Ideas
//   calendar    the content calendar (cards, scheduling; posting always needs Hamed's approval)
//   editing     Video Editing (their own projects)
//   publishing  the Topic Engine's direct sends: Telegram, the WordPress draft, the Word file
//               to Telegram (only matters together with "topics")
//   learn       "learn from this note" under edit notes: a note may become a rule for later
//               content (only matters together with "topics"; the rule list stays the admin's)

export const SECTIONS = ["topics", "calendar", "editing", "publishing", "learn"];
// Pairs [Persian, English] (lib/i18n.js), read with L() where drawn. "team" is the Team page.
export const SECTION_NAMES = {
  topics: ["تاپیک انجین", "Topic Engine"],
  calendar: ["تقویم محتوا", "Content calendar"],
  editing: ["تدوین ویدیو", "Video Editing"],
  publishing: ["انتشار (Telegram، WordPress)", "Publishing (Telegram, WordPress)"],
  learn: ["یاد دادن به برنامه از یادداشت‌ها", "Teaching the app from notes"],
  team: ["صفحهٔ تیم", "the Team page"],
};

// Accounts made before access existed had Video Editing and the calendar.
const LEGACY = { editing: true, calendar: true };

export function accessOf(user) {
  if (!user) return [];
  if (user.role === "admin") return [...SECTIONS, "team"];
  const a = user.access || LEGACY;
  return SECTIONS.filter((k) => a[k]);
}

export function cleanAccess(input) {
  const out = {};
  for (const k of SECTIONS) out[k] = !!(input && input[k]);
  return out;
}

// Paths anyone may reach without signing in: the sign-in itself, and machine callers that carry
// their own secrets or unguessable ids (Telegram's webhook and file fetches, the video workflow,
// the draws cron, the publishing clock, Instagram fetching media).
const OPEN = [
  "/editing/login", "/login", "/api/editing/auth/login", "/api/editing/auth/ticket", "/api/editing/auth/lang", "/api/health",
  "/api/telegram/webhook", "/api/video/callback", "/api/calendar/tick", "/api/glossary",
];
const OPEN_PREFIX = [
  "/api/calendar/media/", "/api/draws/", "/api/carousel/img/", "/api/story/image",
];
// Signed in, whatever their access: their own account and notifications, the Drive picker's keys and voice notes
// (every part that takes a Drive link or typed text uses them).
const ANY = ["/api/push", "/editing/password", "/api/editing/auth/password", "/api/editing/auth/logout", "/api/editing/me", "/no-access", "/api/drive/config", "/api/voice/transcribe"];

const under = (p, base) => p === base || p.startsWith(base + "/");

// Which part of the app a path belongs to.
export function sectionOf(pathname, search = "") {
  const p = pathname;
  if (OPEN.includes(p) || OPEN_PREFIX.some((x) => p.startsWith(x))) return "open";
  // the editing worker telling the app a run changed (lib/editing/notify.js: it only makes the app look)
  if (/^\/api\/editing\/runs\/r-[a-f0-9]{12}\/changed$/.test(p)) return "open";
  if (p === "/api/topics" && /(?:^|[?&])warm=1(?:&|$)/.test(search)) return "open"; // keep-awake job
  if (ANY.includes(p)) return "any";
  if (under(p, "/editing/team") || under(p, "/api/editing/team")) return "team";
  if (under(p, "/editing") || under(p, "/api/editing")) return "editing";
  if (under(p, "/calendar") || under(p, "/api/calendar")) return "calendar";
  return "topics";
}

// The Topic Engine's direct sends, refused without "publishing" (the background-job kinds are
// checked in /api/jobs itself).
export function isPublishing(pathname, method) {
  if (method === "GET") return false;
  return ["/api/publish", "/api/gdoc"].includes(pathname);
}
export const PUBLISH_JOBS = ["telegram_send", "publish", "carousel_send", "story_send"];

// Where a person lands after signing in, or when they open a part they do not have.
export function homeOf(ax) {
  if (ax.includes("topics")) return "/";
  if (ax.includes("calendar")) return "/calendar";
  if (ax.includes("editing")) return "/editing";
  return "/no-access";
}

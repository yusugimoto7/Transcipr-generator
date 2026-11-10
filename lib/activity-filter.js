// Kept apart from lib/activity.js because the middleware loads it, and the middleware cannot load the
// data store.

// Whether a request is worth a line (the middleware asks before calling home): actions, and pages
// opened. Reading, polling and the files a page loads are not.
const QUIET = /^\/api\/(activity|jobs|inbox|push|seen|editing\/auth\/ticket|voice\/transcribe|source-info|editing\/me)\b/;
export function worthLogging(method, path, { prefetch = false } = {}) {
  if (prefetch) return false;
  if (path.startsWith("/api/")) return method !== "GET" && method !== "HEAD" && !QUIET.test(path);
  return method === "GET" && !/\.[a-z0-9]{2,5}$/i.test(path) && !path.startsWith("/no-access");
}


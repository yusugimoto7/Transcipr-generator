// WordPress integration for publishing blog drafts to sugimotovisa.com.
//
// WP_BASE_URL      = site base (default https://sugimotovisa.com)
// WP_USER          = WordPress username
// WP_APP_PASSWORD  = a WordPress *Application Password* (Users -> profile ->
//                    Application Passwords). NOT the login password.
//
// Reading pages/categories is public (no auth). Creating a draft needs auth.

function base() {
  return (process.env.WP_BASE_URL || "https://sugimotovisa.com").replace(/\/+$/, "");
}

export function wordpressEnabled() {
  return !!process.env.WP_USER && !!process.env.WP_APP_PASSWORD;
}

function authHeader() {
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  if (!user || !pass) return null;
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

// Many shared hosts (Apache/LiteSpeed/CGI) strip the standard `Authorization`
// header, so WordPress never sees the credentials and replies
// rest_not_logged_in. Send the same Basic credential under several header
// names that hosts and WP commonly forward, plus the credentials in the URL —
// whichever survives, WordPress authenticates. Harmless when not needed.
function authHeaders(extra = {}) {
  const auth = authHeader();
  if (!auth) return extra;
  return {
    Authorization: auth,
    // Apache/CGI convention — WP core reads this when the standard one is lost.
    "X-Authorization": auth,
    "Redirect-Authorization": auth,
    "HTTP-Authorization": auth,
    ...extra,
  };
}

// Same URL with credentials inlined (https://user:pass@host/...). Some hosts
// pass these through to PHP even when the header is dropped.
function urlWithCreds(url) {
  const user = process.env.WP_USER;
  const pass = process.env.WP_APP_PASSWORD;
  if (!user || !pass) return null;
  try {
    const u = new URL(url);
    u.username = encodeURIComponent(user);
    // WP application passwords contain spaces; they must be encoded here.
    u.password = encodeURIComponent(pass);
    return u.toString();
  } catch (_) {
    return null;
  }
}

// POST/DELETE against the WP REST API, retrying with fallback auth transports
// if the host strips the Authorization header. Returns { res, data }.
async function wpFetch(url, { method = "GET", body = null, timeoutMs = 12000 } = {}) {
  // Hard timeout: a slow/unreachable site must never hang the request (that
  // makes every button in the app spin forever).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const base = { method, redirect: "follow", signal: ctrl.signal };
  if (body) base.body = JSON.stringify(body);
  try {
    return await wpFetchAttempts(url, base, body, method);
  } finally {
    clearTimeout(timer);
  }
}

// CRITICAL: fetch() silently DROPS the Authorization header when a request is
// redirected to a different origin (e.g. sugimotovisa.com -> www.sugimotovisa.com,
// or http -> https). WordPress then sees no credentials and replies
// rest_not_logged_in — indistinguishable from a host stripping the header.
// Follow redirects manually and re-attach the credentials on every hop.
async function fetchKeepAuth(url, opts, maxHops = 5) {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(current, { ...opts, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue; // re-issue the SAME request (with auth) at the new location
    }
    // Remember where we ended up, for diagnostics.
    try {
      res._finalUrl = current;
    } catch (_) {}
    return res;
  }
  return fetch(current, { ...opts, redirect: "follow" });
}

async function wpFetchAttempts(url, base, body, method) {

  const attempts = [
    // 1. EXACTLY what the known-working n8n request sent: a single plain
    //    Authorization header, nothing else. Extra/unusual headers can trip a
    //    WAF or security plugin, so this minimal form is tried first.
    () =>
      fetchKeepAuth(url, {
        ...base,
        headers: {
          Authorization: authHeader(),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      }),
    // 2. Standard + common forwarded aliases (for hosts that rename the header).
    () =>
      fetchKeepAuth(url, {
        ...base,
        headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      }),
    // 2. Credentials in the URL, for hosts that drop headers entirely.
    () => {
      const u = urlWithCreds(url);
      if (!u) return null;
      return fetchKeepAuth(u, {
        ...base,
        headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      });
    },
    // 3. Same as (1) but with WP's `_method` override, which some security
    //    layers allow through when a raw POST is blocked.
    () =>
      fetchKeepAuth(url + (url.includes("?") ? "&" : "?") + "_method=" + method, {
        ...base,
        method: "POST",
        headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      }),
  ];

  let last = null;
  for (const attempt of attempts) {
    let res;
    try {
      res = await attempt();
    } catch (_) {
      continue;
    }
    if (!res) continue;
    const data = await res.json().catch(() => ({}));
    last = { res, data };
    if (res.ok) return last;
    // Only keep trying while the failure is "not authenticated".
    const code = data?.code || "";
    if (code !== "rest_not_logged_in" && res.status !== 401) return last;
  }
  return last || { res: { ok: false, status: 0 }, data: {} };
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "").trim();
}

// Public: the site's pages, used as the allowed internal-link list for SEO.
// Public GET with a hard timeout — a slow site must not hang the app.
async function publicGet(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getInternalLinks() {
  try {
    const res = await publicGet(
      `${base()}/wp-json/wp/v2/pages?per_page=100&_fields=link,title`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((p) => ({ url: p.link, title: stripTags(p.title?.rendered) }))
      .filter((x) => x.url);
  } catch (_) {
    return [];
  }
}

// Farsi keyword fallbacks per field, used to find a related site link when the
// topic title itself returns no search hit.
const FIELD_QUERY = {
  PNP: "برنامه استانی",
  Study: "تحصیل",
  "Work Permit": "ورک پرمیت",
  LMIA: "LMIA",
  Policy: "مهاجرت کانادا",
  Court: "مهاجرت کانادا",
  Europe: "اروپا",
  "Express Entry": "اکسپرس انتری",
};

// Gather candidate sugimotovisa.com pages/posts for a topic (public WP search),
// across a few query variants. Returns [{ url, title }] deduped — the caller
// then picks the genuinely relevant one (or none). We do NOT blindly return the
// top hit, because a single generic word can surface an unrelated page.
export async function getRelatedCandidates(topic) {
  const queries = [
    String(topic?.title_fa || "").slice(0, 60),
    String(topic?.title_en || "").slice(0, 60),
    FIELD_QUERY[topic?.field] || "",
  ].filter((q) => q && q.trim().length > 1);

  const seen = new Set();
  const out = [];
  for (const q of queries) {
    try {
      const res = await publicGet(
        `${base()}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=6&_fields=url,title`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const hit of Array.isArray(data) ? data : []) {
        if (hit?.url && !seen.has(hit.url)) {
          seen.add(hit.url);
          out.push({ url: hit.url, title: stripTags(hit.title?.rendered || hit.title) });
        }
      }
    } catch (_) {}
    if (out.length >= 12) break;
  }
  return out.slice(0, 12);
}

// Public: find the blog/magazine category id (same heuristic as the n8n flow).
async function findCategory() {
  try {
    const res = await publicGet(
      `${base()}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug`
    );
    if (!res.ok) return null;
    const cats = await res.json();
    const list = Array.isArray(cats) ? cats : [];
    const cat =
      list.find((c) => (c.name || "").includes("پاسپورت")) ||
      list.find((c) => (c.name || "").includes("مجله")) ||
      list.find((c) => (c.slug || "").toLowerCase() === "blog") ||
      list.find((c) => (c.name || "").toLowerCase() === "blog") ||
      null;
    return cat ? { id: cat.id, name: cat.name } : null;
  } catch (_) {
    return null;
  }
}

// Who does WordPress think we are? Uses the same Basic auth as publishing.
// Distinguishes the three real-world failure modes:
//   - invalid_username / incorrect_password  -> wrong WP_USER / WP_APP_PASSWORD
//   - rest_not_logged_in (auth sent, ignored) -> host strips the Authorization
//     header (very common on Apache/LiteSpeed shared hosting)
//   - 200 with roles                          -> auth works; roles tell the rest
// Does the site redirect the REST endpoint elsewhere (www / https / slash)?
// A cross-origin redirect is what makes plain fetch() drop the credentials, so
// report it — pointing WP_BASE_URL at the final host fixes it permanently.
export async function detectRedirect() {
  try {
    const start = `${base()}/wp-json/wp/v2/posts`;
    const res = await fetch(start, { method: "HEAD", redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const finalUrl = new URL(loc, start).toString();
        const from = new URL(start).origin;
        const to = new URL(finalUrl).origin;
        return { redirects: true, from, to, cross_origin: from !== to };
      }
    }
    return { redirects: false };
  } catch (e) {
    return { redirects: null, error: String(e?.message || e) };
  }
}

// Safe view of the configured credentials — never reveals the password itself,
// only its shape, so a wrong/short/quoted value is visible at a glance.
export function credentialShape() {
  const user = process.env.WP_USER || "";
  const pass = process.env.WP_APP_PASSWORD || "";
  const stripped = pass.replace(/[^a-zA-Z0-9]/g, "");
  return {
    base_url: base(),
    user: user || "(not set)",
    user_has_space: /\s/.test(user),
    user_looks_like_email: user.includes("@"),
    pass_len: pass.length,
    pass_len_stripped: stripped.length, // WP expects 24 after stripping spaces
    pass_has_spaces: /\s/.test(pass),
    pass_quoted: /^["']|["']$/.test(pass),
    pass_shape_ok: stripped.length === 24,
  };
}

export async function whoAmI() {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured" };
  try {
    const { res, data } = await wpFetch(`${base()}/wp-json/wp/v2/users/me?context=edit`);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: data?.code || "",
        message: stripTags(data?.message || ""),
      };
    }
    return {
      ok: true,
      id: data.id,
      name: data.name || data.slug || "",
      username: data.username || data.slug || "",
      roles: Array.isArray(data.roles) ? data.roles : [],
      can_publish: !!data?.capabilities?.publish_posts,
      can_edit_posts: !!data?.capabilities?.edit_posts,
    };
  } catch (e) {
    return { ok: false, code: "network", message: String(e?.message || e) };
  }
}

// End-to-end publish test: create a tiny draft, then delete it immediately.
// Proves definitively whether draft creation works with the current config.
export async function testDraftRoundtrip() {
  const auth = authHeader();
  if (!auth) return { ok: false, step: "config", error: "WP_USER / WP_APP_PASSWORD not set" };
  try {
    const { res, data } = await wpFetch(`${base()}/wp-json/wp/v2/posts`, {
      method: "POST",
      body: {
        title: "API connectivity test — auto-deleted",
        content: "<p>test</p>",
        status: "draft",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        step: "create",
        status: res.status,
        code: data?.code || "",
        error: stripTags(data?.message || "HTTP " + res.status),
      };
    }
    // Clean up the test draft right away.
    let deleted = false;
    try {
      const del = await wpFetch(`${base()}/wp-json/wp/v2/posts/${data.id}?force=true`, {
        method: "DELETE",
      });
      deleted = !!del.res.ok;
    } catch (_) {}
    return { ok: true, created_id: data.id, deleted };
  } catch (e) {
    return { ok: false, step: "network", error: String(e?.message || e) };
  }
}

// Create a DRAFT post (never published live) and return its edit link.
export async function createDraft(article) {
  const auth = authHeader();
  if (!auth) throw new Error("WordPress is not configured (WP_USER / WP_APP_PASSWORD).");

  const cat = await findCategory();
  const body = {
    title: article.title_fa || "",
    slug: article.slug || "",
    content: article.content_html || "",
    excerpt: article.meta_description || article.excerpt || "",
    status: "draft",
  };
  if (cat?.id) body.categories = [cat.id];

  const { res, data } = await wpFetch(`${base()}/wp-json/wp/v2/posts`, {
    method: "POST",
    body,
  });
  if (!res.ok) {
    const err = new Error(data?.message || "WordPress " + res.status);
    err.wpCode = data?.code || "";
    err.wpStatus = res.status;
    throw err;
  }
  return {
    id: data.id,
    edit_link: `${base()}/wp-admin/post.php?post=${data.id}&action=edit`,
    category_name: cat?.name || "",
  };
}

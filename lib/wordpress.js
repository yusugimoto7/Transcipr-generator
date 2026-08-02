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

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "").trim();
}

// Public: the site's pages, used as the allowed internal-link list for SEO.
export async function getInternalLinks() {
  try {
    const res = await fetch(
      `${base()}/wp-json/wp/v2/pages?per_page=100&_fields=link,title`,
      { redirect: "follow" }
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
      const res = await fetch(
        `${base()}/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=6&_fields=url,title`,
        { redirect: "follow" }
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
    const res = await fetch(
      `${base()}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug`,
      { redirect: "follow" }
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
export async function whoAmI() {
  const auth = authHeader();
  if (!auth) return { ok: false, code: "not_configured" };
  try {
    const res = await fetch(`${base()}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: auth },
      redirect: "follow",
    });
    const data = await res.json().catch(() => ({}));
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
    const res = await fetch(`${base()}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      redirect: "follow",
      body: JSON.stringify({
        title: "API connectivity test — auto-deleted",
        content: "<p>test</p>",
        status: "draft",
      }),
    });
    const data = await res.json().catch(() => ({}));
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
      const del = await fetch(`${base()}/wp-json/wp/v2/posts/${data.id}?force=true`, {
        method: "DELETE",
        headers: { Authorization: auth },
        redirect: "follow",
      });
      deleted = del.ok;
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

  const res = await fetch(`${base()}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
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

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
    throw new Error(data?.message || "WordPress " + res.status);
  }
  return {
    id: data.id,
    edit_link: `${base()}/wp-admin/post.php?post=${data.id}&action=edit`,
    category_name: cat?.name || "",
  };
}

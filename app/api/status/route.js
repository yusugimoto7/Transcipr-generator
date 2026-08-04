import {
  wordpressEnabled,
  whoAmI,
  testDraftRoundtrip,
  detectRedirect,
  credentialShape,
} from "../../../lib/wordpress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE page that checks every system and renders a readable table.
// Open /api/status in a browser. Exposes no secrets — only booleans, public
// names, and error codes.

const BUILD = "2026-08-03-status-v1";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(label + " timed out after " + ms + "ms")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return [{ name: "Telegram bot", ok: false, detail: "TELEGRAM_BOT_TOKEN not set" }];
  const rows = [];
  try {
    const me = await withTimeout(
      fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()),
      10000,
      "Telegram getMe"
    );
    rows.push({
      name: "Telegram bot",
      ok: !!me.ok,
      detail: me.ok ? "@" + me.result.username : me.description || "invalid token",
    });
  } catch (e) {
    rows.push({ name: "Telegram bot", ok: false, detail: String(e.message || e) });
  }
  const targets = {
    "Review channel": process.env.TELEGRAM_REVIEW_CHAT_ID,
    "Public channel": process.env.TELEGRAM_PUBLIC_CHANNEL_ID,
  };
  for (const [name, id] of Object.entries(targets)) {
    if (!id) {
      rows.push({ name, ok: false, detail: "not set" });
      continue;
    }
    try {
      const chat = await withTimeout(
        fetch(
          `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(id)}`
        ).then((r) => r.json()),
        10000,
        name
      );
      rows.push({
        name,
        ok: !!chat.ok,
        detail: chat.ok ? chat.result.title || id : chat.description || "unreachable",
      });
    } catch (e) {
      rows.push({ name, ok: false, detail: String(e.message || e) });
    }
  }
  return rows;
}

async function checkWordPress() {
  if (!wordpressEnabled()) {
    return [{ name: "WordPress", ok: false, detail: "WP_USER / WP_APP_PASSWORD not set" }];
  }
  const rows = [];

  // Show the SHAPE of the configured credentials (never the password itself).
  // A wrong username, a quoted value, or a truncated password is visible here.
  const cs = credentialShape();
  rows.push({
    name: "WP_BASE_URL",
    ok: /^https:\/\//.test(cs.base_url),
    detail: cs.base_url,
  });
  rows.push({
    name: "WP_USER",
    ok: !!cs.user && !cs.user_has_space && !cs.user_looks_like_email,
    detail:
      cs.user +
      (cs.user_looks_like_email ? "  ⚠️ looks like an email — use the LOGIN username" : "") +
      (cs.user_has_space ? "  ⚠️ contains a space" : ""),
  });
  rows.push({
    name: "WP_APP_PASSWORD",
    ok: cs.pass_shape_ok && !cs.pass_quoted,
    detail:
      `${cs.pass_len} chars (${cs.pass_len_stripped} without spaces)` +
      (cs.pass_shape_ok ? " ✓ correct length" : "  ⚠️ should be 24 letters/digits") +
      (cs.pass_quoted ? "  ⚠️ remove the surrounding quotes" : ""),
  });

  // Surface a redirect first — it silently strips credentials in plain fetch.
  try {
    const rd = await withTimeout(detectRedirect(), 10000, "redirect check");
    if (rd.redirects) {
      rows.push({
        name: "Site redirect",
        ok: !rd.cross_origin,
        detail: rd.cross_origin
          ? `${rd.from} → ${rd.to} — set WP_BASE_URL to ${rd.to}`
          : "same-origin redirect (harmless)",
      });
    } else if (rd.redirects === false) {
      rows.push({ name: "Site redirect", ok: true, detail: "none (" + process.env.WP_BASE_URL + ")" });
    }
  } catch (_) {}

  let me;
  try {
    me = await withTimeout(whoAmI(), 15000, "WordPress login");
  } catch (e) {
    return [...rows, { name: "WordPress login", ok: false, detail: String(e.message || e) }];
  }
  rows.push({
    name: "WordPress login",
    ok: !!me.ok,
    detail: me.ok
      ? `${me.username} · roles: ${(me.roles || []).join(", ") || "none"}`
      : `${me.code || me.status || "failed"} ${me.message || ""}`.trim(),
  });
  if (me.ok) {
    try {
      const t = await withTimeout(testDraftRoundtrip(), 20000, "WordPress draft test");
      rows.push({
        name: "Create draft (live test)",
        ok: !!t.ok,
        detail: t.ok
          ? "draft created + deleted OK"
          : `${t.code || t.step || ""} ${t.error || ""}`.trim(),
      });
    } catch (e) {
      rows.push({ name: "Create draft (live test)", ok: false, detail: String(e.message || e) });
    }
  }
  return rows;
}

async function checkSheet() {
  const url = process.env.SHEET_WEBHOOK_URL;
  const secret = process.env.SHEET_SECRET;
  if (!url || !secret) {
    return [{ name: "Google Sheet", ok: false, detail: "SHEET_WEBHOOK_URL / SHEET_SECRET not set" }];
  }
  try {
    const r = await withTimeout(
      fetch(`${url}?secret=${encodeURIComponent(secret)}&type=library`, { redirect: "follow" }),
      12000,
      "Google Sheet"
    );
    const data = await r.json().catch(() => ({}));
    if (data && Array.isArray(data.items)) {
      return [{ name: "Google Sheet", ok: true, detail: `library reachable (${data.items.length} items)` }];
    }
    if (data && data.error) {
      return [{ name: "Google Sheet", ok: false, detail: String(data.error) + " (secret mismatch?)" }];
    }
    return [{ name: "Google Sheet", ok: false, detail: "old script version (no library support)" }];
  } catch (e) {
    return [{ name: "Google Sheet", ok: false, detail: String(e.message || e) }];
  }
}

function checkKeys() {
  return [
    {
      name: "OpenAI",
      ok: process.env.USE_OPENAI === "true" && !!process.env.OPENAI_API_KEY,
      detail:
        process.env.USE_OPENAI === "true"
          ? process.env.OPENAI_API_KEY
            ? "enabled, key set"
            : "USE_OPENAI=true but no key"
          : "USE_OPENAI not 'true'",
    },
    {
      name: "Claude fallback",
      ok: !!process.env.ANTHROPIC_API_KEY,
      detail: process.env.ANTHROPIC_API_KEY ? "key set" : "not set (no safety net)",
    },
  ];
}

export async function GET() {
  const sections = {};
  const settled = await Promise.allSettled([
    checkTelegram(),
    checkWordPress(),
    checkSheet(),
  ]);
  sections["Telegram"] = settled[0].status === "fulfilled" ? settled[0].value : [{ name: "Telegram", ok: false, detail: String(settled[0].reason) }];
  sections["WordPress"] = settled[1].status === "fulfilled" ? settled[1].value : [{ name: "WordPress", ok: false, detail: String(settled[1].reason) }];
  sections["Google Sheet"] = settled[2].status === "fulfilled" ? settled[2].value : [{ name: "Sheet", ok: false, detail: String(settled[2].reason) }];
  sections["AI"] = checkKeys();

  let rows = "";
  for (const [group, items] of Object.entries(sections)) {
    rows += `<tr class="g"><td colspan="3">${esc(group)}</td></tr>`;
    for (const it of items) {
      rows += `<tr><td class="i">${it.ok ? "✅" : "❌"}</td><td class="n">${esc(
        it.name
      )}</td><td class="d">${esc(it.detail)}</td></tr>`;
    }
  }

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugimoto — System Status</title>
<style>
body{margin:0;background:#16282f;color:#f2e5c0;font-family:system-ui,-apple-system,sans-serif;padding:18px}
h1{font-size:19px;margin:0 0 4px}
.sub{font-size:12px;color:rgba(242,229,192,.55);margin-bottom:16px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
td{padding:9px 6px;border-bottom:1px solid rgba(242,229,192,.12);vertical-align:top}
tr.g td{background:rgba(242,229,192,.07);font-weight:700;font-size:11.5px;letter-spacing:1px;text-transform:uppercase;color:rgba(242,229,192,.7);padding:8px 6px}
td.i{width:24px}
td.n{width:38%;font-weight:600}
td.d{color:rgba(242,229,192,.7);word-break:break-word}
.f{margin-top:18px;font-size:11.5px;color:rgba(242,229,192,.45)}
</style></head><body>
<h1>Sugimoto — System Status</h1>
<div class="sub">build ${esc(BUILD)} · ${esc(new Date().toISOString())}</div>
<table>${rows}</table>
<div class="f">✅ = working · ❌ = needs attention. Screenshot this page and send it.</div>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

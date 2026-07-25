// Auto-updating Canada Draws page (Express Entry + 9 provinces), Persian/RTL.
//
// Fetches the unified Apps Script endpoint, fingerprints the DRAW DATA ONLY
// (timestamps deliberately excluded, or every run would look "changed"), and
// rewrites the WordPress page only when the data actually changed. The
// fingerprint lives in an HTML comment on the page, so no database is needed.
//
// Reuses WP_BASE_URL / WP_USER / WP_APP_PASSWORD. Needs DRAWS_WP_PAGE_ID and
// DRAWS_UNIFIED_URL. The WP user needs the `unfiltered_html` capability or the
// <style> block is stripped.
import { fetchJson, esc } from "./util";

const EE_LIMIT = 15;

const PROV_META = {
  ON: ["انتاریو (OINP)", "#0f766e"],
  BC: ["بریتیش کلمبیا (BC PNP)", "#1d4ed8"],
  AB: ["آلبرتا (AAIP)", "#c2410c"],
  SK: ["ساسکاچوان (SINP)", "#15803d"],
  MB: ["مانیتوبا (MPNP)", "#6d28d9"],
  NS: ["نوا اسکوشیا (NSNP)", "#0e7490"],
  NB: ["نیوبرانزویک (NBPNP)", "#b91c1c"],
  PE: ["جزیره پرنس ادوارد (PEI)", "#be185d"],
  NL: ["نیوفاندلند (NLPNP)", "#4338ca"],
};

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s ?? "").replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

// djb2, base36 — any stable hash works.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function wordpressEnabled() {
  return !!(
    process.env.DRAWS_UNIFIED_URL &&
    process.env.DRAWS_WP_PAGE_ID &&
    process.env.WP_BASE_URL &&
    process.env.WP_USER &&
    process.env.WP_APP_PASSWORD
  );
}

export function fingerprintOf(rounds, pnp) {
  const sig = [];
  sig.push(
    "EE:" +
      rounds
        .map((r) =>
          [r.drawNumber, r.drawDateFull, r.drawName, r.drawSize, r.drawCRS].join("~")
        )
        .join("|")
  );
  for (const code of Object.keys(PROV_META)) {
    const p = pnp[code] || {};
    const rows = p.draws || [];
    sig.push(
      `P-${code}:${p.stale ? "S" : "F"}:` +
        rows
          .slice(0, 8)
          .map((r) => [r.date, r.invitations, r.score, r.stream].join("~"))
          .join("|")
    );
  }
  return hash(sig.join("||"));
}

const CSS = `<style>
.dw-wrap{font-family:'Vazirmatn',Tahoma,sans-serif;direction:rtl;max-width:1080px;margin:0 auto}
.dw-wrap *{box-sizing:border-box}
.dw-hero{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:24px;padding:40px 24px;text-align:center;margin-bottom:16px}
.dw-hero h2{font-size:30px;font-weight:800;margin:0 0 12px;color:#fff}
.dw-hero p{color:#cbd5e1;font-size:16px;line-height:1.9;max-width:640px;margin:0 auto}
.dw-updated{display:inline-block;margin-top:16px;background:rgba(59,130,246,.2);color:#93c5fd;border:1px solid rgba(59,130,246,.4);padding:6px 16px;border-radius:9999px;font-size:14px;font-weight:600}
.dw-section-title{font-size:24px;font-weight:800;color:#0f172a;margin:32px 0 16px;padding-right:14px;border-right:5px solid #2563eb}
.dw-section-title.pnp{border-right-color:#0f766e}
.dw-panel{background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.07);padding:8px;overflow-x:auto}
.dw-grid{display:grid;grid-template-columns:1fr;gap:20px}
@media(min-width:768px){.dw-grid{grid-template-columns:1fr 1fr}}
.dw-cat{background:#fff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.07);padding:20px;border-top:4px solid var(--accent,#2563eb)}
.dw-cat__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:8px}
.dw-cat__title{font-size:18px;font-weight:700;color:#1e293b;margin:0}
.dw-latest-badge{font-size:12px;font-weight:700;padding:4px 12px;border-radius:9999px;white-space:nowrap}
.dw-pending{background:#f1f5f9;color:#94a3b8}
.dw-highlight{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;background:#f8fafc;border-radius:14px;padding:14px;margin-bottom:14px}
.dw-hl-item{display:flex;flex-direction:column;gap:2px}
.dw-hl-label{font-size:12px;color:#64748b}
.dw-hl-val{font-size:16px;font-weight:700;color:#0f172a}
.dw-hl-crs{color:var(--accent,#2563eb);font-size:20px}
.dw-table{width:100%;border-collapse:collapse;font-size:13px}
.dw-table th{background:#f1f5f9;color:#475569;font-weight:700;padding:10px 8px;text-align:center;white-space:nowrap}
.dw-table td{padding:10px 8px;text-align:center;border-bottom:1px solid #f1f5f9;color:#334155}
.dw-table tr:last-child td{border-bottom:none}
.dw-table--ee td.dw-type{text-align:right;font-size:12px;color:#475569;max-width:280px}
.dw-table--ee tbody tr:first-child{background:#eff6ff;font-weight:700}
.dw-crs{font-weight:800;color:#2563eb}
.dw-pnp-empty{color:#94a3b8;font-size:14px;text-align:center;padding:24px 8px;background:#f8fafc;border-radius:12px;border:1px dashed #e2e8f0}
.dw-stale-note{margin-top:10px;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 10px;line-height:1.7}
.dw-stale-note a{color:#b45309;font-weight:700}
.dw-note{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;color:#92400e;font-size:14px;line-height:1.9;margin-top:24px}
</style>`;

function provinceCard(code, pnp) {
  const [fa, accent] = PROV_META[code];
  const prov = pnp[code] || {};
  const draws = prov.draws || [];
  const url = prov.url || "#";
  const stale = prov.stale !== false; // unknown -> treat as stale

  if (!draws.length) {
    return `<div class="dw-cat dw-pnp" style="--accent:${accent}">
  <div class="dw-cat__head"><h3 class="dw-cat__title">${fa}</h3><span class="dw-latest-badge dw-pending">در انتظار داده</span></div>
  <div class="dw-pnp-empty">در حال حاضر داده تأییدشده‌ای موجود نیست. <a href="${url}" target="_blank" rel="nofollow noopener">بررسی در سایت رسمی ↗</a></div>
</div>`;
  }

  const latest = draws[0];
  const rows = draws
    .slice(0, 8)
    .map(
      (r) =>
        `<tr><td>${faN(r.date || "—")}</td><td class="dw-type">${esc(
          r.stream || "—"
        )}</td><td>${faN(r.invitations || "—")}</td><td class="dw-crs">${faN(
          r.score || "—"
        )}</td></tr>`
    )
    .join("");
  const badge = stale
    ? '<span class="dw-latest-badge" style="background:#fef3c7;color:#b45309">نیازمند بررسی</span>'
    : '<span class="dw-latest-badge" style="background:#dcfce7;color:#15803d">به‌روز</span>';
  const note = stale
    ? `<div class="dw-stale-note">⚠️ ممکن است این داده به‌روز نباشد. <a href="${url}" target="_blank" rel="nofollow noopener">تأیید در سایت رسمی ↗</a></div>`
    : "";

  return `<div class="dw-cat dw-pnp" style="--accent:${accent}">
  <div class="dw-cat__head"><h3 class="dw-cat__title">${fa}</h3>${badge}</div>
  <div class="dw-highlight">
    <div class="dw-hl-item"><span class="dw-hl-label">آخرین قرعه‌کشی</span><span class="dw-hl-val">${faN(latest.date || "—")}</span></div>
    <div class="dw-hl-item"><span class="dw-hl-label">دعوت‌نامه</span><span class="dw-hl-val">${faN(latest.invitations || "—")}</span></div>
    <div class="dw-hl-item"><span class="dw-hl-label">حداقل امتیاز</span><span class="dw-hl-val dw-hl-crs">${faN(latest.score || "—")}</span></div>
  </div>
  <table class="dw-table">
    <thead><tr><th>تاریخ</th><th>استریم</th><th>دعوت</th><th>امتیاز</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${note}
</div>`;
}

export function renderPage(rounds, pnp, fingerprint, runStamp) {
  const eeRows = rounds
    .map(
      (r) =>
        `<tr><td>#${faN(r.drawNumber)}</td><td>${faN(
          r.drawDateFull
        )}</td><td class="dw-type">${esc(r.drawName)}</td><td>${faN(
          r.drawSize
        )}</td><td class="dw-crs">${faN(r.drawCRS)}</td></tr>`
    )
    .join("\n");

  const pnpCards = Object.keys(PROV_META)
    .map((code) => provinceCard(code, pnp))
    .join("\n");

  return `<!-- wp:html -->
<!-- draws-fingerprint:${fingerprint} -->
${CSS}
<div class="dw-wrap">
<div class="dw-hero">
<h2>آخرین قرعه‌کشی‌های مهاجرت به کانادا</h2>
<p>جدیدترین نتایج قرعه‌کشی‌های اکسپرس انتری (Express Entry) و برنامه‌های نامزدی استانی (PNP) کانادا.</p>
<span class="dw-updated">آخرین به‌روزرسانی: ${runStamp}</span>
</div>

<h2 class="dw-section-title">🍁 اکسپرس انتری (Express Entry)</h2>
<div class="dw-panel">
  <table class="dw-table dw-table--ee">
    <thead><tr><th>شماره</th><th>تاریخ</th><th>نوع قرعه‌کشی</th><th>تعداد دعوت‌نامه</th><th>حداقل امتیاز CRS</th></tr></thead>
    <tbody>
${eeRows}
    </tbody>
  </table>
</div>

<h2 class="dw-section-title pnp">🏛️ برنامه‌های نامزدی استانی (PNP)</h2>
<div class="dw-grid">
${pnpCards}
</div>

<div class="dw-note">📌 داده‌های اکسپرس انتری از منبع رسمی IRCC و داده‌های استانی از سایت‌های رسمی هر استان به‌صورت خودکار دریافت می‌شوند. برای تصمیم‌گیری نهایی، همیشه منبع رسمی را بررسی کنید.</div>
</div>
<!-- /wp:html -->`;
}

export async function updateWordPressPage({ dryRun = false } = {}) {
  if (!wordpressEnabled()) {
    return { updated: false, skipped: true, reason: "wordpress not configured" };
  }

  const pageUrl = `${process.env.WP_BASE_URL.replace(/\/$/, "")}/wp-json/wp/v2/pages/${
    process.env.DRAWS_WP_PAGE_ID
  }`;
  const auth =
    "Basic " +
    Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString(
      "base64"
    );

  const data = await fetchJson(process.env.DRAWS_UNIFIED_URL, { timeout: 60000 });
  const rounds = (data?.rounds || []).slice(0, EE_LIMIT);
  const pnp = data?.pnpDraws || {};
  const fingerprint = fingerprintOf(rounds, pnp);

  // ?context=edit returns content.raw; content.rendered would corrupt the page
  // over successive round-trips.
  const cur = await fetch(`${pageUrl}?context=edit`, {
    headers: { Authorization: auth },
  });
  if (!cur.ok) {
    const body = await cur.text().catch(() => "");
    throw new Error(`WP GET ${cur.status} ${body.slice(0, 200)}`);
  }
  const page = await cur.json();
  const existing = page?.content?.raw || "";
  const match = existing.match(/draws-fingerprint:([a-z0-9]+)/i);

  if (match && match[1] === fingerprint) {
    return {
      updated: false,
      reason: "no new draws — page left untouched",
      fingerprint,
    };
  }

  const runStamp =
    new Date().toLocaleString("en-CA", {
      timeZone: process.env.DRAWS_TIMEZONE || "America/Vancouver",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " (PT)";

  const html = renderPage(rounds, pnp, fingerprint, runStamp);

  if (dryRun) {
    return {
      updated: false,
      dryRun: true,
      reason: "would have written",
      fingerprint,
      bytes: html.length,
    };
  }

  const write = await fetch(pageUrl, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ content: html }),
  });
  if (!write.ok) {
    const body = await write.text().catch(() => "");
    throw new Error(`WP POST ${write.status} ${body.slice(0, 200)}`);
  }
  const result = await write.json();

  return {
    updated: true,
    reason: "new draw data",
    pageId: result?.id,
    fingerprint,
    runStamp,
    eeRows: rounds.length,
    latestEE: rounds[0]?.drawDateFull || null,
    bcStale: pnp?.BC?.stale ?? null,
  };
}

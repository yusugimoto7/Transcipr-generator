// Code node: "Update WordPress Page" (runOnceForAllItems)
// Ported from the Canada Draws spec (Layer 2). Fetches the unified endpoint
// (Express Entry + 9 provinces), fingerprints the DATA ONLY, and rewrites the
// WordPress page only when the draw data actually changed.
//
// >>> FILL THESE THREE IN (one time) <<<
const APPS_SCRIPT_URL = '__PASTE_UNIFIED_ENDPOINT_EXEC_URL__';               // unified Apps Script /exec URL (rounds + pnpDraws)
const WP_BASE  = '__PASTE_WP_PAGE_REST_URL__';                              // e.g. https://your-site/wp-json/wp/v2/pages/123
const WP_AUTH  = '__PASTE_WP_BASIC_AUTH__';                                 // 'Basic ' + base64('user:application-password')
const EE_LIMIT = 15;

if (APPS_SCRIPT_URL.indexOf('PASTE_') !== -1 || WP_BASE.indexOf('PASTE_') !== -1 || WP_AUTH.indexOf('PASTE_') !== -1) {
  return [{ json: { updated: false, reason: 'not configured — fill APPS_SCRIPT_URL / WP_BASE / WP_AUTH in this node' } }];
}

// Persian (Farsi) digit conversion — presentation requirement
const faDigits = '۰۱۲۳۴۵۶۷۸۹';
const faN = (s) => String(s == null ? '' : s).replace(/[0-9]/g, (d) => faDigits[+d]);

// djb2 hash, base36 — any stable hash is fine
function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) { h = ((h << 5) + h) ^ str.charCodeAt(i); } return (h >>> 0).toString(36); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Province code -> [Farsi display name, accent colour]
const PROV_META = {
  ON: ['انتاریو (OINP)', '#0f766e'], BC: ['بریتیش کلمبیا (BC PNP)', '#1d4ed8'],
  AB: ['آلبرتا (AAIP)', '#c2410c'], SK: ['ساسکاچوان (SINP)', '#15803d'],
  MB: ['مانیتوبا (MPNP)', '#6d28d9'], NS: ['نوا اسکوشیا (NSNP)', '#0e7490'],
  NB: ['نیوبرانزویک (NBPNP)', '#b91c1c'], PE: ['جزیره پرنس ادوارد (PEI)', '#be185d'],
  NL: ['نیوفاندلند (NLPNP)', '#4338ca']
};

// ---- 1. fetch normalized data (use n8n helper, not global fetch) ----
const gs = await this.helpers.httpRequest({ method: 'GET', url: APPS_SCRIPT_URL, json: true });
const rounds = (gs.rounds || []).slice(0, EE_LIMIT);
const pnp = gs.pnpDraws || {};

// ---- 2. fingerprint DATA ONLY (timestamps excluded) ----
const sig = [];
sig.push('EE:' + rounds.map((r) => [r.drawNumber, r.drawDateFull, r.drawName, r.drawSize, r.drawCRS].join('~')).join('|'));
for (const c of Object.keys(PROV_META)) {
  const p = pnp[c] || {}; const rows = p.draws || [];
  sig.push('P-' + c + ':' + (p.stale ? 'S' : 'F') + ':' + rows.slice(0, 8).map((r) => [r.date, r.invitations, r.score, r.stream].join('~')).join('|'));
}
const fingerprint = hash(sig.join('||'));

// ---- 3. read current page + stored fingerprint (?context=edit -> content.raw) ----
const page = await this.helpers.httpRequest({ method: 'GET', url: WP_BASE + '?context=edit', headers: { Authorization: WP_AUTH }, json: true });
const cur = (page.content && page.content.raw) || '';
const fpM = cur.match(/draws-fingerprint:([a-z0-9]+)/i);

// ---- 4. unchanged? exit without writing ----
if (fpM && fpM[1] === fingerprint) {
  return [{ json: { updated: false, reason: 'no new draws — page left untouched', fingerprint } }];
}

// ---- 5. Express Entry as one unified table ----
const eeRows = rounds.map((r) =>
  `<tr><td>#${faN(r.drawNumber)}</td><td>${faN(r.drawDateFull)}</td><td class="dw-type">${esc(r.drawName)}</td><td>${faN(r.drawSize)}</td><td class="dw-crs">${faN(r.drawCRS)}</td></tr>`
).join('\n');
const eeTable = `<div class="dw-panel">
  <table class="dw-table dw-table--ee">
    <thead><tr><th>شماره</th><th>تاریخ</th><th>نوع قرعه‌کشی</th><th>تعداد دعوت‌نامه</th><th>حداقل امتیاز CRS</th></tr></thead>
    <tbody>
${eeRows}
    </tbody>
  </table>
</div>`;

// ---- 6. one card per province ----
function pnpCard(code) {
  const [fa, accent] = PROV_META[code];
  const prov = pnp[code] || {};
  const draws = prov.draws || [];
  const url = prov.url || '#';
  const stale = prov.stale !== false;

  if (!draws.length) {
    return `<div class="dw-cat dw-pnp" style="--accent:${accent}">
  <div class="dw-cat__head"><h3 class="dw-cat__title">${fa}</h3><span class="dw-latest-badge dw-pending">در انتظار داده</span></div>
  <div class="dw-pnp-empty">در حال حاضر داده تأییدشده‌ای موجود نیست. <a href="${url}" target="_blank" rel="nofollow noopener">بررسی در سایت رسمی ↗</a></div>
</div>`;
  }
  const latest = draws[0];
  const rows = draws.slice(0, 8).map((r) =>
    `<tr><td>${faN(r.date || '—')}</td><td class="dw-type">${esc(r.stream || '—')}</td><td>${faN(r.invitations || '—')}</td><td class="dw-crs">${faN(r.score || '—')}</td></tr>`
  ).join('');
  const badge = stale
    ? '<span class="dw-latest-badge" style="background:#fef3c7;color:#b45309">نیازمند بررسی</span>'
    : '<span class="dw-latest-badge" style="background:#dcfce7;color:#15803d">به‌روز</span>';
  const note = stale
    ? `<div class="dw-stale-note">⚠️ ممکن است این داده به‌روز نباشد. <a href="${url}" target="_blank" rel="nofollow noopener">تأیید در سایت رسمی ↗</a></div>` : '';

  return `<div class="dw-cat dw-pnp" style="--accent:${accent}">
  <div class="dw-cat__head"><h3 class="dw-cat__title">${fa}</h3>${badge}</div>
  <div class="dw-highlight">
    <div class="dw-hl-item"><span class="dw-hl-label">آخرین قرعه‌کشی</span><span class="dw-hl-val">${faN(latest.date || '—')}</span></div>
    <div class="dw-hl-item"><span class="dw-hl-label">دعوت‌نامه</span><span class="dw-hl-val">${faN(latest.invitations || '—')}</span></div>
    <div class="dw-hl-item"><span class="dw-hl-label">حداقل امتیاز</span><span class="dw-hl-val dw-hl-crs">${faN(latest.score || '—')}</span></div>
  </div>
  <table class="dw-table">
    <thead><tr><th>تاریخ</th><th>استریم</th><th>دعوت</th><th>امتیاز</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${note}
</div>`;
}
const pnpCards = Object.keys(PROV_META).map(pnpCard).join('\n');

// Human-facing timestamp = ACTUAL RUN TIME (not newest draw date)
const runStamp = new Date().toLocaleString('en-CA', {
  timeZone: 'America/Vancouver', month: 'long', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit'
}) + ' (PT)';

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

const html = `<!-- wp:html -->
<!-- draws-fingerprint:${fingerprint} -->
${CSS}
<div class="dw-wrap">
<div class="dw-hero">
<h2>آخرین قرعه‌کشی‌های مهاجرت به کانادا</h2>
<p>جدیدترین نتایج قرعه‌کشی‌های اکسپرس انتری (Express Entry) و برنامه‌های نامزدی استانی (PNP) کانادا.</p>
<span class="dw-updated">آخرین به‌روزرسانی: ${runStamp}</span>
</div>

<h2 class="dw-section-title">🍁 اکسپرس انتری (Express Entry)</h2>
${eeTable}

<h2 class="dw-section-title pnp">🏛️ برنامه‌های نامزدی استانی (PNP)</h2>
<div class="dw-grid">
${pnpCards}
</div>

<div class="dw-note">📌 داده‌های اکسپرس انتری از منبع رسمی IRCC و داده‌های استانی از سایت‌های رسمی هر استان به‌صورت خودکار دریافت می‌شوند. برای تصمیم‌گیری نهایی، همیشه منبع رسمی را بررسی کنید.</div>
</div>
<!-- /wp:html -->`;

// ---- 7. single write ----
const result = await this.helpers.httpRequest({
  method: 'POST', url: WP_BASE,
  headers: { Authorization: WP_AUTH, 'Content-Type': 'application/json' },
  body: { content: html }, json: true
});

return [{ json: {
  updated: true, reason: 'new draw data', pageId: result.id, runStamp, fingerprint,
  eeRows: rounds.length,
  latestEE: rounds[0] ? rounds[0].drawDateFull : null,
  bcLatest: (pnp.BC && pnp.BC.draws && pnp.BC.draws[0]) ? pnp.BC.draws[0].date : null,
  bcStale: pnp.BC ? pnp.BC.stale : null
} }];

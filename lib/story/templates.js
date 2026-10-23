// Story templates: the same page (headline, the source's screenshot, body,
// case name) dressed in a look that is trending on Instagram. "simple" is the
// team's own raw style and stays the default; the rest are chosen per story.
//
// Every template keeps the story rules: the screenshot is shown whole
// (object-fit: contain, never cropped or covered), no fact is added (the only
// fixed words are framing labels such as «خبر فوری»), no logo, and everything
// that must be read sits inside Instagram's safe area (260px top, 280px bottom).

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

// name: shown in the app. accent: whether the chosen background colour is used.
export const STORY_TEMPLATES = [
  { key: "simple", name: "ساده (پیش‌فرض)", accent: true },
  { key: "notes", name: "یادداشت آیفون", accent: false },
  { key: "tweet", name: "توییت", accent: true },
  { key: "breaking", name: "خبر فوری", accent: false },
  { key: "bignumber", name: "عدد بزرگ", accent: true },
  { key: "chat", name: "چت", accent: false },
  { key: "scrapbook", name: "دفترچه و چسب", accent: false },
  { key: "marker", name: "ماژیک هایلایت", accent: true },
  { key: "editorial", name: "مجله‌ای", accent: true },
  { key: "gradient", name: "گرادیان شیشه‌ای", accent: true },
  { key: "didyouknow", name: "میدونستی؟", accent: true },
];
export const TEMPLATE_KEYS = STORY_TEMPLATES.map((t) => t.key);
export function cleanTemplate(key) {
  return TEMPLATE_KEYS.includes(key) ? key : "simple";
}

// Headline and body sizes that keep long text inside the page.
function sizes(page, big = 64, small = 48) {
  const h = page.headline.length;
  const b = (page.body || "").length;
  return {
    h: h > 70 ? big - 12 : h > 45 ? big - 6 : big,
    b: b > 170 ? small - 8 : b > 110 ? small - 4 : small,
  };
}

const BASE = `*{box-sizing:border-box;margin:0;padding:0}
.t{position:relative;width:1080px;height:1920px;overflow:hidden;direction:rtl;font-family:'Inter','Vazirmatn',sans-serif}
.t .shot{display:block;width:100%;height:auto;max-height:var(--shotmax,760px);object-fit:contain;background:#fff}
.t .ref{direction:ltr;font-family:'Inter',sans-serif;font-weight:700;font-size:28px}`;

const head = (page) => esc(faDigits(page.headline));
const body = (page) => esc(faDigits(page.body || ""));
const shot = (page) => `<img class="shot" src="${esc(page.shot_url)}">`;
const ref = (page, style = "") => (page.ref ? `<div class="ref" style="${style}">${esc(page.ref)}</div>` : "");

// The first number in the headline (or body), with its unit, for the big-number look.
export function leadNumber(page) {
  const re = /([0-9۰-۹][0-9۰-۹,٬.\/]*)\s*(درصد|٪|%|هزار|میلیون|برابر|روز|ماه|سال|نفر|دلار)?/;
  const m = String(page.headline).match(re) || String(page.body || "").match(re);
  if (!m) return null;
  return { num: faDigits(m[1]), unit: m[2] || "" };
}

const T = {};

T.notes = (page) => {
  const s = sizes(page, 62, 44);
  return `<style>${BASE}
.notes{background:#fffdf7;padding:250px 64px 280px}
.notes .bar{display:flex;justify-content:space-between;align-items:center;direction:ltr;color:#e3a900;font-family:'Inter',sans-serif;font-size:40px;font-weight:600;margin-bottom:40px}
.notes .bar i{font-style:normal;letter-spacing:8px}
.notes h1{font-weight:800;font-size:${s.h}px;line-height:1.45;color:#111}
.notes .b{margin-top:26px;font-weight:500;font-size:${s.b}px;line-height:1.75;color:#222}
.notes .pic{margin-top:40px;border-radius:22px;overflow:hidden;border:1px solid #e8e2d4;--shotmax:720px}
.notes .ref{margin-top:28px;color:#8a8577}
.notes:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(to bottom,transparent 0 79px,#f1ead8 79px 80px);opacity:.6;pointer-events:none}
.notes>*{position:relative}</style>
<div class="t notes"><div class="bar"><span>‹ Notes</span><i>⋯</i></div>
<h1>${head(page)}</h1>${page.body ? `<div class="b">${body(page)}</div>` : ""}<div class="pic">${shot(page)}</div>${ref(page)}</div>`;
};

T.tweet = (page, c) => {
  const s = sizes(page, 52, 42);
  return `<style>${BASE}
.tw{background:${c.bg};display:flex;align-items:center;justify-content:center;padding:250px 50px 280px}
.tw .card{width:100%;background:#fff;border-radius:40px;padding:44px 46px;box-shadow:0 30px 70px rgba(0,0,0,.25)}
.tw .who{display:flex;align-items:center;gap:20px;direction:ltr;margin-bottom:28px}
.tw .av{width:96px;height:96px;border-radius:50%;background:${c.bg === "#ffffff" ? "#111" : c.bg};color:#fff;font:800 48px 'Inter';display:flex;align-items:center;justify-content:center}
.tw .nm{font:800 38px 'Inter';color:#0f1419;display:flex;align-items:center;gap:8px}
.tw .hd{font:500 32px 'Inter';color:#536471;margin-top:4px}
.tw h1{font-weight:700;font-size:${s.h}px;line-height:1.5;color:#0f1419}
.tw .b{margin-top:18px;font-weight:500;font-size:${s.b}px;line-height:1.6;color:#0f1419}
.tw .pic{margin-top:30px;border-radius:28px;overflow:hidden;border:1px solid #cfd9de;--shotmax:640px}
.tw .acts{display:flex;justify-content:space-between;direction:ltr;margin-top:28px;padding:0 20px;color:#536471;font:500 34px 'Inter'}
.tw .ref{margin-top:22px;color:#536471}</style>
<div class="t tw"><div class="card">
<div class="who"><div class="av">S</div><div><div class="nm">Sugimoto Visa <svg width="34" height="34" viewBox="0 0 24 24"><path fill="#1d9bf0" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg></div><div class="hd">@sugimotovisa</div></div></div>
<h1>${head(page)}</h1>${page.body ? `<div class="b">${body(page)}</div>` : ""}
<div class="pic">${shot(page)}</div>${ref(page)}
<div class="acts"><span>💬</span><span>🔁</span><span>♡</span><span>⇪</span></div>
</div></div>`;
};

T.breaking = (page, c, story) => {
  const s = sizes(page, 76, 44);
  const label = story.evergreen ? "نکته مهم" : "خبر فوری";
  return `<style>${BASE}
.br{background:#0b0b0d;padding:250px 60px 280px;display:flex;flex-direction:column;justify-content:center}
.br .tag{align-self:flex-start;display:flex;align-items:center;gap:16px;background:#e11d2e;color:#fff;font:400 50px 'Lalezar','Vazirmatn';padding:10px 30px 4px;border-radius:12px}
.br .tag i{width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 8px rgba(255,255,255,.25)}
.br h1{margin-top:34px;font:400 ${s.h}px/1.35 'Lalezar','Vazirmatn';color:#fff}
.br .pic{margin-top:40px;border-radius:18px;overflow:hidden;border-right:10px solid #e11d2e;--shotmax:700px}
.br .b{margin-top:40px;font-weight:800;font-size:${s.b}px;line-height:1.65}
.br .b span{background:#ffd60a;color:#111;padding:8px 18px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.br .ref{margin-top:28px;color:#b8b8bd}</style>
<div class="t br"><div class="tag"><i></i>${label}</div><h1>${head(page)}</h1><div class="pic">${shot(page)}</div>
${page.body ? `<div class="b"><span>${body(page)}</span></div>` : ""}${ref(page)}</div>`;
};

T.bignumber = (page, c) => {
  const n = leadNumber(page);
  const s = sizes(page, 56, 42);
  return `<style>${BASE}
.bn{background:${c.bg};color:${c.text};padding:250px 70px 280px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.bn .n{font:400 ${n && n.num.length > 5 ? 230 : 300}px/1 'Lalezar','Vazirmatn';color:${c.text};text-shadow:0 8px 0 rgba(0,0,0,.12)}
.bn .u{font:400 70px/1.2 'Lalezar','Vazirmatn';color:${c.text};opacity:.92;margin-top:6px}
.bn h1{margin-top:30px;font-weight:800;font-size:${s.h}px;line-height:1.45}
.bn .pic{margin-top:40px;border-radius:24px;overflow:hidden;--shotmax:${n ? 560 : 700}px;border:2px solid ${c.edge || "transparent"}}
.bn .b{margin-top:34px;font-weight:600;font-size:${s.b}px;line-height:1.6;opacity:.95}
.bn .ref{margin-top:24px;opacity:.85}</style>
<div class="t bn">${n ? `<div class="n">${esc(n.num)}</div>${n.unit ? `<div class="u">${esc(n.unit)}</div>` : ""}` : ""}
<h1>${head(page)}</h1><div class="pic">${shot(page)}</div>${page.body ? `<div class="b">${body(page)}</div>` : ""}${ref(page)}</div>`;
};

T.chat = (page) => {
  const s = sizes(page, 50, 44);
  return `<style>${BASE}
.ch{background:#ffffff;padding:250px 44px 280px;display:flex;flex-direction:column}
.ch .top{display:flex;flex-direction:column;align-items:center;gap:10px;padding-bottom:28px;border-bottom:1px solid #ececf0;margin-bottom:34px}
.ch .av{width:110px;height:110px;border-radius:50%;background:linear-gradient(#a6a6b0,#8a8a94);color:#fff;font:700 50px 'Inter';display:flex;align-items:center;justify-content:center}
.ch .nm{font:600 32px 'Inter';color:#111}
.ch .row{display:flex;justify-content:flex-end;margin-bottom:18px}
.ch .bub{max-width:86%;background:#e9e9eb;color:#111;border-radius:44px;padding:26px 36px;font-weight:600;font-size:${s.b}px;line-height:1.55}
.ch .bub.h{font-weight:800;font-size:${s.h}px}
.ch .bub.pic{padding:0;overflow:hidden;background:#fff;border:1px solid #e3e3e6;width:92%;max-width:92%;--shotmax:700px}
.ch .ref{align-self:flex-end;color:#8e8e93;margin-top:6px}</style>
<div class="t ch"><div class="top"><div class="av">S</div><div class="nm">Sugimoto Visa ›</div></div>
<div class="row"><div class="bub h">${head(page)}</div></div>
<div class="row"><div class="bub pic">${shot(page)}</div></div>
${page.body ? `<div class="row"><div class="bub">${body(page)}</div></div>` : ""}${ref(page)}</div>`;
};

T.scrapbook = (page) => {
  const s = sizes(page, 70, 44);
  return `<style>${BASE}
.sb{background:#eadcc4;background-image:radial-gradient(rgba(120,90,50,.08) 1px,transparent 1px);background-size:14px 14px;padding:250px 70px 280px;display:flex;flex-direction:column;justify-content:center}
.sb h1{font:400 ${s.h}px/1.4 'Lalezar','Vazirmatn';color:#3b2a1a;text-align:center}
.sb .paper{position:relative;margin:56px 10px 0;background:#fff;padding:22px;transform:rotate(-1.6deg);box-shadow:0 18px 40px rgba(60,40,20,.25);--shotmax:680px}
.sb .tape{position:absolute;width:190px;height:54px;background:rgba(255,231,140,.75);top:-26px}
.sb .tape.a{left:40px;transform:rotate(-6deg)}.sb .tape.b{right:40px;transform:rotate(5deg)}
.sb .note{margin:54px 20px 0;background:#fffef6;padding:30px 36px;transform:rotate(1.2deg);box-shadow:0 10px 26px rgba(60,40,20,.2);font-weight:700;font-size:${s.b}px;line-height:1.6;color:#2b2016}
.sb .ref{margin-top:30px;text-align:center;color:#6b5236}</style>
<div class="t sb"><h1>${head(page)}</h1><div class="paper"><span class="tape a"></span><span class="tape b"></span>${shot(page)}</div>
${page.body ? `<div class="note">${body(page)}</div>` : ""}${ref(page)}</div>`;
};

T.marker = (page, c) => {
  const s = sizes(page, 66, 44);
  const hl = c.bg === "#ffffff" || c.bg === "#000000" ? "#ffe14d" : c.bg;
  return `<style>${BASE}
.mk{background:#fbfbf8;background-image:linear-gradient(#ececec 1px,transparent 1px),linear-gradient(90deg,#ececec 1px,transparent 1px);background-size:54px 54px;padding:250px 70px 280px;display:flex;flex-direction:column;justify-content:center}
.mk h1{font-weight:900;font-size:${s.h}px;line-height:1.6;color:#111}
.mk h1 span{background:linear-gradient(transparent 52%,${hl}cc 52%,${hl}cc 92%,transparent 92%);box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 6px}
.mk .pic{margin-top:46px;border:3px dashed #222;border-radius:20px;padding:14px;background:#fff;--shotmax:700px}
.mk .pic img{border-radius:10px}
.mk .b{margin-top:40px;font-weight:600;font-size:${s.b}px;line-height:1.7;color:#222;border-right:10px solid ${hl};padding-right:24px}
.mk .ref{margin-top:26px;color:#555}</style>
<div class="t mk"><h1><span>${head(page)}</span></h1><div class="pic">${shot(page)}</div>${page.body ? `<div class="b">${body(page)}</div>` : ""}${ref(page)}</div>`;
};

T.editorial = (page, c) => {
  const s = sizes(page, 74, 44);
  const block = c.bg === "#ffffff" ? "#111111" : c.bg;
  return `<style>${BASE}
.ed{background:#f7f4ee}
.ed .blk{position:absolute;left:0;right:0;top:0;height:930px;background:${block}}
.ed .in{position:absolute;inset:250px 70px 280px;display:flex;flex-direction:column}
.ed .kick{font:600 30px 'Inter';letter-spacing:6px;color:rgba(255,255,255,.8);direction:ltr;text-align:right}
.ed .rule{height:3px;background:rgba(255,255,255,.7);margin:22px 0 30px}
.ed h1{font:700 ${s.h + 6}px/1.35 'Markazi Text','Vazirmatn';color:#fff}
.ed .pic{margin-top:44px;background:#fff;padding:16px;box-shadow:0 26px 60px rgba(0,0,0,.25);--shotmax:640px}
.ed .b{margin-top:40px;font:500 ${s.b + 4}px/1.65 'Markazi Text','Vazirmatn';color:#1d1d1f}
.ed .ref{margin-top:22px;color:#6e6e73}</style>
<div class="t ed"><div class="blk"></div><div class="in"><div class="kick">SUGIMOTO VISA · BRIEF</div><div class="rule"></div>
<h1>${head(page)}</h1><div class="pic">${shot(page)}</div>${page.body ? `<div class="b">${body(page)}</div>` : ""}${ref(page)}</div></div>`;
};

T.gradient = (page, c) => {
  const s = sizes(page, 64, 44);
  const base = c.bg === "#ffffff" || c.bg === "#000000" ? "#6a3df0" : c.bg;
  return `<style>${BASE}
.gr{background:radial-gradient(circle at 15% 10%,#ff7ab6 0,transparent 42%),radial-gradient(circle at 90% 35%,#5ec8ff 0,transparent 40%),radial-gradient(circle at 30% 95%,#ffd36b 0,transparent 45%),${base};padding:250px 60px 280px;display:flex;flex-direction:column;justify-content:center}
.gr h1{font-weight:900;font-size:${s.h}px;line-height:1.45;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.25);text-align:center}
.gr .pic{margin-top:46px;border-radius:30px;overflow:hidden;box-shadow:0 0 0 6px rgba(255,255,255,.35),0 30px 70px rgba(0,0,0,.3);--shotmax:700px}
.gr .glass{margin-top:44px;background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.45);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:34px;padding:30px 38px;font-weight:700;font-size:${s.b}px;line-height:1.6;color:#fff}
.gr .ref{margin-top:24px;color:#fff;opacity:.9;text-align:center}</style>
<div class="t gr"><h1>${head(page)}</h1><div class="pic">${shot(page)}</div>${page.body ? `<div class="glass">${body(page)}</div>` : ""}${ref(page)}</div>`;
};

T.didyouknow = (page, c) => {
  const s = sizes(page, 60, 46);
  return `<style>${BASE}
.dk{background:${c.bg};padding:250px 64px 280px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.dk .st{background:#ffd60a;color:#111;font:400 78px/1.2 'Lalezar','Vazirmatn';padding:14px 46px 6px;border-radius:28px;transform:rotate(-4deg);box-shadow:0 12px 0 rgba(0,0,0,.18)}
.dk h1{margin-top:44px;font-weight:800;font-size:${s.h}px;line-height:1.62}
.dk h1 span{background:${c.box};color:${c.boxText};padding:8px 22px;border-radius:16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.dk .pic{margin-top:44px;width:100%;border-radius:22px;overflow:hidden;border:2px solid ${c.edge || "transparent"};--shotmax:680px}
.dk .b{margin-top:36px;font-weight:700;font-size:${s.b}px;line-height:1.6;color:${c.text}}
.dk .ref{margin-top:24px;color:${c.text};opacity:.85}</style>
<div class="t dk"><div class="st">میدونستی؟</div><h1><span>${head(page)}</span></h1><div class="pic">${shot(page)}</div>
${page.body ? `<div class="b">${body(page)}</div>` : ""}${ref(page)}</div>`;
};

// HTML for a page in a template other than "simple" (index.js draws simple).
export function templatePageHtml(key, page, total, story, colours) {
  const fn = T[key];
  return fn ? fn(page, colours, story) : null;
}

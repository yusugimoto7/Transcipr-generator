// Story templates. "simple" is the team's own raw style (drawn in index.js)
// and stays the default. Every template writes its Persian in the same font, Vazirmatn, and its few
// Latin labels in Inter (Hamed, Oct 27 2026: the same font in every story, only the design changes).
// The others are the ready-made Canva story designs
// Hamed picked on Oct 23 2026 (numbers from the gallery he chose from: 2-12,
// 16-19), redrawn here in HTML with Persian text.
//
// Every page keeps the story rules whatever the look: the source's own
// screenshot is shown whole (object-fit: contain, never cropped or covered)
// because it is the proof; no fact is added (fixed words are only framing
// labels such as «خبر فوری»); everything to be read sits inside Instagram's
// safe area (260px top, 280px bottom; backgrounds may run to the edges).
// Where a design has a photo, it is an AI illustration of the subject
// (lib/story/photo.js), changeable per page; `photo` gives its shape and
// `look` its kind. Without a picture yet, the slot shows a plain colour.

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Set for the page being drawn: an English story keeps Latin digits.
let latin = false;
const faDigits = (s) => (latin ? String(s) : String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]));

// The templates' fixed framing labels, for an English story (longest first, so «خبر فوری» is not
// read as «خبر»).
const EN_LABELS = [
  ["📢 توجه", "📢 Attention"], ["خبر فوری", "Breaking"], ["نکته مهم", "Key point"], ["خبر تازه", "Latest"],
  ["میدونستی؟", "Did you know?"], ["منبع: ", "Source: "], ["هشدار", "Alert"], ["بولتن", "Bulletin"],
  ["آپدیت", "Update"], ["نکته", "Tip"], [">خبر<", ">News<"],
];

export const STORY_TEMPLATES = [
  { key: "simple", name: "ساده (پیش‌فرض)" },
  { key: "c2", name: "کارت خبر روی عکس", photo: "portrait", look: "photo" },
  { key: "c3", name: "صفحه سایت خبری", photo: "landscape", look: "bw" },
  { key: "c4", name: "توجه" },
  { key: "c5", name: "خبر فوری", photo: "landscape", look: "photo" },
  { key: "c6", name: "رسمی و آرام" },
  { key: "c7", name: "خبر محلی", photo: "landscape", look: "photo" },
  { key: "c8", name: "میدونستی؟ تیره", photo: "portrait", look: "photo" },
  { key: "c9", name: "میدونستی؟ درشت", photo: "landscape", look: "bw" },
  { key: "c10", name: "میدونستی؟ کاغذی", photo: "square", look: "illustration" },
  { key: "c11", name: "مجله", photo: "landscape", look: "photo" },
  { key: "c12", name: "هشدار", photo: "landscape", look: "photo" },
  { key: "c16", name: "بولتن", photo: "landscape", look: "photo" },
  { key: "c17", name: "موج قرمز", photo: "landscape", look: "bw" },
  { key: "c18", name: "آپدیت سرمه‌ای", photo: "landscape", look: "photo" },
  { key: "c19", name: "تابلوئید", photo: "landscape", look: "bw" },
];
export const TEMPLATE_KEYS = STORY_TEMPLATES.map((t) => t.key);
export function cleanTemplate(key) {
  return TEMPLATE_KEYS.includes(key) ? key : "simple";
}
export function templateMeta(key) {
  return STORY_TEMPLATES.find((t) => t.key === cleanTemplate(key)) || STORY_TEMPLATES[0];
}

// Headline / body sizes that keep long text inside the page.
function fit(text, big, steps = [45, 70, 95]) {
  const n = String(text || "").length;
  return n > steps[2] ? big - 18 : n > steps[1] ? big - 12 : n > steps[0] ? big - 6 : big;
}

const BASE = `*{box-sizing:border-box;margin:0;padding:0}
.t{position:relative;width:1080px;height:1920px;overflow:hidden;direction:rtl;font-family:'Vazirmatn','Inter',sans-serif}
.in{position:absolute;top:250px;bottom:280px;left:64px;right:64px;display:flex;flex-direction:column}
.shot{display:block;width:100%;height:auto;min-height:0;object-fit:contain;object-position:top;background:#fff}
.ph{background-color:var(--phbg,#cfd3d8);background-size:cover;background-position:center}
.lat{direction:ltr;font-family:'Inter',sans-serif}
.ref{direction:ltr;font-family:'Inter',sans-serif;font-weight:700;font-size:26px}`;

const H = (p) => esc(faDigits(p.headline));
const B = (p) => esc(faDigits(p.body || ""));
const shot = (p, style = "") => `<img class="shot" style="${style}" src="${esc(p.shot_url)}">`;
const ph = (p, cls, style = "") => `<div class="ph ${cls}" style="${p.photo_url ? `background-image:url('${esc(p.photo_url)}');` : ""}${style}"></div>`;
const ref = (p, style = "") => (p.ref ? `<div class="ref" style="${style}">${esc(p.ref)}</div>` : "");
const label = (story) => esc(story.source_label || "");
const isNews = (story) => !story.evergreen;

const T = {};

// 2 · White news card over a full-bleed photo; the screenshot on its own card below.
T.c2 = (p, story) => `<style>${BASE}
.c2 .bg{position:absolute;inset:0}
.c2 .card{background:#fff;border-radius:10px;padding:40px 44px;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.c2 .row{display:flex;justify-content:space-between;color:#c2410c;font-size:28px;font-weight:700;border-bottom:2px solid #f3e1d6;padding-bottom:16px;margin-bottom:22px}
.c2 h1{font-weight:800;font-size:${fit(p.headline, 64)}px;line-height:1.38;color:#111}
.c2 .b{margin-top:18px;font-size:${fit(p.body, 38, [110, 170, 230])}px;line-height:1.65;color:#333;font-weight:500}
.c2 .sc{margin-top:auto;background:#fff;border-radius:10px;padding:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);min-height:0;display:flex}
.c2 .sc .shot{max-height:620px}
.c2 .ref{color:#c2410c;margin-top:16px}</style>
<div class="t c2">${ph(p, "bg")}<div class="in">
<div class="card"><div class="row"><span>${isNews(story) ? "خبر" : "نکته"}</span><span class="lat">NEWS</span></div><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}${ref(p)}</div>
<div class="sc">${shot(p)}</div></div></div>`;

// 3 · A news website's article page: nav bar, date row, photo, serif headline, drop-cap paragraph.
T.c3 = (p, story) => `<style>${BASE}
.c3{background:#f4f3ef}
.c3 .nav{display:flex;justify-content:space-between;align-items:center;font-size:34px;color:#222;border-bottom:2px solid #d9d6cf;padding-bottom:18px}
.c3 .nav b{font:700 30px 'Inter';letter-spacing:6px}
.c3 .meta{display:flex;gap:0;margin:18px 0;border:2px solid #d9d6cf;font-size:24px;color:#666}
.c3 .meta span{flex:1;padding:12px 18px}.c3 .meta span+span{border-right:2px solid #d9d6cf}
.c3 .frame{border:2px solid #d9d6cf;background:#fff;padding:14px;display:flex;flex-direction:column;gap:14px;min-height:0;flex:1 1 auto}
.c3 .photo{height:300px;flex:0 0 auto;filter:grayscale(1)}
.c3 h1{font:500 ${fit(p.headline, 58)}px/1.35 'Vazirmatn';color:#222}
.c3 .b{font:400 ${fit(p.body, 34, [110, 170, 230])}px/1.6 'Vazirmatn';color:#444}
.c3 .b:first-letter{font-size:2.2em;float:right;line-height:1;margin-left:10px}
.c3 .shot{max-height:430px;border:1px solid #e3e0d8}
.c3 .foot{margin-top:18px;background:#d9e8e6;text-align:center;padding:18px;font:600 24px 'Inter';letter-spacing:5px;color:#37514f}
.c3 .ref{color:#666}</style>
<div class="t c3"><div class="in">
<div class="nav"><span>☰</span><b>SUGIMOTO · NEWS</b><span>⌕</span></div>
<div class="meta"><span>${label(story) || "خبر"}</span><span>${esc(story.date ? faDigits(story.date) : "")}</span></div>
<div class="frame">${ph(p, "photo")}<h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}${shot(p)}${ref(p)}</div>
<div class="foot">SUGIMOTOVISA.COM</div></div></div>`;

// 4 · Attention: deep red, a megaphone badge, a big white box holding the headline and screenshot.
T.c4 = (p) => `<style>${BASE}
.c4{background:radial-gradient(circle at 50% 30%,#c62828 0,#8e1414 60%,#6d0f0f 100%)}
.c4 .badge{align-self:center;display:flex;align-items:center;gap:16px;background:#fff;border:6px solid #b71c1c;border-radius:22px;padding:10px 36px 4px;color:#b71c1c;font:900 76px/1.2 'Vazirmatn';transform:rotate(-3deg);box-shadow:0 12px 0 rgba(0,0,0,.2)}
.c4 .box{margin-top:44px;background:#fff;border:8px solid #fff;outline:4px solid rgba(255,255,255,.5);outline-offset:10px;border-radius:30px;padding:34px 36px;display:flex;flex-direction:column;gap:24px;min-height:0;flex:1 1 auto}
.c4 h1{font:900 ${fit(p.headline, 70)}px/1.35 'Vazirmatn';color:#1a1a1a;text-align:center}
.c4 .shot{max-height:600px;border:2px solid #eee;border-radius:10px}
.c4 .b{margin-top:34px;color:#fff;font-weight:700;font-size:${fit(p.body, 40, [110, 170, 230])}px;line-height:1.6;text-align:center}
.c4 .h{margin-top:22px;text-align:center;color:#fff;font:700 32px 'Inter'}
.c4 .ref{color:#c62828;text-align:center}</style>
<div class="t c4"><div class="in"><div class="badge">📢 توجه</div>
<div class="box"><h1>${H(p)}</h1>${shot(p)}${ref(p)}</div>
${p.body ? `<div class="b">${B(p)}</div>` : ""}<div class="h lat">@sugimotovisa</div></div></div>`;

// 5 · TV breaking news: navy grid, LIVE tag, big italic title, framed photo, date chip, caption box.
T.c5 = (p, story) => `<style>${BASE}
.c5{background:#0b1430;background-image:linear-gradient(rgba(255,255,255,.05) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.05) 2px,transparent 2px);background-size:90px 90px}
.c5 .live{align-self:flex-end;background:#e11d2e;color:#fff;font:800 30px 'Inter';padding:6px 18px;border-radius:10px;direction:ltr}
.c5 .ttl{font:900 ${isNews(story) ? 120 : 104}px/1.1 'Vazirmatn';color:#fff;transform:skewX(-8deg);text-shadow:6px 6px 0 #e11d2e;margin:10px 0 26px}
.c5 .photo{height:330px;flex:0 0 auto;border:8px solid #e11d2e;--phbg:#1d2a55}
.c5 .date{align-self:center;margin-top:-26px;background:#e11d2e;color:#fff;font-weight:800;font-size:30px;padding:8px 26px;border-radius:8px;position:relative}
.c5 .cap{margin-top:22px;background:#fff;padding:24px 30px;border-radius:6px}
.c5 h1{font-weight:900;font-size:${fit(p.headline, 50)}px;line-height:1.4;color:#0b1430}
.c5 .b{margin-top:10px;font-weight:500;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.55;color:#333}
.c5 .shot{margin-top:22px;max-height:420px;border-radius:6px}
.c5 .ref{color:#9fb0d8;margin-top:12px}</style>
<div class="t c5"><div class="in"><div class="live">● LIVE</div><div class="ttl">${isNews(story) ? "خبر فوری" : "نکته مهم"}</div>
${ph(p, "photo")}${story.date ? `<div class="date">${esc(faDigits(story.date))}</div>` : ""}
<div class="cap"><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}</div>${shot(p)}${ref(p)}</div></div>`;

// 6 · Quiet and formal: ivory, serif headline between two rules, small centred text, a pill.
T.c6 = (p) => `<style>${BASE}
.c6{background:#efece4;text-align:center}
.c6 .rule{height:2px;background:#3a3a3a;opacity:.7}
.c6 .k{font:400 56px/1.2 'Vazirmatn';color:#333;margin-top:34px}
.c6 h1{font:600 ${fit(p.headline, 70)}px/1.3 'Vazirmatn';color:#1f1f1f;margin:10px 0 34px}
.c6 .shot{margin-top:40px;max-height:640px;border:1px solid #d6d1c4}
.c6 .b{margin-top:38px;font:400 ${fit(p.body, 34, [110, 170, 230])}px/1.75 'Vazirmatn';color:#4a4a4a;padding:0 40px}
.c6 .pill{align-self:center;margin-top:auto;border:2px solid #333;border-radius:99px;padding:12px 44px;font:500 28px 'Inter';color:#333}
.c6 .ref{color:#666;margin-top:16px}</style>
<div class="t c6"><div class="in"><div class="rule"></div><div class="k">خبر تازه</div><h1>${H(p)}</h1><div class="rule"></div>
${shot(p)}${p.body ? `<div class="b">${B(p)}</div>` : ""}${ref(p)}<div class="pill lat">sugimotovisa.com</div></div></div>`;

// 7 · Clean local news: cream, red block with a white serif headline, photo below with the screenshot on it.
T.c7 = (p, story) => `<style>${BASE}
.c7{background:#f8f1e7}
.c7 .bot{position:absolute;left:0;right:0;bottom:0;height:820px}
.c7 .top{display:flex;justify-content:space-between;font:700 24px 'Inter';color:#555}
.c7 .top span:first-child{background:#e6e6f0;border-radius:99px;padding:6px 16px}
.c7 .blk{margin-top:22px;background:#e53935;border-radius:34px;padding:34px 40px}
.c7 h1{font:700 ${fit(p.headline, 62)}px/1.3 'Vazirmatn';color:#fff}
.c7 .b{margin-top:22px;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.65;color:#333;font-weight:500}
.c7 .sc{margin-top:30px;background:#fff;padding:14px;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.25);position:relative;min-height:0;display:flex}
.c7 .shot{max-height:560px}
.c7 .ref{color:#555;margin-top:12px}</style>
<div class="t c7">${ph(p, "bot")}<div class="in"><div class="top"><span class="lat">SUGIMOTO NEWS</span><span>${esc(story.date ? faDigits(story.date) : "")}</span></div>
<div class="blk"><h1>${H(p)}</h1></div>${p.body ? `<div class="b">${B(p)}</div>` : ""}${ref(p)}<div class="sc">${shot(p)}</div></div></div>`;

// 8 · Dark, elegant "did you know": photo full-bleed and darkened, a translucent panel.
T.c8 = (p) => `<style>${BASE}
.c8 .bg{position:absolute;inset:0;filter:brightness(.55) saturate(.9);--phbg:#1f3a2c}
.c8 .panel{background:rgba(10,20,15,.45);border:2px solid rgba(255,255,255,.25);border-radius:26px;padding:38px 40px;text-align:center;color:#fff}
.c8 .heart{font-size:54px}
.c8 .k{font:500 96px/1.15 'Vazirmatn';margin:6px 0 20px}
.c8 h1{font-weight:700;font-size:${fit(p.headline, 50)}px;line-height:1.5}
.c8 .b{margin-top:16px;font-weight:400;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.65;opacity:.95}
.c8 .shot{margin-top:30px;max-height:560px;border-radius:14px}
.c8 .h{margin-top:auto;text-align:center;color:#fff;font:500 28px 'Inter';opacity:.85}
.c8 .ref{color:#fff;opacity:.85;margin-top:12px}</style>
<div class="t c8">${ph(p, "bg")}<div class="in"><div class="panel"><div class="heart">♥</div><div class="k">میدونستی؟</div><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}</div>
${shot(p)}${ref(p, "text-align:center")}<div class="h lat">@sugimotovisa</div></div></div>`;

// 9 · Bold "did you know": huge blue title on light grey, fact in blue, a black-and-white photo at the foot.
T.c9 = (p) => `<style>${BASE}
.c9{background:#e9eaec;text-align:center}
.c9 .k{font:900 150px/1.05 'Vazirmatn';color:#1d4ed8}
.c9 h1{margin-top:20px;font-weight:800;font-size:${fit(p.headline, 50)}px;line-height:1.45;color:#1d4ed8}
.c9 .b{margin-top:14px;font-weight:500;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.6;color:#334}
.c9 .h{margin-top:16px;font:500 26px 'Inter';color:#1d4ed8}
.c9 .shot{margin-top:28px;max-height:470px;border-radius:8px}
.c9 .foot{position:absolute;left:0;right:0;bottom:0;height:520px;filter:grayscale(1);-webkit-mask-image:linear-gradient(transparent,#000 35%);mask-image:linear-gradient(transparent,#000 35%)}
.c9 .ref{color:#556;margin-top:10px}</style>
<div class="t c9">${ph(p, "foot")}<div class="in"><div class="k">میدونستی؟</div><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}<div class="h lat">@sugimotovisa</div>${shot(p)}${ref(p)}</div></div>`;

// 10 · Coral with a tilted white paper: heavy green title, one line of fact, an illustration.
T.c10 = (p) => `<style>${BASE}
.c10{background:#f05a4f}
.c10 .paper{background:#fff;transform:rotate(-2deg);padding:44px 40px;border-radius:6px;box-shadow:0 18px 40px rgba(0,0,0,.18);text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;min-height:0;flex:1 1 auto}
.c10 .k{font:900 104px/1.1 'Vazirmatn';color:#2e7d32}
.c10 h1{font-weight:800;font-size:${fit(p.headline, 46)}px;line-height:1.45;color:#1b1b1b}
.c10 .ill{width:300px;height:300px;flex:0 0 auto;--phbg:#fff;background-size:contain;background-repeat:no-repeat}
.c10 .shot{max-height:430px;border:1px solid #eee}
.c10 .b{margin-top:30px;color:#fff;font-weight:700;font-size:${fit(p.body, 34, [110, 170, 230])}px;line-height:1.6;text-align:center}
.c10 .h{margin-top:14px;text-align:center;color:#fff;font:500 28px 'Inter'}
.c10 .ref{color:#555}</style>
<div class="t c10"><div class="in"><div class="paper"><div class="k">میدونستی؟</div><h1>${H(p)}</h1>${ph(p, "ill")}${shot(p)}${ref(p)}</div>
${p.body ? `<div class="b">${B(p)}</div>` : ""}<div class="h lat">@sugimotovisa</div></div></div>`;

// 11 · Magazine feature: white page, spaced masthead, landscape photo, serif headline beside a thin rule.
T.c11 = (p) => `<style>${BASE}
.c11{background:#fff}
.c11 .mast{text-align:center;font:700 32px 'Inter';letter-spacing:10px;color:#111}
.c11 .hd{text-align:center;font:500 22px 'Inter';color:#777;margin:6px 0 24px}
.c11 .photo{height:380px;flex:0 0 auto}
.c11 .txt{margin-top:34px;border-right:3px solid #111;padding-right:28px}
.c11 h1{font:500 ${fit(p.headline, 66)}px/1.3 'Vazirmatn';color:#111}
.c11 .b{margin-top:14px;font:400 ${fit(p.body, 36, [110, 170, 230])}px/1.55 'Vazirmatn';color:#333}
.c11 .shot{margin-top:30px;max-height:480px;border:1px solid #e5e5e5}
.c11 .ref{color:#777;margin-top:12px}</style>
<div class="t c11"><div class="in"><div class="mast">SUGIMOTO VISA</div><div class="hd">@sugimotovisa</div>${ph(p, "photo")}
<div class="txt"><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}</div>${shot(p)}${ref(p)}</div></div>`;

// 12 · Loud caution poster: black, hazard stripes, huge yellow title, yellow-framed photo.
T.c12 = (p) => `<style>${BASE}
.c12{background:#0e0e0e}
.c12:before{content:"";position:absolute;inset:0;border:44px solid transparent;border-image:repeating-linear-gradient(45deg,#ffcc00 0 40px,#111 40px 80px) 44}
.c12 .k{font:900 150px/1 'Vazirmatn';color:#ffcc00}
.c12 .photo{margin-top:24px;height:330px;flex:0 0 auto;border:6px solid #ffcc00;--phbg:#2a2a2a}
.c12 h1{margin-top:26px;font:900 ${fit(p.headline, 58)}px/1.35 'Vazirmatn';color:#ffcc00}
.c12 .b{margin-top:10px;font-weight:600;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.6;color:#e6e6e6}
.c12 .shot{margin-top:24px;max-height:420px}
.c12 .bar{margin-top:auto;display:flex;justify-content:space-between;align-items:center;color:#ffcc00;font:600 22px 'Inter'}
.c12 .bar i{width:220px;height:60px;background:repeating-linear-gradient(90deg,#ffcc00 0 4px,transparent 4px 8px,#ffcc00 8px 10px,transparent 10px 16px)}
.c12 .ref{color:#ffcc00;margin-top:10px}</style>
<div class="t c12"><div class="in"><div class="k">هشدار</div>${ph(p, "photo")}<h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}${shot(p)}${ref(p)}
<div class="bar"><span class="lat">@sugimotovisa</span><i></i></div></div></div>`;

// 16 · Official bulletin: photo on the top half, a white rounded card with a blue pill, deep blue footer.
T.c16 = (p, story) => `<style>${BASE}
.c16{background:#0f3d91}
.c16 .top{position:absolute;left:0;right:0;top:0;height:900px}
.c16 .card{margin-top:430px;background:#fff;border-radius:28px;padding:30px 36px;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center}
.c16 .pill{display:inline-block;background:#1d4ed8;color:#fff;font-weight:700;font-size:28px;padding:6px 26px;border-radius:99px}
.c16 h1{margin-top:16px;font-weight:800;font-size:${fit(p.headline, 50)}px;line-height:1.4;color:#111}
.c16 .b{margin-top:12px;font-size:${fit(p.body, 30, [110, 170, 230])}px;line-height:1.6;color:#444}
.c16 .shot{margin-top:24px;max-height:430px;border-radius:12px}
.c16 .foot{margin-top:auto;display:flex;justify-content:space-between;color:#fff;font-size:24px;font-weight:600}
.c16 .ref{color:#cfe0ff;margin-top:10px}</style>
<div class="t c16">${ph(p, "top")}<div class="in"><div class="card"><span class="pill">بولتن</span><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}</div>
${shot(p)}${ref(p)}<div class="foot"><span>منبع: ${label(story)}</span><span class="lat">@sugimotovisa</span></div></div></div>`;

// 17 · Red block with a wavy edge and a white serif headline, black-and-white photo underneath.
T.c17 = (p) => `<style>${BASE}
.c17{background:#111}
.c17 .bot{position:absolute;left:0;right:0;bottom:0;height:1020px;filter:grayscale(1) contrast(1.1)}
.c17 .red{position:absolute;left:0;right:0;top:0;height:980px;background:#c8102e}
.c17 .wave{position:absolute;left:0;right:0;top:950px;height:120px}
.c17 h1{font:700 ${fit(p.headline, 66)}px/1.3 'Vazirmatn';color:#fff}
.c17 .b{margin-top:20px;font-size:${fit(p.body, 32, [110, 170, 230])}px;line-height:1.65;color:#fff;font-weight:500;text-align:justify}
.c17 .sc{margin-top:34px;background:#fff;padding:12px;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,.4);position:relative;min-height:0;display:flex}
.c17 .shot{max-height:640px}
.c17 .ref{color:#fff;margin-top:12px;opacity:.9}</style>
<div class="t c17">${ph(p, "bot")}<div class="red"></div><svg class="wave" viewBox="0 0 1080 120" preserveAspectRatio="none"><path d="M0 0 H1080 V60 Q945 120 810 60 T540 60 T270 60 T0 60 Z" fill="#c8102e"/></svg>
<div class="in"><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}${ref(p)}<div class="sc">${shot(p)}</div></div></div>`;

// 18 · Corporate update: navy, outlet name, rounded photo panel, white card with a blue "update" pill.
T.c18 = (p, story) => `<style>${BASE}
.c18{background:linear-gradient(#0b2a6b,#123a8c)}
.c18 .name{text-align:center;color:#fff;font:800 italic 34px 'Inter';letter-spacing:2px}
.c18 .photo{margin-top:22px;height:400px;flex:0 0 auto;border-radius:28px;--phbg:#2b4b8f}
.c18 .card{margin-top:-60px;margin-left:30px;margin-right:30px;background:#fff;border-radius:24px;padding:24px 30px;text-align:center;position:relative;box-shadow:0 20px 50px rgba(0,0,0,.3)}
.c18 .pill{display:inline-block;margin-top:-50px;background:#3b82f6;color:#fff;font-weight:800;font-size:28px;padding:8px 28px;border-radius:12px}
.c18 h1{margin-top:12px;font-weight:900;font-size:${fit(p.headline, 46)}px;line-height:1.4;color:#0b2a6b}
.c18 .b{margin-top:10px;font-size:${fit(p.body, 28, [110, 170, 230])}px;line-height:1.6;color:#444}
.c18 .shot{margin-top:26px;max-height:440px;border-radius:12px}
.c18 .foot{margin-top:auto;display:flex;justify-content:space-between;color:#cfe0ff;font-size:24px}
.c18 .ref{color:#cfe0ff;margin-top:10px}</style>
<div class="t c18"><div class="in"><div class="name">SUGIMOTO NEWS</div>${ph(p, "photo")}
<div class="card"><span class="pill">${isNews(story) ? "آپدیت" : "نکته"}</span><h1>${H(p)}</h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}</div>
${shot(p)}${ref(p)}<div class="foot"><span>منبع: ${label(story)}</span><span class="lat">@sugimotovisa</span></div></div></div>`;

// 19 · Tabloid: blue side bar with the name turned on its side, yellow header, black-and-white photo,
// the headline on white strips over yellow.
T.c19 = (p, story) => `<style>${BASE}
.c19{background:#f2e94e}
.c19 .side{position:absolute;top:0;bottom:0;right:0;width:150px;background:#1d4ed8}
.c19 .side b{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);white-space:nowrap;color:#fff;font:900 italic 64px 'Inter'}
.c19 .in{right:190px;left:50px}
.c19 .k{font:900 82px/1.1 'Vazirmatn';color:#111}
.c19 .photo{margin-top:18px;height:360px;flex:0 0 auto;filter:grayscale(1) contrast(1.1);--phbg:#888}
.c19 h1{margin-top:26px;font-weight:900;font-size:${fit(p.headline, 50)}px;line-height:1.62;color:#111}
.c19 h1 span{background:#fff;padding:4px 14px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.c19 .b{margin-top:16px;font-weight:600;font-size:${fit(p.body, 30, [110, 170, 230])}px;line-height:1.6;color:#222}
.c19 .shot{margin-top:24px;max-height:460px}
.c19 .ref{color:#333;margin-top:10px}</style>
<div class="t c19"><div class="side"><b>SUGIMOTO VISA</b></div><div class="in"><div class="k">${isNews(story) ? "آپدیت" : "نکته"}</div>${ph(p, "photo")}
<h1><span>${H(p)}</span></h1>${p.body ? `<div class="b">${B(p)}</div>` : ""}${shot(p)}${ref(p)}</div></div>`;

// A page of a template laid out by hand (app/StoryDesigner.jsx): every block of the design, the
// children of .in in order (the badge, the card with the headline, the screenshot's frame…), at its
// own place and width, in .in's coordinates (.in starts 64px from the left, 250px from the top).
// Backgrounds and decorations outside .in stay where the design puts them.
export function cleanBlocks(list) {
  if (!Array.isArray(list)) return null;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const out = list.slice(0, 16).map((b) => (b && typeof b === "object" ? { x: num(b.x, -1080, 2160), y: num(b.y, -1920, 3840), w: num(b.w, 40, 2160) } : null));
  return out.some(Boolean) ? out : null;
}
export function blockCss(blocks) {
  return (blocks || [])
    .map((b, i) => (b ? `.t .in>:nth-child(${i + 1}){position:absolute!important;left:${b.x}px;top:${b.y}px;width:${b.w}px;margin:0!important;max-width:none;flex:none;align-self:auto}` : ""))
    .join("\n");
}

// HTML for a page in a template other than "simple" (index.js draws simple).
export function templatePageHtml(key, page, total, story) {
  const fn = T[key];
  if (!fn) return null;
  if (story.lang !== "en") return fn(page, story);
  latin = true;
  try {
    let html = fn(page, story);
    for (const [fa, en] of EN_LABELS) html = html.split(fa).join(en);
    return html + "<style>.t{direction:ltr}</style>";
  } finally {
    latin = false;
  }
}

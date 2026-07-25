// Code node: "Build Story Card"
// Runs per merged item. Generates the Instagram-story SVG from the shared
// normalised fields, then passes every field through unchanged so downstream
// nodes have a single node to reference. Logo is embedded once here.
// Paste your logo's base64 PNG here (the same value used in the Express Entry
// flow's "Build Message" node, constant LOGO_B64). If left as the placeholder,
// the card falls back to a text wordmark so it still renders.
const LOGO_B64 = '__PASTE_LOGO_B64_HERE__';
const HAS_LOGO = LOGO_B64.indexOf('PASTE_LOGO_B64') === -1;

function fitSize(val) {
  const len = String(val == null ? '' : val).length;
  if (len <= 3) return 220;
  if (len === 4) return 180;
  if (len === 5) return 150;
  return 130;
}

function buildSvg(j) {
  const rightFont = fitSize(j.statRightValue);
  const leftFont = fitSize(j.statLeftValue);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&amp;family=Inter:wght@700;800;900&amp;display=swap');
      .farsi { font-family: 'Vazirmatn', 'Tahoma', sans-serif; direction: rtl; }
      .english { font-family: 'Inter', 'Arial', sans-serif; }
    </style>
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="20" stdDeviation="40" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="#FFFFFF"/>
  <rect x="40" y="40" width="1000" height="1840" rx="50" ry="50" fill="#FFFFFF" filter="url(#cardShadow)" stroke="#F3F4F6" stroke-width="1"/>
  <g opacity="0.45">
    <rect x="120" y="1150" width="110" height="100" fill="#FCA5A5"/>
    <rect x="260" y="1080" width="110" height="170" fill="#FED7AA"/>
    <rect x="400" y="980"  width="110" height="270" fill="#FEF3C7"/>
    <rect x="540" y="880"  width="110" height="370" fill="#BAE6FD"/>
    <rect x="680" y="780"  width="110" height="470" fill="#C7D2FE"/>
    <rect x="820" y="680"  width="110" height="570" fill="#E9D5FF"/>
  </g>
  <g opacity="0.55">
    <circle cx="175" cy="1090" r="32" fill="#F87171"/>
    <path d="M 130 1150 Q 130 1100 175 1100 Q 220 1100 220 1150 Z" fill="#F87171"/>
    <circle cx="315" cy="1020" r="32" fill="#FB923C"/>
    <path d="M 270 1080 Q 270 1030 315 1030 Q 360 1030 360 1080 Z" fill="#FB923C"/>
    <circle cx="455" cy="920" r="32" fill="#FBBF24"/>
    <path d="M 410 980 Q 410 930 455 930 Q 500 930 500 980 Z" fill="#FBBF24"/>
    <circle cx="595" cy="820" r="32" fill="#38BDF8"/>
    <path d="M 550 880 Q 550 830 595 830 Q 640 830 640 880 Z" fill="#38BDF8"/>
    <circle cx="735" cy="720" r="32" fill="#818CF8"/>
    <path d="M 690 780 Q 690 730 735 730 Q 780 730 780 780 Z" fill="#818CF8"/>
    <circle cx="875" cy="620" r="32" fill="#C084FC"/>
    <path d="M 830 680 Q 830 630 875 630 Q 920 630 920 680 L 905 680 Q 900 695 875 695 Q 850 695 845 680 Z" fill="#C084FC"/>
  </g>
  <text x="540" y="300" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(j.headingLine1)}</text>
  <text x="540" y="395" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(j.headingLine2)}</text>
  <text x="540" y="490" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(j.headingLine3)}</text>
  <line x1="220" y1="555" x2="860" y2="555" stroke="#E5E7EB" stroke-width="3"/>
  <text x="780" y="800" text-anchor="middle" class="english" font-size="${rightFont}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${esc(j.statRightValue)}</text>
  <text x="780" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">${esc(j.statRightLabel)}</text>
  <line x1="540" y1="660" x2="540" y2="890" stroke="#E5E7EB" stroke-width="3"/>
  <text x="300" y="800" text-anchor="middle" class="english" font-size="${leftFont}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${esc(j.statLeftValue)}</text>
  <text x="300" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">${esc(j.statLeftLabel)}</text>
  <text x="540" y="1380" text-anchor="middle" class="farsi" font-size="46" font-weight="700" fill="#2C3E50">${esc(j.categoryFa)}</text>
  <text x="540" y="1450" text-anchor="middle" class="english" font-size="46" font-weight="700" fill="#2C3E50">${esc(j.categoryEn)}</text>
  <text x="540" y="1560" text-anchor="middle" class="english" font-size="42" font-weight="700" fill="#2C3E50">${esc(j.dateText)}</text>
  ${HAS_LOGO
    ? `<image x="290" y="1730" width="500" height="85" xlink:href="data:image/png;base64,${LOGO_B64}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="540" y="1790" text-anchor="middle" class="english" font-size="46" font-weight="900" fill="#2C3E50">SUGIMOTO VISA</text>`}
</svg>`;
}

return $input.all().map(function (it) {
  const j = it.json;
  return { json: Object.assign({}, j, { svg: j.skipInstagram ? '' : buildSvg(j) }) };
});

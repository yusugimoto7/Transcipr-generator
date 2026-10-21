// Slide templates, chosen before the slides are drawn. 1 is the brand's own look (drawn with its
// published carousels as style references); the others are described in words only, so the
// references are not attached and cannot pull them back to template 1. Hamed may replace them.
// No Node imports: the topic page shows the picker from this file too (`swatch`: its colours).
export const TEMPLATES = [
  {
    id: 1, name: "Sugimoto classic", refs: true, fa: "کلاسیک سوگیموتو", swatch: ["#ffffff", "#0d4f4b", "#f3e3c3", "#d6efe9"],
    style: `clean white background; deep teal (#0d4f4b) for headlines in a heavy, bold Persian display typeface; body text in dark grey; a soft cream (#f3e3c3) rounded pill label for small kickers; key values (numbers, dates, names) highlighted inside mint (#d6efe9) rounded pills; information in rounded white cards with a subtle shadow, each with a circular pale-teal icon; the picture on one side, framed by a large curved deep-teal swoosh shape`,
  },
  {
    id: 2, name: "Slate night", refs: false, fa: "سرمه‌ای تیره", swatch: ["#32515d", "#ffffff", "#f3e3c3", "#f2b35b"],
    style: `deep slate-blue background (#32515d) with a very subtle darker vignette; headlines in heavy bold white Persian type; body text in soft off-white (#e9eef0); small kicker labels as cream (#f3e3c3) pills with slate text; key values in warm amber (#f2b35b) bold type; information in translucent lighter-slate rounded cards with thin white outlines; the picture in a large rounded-corner frame with a thin cream border`,
  },
  {
    id: 3, name: "Editorial paper", refs: false, fa: "مجله‌ای", swatch: ["#faf7f0", "#111111", "#0d4f4b", "#bfe6dc"],
    style: `warm off-white paper background (#faf7f0) like a printed magazine page; a very large black headline in a heavy, high-contrast Persian display typeface; body text in charcoal with generous line spacing; thin deep-teal (#0d4f4b) horizontal rules separating sections; a small numbered kicker in teal; key values underlined with a thick mint (#bfe6dc) highlighter stroke; the picture as a crisp rectangular photo with no rounded corners, placed at the top or side like a magazine layout; no cards, no shadows`,
  },
  {
    id: 4, name: "Full photo", refs: false, fa: "عکس تمام‌صفحه", swatch: ["#0b2f2d", "#5b7f7a", "#ffffff", "#f3e3c3"],
    style: `the picture fills the whole slide edge to edge, with a dark teal-to-black gradient overlay (#0b2f2d at about 75% opacity) over the half where the text sits so the text is perfectly readable; headlines in heavy bold white Persian type; body text in white; key values inside solid cream (#f3e3c3) pills with dark text; at most one semi-transparent dark rounded card behind longer text`,
  },
  {
    id: 5, name: "Soft gradient", refs: false, fa: "گرادیان ملایم", swatch: ["#dff3ee", "#fbf1df", "#0d4f4b", "#e9775a"],
    style: `a soft diagonal gradient background from pale mint (#dff3ee) to warm cream (#fbf1df); frosted-glass white cards (semi-transparent, blurred, rounded 24px corners, thin white border); headlines in heavy bold deep-teal (#0d4f4b) Persian type; body text in dark slate; key values in coral (#e9775a) bold type; the picture as a glossy 3D-rendered object or scene floating with a soft shadow`,
  },
  {
    id: 6, name: "Bold blocks", refs: false, fa: "بلوک‌های رنگی", swatch: ["#0d4f4b", "#ef7d32", "#f6ecd9", "#ffffff"],
    style: `flat graphic design with large solid colour blocks: deep teal (#0d4f4b), orange (#ef7d32) and cream (#f6ecd9); headlines in heavy bold Persian type on the colour blocks (white on teal or orange, teal on cream); body text in dark grey on cream; each point marked by a big round numbered badge in orange; key values in white bold on small teal tabs; the picture as a flat vector illustration in the same three colours, no photographs`,
  },
];

export function templateOf(id) {
  return TEMPLATES.find((t) => t.id === Number(id)) || TEMPLATES[0];
}


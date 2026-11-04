// Slide templates, chosen before the slides are drawn. 1 is the brand's own look; 2-7 follow the
// Canva designs Hamed picked (Oct 21 2026). Each is drawn with its own pages as style references
// (`refs`, a folder under public/brand), plus the words below, which say what to take from them
// and how to turn a left-to-right English layout into a right-to-left Persian one.
// No Node imports: the topic page shows the picker from this file too (`cover`: its first page, `swatch`: its colours).
export const TEMPLATES = [
  {
    id: 1, name: "Sugimoto classic", fa: "کلاسیک سوگیموتو", refs: "carousel-style", cover: "/brand/carousel-style/1-online-test.jpg", swatch: ["#ffffff", "#0d4f4b", "#f3e3c3", "#d6efe9"],
    style: `clean white background; deep teal (#0d4f4b) for headlines in a heavy, bold Persian display typeface; body text in dark grey; a soft cream (#f3e3c3) rounded pill label for small kickers; key values (numbers, dates, names) highlighted inside mint (#d6efe9) rounded pills; information in rounded white cards with a subtle shadow, each with a circular pale-teal icon; the picture on one side, framed by a large curved deep-teal swoosh shape`,
  },
  {
    id: 2, name: "Yellow collage", fa: "کلاژ زرد", refs: "carousel-templates/2", cover: "/brand/carousel-templates/2/1.jpg", canva: "DAHYpyNwXng", swatch: ["#ecebe6", "#f9c80e", "#111111", "#ffffff"],
    style: `warm light-grey paper background (#ecebe6) with a fine grain; the COVER slide on solid bright yellow (#f9c80e) instead; the headline large and centred in an elegant black Persian typeface, some words heavy and others lighter or slanted, like the reference's bold-plus-italic serif mix; the picture as a black-and-white halftone photo cut-out (hands holding a related object, documents, a laptop, a megaphone, a stack of books) collaged in the middle with bright yellow accents; small yellow sparkle stars and short yellow burst strokes as doodles; the body as a short centred paragraph in small black type under the picture; a tiny line of small text along the top edge; key values in a yellow pill with black text`,
  },
  {
    id: 3, name: "Orange bold", fa: "نارنجی پررنگ", refs: "carousel-templates/3", cover: "/brand/carousel-templates/3/1.jpg", canva: "DAHYp9w7e0E", swatch: ["#f2f0ec", "#f26a1b", "#2b2b2b", "#ffffff"],
    style: `off-white textured paper background (#f2f0ec) with soft halftone dot patches in the corners; very large heavy rounded geometric Persian headline, part in bright orange (#f26a1b) and part in charcoal (#2b2b2b), sometimes one word in an orange handwritten brush script; the picture as a black-and-white grunge cut-out object (a rising arrow, an exclamation mark, a hand holding an orange light bulb) with orange colouring; points as a list with orange round bullets, each with a short bold orange heading and a charcoal line under it; body text charcoal`,
  },
  {
    id: 4, name: "Red grid", fa: "قرمز و مشکی", refs: "carousel-templates/4", cover: "/brand/carousel-templates/4/1.jpg", canva: "DAHYp2eIIgc", swatch: ["#efefef", "#111111", "#d71a21", "#ffffff"],
    style: `light grey background (#efefef) with a faint square grid pattern fading across the middle; a heavy grotesque Persian headline in two lines, the first line black and the second line bright red (#d71a21), set at the top on the right; body text in bold black, short and set lower on the slide; points shown as black-outlined rounded pill tags, or as dated rows (a small date, then the bold line); a small red burst mark next to the cover headline; small text along the top and bottom edges; very minimal, almost no pictures — at most one small photo in a white polaroid frame (an object, never a person)`,
  },
  {
    id: 5, name: "Paper scrapbook", fa: "دفترچه کاغذی", refs: "carousel-templates/5", cover: "/brand/carousel-templates/5/1.jpg", canva: "DAHYpzpeDEc", swatch: ["#f1efea", "#111111", "#ffffff", "#c9b8a6"],
    style: `crumpled white paper texture background; the headline in an elegant black Persian typeface with a classic, serif-like feel, set high and to the right; the body in small spaced-out typewriter-style black text in short paragraphs; real photo cut-outs of everyday objects tied to the subject (a coffee cup, a laptop, headphones, a phone, papers, a passport) peeking in from the corners with a thin white sticker edge; small white hand-drawn flower doodles; calm, airy, personal`,
  },
  {
    id: 6, name: "Green tips", fa: "نکته‌های سبز", refs: "carousel-templates/6", cover: "/brand/carousel-templates/6/1.jpg", canva: "DAHYpw6PAis", swatch: ["#f4f5f4", "#1c9c86", "#111111", "#ffffff"],
    style: `very light grey background (#f4f5f4) with a faint square grid; a teal-green (#1c9c86) rounded pill label above the headline holding the point's number in words (یک، دو، سه…) or the cover's kicker; a heavy, condensed, slanted black Persian headline; the body as a block of compact dark-grey text; a dashed teal arrow doodle on the cover; a small teal four-leaf mark in the top corner; a small bookmark icon near the bottom; no photos`,
  },
  {
    id: 7, name: "Lime photo", fa: "عکس و لیمویی", refs: "carousel-templates/7", cover: "/brand/carousel-templates/7/1.jpg", canva: "DAHYp5xlngg", swatch: ["#efefee", "#a8d930", "#111111", "#ffffff"],
    style: `light grey textured background (#efefee); a tall photo panel with rounded corners on the left side (the text side is the right, for Persian); a lime-green (#a8d930) pill label above the headline (e.g. «نکته ۱»); a heavy bold black Persian headline in short lines; a small black body paragraph; a thin lime rule and a short bold quote line low on the text side; a lime rounded "ورق بزنید" button with an arrow pointing left; the photo shows objects or places tied to the subject, never a person as its subject; no black footer bar`,
  },
  {
    id: 8, name: "Hamed story", fa: "داستان حامد", refs: "carousel-templates/8", cover: "/brand/carousel-templates/8/1.jpg", swatch: ["#ffffff", "#ff8a3d", "#ffd23f", "#111111"],
    // From Hamed's most-liked 2021-2023 posts (17k likes): copied from the pictures themselves (Nov 4 2026).
    style: `Hamed's own spoken-voice post, square. COVER: a full-bleed real photo of a person outdoors (nature, water, mountains) with a very large, heavy, rounded Persian headline of only 2-4 words ending in «؟!» or «!», set over the lower half in a bright yellow-to-orange gradient with a thick dark outline and a slight tilt, big enough to be read as a thumbnail. INNER SLIDES: the same photo turned into a very pale, washed-out black-and-white ghost behind the text (about 85% white); at the top right a short heading in bold orange (#ff8a3d) Persian type with a dark outline, with a thick vertical orange bar with dark outline at the right edge beside it; the heading is two or three words («داستان چیه؟!» on the second slide, «سرعت بیشتر...»); under it a block of 4-9 lines of plain black medium-weight Persian text, right-aligned, spoken and conversational; one or two key phrases underlined with a thin black line; no cards, no icons, no pills. Bottom left a small row of three round black icons (Telegram, YouTube, Instagram) followed by the channel name in Latin letters. LAST SLIDE: the same ghost photo, centred black text starting with «تو بگو:» and a question, a wide thin orange bar with dark outline as divider, then a short call to action with the key phrase underlined, the brand logo and the icon row below.`,
  },
  {
    id: 9, name: "Dark report", fa: "گزارش تیره", refs: "carousel-templates/9", cover: "/brand/carousel-templates/9/1.jpg", swatch: ["#17323b", "#ffffff", "#e8702a", "#1f1f1f"],
    // From the 2023 officer-case post (2.8k likes): the case told as text cards on a dark page.
    style: `a serious report-style post in 4:5. COVER: a realistic photo in a dark deep-teal frame (#17323b) at the top and bottom, the headline in white bold Persian type at the lower right over the photo with a thin white vertical line at its right edge, two short lines ending in «...». INNER SLIDES: a near-black page (#1f1f1f) with one large white rounded card in the middle (about 90% of the width, large corner radius) holding the text, right-aligned dark Persian type of 3-6 lines in short paragraphs, each paragraph starting with an emoji marker (👉🏽 ✅ ⁉️); NO fake social-media account name, handle, logo, view count or timestamp; at the bottom of the card, a thin divider and the Sugimoto Visa logo. LAST SLIDE: plain deep-teal (#17323b), centred white bold Persian call to action in 2-3 lines, below it the logo (orange square mark with white SUGIMOTO VISA lettering).`,
  },
];

export function templateOf(id) {
  return TEMPLATES.find((t) => t.id === Number(id)) || TEMPLATES[0];
}

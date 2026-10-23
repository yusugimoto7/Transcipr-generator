// Story templates: the same page (headline, the source's screenshot, body,
// case name) dressed in a look that is trending on Instagram. "simple" is the
// team's own raw style and stays the default; the rest are chosen per story.
//
// Every template keeps the story rules: the screenshot is shown whole
// (object-fit: contain, never cropped or covered), no fact is added (the only
// fixed words are framing labels such as «خبر فوری»), no logo, and everything
// that must be read sits inside Instagram's safe area (260px top, 280px bottom).


// name: shown in the app. Hamed kept only "simple" (Oct 23 2026: the ten
// home-made looks were rejected); ready-made designs the team picks are to be
// added here, one function in T each.
export const STORY_TEMPLATES = [{ key: "simple", name: "ساده (پیش‌فرض)", accent: true }];
export const TEMPLATE_KEYS = STORY_TEMPLATES.map((t) => t.key);
export function cleanTemplate(key) {
  return TEMPLATE_KEYS.includes(key) ? key : "simple";
}

const T = {};

// HTML for a page in a template other than "simple" (index.js draws simple).
export function templatePageHtml(key, page, total, story, colours) {
  const fn = T[key];
  return fn ? fn(page, colours, story) : null;
}

// The background colours of the simple story, shared by the server's drawing (lib/story/index.js),
// the hand designer (app/StoryDesigner.jsx) and the swatches on the topic page, so the three
// never drift apart. A background is a preset's name or any "#rrggbb" picked from the colour
// wheel (Hamed, Oct 26 2026: "add a colour circle so I can pick my own, and make the samples
// ten"); for a picked colour the text and box colours follow its brightness.

export const STORY_BACKGROUNDS = {
  // Taken from the team's reference story; the default.
  purple: { bg: "#8a3893", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  black: { bg: "#000000", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  navy: { bg: "#1e2a5a", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  blue: { bg: "#2f6fed", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  teal: { bg: "#0e8a8a", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  green: { bg: "#0e7a4f", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  red: { bg: "#e53935", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  orange: { bg: "#f5820b", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  yellow: { bg: "#f2c200", text: "#000000", box: "#000000", boxText: "#ffffff" },
  white: { bg: "#ffffff", text: "#000000", box: "#000000", boxText: "#ffffff", edge: "#dddddd" },
};

// Order and names for the swatches.
export const STORY_BG_ORDER = ["purple", "black", "navy", "blue", "teal", "green", "red", "orange", "yellow", "white"];
export const STORY_BG_NAMES = {
  purple: ["بنفش", "Purple"], black: ["مشکی", "Black"], navy: ["سرمه‌ای", "Navy"], blue: ["آبی", "Blue"], teal: ["سبزآبی", "Teal"],
  green: ["سبز", "Green"], red: ["قرمز", "Red"], orange: ["نارنجی", "Orange"], yellow: ["زرد", "Yellow"], white: ["سفید", "White"],
};

export function isHexColour(v) {
  return /^#[0-9a-f]{6}$/i.test(String(v || ""));
}

// Perceived brightness, 0 (black) to 1 (white).
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

export function storyColours(bg) {
  const key = String(bg || "").toLowerCase();
  if (STORY_BACKGROUNDS[key]) return STORY_BACKGROUNDS[key];
  if (isHexColour(key)) {
    const light = luminance(key) > 0.5;
    return light
      ? { bg: key, text: "#000000", box: "#000000", boxText: "#ffffff", ...(luminance(key) > 0.85 ? { edge: "#dddddd" } : {}) }
      : { bg: key, text: "#ffffff", box: "#ffffff", boxText: "#000000" };
  }
  return STORY_BACKGROUNDS.purple;
}

// A stored background: a preset's name or a hex; anything else is the default.
export function cleanBg(v) {
  const key = String(v || "").toLowerCase();
  return STORY_BACKGROUNDS[key] || isHexColour(key) ? key : "purple";
}

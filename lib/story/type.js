// The type size of a simple story page by how much text it carries, in one place for the server's
// drawing (lib/story/index.js) and the hand designer's starting layout (app/StoryDesigner.jsx): the
// designer once kept its own copy of these steps, fell behind when pages began to carry the whole
// script, and opened on text several sizes too big.
export function headlineSize(text) {
  const n = String(text || "").length;
  return n > 500 ? 32 : n > 320 ? 35 : n > 200 ? 38 : n > 130 ? 42 : n > 95 ? 46 : n > 70 ? 52 : n > 45 ? 58 : 64;
}
export function bodySize(text) {
  const n = String(text || "").length;
  return n > 900 ? 28 : n > 700 ? 30 : n > 520 ? 32 : n > 400 ? 35 : n > 290 ? 38 : n > 170 ? 42 : n > 110 ? 46 : 50;
}
// Instagram's own controls cover the top 260 px and the bottom 280 px of a story.
export const SAFE_TOP = 260;
export const SAFE_BOTTOM = 1640;

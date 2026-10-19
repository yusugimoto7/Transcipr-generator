// Colours of the Trello board the team came from, so the imported lists, labels and covers look
// like they did there. They are the shades the team's phones show (Trello's dark theme, where a
// "_dark" label is the bright one and a "_light" label the deep one). Values read off screenshots
// of the board are marked M; the rest of the family is filled in to match and can be changed from
// the labels form. Trello label names keep their meaning under a `trello_` prefix so they never
// collide with the app's own colour names (sky, orange… mean something else here).

export const TRELLO_LABELS = {
  trello_green_light: "#274a36", // M
  trello_green: "#386c50", // M (cover)
  trello_green_dark: "#71cb9b", // M
  trello_yellow_light: "#503f12", // M
  trello_yellow: "#7a601c", // M
  trello_yellow_dark: "#e0b94a",
  trello_orange_light: "#4f2f12",
  trello_orange: "#93501b", // M
  trello_orange_dark: "#eb9a58",
  trello_red_light: "#55231d", // M
  trello_red: "#9b3a31",
  trello_red_dark: "#e7796d", // M
  trello_purple_light: "#43255a", // M
  trello_purple: "#77429f", // M (cover)
  trello_purple_dark: "#be7fed", // M
  trello_blue_light: "#1c2f54",
  trello_blue: "#2a56b5", // M (cover)
  trello_blue_dark: "#7fb0f5",
  trello_sky_light: "#234453", // M
  trello_sky: "#2e6e8a",
  trello_sky_dark: "#81c1dd", // M
  trello_lime_light: "#3b4d1e",
  trello_lime: "#5d8a2c",
  trello_lime_dark: "#9ec55b", // M
  trello_pink_light: "#54253f",
  trello_pink: "#884070", // M (cover)
  trello_pink_dark: "#d87ab8", // M
  trello_black_light: "#4b4d50", // M
  trello_black: "#5f6165",
  trello_black_dark: "#9a9da2",
};

// Card covers use Trello's plain colour names; the shade is the label family's middle one.
export const COVER_COLORS = Object.fromEntries(
  ["green", "yellow", "orange", "red", "purple", "blue", "sky", "lime", "pink", "black"].map((n) => [n, TRELLO_LABELS["trello_" + n]])
);

// Lists the team filled with a colour in Trello are filled here too; the app's own list colours
// stay a stripe on top. Values M.
export const FILLED_LIST_COLORS = { forest: "#254a36", maroon: "#55231e", black: "#000000" };

// Readable text on a coloured pill.
export function textOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#14213d" : "#ffffff";
}

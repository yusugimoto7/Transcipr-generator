// The Instagram pages a post can go to (lib/calendar/channels/instagram.js has their keys):
// @sugimotovisa (Persian, Canada), @sugimotovisa.europe (Persian, Europe) and @sugimoto.visa, the
// English page for both markets (Hamed, Oct 24 2026). Empty means by the card: an English one
// (made from the topic page's English switch) to @sugimoto.visa, else EU to Europe, the rest to
// @sugimotovisa. Kept apart from model.js so the composer can read it in the browser.
export const IG_ACCOUNTS = { canada: "@sugimotovisa", eu: "@sugimotovisa.europe", alt: "@sugimoto.visa" };
export const IG_ACCOUNT_NOTES = { canada: ["فارسی · کانادا", "Persian · Canada"], eu: ["فارسی · اروپا", "Persian · Europe"], alt: ["انگلیسی · کانادا و اروپا", "English · Canada and Europe"] };

// The page a card's Instagram post goes to: its own choice, else English content (an English
// carousel, story or article, or the English video) to @sugimoto.visa, else an EU-labelled card
// to the Europe page, else @sugimotovisa. `labels` are the board's, to read the card's label names.
export function igPageOf(card, labels = []) {
  const ch = (card && card.channels && card.channels.instagram) || {};
  if (IG_ACCOUNTS[ch.account]) return ch.account;
  if (/_en$|^video$/.test((card && card.source && card.source.made) || "")) return "alt";
  const names = ((card && card.labels) || []).map((id) => ((labels || []).find((l) => l.id === id) || {}).name || "");
  return names.some((n) => n.toLowerCase() === "eu") ? "eu" : "canada";
}

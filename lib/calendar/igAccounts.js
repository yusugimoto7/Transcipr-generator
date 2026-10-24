// The Instagram pages a post can go to (lib/calendar/channels/instagram.js has their keys):
// @sugimotovisa (Persian, Canada), @sugimotovisa.europe (Persian, Europe) and @sugimoto.visa, the
// English page for both markets (Hamed, Oct 24 2026). Empty means by the card: an English one
// (made from the topic page's English switch) to @sugimoto.visa, else EU to Europe, the rest to
// @sugimotovisa. Kept apart from model.js so the composer can read it in the browser.
export const IG_ACCOUNTS = { canada: "@sugimotovisa", eu: "@sugimotovisa.europe", alt: "@sugimoto.visa" };
export const IG_ACCOUNT_NOTES = { canada: ["فارسی · کانادا", "Persian · Canada"], eu: ["فارسی · اروپا", "Persian · Europe"], alt: ["انگلیسی · کانادا و اروپا", "English · Canada and Europe"] };

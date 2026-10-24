// Output language of a piece of content. Every prompt in this app was written for Persian output;
// English output reuses the same prompt (same grounding, same format) with the block below added
// at the end, where it wins over the Persian-only rules, and the picture prompts are reworded.
// English versions are stored apart from the Persian ones (material "carousel_en" next to
// "carousel"), so making one never replaces the other.

export const LANGS = ["fa", "en"];

export function langOf(x) {
  return x === "en" ? "en" : "fa";
}

// The workspace material for a kind in a language.
export function materialOf(kind, lang) {
  return langOf(lang) === "en" ? `${kind}_en` : kind;
}

const KIND_NOTES = {
  telegram: "This is a short news post for an English Telegram channel: the same short, first-person, friendly expert voice, in natural English.",
  article: "This is an English SEO news article for sugimotovisa.com: an English focus keyword, English title, meta description, excerpt and tags. Official English names for programmes (IRCC, Express Entry, PGWP, LMIA…), explained in a few words the first time where readers may not know them.",
  carousel: "Every slide and the caption are in English. Keep the slide markers exactly as asked. The last slide's consultation line is exactly: \"Tap the link in our bio to book a consultation with Sugimoto Visa.\" It is the only call to action: no asking readers to comment anything, and no Persian words anywhere.",
  story: "Every headline, body and the caption are in English, with the same word limits (counted in English words). The quote stays copied character for character from the source text, as asked.",
  picture: "The text on the picture is in English.",
};

export function englishBlock(kind) {
  return `

OUTPUT LANGUAGE (this overrides every language instruction above): write the whole output in clear, natural English for an English-speaking audience following Canadian and European immigration. Every other rule above still applies in full: every fact only from the source text, nothing invented, no sales lines or calls to action, never "according to the source", the same tone and the same output format and field names. Rules that are only about Persian (Persian names for terms, Persian spelling, Persian sample lines, Persian digits) do not apply; the Persian samples above show tone only. ${KIND_NOTES[kind] || ""}`;
}

// Picture prompts name the language of the words to draw; for English they ask for left-to-right
// English instead.
export function englishPicturePrompt(p) {
  return String(p)
    .replace(/a licensed Persian-language immigration consultancy/g, "a licensed immigration consultancy")
    .replace(/Persian \(Farsi\), right-to-left/g, "English, left-to-right")
    .replace(/with correct Persian letter joining/g, "")
    .replace(/correct letter joining/g, "correct spelling")
    .replace(/Keep English words, numbers and emojis exactly as written/g, "Keep numbers and emojis exactly as written")
    .replace(/Keep English words and numbers exactly as written/g, "Keep numbers exactly as written")
    .replace(/mirrored for right-to-left Persian/g, "left-to-right")
    .replace(/never copy their English text/g, "never copy their text")
    .replace(/heavy bold Persian display typeface/g, "heavy bold display typeface")
    .replace(/the Persian text/g, "the English text")
    .replace(/The Persian text/g, "The English text");
}

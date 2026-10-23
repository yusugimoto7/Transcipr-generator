// The app's own words in the language each person chose (Hamed, Oct 2026: "everyone Persian by
// default, each can switch to English in their profile"). Generated content has its own language
// choice on the topic page; this is only the interface around it.
//
// Every label is written in place as a pair, L("فارسی", "English"), so the two never drift apart
// and no key table has to be kept. The choice lives in a cookie (read by the server for the first
// paint and by the browser) and, for a signed-in person, on their account, so it follows them to
// another device. Changing it reloads the page, so nothing on screen is left in the old language.
//
// Never call L at a module's top level: on the server a module runs once for every visitor, so a
// constant made there would be in whichever language came first. Keep pairs in constants and call
// L when drawing.

export const LANG_COOKIE = "ui_lang";
export const LANGS = ["fa", "en"];
export const DEFAULT_LANG = "fa";

export function normLang(v) {
  return LANGS.includes(v) ? v : DEFAULT_LANG;
}

function fromCookie() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)ui_lang=([a-z]+)/);
    return normLang(m && m[1]);
  } catch {
    return DEFAULT_LANG;
  }
}

let current = typeof document !== "undefined" ? fromCookie() : DEFAULT_LANG;

// Set by LangProvider while the page is drawn (on the server from the request's cookie).
export function setLang(lang) {
  current = normLang(lang);
}

export function getLang() {
  return current;
}

export function isFa() {
  return current === "fa";
}

// The label in the chosen language. A pair given as one array works too: L(["…", "…"]).
export function L(fa, en) {
  if (Array.isArray(fa)) [fa, en] = fa;
  return current === "en" ? (en ?? fa) : (fa ?? en);
}

// Direction of the interface (not of generated content, which keeps its own).
export function uiDir() {
  return current === "fa" ? "rtl" : "ltr";
}

// Saves the choice (on the account too when signed in) and reloads in the new language.
export async function chooseLang(lang) {
  const l = normLang(lang);
  document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax`;
  await fetch("/api/editing/auth/lang", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: l }) }).catch(() => {});
  window.location.reload();
}

// The last pass over every generated text before anyone sees it (Hamed, Oct 24 2026, after the
// instagram-agent-skill humanizer): hidden characters, em dashes and stock filler lines out.
// Written for Persian too, which the original is not: the zero-width non-joiner (U+200C) is the
// Persian half-space (می‌شه) and the bidi marks keep mixed Persian and English in order, so both
// stay. Single words are never swapped: "comprehensive" is part of "Comprehensive Ranking System",
// and a programme's name is a fact. Only whole filler phrases go.

// Characters a keyboard never types and copy-paste carries along silently.
const HIDDEN = /[​⁠﻿­᠎⁡-⁤]|\uDB40[\uDC00-\uDC7F]/g;
const ODD_SPACES = /[           ]/g;

// Openers and closers that say nothing; removed with the punctuation after them.
const FILLER_EN = [
  "stop scrolling", "don't scroll past this", "in today's video", "in this video i'm going to show you", "in this video i am going to show you",
  "watch till the end", "watch until the end", "in today's fast-paced world", "in today's digital age", "without further ado", "let that sink in",
  "buckle up", "read that again", "food for thought", "at the end of the day", "it's no secret that", "here's the thing", "let's face it",
  "tag someone who needs this", "follow for more", "double tap if you agree", "spoiler alert",
];
const FILLER_FA = [
  "اسکرول نکنید", "اسکرول نکن", "تا آخر ویدیو با ما همراه باشید", "تا انتها همراه باشید", "تا آخر همراه باشید", "در دنیای پرشتاب امروز",
  "در دنیای امروز", "بیایید با هم بررسی کنیم", "بیاید با هم بررسی کنیم", "بدون مقدمه بریم سراغ اصل مطلب",
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FILLER_RE = new RegExp(`(^|[\\s«"(])(${[...FILLER_EN, ...FILLER_FA].map(esc).join("|")})\\s*[.!?؟،,:…]*`, "giu");

// Structures to rewrite by hand, reported rather than changed: changing a sentence's shape needs
// judgement, and a regex would mangle it.
const TELLS = [
  [/\bit[’']?s not (just|only) [^.,!?]{1,60}, it[’']?s\b/i, "\"It's not just X, it's Y\""],
  [/\bnot only\b[^.!?]{1,80}\bbut also\b/i, "\"not only X but also Y\""],
  [/نه تنها[^.!؟]{1,80}بلکه/, "«نه تنها … بلکه»"],
];

export function cleanText(text, { lang = "fa" } = {}) {
  if (typeof text !== "string" || !text) return text;
  const fa = lang !== "en";
  let s = text.replace(HIDDEN, "").replace(ODD_SPACES, " ");
  // Em and en dashes: the brand never uses them (it reads as machine text).
  s = s.replace(/\s*—\s*/g, fa ? "، " : ", ").replace(/(\d)\s*–\s*(\d)/g, "$1-$2").replace(/\s*–\s*/g, fa ? "، " : ", ");
  if (!fa) s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...");
  s = s.replace(FILLER_RE, (m, lead) => lead);
  // What the removals leave behind: doubled punctuation, a line that starts with a comma, spaces.
  s = s
    .replace(/([،,])\s*([،,.!?؟])/g, "$2")
    .replace(/^[ \t]*[،,]\s*/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  return s.trim() ? s.trim() : text;
}

// For logs and checks: what a draft still has that a person should rewrite.
export function textTells(text) {
  const s = String(text || "");
  return TELLS.filter(([re]) => re.test(s)).map(([, name]) => name);
}

// An HTML body: only the text between tags is cleaned, never a tag or a link.
export function cleanHtml(html, opts) {
  if (typeof html !== "string") return html;
  return html.replace(/>([^<]+)</g, (m, t) => ">" + cleanText(t, opts).replace(/^(?=\S)/, t.match(/^\s*/)[0]) + t.match(/\s*$/)[0] + "<");
}

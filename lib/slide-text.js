// A carousel slide's text as heading + body. The writer is asked for a heading
// line and then the body, but it sometimes returns the whole slide as one line
// (the team, Oct 27 2026: the editor then showed a whole paragraph as the
// heading and an empty body, and the picture drew it all as a headline).
// One line is split after its opening question or clause when that is short
// enough to be a heading; a short line stays a heading on its own (a cover).

const HEAD_MAX = 90;

export function splitSlideText(content) {
  const text = String(content || "").replace(/\r/g, "").trim();
  const lines = text.split("\n");
  if (lines.length > 1) return { title: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
  if (text.length <= 70) return { title: text, body: "" };
  // the first question mark, colon, semicolon or exclamation within heading length
  const m = text.slice(0, HEAD_MAX + 1).match(/^(.{8,}?[؟?:؛!])\s+/);
  if (m) return { title: m[1].trim(), body: text.slice(m[0].length).trim() };
  // else the first sentence, if it is short enough
  const s = text.match(/^(.{12,}?[.。])\s+/);
  if (s && s[1].length <= HEAD_MAX) return { title: s[1].trim(), body: text.slice(s[0].length).trim() };
  return { title: "", body: text };
}

// The slide's content with the heading on its own line, as the picture prompt expects.
export function normalSlideText(content) {
  const { title, body } = splitSlideText(content);
  return [title, body].filter(Boolean).join("\n");
}

// The team's own ready-made carousel text, pasted whole (Hamed, Oct 28 2026: "I paste my carousel
// text, the app sees how many slides it holds and each slide's heading and body"). Split here, by
// rule, never by a model: the words are the team's and stay exactly as typed. In order of trust:
//   «اسلاید ۱» / «Slide 2:» lines, separator lines (--- *** ===), lines numbered 1. 2. 3. from 1,
//   else blocks between blank lines.
// In a slide, «تیتر:» / «Title:» and «متن:» / «Body:» lines are honoured; else its first line is the
// heading and the rest the body. A «کپشن:» / «Caption:» part at the end becomes the caption.
const DIGITS = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const MARK = /^\s*[*#\s]*(?:اسلاید|اسلايد|slide|صفحه|کارت)\s*(?:شماره\s*)?[#:]?\s*([0-9۰-۹٠-٩]+)\s*[*]*\s*[:.)\-–—]?\s*(.*)$/i;
const SEP = /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,}|—{2,}|–{2,})\s*$/;
const NUM = /^\s*([0-9۰-۹٠-٩]{1,2})\s*[.)\-–:]\s+(.+)$/;
const CAPTION = /^\s*[*]*\s*(?:کپشن|caption)\s*[*]*\s*[:：]\s*(.*)$/i;
const TITLE = /^\s*[*]*\s*(?:تیتر|عنوان|title|heading|headline)\s*[*]*\s*[:：]\s*(.*)$/i;
const BODY = /^\s*[*]*\s*(?:متن|بدنه|body|text)\s*[*]*\s*[:：]\s*(.*)$/i;
const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/[ \t]+$/g, "");

export function parseOwnSlides(raw, { max = 10 } = {}) {
  let lines = String(raw || "").replace(/\r/g, "").split("\n");
  // the caption: from a «کپشن:» line to the end
  let caption = "";
  const ci = lines.findIndex((l) => CAPTION.test(l));
  if (ci >= 0) {
    caption = [lines[ci].match(CAPTION)[1], ...lines.slice(ci + 1)].join("\n").trim();
    lines = lines.slice(0, ci);
  }
  let blocks = [];
  const marks = lines.map((l, i) => (MARK.test(l) ? i : -1)).filter((i) => i >= 0);
  const seps = lines.map((l, i) => (SEP.test(l) ? i : -1)).filter((i) => i >= 0);
  const nums = lines.map((l, i) => {
    const m = l.match(NUM);
    return m ? { i, n: Number(DIGITS(m[1])) } : null;
  }).filter(Boolean);
  // numbered lines count as slides only when they run 1, 2, 3… from the start
  const numbered = nums.length >= 2 && nums.every((x, k) => x.n === k + 1);
  if (marks.length >= 2 || (marks.length === 1 && marks[0] <= 1)) {
    marks.forEach((at, k) => {
      const first = lines[at].match(MARK)[2];
      blocks.push([first, ...lines.slice(at + 1, k + 1 < marks.length ? marks[k + 1] : lines.length)]);
    });
  } else if (seps.length) {
    let cur = [];
    for (const l of lines) {
      if (SEP.test(l)) {
        blocks.push(cur);
        cur = [];
      } else cur.push(l);
    }
    blocks.push(cur);
  } else if (numbered) {
    nums.forEach((x, k) => blocks.push([lines[x.i].match(NUM)[2], ...lines.slice(x.i + 1, k + 1 < nums.length ? nums[k + 1].i : lines.length)]));
  } else {
    let cur = [];
    for (const l of lines) {
      if (!l.trim()) {
        if (cur.length) blocks.push(cur);
        cur = [];
      } else cur.push(l);
    }
    if (cur.length) blocks.push(cur);
  }
  blocks = blocks.map((b) => b.map(plain)).filter((b) => b.some((l) => l.trim()));
  const slides = blocks.map((b) => {
    const ls = b.map((l) => l.trim()).filter(Boolean);
    const t = ls.findIndex((l) => TITLE.test(l));
    const bi = ls.findIndex((l) => BODY.test(l));
    if (t >= 0 || bi >= 0) {
      const title = t >= 0 ? [ls[t].match(TITLE)[1], ...ls.slice(t + 1, bi > t ? bi : ls.length)].join("\n").trim() : "";
      const body = bi >= 0 ? [ls[bi].match(BODY)[1], ...ls.slice(bi + 1, t > bi ? t : ls.length)].join("\n").trim() : ls.filter((_, k) => k !== t).join("\n").trim();
      return { title, body };
    }
    if (ls.length === 1) return splitSlideText(ls[0]);
    return { title: ls[0], body: ls.slice(1).join("\n") };
  });
  return { slides: slides.slice(0, max), caption, over: Math.max(0, slides.length - max) };
}

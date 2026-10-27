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

// Finding a quoted sentence in a source's own text (PDF text layer or page
// HTML). Matching ignores case, spaces, punctuation and line-break hyphens:
// the stored source text and the original never agree on those.

export const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Where the quote sits: the whole of it when the source has it verbatim, else
// the longest run of its words that the source does have.
export function locate(pageText, quote) {
  const q = norm(quote);
  if (q.length < 20) return null;
  const at = pageText.indexOf(q);
  if (at >= 0) return { start: at, end: at + q.length };
  for (const win of [120, 80, 50, 30]) {
    if (q.length < win) continue;
    for (let off = 0; off + win <= q.length; off += Math.max(10, Math.floor(win / 3))) {
      const i = pageText.indexOf(q.slice(off, off + win));
      if (i < 0) continue;
      // Grow the match forward while page and quote keep agreeing.
      let end = i + win;
      let qi = off + win;
      while (qi < q.length && end < pageText.length && pageText[end] === q[qi]) {
        end++;
        qi++;
      }
      return { start: i, end };
    }
  }
  return null;
}

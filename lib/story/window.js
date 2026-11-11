// Which part of a source a story shows (Hamed, Nov 11 2026: "I need the full screenshot of the news
// with the important sentences highlighted, not a screenshot of one or two sentences"). The story
// shows the article from its headline down, as much as fits the page's shape, with every highlighted
// sentence in it. When the highlights sit too far below the headline for one piece, the shot is the
// headline's piece and the highlights' piece, one above the other with a gap between them: both are
// photographs of the page, only the middle is left out.
import sharp from "sharp";

// top/bottom: the article's extent; head: where the headline ends (0 = none); marks: the
// highlights' top and bottom; maxH: the tallest shot the story has room for. All in the same units.
export function planWindow({ top, bottom, head = 0, markTop, markBottom, maxH, pad = 14 }) {
  const end = Math.max(bottom, markBottom + pad);
  if (markBottom + pad - top <= maxH) return [[top, Math.min(end, top + maxH)]];
  // headline piece: the headline and what sits right under it (byline, date)
  const headH = Math.min(maxH * 0.3, Math.max(head ? head - top + pad * 6 : 0, maxH * 0.18));
  const gap = pad * 2;
  const bodyH = maxH - headH - gap;
  const span = markBottom - markTop;
  // the highlights a little below the piece's top, so the lines before them show what they follow
  let y0 = span + pad * 2 >= bodyH ? markTop - pad : markTop - Math.min((bodyH - span) * 0.35, pad * 8);
  y0 = Math.max(top + headH + gap, y0);
  const y1 = Math.min(end, y0 + bodyH);
  // the two pieces met: one window after all
  if (y0 <= top + headH + gap) return [[top, Math.min(end, top + maxH)]];
  return [[top, top + headH], [y0, y1]];
}

// The pieces (same width) one above the other on white, a light band with a dotted line between
// them where text was left out.
export async function stackPieces(pieces, unit = 2) {
  if (pieces.length === 1) return sharp(pieces[0]).jpeg({ quality: 88 }).toBuffer();
  const metas = await Promise.all(pieces.map((p) => sharp(p).metadata()));
  const width = Math.max(...metas.map((m) => m.width));
  const gap = Math.round(18 * unit);
  const height = metas.reduce((s, m) => s + m.height, 0) + gap * (pieces.length - 1);
  const band = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${gap}"><rect width="100%" height="100%" fill="#eef0f2"/><line x1="${gap}" x2="${width - gap}" y1="${gap / 2}" y2="${gap / 2}" stroke="#a9b0b8" stroke-width="${Math.max(2, unit * 1.5)}" stroke-dasharray="${unit * 3} ${unit * 5}" stroke-linecap="round"/></svg>`
  );
  const layers = [];
  let y = 0;
  pieces.forEach((p, i) => {
    layers.push({ input: p, top: y, left: 0 });
    y += metas[i].height;
    if (i < pieces.length - 1) {
      layers.push({ input: band, top: y, left: 0 });
      y += gap;
    }
  });
  return sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

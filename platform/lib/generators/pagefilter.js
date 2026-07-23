import { completeJson } from '../anthropic';

/**
 * Ask Claude which pages of a document to KEEP when assembling a submission
 * package section. Drops blank/near-blank pages and pages unrelated to the
 * section. Returns { keep: number[] (1-based), dropped: [{page, reason}] }.
 * Best-effort: on any error or ambiguity, keeps all pages.
 */
export async function selectRelevantPages(bytes, mime, sectionName, pageCount) {
  // Single-image uploads are always one page — nothing to filter.
  if (mime !== 'application/pdf' || !pageCount || pageCount <= 1) {
    return { keep: null, dropped: [] };
  }

  const block = {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') },
  };
  const instruction = `You are assembling a Canadian study-permit submission package.
This document (${pageCount} pages) is being placed in the "${sectionName}" section.

Return JSON: { "keep": [1-based page numbers to include], "drop": [{"page": N, "reason": "..."}] }

Rules:
- KEEP every page that has real, readable content belonging in "${sectionName}".
- DROP a page only if it is blank / near-blank (no meaningful content), a pure
  scanner separator, or clearly unrelated to "${sectionName}".
- Pages are 1-indexed from 1 to ${pageCount}. When unsure, KEEP the page.
- Never drop every page.`;

  try {
    const res = await completeJson({
      content: [{ type: 'text', text: instruction }, block],
      maxTokens: 800,
    });
    let keep = Array.isArray(res.keep) ? res.keep.map((n) => Number(n)).filter((n) => n >= 1 && n <= pageCount) : null;
    keep = keep && keep.length ? [...new Set(keep)].sort((a, b) => a - b) : null;
    // Safety: if the model kept nothing, keep everything.
    if (!keep || !keep.length) return { keep: null, dropped: [] };
    const dropped = Array.isArray(res.drop) ? res.drop : [];
    return { keep, dropped };
  } catch {
    return { keep: null, dropped: [] };
  }
}

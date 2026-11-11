import { getLexbaseItems, getLexbasePdfs, getLexbaseIssueText } from "../../../../../lib/newsletter/lexbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The issue's own PDF, as it came in the email (Hamed, Nov 11 2026: "I need to see the original file
// when the source is a PDF"). Fetched again from the mailbox (getLexbasePdfs keeps the last few
// issues in memory). Behind the Topic Engine's login like the rest of /api/lexbase: it is a paid
// newsletter, shown for the team's own reading. ?i= picks one when the email carries several.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(request, { params }) {
  await getLexbaseItems({ waitMs: 8000 });
  let pdfs;
  try {
    pdfs = await getLexbasePdfs(params.issue);
  } catch (e) {
    return new Response(String((e && e.message) || e), { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const q = new URL(request.url).searchParams;
  const subject = (getLexbaseIssueText(params.issue) || {}).subject || `Lexbase ${params.issue}`;
  if (pdfs.length > 1 && !q.has("i")) {
    const links = pdfs.map((_, i) => `<li><a href="?i=${i}">${esc(subject)} · PDF ${i + 1}</a></li>`).join("");
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><body style="font-family:system-ui,sans-serif;padding:18px;line-height:2"><h1 style="font-size:19px">${esc(subject)}</h1><ul>${links}</ul></body>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }
  const i = Math.min(pdfs.length - 1, Math.max(0, Number(q.get("i")) || 0));
  const name = `lexbase-${String(params.issue).replace(/[^\w-]/g, "")}${pdfs.length > 1 ? "-" + (i + 1) : ""}.pdf`;
  return new Response(pdfs[i], {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, max-age=600" },
  });
}

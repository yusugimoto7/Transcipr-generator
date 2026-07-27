import { gdocEnabled, createGoogleDoc } from "../../../lib/gdoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a Google Doc from a generated article (title + HTML body).
export async function POST(request) {
  if (!gdocEnabled()) {
    return Response.json(
      {
        error:
          "Google Docs is not configured. Set SHEET_WEBHOOK_URL and SHEET_SECRET (the same Apps Script web app as the Sheet).",
      },
      { status: 500 }
    );
  }

  let article;
  try {
    ({ article } = await request.json());
  } catch (_) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!article || !article.title_fa || !article.content_html) {
    return Response.json({ error: "missing article" }, { status: 400 });
  }

  try {
    const r = await createGoogleDoc({
      title: article.title_fa,
      html: article.content_html,
    });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}

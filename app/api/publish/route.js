import { wordpressEnabled, createDraft } from "../../../lib/wordpress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!wordpressEnabled()) {
    return Response.json(
      {
        error:
          "WordPress is not configured. Set WP_USER and WP_APP_PASSWORD (a WordPress Application Password) in your environment.",
      },
      { status: 500 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const article = payload?.article;
  if (!article || !article.title_fa || !article.content_html) {
    return Response.json({ error: "missing article" }, { status: 400 });
  }

  try {
    const result = await createDraft(article);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 502 });
  }
}

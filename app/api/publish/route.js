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
    const code = e?.wpCode || "";
    const status = e?.wpStatus || 0;
    let hint = "";
    if (code === "rest_cannot_create" || status === 403) {
      // Auth succeeded but the WordPress user can't create posts.
      hint =
        " — کاربری که برای WP_USER تنظیم کردی اجازهٔ ساخت نوشته نداره. نقش این کاربر باید Author/Editor/Administrator باشه و Application Password هم باید متعلق به همون کاربر باشه (نه یک کاربر دیگه).";
    } else if (status === 401) {
      hint =
        " — نام کاربری یا Application Password اشتباهه. مقدار WP_USER باید نام‌کاربری وردپرس باشه و WP_APP_PASSWORD یک «Application Password» (نه رمز ورود معمولی).";
    }
    return Response.json(
      { error: String(e?.message || e) + hint, code, status },
      { status: 502 }
    );
  }
}

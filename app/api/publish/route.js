import { wordpressEnabled, createDraft, whoAmI, testDraftRoundtrip } from "../../../lib/wordpress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET diagnostic — open /api/publish in a browser. Checks who WordPress thinks
// we are, then runs a real create-draft-and-delete round trip, and returns a
// concrete verdict + the exact fix. Exposes no secrets.
export async function GET() {
  const out = { configured: wordpressEnabled() };
  if (!out.configured) {
    out.verdict = "NOT CONFIGURED";
    out.fix = "Set WP_USER and WP_APP_PASSWORD in Render → Environment.";
    return Response.json(out);
  }

  const me = await whoAmI();
  out.identity = me;

  if (!me.ok) {
    if (me.code === "invalid_username") {
      out.verdict = "WRONG USERNAME";
      out.fix =
        "WP_USER اشتباهه. باید «نام کاربری» وردپرس باشه (همونی که باهاش لاگین می‌کنی، مثلاً Hamed) — نه نام نمایشی و نه ایمیلِ اشتباه.";
    } else if (me.code === "incorrect_password") {
      out.verdict = "WRONG APPLICATION PASSWORD";
      out.fix =
        "WP_APP_PASSWORD اشتباه یا باطل شده. توی وردپرس: Users → پروفایل همون کاربر → Application Passwords → یک پسورد جدید بساز و کاملش رو (با فاصله‌ها اشکالی نداره) در Render بذار.";
    } else if (me.code === "rest_not_logged_in" || me.status === 401) {
      out.verdict = "AUTH HEADER STRIPPED BY HOST";
      out.fix =
        "هاست شما هدر Authorization رو حذف می‌کنه (خیلی رایج روی هاست اشتراکی). این خط‌ها رو به ابتدای فایل .htaccess سایت اضافه کن:\nRewriteEngine On\nRewriteCond %{HTTP:Authorization} ^(.*)\nRewriteRule ^(.*) - [E=HTTP_AUTHORIZATION:%1]";
    } else if (me.code === "network") {
      out.verdict = "SITE UNREACHABLE";
      out.fix = "اتصال به سایت برقرار نشد: " + (me.message || "");
    } else {
      out.verdict = "AUTH FAILED (" + (me.code || me.status) + ")";
      out.fix =
        "اگر افزونهٔ امنیتی (Wordfence، iThemes و…) داری، REST API یا Application Passwords رو ممکنه بسته باشه — موقتاً غیرفعالش کن و دوباره تست بگیر.";
    }
    return Response.json(out);
  }

  // Auth works — now prove (or disprove) draft creation end-to-end.
  const test = await testDraftRoundtrip();
  out.draft_test = test;

  if (test.ok) {
    out.verdict = "✅ WORKING — publish is fixed";
    out.fix =
      "همه‌چیز درسته. یک پیش‌نویس تستی ساخته و بلافاصله حذف شد. دکمهٔ «انتشار پیش‌نویس» الان کار می‌کنه.";
  } else if (test.code === "rest_cannot_create") {
    const roles = (me.roles || []).join(", ") || "(none)";
    out.verdict = "ROLE TOO LOW (current: " + roles + ")";
    out.fix =
      "کاربر «" + (me.username || "") + "» اجازهٔ ساخت نوشته نداره. توی وردپرس: Users → این کاربر → Role رو بذار Editor یا Administrator → Save. بعد همین صفحه رو رفرش کن تا ✅ ببینی.";
  } else {
    out.verdict = "CREATE FAILED (" + (test.code || test.status || test.step) + ")";
    out.fix =
      "احراز هویت درسته ولی ساخت نوشته رد میشه: " + (test.error || "") +
      " — معمولاً یک افزونهٔ امنیتی REST API رو محدود کرده. موقتاً غیرفعالش کن و دوباره تست بگیر.";
  }
  return Response.json(out);
}

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

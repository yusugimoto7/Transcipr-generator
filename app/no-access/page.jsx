"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { s, api } from "../editing/ui";
import { SECTION_NAMES } from "../../lib/editing/access";
import { L, uiDir } from "../../lib/i18n";

function NoAccess() {
  const q = useSearchParams();
  const denied = q.get("denied");
  // the middleware sends the section's key; an older link may still carry its English name
  const what = denied ? (SECTION_NAMES[denied] ? L(SECTION_NAMES[denied]) : denied) : "";
  const out = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/editing/login";
  };
  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.narrow}`} dir={uiDir()}>
        <h1 className={s.title}>{L("هنوز دسترسی نداری", "No access yet")}</h1>
        <p className={s.muted}>
          {what ? L(`حساب تو نمی‌تونه ${what} رو باز کنه.`, `Your account cannot open ${what}.`) : L("هنوز هیچ بخشی از برنامه برای حسابت روشن نشده.", "Your account has no part of the app switched on yet.")}{" "}
          {L("حامد در صفحهٔ تیم انتخاب می‌کنه هر کس چه بخش‌هایی رو باز کنه.", "Hamed chooses what each person can open on the Team page.")}
        </p>
        <button className={s.btn} onClick={out}>
          {L("خروج", "Sign out")}
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <NoAccess />
    </Suspense>
  );
}

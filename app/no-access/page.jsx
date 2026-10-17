"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { s, api } from "../editing/ui";

function NoAccess() {
  const q = useSearchParams();
  const what = q.get("denied");
  const out = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/editing/login";
  };
  return (
    <div className={s.page}>
      <div className={`${s.card} ${s.narrow}`}>
        <h1 className={s.title}>No access yet</h1>
        <p className={s.muted}>
          {what ? `Your account cannot open ${what}.` : "Your account has no part of the app switched on yet."} Hamed chooses what each person can open on the Team page.
        </p>
        <button className={s.btn} onClick={out}>
          Sign out
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

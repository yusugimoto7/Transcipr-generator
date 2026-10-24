"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, s } from "../ui";
import { homeOf } from "../../../lib/editing/access";
import { L, uiDir, getLang, chooseLang } from "../../../lib/i18n";
import { Languages } from "lucide-react";

function Login() {
  const q = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await api("/auth/login", { method: "POST", body: { email, password } });
      const next = q.get("next") || "";
      window.location.href = user.must_change ? "/editing/password" : /^\/(?![\/\\])/.test(next) ? next : homeOf(user.ax || []);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className={s.page}>
      <form className={`${s.card} ${s.narrow}`} onSubmit={submit} dir={uiDir()}>
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <img src="/brand/logo-on-light.png" alt="Sugimoto Visa" style={{ height: 40, width: "auto" }} />
          {/* no top bar before signing in, so the language is chosen here */}
          <button type="button" className={s.linkBtn} onClick={() => chooseLang(getLang() === "fa" ? "en" : "fa")} title={L("زبان", "Language")}>
            <Languages size={15} aria-hidden style={{ verticalAlign: "-3px" }} /> {getLang() === "fa" ? "English" : "فارسی"}
          </button>
        </div>
        <h1 className={s.title} style={{ fontSize: 18 }}>{L("ورود", "Sign in")}</h1>
        <p className={s.muted}>{L("یک ورود برای تاپیک انجین، تقویم محتوا و تدوین ویدیو. با ایمیل و رمز عبوری که حامد بهت داده وارد شو.", "One sign-in for the Topic Engine, the content calendar and Video Editing. Use the email and password Hamed gave you.")}</p>
        <label className={s.field}>
          <span>{L("ایمیل", "Email")}</span>
          <input id="email" className={s.input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field}>
          <span>{L("رمز عبور", "Password")}</span>
          <input id="password" className={s.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className={s.error}>{error}</div>}
        <button className={`${s.btn} ${s.primary}`} disabled={busy}>
          {busy ? L("در حال ورود…", "Signing in…") : L("ورود", "Sign in")}
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

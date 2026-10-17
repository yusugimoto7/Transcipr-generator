"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, s } from "../ui";
import { homeOf } from "../../../lib/editing/access";

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
      <form className={`${s.card} ${s.narrow}`} onSubmit={submit}>
        <h1 className={s.title}>Sugimoto Visa</h1>
        <p className={s.muted}>One sign-in for the Topic Engine, the content calendar and Video Editing. Use the email and password Hamed gave you.</p>
        <label className={s.field}>
          <span>Email</span>
          <input id="email" className={s.input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={s.field}>
          <span>Password</span>
          <input id="password" className={s.input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className={s.error}>{error}</div>}
        <button className={`${s.btn} ${s.primary}`} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
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

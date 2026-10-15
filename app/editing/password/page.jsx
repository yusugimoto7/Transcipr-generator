"use client";

import { useState } from "react";
import { api, s, Shell } from "../ui";

function Form({ user }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (next !== again) return setMsg({ error: "the two new passwords are different", ok: "" });
    setBusy(true);
    try {
      await api("/auth/password", { method: "POST", body: { current, next } });
      if (user.must_change) {
        window.location.href = "/editing";
        return;
      }
      setMsg({ error: "", ok: "Password changed." });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setMsg({ error: err.message, ok: "" });
    }
    setBusy(false);
  };
  return (
    <form className={`${s.card} ${s.narrow}`} onSubmit={submit}>
      <h1 className={s.title}>{user.must_change ? "Choose your own password" : "Change password"}</h1>
      {user.must_change && <p className={s.muted}>You signed in with a temporary password. Choose your own to continue.</p>}
      <label className={s.field}>
        <span>{user.must_change ? "Temporary password" : "Current password"}</span>
        <input id="current" className={s.input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className={s.field}>
        <span>New password (at least 10 characters)</span>
        <input id="next" className={s.input} type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className={s.field}>
        <span>New password again</span>
        <input id="again" className={s.input} type="password" autoComplete="new-password" minLength={10} value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      {msg.error && <div className={s.error}>{msg.error}</div>}
      {msg.ok && <div className={s.ok}>{msg.ok}</div>}
      <button className={`${s.btn} ${s.primary}`} disabled={busy}>
        Save password
      </button>
    </form>
  );
}

export default function Page() {
  return <Shell>{(user) => <Form user={user} />}</Shell>;
}

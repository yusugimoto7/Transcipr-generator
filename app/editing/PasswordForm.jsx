"use client";

// The password form: alone on /editing/password (a first sign-in with a temporary password is sent
// there) and as a section of Settings.
import { useState } from "react";
import { api, s } from "./ui";
import { L, uiDir } from "../../lib/i18n";

export default function PasswordForm({ user, inSettings = false }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (next !== again) return setMsg({ error: L("دو رمز جدید با هم یکی نیستن", "the two new passwords are different"), ok: "" });
    setBusy(true);
    try {
      await api("/auth/password", { method: "POST", body: { current, next } });
      if (user.must_change) {
        window.location.href = "/editing";
        return;
      }
      setMsg({ error: "", ok: L("رمز عبور عوض شد.", "Password changed.") });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setMsg({ error: err.message, ok: "" });
    }
    setBusy(false);
  };
  return (
    <form className={inSettings ? s.card : `${s.card} ${s.narrow}`} onSubmit={submit} dir={uiDir()}>
      {inSettings ? <h2 className={s.h2}>{L("تغییر رمز عبور", "Change password")}</h2> : <h1 className={s.title}>{user.must_change ? L("رمز عبور خودت رو انتخاب کن", "Choose your own password") : L("تغییر رمز عبور", "Change password")}</h1>}
      {user.must_change && <p className={s.muted}>{L("با یک رمز موقت وارد شدی. برای ادامه، رمز خودت رو انتخاب کن.", "You signed in with a temporary password. Choose your own to continue.")}</p>}
      <label className={s.field}>
        <span>{user.must_change ? L("رمز موقت", "Temporary password") : L("رمز فعلی", "Current password")}</span>
        <input id="current" className={s.input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className={s.field}>
        <span>{L("رمز جدید (دست‌کم ۱۰ نویسه)", "New password (at least 10 characters)")}</span>
        <input id="next" className={s.input} type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
      </label>
      <label className={s.field}>
        <span>{L("تکرار رمز جدید", "New password again")}</span>
        <input id="again" className={s.input} type="password" autoComplete="new-password" minLength={10} value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      {msg.error && <div className={s.error}>{msg.error}</div>}
      {msg.ok && <div className={s.ok}>{msg.ok}</div>}
      <button className={`${s.btn} ${s.primary}`} disabled={busy}>
        {L("ذخیرهٔ رمز عبور", "Save password")}
      </button>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api, s, Shell, when } from "../ui";
import { SECTIONS } from "../../../lib/editing/access";
import { L, uiDir } from "../../../lib/i18n";

// Pairs (lib/i18n.js), read with L() when drawn.
const SHORT = {
  topics: ["تاپیک انجین", "Topic Engine"],
  calendar: ["تقویم محتوا", "Content calendar"],
  editing: ["تدوین ویدیو", "Video Editing"],
  publishing: ["انتشار", "Publishing"],
  learn: ["یاد دادن به برنامه", "Teach the app"],
};
const HINT = {
  topics: ["موضوع‌ها، اسکریپت‌ها، کاروسل‌ها، استوری‌ها، مقاله‌ها", "topics, scripts, carousels, stories, articles"],
  calendar: ["برنامه‌ریزی و زمان‌بندی پست‌ها (تأیید با توئه)", "plan and schedule posts (you approve)"],
  editing: ["پروژه‌های ویدیوی خودش", "their own video projects"],
  publishing: ["ارسال به Telegram و WordPress از تاپیک انجین", "send to Telegram and WordPress from the Topic Engine"],
  learn: ["«از این یادداشت یاد بگیر» زیر یادداشت‌های ویرایش", "\"learn from this note\" under edit notes"],
};

function Team({ user }) {
  const [users, setUsers] = useState(null);
  const blank = { name: "", email: "", temp_password: "", may_approve_own: false, access: { topics: true, calendar: true, editing: true, publishing: false, learn: false } };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [reset, setReset] = useState({});
  const load = () => api("/team").then((d) => setUsers(d.users)).catch((e) => setMsg({ error: e.message, ok: "" }));
  useEffect(() => {
    load();
  }, []);
  if (user.role !== "admin") return <p className={s.muted} dir={uiDir()}>{L("فقط مدیر تیم رو مدیریت می‌کنه.", "Only the admin manages the team.")}</p>;
  const add = async (e) => {
    e.preventDefault();
    try {
      await api("/team", { method: "POST", body: { name: f.name, email: f.email, password: f.temp_password, may_approve_own: f.may_approve_own, access: f.access } });
      setMsg({ error: "", ok: L(`${f.name} حالا می‌تونه با ${f.email} و رمز موقت وارد بشه. در اولین ورود، رمز خودش رو انتخاب می‌کنه.`, `${f.name} can now sign in with ${f.email} and the temporary password. They choose their own at first sign-in.`) });
      setF(blank);
      load();
    } catch (err) {
      setMsg({ error: err.message, ok: "" });
    }
  };
  const patch = async (id, body, done) => {
    try {
      await api("/team/" + id, { method: "PATCH", body });
      setMsg({ error: "", ok: done });
      load();
    } catch (err) {
      setMsg({ error: err.message, ok: "" });
    }
  };
  return (
    <div dir={uiDir()} style={{ display: "contents" }}>
      <h1 className={s.title}>{L("تیم", "Team")}</h1>
      {msg.error && <div className={s.error}>{msg.error}</div>}
      {msg.ok && <div className={s.ok}>{msg.ok}</div>}
      <div className={s.card}>
        {!users ? (
          <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{L("نام", "Name")}</th>
                  <th>{L("ایمیل", "Email")}</th>
                  <th>{L("نقش", "Role")}</th>
                  <th>{L("دسترسی به", "Can open")}</th>
                  <th>{L("تأیید برش‌های خودش", "May approve own cuts")}</th>
                  <th>{L("حساب", "Account")}</th>
                  <th>{L("رمز موقت جدید", "New temporary password")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.name}
                      <div className={s.muted}>
                        {L("اضافه‌شده", "added")} {when(u.created_at)}
                        {u.must_change ? L(" · هنوز رمزش رو انتخاب نکرده", " · has not chosen a password yet") : ""}
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.role === "admin" ? L("مدیر", "Admin") : L("عضو", "Member")}</td>
                    <td>
                      {u.role === "admin" ? (
                        L("همه‌چیز", "Everything")
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {SECTIONS.map((k) => {
                            const has = (u.ax || []).includes(k);
                            const next = Object.fromEntries(SECTIONS.map((x) => [x, x === k ? !has : (u.ax || []).includes(x)]));
                            return (
                              <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, whiteSpace: "nowrap" }} title={L(HINT[k])}>
                                <input
                                  id={`ax-${k}-${u.id}`}
                                  type="checkbox"
                                  checked={has}
                                  onChange={() =>
                                    patch(
                                      u.id,
                                      { access: next },
                                      has
                                        ? L(`${u.name} دیگه نمی‌تونه ${L(SHORT[k])} رو باز کنه (تا چند دقیقهٔ دیگه).`, `${u.name} can no longer open ${L(SHORT[k])} (within a few minutes).`)
                                        : L(`${u.name} حالا می‌تونه ${L(SHORT[k])} رو باز کنه (تا چند دقیقهٔ دیگه).`, `${u.name} can now open ${L(SHORT[k])} (within a few minutes).`)
                                    )
                                  }
                                />
                                {L(SHORT[k])}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      {u.role === "admin" ? (
                        L("همیشه", "Always")
                      ) : (
                        <input
                          id={"approve-" + u.id}
                          type="checkbox"
                          checked={!!u.may_approve_own}
                          onChange={(e) => patch(u.id, { may_approve_own: e.target.checked }, e.target.checked ? L(`${u.name} حالا می‌تونه برش‌های خودش رو تأیید کنه.`, `${u.name} may now approve their own cuts.`) : L(`از این به بعد دوباره حامد برش‌های ${u.name} رو تأیید می‌کنه.`, `Hamed approves ${u.name}'s cuts again.`))}
                        />
                      )}
                    </td>
                    <td>
                      {u.id === user.id ? (
                        L("خودت", "You")
                      ) : (
                        <button className={`${s.btn} ${u.active ? s.danger : ""}`} onClick={() => patch(u.id, { active: !u.active }, u.active ? L(`حساب ${u.name} غیرفعال شد و از برنامه خارج شد.`, `${u.name} is disabled and signed out.`) : L(`${u.name} دوباره می‌تونه وارد بشه.`, `${u.name} can sign in again.`))}>
                          {u.active ? L("غیرفعال کردن", "Disable") : L("فعال کردن", "Enable")}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className={s.row}>
                        <input id={"reset-" + u.id} className={s.input} style={{ width: 150 }} type="text" placeholder={L("۱۰ نویسه یا بیشتر", "10+ characters")} value={reset[u.id] || ""} onChange={(e) => setReset({ ...reset, [u.id]: e.target.value })} />
                        <button className={s.btn} disabled={(reset[u.id] || "").length < 10} onClick={() => patch(u.id, { temp_password: reset[u.id] }, L(`${u.name} باید با رمز موقت جدید وارد بشه و رمز خودش رو انتخاب کنه.`, `${u.name} must sign in with the new temporary password and choose their own.`)).then(() => setReset({ ...reset, [u.id]: "" }))}>
                          {L("ثبت", "Set")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <form className={s.card} onSubmit={add} style={{ maxWidth: 640 }}>
        <h2 className={s.h2}>{L("افزودن عضو تیم", "Add a team member")}</h2>
        <div className={s.row}>
          <label className={`${s.field} ${s.grow}`}>
            <span>{L("نام", "Name")}</span>
            <input id="new-name" className={s.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label className={`${s.field} ${s.grow}`}>
            <span>{L("ایمیل", "Email")}</span>
            <input id="new-email" className={s.input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
        </div>
        <label className={s.field}>
          <span>{L("رمز موقت (خودت بهش بده؛ دست‌کم ۱۰ نویسه)", "Temporary password (give it to them yourself; at least 10 characters)")}</span>
          <input id="new-pass" className={s.input} value={f.temp_password} onChange={(e) => setF({ ...f, temp_password: e.target.value })} minLength={10} required />
        </label>
        <div className={s.field}>
          <span>{L("دسترسی به", "Can open")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {SECTIONS.map((k) => (
              <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }} title={L(HINT[k])}>
                <input id={"new-ax-" + k} type="checkbox" checked={!!f.access[k]} onChange={(e) => setF({ ...f, access: { ...f.access, [k]: e.target.checked } })} />
                {L(SHORT[k])}
              </label>
            ))}
          </div>
        </div>
        <label className={s.row} style={{ fontSize: 14 }}>
          <input id="new-approve" type="checkbox" checked={f.may_approve_own} onChange={(e) => setF({ ...f, may_approve_own: e.target.checked })} />
          {L("می‌تونه برش‌های خودش رو تأیید کنه (خاموش: تأیید با توئه)", "May approve their own cuts (off: you approve)")}
        </label>
        <div>
          <button className={`${s.btn} ${s.primary}`}>{L("افزودن عضو", "Add member")}</button>
        </div>
      </form>
    </div>
  );
}

export default function Page() {
  return <Shell>{(user) => <Team user={user} />}</Shell>;
}

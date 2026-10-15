"use client";

import { useEffect, useState } from "react";
import { api, s, Shell, when } from "../ui";

function Team({ user }) {
  const [users, setUsers] = useState(null);
  const [f, setF] = useState({ name: "", email: "", temp_password: "", may_approve_own: false });
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [reset, setReset] = useState({});
  const load = () => api("/team").then((d) => setUsers(d.users)).catch((e) => setMsg({ error: e.message, ok: "" }));
  useEffect(() => {
    load();
  }, []);
  if (user.role !== "admin") return <p className={s.muted}>Only the admin manages the team.</p>;
  const add = async (e) => {
    e.preventDefault();
    try {
      await api("/team", { method: "POST", body: { name: f.name, email: f.email, password: f.temp_password, may_approve_own: f.may_approve_own } });
      setMsg({ error: "", ok: `${f.name} can now sign in with ${f.email} and the temporary password. They choose their own at first sign-in.` });
      setF({ name: "", email: "", temp_password: "", may_approve_own: false });
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
    <>
      <h1 className={s.title}>Team</h1>
      {msg.error && <div className={s.error}>{msg.error}</div>}
      {msg.ok && <div className={s.ok}>{msg.ok}</div>}
      <div className={s.card}>
        {!users ? (
          <p className={s.muted}>Loading…</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>May approve own cuts</th>
                  <th>Account</th>
                  <th>New temporary password</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.name}
                      <div className={s.muted}>
                        added {when(u.created_at)}
                        {u.must_change ? " · has not chosen a password yet" : ""}
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.role === "admin" ? "Admin" : "Member"}</td>
                    <td>
                      {u.role === "admin" ? (
                        "Always"
                      ) : (
                        <input
                          id={"approve-" + u.id}
                          type="checkbox"
                          checked={!!u.may_approve_own}
                          onChange={(e) => patch(u.id, { may_approve_own: e.target.checked }, e.target.checked ? `${u.name} may now approve their own cuts.` : `Hamed approves ${u.name}'s cuts again.`)}
                        />
                      )}
                    </td>
                    <td>
                      {u.id === user.id ? (
                        "You"
                      ) : (
                        <button className={`${s.btn} ${u.active ? s.danger : ""}`} onClick={() => patch(u.id, { active: !u.active }, u.active ? `${u.name} is disabled and signed out.` : `${u.name} can sign in again.`)}>
                          {u.active ? "Disable" : "Enable"}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className={s.row}>
                        <input id={"reset-" + u.id} className={s.input} style={{ width: 150 }} type="text" placeholder="10+ characters" value={reset[u.id] || ""} onChange={(e) => setReset({ ...reset, [u.id]: e.target.value })} />
                        <button className={s.btn} disabled={(reset[u.id] || "").length < 10} onClick={() => patch(u.id, { temp_password: reset[u.id] }, `${u.name} must sign in with the new temporary password and choose their own.`).then(() => setReset({ ...reset, [u.id]: "" }))}>
                          Set
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
        <h2 className={s.h2}>Add a team member</h2>
        <div className={s.row}>
          <label className={`${s.field} ${s.grow}`}>
            <span>Name</span>
            <input id="new-name" className={s.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label className={`${s.field} ${s.grow}`}>
            <span>Email</span>
            <input id="new-email" className={s.input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
        </div>
        <label className={s.field}>
          <span>Temporary password (give it to them yourself; at least 10 characters)</span>
          <input id="new-pass" className={s.input} value={f.temp_password} onChange={(e) => setF({ ...f, temp_password: e.target.value })} minLength={10} required />
        </label>
        <label className={s.row} style={{ fontSize: 14 }}>
          <input id="new-approve" type="checkbox" checked={f.may_approve_own} onChange={(e) => setF({ ...f, may_approve_own: e.target.checked })} />
          May approve their own cuts (off: you approve)
        </label>
        <div>
          <button className={`${s.btn} ${s.primary}`}>Add member</button>
        </div>
      </form>
    </>
  );
}

export default function Page() {
  return <Shell>{(user) => <Team user={user} />}</Shell>;
}

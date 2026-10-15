"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, when, ACTIVE } from "./ui";

const KIND = { reel: "Reel", youtube: "YouTube", course: "Course" };

function Projects({ user }) {
  const admin = user.role === "admin";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState("");
  const [team, setTeam] = useState([]);
  useEffect(() => {
    if (admin) api("/team").then((d) => setTeam(d.users)).catch(() => {});
  }, [admin]);
  useEffect(() => {
    let stop = false;
    const load = () =>
      api("/projects" + (owner ? "?owner=" + owner : ""))
        .then((d) => !stop && setData(d.projects))
        .catch((e) => !stop && setError(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [owner]);
  return (
    <>
      <div className={s.row}>
        <h1 className={`${s.title} ${s.grow}`}>{admin ? "All projects" : "My projects"}</h1>
        {admin && (
          <select id="owner" className={s.select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
            <option value="">Everyone</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <Link href="/editing/new" className={`${s.btn} ${s.primary}`} style={{ textDecoration: "none" }}>
          New project
        </Link>
      </div>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.card}>
        {!data ? (
          <p className={s.muted}>Loading…</p>
        ) : !data.length ? (
          <p className={s.muted}>No projects yet. Start one with a Drive link to raw footage.</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  {admin && <th>Owner</th>}
                  <th>Kind</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/editing/p/${p.id}`}>{p.title}</Link>
                      {p.topic && <div className={s.muted}>{p.topic}</div>}
                    </td>
                    {admin && <td>{p.owner_name}</td>}
                    <td>{KIND[p.kind] || p.kind}</td>
                    <td>{p.latest ? <Pill status={p.latest.status} /> : ""}</td>
                    <td>v{p.latest_version}</td>
                    <td>{when(p.latest?.updated_at || p.created_at)}{p.latest && ACTIVE.includes(p.latest.status) ? " · working" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default function Page() {
  return <Shell>{(user) => <Projects user={user} />}</Shell>;
}

"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, when, ACTIVE, Avatar } from "./ui";

const KIND = { reel: "Reel", youtube: "YouTube", course: "Course" };

// The projects as a board, one list per stage, so the team sees at a glance what waits for whom.
const COLUMNS = [
  ["working", "Being cut", (st) => ACTIVE.includes(st) || !st],
  ["review", "Ready for review", (st) => st === "review"],
  ["approved", "Approved", (st) => st === "approved"],
  ["failed", "Needs attention", (st) => st === "failed"],
];
const EMPTY = { working: "Nothing being cut right now.", review: "Nothing waiting for review.", approved: "No approved videos yet.", failed: "Nothing failed." };

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
  const people = Object.fromEntries(team.map((u) => [u.id, u]));
  const cols = COLUMNS.map(([k, name, test]) => [k, name, (data || []).filter((p) => test(p.latest ? p.latest.status : ""))]);
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
          + New project
        </Link>
      </div>
      {error && <div className={s.error}>{error}</div>}
      {!data ? (
        <p className={s.muted}>Loading…</p>
      ) : !data.length ? (
        <div className={s.card}>
          <p className={s.muted}>No projects yet. Start one with a Drive link to raw footage: the rough cut comes back here for review.</p>
        </div>
      ) : (
        <div className={s.kb}>
          {cols.map(([k, name, items]) => (
            <section key={k} className={s.kbList} aria-label={name}>
              <div className={s.kbHead}>
                <span className={`${s.kbDot} ${s["d_" + k]}`} />
                <span className={s.grow}>{name}</span>
                <span className={s.kbCount}>{items.length}</span>
              </div>
              <div className={s.kbCards}>
                {items.map((p) => {
                  const st = p.latest ? p.latest.status : "";
                  const prev = p.latest && p.latest.result && p.latest.result.preview;
                  const owner = people[p.owner_id] || { id: p.owner_id, name: p.owner_name };
                  return (
                    <Link key={p.id} href={`/editing/p/${p.id}`} className={s.kbCard}>
                      {prev && prev.id ? (
                        <span className={s.cover} style={{ backgroundImage: `url(https://drive.google.com/thumbnail?id=${prev.id}&sz=w400)` }}>
                          <span className={s.play}>▶</span>
                        </span>
                      ) : null}
                      <span className={s.kbLabels}>
                        <span className={`${s.kbLabel} ${s["k_" + p.kind] || ""}`}>{KIND[p.kind] || p.kind}</span>
                      </span>
                      <span className={s.kbTitle} dir="auto">{p.title}</span>
                      {p.topic && <span className={`${s.kbTopic} ${/[\u0600-\u06FF]/.test(p.topic) ? s.rtl : ""}`}>{p.topic}</span>}
                      <span className={s.kbBadges}>
                        {st && <Pill status={st} />}
                        <span className={s.kbBadge}>v{p.latest_version}</span>
                        <span className={s.kbBadge}><Clock size={12} aria-hidden /> {when(p.latest?.updated_at || p.created_at)}</span>
                        {ACTIVE.includes(st) && <span className={`${s.kbBadge} ${s.pulse}`}>working…</span>}
                        <span className={s.grow} />
                        {admin && <Avatar user={owner} size={24} />}
                      </span>
                    </Link>
                  );
                })}
                {!items.length && <span className={s.kbEmpty}>{EMPTY[k]}</span>}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <Shell wide>{(user) => <Projects user={user} />}</Shell>;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill } from "../ui";

// Topics as the Video Editing section sees them: the topic named on each project, with the
// projects made for it. A member sees only their own.
function Topics({ user }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/projects")
      .then(({ projects }) => {
        const m = new Map();
        for (const p of projects) {
          const k = p.topic || "No topic";
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(p);
        }
        setGroups([...m.entries()]);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h1 className={s.title}>{user.role === "admin" ? "Topics" : "My topics"}</h1>
      {error && <div className={s.error}>{error}</div>}
      {!groups ? (
        <p className={s.muted}>Loading…</p>
      ) : !groups.length ? (
        <p className={s.muted}>No topics yet. A topic appears here when a project names one.</p>
      ) : (
        groups.map(([topic, list]) => (
          <div key={topic} className={s.card}>
            <h2 className={s.h2}>{topic}</h2>
            <ul className={s.list}>
              {list.map((p) => (
                <li key={p.id}>
                  <Link href={`/editing/p/${p.id}`}>{p.title}</Link> {p.latest && <Pill status={p.latest.status} />}
                  {user.role === "admin" && p.owner_name ? <span className={s.muted}> · {p.owner_name}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </>
  );
}

export default function Page() {
  return <Shell>{(user) => <Topics user={user} />}</Shell>;
}

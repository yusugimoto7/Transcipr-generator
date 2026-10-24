"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill } from "../ui";
import { L, uiDir } from "../../../lib/i18n";

// Topics as the Video Editing section sees them: the topic named on each project, with the
// projects made for it. A member sees only their own.
function Topics({ user }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  // projects without a topic are grouped under this key and named when drawn
  const NONE = "\u0000none";
  useEffect(() => {
    api("/projects")
      .then(({ projects }) => {
        const m = new Map();
        for (const p of projects) {
          const k = p.topic || NONE;
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(p);
        }
        setGroups([...m.entries()]);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div dir={uiDir()} style={{ display: "contents" }}>
      <h1 className={s.title}>{user.role === "admin" ? L("موضوع‌ها", "Topics") : L("موضوع‌های من", "My topics")}</h1>
      {error && <div className={s.error}>{error}</div>}
      {!groups ? (
        <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>
      ) : !groups.length ? (
        <p className={s.muted}>{L("هنوز موضوعی نیست. وقتی پروژه‌ای موضوعی داشته باشه، اینجا نشون داده می‌شه.", "No topics yet. A topic appears here when a project names one.")}</p>
      ) : (
        groups.map(([topic, list]) => (
          <div key={topic} className={s.card}>
            <h2 className={s.h2} dir={topic === NONE ? undefined : "auto"}>{topic === NONE ? L("بدون موضوع", "No topic") : topic}</h2>
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
    </div>
  );
}

export default function Page() {
  return <Shell>{(user) => <Topics user={user} />}</Shell>;
}

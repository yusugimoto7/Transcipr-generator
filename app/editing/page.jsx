"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, when, ACTIVE, Avatar } from "./ui";
import { L, uiDir } from "../../lib/i18n";

// Display names as pairs (lib/i18n.js), read with L() when drawn.
const KIND = { reel: ["ریل", "Reel"], youtube: ["YouTube", "YouTube"], course: ["درس دوره", "Course"] };

// The projects as a board, one list per stage, so the team sees at a glance what waits for whom.
const COLUMNS = [
  ["working", ["در حال برش", "Being cut"], (st) => ACTIVE.includes(st) || !st],
  ["review", ["آمادهٔ بازبینی", "Ready for review"], (st) => st === "review"],
  ["approved", ["تأییدشده", "Approved"], (st) => st === "approved"],
  ["failed", ["نیاز به رسیدگی", "Needs attention"], (st) => st === "failed"],
];
const EMPTY = {
  working: ["الان چیزی در حال برش نیست.", "Nothing being cut right now."],
  review: ["چیزی منتظر بازبینی نیست.", "Nothing waiting for review."],
  approved: ["هنوز ویدیوی تأییدشده‌ای نیست.", "No approved videos yet."],
  failed: ["چیزی ناموفق نبوده.", "Nothing failed."],
};

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
    <div dir={uiDir()} style={{ display: "contents" }}>
      <div className={s.row}>
        <h1 className={`${s.title} ${s.grow}`}>{L("پروژه‌های تیم", "Team projects")}</h1>
        {admin && (
          <select id="owner" className={s.select} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label={L("صاحب پروژه", "Owner")}>
            <option value="">{L("همه", "Everyone")}</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <Link href="/editing/new" className={`${s.btn} ${s.primary}`} style={{ textDecoration: "none" }}>
          {L("+ پروژهٔ جدید", "+ New project")}
        </Link>
      </div>
      {error && <div className={s.error}>{error}</div>}
      {!data ? (
        <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>
      ) : !data.length ? (
        <div className={s.card}>
          <p className={s.muted}>{L("هنوز پروژه‌ای نیست. با لینک Google Drive فیلم خام یکی شروع کن: برش اولیه برای بازبینی همین‌جا برمی‌گرده.", "No projects yet. Start one with a Drive link to raw footage: the rough cut comes back here for review.")}</p>
        </div>
      ) : (
        // the board keeps its left-to-right order in both languages; only its words follow the language
        <div className={s.kb} dir="ltr">
          {cols.map(([k, name, items]) => (
            <section key={k} className={s.kbList} aria-label={L(name)}>
              <div className={s.kbHead} dir={uiDir()}>
                <span className={`${s.kbDot} ${s["d_" + k]}`} />
                <span className={s.grow}>{L(name)}</span>
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
                        <span className={`${s.kbLabel} ${s["k_" + p.kind] || ""}`}>{KIND[p.kind] ? L(KIND[p.kind]) : p.kind}</span>
                      </span>
                      <span className={s.kbTitle} dir="auto">{p.title}</span>
                      {p.topic && <span className={`${s.kbTopic} ${/[\u0600-\u06FF]/.test(p.topic) ? s.rtl : ""}`}>{p.topic}</span>}
                      <span className={s.kbBadges}>
                        {st && <Pill status={st} />}
                        <span className={s.kbBadge}>v{p.latest_version}</span>
                        <span className={s.kbBadge}><Clock size={12} aria-hidden /> {when(p.latest?.updated_at || p.created_at)}</span>
                        {ACTIVE.includes(st) && <span className={`${s.kbBadge} ${s.pulse}`}>{L("در حال کار…", "working…")}</span>}
                        <span className={s.grow} />
                        <Avatar user={owner} size={24} />
                      </span>
                    </Link>
                  );
                })}
                {!items.length && <span className={s.kbEmpty} dir={uiDir()}>{L(EMPTY[k])}</span>}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Shell wide>{(user) => <Projects user={user} />}</Shell>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Mixed, when } from "../ui";

const STATE = {
  proposed: ["Waiting for you", s.s_review],
  applying: ["Committing the rule", s.s_delivering],
  applied: ["In the rules", s.s_approved],
  rejected: ["Rejected", s.s_failed],
  stale: ["Out of date", s.s_failed],
  failed: ["Commit failed", s.s_failed],
};

function Edit({ e }) {
  return (
    <div className={s.diff}>
      <div className={s.muted}>{e.file}</div>
      <pre className={`${s.pre} ${s.diffOld}`} dir="auto">{e.old}</pre>
      <pre className={`${s.pre} ${s.diffNew}`} dir="auto">{e.new}</pre>
    </div>
  );
}

function Lesson({ l, reload }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [label, cls] = STATE[l.status] || [l.status, ""];
  const act = async (action) => {
    setBusy(action);
    setError("");
    try {
      await api(`/lessons/${l.id}`, { method: "POST", body: { action, note } });
      await reload();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
    setConfirm(false);
  };
  const open = l.status === "proposed" || l.status === "failed";
  return (
    <div className={s.card}>
      <div className={s.row}>
        <h2 className={`${s.h2} ${s.grow}`}>
          <Mixed text={l.title} />
        </h2>
        <span className={`${s.pill} ${cls}`}>{label}</span>
      </div>
      <div>
        <Mixed text={l.why} />
      </div>
      <div>
        <p className={s.muted}>
          From the corrections on <Link href={`/editing/p/${l.project_id}`}>{l.project_title}</Link>, version {l.version - 1} · proposed {when(l.created_at)}
        </p>
        <ul className={s.list}>
          {(l.corrections || []).map((c) => (
            <li key={c.id}>
              <b>{c.out}</b> <Mixed text={c.note} />
            </li>
          ))}
        </ul>
      </div>
      <details open={open}>
        <summary className={s.muted} style={{ cursor: "pointer" }}>
          The change, file by file (red is the rule now, green is what replaces it)
        </summary>
        {(l.edits || []).map((e, i) => (
          <Edit key={i} e={e} />
        ))}
      </details>
      {l.error && <div className={s.error}>{l.error}</div>}
      {l.status === "applied" && l.commit_url && (
        <div className={s.ok}>
          In the rules from the next video on.{" "}
          <a href={l.commit_url} target="_blank" rel="noreferrer">
            See the change
          </a>
        </div>
      )}
      {l.status === "rejected" && l.rejection && l.rejection.note && <p className={s.muted}>Rejected: {l.rejection.note}</p>}
      {(open || l.status === "stale") &&
        (confirm ? (
          <div className={s.row}>
            <span className={s.grow}>Make this the rule for every video from now on?</span>
            <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => act("approve")}>
              Yes, change the rule
            </button>
            <button className={s.btn} onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={s.row}>
            {open && (
              <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => setConfirm(true)}>
                Approve
              </button>
            )}
            <input className={`${s.input} ${s.grow}`} placeholder="Why not (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Why not" />
            <button className={s.btn} disabled={!!busy} onClick={() => act("reject")}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        ))}
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

// Rules taught to the Topic Engine's prompts from Hamed's notes ("learn from this note").
function ContentRules() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/content-lessons").then(setD).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const toggle = async (l) => {
    try {
      await api("/content-lessons", { method: "POST", body: { id: l.id, active: l.active === false } });
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <>
      <h2 className={s.h2} style={{ marginTop: 28 }}>Content rules</h2>
      <p className={s.rule}>
        Learned from your notes in the Topic Engine (ticked “از این یادداشت یاد بگیر”). Each rule goes into every later prompt of that kind of content. Switch one off and it stops being used. The matching skill file ({`.claude/skills/…`}) is updated from this list by the next development session.
      </p>
      {error && <div className={s.error}>{error}</div>}
      {!d && !error && <p className={s.muted}>Loading…</p>}
      {d && d.lessons.length === 0 && <p className={s.muted}>No rules yet.</p>}
      {d &&
        d.lessons.map((l) => (
          <div key={l.id} className={s.card} style={{ opacity: l.active === false ? 0.55 : 1 }}>
            <div className={s.row}>
              <b className={s.grow}>{(d.scopes[l.scope] || {}).name || l.scope}</b>
              <span className={s.muted}>{when(l.at)}</span>
              <button className={s.linkBtn} onClick={() => toggle(l)}>
                {l.active === false ? "Use again" : "Switch off"}
              </button>
            </div>
            <div dir="rtl">
              <Mixed text={l.rule_fa || l.rule_en} />
            </div>
            <div className={s.muted}>{l.rule_en}</div>
            <div className={s.muted} dir="auto">
              From the note: “{l.note}”{l.topic ? ` · ${l.topic}` : ""}
            </div>
          </div>
        ))}
    </>
  );
}

function Lessons({ user }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const load = useCallback(
    () =>
      api("/lessons")
        .then((x) => {
          setD(x);
          setError("");
        })
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    if (user.role === "admin") load();
  }, [load, user.role]);
  const applying = d && d.lessons.some((l) => l.status === "applying");
  useEffect(() => {
    if (!applying) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [applying, load]);
  if (user.role !== "admin") return <p className={s.muted}>Hamed decides the editing rules.</p>;
  const waiting = d ? d.lessons.filter((l) => l.status === "proposed" || l.status === "applying") : [];
  const shown = d ? (all ? d.lessons : waiting) : [];
  return (
    <>
      <div className={s.row}>
        <h1 className={`${s.title} ${s.grow}`}>Lessons</h1>
        {d && d.lessons.length > waiting.length && (
          <button className={s.linkBtn} onClick={() => setAll(!all)}>
            {all ? "Only the ones waiting" : `Show all ${d.lessons.length}`}
          </button>
        )}
      </div>
      <p className={s.rule}>
        Every correction on a cut is checked for the rule that should have caught it. When it was a rule problem, the change to that rule waits here. Approve it and it is written into the editing rules, as shown, for every video after this one. Reject it and nothing changes.
      </p>
      {error && <div className={s.error}>{error}</div>}
      {!d && !error && <p className={s.muted}>Loading…</p>}
      {d && shown.length === 0 && <p className={s.muted}>{all ? "No lessons yet." : "Nothing waiting. Lessons appear after a version is made from corrections."}</p>}
      {shown.map((l) => (
        <Lesson key={l.id} l={l} reload={load} />
      ))}
      <ContentRules />
    </>
  );
}

export default function Page() {
  return <Shell>{(user) => <Lessons user={user} />}</Shell>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, Mixed, fmt, when, ACTIVE, Avatar } from "../../ui";

const KIND = { reel: "Reel 9:16", youtube: "YouTube 16:9", course: "Course lesson" };
const LANG = { fa: "Farsi", en: "English" };

function CutTable({ rows }) {
  const [showPauses, setShowPauses] = useState(false);
  const retakes = rows.filter((r) => r.type === "retake");
  const pauses = rows.filter((r) => r.type !== "retake");
  const list = showPauses ? rows : retakes;
  return (
    <div className={s.card}>
      <div className={s.row}>
        <h2 className={`${s.h2} ${s.grow}`}>What was removed</h2>
        <button className={s.linkBtn} onClick={() => setShowPauses(!showPauses)}>
          {showPauses ? "Hide pauses" : `Show ${pauses.length} shortened pauses`}
        </button>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>At (new video)</th>
              <th>Type</th>
              <th>Source</th>
              <th>Removed</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.n} className={r.type === "retake" ? s.retake : ""}>
                <td>{r.out !== null && r.out !== undefined ? fmt(r.out) : ""}</td>
                <td>{r.type === "retake" ? "Retake" : "Pause"}</td>
                <td>
                  {fmt(r.start)}–{fmt(r.end)}
                </td>
                <td>{r.removed.toFixed(1)} s</td>
                <td>
                  <Mixed text={r.reason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunView({ run, project, isLatest, corrections, canApprove, me, reload }) {
  const [out, setOut] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const r = run.result || {};
  const act = async (name, fn) => {
    setBusy(name);
    setError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const reviewing = isLatest && run.status === "review";
  return (
    <>
      <div className={s.card}>
        <div className={s.row}>
          <h2 className={`${s.h2} ${s.grow}`}>
            Version {run.version} <Pill status={run.status} />
          </h2>
          <span className={s.muted}>started {when(run.created_at)}</span>
        </div>
        {run.stage_note && ACTIVE.includes(run.status) && <p className={s.muted}>{run.stage_note}… This page updates by itself.</p>}
        {run.corrections && run.corrections.length > 0 && (
          <div>
            <p className={s.muted}>Made from these corrections on version {run.version - 1}:</p>
            <ul className={s.list}>
              {run.corrections.map((c) => (
                <li key={c.id}>
                  {c.out}: <Mixed text={c.note} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {run.error && <div className={s.error}>{run.error}</div>}
        {me.role === "admin" && run.log_tail && <pre className={s.pre}>{run.log_tail}</pre>}
        {me.role === "admin" && run.log_url && (
          <a className={s.muted} href={run.log_url} target="_blank" rel="noreferrer">
            Worker log on GitHub
          </a>
        )}
        {isLatest && run.status === "failed" && (
          <div>
            <button className={s.btn} disabled={!!busy} onClick={() => act("retry", () => api(`/projects/${project.id}/rerun`, { method: "POST" }))}>
              Try again
            </button>
          </div>
        )}
        {run.status === "approved" && run.delivery && (
          <div className={s.ok}>
            Approved. The full-quality file is in Drive:{" "}
            <a href={run.delivery.view} target="_blank" rel="noreferrer">
              open the video
            </a>{" "}
            ·{" "}
            <a href={run.delivery.folder} target="_blank" rel="noreferrer">
              open the folder
            </a>
          </div>
        )}
      </div>

      {run.result && (
        <div className={s.split}>
          <div className={s.card}>
            {r.preview ? (
              <iframe className={`${s.player} ${project.kind === "reel" ? "" : s.playerWide}`} src={r.preview.embed} allow="autoplay" title={`Preview of version ${run.version}`} />
            ) : (
              <p className={s.muted}>{r.note || "No preview for this version."}</p>
            )}
            <div className={s.stats}>
              <div>
                <b>{fmt(r.source && r.source.duration)}</b>
                <span className={s.muted}>raw</span>
              </div>
              <div>
                <b>{fmt(r.output_s)}</b>
                <span className={s.muted}>after the cut</span>
              </div>
              <div>
                <b>{(r.cut_rows || []).filter((x) => x.type === "retake").length}</b>
                <span className={s.muted}>takes removed</span>
              </div>
            </div>
            {r.preview && (
              <a className={s.muted} href={r.preview.view} target="_blank" rel="noreferrer">
                Open the preview in Drive
              </a>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {r.judgement_calls && r.judgement_calls.length > 0 && (
              <div className={s.card}>
                <h2 className={s.h2}>Judgement calls to check</h2>
                <ul className={s.list}>
                  {r.judgement_calls.map((j, i) => (
                    <li key={i}>
                      <Mixed text={j} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reviewing && (
              <div className={s.card}>
                <h2 className={s.h2}>Corrections</h2>
                <p className={s.muted}>Watch the preview. For anything wrong, write the second in the new video and what is wrong, as you would tell Hamed.</p>
                {corrections.length > 0 && (
                  <ul className={s.list}>
                    {corrections.map((c) => (
                      <li key={c.id}>
                        <b>{c.out}</b> <Mixed text={c.note} />{" "}
                        <button className={`${s.linkBtn} ${s.danger}`} disabled={!!busy} onClick={() => act("del", () => api(`/projects/${project.id}/corrections?run_id=${run.id}&cid=${c.id}`, { method: "DELETE" }))}>
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className={s.row}
                  onSubmit={(e) => {
                    e.preventDefault();
                    act("add", async () => {
                      await api(`/projects/${project.id}/corrections`, { method: "POST", body: { run_id: run.id, out, note } });
                      setOut("");
                      setNote("");
                    });
                  }}
                >
                  <input id="corr-out" className={s.input} style={{ width: 90 }} placeholder="1:49" value={out} onChange={(e) => setOut(e.target.value)} required aria-label="Second in the new video" />
                  <input id="corr-note" className={`${s.input} ${s.grow}`} placeholder="I said it twice" value={note} onChange={(e) => setNote(e.target.value)} required aria-label="What is wrong" />
                  <button className={s.btn} disabled={!!busy}>
                    Add
                  </button>
                </form>
                <div className={s.row}>
                  <button className={`${s.btn} ${s.primary}`} disabled={!!busy || !corrections.length} onClick={() => act("rerun", () => api(`/projects/${project.id}/rerun`, { method: "POST" }))}>
                    {busy === "rerun" ? "Starting…" : `Apply corrections: make version ${run.version + 1}`}
                  </button>
                </div>
              </div>
            )}

            {reviewing && (
              <div className={s.card}>
                <h2 className={s.h2}>Approval</h2>
                {canApprove ? (
                  !confirm ? (
                    <div>
                      <button className={s.btn} disabled={!!busy || corrections.length > 0} onClick={() => setConfirm(true)}>
                        Approve version {run.version}
                      </button>
                      {corrections.length > 0 && <p className={s.muted}>Remove or apply the open corrections before approving.</p>}
                    </div>
                  ) : (
                    <div className={s.row}>
                      <span className={s.grow}>Approve version {run.version} and copy the full-quality file to Drive?</span>
                      <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => act("approve", () => api(`/projects/${project.id}/approve`, { method: "POST", body: { run_id: run.id } }))}>
                        Yes, approve
                      </button>
                      <button className={s.btn} onClick={() => setConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  )
                ) : (
                  <p className={s.muted}>Hamed approves this video. When there is nothing left to correct, tell him it is ready.</p>
                )}
                <p className={s.rule}>Approval only puts the clean video in Drive. Nothing is posted to Instagram or TikTok from here.</p>
              </div>
            )}
            {error && <div className={s.error}>{error}</div>}
          </div>
        </div>
      )}

      {run.result && run.result.cut_rows && <CutTable rows={run.result.cut_rows} />}
      {run.result && run.result.verify && run.result.verify.length > 0 && (
        <details className={s.card}>
          <summary className={s.h2} style={{ cursor: "pointer" }}>
            Check after every join (first half second)
          </summary>
          <pre className={`${s.pre} ${s.rtl}`}>{run.result.verify.join("\n")}</pre>
        </details>
      )}
    </>
  );
}

function Project({ id }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState("");
  const load = useCallback(
    () =>
      api(`/projects/${id}`)
        .then((x) => {
          setD(x);
          setError("");
        })
        .catch((e) => setError(e.status === 403 ? "This project belongs to someone else." : e.message)),
    [id]
  );
  useEffect(() => {
    load();
  }, [load]);
  const latest = d && (d.runs.find((r) => r.id === d.project.latest_run_id) || d.runs[d.runs.length - 1]);
  const active = latest && ACTIVE.includes(latest.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [active, load]);
  if (error && !d) return <div className={s.error}>{error}</div>;
  if (!d) return <p className={s.muted}>Loading…</p>;
  const run = d.runs.find((r) => r.id === sel) || latest;
  const p = d.project;
  return (
    <>
      <nav className={s.crumbs}>
        <Link href="/editing">Projects</Link>
        <span aria-hidden>›</span>
        <span>{p.title}</span>
      </nav>
      <div className={s.head}>
        <span className={s.headIcon} aria-hidden>🎬</span>
        <div className={s.grow}>
          <h1 className={s.title} dir="auto">{p.title}</h1>
          <div className={s.headMeta}>
            <span className={`${s.kbLabel} ${s["k_" + p.kind] || ""}`}>{KIND[p.kind]}</span>
            {latest && <Pill status={latest.status} />}
            <span className={s.kbBadge}>{LANG[p.language]}</span>
            {p.topic && <span className={s.kbBadge} dir="auto">{p.topic}</span>}
            <a className={s.kbBadge} href={p.source_url} target="_blank" rel="noreferrer">
              🎞 raw footage ↗
            </a>
            {d.owner && d.me.role === "admin" && (
              <span className={s.kbBadge} style={{ background: "none", padding: 0, gap: 6 }}>
                <Avatar user={d.owner} size={22} /> {d.owner.name}
              </span>
            )}
          </div>
        </div>
      </div>
      {d.runs.length > 1 && (
        <div className={s.seg} role="tablist" aria-label="Versions">
          {d.runs.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === run.id} className={r.id === run.id ? s.segOn : ""} onClick={() => setSel(r.id)}>
              Version {r.version}
            </button>
          ))}
        </div>
      )}
      {error && <div className={s.error}>{error}</div>}
      {run && <RunView key={run.id} run={run} project={p} isLatest={run.id === latest.id} corrections={run.id === latest.id ? d.corrections : []} canApprove={d.can_approve} me={d.me} reload={load} />}
    </>
  );
}

export default function Page({ params }) {
  return <Shell>{() => <Project id={params.id} />}</Shell>;
}

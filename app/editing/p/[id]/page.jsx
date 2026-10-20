"use client";

import { Check, ChevronDown, Clapperboard, Film, Sparkles, Subtitles } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, Mixed, fmt, when, ACTIVE, Avatar } from "../../ui";
import VoiceCorrections from "./VoiceCorrections";

const KIND = { reel: "Reel 9:16", youtube: "YouTube 16:9", course: "Course lesson" };
const LANG = { fa: "Farsi", en: "English" };

// A section that stays closed until it is opened: the details of a cut are there when wanted,
// out of the way otherwise.
function Fold({ title, count, children, extra = null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.card}>
      <div className={s.row}>
        <button type="button" className={`${s.foldHead} ${s.grow}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={18} className={open ? s.foldOpen : s.foldShut} aria-hidden />
          <span className={s.h2}>{title}</span>
          {count !== undefined && <span className={s.kbBadge}>{count}</span>}
        </button>
        {open && extra}
      </div>
      {open && children}
    </div>
  );
}

// Stages after the cut (english-sugimotovisa: video-transcribe, video-motion-graphics skills).
const STAGE = { cut: "Cut", subtitles: "Subtitles", graphics: "Motion graphics" };
const stageOf = (r) => (r && r.stage) || "cut";
const runName = (r) => (stageOf(r) === "cut" ? "Version " : stageOf(r) === "graphics" ? (r.step === "plan" ? "Graphics plan " : "Graphics ") : "Subtitles ") + r.version;
const STAGE_STATUS = {
  subtitles: { deciding: "Writing subtitles", rendering: "Burning subtitles", preparing: "Getting the cut" },
  graphics: { deciding: "Reading the words", rendering: "Rendering graphics", preparing: "Getting the cut" },
};
const statusLabel = (r) => (STAGE_STATUS[stageOf(r)] || {})[r.status] || (r.step === "plan" && r.status === "review" ? "Plan ready" : undefined);
const LANG_NAME = { fa: "Farsi", en: "English" };

function Steps({ runs }) {
  const state = (st) => {
    const rs = runs.filter((r) => stageOf(r) === st);
    // an approved graphics plan is not the end of its stage: the render still has to be approved
    if (rs.some((r) => r.status === "approved" && r.delivery)) return "done";
    return rs.length ? "on" : "off";
  };
  return (
    <ol className={s.steps}>
      {Object.entries(STAGE).map(([k, label], i) => {
        const st = state(k);
        return (
          <li key={k} className={st === "done" ? s.stepDone : st === "on" ? s.stepOn : ""}>
            <span className={s.stepDot}>{st === "done" ? <Check size={13} /> : i + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function NextSteps({ project, stages, reload }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!stages.length) return null;
  const go = async (stage) => {
    setBusy(stage);
    setError("");
    try {
      await api(`/projects/${project.id}/stage`, { method: "POST", body: { stage } });
      await reload();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  return (
    <div className={s.card}>
      <h2 className={s.h2}>Next step</h2>
      <p className={s.muted}>The approved video is ready. Add subtitles, motion graphics, or both (subtitles first, so the graphics keep them).</p>
      <div className={s.row}>
        {stages.includes("subtitles") && (
          <Button type="button" disabled={!!busy} onClick={() => go("subtitles")}>
            <Subtitles /> {busy === "subtitles" ? "Starting…" : "Add subtitles"}
          </Button>
        )}
        {stages.includes("graphics") && (
          <Button type="button" variant={stages.includes("subtitles") ? "outline" : "default"} disabled={!!busy} onClick={() => go("graphics")}>
            <Sparkles /> {busy === "graphics" ? "Starting…" : stages.includes("subtitles") ? "Motion graphics without subtitles" : "Add motion graphics"}
          </Button>
        )}
      </div>
      <p className={s.rule}>Subtitles: the language is heard from the video (Farsi right to left, English left to right), in the approved style. Motion graphics: you approve a plan with still frames first; only then is it rendered.</p>
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

function PlanView({ r }) {
  return (
    <div className={s.card}>
      <h2 className={s.h2}>The plan</h2>
      <p className={s.muted}>Where the graphics cover the video and what appears, each on the word that names it. The round bubble keeps the speaker on screen.</p>
      <div className={s.stills}>
        {(r.stills || []).map((x) => (
          <a key={x.id} href={`https://drive.google.com/file/d/${x.id}/view`} target="_blank" rel="noreferrer">
            <img src={`https://drive.google.com/thumbnail?id=${x.id}&sz=w600`} alt={`Graphics at ${fmt(x.t)}`} loading="lazy" />
            <span>{fmt(x.t)}</span>
          </a>
        ))}
      </div>
      <ul className={s.list}>
        {(r.plan || []).map((w, i) => (
          <li key={i}>
            <b>
              {fmt(w.start)}–{fmt(w.end)}
            </b>{" "}
            {w.overlay ? "(over the video) " : ""}
            <Mixed text={w.items.join(" → ")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spelling({ sp }) {
  const changes = (sp && sp.changes) || [];
  const kept = (sp && sp.kept) || [];
  if (!changes.length && !kept.length) return null;
  return (
    <Fold title="Spelling fixed in the subtitles" count={changes.length}>
      <ul className={s.list}>
        {changes.map((c, i) => (
          <li key={i}>
            <b>{fmt(c.at)}</b> <span dir="auto">{c.before}</span> → <span dir="auto">{c.after}</span> <span className={s.muted}>({c.why})</span>
          </li>
        ))}
        {kept.map((c, i) => (
          <li key={"k" + i} className={s.muted}>
            line {c.line}: kept as heard (the proposed change was more than spelling)
          </li>
        ))}
      </ul>
    </Fold>
  );
}

function CutTable({ rows }) {
  const [showPauses, setShowPauses] = useState(false);
  const retakes = rows.filter((r) => r.type === "retake");
  const pauses = rows.filter((r) => r.type !== "retake");
  const list = showPauses ? rows : retakes;
  return (
    <Fold
      title="What was removed"
      count={retakes.length}
      extra={
        <button className={s.linkBtn} onClick={() => setShowPauses(!showPauses)}>
          {showPauses ? "Hide pauses" : `Show ${pauses.length} shortened pauses`}
        </button>
      }
    >
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
    </Fold>
  );
}

// What the worker checked before review (english-sugimotovisa, scripts/rough_cut_qa.py): moments to
// look at, never changes to the cut.
function Checks({ qa, lessons, me }) {
  const flags = (qa && qa.flags) || [];
  const av = (qa && qa.av) || {};
  return (
    <div className={s.card}>
      <h2 className={s.h2}>Checked before review</h2>
      {qa && qa.error ? (
        <p className={s.muted}>The checks did not run: {qa.error}</p>
      ) : flags.length ? (
        <>
          <p className={s.muted}>Watch these moments first:</p>
          <ul className={s.flags}>
            {flags.map((f, i) => (
              <li key={i}>
                <b>{f.kind === "av" ? "whole" : fmt(f.out)}</b>
                <span>
                  <Mixed text={f.text} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={s.muted}>No flash cuts and no word said twice across a join.</p>
      )}
      {av.verdict && <p className={s.muted}>Lips and sound: {av.verdict}.</p>}
      {lessons && (lessons.lessons || []).length > 0 && (
        <p className={s.muted}>
          {lessons.lessons.length === 1 ? "One rule change was" : `${lessons.lessons.length} rule changes were`} proposed from these corrections.{" "}
          {me.role === "admin" ? <Link href="/editing/lessons">Decide in Lessons</Link> : "Hamed decides whether the rules change."}
        </p>
      )}
      {me.role === "admin" && lessons && lessons.error && <p className={s.muted}>Lessons did not run: {lessons.error}</p>}
      {me.role === "admin" && lessons && (lessons.no_rule || []).length > 0 && (
        <details>
          <summary className={s.muted} style={{ cursor: "pointer" }}>
            Corrections that did not need a rule change
          </summary>
          <ul className={s.list}>
            {lessons.no_rule.map((n, i) => (
              <li key={i}>
                <Mixed text={n.why} />
              </li>
            ))}
          </ul>
        </details>
      )}
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
            {runName(run)} <Pill status={run.status} label={statusLabel(run)} />
          </h2>
          <span className={s.muted}>started {when(run.created_at)}</span>
        </div>
        {run.stage_note && ACTIVE.includes(run.status) && <p className={s.muted}>{run.stage_note}… This page updates by itself.</p>}
        {run.corrections && run.corrections.length > 0 && (
          <div>
            <p className={s.muted}>Made from these corrections on the version before:</p>
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
          {r.step === "plan" ? (
            <PlanView r={r} />
          ) : (
          <div className={s.card}>
            {r.preview ? (
              <iframe className={`${s.player} ${project.kind === "reel" ? "" : s.playerWide}`} src={r.preview.embed} allow="autoplay" title={`Preview of version ${run.version}`} />
            ) : (
              <p className={s.muted}>{r.note || "No preview for this version."}</p>
            )}
            <div className={s.stats}>
              {stageOf(run) === "cut" ? (
                <>
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
                </>
              ) : (
                <>
                  <div>
                    <b>{fmt(r.output_s)}</b>
                    <span className={s.muted}>long</span>
                  </div>
                  {r.language && (
                    <div>
                      <b>{LANG_NAME[r.language] || r.language}</b>
                      <span className={s.muted}>{r.detected ? "heard in the video" : "language"}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {r.preview && (
              <a className={s.muted} href={r.preview.view} target="_blank" rel="noreferrer">
                Open the preview in Drive
              </a>
            )}
          </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {r.spelling && <Spelling sp={r.spelling} />}
            {(r.qa || r.lessons) && <Checks qa={r.qa} lessons={r.lessons} me={me} />}
            {r.judgement_calls && r.judgement_calls.length > 0 && (
              <Fold title="Judgement calls to check" count={r.judgement_calls.length}>
                <ul className={s.list}>
                  {r.judgement_calls.map((j, i) => (
                    <li key={i}>
                      <Mixed text={j} />
                    </li>
                  ))}
                </ul>
              </Fold>
            )}

            {reviewing && (
              <div className={s.card}>
                <h2 className={s.h2}>Corrections</h2>
                <p className={s.muted}>
                  {r.step === "plan"
                    ? "Look at the plan and the stills. For anything to change, say or write the second and what you want there; a new plan is drawn."
                    : "Watch the preview. For anything wrong, say or write the second in the new video and what is wrong, as you would tell Hamed."}
                </p>
                <VoiceCorrections project={project} run={run} disabled={!!busy} onAdded={reload} />
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
                  <input id="corr-out" data-no-voice className={s.input} style={{ width: 90 }} placeholder="1:49" value={out} onChange={(e) => setOut(e.target.value)} required aria-label="Second in the new video" />
                  <input id="corr-note" className={`${s.input} ${s.grow}`} placeholder="I said it twice" value={note} onChange={(e) => setNote(e.target.value)} required aria-label="What is wrong" />
                  <button className={s.btn} disabled={!!busy}>
                    Add
                  </button>
                </form>
                <div className={s.row}>
                  <button className={`${s.btn} ${s.primary}`} disabled={!!busy || !corrections.length} onClick={() => act("rerun", () => api(`/projects/${project.id}/rerun`, { method: "POST" }))}>
                    {busy === "rerun" ? "Starting…" : r.step === "plan" || stageOf(run) === "graphics" ? "Apply corrections: draw a new plan" : `Apply corrections: make version ${run.version + 1}`}
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
                        {r.step === "plan" ? "Approve the plan and render it" : `Approve ${runName(run).toLowerCase()}`}
                      </button>
                      {corrections.length > 0 && <p className={s.muted}>Remove or apply the open corrections before approving.</p>}
                    </div>
                  ) : (
                    <div className={s.row}>
                      <span className={s.grow}>
                        {r.step === "plan"
                          ? "Render the graphics as planned? It takes about 10 minutes per minute of video."
                          : `Approve ${runName(run).toLowerCase()} and copy the full-quality file to Drive?`}
                      </span>
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
                <p className={s.rule}>
                  {r.step === "plan" ? "Approving the plan only starts the render; the rendered video comes back here for review." : "Approval only puts the clean video in Drive."} Nothing is posted to Instagram or TikTok from here.
                </p>
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
        <span className={s.headIcon} aria-hidden><Clapperboard size={22} /></span>
        <div className={s.grow}>
          <h1 className={s.title} dir="auto">{p.title}</h1>
          <div className={s.headMeta}>
            <span className={`${s.kbLabel} ${s["k_" + p.kind] || ""}`}>{KIND[p.kind]}</span>
            {latest && <Pill status={latest.status} label={statusLabel(latest)} />}
            <span className={s.kbBadge}>{LANG[p.language]}</span>
            {p.topic && <span className={s.kbBadge} dir="auto">{p.topic}</span>}
            <a className={s.kbBadge} href={p.source_url} target="_blank" rel="noreferrer">
              <Film size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> raw footage ↗
            </a>
            {d.owner && d.me.role === "admin" && (
              <span className={s.kbBadge} style={{ background: "none", padding: 0, gap: 6 }}>
                <Avatar user={d.owner} size={22} /> {d.owner.name}
              </span>
            )}
          </div>
        </div>
      </div>
      <Steps runs={d.runs} />
      {d.runs.length > 1 && (
        <div className={s.seg} role="tablist" aria-label="Versions">
          {d.runs.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === run.id} className={r.id === run.id ? s.segOn : ""} onClick={() => setSel(r.id)}>
              {runName(r)}
            </button>
          ))}
        </div>
      )}
      {run.id === latest.id && <NextSteps project={p} stages={d.next_stages || []} reload={load} />}
      {error && <div className={s.error}>{error}</div>}
      {run && <RunView key={run.id} run={run} project={p} isLatest={run.id === latest.id} corrections={run.id === latest.id ? d.corrections : []} canApprove={d.can_approve} me={d.me} reload={load} />}
    </>
  );
}

export default function Page({ params }) {
  return <Shell>{() => <Project id={params.id} />}</Shell>;
}

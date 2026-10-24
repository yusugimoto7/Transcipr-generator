"use client";

import { Check, ChevronDown, Clapperboard, Film, ImagePlus, Sparkles, Subtitles, X } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Pill, Mixed, fmt, when, ACTIVE, Avatar } from "../../ui";
import VoiceCorrections from "./VoiceCorrections";
import MicButton from "../../../voice/MicButton";
import { L, uiDir } from "../../../../lib/i18n";

// Display names are pairs (lib/i18n.js), read with L() when drawn.
const KIND = { reel: ["ریل 9:16", "Reel 9:16"], youtube: ["YouTube 16:9", "YouTube 16:9"], course: ["درس دوره", "Course lesson"] };
const LANG = { fa: ["فارسی", "Farsi"], en: ["انگلیسی", "English"] };

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
const STAGE = { cut: ["برش", "Cut"], subtitles: ["زیرنویس", "Subtitles"], graphics: ["موشن‌گرافیک", "Motion graphics"] };
const stageOf = (r) => (r && r.stage) || "cut";
const runName = (r) =>
  stageOf(r) === "cut"
    ? L(`نسخهٔ ${r.version}`, `Version ${r.version}`)
    : stageOf(r) === "graphics"
      ? r.step === "plan"
        ? L(`طرح گرافیک ${r.version}`, `Graphics plan ${r.version}`)
        : L(`گرافیک ${r.version}`, `Graphics ${r.version}`)
      : L(`زیرنویس ${r.version}`, `Subtitles ${r.version}`);
const STAGE_STATUS = {
  subtitles: { deciding: ["در حال نوشتن زیرنویس", "Writing subtitles"], rendering: ["در حال چسباندن زیرنویس", "Burning subtitles"], preparing: ["در حال گرفتن برش", "Getting the cut"] },
  graphics: { deciding: ["در حال خواندن کلمه‌ها", "Reading the words"], rendering: ["در حال ساخت گرافیک", "Rendering graphics"], preparing: ["در حال گرفتن برش", "Getting the cut"] },
};
const statusLabel = (r) => {
  const pair = (STAGE_STATUS[stageOf(r)] || {})[r.status];
  if (pair) return L(pair);
  return r.step === "plan" && r.status === "review" ? L("طرح آماده است", "Plan ready") : undefined;
};

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
            {L(label)}
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
      <h2 className={s.h2}>{L("مرحلهٔ بعد", "Next step")}</h2>
      <p className={s.muted}>{L("ویدیوی تأییدشده آماده است. زیرنویس، موشن‌گرافیک یا هر دو رو اضافه کن (اول زیرنویس، تا گرافیک‌ها نگهش دارن).", "The approved video is ready. Add subtitles, motion graphics, or both (subtitles first, so the graphics keep them).")}</p>
      <div className={s.row}>
        {stages.includes("subtitles") && (
          <Button type="button" disabled={!!busy} onClick={() => go("subtitles")}>
            <Subtitles /> {busy === "subtitles" ? L("در حال شروع…", "Starting…") : L("افزودن زیرنویس", "Add subtitles")}
          </Button>
        )}
        {stages.includes("graphics") && (
          <Button type="button" variant={stages.includes("subtitles") ? "outline" : "default"} disabled={!!busy} onClick={() => go("graphics")}>
            <Sparkles /> {busy === "graphics" ? L("در حال شروع…", "Starting…") : stages.includes("subtitles") ? L("موشن‌گرافیک بدون زیرنویس", "Motion graphics without subtitles") : L("افزودن موشن‌گرافیک", "Add motion graphics")}
          </Button>
        )}
      </div>
      <p className={s.rule}>
        {L(
          "زیرنویس: زبان از خود ویدیو شنیده می‌شه (فارسی راست به چپ، انگلیسی چپ به راست)، با سبک تأییدشده. موشن‌گرافیک: اول یک طرح با فریم‌های ثابت رو تأیید می‌کنی؛ فقط بعدش ساخته می‌شه.",
          "Subtitles: the language is heard from the video (Farsi right to left, English left to right), in the approved style. Motion graphics: you approve a plan with still frames first; only then is it rendered."
        )}
      </p>
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

function PlanView({ r }) {
  return (
    <div className={s.card}>
      <h2 className={s.h2}>{L("طرح", "The plan")}</h2>
      <p className={s.muted}>{L("گرافیک‌ها کجا روی ویدیو می‌آن و چه چیزی نشون داده می‌شه، هر کدوم روی کلمه‌ای که اسمش رو می‌بره. حباب گرد گوینده رو روی صفحه نگه می‌داره.", "Where the graphics cover the video and what appears, each on the word that names it. The round bubble keeps the speaker on screen.")}</p>
      <div className={s.stills}>
        {(r.stills || []).map((x) => (
          <a key={x.id} href={`https://drive.google.com/file/d/${x.id}/view`} target="_blank" rel="noreferrer">
            <img src={`https://drive.google.com/thumbnail?id=${x.id}&sz=w600`} alt={L(`گرافیک در ${fmt(x.t)}`, `Graphics at ${fmt(x.t)}`)} loading="lazy" />
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
            {w.overlay ? L("(روی ویدیو) ", "(over the video) ") : ""}
            <bdi>
              <Mixed text={w.items.join(" → ")} />
            </bdi>
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
    <Fold title={L("املای درست‌شده در زیرنویس", "Spelling fixed in the subtitles")} count={changes.length}>
      <ul className={s.list}>
        {changes.map((c, i) => (
          <li key={i}>
            <b>{fmt(c.at)}</b> <span dir="auto">{c.before}</span> → <span dir="auto">{c.after}</span> <span className={s.muted} dir="auto">({c.why})</span>
          </li>
        ))}
        {kept.map((c, i) => (
          <li key={"k" + i} className={s.muted}>
            {L(`خط ${c.line}: همون‌طور که شنیده شد ماند (تغییر پیشنهادی بیشتر از املا بود)`, `line ${c.line}: kept as heard (the proposed change was more than spelling)`)}
          </li>
        ))}
      </ul>
    </Fold>
  );
}

// Screenshots on a correction: shrunk here to 1600 px JPEG, stored with the correction; the worker
// reads the player's time and what is wrong from them (english-sugimotovisa scripts/correction_shots.py).
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error(L("این فایل تصویر نیست", "this file is not a picture")));
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const shotUrl = (projectId, path) => `/api/editing/projects/${projectId}/shots/${String(path).replace(/^shots\//, "")}`;

function Shots({ projectId, paths }) {
  if (!paths || !paths.length) return null;
  return (
    <span className={s.shotRow}>
      {paths.map((p) => (
        <a key={p} href={shotUrl(projectId, p)} target="_blank" rel="noreferrer">
          <img src={shotUrl(projectId, p)} alt={L("اسکرین‌شات", "Screenshot")} loading="lazy" />
        </a>
      ))}
    </span>
  );
}

function CorrectionForm({ project, run, busy, act, general = false }) {
  const [out, setOut] = useState("");
  const [note, setNote] = useState("");
  const [shots, setShots] = useState([]);
  const [err, setErr] = useState("");
  const add = async (files) => {
    setErr("");
    try {
      const next = [...shots];
      for (const f of files) {
        if (next.length >= 3) break;
        next.push(await shrink(f));
      }
      setShots(next);
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <form
      className={s.corrForm}
      onSubmit={(e) => {
        e.preventDefault();
        act("add", async () => {
          await api(`/projects/${project.id}/corrections`, { method: "POST", body: { run_id: run.id, out: general ? "" : out, note, images: shots, general } });
          setOut("");
          setNote("");
          setShots([]);
        });
      }}
    >
      {general ? (
        <textarea
          id="corr-general"
          className={s.textarea}
          rows={3}
          dir="auto"
          placeholder={L("هر چیزی دربارهٔ کل ویدیو: زیرنویس‌ها خیلی ریزن، مکث‌ها عجولانه‌ست، گرافیک‌ها خیلی شلوغن…", "Anything about the whole video: the subtitles are too small, the pauses feel rushed, the graphics are too busy…")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required={!shots.length}
          aria-label={L("یادداشت روی کل ویدیو", "Note on the whole video")}
        />
      ) : (
        <div className={s.row}>
          <input id="corr-out" data-no-voice className={s.input} style={{ width: 90 }} placeholder="1:49" value={out} onChange={(e) => setOut(e.target.value)} required={!shots.length} aria-label={L("ثانیه در ویدیوی جدید", "Second in the new video")} />
          <input id="corr-note" className={`${s.input} ${s.grow}`} placeholder={L("دو بار گفتمش", "I said it twice")} value={note} onChange={(e) => setNote(e.target.value)} required={!shots.length} aria-label={L("چه چیزی ایراد داره", "What is wrong")} />
        </div>
      )}
      <div className={s.row}>
        <label className={`${s.btn} ${s.shotBtn}`} aria-disabled={shots.length >= 3}>
          <ImagePlus size={16} aria-hidden /> {shots.length ? L(`اسکرین‌شات (${shots.length}/3)`, `Screenshot (${shots.length}/3)`) : L("افزودن اسکرین‌شات", "Add screenshot")}
          <input type="file" accept="image/*" multiple hidden disabled={shots.length >= 3} onChange={(e) => add([...e.target.files]).then(() => (e.target.value = ""))} />
        </label>
        <MicButton className={s.btn} onText={(t) => setNote((n) => (n.trim() ? n.trimEnd() + " " + t : t))} />
        {shots.map((u, i) => (
          <span key={i} className={s.shotThumb}>
            <img src={u} alt={L(`اسکرین‌شات ${i + 1}`, `Screenshot ${i + 1}`)} />
            <button type="button" aria-label={L("حذف این اسکرین‌شات", "Remove this screenshot")} onClick={() => setShots(shots.filter((_, j) => j !== i))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <button className={`${s.btn} ${s.grow}`} style={{ flexGrow: 0 }} disabled={!!busy}>
          {L("افزودن", "Add")}
        </button>
      </div>
      {!general && shots.length > 0 && !out.trim() && <p className={s.muted}>{L("زمانی نوشته نشده: از پخش‌کنندهٔ توی اسکرین‌شات خونده می‌شه.", "No time written: it is read from the player in the screenshot.")}</p>}
      {err && <div className={s.error}>{err}</div>}
    </form>
  );
}

function CutTable({ rows }) {
  const [showPauses, setShowPauses] = useState(false);
  const retakes = rows.filter((r) => r.type === "retake");
  const pauses = rows.filter((r) => r.type !== "retake");
  const list = showPauses ? rows : retakes;
  return (
    <Fold
      title={L("چه چیزهایی حذف شد", "What was removed")}
      count={retakes.length}
      extra={
        <button className={s.linkBtn} onClick={() => setShowPauses(!showPauses)}>
          {showPauses ? L("پنهان کردن مکث‌ها", "Hide pauses") : L(`نمایش ${pauses.length} مکث کوتاه‌شده`, `Show ${pauses.length} shortened pauses`)}
        </button>
      }
    >
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>{L("زمان (ویدیوی جدید)", "At (new video)")}</th>
              <th>{L("نوع", "Type")}</th>
              <th>{L("منبع", "Source")}</th>
              <th>{L("حذف‌شده", "Removed")}</th>
              <th>{L("چرا", "Why")}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.n} className={r.type === "retake" ? s.retake : ""}>
                <td>{r.out !== null && r.out !== undefined ? fmt(r.out) : ""}</td>
                <td>{r.type === "retake" ? L("برداشت تکراری", "Retake") : L("مکث", "Pause")}</td>
                <td>
                  {fmt(r.start)}–{fmt(r.end)}
                </td>
                <td>{L(`${r.removed.toFixed(1)} ث`, `${r.removed.toFixed(1)} s`)}</td>
                <td dir="auto">
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
      <h2 className={s.h2}>{L("بررسی‌شده پیش از بازبینی", "Checked before review")}</h2>
      {qa && qa.error ? (
        <p className={s.muted}>{L("بررسی‌ها اجرا نشدند:", "The checks did not run:")} {qa.error}</p>
      ) : flags.length ? (
        <>
          <p className={s.muted}>{L("اول این لحظه‌ها رو ببین:", "Watch these moments first:")}</p>
          <ul className={s.flags}>
            {flags.map((f, i) => (
              <li key={i}>
                <b>{f.kind === "av" ? L("کل ویدیو", "whole") : fmt(f.out)}</b>
                <span dir="auto">
                  <Mixed text={f.text} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={s.muted}>{L("نه پرش تصویری هست، نه کلمه‌ای که سر یک اتصال دو بار گفته شده باشه.", "No flash cuts and no word said twice across a join.")}</p>
      )}
      {av.verdict && (
        <p className={s.muted}>
          {L("لب و صدا:", "Lips and sound:")} <bdi>{av.verdict}</bdi>.
        </p>
      )}
      {lessons && (lessons.lessons || []).length > 0 && (
        <p className={s.muted}>
          {lessons.lessons.length === 1
            ? L("از این اصلاحیه‌ها یک تغییر قانون پیشنهاد شد.", "One rule change was proposed from these corrections.")
            : L(`از این اصلاحیه‌ها ${lessons.lessons.length} تغییر قانون پیشنهاد شد.`, `${lessons.lessons.length} rule changes were proposed from these corrections.`)}{" "}
          {me.role === "admin" ? <Link href="/editing/lessons">{L("در درس‌ها تصمیم بگیر", "Decide in Lessons")}</Link> : L("حامد تصمیم می‌گیره قوانین عوض بشن یا نه.", "Hamed decides whether the rules change.")}
        </p>
      )}
      {me.role === "admin" && lessons && lessons.error && <p className={s.muted}>{L("درس‌ها اجرا نشدند:", "Lessons did not run:")} {lessons.error}</p>}
      {me.role === "admin" && lessons && (lessons.no_rule || []).length > 0 && (
        <details>
          <summary className={s.muted} style={{ cursor: "pointer" }}>
            {L("اصلاحیه‌هایی که تغییر قانون لازم نداشتند", "Corrections that did not need a rule change")}
          </summary>
          <ul className={s.list}>
            {lessons.no_rule.map((n, i) => (
              <li key={i} dir="auto">
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
          <span className={s.muted}>{L("شروع:", "started")} {when(run.created_at)}</span>
        </div>
        {run.stage_note && ACTIVE.includes(run.status) && <p className={s.muted}>
            <bdi>{run.stage_note}…</bdi> {L("این صفحه خودش به‌روز می‌شه.", "This page updates by itself.")}
          </p>}
        {run.corrections && run.corrections.length > 0 && (
          <div>
            <p className={s.muted}>{L("ساخته‌شده از این اصلاحیه‌ها روی نسخهٔ قبل:", "Made from these corrections on the version before:")}</p>
            <ul className={s.list}>
              {run.corrections.map((c) => (
                <li key={c.id}>
                  {c.general ? L("کل ویدیو", "Whole video") : c.out}
                  {c.time_from_screenshot ? L(" (خوانده‌شده از اسکرین‌شات)", " (read from the screenshot)") : ""}:{" "}
                  <bdi>
                    <Mixed text={c.note} />
                  </bdi> <Shots projectId={project.id} paths={c.images} />
                </li>
              ))}
            </ul>
            {(run.corrections_unplaced || []).length > 0 && (
              <p className={s.muted}>
                {L("کنار گذاشته شد، زمانی خونده نشد:", "Left out, no time could be read:")} <bdi>{run.corrections_unplaced.map((c) => c.note).join(" · ")}</bdi>
              </p>
            )}
          </div>
        )}
        {run.error && <div className={s.error}>{run.error}</div>}
        {me.role === "admin" && run.log_tail && <pre className={s.pre}>{run.log_tail}</pre>}
        {me.role === "admin" && run.log_url && (
          <a className={s.muted} href={run.log_url} target="_blank" rel="noreferrer">
            {L("لاگ ورکر در GitHub", "Worker log on GitHub")}
          </a>
        )}
        {isLatest && run.status === "failed" && (
          <div>
            <button className={s.btn} disabled={!!busy} onClick={() => act("retry", () => api(`/projects/${project.id}/rerun`, { method: "POST" }))}>
              {L("دوباره امتحان کن", "Try again")}
            </button>
          </div>
        )}
        {run.status === "approved" && run.delivery && (
          <div className={s.ok}>
            {L("تأیید شد. فایل با کیفیت کامل در Drive است:", "Approved. The full-quality file is in Drive:")}{" "}
            <a href={run.delivery.view} target="_blank" rel="noreferrer">
              {L("باز کردن ویدیو", "open the video")}
            </a>{" "}
            ·{" "}
            <a href={run.delivery.folder} target="_blank" rel="noreferrer">
              {L("باز کردن پوشه", "open the folder")}
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
              <iframe className={`${s.player} ${project.kind === "reel" ? "" : s.playerWide}`} src={r.preview.embed} allow="autoplay" title={L(`پیش‌نمایش نسخهٔ ${run.version}`, `Preview of version ${run.version}`)} />
            ) : (
              <p className={s.muted}>{r.note || L("این نسخه پیش‌نمایش نداره.", "No preview for this version.")}</p>
            )}
            <div className={s.stats}>
              {stageOf(run) === "cut" ? (
                <>
                  <div>
                    <b>{fmt(r.source && r.source.duration)}</b>
                    <span className={s.muted}>{L("خام", "raw")}</span>
                  </div>
                  <div>
                    <b>{fmt(r.output_s)}</b>
                    <span className={s.muted}>{L("بعد از برش", "after the cut")}</span>
                  </div>
                  <div>
                    <b>{(r.cut_rows || []).filter((x) => x.type === "retake").length}</b>
                    <span className={s.muted}>{L("برداشت حذف‌شده", "takes removed")}</span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <b>{fmt(r.output_s)}</b>
                    <span className={s.muted}>{L("مدت", "long")}</span>
                  </div>
                  {r.language && (
                    <div>
                      <b>{LANG[r.language] ? L(LANG[r.language]) : r.language}</b>
                      <span className={s.muted}>{r.detected ? L("شنیده‌شده در ویدیو", "heard in the video") : L("زبان", "language")}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {r.preview && (
              <a className={s.muted} href={r.preview.view} target="_blank" rel="noreferrer">
                {L("باز کردن پیش‌نمایش در Drive", "Open the preview in Drive")}
              </a>
            )}
          </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            {r.spelling && <Spelling sp={r.spelling} />}
            {(r.qa || r.lessons) && <Checks qa={r.qa} lessons={r.lessons} me={me} />}
            {r.judgement_calls && r.judgement_calls.length > 0 && (
              <Fold title={L("تصمیم‌هایی که باید بررسی بشن", "Judgement calls to check")} count={r.judgement_calls.length}>
                <ul className={s.list}>
                  {r.judgement_calls.map((j, i) => (
                    <li key={i} dir="auto">
                      <Mixed text={j} />
                    </li>
                  ))}
                </ul>
              </Fold>
            )}

            {reviewing && (
              <div className={s.card}>
                <h2 className={s.h2}>{L("اصلاحیه‌ها", "Corrections")}</h2>
                <p className={s.muted}>
                  {r.step === "plan"
                    ? L("طرح و فریم‌های ثابت رو ببین. برای هر چیزی که باید عوض بشه، ثانیه و چیزی که اونجا می‌خوای رو بگو یا بنویس؛ طرح جدیدی کشیده می‌شه.", "Look at the plan and the stills. For anything to change, say or write the second and what you want there; a new plan is drawn.")
                    : L("پیش‌نمایش رو ببین. برای هر ایرادی، ثانیه در ویدیوی جدید و ایرادش رو بگو یا بنویس، همون‌طور که به حامد می‌گفتی.", "Watch the preview. For anything wrong, say or write the second in the new video and what is wrong, as you would tell Hamed.")}
                </p>
                <VoiceCorrections project={project} run={run} disabled={!!busy} onAdded={reload} />
                {corrections.length > 0 && (
                  <ul className={s.list}>
                    {corrections.map((c) => (
                      <li key={c.id}>
                        <b>{c.general ? L("کل ویدیو", "Whole video") : c.out || L("زمان از اسکرین‌شات", "time from screenshot")}</b>{" "}
                        <bdi>
                          <Mixed text={c.note} />
                        </bdi> <Shots projectId={project.id} paths={c.images} />{" "}
                        <button className={`${s.linkBtn} ${s.danger}`} disabled={!!busy} onClick={() => act("del", () => api(`/projects/${project.id}/corrections?run_id=${run.id}&cid=${c.id}`, { method: "DELETE" }))}>
                          {L("حذف", "remove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <CorrectionForm project={project} run={run} busy={busy} act={act} />
                <div className={s.generalBox}>
                  <h3 className={s.h3}>{L("یادداشت‌های کلی", "General notes")}</h3>
                  <p className={s.muted}>{L("برای ایرادهایی که در کل ویدیو هست، نه در یک ثانیهٔ خاص.", "For problems across the whole video, not at one second.")}</p>
                  <CorrectionForm project={project} run={run} busy={busy} act={act} general />
                </div>
                <div className={s.row}>
                  <button className={`${s.btn} ${s.primary}`} disabled={!!busy || !corrections.length} onClick={() => act("rerun", () => api(`/projects/${project.id}/rerun`, { method: "POST" }))}>
                    {busy === "rerun"
                      ? L("در حال شروع…", "Starting…")
                      : r.step === "plan" || stageOf(run) === "graphics"
                        ? L("اعمال اصلاحیه‌ها: کشیدن طرح جدید", "Apply corrections: draw a new plan")
                        : L(`اعمال اصلاحیه‌ها: ساخت نسخهٔ ${run.version + 1}`, `Apply corrections: make version ${run.version + 1}`)}
                  </button>
                </div>
              </div>
            )}

            {reviewing && (
              <div className={s.card}>
                <h2 className={s.h2}>{L("تأیید", "Approval")}</h2>
                {canApprove ? (
                  !confirm ? (
                    <div>
                      <button className={s.btn} disabled={!!busy || corrections.length > 0} onClick={() => setConfirm(true)}>
                        {r.step === "plan" ? L("تأیید طرح و ساختنش", "Approve the plan and render it") : L(`تأیید ${runName(run)}`, `Approve ${runName(run).toLowerCase()}`)}
                      </button>
                      {corrections.length > 0 && <p className={s.muted}>{L("قبل از تأیید، اصلاحیه‌های باز رو حذف یا اعمال کن.", "Remove or apply the open corrections before approving.")}</p>}
                    </div>
                  ) : (
                    <div className={s.row}>
                      <span className={s.grow}>
                        {r.step === "plan"
                          ? L("گرافیک‌ها طبق طرح ساخته بشن؟ برای هر دقیقه ویدیو حدود ۱۰ دقیقه طول می‌کشه.", "Render the graphics as planned? It takes about 10 minutes per minute of video.")
                          : L(`${runName(run)} تأیید بشه و فایل با کیفیت کامل در Drive کپی بشه؟`, `Approve ${runName(run).toLowerCase()} and copy the full-quality file to Drive?`)}
                      </span>
                      <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => act("approve", () => api(`/projects/${project.id}/approve`, { method: "POST", body: { run_id: run.id } }))}>
                        {L("بله، تأیید", "Yes, approve")}
                      </button>
                      <button className={s.btn} onClick={() => setConfirm(false)}>
                        {L("انصراف", "Cancel")}
                      </button>
                    </div>
                  )
                ) : (
                  <p className={s.muted}>{L("این ویدیو رو حامد تأیید می‌کنه. وقتی چیزی برای اصلاح نموند، بهش بگو آماده‌ست.", "Hamed approves this video. When there is nothing left to correct, tell him it is ready.")}</p>
                )}
                <p className={s.rule}>
                  {r.step === "plan"
                    ? L("تأیید طرح فقط ساخت رو شروع می‌کنه؛ ویدیوی ساخته‌شده برای بازبینی به همین‌جا برمی‌گرده.", "Approving the plan only starts the render; the rendered video comes back here for review.")
                    : L("تأیید فقط ویدیوی تمیز رو در Drive می‌ذاره.", "Approval only puts the clean video in Drive.")}{" "}
                  {L("از اینجا چیزی در Instagram یا TikTok پست نمی‌شه.", "Nothing is posted to Instagram or TikTok from here.")}
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
            {L("بررسی بعد از هر اتصال (نیم ثانیهٔ اول)", "Check after every join (first half second)")}
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
        .catch((e) => setError(e.status === 403 ? L("این پروژه مال کس دیگه‌ایه.", "This project belongs to someone else.") : e.message)),
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
  if (error && !d) return <div className={s.error} dir={uiDir()}>{error}</div>;
  if (!d) return <p className={s.muted} dir={uiDir()}>{L("در حال بارگذاری…", "Loading…")}</p>;
  const run = d.runs.find((r) => r.id === sel) || latest;
  const p = d.project;
  return (
    <div dir={uiDir()} style={{ display: "contents" }}>
      <nav className={s.crumbs}>
        <Link href="/editing">{L("پروژه‌ها", "Projects")}</Link>
        <span aria-hidden>›</span>
        <span>{p.title}</span>
      </nav>
      <div className={s.head}>
        <span className={s.headIcon} aria-hidden><Clapperboard size={22} /></span>
        <div className={s.grow}>
          <h1 className={s.title} dir="auto">{p.title}</h1>
          <div className={s.headMeta}>
            <span className={`${s.kbLabel} ${s["k_" + p.kind] || ""}`}>{KIND[p.kind] ? L(KIND[p.kind]) : p.kind}</span>
            {latest && <Pill status={latest.status} label={statusLabel(latest)} />}
            <span className={s.kbBadge}>{LANG[p.language] ? L(LANG[p.language]) : p.language}</span>
            {p.topic && <span className={s.kbBadge} dir="auto">{p.topic}</span>}
            <a className={s.kbBadge} href={p.source_url} target="_blank" rel="noreferrer">
              <Film size={13} aria-hidden style={{ verticalAlign: "-2px" }} /> {L("فیلم خام", "raw footage")} ↗
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
        <div className={s.seg} role="tablist" aria-label={L("نسخه‌ها", "Versions")}>
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
    </div>
  );
}

export default function Page({ params }) {
  return <Shell>{() => <Project id={params.id} />}</Shell>;
}

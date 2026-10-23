"use client";

// Speak the whole review at once: "at 0:31 I said «دیگه» twice, and at 1:05 the cut is too sharp".
// The note is written down, split into corrections by the second they name, and shown here to be
// checked and changed before anything is added. A note with no time stays out until one is typed.

import { useEffect, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { api, s, Mixed } from "../../ui";
import { canRecord, clock, sendAudio, useRecorder } from "../../../voice/recorder";
import { L } from "../../../../lib/i18n";

export default function VoiceCorrections({ project, run, disabled, onAdded }) {
  const rec = useRecorder();
  const [stage, setStage] = useState(""); // "" | reading | adding
  const [found, setFound] = useState(null); // { text, corrections, unclear }
  const [error, setError] = useState("");
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!canRecord()) return;
    fetch("/api/voice/transcribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => setOn(!!d.enabled))
      .catch(() => {});
  }, []);
  if (!on) return null;

  const record = async () => {
    setError("");
    if (rec.state === "recording") return rec.stop();
    try {
      const blob = await rec.start();
      setStage("reading");
      const d = await sendAudio(`/api/editing/projects/${project.id}/corrections/voice`, blob);
      setFound({ text: d.text, corrections: d.corrections || [], unclear: (d.unclear || []).map((u) => ({ out: "", note: u })) });
    } catch (e) {
      setError(e.message);
    }
    setStage("");
  };

  const edit = (list, i, patch) => setFound({ ...found, [list]: found[list].map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const drop = (list, i) => setFound({ ...found, [list]: found[list].filter((_, j) => j !== i) });
  // a note said without a second is added as a note on the whole video, unless a second is typed in
  const ready = found ? [...found.corrections, ...found.unclear.filter((u) => u.note.trim())] : [];

  const addAll = async () => {
    setStage("adding");
    setError("");
    const done = new Set();
    try {
      for (const c of ready) {
        await api(`/projects/${project.id}/corrections`, { method: "POST", body: { run_id: run.id, out: c.out, note: c.note, general: !c.out.trim() } });
        done.add(c);
      }
      setFound(null);
    } catch (e) {
      // the ones already added are in the list above; keep the rest here to fix and add again
      setFound({ ...found, corrections: found.corrections.filter((c) => !done.has(c)), unclear: found.unclear.filter((c) => !done.has(c)) });
      setError(e.message);
    }
    setStage("");
    onAdded();
  };

  const recording = rec.state === "recording";
  const row = (list, c, i) => (
    <div key={list + i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input className={s.input} style={{ width: 72, flex: "none" }} data-no-voice value={c.out} placeholder="m:ss" aria-label={L("ثانیه در ویدیوی جدید", "Second in the new video")} onChange={(e) => edit(list, i, { out: e.target.value })} />
      <input className={s.input} style={{ flex: "1 1 0", minWidth: 0 }} dir="auto" value={c.note} aria-label={L("چه چیزی ایراد داره", "What is wrong")} onChange={(e) => edit(list, i, { note: e.target.value })} />
      <Button type="button" variant="ghost" size="icon" aria-label={L("این یکی رو کنار بذار", "Leave this one out")} onClick={() => drop(list, i)}>
        <X />
      </Button>
    </div>
  );

  return (
    <div className={s.voiceBox}>
      <div className={s.row}>
        <Button type="button" variant={recording ? "default" : "outline"} className={recording ? "bg-[#d92d20] hover:bg-[#b42318]" : ""} disabled={disabled || !!stage} onClick={record}>
          {stage === "reading" ? <Loader2 className="animate-spin" /> : recording ? <Square fill="currentColor" /> : <Mic />}
          {stage === "reading" ? L("در حال خواندن یادداشت‌هات…", "Reading your notes…") : recording ? L(`توقف (${clock(rec.seconds)})`, `Stop (${clock(rec.seconds)})`) : L("یادداشت‌هات رو بگو", "Speak your notes")}
        </Button>
        {!recording && !stage && !found && <span className={s.muted}>{L("فارسی یا انگلیسی. ثانیه رو بگو، بعد بگو چه ایرادی داره؛ هر چند تا که خواستی.", "Farsi or English. Say the second, then what is wrong; as many as you like.")}</span>}
        {recording && <span className={s.muted}>{L("دارم گوش می‌دم… هر ثانیه رو بگو و اینکه اونجا چه ایرادی هست.", "Listening… say each second and what is wrong there.")}</span>}
      </div>
      {found && (
        <>
          <details>
            <summary className={s.muted} style={{ cursor: "pointer" }}>
              {L("چیزی که شنیدم", "What I heard")}
            </summary>
            <p dir="auto" style={{ margin: "6px 0 0" }}>
              <Mixed text={found.text} />
            </p>
          </details>
          {found.corrections.length > 0 ? (
            <>
              <p className={s.muted}>{L("بررسی‌شون کن، هر چی لازمه عوض کن، بعد اضافه کن:", "Check them, change anything, then add:")}</p>
              {found.corrections.map((c, i) => row("corrections", c, i))}
            </>
          ) : (
            <p className={s.muted}>{L("توی یادداشت لحظه‌ای با زمان مشخص پیدا نشد.", "No moment with a time was found in the note.")}</p>
          )}
          {found.unclear.length > 0 && (
            <>
              <p className={s.muted}>{L("برای این‌ها ثانیه‌ای گفته نشد: یکی تایپ کن، وگرنه به‌عنوان یادداشت روی کل ویدیو اضافه می‌شن.", "No second was said for these: type one, or they are added as notes on the whole video.")}</p>
              {found.unclear.map((c, i) => row("unclear", c, i))}
            </>
          )}
          <div className={s.row}>
            <Button type="button" disabled={!ready.length || !!stage} onClick={addAll}>
              {stage === "adding" ? L("در حال افزودن…", "Adding…") : L(`افزودن ${ready.length} اصلاحیه`, `Add ${ready.length} correction${ready.length === 1 ? "" : "s"}`)}
            </Button>
            <Button type="button" variant="ghost" disabled={!!stage} onClick={() => setFound(null)}>
              {L("دور بریز", "Discard")}
            </Button>
          </div>
        </>
      )}
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

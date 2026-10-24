"use client";

// A microphone button that stays where it is put, for forms people fill on a phone. The app-wide
// dictation (app/VoiceDictation.jsx) floats over the focused field, and on an iPhone the keyboard
// can push it out of sight; this one sits in the form's own row. The words come back through
// onText, in the language they were spoken.

import { useEffect, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { canRecord, clock, sendAudio, useRecorder } from "./recorder";
import { L } from "../../lib/i18n";

let enabled = null;
function voiceOn() {
  if (!enabled) enabled = fetch("/api/voice/transcribe", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((d) => !!d.enabled).catch(() => false);
  return enabled;
}

export default function MicButton({ onText, className = "", label }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const rec = useRecorder();
  useEffect(() => {
    if (canRecord()) voiceOn().then(setOn);
  }, []);
  if (!on) return null;
  const recording = rec.state === "recording";
  const click = async () => {
    setMsg("");
    if (recording) return rec.stop();
    try {
      const blob = await rec.start();
      setBusy(true);
      const { text } = await sendAudio("/api/voice/transcribe", blob);
      if (text) onText(text);
      else setMsg(L("کلمه‌ای شنیده نشد", "No words heard"));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={click}
        disabled={busy}
        aria-label={recording ? L("توقف و نوشتن", "Stop and write it") : L("به‌جای تایپ حرف بزن", "Speak instead of typing")}
        style={recording ? { background: "#d92d20", color: "#fff", borderColor: "#d92d20" } : undefined}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : recording ? <Square size={14} fill="currentColor" aria-hidden /> : <Mic size={16} aria-hidden />}{" "}
        {busy ? L("در حال نوشتن…", "Writing…") : recording ? L(`توقف ${clock(rec.seconds)}`, `Stop ${clock(rec.seconds)}`) : label || L("بگو", "Speak")}
      </button>
      {msg && <span role="status" style={{ color: "#b42318", fontSize: 12.5, flexBasis: "100%" }}>{msg}</span>}
    </>
  );
}

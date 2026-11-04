"use client";

// The voice of a voice-only motion graphics project (Hamed, Nov 4 2026: "a section to add a voice to
// build a motion with, without any video"): recorded here, chosen from the device, or a Drive link.
// A recording or a file is stored on editing-data at once (/api/editing/voices/upload) and the project
// names it; a Drive link goes in source_url like any video link.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Button } from "../../../components/ui/button";
import DrivePicker from "../../DrivePicker";
import { canRecord, clock, useRecorder } from "../../voice/recorder";
import { s } from "../ui";
import { L } from "../../../lib/i18n";

async function upload(blob, name) {
  const form = new FormData();
  form.append("audio", blob, name);
  const res = await fetch("/api/editing/voices/upload", { method: "POST", body: form, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || L(`صدا ذخیره نشد (${res.status})`, `the voice was not saved (${res.status})`));
  return data.voice;
}

export default function VoicePicker({ voice, onVoice, link, onLink }) {
  const rec = useRecorder();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [canRec, setCanRec] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => setCanRec(canRecord()), []);
  useEffect(() => () => voice && voice.url && URL.revokeObjectURL(voice.url), [voice]);

  const keep = async (blob, name) => {
    setBusy("upload");
    setError("");
    try {
      const path = await upload(blob, name);
      onVoice({ path, name, url: URL.createObjectURL(blob) });
      onLink("");
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const record = async () => {
    setError("");
    try {
      const blob = await rec.start();
      const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
      await keep(blob, `voice.${ext}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className={s.field}>
      <span>{L("صدا", "The voice")}</span>
      {voice ? (
        <div className={s.row} style={{ flexWrap: "wrap", alignItems: "center" }}>
          <audio controls src={voice.url} style={{ maxWidth: "100%" }} />
          <Button type="button" variant="outline" onClick={() => onVoice(null)}>
            {L("عوض کردن", "Replace")}
          </Button>
        </div>
      ) : (
        <>
          <div className={s.row} style={{ flexWrap: "wrap", alignItems: "center" }}>
            {canRec &&
              (rec.state === "recording" ? (
                <Button type="button" variant="destructive" onClick={rec.stop}>
                  <Square size={16} aria-hidden /> {L("پایان ضبط", "Stop")} · {clock(rec.seconds)}
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={!!busy} onClick={record}>
                  <Mic size={16} aria-hidden /> {L("ضبط صدا", "Record")}
                </Button>
              ))}
            <Button type="button" variant="outline" disabled={!!busy || rec.state === "recording"} onClick={() => fileRef.current && fileRef.current.click()}>
              <Upload size={16} aria-hidden /> {L("فایل صدا از این دستگاه", "Audio file from this device")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.webm"
              hidden
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                e.target.value = "";
                if (f) keep(f, f.name);
              }}
            />
            <DrivePicker kind="audio" onPick={(file) => onLink(file.url)} disabled={!!busy} />
          </div>
          <input
            id="voice_link"
            data-no-voice
            className={s.input}
            value={link}
            onChange={(e) => onLink(e.target.value)}
            placeholder={L("یا لینک فایل صدا در Drive رو بچسبون", "or paste the voice file's Drive link")}
          />
          {busy === "upload" && <small className={s.muted}>{L("در حال ذخیرهٔ صدا…", "Saving the voice…")}</small>}
        </>
      )}
      {error && <div className={s.error}>{error}</div>}
      <small className={s.muted}>
        {L(
          "ضبط تا ۵ دقیقه، فایل تا ۲۰ مگابایت (m4a، mp3، wav). ویدیویی لازم نیست: کل تصویر موشن‌گرافیکه، روی همین صدا.",
          "Recording up to 5 minutes, a file up to 20 MB (m4a, mp3, wav). No video needed: the whole picture is motion graphics, on this voice."
        )}
      </small>
    </div>
  );
}

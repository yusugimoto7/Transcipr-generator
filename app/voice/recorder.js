"use client";

// Recording a voice note in the browser, shared by the app-wide dictation and spoken corrections.
// Safari records audio/mp4 and Chrome audio/webm; the file name's extension tells the speech API
// which one it got.

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_S = 300;

function pickType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function canRecord() {
  return typeof window !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && pickType() !== null;
}

export function useRecorder() {
  const [state, setState] = useState("idle"); // idle | recording
  const [seconds, setSeconds] = useState(0);
  const rec = useRef(null);
  const stopRef = useRef(null);

  const cleanup = () => {
    const r = rec.current;
    if (r) {
      clearInterval(r.timer);
      r.stream.getTracks().forEach((t) => t.stop());
    }
    rec.current = null;
    setState("idle");
    setSeconds(0);
  };
  useEffect(() => () => rec.current && cleanup(), []);

  // Resolves with the recording when stop() is called (or after 5 minutes).
  const start = useCallback(async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error("the microphone is blocked: allow it for this site in the browser settings");
    }
    const type = pickType();
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const done = new Promise((resolve) => {
      mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        const mime = (mr.mimeType || type || "audio/webm").split(";")[0];
        cleanup();
        resolve(new Blob(chunks, { type: mime }));
      };
    });
    const started = Date.now();
    rec.current = { stream, mr, timer: setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_S && mr.state === "recording") mr.stop();
    }, 250) };
    stopRef.current = () => mr.state === "recording" && mr.stop();
    mr.start(1000);
    setState("recording");
    return done;
  }, []);

  const stop = useCallback(() => stopRef.current && stopRef.current(), []);
  return { state, seconds, start, stop };
}

export async function sendAudio(url, blob) {
  const ext = /mp4|m4a|aac/.test(blob.type) ? "m4a" : /ogg/.test(blob.type) ? "ogg" : "webm";
  const form = new FormData();
  form.append("audio", blob, `note.${ext}`);
  const res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `the note could not be read (${res.status})`);
  return data;
}

export function clock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

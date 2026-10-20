"use client";

// Speak instead of type, in any text field of the app: a microphone appears at the edge of the
// field that has focus; tap it, speak Farsi or English (or both), tap again, and the words are
// written where the cursor was. Mounted once in app/layout.jsx, so every screen has it without
// changes of its own. A field opts out with data-no-voice (links, codes).

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "../components/ui/button";
import { canRecord, clock, sendAudio, useRecorder } from "./voice/recorder";

const TYPES = ["text", "search", ""];

function eligible(el) {
  if (!el || el.disabled || el.readOnly || el.closest("[data-no-voice]")) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const im = (el.getAttribute("inputmode") || "").toLowerCase();
  return TYPES.includes((el.getAttribute("type") || "").toLowerCase()) && !["url", "email", "numeric", "decimal", "tel"].includes(im);
}

// Writes through the element's own value setter and an input event, so React's onChange sees it
// exactly as if it had been typed.
function insert(el, text) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  const v = el.value || "";
  const s = el.selectionStart ?? v.length;
  const e = el.selectionEnd ?? v.length;
  const before = v.slice(0, s);
  const after = v.slice(e);
  const piece = (before && !/\s$/.test(before) ? " " : "") + text + (after && !/^\s/.test(after) ? " " : "");
  let next = before + piece + after;
  if (el.maxLength > 0) next = next.slice(0, el.maxLength);
  setter.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = Math.min(next.length, (before + piece).length);
  try {
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
  } catch {}
}

export default function VoiceDictation() {
  const [on, setOn] = useState(false);
  const [target, setTarget] = useState(null);
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const keep = useRef(false);
  const live = useRef({ recording: false, busy: false });
  const rec = useRecorder();
  live.current = { recording: rec.state === "recording", busy };

  useEffect(() => {
    if (!canRecord()) return;
    fetch("/api/voice/transcribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setOn(!!d.enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!on) return;
    const focusIn = (e) => {
      if (live.current.recording || live.current.busy) return;
      setMsg("");
      setTarget(eligible(e.target) ? e.target : null);
    };
    // A tap on the microphone blurs the field on phones; the field stays the target.
    const focusOut = () =>
      setTimeout(() => {
        if (keep.current || live.current.recording || live.current.busy) return;
        if (!eligible(document.activeElement)) setTarget(null);
      }, 250);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, [on]);

  useEffect(() => {
    if (!target) return setPos(null);
    const place = () => {
      if (!target.isConnected) return setTarget(null);
      const r = target.getBoundingClientRect();
      const size = 32;
      const inside = r.width >= 140;
      const top = target.tagName === "TEXTAREA" ? r.top + 4 : r.top + Math.max(0, (r.height - size) / 2);
      // Farsi fields put their text on the right, so the microphone goes to the left there.
      const rtl = getComputedStyle(target).direction === "rtl";
      const left = inside ? (rtl ? r.left + 4 : r.right - size - 4) : r.right + 4;
      setPos({ top, left, size });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport && window.visualViewport.addEventListener("resize", place);
    const t = setInterval(place, 500); // fields move when a page re-renders around them
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport && window.visualViewport.removeEventListener("resize", place);
      clearInterval(t);
    };
  }, [target]);

  if (!on || !target || !pos) return null;

  const click = async () => {
    keep.current = false;
    setMsg("");
    if (rec.state === "recording") return rec.stop();
    const el = target;
    try {
      const blob = await rec.start();
      setBusy(true);
      const { text } = await sendAudio("/api/voice/transcribe", blob);
      if (text) insert(el, text);
      else setMsg("No words heard");
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const recording = rec.state === "recording";
  const label = recording ? "Stop and write it" : busy ? "Writing…" : "Speak instead of typing (Farsi or English)";
  return (
    <>
      <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 2147483000 }}>
        <Button
          type="button"
          size="icon"
          variant={recording ? "default" : "outline"}
          aria-label={label}
          title={label}
          disabled={busy}
          className={`h-8 w-8 rounded-full shadow-md ${recording ? "bg-[#d92d20] hover:bg-[#b42318]" : ""}`}
          onPointerDown={(e) => {
            keep.current = true;
            e.preventDefault();
          }}
          onClick={click}
        >
          {busy ? <Loader2 className="animate-spin" /> : recording ? <Square fill="currentColor" /> : <Mic />}
        </Button>
      </div>
      {(recording || busy || msg) && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: pos.top + pos.size + 6,
            left: Math.max(8, Math.min(pos.left + pos.size - 220, window.innerWidth - 228)),
            width: 220,
            zIndex: 2147483000,
            fontSize: 12.5,
            padding: "6px 10px",
            borderRadius: 8,
            background: msg ? "#fef3f2" : "#243b44",
            color: msg ? "#b42318" : "#fff",
            boxShadow: "0 2px 8px rgba(16,24,40,0.2)",
          }}
        >
          {msg || (recording ? `Listening ${clock(rec.seconds)} · tap ■ when done` : "Writing what you said…")}
        </div>
      )}
    </>
  );
}

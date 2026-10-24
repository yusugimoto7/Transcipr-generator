"use client";

// A small copy button in the corner of every text box that holds text (Telegram post, captions,
// notes…), on every page, so a generated text can be taken elsewhere in one tap. It sits at the
// bottom corner on the side the text starts from the other way, so it clears both the text and the
// voice microphone (top corner). A box opts out with `data-no-copy`; any other element that should
// get one carries `data-copy` (its text is copied).

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { L } from "../lib/i18n";

const SIZE = 26;

function boxes() {
  const out = [];
  for (const el of document.querySelectorAll("textarea, [data-copy]")) {
    if (el.closest("[data-no-copy]")) continue;
    const text = el.tagName === "TEXTAREA" ? el.value : el.innerText;
    if (!String(text || "").trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 36 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    // Only a box that is really on top there (not one under an open window or sheet).
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 20));
    if (!hit || !(hit === el || el.contains(hit))) continue;
    const rtl = getComputedStyle(el).direction === "rtl";
    out.push({ el, top: r.bottom - SIZE - 6, left: rtl ? r.left + 6 : r.right - SIZE - 6 });
  }
  return out;
}

export default function CopyCorners() {
  const [list, setList] = useState([]);
  const [done, setDone] = useState(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      // Same boxes in the same places: no new render, so its own buttons cannot set this off again.
      raf = requestAnimationFrame(() =>
        setList((prev) => {
          const next = boxes();
          const same = prev.length === next.length && prev.every((p, i) => p.el === next[i].el && Math.round(p.top) === Math.round(next[i].top) && Math.round(p.left) === Math.round(next[i].left));
          return same ? prev : next;
        })
      );
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    document.addEventListener("input", update, true);
    // Text typed or set by script without a DOM change still needs the button now and then.
    const t = setInterval(update, 1500);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      document.removeEventListener("input", update, true);
      clearInterval(t);
    };
  }, []);

  const copy = async (el) => {
    const text = el.tagName === "TEXTAREA" ? el.value : el.innerText;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers: select it so the system copy works.
      if (el.select) el.select();
    }
    setDone(el);
    setTimeout(() => setDone((d) => (d === el ? null : d)), 1400);
  };

  return list.map(({ el, top, left }, i) => (
    <button
      key={i}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => copy(el)}
      aria-label={L("کپی این متن", "Copy this text")}
      title={L("کپی", "Copy")}
      style={{
        position: "fixed", top, left, width: SIZE, height: SIZE, zIndex: 2147482000, padding: 0,
        display: "grid", placeItems: "center", borderRadius: 7, cursor: "pointer",
        border: "1px solid rgba(50,81,93,0.25)", background: "rgba(255,255,255,0.92)",
        color: done === el ? "#067647" : "#32515d", boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
      }}
    >
      {done === el ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  ));
}

"use client";

// Ctrl+V (or ⌘V, or "Paste" on a phone) puts a copied picture — a screenshot, an image copied
// from a page or a chat — into the picture upload box, on every page. It goes to the box the
// person last touched or typed near; when only one picture box is on screen, to that one. The
// picture enters exactly as if it had been chosen with the file picker, so every box treats it
// the same. Plain text pastes are left alone.

import { useEffect, useState } from "react";

const ACCEPTS = (input) => {
  const a = String(input.getAttribute("accept") || "");
  return !a || /image/.test(a);
};

function shown(el) {
  const box = (el.parentElement || el).getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

// The picture input that belongs to an element: the nearest ancestor holding one.
function inputNear(el) {
  for (let n = el, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
    const found = [...n.querySelectorAll('input[type="file"]')].filter(ACCEPTS);
    if (found.length === 1) return found[0];
    if (found.length > 1) return null;
  }
  return null;
}

export default function PasteImages() {
  const [note, setNote] = useState("");
  useEffect(() => {
    let last = null; // the element last tapped or focused
    const remember = (e) => {
      last = e.target;
    };
    const onPaste = (e) => {
      const data = e.clipboardData;
      if (!data) return;
      const files = [...(data.files || [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      const target = e.target;
      const editable = target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable);
      // Text copied from a document can carry a picture of itself; in a text field the text wins.
      if (editable && String(data.getData("text/plain") || "").trim()) return;
      let input = (target && target !== document.body && inputNear(target)) || (last && document.contains(last) && inputNear(last));
      if (!input) {
        const all = [...document.querySelectorAll('input[type="file"]')].filter((i) => ACCEPTS(i) && !i.disabled && shown(i));
        if (all.length === 1) input = all[0];
        else {
          if (all.length > 1) {
            setNote("روی جای آپلود عکس بزن، بعد Ctrl+V");
            setTimeout(() => setNote(""), 2600);
          }
          return;
        }
      }
      if (input.disabled) return;
      e.preventDefault();
      const dt = new DataTransfer();
      for (const [i, f] of (input.multiple ? files : files.slice(0, 1)).entries()) {
        // Screenshots come named "image.png"; a real name keeps several apart.
        const name = f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}-${i + 1}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
        dt.items.add(new File([f], name, { type: f.type }));
      }
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      setNote(dt.files.length > 1 ? `${dt.files.length} عکس اضافه شد` : "عکس اضافه شد");
      setTimeout(() => setNote(""), 1800);
    };
    document.addEventListener("pointerdown", remember, true);
    document.addEventListener("focusin", remember, true);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("pointerdown", remember, true);
      document.removeEventListener("focusin", remember, true);
      document.removeEventListener("paste", onPaste);
    };
  }, []);
  if (!note) return null;
  return (
    <div
      role="status"
      dir="rtl"
      style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 2147482500,
        background: "#243b44", color: "#fff", borderRadius: 12, padding: "9px 16px", fontSize: 13.5,
        fontFamily: "'Vazirmatn', sans-serif", boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      }}
    >
      {note}
    </div>
  );
}

"use client";

// A visa-result story drawn by hand: the 9:16 story on the screen, with its pictures and its text
// box moved and sized by finger or mouse (Hamed, Oct 23 2026: "a design page where I make the
// picture bigger or smaller and change the text box myself"). Everything is kept in story pixels
// (1080×1920) and sent to the server as `manual`, which draws exactly this (lib/visa-news/compose.js
// `planStory`). The preview is close to the drawn story, not the drawn story itself: the real one
// comes from the server, with the logo placed and a letter's margins trimmed.

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";

const SW = 1080, SH = 1920;
const FA = "'Vazirmatn', sans-serif";
const BG = { light: ["linear-gradient(160deg,#fbf7fd 0%,#f1eaf7 55%,#fdf8f1 100%)", "rgba(255,255,255,0.95)", "#2d1f5e"], dark: ["linear-gradient(170deg,#1d2b45 0%,#22344f 60%,#1a2740 100%)", "rgba(23,35,58,0.94)", "#ffffff"], brand: ["linear-gradient(170deg,#32515d 0%,#2a4651 100%)", "rgba(36,59,68,0.94)", "#ffffff"] };

// The automatic layout's shape, for a story drawn by hand from nothing: the taller picture big,
// the text over its upper part.
export function defaultManual(pics) {
  const order = pics.map((_, i) => i).sort((a, b) => pics[b].H / pics[b].W - pics[a].H / pics[a].W);
  const top = 100, bottom = 110, side = 40, gap = 30;
  const area = SH - top - bottom;
  const maxW = SW - side * 2;
  const heights = pics.length === 1 ? [area] : [(area - gap) * 0.72, (area - gap) * 0.28];
  let y = top;
  const place = order.map((i, j) => {
    const k = Math.min(maxW / pics[i].W, heights[j] / pics[i].H);
    const w = Math.round(pics[i].W * k), h = Math.round(pics[i].H * k);
    const p = { i, x: Math.round((SW - w) / 2), y: Math.round(y), w, h };
    y += h + gap;
    return p;
  });
  const big = place[0];
  return { place, text: { x: big.x + Math.round(big.w * 0.08), y: big.y + 40, w: Math.round(big.w * 0.84), font: 34 } };
}

export default function VisaDesigner({ pics, lines, manual, background = "light", onChange, onReset }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(360);
  const [m, setM] = useState(() => manual || defaultManual(pics));
  const [sel, setSel] = useState("text");
  const drag = useRef(null);
  const scale = width / SW;
  const [bg, over, overText] = BG[background] || BG.light;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    setM(manual || defaultManual(pics));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);

  const commit = (next) => {
    setM(next);
    onChange(next);
  };
  const at = (e) => ({ x: e.clientX / scale, y: e.clientY / scale });
  const start = (e, what, mode) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(what);
    drag.current = { what, mode, from: at(e), m };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const dx = p.x - d.from.x, dy = p.y - d.from.y;
    const next = { place: d.m.place.map((x) => ({ ...x })), text: d.m.text ? { ...d.m.text } : null };
    if (d.what === "text") {
      if (!next.text) return;
      if (d.mode === "move") Object.assign(next.text, { x: Math.round(d.m.text.x + dx), y: Math.round(d.m.text.y + dy) });
      else next.text.w = Math.round(Math.max(200, Math.min(SW, d.m.text.w + dx)));
    } else {
      const k = next.place.findIndex((x) => x.i === d.what);
      const o = d.m.place[k];
      if (!o) return;
      if (d.mode === "move") Object.assign(next.place[k], { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
      else {
        const w = Math.round(Math.max(120, Math.min(SW * 1.6, o.w + dx)));
        next.place[k] = { ...o, w, h: Math.round((w * o.h) / o.w) };
      }
    }
    setM(next);
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    onChange(m);
  };
  const font = (delta) => m.text && commit({ ...m, text: { ...m.text, font: Math.max(18, Math.min(80, m.text.font + delta)) } });
  const pad = m.text ? m.text.font * 0.7 : 0;

  return (
    <div dir="rtl" style={{ fontFamily: FA }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        <span style={{ color: "#52605b" }}>بکش تا جابه‌جا بشه؛ گوشهٔ پایین‌چپ رو بکش تا بزرگ یا کوچک بشه.</span>
        {m.text && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: "auto" }}>
            متن
            <Button size="sm" variant="outline" onClick={() => font(-2)} aria-label="Smaller text"><Minus aria-hidden /></Button>
            <span style={{ minWidth: 26, textAlign: "center" }}>{m.text.font}</span>
            <Button size="sm" variant="outline" onClick={() => font(2)} aria-label="Larger text"><Plus aria-hidden /></Button>
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={onReset}><RotateCcw aria-hidden /> خودکار</Button>
      </div>
      <div ref={wrap} style={{ width: "100%" }}>
        <div
          style={{ position: "relative", width, height: SH * scale, background: bg, borderRadius: 14, overflow: "hidden", touchAction: "none", userSelect: "none", direction: "ltr" }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {m.place.map((p) => {
            const pic = pics[p.i];
            if (!pic) return null;
            const on = sel === p.i;
            return (
              <div
                key={p.i}
                onPointerDown={(e) => start(e, p.i, "move")}
                style={{ position: "absolute", left: p.x * scale, top: p.y * scale, width: p.w * scale, height: p.h * scale, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", background: "#fff", outline: on ? "2px solid #6d5bd0" : "none", cursor: "move", overflow: "hidden" }}
              >
                <img src={pic.src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%" }} />
                {(pic.hides || []).map((b, k) => (
                  <span key={k} style={{ position: "absolute", left: `${(b.x / pic.W) * 100}%`, top: `${(b.y / pic.H) * 100}%`, width: `${(b.w / pic.W) * 100}%`, height: `${(b.h / pic.H) * 100}%`, background: "#111", borderRadius: 2 }} />
                ))}
                <span onPointerDown={(e) => start(e, p.i, "size")} style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 8, background: "#6d5bd0", border: "2px solid #fff", cursor: "nwse-resize", touchAction: "none" }} />
              </div>
            );
          })}
          {m.text && lines.length > 0 && (
            <div
              onPointerDown={(e) => start(e, "text", "move")}
              style={{ position: "absolute", left: m.text.x * scale, top: m.text.y * scale, width: m.text.w * scale, padding: `${pad * scale}px ${pad * 1.2 * scale}px`, borderRadius: 22 * scale, background: over, color: overText, boxShadow: "0 12px 34px rgba(0,0,0,0.30)", direction: "rtl", textAlign: "right", fontWeight: 800, fontSize: m.text.font * scale, lineHeight: 1.7, whiteSpace: "pre-line", outline: sel === "text" ? "2px solid #6d5bd0" : "none", cursor: "move" }}
            >
              {lines.map((l, i) => (i === 0 ? <b key={i} style={{ fontWeight: 900 }}>{l}{"\n"}</b> : <span key={i}>{l}{"\n"}</span>))}
              <span onPointerDown={(e) => start(e, "text", "size")} style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 8, background: "#6d5bd0", border: "2px solid #fff", cursor: "ew-resize", touchAction: "none" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

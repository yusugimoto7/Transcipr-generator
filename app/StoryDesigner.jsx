"use client";

// One fact-story page laid out by hand (Hamed, Oct 2026: the same hand design as the visa stories,
// for the stories of every topic). The page is shown at 1080×1920 scaled to the screen, first in
// the automatic layout the server draws (same CSS as lib/story/index.js), measured once, and then
// every part — headline, screenshot, body, source line — can be dragged and sized. "Make" sends
// the positions as `manual`; the server draws exactly that page again (job story_page).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Loader2, Minus, Plus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";

const SW = 1080, SH = 1920;
const FA = "'Vazirmatn', sans-serif";
// The same colours as STORY_BACKGROUNDS in lib/story/index.js.
const COLOURS = {
  purple: { bg: "#8a3893", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  black: { bg: "#000000", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  blue: { bg: "#2f6fed", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  red: { bg: "#e53935", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  green: { bg: "#0e7a4f", text: "#ffffff", box: "#ffffff", boxText: "#000000" },
  white: { bg: "#ffffff", text: "#000000", box: "#000000", boxText: "#ffffff", edge: "#dddddd" },
};
const faDigits = (s) => String(s || "").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const PARTS = [["headline", "تیتر"], ["shot", "اسکرین‌شات"], ["body", "متن"], ["ref", "منبع"]];

export default function StoryDesigner({ page, bg = "purple", busy, onMake, onReset, onSave }) {
  const c = COLOURS[bg] || COLOURS.purple;
  const wrap = useRef(null);
  const stage = useRef(null);
  const refs = { headline: useRef(null), shot: useRef(null), body: useRef(null), ref: useRef(null) };
  const img = useRef(null);
  const [width, setWidth] = useState(360);
  const [m, setM] = useState(page.manual || null);
  const [loaded, setLoaded] = useState(false);
  const [sel, setSel] = useState("shot");
  const [asked, setAsked] = useState(false);
  const drag = useRef(null);
  const scale = width / SW;
  const h = page.headline.length > 70 ? 52 : page.headline.length > 45 ? 58 : 64;
  const b = (page.body || "").length > 170 ? 42 : (page.body || "").length > 110 ? 46 : 50;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // A screenshot already in the browser's cache can finish loading before the page is ready to hear it.
  useEffect(() => {
    if (img.current && img.current.complete && img.current.naturalWidth) setLoaded(true);
  }, []);
  // Starting point: where the automatic layout puts each part, read from the page as drawn here.
  useLayoutEffect(() => {
    if (m || !loaded || !stage.current) return;
    const box = stage.current.getBoundingClientRect();
    const pos = (el, font) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round((r.left - box.left) / scale), y: Math.round((r.top - box.top) / scale), w: Math.round(r.width / scale), ...(font ? { font } : {}) };
    };
    // The automatic layout caps a tall screenshot at 820 px high (it is shown narrower, centred);
    // hand mode starts it at that same visible size, so nothing jumps when the parts become movable.
    const shot = pos(refs.shot.current);
    const im = img.current;
    if (shot && im && im.naturalWidth) {
      const r = im.naturalHeight / im.naturalWidth;
      const w = Math.min(shot.w, Math.round(820 / r));
      shot.x += Math.round((shot.w - w) / 2);
      shot.w = w;
    }
    setM({ headline: pos(refs.headline.current, h), shot, body: page.body ? pos(refs.body.current, b) : null, ref: page.ref ? pos(refs.ref.current, 30) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, m]);
  // A page drawn from this design is saved to the device as soon as it arrives.
  const lastUrl = useRef(page.image_url);
  useEffect(() => {
    if (asked && page.image_url && page.image_url !== lastUrl.current) {
      setAsked(false);
      onSave(page.image_url);
    }
    lastUrl.current = page.image_url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.image_url]);

  const at = (e) => ({ x: e.clientX / scale, y: e.clientY / scale });
  const start = (e, part, mode) => {
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(part);
    drag.current = { part, mode, from: at(e), m };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const p = at(e);
    const dx = p.x - d.from.x, dy = p.y - d.from.y;
    const o = d.m[d.part];
    if (!o) return;
    const next = { ...d.m, [d.part]: d.mode === "move" ? { ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : { ...o, w: Math.round(Math.max(120, Math.min(SW * 1.6, o.w + dx))) } };
    setM(next);
  };
  const end = () => {
    drag.current = null;
  };
  const font = (delta) => {
    if (!m || !m[sel] || sel === "shot") return;
    setM({ ...m, [sel]: { ...m[sel], font: Math.max(16, Math.min(120, m[sel].font + delta)) } });
  };

  const handle = (part) => (
    <span onPointerDown={(e) => start(e, part, "size")} style={{ position: "absolute", right: -14, bottom: -14, width: 44, height: 44, borderRadius: 12, background: "#6d5bd0", border: "3px solid #fff", cursor: "nwse-resize", touchAction: "none", zIndex: 2 }} />
  );
  const placed = (part) => (m && m[part] ? { position: "absolute", left: m[part].x, top: m[part].y, width: m[part].w, margin: 0, maxWidth: "none", ...(m[part].font ? { fontSize: m[part].font } : {}), outline: sel === part ? "4px solid #6d5bd0" : "none", outlineOffset: 6, cursor: "move" } : {});
  const grab = (part) => (m ? { onPointerDown: (e) => start(e, part, "move") } : {});

  return (
    <div dir="rtl" style={{ fontFamily: FA }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        <span style={{ color: "#52605b" }}>هر بخش رو بکش تا جابه‌جا بشه؛ گوشهٔ بنفش رو بکش تا بزرگ یا کوچک بشه.</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        {PARTS.filter(([k]) => k === "headline" || k === "shot" || (k === "body" && page.body) || (k === "ref" && page.ref)).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSel(k)} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel === k ? "#6d5bd0" : "#e5e0d5"}`, background: sel === k ? "rgba(109,91,208,0.1)" : "#fff", color: sel === k ? "#6d5bd0" : "#52605b", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FA }}>
            {l}
          </button>
        ))}
        {sel !== "shot" && m && m[sel] && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <Button size="sm" variant="outline" onClick={() => font(-2)} aria-label="Smaller text"><Minus aria-hidden /></Button>
            <span style={{ minWidth: 26, textAlign: "center" }}>{m[sel].font}</span>
            <Button size="sm" variant="outline" onClick={() => font(2)} aria-label="Larger text"><Plus aria-hidden /></Button>
          </span>
        )}
        <Button size="sm" variant="ghost" onClick={() => { setM(null); setLoaded(false); onReset(); }}><RotateCcw aria-hidden /> خودکار</Button>
      </div>
      <div ref={wrap} style={{ width: "100%" }}>
        <div style={{ position: "relative", width, height: SH * scale, overflow: "hidden", borderRadius: 14, touchAction: "none", userSelect: "none" }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <div
            ref={stage}
            style={{
              position: "absolute", left: 0, top: 0, width: SW, height: SH, transform: `scale(${scale})`, transformOrigin: "top left", background: c.bg, direction: "rtl", textAlign: "center",
              fontFamily: "'Inter','Vazirmatn',sans-serif",
              ...(m ? {} : { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "260px 70px 280px", boxSizing: "border-box" }),
            }}
          >
            <h1 ref={refs.headline} {...grab("headline")} style={{ fontWeight: 800, lineHeight: 1.45, fontSize: h, color: c.text, textShadow: "0 1px 3px rgba(0,0,0,.25)", maxWidth: 940, margin: 0, ...placed("headline") }}>
              {faDigits(page.headline)}
              {m && sel === "headline" && handle("headline")}
            </h1>
            <div ref={refs.shot} {...grab("shot")} style={{ width: 940, marginTop: 44, ...placed("shot") }}>
              <img ref={img} src={page.shot_url} alt="" draggable={false} onLoad={() => setLoaded(true)} style={{ display: "block", width: "100%", height: "auto", borderRadius: 18, background: "#fff", border: `2px solid ${c.edge || "transparent"}`, ...(m ? {} : { maxHeight: 820, objectFit: "contain" }) }} />
              {m && sel === "shot" && handle("shot")}
            </div>
            {page.body && (
              <div ref={refs.body} {...grab("body")} style={{ marginTop: 44, fontWeight: 800, fontSize: b, lineHeight: 1.5, maxWidth: 940, ...placed("body") }}>
                <span style={{ background: c.box, color: c.boxText, padding: "12px 26px", borderRadius: 16, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{faDigits(page.body)}</span>
                {m && sel === "body" && handle("body")}
              </div>
            )}
            {page.ref && (
              <div ref={refs.ref} {...grab("ref")} style={{ marginTop: 34, direction: "ltr", color: c.text, fontFamily: "'Inter',sans-serif", fontWeight: 700, fontSize: 30, opacity: 0.9, maxWidth: 940, ...placed("ref") }}>
                {page.ref}
                {m && sel === "ref" && handle("ref")}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#7d8984", marginTop: 6, lineHeight: 1.7 }}>پیش‌نمایشه؛ صفحهٔ واقعی با «ساخت» روی سرور کشیده می‌شه.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button disabled={!m || busy} onClick={() => { setAsked(true); onMake(m); }}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} {busy ? "در حال ساخت…" : "ساخت این طرح و دانلود"}
        </Button>
        {page.image_url && !busy && (
          <Button variant="outline" onClick={() => onSave(page.image_url)}>
            <Download aria-hidden /> دانلود این صفحه
          </Button>
        )}
      </div>
    </div>
  );
}

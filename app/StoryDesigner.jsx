"use client";

// One fact-story page laid out by hand (Hamed, Oct 2026: the same hand design as the visa stories,
// for the stories of every topic). The page is shown at 1080×1920 scaled to the screen, first in
// the automatic layout the server draws (same CSS as lib/story/index.js), measured once, and then
// every part — headline, screenshot, body, source line — can be dragged and sized. "Make" sends
// the positions as `manual`; the server draws exactly that page again (job story_page).
// Nov 12 2026 (Hamed: "like the visa story's design: make the picture and the type bigger or smaller,
// and let me ask for the whole design to be done again; the automatic button does not work"): − / +
// for the picture as well as the type, «مرتب کن» stacks the parts again inside the free area, a
// request in words is laid out by the server (`onRequest`), and «خودکار» really starts over (it used
// to wait for the picture to load a second time, which never happens).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignVerticalSpaceAround, Download, Loader2, Minus, Plus, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { L, uiDir } from "../lib/i18n";

const SW = 1080, SH = 1920;
const FA = "'Vazirmatn', sans-serif";
import { storyColours } from "../lib/story/colours";
import { headlineSize, bodySize, SAFE_TOP, SAFE_BOTTOM } from "../lib/story/type";
const faDigits = (s) => String(s || "").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
// Labels are [fa, en] pairs, read with L() when drawn.
const PARTS = [["headline", ["تیتر", "Headline"]], ["shot", ["اسکرین‌شات", "Screenshot"]], ["body", ["متن", "Text"]], ["ref", ["منبع", "Source"]]];

export default function StoryDesigner({ page, bg = "purple", busy, onMake, onReset, onSave, onRequest = null }) {
  const c = storyColours(bg);
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
  // the same type sizes the server draws the automatic layout with
  const h = headlineSize(page.headline);
  const b = bodySize(page.body || "");
  const [ask, setAsk] = useState("");
  // a layout the server worked out from a request (or another device's) replaces the one shown
  const manualKey = JSON.stringify(page.manual || null);
  const seenManual = useRef(manualKey);
  useEffect(() => {
    if (manualKey === seenManual.current) return;
    seenManual.current = manualKey;
    if (page.manual && !page.manual.blocks) setM(page.manual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualKey]);

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
      // a few px wider than measured for text: a width rounded down by a hair wraps the last word
      return { x: Math.round((r.left - box.left) / scale) - (font ? 3 : 0), y: Math.round((r.top - box.top) / scale), w: Math.ceil(r.width / scale) + (font ? 6 : 0), ...(font ? { font } : {}) };
    };
    // The automatic layout gives a tall screenshot only the room the text leaves (it is shown
    // narrower, centred); hand mode starts it at that same visible size, so nothing jumps when the
    // parts become movable.
    const shot = pos(img.current) || pos(refs.shot.current);
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
  // the picture bigger or smaller around its own middle
  const shotSize = (delta) => {
    if (!m || !m.shot) return;
    const w = Math.max(200, Math.min(SW * 1.2, m.shot.w + delta));
    setM({ ...m, shot: { ...m.shot, w, x: Math.round(m.shot.x - (w - m.shot.w) / 2) } });
  };
  // each part's height as it is drawn here, in story pixels
  const heights = () => {
    const out = {};
    for (const k of Object.keys(refs)) {
      const el = refs[k].current;
      if (el && m && m[k]) out[k] = { h: Math.round(el.getBoundingClientRect().height / scale) };
    }
    return out;
  };
  // «مرتب کن»: the parts one under the other again, centred, inside the area Instagram leaves free
  const tidy = () => {
    if (!m) return;
    const hs = heights();
    const order = Object.keys(hs).sort((a, b2) => m[a].y - m[b2].y);
    const gap = 40;
    const total = order.reduce((s, k) => s + hs[k].h, 0) + gap * (order.length - 1);
    let y = SAFE_TOP + Math.max(0, (SAFE_BOTTOM - SAFE_TOP - total) / 2);
    const next = { ...m };
    for (const k of order) {
      next[k] = { ...m[k], x: Math.round((SW - m[k].w) / 2), y: Math.round(y) };
      y += hs[k].h + gap;
    }
    setM(next);
  };
  // a part outside the free area would sit under Instagram's own buttons
  const [outside, setOutside] = useState(false);
  useLayoutEffect(() => {
    if (!m) return setOutside(false);
    const hs = heights();
    setOutside(Object.keys(hs).some((k) => m[k].y < SAFE_TOP - 4 || m[k].y + hs[k].h > SAFE_BOTTOM + 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, width]);

  const handle = (part) => (
    <span onPointerDown={(e) => start(e, part, "size")} style={{ position: "absolute", right: -14, bottom: -14, width: 44, height: 44, borderRadius: 12, background: "#6d5bd0", border: "3px solid #fff", cursor: "nwse-resize", touchAction: "none", zIndex: 2 }} />
  );
  const placed = (part) => (m && m[part] ? { position: "absolute", left: m[part].x, top: m[part].y, width: m[part].w, margin: 0, maxWidth: "none", ...(m[part].font ? { fontSize: m[part].font } : {}), outline: sel === part ? "4px solid #6d5bd0" : "none", outlineOffset: 6, cursor: "move" } : {});
  const grab = (part) => (m ? { onPointerDown: (e) => start(e, part, "move") } : {});

  return (
    <div dir={uiDir()} style={{ fontFamily: FA }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        <span style={{ color: "#52605b" }}>{L("هر بخش رو بکش تا جابه‌جا بشه؛ گوشهٔ بنفش رو بکش تا بزرگ یا کوچک بشه.", "Drag a part to move it; drag the purple corner to resize it.")}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        {PARTS.filter(([k]) => k === "headline" || k === "shot" || (k === "body" && page.body) || (k === "ref" && page.ref)).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSel(k)} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel === k ? "#6d5bd0" : "#e5e0d5"}`, background: sel === k ? "rgba(109,91,208,0.1)" : "#fff", color: sel === k ? "#6d5bd0" : "#52605b", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FA }}>
            {L(l)}
          </button>
        ))}
        {sel !== "shot" && m && m[sel] && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <Button size="sm" variant="outline" onClick={() => font(-2)} aria-label={L("متن کوچک‌تر", "Smaller text")}><Minus aria-hidden /></Button>
            <span style={{ minWidth: 26, textAlign: "center" }}>{m[sel].font}</span>
            <Button size="sm" variant="outline" onClick={() => font(2)} aria-label={L("متن بزرگ‌تر", "Larger text")}><Plus aria-hidden /></Button>
          </span>
        )}
        {sel === "shot" && m && m.shot && (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            <Button size="sm" variant="outline" onClick={() => shotSize(-40)} aria-label={L("عکس کوچک‌تر", "Smaller picture")}><Minus aria-hidden /></Button>
            <span style={{ minWidth: 34, textAlign: "center" }}>{Math.round((m.shot.w / 940) * 100)}٪</span>
            <Button size="sm" variant="outline" onClick={() => shotSize(40)} aria-label={L("عکس بزرگ‌تر", "Larger picture")}><Plus aria-hidden /></Button>
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 12.5 }}>
        <Button size="sm" variant="outline" disabled={!m} onClick={tidy}><AlignVerticalSpaceAround aria-hidden /> {L("مرتب کن", "Tidy up")}</Button>
        {/* the automatic layout again: shown here at once, and the server draws the page that way */}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => { setM(null); onReset(); }}><RotateCcw aria-hidden /> {L("طراحی خودکار از اول", "Automatic design again")}</Button>
        {outside && <span style={{ color: "#b45309", fontWeight: 700 }}>⚠ {L("یه بخش زیر دکمه‌های اینستاگرام می‌ره؛ «مرتب کن» رو بزن یا کوچیکش کن.", "A part goes under Instagram's buttons; press “Tidy up” or make it smaller.")}</span>}
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
            {m && (
              <>
                <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: SAFE_TOP, background: "rgba(0,0,0,0.16)", borderBottom: "3px dashed rgba(255,255,255,0.55)", pointerEvents: "none" }} />
                <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: SAFE_BOTTOM, bottom: 0, background: "rgba(0,0,0,0.16)", borderTop: "3px dashed rgba(255,255,255,0.55)", pointerEvents: "none" }} />
              </>
            )}
            <h1 ref={refs.headline} {...grab("headline")} style={{ flex: "none", fontWeight: 800, lineHeight: 1.45, fontSize: h, color: c.text, textShadow: "0 1px 3px rgba(0,0,0,.25)", maxWidth: 940, margin: 0, ...placed("headline") }}>
              {faDigits(page.headline)}
              {m && sel === "headline" && handle("headline")}
            </h1>
            <div ref={refs.shot} {...grab("shot")} style={{ width: 940, marginTop: 40, ...(m ? {} : { display: "flex", flexDirection: "column", alignItems: "center", minHeight: 0, flex: "0 1 auto" }), ...placed("shot") }}>
              <img ref={img} src={page.shot_url} alt="" draggable={false} onLoad={() => setLoaded(true)} style={{ display: "block", height: "auto", borderRadius: 18, background: "#fff", border: `2px solid ${c.edge || "transparent"}`, ...(m ? { width: "100%" } : { width: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }) }} />
              {m && sel === "shot" && handle("shot")}
            </div>
            {page.body && (
              <div ref={refs.body} {...grab("body")} style={{ flex: "none", marginTop: 40, fontWeight: 800, fontSize: b, lineHeight: 1.5, maxWidth: 940, ...placed("body") }}>
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
      <div style={{ fontSize: 11.5, color: "#7d8984", marginTop: 6, lineHeight: 1.7 }}>{L("پیش‌نمایشه؛ صفحهٔ واقعی با «ساخت» روی سرور کشیده می‌شه.", "This is a preview; the real page is drawn on the server when you press “Make”.")}</div>
      {onRequest && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid #e5e0d5", background: "#fff" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{L("یا بنویس طراحی چطور بشه، خودش دوباره می‌چینه", "Or write how the design should be; it is laid out again for you")}</div>
          <textarea
            dir="auto"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            rows={2}
            placeholder={L("مثلاً: عکس خیلی بزرگ‌تر بشه، متن پایین کوچیک‌تر، تیتر بره زیر عکس، پس‌زمینه سرمه‌ای", "e.g. a much bigger picture, smaller text under it, the headline under the picture, a navy background")}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid #e5e0d5", padding: 8, fontFamily: FA, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
          />
          <Button size="sm" style={{ marginTop: 6 }} disabled={!m || busy || !ask.trim()} onClick={() => { onRequest(ask.trim(), m, heights()); setAsk(""); }}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Wand2 aria-hidden />} {L("طراحی دوباره با این درخواست", "Design again from this request")}
          </Button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button disabled={!m || busy} onClick={() => { setAsked(true); onMake(m); }}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} {busy ? L("در حال ساخت…", "Making…") : L("ساخت این طرح و دانلود", "Make this design and download")}
        </Button>
        {page.image_url && !busy && (
          <Button variant="outline" onClick={() => onSave(page.image_url)}>
            <Download aria-hidden /> {L("دانلود این صفحه", "Download this page")}
          </Button>
        )}
      </div>
    </div>
  );
}

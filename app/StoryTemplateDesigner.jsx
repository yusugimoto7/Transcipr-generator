"use client";

// A story page in one of the templates, laid out by hand (Hamed, Oct 27 2026: the Design button must
// show the chosen template itself, not a plain colour). The page is drawn here with the template's
// own HTML (lib/story/templates.js) in a frame at 1080×1920, scaled to the screen; every block of
// the design (the children of .in: the badge, the card with the headline, the screenshot's frame…)
// gets a handle and can be dragged and widened. "Make" sends the blocks as `manual` and the server
// draws the same HTML with the same CSS (blockCss), so the page comes out as it looks here.

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { L, uiDir } from "../lib/i18n";
import { templatePageHtml, blockCss } from "../lib/story/templates";
import { STORY_CSS } from "../lib/story/css";

const SW = 1080, SH = 1920;
const IN_X = 64, IN_Y = 250; // where .in starts in every template
const FA = "'Vazirmatn', sans-serif";
const FONTS = "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&family=Inter:wght@100..900&display=block";

// What a block holds, for its chip: the parts the team knows by name, else "design".
function blockName(el) {
  if (el.querySelector("h1") || el.matches("h1")) return ["تیتر", "Headline"];
  if (el.querySelector("img.shot") || el.matches("img.shot")) return ["اسکرین‌شات", "Screenshot"];
  if (el.matches(".b") || el.querySelector(".b")) return ["متن", "Text"];
  if (el.matches(".ref")) return ["منبع", "Source"];
  if (el.matches(".ph") || el.querySelector(".ph")) return ["عکس", "Photo"];
  return ["طرح", "Design"];
}

export default function StoryTemplateDesigner({ page, story, total = 1, busy, onMake, onReset, onSave }) {
  const tpl = story.template;
  const wrap = useRef(null);
  const frame = useRef(null);
  const [width, setWidth] = useState(360);
  const saved = page.manual && page.manual.blocks && (!page.manual.template || page.manual.template === tpl) ? page.manual.blocks : null;
  const [blocks, setBlocks] = useState(saved);
  const [names, setNames] = useState([]);
  const [sel, setSel] = useState(-1);
  const [ready, setReady] = useState(false);
  const [asked, setAsked] = useState(false);
  const drag = useRef(null);
  const scale = width / SW;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The page as the server draws it: the template's HTML, its fonts, and the blocks' CSS.
  const html = templatePageHtml(tpl, page, total, story) || "";
  const doc = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${STORY_CSS}</style><style>html,body{margin:0;width:${SW}px;height:${SH}px;overflow:hidden}</style><style id="manual">${saved ? blockCss(saved) : ""}</style></head><body>${html}</body></html>`;

  // Where each block is once fonts and pictures are in: the starting point when nothing was placed yet.
  const measure = async () => {
    const d = frame.current && frame.current.contentDocument;
    if (!d) return;
    try {
      await d.fonts.ready;
    } catch (_) {}
    await Promise.all([...d.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
    const kids = [...d.querySelectorAll(".t .in > *")];
    setNames(kids.map(blockName));
    if (!saved) setBlocks(kids.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth })));
    setReady(true);
  };
  // The frame shows every move at once.
  useEffect(() => {
    const d = frame.current && frame.current.contentDocument;
    const st = d && d.getElementById("manual");
    if (st && blocks && ready) st.textContent = blockCss(blocks);
  }, [blocks, ready]);
  // Each block's box on screen, read from the frame after every change.
  const [boxes, setBoxes] = useState([]);
  useEffect(() => {
    const d = frame.current && frame.current.contentDocument;
    if (!d || !ready) return;
    const id = requestAnimationFrame(() => {
      const kids = [...d.querySelectorAll(".t .in > *")];
      setBoxes(kids.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    });
    return () => cancelAnimationFrame(id);
  }, [blocks, ready]);

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
  const start = (e, i, mode) => {
    if (!blocks) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(i);
    drag.current = { i, mode, from: at(e), blocks };
  };
  const move = (e) => {
    const g = drag.current;
    if (!g) return;
    const p = at(e);
    const dx = Math.round(p.x - g.from.x), dy = Math.round(p.y - g.from.y);
    const o = g.blocks[g.i];
    if (!o) return;
    const next = g.blocks.slice();
    next[g.i] = g.mode === "move" ? { ...o, x: o.x + dx, y: o.y + dy } : { ...o, w: Math.max(120, Math.min(SW * 1.4, o.w + dx)) };
    setBlocks(next);
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div dir={uiDir()} style={{ fontFamily: FA }}>
      <div style={{ fontSize: 12.5, color: "#52605b", marginBottom: 8 }}>
        {L("طرح همین قالب. هر بخش رو بکش تا جابه‌جا بشه؛ گوشهٔ بنفش رو بکش تا پهن یا باریک بشه.", "This template's own design. Drag a block to move it; drag the purple corner to make it wider or narrower.")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {names.map((n, i) => (
          <button key={i} type="button" onClick={() => setSel(i)} style={{ padding: "5px 10px", borderRadius: 999, border: `1px solid ${sel === i ? "#6d5bd0" : "#e5e0d5"}`, background: sel === i ? "rgba(109,91,208,0.1)" : "#fff", color: sel === i ? "#6d5bd0" : "#52605b", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FA }}>
            {L(n)}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => { setSel(-1); setReady(false); setBlocks(null); onReset(); }}>
          <RotateCcw aria-hidden /> {L("خودکار", "Automatic")}
        </Button>
      </div>
      <div ref={wrap} style={{ width: "100%" }}>
        <div style={{ position: "relative", width, height: SH * scale, overflow: "hidden", borderRadius: 14, touchAction: "none", userSelect: "none", background: "#eee" }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <iframe
            ref={frame}
            key={tpl + (blocks ? "" : ":auto")}
            title={L("طرح صفحه", "Page design")}
            srcDoc={doc}
            onLoad={measure}
            style={{ position: "absolute", left: 0, top: 0, width: SW, height: SH, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
          />
          {ready &&
            boxes.map((b, i) => (
              <div
                key={i}
                onPointerDown={(e) => start(e, i, "move")}
                style={{ position: "absolute", left: b.x * scale, top: b.y * scale, width: b.w * scale, height: Math.max(12, b.h * scale), outline: sel === i ? "2px solid #6d5bd0" : "1px dashed rgba(109,91,208,.45)", outlineOffset: 2, cursor: "move", touchAction: "none" }}
              >
                {sel === i && (
                  <span onPointerDown={(e) => start(e, i, "size")} style={{ position: "absolute", right: -9, bottom: -9, width: 22, height: 22, borderRadius: 7, background: "#6d5bd0", border: "2px solid #fff", cursor: "ew-resize", touchAction: "none" }} />
                )}
              </div>
            ))}
          {!ready && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#52605b", fontSize: 13 }}>
              <Loader2 className="animate-spin" aria-hidden />
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#7d8984", marginTop: 6, lineHeight: 1.7 }}>
        {L("پیش‌نمایشه؛ صفحهٔ واقعی با «ساخت» روی سرور با همین قالب کشیده می‌شه.", "This is a preview; the real page is drawn on the server in this same template when you press “Make”.")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button disabled={!blocks || !ready || busy} onClick={() => { setAsked(true); onMake({ template: tpl, blocks }); }}>
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

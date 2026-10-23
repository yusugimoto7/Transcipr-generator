"use client";

// Studio → خبر ویزا: up to ten pictures of a client's approval letter and application timeline,
// plus the team's notes, become a visa-result case, listed like a topic. Opened, it holds the
// story tools: the boxes on each picture (lib/visa-news/scan.js) to check, a note per picture and
// per story to correct them, the story text, the design, and the stories. While it is worked on the
// case is held in the server's memory (lib/visa-news/pending.js), so leaving or closing the page
// does not stop or lose it; once its stories are made it is saved for the team with the covered
// pictures only (lib/visa-news/cases.js).

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarPlus, CircleDashed, Download, EyeOff, ImagePlus, Loader2, Megaphone, ScanSearch, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/input";
import { Card } from "../components/ui/card";

const MAX = 10;
const FA = "'Vazirmatn', sans-serif";
const MARKS = [["marker", "هایلایت زرد"], ["circle", "دایره قرمز"], ["underline", "خط زیر قرمز"]];
const BACKS = [["light", "روشن", "#f1eaf7"], ["dark", "سرمه‌ای", "#1d2b45"], ["brand", "سبز سوگیموتو", "#32515d"]];

function shrink(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Large enough for the numbers on a letter to be read, small enough to send ten.
        const k = Math.min(1, 2000 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: file.name || "picture", data: c.toDataURL("image/jpeg", 0.9) });
      };
      img.onerror = () => resolve(null);
      img.src = r.result;
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

async function runJob(kind, body, onProgress) {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, topic: { title_fa: `visa-results-${Date.now()}` }, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.job) throw new Error(data.error || "could not start");
  const id = data.job.id;
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await fetch("/api/jobs?ids=" + id, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j) continue;
    if ((j.missing || []).includes(id)) throw new Error("the server restarted; try again");
    const job = (j.jobs || [])[0];
    if (!job) continue;
    if (job.status === "error") throw new Error(job.error || "failed");
    if (job.status === "done") return job.result;
    onProgress(job.result);
  }
}

function Picture({ image, scan, tool, mark = "marker", onToggle, onAdd }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const W = scan.width || 1;
  const H = scan.height || 1;
  const pct = (b) => ({ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` });
  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const box = drag && { x: Math.min(drag.a.x, drag.b.x), y: Math.min(drag.a.y, drag.b.y), w: Math.abs(drag.b.x - drag.a.x), h: Math.abs(drag.b.y - drag.a.y) };
  return (
    <div
      ref={ref}
      style={{ position: "relative", width: "100%", touchAction: tool ? "none" : "auto", cursor: tool ? "crosshair" : "default", userSelect: "none" }}
      onPointerDown={(e) => {
        if (!tool) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        setDrag({ a: p, b: p });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, b: at(e) })}
      onPointerUp={() => {
        if (drag && box.w > 6 && box.h > 6) onAdd({ ...box, kind: tool });
        setDrag(null);
      }}
    >
      <img src={image.data} alt="" draggable={false} style={{ display: "block", width: "100%", borderRadius: 8 }} />
      {scan.boxes.map((b) => (
        <button
          key={b.id}
          type="button"
          title={(b.on ? "Tap to uncover: " : "Tap to cover again: ") + (b.label || "")}
          onClick={(e) => {
            e.stopPropagation();
            if (!tool) onToggle(b.id);
          }}
          style={{
            position: "absolute", ...pct(b), padding: 0, cursor: tool ? "crosshair" : "pointer",
            ...(b.kind === "hide"
              ? b.on ? { background: "#111", border: "none", borderRadius: 4 } : { background: "rgba(225,29,46,0.08)", border: "2px dashed #e11d2e", borderRadius: 4 }
              : !b.on ? { background: "transparent", border: "2px dashed #9ca3af", borderRadius: 4 }
              : mark === "marker" ? { background: "rgba(255,225,77,0.5)", border: "none", borderRadius: 4 }
              : mark === "underline" ? { background: "transparent", border: "none", borderBottom: "3px solid #e11d2e", borderRadius: 0 }
              : { background: "transparent", border: "3px solid #e11d2e", borderRadius: "50%", transform: "scale(1.15, 1.6)" }),
          }}
        />
      ))}
      {box && <div style={{ position: "absolute", ...pct(box), border: `2px solid ${tool === "hide" ? "#111" : "#e11d2e"}`, background: tool === "hide" ? "rgba(17,17,17,0.5)" : "transparent", borderRadius: tool === "hide" ? 4 : "50%" }} />}
    </div>
  );
}

const newId = () => "vc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const OPTS = { mark: "marker", background: "light", watermark: true };

// The heading a case is listed under: «خبر ویزا · <title and first name>».
function caseName(c) {
  const nums = [...new Set(c.groups || [])].sort((a, b) => a - b);
  const first = String(((c.texts || {})[nums[0]] || "")).split("\n")[0].trim();
  return first && !/^⬅️/.test(first) ? first : c.title || "مشتری";
}

function when(ms) {
  try {
    return new Date(ms).toLocaleDateString("fa-IR", { month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

// One client's visa result, opened like a topic: pictures (with the boxes to check when they were
// just uploaded), the story text, the design, making the stories, and what was made.
function VisaCase({ c, C, update, onBack, onArchive, learn }) {
  const [tool, setTool] = useState(null);
  const [notes, setNotes] = useState({}); // picture index -> the team's note
  const [learnOn, setLearnOn] = useState({}); // picture index (or "story") -> learn from it
  const [fixing, setFixing] = useState({}); // picture index -> being read again
  const [storyNote, setStoryNote] = useState("");
  const [restyling, setRestyling] = useState(false);
  const Learn = (learn && learn.Toggle) || (() => null);
  const teachFrom = (note, context) => learn && learn.teach && learn.teach({ topic: { title_fa: "خبر ویزا · " + caseName(c) }, scope: "visa", note, context });
  const topRef = useRef(null);
  // Opened from further down the list: the case starts at its own top, like a topic page.
  useEffect(() => {
    if (topRef.current) topRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [c.id]);
  const fresh = (c.images || []).some((im) => im.data);
  const nums = [...new Set(c.groups || [])].sort((a, b) => a - b);
  const tooMany = nums.some((n) => c.groups.filter((g) => g === n).length > 2);
  const hidden = (c.scans || []).reduce((n, s) => n + ((s && s.boxes) || []).filter((b) => b.kind === "hide" && b.on).length, 0);
  const unchecked = (c.scans || []).filter((s) => s && !s.checked && !s.error).length;
  const pill = (on) => ({ padding: "6px 10px", borderRadius: 999, border: `1px solid ${on ? C.orange : C.line}`, background: on ? "rgba(50,81,93,0.10)" : C.surface, color: on ? C.orange : C.text2, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FA });
  const section = (title, body) => (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: C.surface, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{title}</div>
      {body}
    </div>
  );
  const setScan = (i, fn) => update((x) => ({ scans: x.scans.map((s, j) => (j === i ? fn(s) : s)) }));
  const toggle = (i, id) => setScan(i, (s) => ({ ...s, boxes: s.boxes.map((b) => (b.id === id ? { ...b, on: !b.on } : b)) }));
  const addBox = (i, b) => setScan(i, (s) => ({ ...s, boxes: [...s.boxes, { ...b, id: Math.max(-1, ...s.boxes.map((x) => x.id)) + 1, on: true, label: "added by hand" }] }));
  const removeImage = (i) => update((x) => ({ images: x.images.filter((_, j) => j !== i), scans: x.scans ? x.scans.filter((_, j) => j !== i) : x.scans, groups: x.groups.filter((_, j) => j !== i), kinds: (x.kinds || []).filter((_, j) => j !== i) }));

  const draw = async (over = {}) => {
    const texts = over.texts || c.texts;
    const opts = over.opts || c.opts;
    update({ busy: true, error: "", progress: "" });
    try {
      const r = await runJob(
        "visa_story",
        {
          // Pictures still held on the server go by reference (no second upload of the originals).
          images: c.images.map((im, i) => (im.data ? { pending: true, boxes: (c.scans && c.scans[i] && c.scans[i].boxes) || [] } : { url: im.url, marks: (c.marks || [])[i] || [] })),
          stories: nums.map((n) => ({ images: c.groups.map((g, i) => (g === n ? i : -1)).filter((i) => i >= 0), text: (texts || {})[n] || "" })),
          ...opts,
          case: { id: c.id, title: caseName({ ...c, texts }), created: c.created, groups: c.groups, texts, kinds: c.kinds },
        },
        (p) => p && update({ progress: `${p.done || 0} از ${p.total || nums.length}` })
      );
      // From now on the case is the saved one: covered pictures only, the originals let go.
      update({ stories: r.stories || [], images: (r.covered || []).map((url, i) => (url ? { url } : c.images[i])), marks: r.marks || [], scans: null, checked: false, calendar: "", saved: !!r.saved, status: "saved" });
    } catch (e) {
      update({ error: String(e.message || e) });
    } finally {
      update({ busy: false, progress: "" });
    }
  };
  // A picture read again with the team's note; its boxes are replaced.
  const fix = async (i) => {
    const note = String(notes[i] || "").trim();
    if (!note) return;
    setFixing((f) => ({ ...f, [i]: true }));
    if (learnOn[i]) teachFrom(note, `picture ${i + 1} of a visa-result case (${(c.scans && c.scans[i] && c.scans[i].kind) || "picture"})`);
    try {
      const r = await runJob("visa_fix", { caseId: c.id, index: i, note }, () => {});
      update((x) => ({ scans: (x.scans || []).map((s, j) => (j === i ? r.scan : s)), checked: false }));
      setNotes((n) => ({ ...n, [i]: "" }));
    } catch (e) {
      update({ error: String(e.message || e) });
    } finally {
      setFixing((f) => ({ ...f, [i]: false }));
    }
  };
  // The finished stories changed by a note: new text and look, then drawn again.
  const restyle = async () => {
    const note = storyNote.trim();
    if (!note) return;
    setRestyling(true);
    if (learnOn.story) teachFrom(note, Object.values(c.texts || {}).join("\n---\n"));
    try {
      const r = await runJob("visa_restyle", { texts: c.texts, note, opts: c.opts }, () => {});
      update({ texts: r.texts, opts: r.opts });
      setStoryNote("");
      setRestyling(false);
      await draw({ texts: r.texts, opts: r.opts });
    } catch (e) {
      update({ error: String(e.message || e) });
      setRestyling(false);
    }
  };
  const download = async () => {
    for (const [k, s] of (c.stories || []).filter((x) => x.url).entries()) {
      const a = document.createElement("a");
      a.href = "/api/carousel/download?url=" + encodeURIComponent(s.url) + "&name=" + encodeURIComponent(`visa-result-${k + 1}.png`);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 700));
    }
  };
  const toCalendar = async () => {
    update({ calendar: "…" });
    try {
      const r = await fetch("/api/calendar/visa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: c.stories.filter((s) => s.url).map((s) => s.url), title: caseName(c).replace(/^(سرکار خانم|جناب آقای)\s*/, "") }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "failed");
      update({ calendar: `/calendar?board=${j.card.board_id}&card=${j.card.id}` });
    } catch (e) {
      update({ calendar: "error:" + String(e.message || e) });
    }
  };
  const storySelect = (i) =>
    c.images.length > 1 && (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
        استوری
        <select
          value={c.groups[i]}
          onChange={(e) => {
            const n = Number(e.target.value);
            update((x) => ({ groups: x.groups.map((g, j) => (j === i ? n : g)), texts: (x.texts || {})[n] != null ? x.texts : { ...x.texts, [n]: x.texts[x.groups[i]] || "" } }));
          }}
          style={{ fontFamily: FA, borderRadius: 8, border: `1px solid ${C.line}`, padding: "3px 6px" }}
        >
          {[...nums, Math.max(-1, ...c.groups) + 1].map((n, k) => (
            <option key={n} value={n}>{k < nums.length ? k + 1 : "جدید"}</option>
          ))}
        </select>
      </span>
    );

  return (
    <div ref={topRef} style={{ scrollMarginTop: 80 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowRight aria-hidden /> خبرهای ویزا
        </Button>
        {c.saved && onArchive && (
          <Button variant="ghost" size="sm" onClick={() => window.confirm("این خبر ویزا از فهرست برداشته بشه؟") && onArchive()}>
            <Trash2 aria-hidden /> بایگانی
          </Button>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
        <Megaphone size={18} aria-hidden /> خبر ویزا · {caseName(c)}
      </div>
      <div style={{ fontSize: 12, color: C.text3, marginBottom: 12 }}>
        {when(c.created)} · {c.images.length} عکس · {c.saved ? "ذخیره‌شده برای تیم" : "فقط روی همین صفحه، تا استوری ساخته بشه"}
      </div>

      {c.reading ? (
        section("در حال خواندن عکس‌ها", <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}><Loader2 className="animate-spin" size={16} aria-hidden /> {c.progress || "…"}</div>)
      ) : (
        <>
          {section(
            fresh ? "عکس‌ها و اطلاعات شخصی" : "عکس‌ها",
            <>
              {fresh && unchecked > 0 && (
                <div style={{ background: "rgba(229,72,77,0.1)", border: "1px solid rgba(229,72,77,0.4)", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, marginBottom: 10, lineHeight: 1.8 }}>
                  ⚠️ بررسی هوشمند روی {unchecked} عکس انجام نشد؛ فقط قانون‌های ثابت اجرا شد. نام خانوادگی و آدرس رو خودت با «پوشاندن» بپوشون.
                </div>
              )}
              {fresh && (
                <div style={{ position: "sticky", top: 64, zIndex: 5, background: C.surface, padding: "6px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${C.line}`, marginBottom: 10 }}>
                  <button type="button" onClick={() => setTool(tool === "hide" ? null : "hide")} style={pill(tool === "hide")}>
                    <EyeOff size={13} aria-hidden style={{ verticalAlign: -2 }} /> پوشاندن یک قسمت
                  </button>
                  <button type="button" onClick={() => setTool(tool === "date" ? null : "date")} style={pill(tool === "date")}>
                    <CircleDashed size={13} aria-hidden style={{ verticalAlign: -2 }} /> علامت تاریخ
                  </button>
                  <span style={{ fontSize: 11.5, color: C.text3 }}>{tool ? "روی عکس بکش تا کادر اضافه بشه" : "روی هر کادر بزن تا برداشته یا دوباره گذاشته بشه"}</span>
                </div>
              )}
              {!fresh && <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 8 }}>عکس‌ها پوشونده و ذخیره شدن؛ متن و طراحی رو می‌تونی عوض کنی. برای تغییر پوشش، عکس اصلی رو دوباره بذار.</div>}
              {c.images.map((im, i) => {
                const sc = c.scans && c.scans[i];
                const kind = (sc && sc.kind) || (c.kinds || [])[i];
                return (
                  <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 10, marginBottom: 10, background: C.ground }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 13 }}>عکس {i + 1}{kind === "letter" ? " · نامه" : kind === "timeline" ? " · تایم‌لاین" : ""}</b>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        {storySelect(i)}
                        {fresh && c.images.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeImage(i)} aria-label="Remove picture">
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </span>
                    </div>
                    {sc && sc.error ? (
                      <div style={{ fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {sc.error}</div>
                    ) : im.data && sc ? (
                      <Picture image={im} scan={sc} tool={tool} mark={c.opts.mark} onToggle={(id) => toggle(i, id)} onAdd={(b) => addBox(i, b)} />
                    ) : (
                      <img src={im.url} alt={"Picture " + (i + 1)} style={{ display: "block", width: "100%", borderRadius: 8 }} />
                    )}
                    {im.data && sc && (
                      <div style={{ marginTop: 8 }}>
                        <Textarea
                          rows={2}
                          value={notes[i] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [i]: e.target.value }))}
                          placeholder="یادداشت برای این عکس، مثلاً: تاریخ فاینال دسیژن رو هم هایلایت کن، یا شماره پاسپورت پایین صفحه پیدا نیست"
                          style={{ fontFamily: FA, lineHeight: 1.7, fontSize: 12.5 }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <Button size="sm" variant="outline" className="mt-1.5" disabled={!String(notes[i] || "").trim() || fixing[i]} onClick={() => fix(i)}>
                            {fixing[i] ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} {fixing[i] ? "در حال اصلاح…" : "اصلاح این عکس"}
                          </Button>
                          <Learn on={!!learnOn[i]} setOn={(v) => setLearnOn((l) => ({ ...l, [i]: v }))} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {section(
            "متن استوری",
            nums.map((n, k) => {
              const inStory = c.groups.map((g, i) => (g === n ? i + 1 : 0)).filter(Boolean);
              return (
                <div key={n} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: inStory.length > 2 ? C.reject : C.text }}>
                    {nums.length > 1 ? `استوری ${k + 1} · ` : ""}عکس {inStory.join(" و ")}{inStory.length > 2 ? " — هر استوری حداکثر ۲ عکس" : ""}
                  </div>
                  <Textarea rows={7} value={(c.texts || {})[n] || ""} onChange={(e) => update((x) => ({ texts: { ...x.texts, [n]: e.target.value } }))} style={{ fontFamily: FA, lineHeight: 1.8 }} />
                </div>
              );
            })
          )}

          {section(
            "طراحی استوری",
            <>
              {fresh && (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>علامت تاریخ‌ها</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    {MARKS.map(([k, label]) => (
                      <button key={k} type="button" onClick={() => update((x) => ({ opts: { ...x.opts, mark: k } }))} style={pill(c.opts.mark === k)}>{label}</button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>پس‌زمینه</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {BACKS.map(([k, label, color]) => (
                  <button key={k} type="button" onClick={() => update((x) => ({ opts: { ...x.opts, background: k } }))} style={pill(c.opts.background === k)}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: color, marginLeft: 5, border: "1px solid rgba(0,0,0,0.15)" }} />
                    {label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={c.opts.watermark} onChange={(e) => update((x) => ({ opts: { ...x.opts, watermark: e.target.checked } }))} /> لوگوی بزرگ روی عکس‌ها
              </label>
            </>
          )}

          {fresh && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.8, background: "rgba(18,148,94,0.07)", border: "1px solid rgba(18,148,94,0.3)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>
              <input type="checkbox" checked={!!c.checked} onChange={(e) => update({ checked: e.target.checked })} style={{ marginTop: 6 }} />
              همهٔ عکس‌ها رو چک کردم: نام خانوادگی، UCI، شماره پرونده و پاسپورت، آدرس، ایمیل و بارکدها پوشونده شدن ({hidden} کادر) و فقط اسم کوچیک دیده می‌شه.
            </label>
          )}
          <Button className="w-full" disabled={(fresh && !c.checked) || c.busy || tooMany || !c.images.length} onClick={() => draw()}>
            {c.busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {c.busy ? `در حال ساخت استوری‌ها… ${c.progress || ""}` : c.stories ? `ساخت دوباره (${nums.length} استوری)` : `ساخت ${nums.length} استوری`}
          </Button>
          {c.error && <div style={{ marginTop: 8, fontSize: 12, color: C.reject, direction: "ltr", textAlign: "left" }}>⚠️ {c.error}</div>}

          {c.stories && (
            <div style={{ marginTop: 12 }}>
              {section(
                "استوری‌ها",
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
                    {c.stories.map((st, k) => (
                      <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                        {st.url ? (
                          <a href={st.url} target="_blank" rel="noreferrer">
                            <img src={st.url} alt={"Story " + (k + 1)} style={{ display: "block", width: "100%", aspectRatio: "9 / 16", objectFit: "cover" }} />
                          </a>
                        ) : (
                          <div style={{ aspectRatio: "9 / 16", display: "grid", placeItems: "center", padding: 8, fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {st.error}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button variant="outline" onClick={download} disabled={!c.stories.some((x) => x.url)}>
                      <Download aria-hidden /> دانلود
                    </Button>
                    <Button variant="outline" onClick={toCalendar} disabled={!c.stories.some((x) => x.url) || c.calendar === "…" || /^\/calendar/.test(c.calendar || "")}>
                      {c.calendar === "…" ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} به تقویم محتوا
                    </Button>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>یادداشت برای استوری</div>
                    <Textarea
                      rows={2}
                      value={storyNote}
                      onChange={(e) => setStoryNote(e.target.value)}
                      placeholder="مثلاً: متن کوتاه‌تر، پس‌زمینه سرمه‌ای، اسم رو بالاتر بیار"
                      style={{ fontFamily: FA, lineHeight: 1.7, fontSize: 12.5 }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <Button size="sm" className="mt-1.5" disabled={!storyNote.trim() || restyling || c.busy} onClick={restyle}>
                        {restyling || c.busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} اصلاح و ساخت دوباره
                      </Button>
                      <Learn on={!!learnOn.story} setOn={(v) => setLearnOn((l) => ({ ...l, story: v }))} />
                    </div>
                  </div>
                  {/^\/calendar/.test(c.calendar || "") && (
                    <div style={{ marginTop: 8, fontSize: 12.5 }}>
                      ✓ به‌عنوان پیش‌نویس به تقویم اضافه شد (بعد از تأیید حامد منتشر می‌شه): <a href={c.calendar} style={{ color: C.teal, fontWeight: 700 }}>باز کردن</a>
                    </div>
                  )}
                  {/^error:/.test(c.calendar || "") && <div style={{ marginTop: 8, fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {c.calendar.slice(6)}</div>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function VisaResults({ C, learn }) {
  const [images, setImages] = useState([]);
  const [notes, setNotes] = useState(""); // the team's own lines: timeline, visa type, age…
  const [saved, setSaved] = useState([]); // cases the team saved (covered pictures only)
  const [pending, setPending] = useState([]); // cases being worked on, held in the server's memory
  const [cur, setCur] = useState(null); // the case opened
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const editTimer = useRef(null);

  const load = () =>
    fetch("/api/visa-cases", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setSaved(Array.isArray(j.cases) ? j.cases : []);
        setPending(Array.isArray(j.pending) ? j.pending : []);
      })
      .catch(() => {});
  // The list comes from the server, so a case started before the page was left or closed is here;
  // while one is being read it is checked every few seconds.
  const reading = pending.some((p) => p.status === "reading");
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && load(), reading ? 3000 : 20000);
    return () => clearInterval(t);
  }, [reading]);

  const addFiles = async (files) => {
    const list = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    const shrunk = (await Promise.all(list.map(shrink))).filter(Boolean);
    setImages((prev) => [...prev, ...shrunk].slice(0, MAX));
  };

  // «ساخت خبر ویزا»: the server reads the pictures and keeps the case; the page only starts it.
  const create = async () => {
    const pics = images;
    const typed = notes.trim();
    const id = newId();
    setError("");
    setPending((prev) => [{ id, created: Date.now(), status: "reading", progress: "", count: pics.length }, ...prev]);
    setImages([]);
    setNotes("");
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "visa_scan", topic: { title_fa: `visa-results-${id}` }, images: pics.map(({ name, data }) => ({ name, data })), notes: typed, caseId: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.job) throw new Error(d.error || "could not start");
      setTimeout(load, 1500);
    } catch (e) {
      setPending((prev) => prev.filter((p) => p.id !== id));
      setImages(pics);
      setNotes(typed);
      setError(String(e.message || e));
    }
  };

  const openCase = async (row, isSaved) => {
    setError("");
    if (isSaved) {
      setCur({ ...row, images: (row.covered || []).map((url) => ({ url })), opts: { ...OPTS, ...(row.opts || {}) }, saved: true });
      return;
    }
    setOpening(row.id);
    try {
      const r = await fetch("/api/visa-cases?id=" + encodeURIComponent(row.id), { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.case) throw new Error(j.error || "could not open");
      setCur({ ...j.case, opts: { ...OPTS, ...(j.case.opts || {}) } });
    } catch (e) {
      setError(String(e.message || e));
      load();
    } finally {
      setOpening("");
    }
  };

  // Changes on a case still held by the server are kept there too (a moment after the last one),
  // so closing the page keeps the checks and the text.
  const update = (p) =>
    setCur((x) => {
      if (!x) return x;
      const next = { ...x, ...(typeof p === "function" ? p(x) : p) };
      if (!next.saved && next.status !== "saved") {
        clearTimeout(editTimer.current);
        editTimer.current = setTimeout(() => {
          fetch("/api/visa-cases", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: next.id, edit: { scans: next.scans, groups: next.groups, texts: next.texts, opts: next.opts, checked: !!next.checked } }),
          }).catch(() => {});
        }, 900);
      }
      return next;
    });

  if (cur) {
    return (
      <Card dir="rtl" className="p-3.5" style={{ fontFamily: FA, marginBottom: 12 }}>
        <VisaCase
          c={cur}
          C={C}
          learn={learn}
          update={update}
          onBack={() => {
            setCur(null);
            load();
          }}
          onArchive={async () => {
            await fetch("/api/visa-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: cur.id, archive: true }) }).catch(() => {});
            setCur(null);
            load();
          }}
        />
      </Card>
    );
  }

  const rows = [...pending.map((p) => ({ ...p, isSaved: false })), ...saved.filter((s) => !pending.some((p) => p.id === s.id)).map((s) => ({ ...s, isSaved: true }))];
  return (
    <Card dir="rtl" className="p-3.5" style={{ fontFamily: FA, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>
        <Sparkles size={17} aria-hidden /> خبر ویزا (نتایج ویزای مشتری‌ها)
      </div>
      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.8, marginBottom: 10 }}>
        عکس نامهٔ اپرووال و تایم‌لاین رو بذار (تا ۱۰ عکس) و اطلاعات پرونده رو بنویس. یک خبر ویزا به فهرست پایین اضافه می‌شه؛ بازش کن تا اطلاعات شخصی، متن و طراحی استوری رو چک و درست کنی. می‌تونی از صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.
      </div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current && fileRef.current.click()}
        role="button"
        tabIndex={0}
        style={{ border: `2px dashed ${C.line}`, borderRadius: 12, padding: images.length ? 10 : "20px 10px", textAlign: "center", cursor: "pointer", fontSize: 12.5, color: C.text2, background: C.surface }}
      >
        {images.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {images.map((im, i) => (
              <div key={i} style={{ position: "relative", width: 76, height: 76, borderRadius: 9, overflow: "hidden", border: `1px solid ${C.line}` }}>
                <img src={im.data} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button aria-label="Remove picture" onClick={(e) => { e.stopPropagation(); setImages((prev) => prev.filter((_, j) => j !== i)); }} style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}>
                  <X size={12} aria-hidden />
                </button>
              </div>
            ))}
            {images.length < MAX && (
              <div style={{ width: 76, height: 76, borderRadius: 9, border: `1px dashed ${C.line}`, display: "grid", placeItems: "center", color: C.text3 }}>
                <ImagePlus size={20} aria-hidden />
              </div>
            )}
          </div>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ImagePlus size={16} aria-hidden /> عکس‌ها رو اینجا بکش، بزن تا انتخاب کنی، یا Ctrl+V (حداکثر ۱۰)
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>اطلاعات پرونده (اختیاری)</div>
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={"مثلاً: خانم مریم، ورک پرمیت همسر worker، اقدام از خارج از کانادا، سن ۲۸، سابمیت 2025/05/14، اپروال 2025/06/18"}
          style={{ fontFamily: FA, lineHeight: 1.8 }}
        />
      </div>
      <Button className="mt-2.5 w-full" disabled={!images.length} onClick={create}>
        <ScanSearch aria-hidden /> ساخت خبر ویزا ({images.length} عکس)
      </Button>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: C.reject, direction: "ltr", textAlign: "left" }}>⚠️ {error}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>خبرهای ویزا</div>
          {rows.map((c) => {
            const busy = c.status === "reading";
            const label = busy ? `در حال خواندن عکس‌ها… ${c.progress || ""}` : c.status === "error" ? `خواندن انجام نشد: ${c.error || ""}` : caseName(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => !busy && c.status !== "error" && openCase(c, c.isSaved)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 12px", marginBottom: 7, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, cursor: busy ? "default" : "pointer", fontFamily: FA, textAlign: "right" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {busy || opening === c.id ? <Loader2 className="animate-spin" size={16} aria-hidden /> : <Megaphone size={16} aria-hidden />}
                  <span style={{ fontWeight: 800, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: c.status === "error" ? C.reject : C.text }}>خبر ویزا · {label}</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.text3, whiteSpace: "nowrap" }}>
                  {busy ? "در حال خواندن" : c.isSaved ? "✓ استوری ساخته شد" : c.status === "error" ? "" : "منتظر بررسی"} · {when(c.created)}
                  {c.status === "error" && (
                    <span
                      role="button"
                      aria-label="Remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetch("/api/visa-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, archive: true }) }).then(load);
                      }}
                    >
                      <X size={14} aria-hidden />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

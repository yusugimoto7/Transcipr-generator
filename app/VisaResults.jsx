"use client";

// Studio → visa results (نتایج ویزا): up to ten pictures of a client's approval letter and
// application timeline become Instagram stories, one or two pictures each, with the client's
// lines under them. The server reads every picture for what must not be seen (lib/visa-news/scan.js);
// here a person checks each box on the picture, adds what was missed, and only then are the
// stories drawn. The pictures stay in this page's memory: nothing unredacted is saved anywhere.

import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Download, EyeOff, ImagePlus, Loader2, RotateCcw, ScanSearch, Sparkles, Trash2, CircleDashed, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/input";
import { Card } from "../components/ui/card";

const MAX = 10;
const FA = "'Vazirmatn', sans-serif";
const MARKS = [["circle", "دایره قرمز"], ["underline", "خط زیر قرمز"], ["marker", "هایلایت زرد"]];
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

// "2025/05/14" -> Date; anything else -> null.
function day(s) {
  const m = String(s || "").match(/(20\d\d)[/.-](\d{1,2})[/.-](\d{1,2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// The lines under the pictures, in the team's format. What the team typed (`noted`) wins over what
// the pictures say; anything neither gives is left as «…» to fill in or delete.
function draftText(fields, noted) {
  const f = fields || {};
  const n = noted || {};
  const sub = n.submitted || f.submitted || "";
  const app = n.approved || f.approved || f.letter_date || "";
  const a = day(sub);
  const b = day(app);
  const wait = n.wait_days ? Number(String(n.wait_days).replace(/[^0-9]/g, "")) || null : a && b && b >= a ? Math.round((b - a) / 86400000) : null;
  return [
    `${n.title || "سرکار خانم / جناب آقای"} ${n.first_name_fa || f.first_name_fa || f.first_name || "…"}`,
    `⬅️ نوع ویزا: ${n.visa_type_fa || f.visa_type_fa || f.visa_type || "…"}`,
    `⬅️ اقدام از: ${n.applied_from || "…"}`,
    `⬅️ سن: ${n.age || "…"}`,
    `⬅️ تاریخ سابمیت ویزا: ${sub || "…"}`,
    `⬅️ مدت زمان انتظار ویزا: ${wait != null ? wait + " روز" : "…"}`,
    `⬅️ تاریخ اپرووال ویزا: ${app || "…"}`,
    ...(n.extra ? [`✅ ${String(n.extra).replace(/^✅\s*/, "")}`] : []),
  ].join("\n");
}

function mergeFields(list) {
  const out = {};
  for (const f of list) for (const [k, v] of Object.entries(f || {})) if (v && !out[k]) out[k] = v;
  return out;
}

// Letters and timelines are paired when they come one after the other; otherwise one per story.
function defaultGroups(scans) {
  const g = [];
  let story = 0;
  for (let i = 0; i < scans.length; i++) {
    g[i] = story;
    const a = scans[i] && scans[i].kind;
    const b = scans[i + 1] && scans[i + 1].kind;
    if (i + 1 < scans.length && a && b && a !== b && a !== "other" && b !== "other") {
      g[i + 1] = story;
      i++;
    }
    story++;
  }
  return g;
}

function Picture({ image, scan, tool, onToggle, onAdd }) {
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
              : b.on ? { background: "transparent", border: "3px solid #e11d2e", borderRadius: "50%", transform: "scale(1.15, 1.6)" } : { background: "transparent", border: "2px dashed #9ca3af", borderRadius: "50%", transform: "scale(1.15, 1.6)" }),
          }}
        />
      ))}
      {box && <div style={{ position: "absolute", ...pct(box), border: `2px solid ${tool === "hide" ? "#111" : "#e11d2e"}`, background: tool === "hide" ? "rgba(17,17,17,0.5)" : "transparent", borderRadius: tool === "hide" ? 4 : "50%" }} />}
    </div>
  );
}

export default function VisaResults({ C }) {
  const [images, setImages] = useState([]);
  const [notes, setNotes] = useState(""); // the team's own lines: timeline, visa type, age…
  const [clients, setClients] = useState([]);
  const [scans, setScans] = useState(null);
  const [groups, setGroups] = useState([]); // story number per picture
  const [texts, setTexts] = useState({}); // story number -> text
  const [opts, setOpts] = useState({ mark: "circle", background: "light", congrats: true, watermark: true });
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [tool, setTool] = useState(null); // "hide" | "date" | null
  const [checked, setChecked] = useState(false);
  const [stories, setStories] = useState(null);
  const [calendar, setCalendar] = useState("");
  const fileRef = useRef(null);

  const addFiles = async (files) => {
    const list = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    const shrunk = (await Promise.all(list.map(shrink))).filter(Boolean);
    setImages((prev) => [...prev, ...shrunk].slice(0, MAX));
    setScans(null);
    setStories(null);
  };

  const scan = async () => {
    setBusy("scan");
    setError("");
    setChecked(false);
    try {
      const r = await runJob("visa_scan", { images: images.map(({ name, data }) => ({ name, data })), notes: notes.trim() }, (p) => p && setProgress(`${p.done || 0} از ${p.total || images.length}`));
      const sc = r.scans || [];
      setScans(sc);
      const g = defaultGroups(sc);
      setGroups(g);
      const t = {};
      const clients = r.clients || [];
      setClients(clients);
      [...new Set(g)].forEach((n, k) => {
        t[n] = draftText(mergeFields(sc.filter((_, i) => g[i] === n).map((s) => s.fields)), clients[k] || clients[0]);
      });
      setTexts(t);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
      setProgress("");
    }
  };

  const storyNums = [...new Set(groups)].sort((a, b) => a - b);
  const draw = async () => {
    const left = storyNums.filter((n) => /…/.test(texts[n] || ""));
    if (left.length && !window.confirm("بعضی خط‌ها هنوز «…» دارن (مثلاً سن). همین‌طور ساخته بشه؟")) return;
    setBusy("draw");
    setError("");
    try {
      const r = await runJob(
        "visa_story",
        {
          images: images.map((im, i) => ({ name: im.name, data: im.data, boxes: (scans[i] && scans[i].boxes) || [] })),
          stories: storyNums.map((n) => ({ images: groups.map((g, i) => (g === n ? i : -1)).filter((i) => i >= 0), text: texts[n] || "" })),
          ...opts,
        },
        (p) => p && setProgress(`${p.done || 0} از ${p.total || storyNums.length}`)
      );
      setStories(r.stories || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
      setProgress("");
    }
  };

  const setScan = (i, fn) => setScans((prev) => prev.map((s, j) => (j === i ? fn(s) : s)));
  const toggle = (i, id) => setScan(i, (s) => ({ ...s, boxes: s.boxes.map((b) => (b.id === id ? { ...b, on: !b.on } : b)) }));
  const addBox = (i, b) => setScan(i, (s) => ({ ...s, boxes: [...s.boxes, { ...b, id: Math.max(-1, ...s.boxes.map((x) => x.id)) + 1, on: true, label: "added by hand" }] }));
  const removeImage = (i) => {
    setImages((prev) => prev.filter((_, j) => j !== i));
    setScans((prev) => (prev ? prev.filter((_, j) => j !== i) : prev));
    setGroups((prev) => prev.filter((_, j) => j !== i));
    setStories(null);
  };
  const download = async () => {
    for (const [k, s] of (stories || []).filter((x) => x.url).entries()) {
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
    setCalendar("…");
    try {
      const names = storyNums.map((n) => (texts[n] || "").split("\n")[0].replace(/^(سرکار خانم|جناب آقای|سرکار خانم \/ جناب آقای)\s*/, "")).filter(Boolean);
      const r = await fetch("/api/calendar/visa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: stories.filter((s) => s.url).map((s) => s.url), title: names.join("، ") }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "failed");
      setCalendar(`/calendar?board=${j.card.board_id}&card=${j.card.id}`);
    } catch (e) {
      setCalendar("error:" + String(e.message || e));
    }
  };

  const hidden = scans ? scans.reduce((n, s) => n + (s.boxes || []).filter((b) => b.kind === "hide" && b.on).length, 0) : 0;
  const unchecked = scans ? scans.filter((s) => !s.checked).length : 0;
  const pill = (on) => ({ padding: "6px 10px", borderRadius: 999, border: `1px solid ${on ? C.orange : C.line}`, background: on ? "rgba(50,81,93,0.10)" : C.surface, color: on ? C.orange : C.text2, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FA });

  return (
    <Card dir="rtl" className="p-3.5" style={{ fontFamily: FA, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 14.5, marginBottom: 4 }}>
        <Sparkles size={17} aria-hidden /> نتایج ویزا (استوری خبر ویزا)
      </div>
      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.8, marginBottom: 10 }}>
        عکس نامهٔ اپرووال و اسکرین‌شات تایم‌لاین رو بذار (تا ۱۰ عکس). نام خانوادگی، UCI، شماره پرونده، آدرس و بارکدها پوشونده می‌شن، اسم کوچیک می‌مونه و تاریخ‌ها علامت می‌خورن. قبل از ساخت، همهٔ کادرها رو روی عکس می‌بینی و چک می‌کنی.
      </div>

      {/* pictures */}
      {!scans && (
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
                  <span style={{ position: "absolute", bottom: 3, left: 3, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 6, fontSize: 11, padding: "0 5px" }}>{i + 1}</span>
                  <button aria-label="Remove picture" onClick={(e) => { e.stopPropagation(); removeImage(i); }} style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}>
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
      )}
      {!scans && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>اطلاعات پرونده (اختیاری)</div>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"مثلاً: خانم مریم، ورک پرمیت همسر worker، اقدام از خارج از کانادا، سن ۲۸، سابمیت 2025/05/14، اپروال 2025/06/18، با سابقه یکبار ریجکتی"}
            style={{ fontFamily: FA, lineHeight: 1.8 }}
          />
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3, lineHeight: 1.7 }}>
            هر چی اینجا بنویسی (تایم‌لاین، نوع ویزا، سن، از کجا اقدام کرده) توی متن استوری میاد و بر چیزی که از عکس خونده می‌شه مقدمه. برای چند نفر، به ترتیب استوری‌ها بنویس.
          </div>
        </div>
      )}
      {!scans && (
        <Button className="mt-2.5 w-full" disabled={!images.length || !!busy} onClick={scan}>
          {busy === "scan" ? <Loader2 className="animate-spin" aria-hidden /> : <ScanSearch aria-hidden />}
          {busy === "scan" ? `در حال خواندن عکس‌ها… ${progress}` : `پیدا کردن اطلاعات شخصی و تاریخ‌ها (${images.length} عکس)`}
        </Button>
      )}

      {/* review */}
      {scans && !stories && (
        <div>
          {unchecked > 0 && (
            <div style={{ background: "rgba(229,72,77,0.1)", border: "1px solid rgba(229,72,77,0.4)", borderRadius: 10, padding: "8px 10px", fontSize: 12.5, marginBottom: 10, lineHeight: 1.8 }}>
              ⚠️ بررسی هوشمند روی {unchecked} عکس انجام نشد؛ فقط قانون‌های ثابت (شماره‌ها، ایمیل، کدپستی) اجرا شد. نام خانوادگی و آدرس رو خودت با «پوشاندن» بپوشون.
            </div>
          )}
          <div style={{ position: "sticky", top: 64, zIndex: 5, background: C.surface, padding: "8px 0", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", borderBottom: `1px solid ${C.line}`, marginBottom: 10 }}>
            <button type="button" onClick={() => setTool(tool === "hide" ? null : "hide")} style={pill(tool === "hide")}>
              <EyeOff size={13} aria-hidden style={{ verticalAlign: -2 }} /> پوشاندن یک قسمت
            </button>
            <button type="button" onClick={() => setTool(tool === "date" ? null : "date")} style={pill(tool === "date")}>
              <CircleDashed size={13} aria-hidden style={{ verticalAlign: -2 }} /> علامت تاریخ
            </button>
            <span style={{ fontSize: 11.5, color: C.text3 }}>{tool ? "روی عکس بکش تا کادر اضافه بشه" : "روی هر کادر بزن تا برداشته یا دوباره گذاشته بشه"}</span>
          </div>

          {images.map((im, i) => {
            const sc = scans[i];
            if (!sc) return null;
            return (
              <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 10, marginBottom: 10, background: C.ground }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 13 }}>
                    عکس {i + 1} · {sc.kind === "letter" ? "نامه" : sc.kind === "timeline" ? "تایم‌لاین" : "عکس"}
                  </b>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                    استوری
                    <select value={groups[i]} onChange={(e) => {
                      const n = Number(e.target.value);
                      setGroups((g) => g.map((x, j) => (j === i ? n : x)));
                      setTexts((t) => (t[n] != null ? t : { ...t, [n]: draftText(sc.fields, clients[0]) }));
                    }} style={{ fontFamily: FA, borderRadius: 8, border: `1px solid ${C.line}`, padding: "3px 6px" }}>
                      {Array.from({ length: images.length }, (_, n) => (
                        <option key={n} value={n}>{n + 1}</option>
                      ))}
                    </select>
                    <Button variant="ghost" size="sm" onClick={() => removeImage(i)} aria-label="Remove picture">
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </div>
                {sc.error ? (
                  <div style={{ fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {sc.error}</div>
                ) : (
                  <Picture image={im} scan={sc} tool={tool} onToggle={(id) => toggle(i, id)} onAdd={(b) => addBox(i, b)} />
                )}
              </div>
            );
          })}

          {storyNums.map((n) => {
            const pics = groups.map((g, i) => (g === n ? i + 1 : 0)).filter(Boolean);
            if (pics.length > 2) {
              return (
                <div key={n} style={{ fontSize: 12.5, color: C.reject, marginBottom: 8 }}>
                  ⚠️ استوری {storyNums.indexOf(n) + 1}: هر استوری حداکثر ۲ عکس داره (الان: {pics.join("، ")}).
                </div>
              );
            }
            return (
              <div key={n} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
                  متن استوری {storyNums.indexOf(n) + 1} (عکس {pics.join(" و ")})
                </div>
                <Textarea rows={7} value={texts[n] || ""} onChange={(e) => setTexts((t) => ({ ...t, [n]: e.target.value }))} style={{ fontFamily: FA, lineHeight: 1.8 }} />
              </div>
            );
          })}

          <div style={{ fontSize: 12.5, fontWeight: 700, margin: "6px 0 6px" }}>علامت تاریخ‌ها</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {MARKS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setOpts({ ...opts, mark: k })} style={pill(opts.mark === k)}>{label}</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: "6px 0 6px" }}>پس‌زمینه</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {BACKS.map(([k, label, color]) => (
              <button key={k} type="button" onClick={() => setOpts({ ...opts, background: k })} style={pill(opts.background === k)}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: color, marginLeft: 5, border: "1px solid rgba(0,0,0,0.15)" }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 10 }}>
            <label><input type="checkbox" checked={opts.congrats} onChange={(e) => setOpts({ ...opts, congrats: e.target.checked })} /> برچسب Congrats</label>
            <label><input type="checkbox" checked={opts.watermark} onChange={(e) => setOpts({ ...opts, watermark: e.target.checked })} /> لوگوی بزرگ روی عکس‌ها</label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.8, background: "rgba(18,148,94,0.07)", border: "1px solid rgba(18,148,94,0.3)", borderRadius: 10, padding: "8px 10px", marginBottom: 10 }}>
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 6 }} />
            همهٔ عکس‌ها رو چک کردم: نام خانوادگی، UCI، شماره پرونده و پاسپورت، آدرس، ایمیل و بارکدها پوشونده شدن ({hidden} کادر) و فقط اسم کوچیک دیده می‌شه.
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button className="flex-1" disabled={!checked || !!busy || storyNums.some((n) => groups.filter((g) => g === n).length > 2)} onClick={draw}>
              {busy === "draw" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
              {busy === "draw" ? `در حال ساخت استوری‌ها… ${progress}` : `ساخت ${storyNums.length} استوری`}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => { setScans(null); setStories(null); }}>
              <RotateCcw aria-hidden /> عکس‌ها
            </Button>
          </div>
        </div>
      )}

      {/* stories */}
      {stories && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
            {stories.map((s, k) => (
              <div key={k} style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.surface }}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    <img src={s.url} alt={"Story " + (k + 1)} style={{ display: "block", width: "100%", aspectRatio: "9 / 16", objectFit: "cover" }} />
                  </a>
                ) : (
                  <div style={{ aspectRatio: "9 / 16", display: "grid", placeItems: "center", padding: 8, fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {s.error}</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={download} disabled={!stories.some((s) => s.url)}>
              <Download aria-hidden /> دانلود همه
            </Button>
            <Button variant="outline" onClick={toCalendar} disabled={!stories.some((s) => s.url) || calendar === "…" || /^\/calendar/.test(calendar)}>
              {calendar === "…" ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarPlus aria-hidden />} به تقویم محتوا
            </Button>
            <Button variant="ghost" onClick={() => setStories(null)}>
              <RotateCcw aria-hidden /> تغییر و ساخت دوباره
            </Button>
            <Button variant="ghost" onClick={() => { setImages([]); setScans(null); setStories(null); setCalendar(""); }}>
              شروع از اول
            </Button>
          </div>
          {/^\/calendar/.test(calendar) && (
            <div style={{ marginTop: 8, fontSize: 12.5 }}>
              ✓ به‌عنوان پیش‌نویس به تقویم اضافه شد (بعد از تأیید حامد منتشر می‌شه): <a href={calendar} style={{ color: C.teal, fontWeight: 700 }}>باز کردن</a>
            </div>
          )}
          {/^error:/.test(calendar) && <div style={{ marginTop: 8, fontSize: 12, color: C.reject, direction: "ltr" }}>⚠️ {calendar.slice(6)}</div>}
        </div>
      )}

      {error && <div style={{ marginTop: 8, fontSize: 12, color: C.reject, direction: "ltr", textAlign: "left" }}>⚠️ {error}</div>}
    </Card>
  );
}

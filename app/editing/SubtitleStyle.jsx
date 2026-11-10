"use client";

// Subtitle settings (Hamed, 10 Nov 2026: "set the subtitles' height on the screen, font, style, language
// and size"). One panel for New project and for a project's subtitles: a frame of the video's shape shows
// the line as it will look, and the line is dragged up or down to place it. The values go on the project
// as settings.subtitles (cleanSettings in lib/editing/projects.js); english-sugimotovisa's worker draws
// them (config/video_stages.json subtitle_fonts / subtitle_looks / subtitle_colours, apply_style).
// 0 or "" keeps the approved style for that setting.
import { useRef } from "react";
import { s } from "./ui";
import { L, uiDir } from "../../lib/i18n";

export const SUB_FONTS = [
  ["vazirmatn-extrabold", "Vazirmatn ExtraBold", "'Vazirmatn', sans-serif", 800, ["وزیرمتن پررنگ (تأییدشده)", "Vazirmatn ExtraBold (approved)"]],
  ["vazirmatn-black", "Vazirmatn Black", "'Vazirmatn', sans-serif", 900, ["وزیرمتن خیلی پررنگ", "Vazirmatn Black"]],
  ["vazirmatn-bold", "Vazirmatn Bold", "'Vazirmatn', sans-serif", 700, ["وزیرمتن بولد", "Vazirmatn Bold"]],
  ["vazirmatn-medium", "Vazirmatn Medium", "'Vazirmatn', sans-serif", 500, ["وزیرمتن معمولی", "Vazirmatn Medium"]],
  ["lalezar", "Lalezar", "'Lalezar', 'Vazirmatn', sans-serif", 400, ["لاله‌زار (نمایشی)", "Lalezar (display)"]],
];
export const SUB_LOOKS = [
  ["classic", ["کلاسیک: دورخط و سایه", "Classic: outline and shadow"]],
  ["box", ["داخل کادر تیره", "In a dark box"]],
  ["plain", ["بدون رنگ کلمهٔ گفته‌شده", "No highlight on the spoken word"]],
  ["light", ["سبک: دورخط نازک", "Light: thin outline"]],
];
export const SUB_COLOURS = ["#FFFFFF", "#FFE600", "#F28C28", "#32D5FF", "#5BE37D", "#FF5C8A", "#111111"];
const LANGS = [
  ["", ["همون زبانی که در ویدیو گفته می‌شه (خودکار)", "As spoken in the video (automatic)"]],
  ["fa", ["فارسی", "Persian"]],
  ["en", ["انگلیسی", "English"]],
];

// The approved style the worker starts from (the skill's config.json, config/video_stages.json landscape),
// and the bounds it clamps to.
const BASE = {
  portrait: { w: 1080, h: 1920, size: 74, y: 1265, minY: 260, maxY: 1700, minS: 40, maxS: 130 },
  landscape: { w: 1920, h: 1080, size: 62, y: 955, minY: 120, maxY: 1000, minS: 32, maxS: 100 },
};

export const EMPTY_SUB = { size: 0, position_y: 0, words_per_group: 0, font: "", look: "", colour: "", highlight: "", language: "" };

export default function SubtitleStyle({ value, onChange, shape = "portrait", lang = "fa" }) {
  const v = { ...EMPTY_SUB, ...(value || {}) };
  const B = BASE[shape] || BASE.portrait;
  const frame = useRef(null);
  const set = (k, x) => onChange({ ...v, [k]: x });
  const size = v.size || B.size;
  const y = v.position_y || B.y;
  const font = SUB_FONTS.find((f) => f[0] === v.font) || SUB_FONTS[0];
  const look = v.look || "classic";
  const colour = v.colour || "#FFFFFF";
  const highlight = look === "plain" ? colour : v.highlight || "#FFE600";
  const words = v.words_per_group || 3;
  const sample = (v.language || lang) === "en" ? ["Today", "we", "talk", "about"] : ["امروز", "دربارهٔ", "اکسپرس", "اینتری"];
  const shown = sample.slice(0, words);

  // drag the line in the frame to place it; the frame is the video scaled down
  const drag = (e) => {
    const box = frame.current.getBoundingClientRect();
    const move = (ev) => {
      const t = Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height));
      set("position_y", Math.round(Math.min(B.maxY, Math.max(B.minY, t * B.h)) / 10) * 10);
    };
    move(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const scaleW = shape === "landscape" ? 300 : 170;
  const k = scaleW / B.w;
  const stroke = look === "light" ? 2 : look === "box" ? 0 : 5;
  const textShadow = look === "box" ? "none" : `0 0 ${stroke * k * 1.6}px #000, ${3 * k}px ${3 * k}px ${2 * k}px rgba(0,0,0,.6)`;

  return (
    <div dir={uiDir()} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lalezar&display=swap" />
      <div>
        <div
          ref={frame}
          onPointerDown={drag}
          role="slider"
          aria-label={L("جای زیرنویس روی صفحه", "Subtitle height on the screen")}
          aria-valuemin={B.minY}
          aria-valuemax={B.maxY}
          aria-valuenow={y}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              set("position_y", Math.min(B.maxY, Math.max(B.minY, y + (e.key === "ArrowUp" ? -20 : 20))));
            }
          }}
          style={{ position: "relative", width: scaleW, height: B.h * k, borderRadius: 10, overflow: "hidden", cursor: "ns-resize", touchAction: "none",
            background: "linear-gradient(180deg,#5d7480 0%,#40525c 45%,#2c3a42 100%)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }}
        >
          {/* the speaker's head and the platforms' bars, so the line is placed against what covers it */}
          <div aria-hidden style={{ position: "absolute", left: "50%", top: `${shape === "landscape" ? 16 : 18}%`, width: shape === "landscape" ? "16%" : "34%", aspectRatio: "1/1.2", transform: "translateX(-50%)", borderRadius: "50%", background: "rgba(255,255,255,.14)" }} />
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${(B.minY / B.h) * 100}%`, background: "rgba(0,0,0,.18)" }} />
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${((B.h - B.maxY) / B.h) * 100}%`, background: "rgba(0,0,0,.18)" }} />
          <div
            dir={(v.language || lang) === "en" ? "ltr" : "rtl"}
            style={{ position: "absolute", left: 0, right: 0, top: y * k, transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none" }}
          >
            <span style={{ fontFamily: font[2], fontWeight: font[3], fontSize: size * k, lineHeight: 1.25, color: colour, textShadow, padding: look === "box" ? `${4 * k}px ${14 * k}px` : 0, background: look === "box" ? "#101418" : "none", whiteSpace: "nowrap" }}>
              {shown.map((w, i) => (
                <span key={i} style={{ color: i === 0 ? highlight : colour }}>
                  {w}
                  {i < shown.length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          </div>
        </div>
        <div className={s.muted} style={{ fontSize: 12, marginTop: 4, maxWidth: scaleW }}>{L("زیرنویس رو بالا و پایین بکش", "Drag the line up or down")}</div>
      </div>

      <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <label className={s.field}>
          <span>
            {L("اندازه", "Size")} · {size}px{!v.size ? L(" (تأییدشده)", " (approved)") : ""}
          </span>
          <input type="range" min={B.minS} max={B.maxS} step={2} value={size} onChange={(e) => set("size", Number(e.target.value))} />
        </label>
        <label className={s.field}>
          <span>
            {L("ارتفاع روی صفحه", "Height on the screen")} · {Math.round((y / B.h) * 100)}%{!v.position_y ? L(" (تأییدشده: روی سینه)", " (approved: chest band)") : ""}
          </span>
          <input type="range" min={B.minY} max={B.maxY} step={10} value={y} onChange={(e) => set("position_y", Number(e.target.value))} />
        </label>
        <label className={s.field}>
          <span>{L("فونت", "Font")}</span>
          <select className={s.select} value={v.font} onChange={(e) => set("font", e.target.value)}>
            {SUB_FONTS.map((f, i) => (
              <option key={f[0]} value={i === 0 ? "" : f[0]}>
                {L(...f[4])}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          <span>{L("سبک", "Style")}</span>
          <select className={s.select} value={v.look} onChange={(e) => set("look", e.target.value)}>
            {SUB_LOOKS.map(([id, name], i) => (
              <option key={id} value={i === 0 ? "" : id}>
                {L(...name)}
                {i === 0 ? L(" (تأییدشده)", " (approved)") : ""}
              </option>
            ))}
          </select>
        </label>
        <Swatches label={L("رنگ متن", "Text colour")} value={colour} onPick={(c) => set("colour", c === "#FFFFFF" ? "" : c)} />
        {look !== "plain" && <Swatches label={L("رنگ کلمه‌ای که گفته می‌شه", "Colour of the spoken word")} value={highlight} onPick={(c) => set("highlight", c === "#FFE600" ? "" : c)} />}
        <label className={s.field}>
          <span>{L("چند کلمه هم‌زمان", "Words at a time")}</span>
          <select className={s.select} value={v.words_per_group || ""} onChange={(e) => set("words_per_group", Number(e.target.value) || 0)}>
            <option value="">{L("همون تأییدشده (۳)", "The approved (3)")}</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label className={s.field}>
          <span>{L("زبان زیرنویس", "Subtitle language")}</span>
          <select className={s.select} value={v.language} onChange={(e) => set("language", e.target.value)}>
            {LANGS.map(([id, name]) => (
              <option key={id || "auto"} value={id}>
                {L(...name)}
              </option>
            ))}
          </select>
          <span className={s.muted} style={{ fontSize: 12 }}>
            {L("زبانی که در ویدیو حرف زده می‌شه؛ زیرنویس ترجمه نمی‌شه.", "The language spoken in the video; the subtitles are not translated.")}
          </span>
        </label>
      </div>
    </div>
  );
}

function Swatches({ label, value, onPick }) {
  return (
    <div className={s.field}>
      <span>{label}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="radiogroup" aria-label={label}>
        {SUB_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value.toUpperCase() === c}
            aria-label={c}
            onClick={() => onPick(c)}
            style={{ width: 28, height: 28, borderRadius: 99, background: c, cursor: "pointer", border: value.toUpperCase() === c ? "3px solid var(--brand, #32515d)" : "1px solid #c9cfd6", boxShadow: value.toUpperCase() === c ? "0 0 0 2px #fff inset" : "none" }}
          />
        ))}
      </div>
    </div>
  );
}

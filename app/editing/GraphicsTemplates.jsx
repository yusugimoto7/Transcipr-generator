"use client";

import { useEffect, useState } from "react";
import { api, s } from "./ui";
import { L } from "../../lib/i18n";

// The motion graphics looks (english-sugimotovisa's config/graphics_templates.json, read by
// /api/editing/graphics-templates). One component for New project, "Next step" and a graphics version, so the
// choice is offered wherever graphics can start (Hamed, Nov 11 2026: he never found the new templates, because
// they were only on New project → Motion graphics only). Each card shows two stills the real engine drew in
// that look (Nov 13 2026: "I only see colour strips; I want to see the template"); the colour strip stays
// only for a look whose stills are not made yet. A tap on a still opens it large.
export default function GraphicsTemplates({ value, onChange, disabled }) {
  const [looks, setLooks] = useState(null);
  const [big, setBig] = useState(null); // { id, n, name }
  const [missing, setMissing] = useState({});
  useEffect(() => {
    api("/graphics-templates").then((d) => setLooks(d.templates || [])).catch(() => setLooks([]));
  }, []);
  if (!looks || looks.length < 2) return null;
  const cur = value || "canvas";
  const src = (id, n) => `/api/editing/graphics-templates/preview?id=${encodeURIComponent(id)}&n=${n}`;
  return (
    <div className={s.field}>
      <span>{L("قالب موشن‌گرافیک", "Motion graphics template")}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        {looks.map((t) => {
          const on = cur === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} title={t.source}
              onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && onChange(t.id)}
              style={{ textAlign: "start", padding: 8, borderRadius: 12, cursor: disabled ? "default" : "pointer", fontSize: 13.5, fontWeight: 600, background: "var(--surface)", color: "var(--text)", border: on ? "2px solid var(--orange, #e8702a)" : "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
              {missing[t.id] ? (
                <span style={{ display: "flex", height: 34, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                  {(t.swatch || []).map((c, i) => <i key={i} style={{ flex: i === 0 ? 2 : 1, background: c }} />)}
                </span>
              ) : (
                <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  {[1, 2].map((n) => (
                    <img key={n} src={src(t.id, n)} alt="" loading="lazy"
                      onError={() => setMissing((m) => ({ ...m, [t.id]: true }))}
                      onClick={(e) => { e.stopPropagation(); setBig({ id: t.id, n, name: L(t.fa, t.en) }); }}
                      style={{ width: "100%", aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", cursor: "zoom-in", background: (t.swatch || [])[0] || "#eee" }} />
                  ))}
                </span>
              )}
              <span>{L(t.fa, t.en)}</span>
            </div>
          );
        })}
      </div>
      <small className={s.muted}>{L("روی هر عکس بزن تا بزرگ ببینی؛ روی کارت بزن تا انتخاب بشه.", "Tap a picture to see it large; tap the card to choose it.")}</small>
      {big && (
        <div role="dialog" aria-modal="true" aria-label={big.name} onClick={() => setBig(null)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.82)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 16 }}>
          <img src={src(big.id, big.n)} alt={big.name} style={{ maxHeight: "82vh", maxWidth: "100%", borderRadius: 10 }} />
          <div style={{ color: "#fff", fontWeight: 700, display: "flex", gap: 12, alignItems: "center" }}>
            <span>{big.name}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); setBig({ ...big, n: big.n === 1 ? 2 : 1 }); }}
              style={{ background: "#fff", color: "#111", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>
              {L("عکس دیگه", "Other picture")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

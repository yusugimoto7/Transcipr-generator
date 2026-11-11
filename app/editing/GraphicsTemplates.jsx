"use client";

import { useEffect, useState } from "react";
import { api, s } from "./ui";
import { L } from "../../lib/i18n";

// The motion graphics looks as colour cards (english-sugimotovisa's config/graphics_templates.json, read by
// /api/editing/graphics-templates). One component for New project, "Next step" and a graphics version, so the
// choice is offered wherever graphics can start (Hamed, Nov 11 2026: he never found the new templates, because
// they were only on New project → Motion graphics only).
export default function GraphicsTemplates({ value, onChange, disabled }) {
  const [looks, setLooks] = useState(null);
  useEffect(() => {
    api("/graphics-templates").then((d) => setLooks(d.templates || [])).catch(() => setLooks([]));
  }, []);
  if (!looks || looks.length < 2) return null;
  const cur = value || "canvas";
  return (
    <div className={s.field}>
      <span>{L("قالب موشن‌گرافیک", "Motion graphics template")}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {looks.map((t) => {
          const on = cur === t.id;
          return (
            <button key={t.id} type="button" disabled={disabled} onClick={() => onChange(t.id)} aria-pressed={on} title={t.source}
              style={{ textAlign: "start", padding: 10, borderRadius: 12, cursor: disabled ? "default" : "pointer", font: "inherit", fontSize: 13.5, fontWeight: 600, background: "var(--surface)", color: "var(--text)", border: on ? "2px solid var(--orange, #e8702a)" : "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ display: "flex", height: 34, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                {(t.swatch || []).map((c, i) => <i key={i} style={{ flex: i === 0 ? 2 : 1, background: c }} />)}
              </span>
              <span>{L(t.fa, t.en)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

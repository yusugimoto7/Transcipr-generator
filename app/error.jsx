"use client";

// When a screen breaks, say what broke and offer the way back, instead of Next's blank «Application
// error» page (Hamed, Nov 23 2026: a visa case crashed the whole app and the screen said nothing a
// person could pass on). The message shown is the one to send when reporting it.
import { L } from "../lib/i18n";

export default function Error({ error, reset }) {
  return (
    <div style={{ maxWidth: 520, margin: "18vh auto 0", padding: 24, fontFamily: "Vazirmatn, system-ui, sans-serif", textAlign: "center", lineHeight: 1.9 }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{L("این صفحه به مشکل خورد", "This screen ran into a problem")}</div>
      <div style={{ fontSize: 13.5, opacity: 0.75, marginBottom: 14 }}>{L("کارت از بین نرفته. دوباره امتحان کن یا به صفحهٔ اول برگرد. اگه تکرار شد، همین متن پایین رو بفرست.", "Your work is not lost. Try again or go back to the first page. If it happens again, send the text below.")}</div>
      <div dir="ltr" data-copy style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", borderRadius: 10, padding: "10px 12px", marginBottom: 16, wordBreak: "break-word", textAlign: "left" }}>
        {String((error && error.message) || error || "unknown error").slice(0, 400)}
      </div>
      <button onClick={() => reset()} style={{ padding: "9px 18px", borderRadius: 10, border: 0, background: "#32515d", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer", marginInlineEnd: 8 }}>
        {L("دوباره امتحان کن", "Try again")}
      </button>
      <a href="/" style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)", color: "inherit", textDecoration: "none", fontWeight: 700 }}>
        {L("صفحهٔ اول", "First page")}
      </a>
    </div>
  );
}

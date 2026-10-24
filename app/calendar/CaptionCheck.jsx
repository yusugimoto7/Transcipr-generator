"use client";

// Instagram caption check in the post editor (after the instagram-agent-skill caption linter): what
// the feed shows before "... more", and the handful of things that quietly cost a post. It only
// advises; nothing is blocked.

import { useState } from "react";
import { L, uiDir } from "../../lib/i18n";

// About what a phone's feed shows before "... more".
const VISIBLE = 125;

// The ways a caption asks for something. One ask per post; two is the same as none.
const ASKS = [
  ["bio", /link (in|in our|in my) bio|\bbio\b|بیو/i],
  ["book", /book (a|your) (consult|call|session)|وقت مشاوره|رزرو/i],
  ["comment", /\bcomment\b|کامنت/i],
  ["dm", /\bDM\b|direct message|دایرکت/i],
  ["follow", /\bfollow (us|for|@)|فالو/i],
  ["save", /\bsave (this|it)\b|ذخیره (کن|کنید)/i],
  ["share", /\bshare (this|it|with)\b|به اشتراک بذار/i],
];

export default function CaptionCheck({ caption, c }) {
  const [terms, setTerms] = useState("");
  const text = String(caption || "");
  if (!text.trim()) return null;
  const visible = text.slice(0, VISIBLE);
  const firstLine = text.split("\n")[0];
  const asks = new Set();
  for (const [kind, re] of ASKS) if (re.test(text)) asks.add(kind);
  // "Tap the link in our bio to book a consultation" is one ask, not two.
  if (asks.has("bio") && asks.has("book")) asks.delete("book");
  const askCount = asks.size;
  const tags = (text.match(/#[\p{L}\p{N}_]+/gu) || []).length;
  const hasLink = /https?:\/\/\S+/i.test(text);
  const missing = terms
    .split(/[,،]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
  const rows = [
    firstLine.length > VISIBLE
      ? ["warn", L(`خط اول ${firstLine.length} حرفه؛ وسط جمله بریده می‌شه. ایدهٔ اصلی رو توی ۱۲۵ حرف اول بگو.`, `The first line is ${firstLine.length} characters, so it is cut mid-thought. Say the point inside the first 125.`)]
      : ["ok", L("خط اول قبل از «... more» کامل دیده می‌شه.", "The first line shows whole before \"... more\".")],
    askCount > 1
      ? ["warn", L("بیشتر از یک درخواست داره (مثلاً بیو و کامنت با هم). فقط یکی نگه دار.", "More than one ask (for example bio and comment). Keep one.")]
      : askCount === 1
        ? ["ok", L("یک درخواست، همین درسته.", "One ask, as it should be.")]
        : ["info", L("درخواستی نداره (مثلاً «لینک توی بیو برای وقت مشاوره»).", "No ask yet (for example \"tap the link in our bio to book a consultation\").")],
    tags > 3 ? ["warn", L(`${tags} هشتگ؛ قانون ما حداکثر ۳ تاست.`, `${tags} hashtags; our rule is 3 at most.`)] : ["ok", L(`${tags} هشتگ`, `${tags} hashtag${tags === 1 ? "" : "s"}`)],
    ...(hasLink ? [["warn", L("لینک داخل کپشن اینستاگرام کلیک نمی‌شه؛ بفرستش به بیو.", "A link in an Instagram caption cannot be tapped; point to the bio instead.")]] : []),
    ...(terms.trim()
      ? [missing.length ? ["warn", L(`این عبارت‌های جستجو توی کپشن نیست: ${missing.join("، ")}`, `Not in the caption: ${missing.join(", ")}`)] : ["ok", L("عبارت‌های جستجو توی کپشن هست.", "The search phrases are in the caption.")]]
      : []),
  ];
  const tone = { ok: "#12a150", warn: "#d97706", info: "#64748b" };
  return (
    <div style={{ marginTop: 10, border: "1px solid var(--line, #e5e7eb)", borderRadius: 12, padding: 12, fontSize: 13 }}>
      <div className={c.label} dir={uiDir()} style={{ marginBottom: 6 }}>{L("کپشن اینستاگرام توی فید", "Instagram caption in the feed")}</div>
      <div dir="auto" style={{ whiteSpace: "pre-wrap", background: "var(--surface-hi, #f6f7f9)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 }}>
        {visible}
        {text.length > VISIBLE && <span style={{ color: "#64748b" }}> ... more</span>}
      </div>
      <ul dir={uiDir()} style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
        {rows.map(([k, msg], i) => (
          <li key={i} style={{ color: tone[k] }}>{k === "ok" ? "✓" : k === "warn" ? "!" : "·"} {msg}</li>
        ))}
      </ul>
      <input
        className={c.input}
        dir="auto"
        data-no-voice
        style={{ marginTop: 8, width: "100%", boxSizing: "border-box" }}
        placeholder={L("عبارت‌هایی که مردم جستجو می‌کنن (اختیاری، با ویرگول جدا کن؛ ذخیره نمی‌شه)", "Phrases people search for (optional, comma separated; not saved)")}
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
      />
    </div>
  );
}

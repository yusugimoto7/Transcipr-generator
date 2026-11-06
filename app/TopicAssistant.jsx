"use client";

// The topic page's assistant (Hamed, Nov 6 2026: "a live chatbot I can talk with and change everything
// I want from it, like you: I tell it the problem and it changes the writing at once"). A round button
// in the corner opens the chat; each message is one server job (`assistant`, lib/assistant.js) because
// a model call must not hang on a page a phone can freeze. The answer comes with the whole new version
// of every part it changed, and each is saved through that part's own step, so the panels above show
// it at once: the script (script_fix with the exact text), the Telegram post (telegram_save), the
// carousel (carousel "draw": only the slides whose words changed are designed again) and the article
// (article "save"). The conversation is kept on this device per topic.
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Trash2, Check } from "lucide-react";
import { L, uiDir } from "../lib/i18n";

const PART_NAMES = {
  script_fa: ["اسکریپت فارسی", "Persian script"],
  script_en: ["اسکریپت انگلیسی", "English script"],
  telegram_fa: ["پست تلگرام", "Telegram post"],
  telegram_en: ["پست تلگرام انگلیسی", "English Telegram post"],
  carousel_fa: ["کاروسل", "Carousel"],
  carousel_en: ["کاروسل انگلیسی", "English carousel"],
  article_fa: ["مقاله", "Article"],
  article_en: ["مقالهٔ انگلیسی", "English article"],
};
const store = (k) => "assistant:" + k;
const load = (k) => {
  try {
    const v = JSON.parse(localStorage.getItem(store(k)) || "null");
    return v && Array.isArray(v.messages) ? v : { messages: [], done: 0 };
  } catch (_) {
    return { messages: [], done: 0 };
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(store(k), JSON.stringify({ messages: v.messages.slice(-40), done: v.done }));
  } catch (_) {}
};

export default function TopicAssistant({ topicKey, job, lang, run }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ messages: [], done: 0 });
  const [text, setText] = useState("");
  const listRef = useRef(null);
  useEffect(() => setState(load(topicKey)), [topicKey]);
  const running = !!job && job.status === "running";

  // A finished turn: its answer joins the chat once, and each change is saved through its own step.
  useEffect(() => {
    if (!job || job.status === "running" || !job.startedAt) return;
    const cur = load(topicKey);
    if ((cur.done || 0) >= job.startedAt) return;
    const next = { ...cur, done: job.startedAt };
    if (job.status === "error") {
      next.messages = [...cur.messages, { role: "assistant", text: L("نشد: ", "That did not work: ") + (job.error || ""), error: true }];
    } else if (job.result) {
      const r = job.result;
      const ch = r.changes || {};
      const parts = Object.keys(ch);
      for (const k of parts) {
        const v = ch[k];
        const en = k.endsWith("_en");
        const sfx = en ? "@en" : "";
        if (k.startsWith("script_")) run(en ? "script_fix@en" : "script_fix", { lang: en ? "en" : "fa", set: v, note: L("دستیار", "assistant") });
        else if (k.startsWith("telegram_")) run("telegram_save" + sfx, { text: v, link: (r.links || {})[en ? "en" : "fa"] || "" });
        else if (k.startsWith("carousel_")) run("carousel" + sfx, { mode: "draw", slides: v.slides, caption: v.caption, template: v.template });
        else if (k.startsWith("article_")) run("article" + sfx, { mode: "save", article: v });
      }
      next.messages = [...cur.messages, { role: "assistant", text: r.reply || "", parts }];
    }
    save(topicKey, next);
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job && job.status, job && job.startedAt, topicKey]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.messages.length, running, open]);

  const send = () => {
    const t = text.trim();
    if (!t || running) return;
    const messages = [...state.messages, { role: "user", text: t }];
    const next = { ...state, messages };
    save(topicKey, next);
    setState(next);
    setText("");
    run("assistant", { messages: messages.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.text })), lang });
  };
  const clear = () => {
    if (!window.confirm(L("گفت‌وگو پاک بشه؟ نوشته‌ها عوض نمی‌شن.", "Clear the conversation? The writing stays as it is."))) return;
    const next = { messages: [], done: state.done };
    save(topicKey, next);
    setState(next);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={L("دستیار نوشتن", "Writing assistant")}
          title={L("دستیار نوشتن: بگو چی عوض بشه", "Writing assistant: say what to change")}
          style={{ position: "fixed", insetInlineEnd: 16, bottom: 18, zIndex: 50, width: 56, height: 56, borderRadius: 999, border: "none", background: "#32515d", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.25)", display: "grid", placeItems: "center", cursor: "pointer" }}
        >
          <MessageCircle size={24} aria-hidden />
          {running && <span style={{ position: "absolute", top: 6, insetInlineEnd: 6, width: 10, height: 10, borderRadius: 99, background: "#f97316" }} />}
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={L("دستیار نوشتن", "Writing assistant")}
          dir={uiDir()}
          style={{ position: "fixed", zIndex: 60, insetInlineEnd: 12, bottom: 12, width: "min(420px, calc(100vw - 24px))", height: "min(620px, calc(100dvh - 90px))", background: "#fff", borderRadius: 18, boxShadow: "0 16px 48px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Vazirmatn', 'Geist', sans-serif" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#32515d", color: "#fff" }}>
            <MessageCircle size={18} aria-hidden />
            <b style={{ flex: 1, fontSize: 14 }}>{L("دستیار نوشتن", "Writing assistant")}</b>
            {state.messages.length > 0 && (
              <button type="button" onClick={clear} aria-label={L("پاک کردن گفت‌وگو", "Clear the conversation")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
                <Trash2 size={17} aria-hidden />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label={L("بستن", "Close")} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
              <X size={19} aria-hidden />
            </button>
          </div>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, background: "#f6f4ef", display: "flex", flexDirection: "column", gap: 8 }}>
            {!state.messages.length && (
              <div style={{ fontSize: 13, color: "#5b6675", lineHeight: 1.8 }}>
                {L(
                  "بگو چی رو می‌خوای عوض کنی؛ همین الان روی صفحه عوض می‌شه. مثلاً: «اسکریپت فارسی رو کوتاه‌تر و خودمونی‌تر کن»، «اسلاید ۳ و ۴ رو یکی کن»، «پست تلگرام یه جملهٔ اول قوی‌تر بخواد»، «تیتر مقاله رو عوض کن». فقط از روی متن خبر می‌نویسه و چیزی از خودش اضافه نمی‌کنه.",
                  "Say what you want changed; it changes on the page right away. For example: “make the Persian script shorter and more casual”, “merge slides 3 and 4”, “the Telegram post needs a stronger first line”, “change the article's title”. It writes only from the news text and adds nothing of its own."
                )}
              </div>
            )}
            {state.messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
                <div dir="auto" style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.75, padding: "8px 11px", borderRadius: 14, background: m.role === "user" ? "#32515d" : m.error ? "#fef3f2" : "#fff", color: m.role === "user" ? "#fff" : m.error ? "#b42318" : "#121a24", border: m.role === "user" ? "none" : "1px solid #e6e2d8" }}>
                  {m.text}
                </div>
                {(m.parts || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {m.parts.map((p) => (
                      <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 700, color: "#0f766e", background: "#ccfbf1", borderRadius: 99, padding: "2px 8px" }}>
                        <Check size={12} aria-hidden /> {PART_NAMES[p] ? L(...PART_NAMES[p]) : p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {running && <div style={{ alignSelf: "flex-start", fontSize: 13, color: "#5b6675" }} className="ui-pulse">{L("در حال کار…", "Working…")}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e6e2d8", alignItems: "flex-end" }}>
            <textarea
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={L("چی عوض بشه؟", "What should change?")}
              style={{ flex: 1, resize: "none", borderRadius: 12, border: "1px solid #d0d5dd", padding: "8px 10px", fontSize: 14, lineHeight: 1.6, fontFamily: "inherit", maxHeight: 140 }}
            />
            <button type="button" onClick={send} disabled={!text.trim() || running} aria-label={L("فرستادن", "Send")} style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: !text.trim() || running ? "#c9cfd6" : "#32515d", color: "#fff", display: "grid", placeItems: "center", cursor: !text.trim() || running ? "default" : "pointer" }}>
              <Send size={18} aria-hidden style={{ transform: uiDir() === "rtl" ? "scaleX(-1)" : "none" }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

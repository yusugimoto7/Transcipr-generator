"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   SUGIMOTO VISA — Video Topic Engine
   - Pulls this week's live Canada/Europe immigration news
   - One topic per card, swipe/accept/reject (Tinder-style)
   - On approve: writes a full Reel script in Farsi + English
   Claude API calls run server-side (see /app/api/*) so the
   API key never reaches the browser.
   ============================================================ */

const C = {
  ground: "#16282f",       // deep teal ground
  ground2: "#1e343d",
  slate: "#32515d",        // brand teal-slate
  cream: "#f2e5c0",        // brand cream (card)
  creamEdge: "#e7d6a6",
  orange: "#f17212",       // brand action orange
  orangeDeep: "#d9600a",
  ink: "#22343b",          // text on cream
  inkSoft: "#5a6f78",
  reject: "#728089",       // muted slate for reject
  line: "rgba(242,229,192,0.14)",
};

const FIELDS = {
  "Work Permit": { emoji: "🛂", label: "Work Permit" },
  PNP: { emoji: "📍", label: "PNP" },
  "Express Entry": { emoji: "⚡", label: "Express Entry" },
  Study: { emoji: "🎓", label: "Study / PGWP" },
  LMIA: { emoji: "📄", label: "LMIA" },
  Policy: { emoji: "📢", label: "Policy" },
  Court: { emoji: "⚖️", label: "Court" },
  Europe: { emoji: "🇪🇺", label: "Europe" },
};

// Fallback deck (used only if the live fetch fails) — drawn from the competitor research.
const FALLBACK = [
  { title_fa: "ورک‌پرمیت ایرانیان داره تموم می‌شه؟ سه راه قانونی موندن", title_en: "Iranians' work permit ending — 3 legal ways to stay", field: "Work Permit", page: "CA", why_now: "پرتکرارترین موضوع بازار در همه‌ی پیج‌های برتر فارسی — تقاضای دائمی و اضطراب بالا.", score: 95 },
  { title_fa: "از دو بار ریجکتی تا اقامت دائم — یک پروندهٔ واقعی", title_en: "From 2 refusals to PR — a real case story", field: "Court", page: "CA", why_now: "ترکیب اثبات + ترس؛ روی چند پیج برتر همزمان می‌ترکه.", score: 90 },
  { title_fa: "کدوم شغل‌ها توی BC PNP بیشترین شانس رو دارن؟", title_en: "Which jobs get the best odds in BC PNP?", field: "PNP", page: "CA", why_now: "شما در BC هستید و این فضا برای مخاطب فارسی نیمه‌خالیه.", score: 88 },
  { title_fa: "قرعه‌کشی جدید اکسپرس‌انتری — شما واجد شرایطید؟", title_en: "New Express Entry draw — are you eligible?", field: "Express Entry", page: "CA", why_now: "دراوها هر چند هفته و بلافاصله بعدش موج جست‌وجو راه می‌افته.", score: 85 },
  { title_fa: "کارت فرصت آلمان: سه اشتباهی که پرونده‌تون رو رد می‌کنه", title_en: "Germany Opportunity Card: 3 mistakes that get you rejected", field: "Europe", page: "EU", why_now: "لِین اروپا برای مخاطب فارسی تقریباً بی‌رقیبه — سهم شماست.", score: 82 },
  { title_fa: "تغییرات جدید ورک‌پرمیت بعد از تحصیل — چی عوض شد؟", title_en: "New post-graduation work permit rules — what changed?", field: "Study", page: "CA", why_now: "تغییرات PGWP مستقیم روی بزرگ‌ترین سگمنت دانشجویی اثر می‌ذاره.", score: 80 },
];

async function fetchTopics(exclude = [], force = false) {
  const res = await fetch("/api/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclude, force }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.topics) || data.topics.length === 0) {
    throw new Error("parse");
  }
  return data.topics;
}

// ---- topic memory (so a news article/topic is shown only ONCE, ever, on this
// device — even across refreshes). We remember both the title and the source
// URL, and treat a match on EITHER as "already seen", so a reworded title on
// the same article is still caught. ----
const SEEN_KEY = "sugimoto_seen_topics_v2";

function topicKey(t) {
  return (t.title_fa || t.title_en || "").trim().toLowerCase();
}

// Normalize a source URL so trivially-different links to the same page collapse
// (strip protocol, www, query string, hash, trailing slash).
function urlKey(t) {
  const u = (t.source_url || "").trim();
  if (!u) return "";
  try {
    const parsed = new URL(u);
    let s = parsed.hostname.replace(/^www\./, "") + parsed.pathname;
    return s.replace(/\/+$/, "").toLowerCase();
  } catch (_) {
    return u.toLowerCase();
  }
}

function loadSeen() {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function saveSeen(list) {
  if (typeof window === "undefined") return;
  try {
    // de-dupe by key, keep the most recent 500
    const map = new Map();
    for (const item of list) if (item && item.key) map.set(item.key, item);
    localStorage.setItem(
      SEEN_KEY,
      JSON.stringify([...map.values()].slice(-500))
    );
  } catch (_) {}
}

// Has this topic (by title OR source article) been shown before?
function isSeen(t, seenTitleSet, seenUrlSet) {
  const uk = urlKey(t);
  return seenTitleSet.has(topicKey(t)) || (uk && seenUrlSet.has(uk));
}

async function fetchScript(topic, lang) {
  const res = await fetch("/api/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, lang }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  const data = await res.json();
  return data.text || "";
}

export default function App() {
  const [topics, setTopics] = useState([]);
  const [index, setIndex] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [topicError, setTopicError] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [view, setView] = useState("deck"); // deck | script
  const [scripts, setScripts] = useState({ fa: "", en: "" });
  const [scriptTopic, setScriptTopic] = useState(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [scriptError, setScriptError] = useState(null);
  const [scriptTab, setScriptTab] = useState("fa");
  const [copied, setCopied] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  // drag state
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null); // 'left' | 'right' | null
  const startX = useRef(0);
  const cardRef = useRef(null);

  // undo history — lets you go back to the previous topic after reject/approve
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const pushHistory = () => {
    historyRef.current.push({ index, reviewedCount, approvedCount });
    setCanUndo(true);
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setExiting(null);
    setDx(0);
    setIndex(prev.index);
    setReviewedCount(prev.reviewedCount);
    setApprovedCount(prev.approvedCount);
    setView("deck");
    setCanUndo(historyRef.current.length > 0);
  };

  const loadTopics = useCallback(async (force = false) => {
    setLoadingTopics(true);
    setTopicError(null);
    setUsingFallback(false);
    try {
      const seen = loadSeen();
      const seenTitles = new Set(seen.map((s) => s.key));
      const seenUrls = new Set(seen.map((s) => s.url).filter(Boolean));
      const exclude = seen
        .map((s) => s.en || s.key)
        .filter(Boolean)
        .slice(-80);

      // Page-load fetches use the server cache (near-instant); the explicit
      // "Refresh trends" button forces a live regenerate.
      const parsed = await fetchTopics(exclude, force);

      // STRICT: drop every topic whose title OR source article was already
      // shown. A topic/article is shown only once, ever, on this device.
      const fresh = parsed.filter((t) => !isSeen(t, seenTitles, seenUrls));

      // Remember this batch so it never comes back.
      saveSeen([
        ...seen,
        ...fresh.map((t) => ({
          key: topicKey(t),
          url: urlKey(t),
          en: t.title_en || t.title_fa,
        })),
      ]);

      resetHistory();
      setTopics(fresh);
      setIndex(0);
      setUpdatedAt(new Date());
      if (fresh.length === 0) {
        setTopicError("همهٔ موضوعات این دور رو قبلاً دیدی. کمی بعد دوباره «Refresh trends» رو بزن تا خبرهای تازه بیاد.");
      }
    } catch (e) {
      // Only fall back to the base deck if we have nothing shown yet; never
      // re-show base topics that were already seen.
      const seen = loadSeen();
      const seenTitles = new Set(seen.map((s) => s.key));
      const seenUrls = new Set(seen.map((s) => s.url).filter(Boolean));
      const freshFallback = FALLBACK.filter((t) => !isSeen(t, seenTitles, seenUrls));
      saveSeen([
        ...seen,
        ...freshFallback.map((t) => ({ key: topicKey(t), url: urlKey(t), en: t.title_en || t.title_fa })),
      ]);
      resetHistory();
      setTopics(freshFallback);
      setIndex(0);
      setUsingFallback(true);
      setUpdatedAt(new Date());
      setTopicError("نتونستم اخبار زندهٔ این هفته رو بیارم — فعلاً از موضوعات پایه استفاده می‌کنم. دوباره امتحان کن.");
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  const current = topics[index];

  const advance = () => {
    setDx(0);
    setExiting(null);
    setIndex((i) => i + 1);
  };

  const doReject = () => {
    if (exiting) return;
    pushHistory();
    setReviewedCount((n) => n + 1);
    setExiting("left");
    setTimeout(advance, 260);
  };

  const doApprove = async () => {
    if (exiting || !current) return;
    pushHistory();
    setReviewedCount((n) => n + 1);
    setApprovedCount((n) => n + 1);
    const topic = current;
    setExiting("right");
    setScriptTopic(topic);
    setScripts({ fa: "", en: "" });
    setScriptError(null);
    setScriptTab("fa");
    setView("script");
    setLoadingScript(true);
    setTimeout(advance, 260);
    try {
      const [fa, en] = await Promise.all([
        fetchScript(topic, "fa"),
        fetchScript(topic, "en"),
      ]);
      setScripts({ fa, en });
    } catch (e) {
      setScriptError("نوشتن سناریو با خطا مواجه شد. برگرد و دوباره تأیید کن.");
    } finally {
      setLoadingScript(false);
    }
  };

  // pointer drag
  const onDown = (e) => {
    if (exiting) return;
    setDragging(true);
    startX.current = e.clientX;
    if (cardRef.current) cardRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    setDx(e.clientX - startX.current);
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dx > 120) doApprove();
    else if (dx < -120) doReject();
    else setDx(0);
  };

  const copy = (which) => {
    const t = which === "fa" ? scripts.fa : scripts.en;
    if (!t) return;
    navigator.clipboard?.writeText(t);
    setCopied(which);
    setTimeout(() => setCopied(""), 1400);
  };

  const rot = dragging ? dx / 22 : exiting === "right" ? 14 : exiting === "left" ? -14 : 0;
  const tx = exiting === "right" ? 700 : exiting === "left" ? -700 : dx;
  const likeOp = Math.max(0, Math.min(1, dx / 110));
  const nopeOp = Math.max(0, Math.min(1, -dx / 110));

  const wrap = {
    minHeight: "100vh",
    background: `radial-gradient(1200px 600px at 50% -10%, ${C.ground2}, ${C.ground})`,
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    color: C.cream,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "20px 16px 40px",
    boxSizing: "border-box",
  };

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ width: "100%", maxWidth: 460, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: C.orange, display: "inline-block", transform: "rotate(45deg)" }} />
            <span style={{ fontWeight: 700, letterSpacing: 0.5, fontSize: 15 }}>SUGIMOTO</span>
            <span style={{ fontWeight: 500, fontSize: 15, color: "rgba(242,229,192,0.6)" }}>· Topic Engine</span>
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(242,229,192,0.5)", marginTop: 3, fontFamily: "'Vazirmatn', sans-serif", direction: "rtl" }}>
            بر اساس اخبار هفتهٔ اخیر مهاجرت کانادا و اروپا
          </div>
        </div>
        <button
          onClick={() => loadTopics(true)}
          disabled={loadingTopics}
          style={{
            background: "transparent", color: C.cream, border: `1px solid ${C.line}`,
            borderRadius: 10, padding: "8px 12px", fontSize: 12.5, fontWeight: 600,
            cursor: loadingTopics ? "default" : "pointer", opacity: loadingTopics ? 0.5 : 1,
            fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ display: "inline-block", transform: loadingTopics ? "none" : "none" }}>⟳</span>
          {loadingTopics ? "Loading…" : "Refresh trends"}
        </button>
      </div>

      {/* Stat strip */}
      <div style={{ width: "100%", maxWidth: 460, display: "flex", gap: 10, marginBottom: 16 }}>
        <Stat label="Reviewed" value={reviewedCount} />
        <Stat label="Approved" value={approvedCount} accent />
        <Stat label="In deck" value={Math.max(0, topics.length - index)} />
      </div>

      {view === "deck" && (
        <div style={{ width: "100%", maxWidth: 460, flex: 1, display: "flex", flexDirection: "column" }}>
          {topicError && (
            <div style={{ background: "rgba(241,114,18,0.12)", border: `1px solid rgba(241,114,18,0.3)`, color: C.cream, borderRadius: 12, padding: "10px 12px", fontSize: 12.5, marginBottom: 14, fontFamily: "'Vazirmatn', sans-serif", direction: "rtl", textAlign: "right" }}>
              {topicError}
            </div>
          )}

          {loadingTopics ? (
            <CardSkeleton />
          ) : current ? (
            <div style={{ position: "relative", height: 560 }}>
              {/* peek of next card */}
              {topics[index + 1] && (
                <div style={{ position: "absolute", inset: 0, transform: "scale(0.94) translateY(14px)", opacity: 0.5 }}>
                  <TopicCard topic={topics[index + 1]} ghost />
                </div>
              )}
              <div
                ref={cardRef}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                style={{
                  position: "absolute", inset: 0, cursor: dragging ? "grabbing" : "grab",
                  transform: `translateX(${tx}px) rotate(${rot}deg)`,
                  transition: dragging ? "none" : "transform 0.26s cubic-bezier(.2,.7,.3,1)",
                  touchAction: "none",
                }}
              >
                <TopicCard topic={current} likeOp={likeOp} nopeOp={nopeOp} />
              </div>
            </div>
          ) : (
            <EmptyDeck onRefresh={() => loadTopics(true)} />
          )}

          {/* Actions */}
          {!loadingTopics && current && (
            <div style={{ display: "flex", gap: 14, marginTop: 22, justifyContent: "center", alignItems: "center" }}>
              <UndoBtn onClick={undo} disabled={!canUndo || !!exiting} />
              <ActionBtn kind="reject" onClick={doReject} disabled={!!exiting} />
              <ActionBtn kind="approve" onClick={doApprove} disabled={!!exiting} />
            </div>
          )}
          {!loadingTopics && current && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11.5, color: "rgba(242,229,192,0.4)" }}>
              Swipe the card, or use the buttons · ↶ undo · ← رد · تأیید →
            </div>
          )}
        </div>
      )}

      {view === "script" && scriptTopic && (
        <ScriptView
          topic={scriptTopic}
          scripts={scripts}
          loading={loadingScript}
          error={scriptError}
          tab={scriptTab}
          setTab={setScriptTab}
          copied={copied}
          onCopy={copy}
          onBack={() => { setView("deck"); }}
          onUndo={undo}
          canUndo={canUndo}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: "rgba(242,229,192,0.05)", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? C.orange : C.cream, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "rgba(242,229,192,0.45)", marginTop: 5 }}>{label}</div>
    </div>
  );
}

function heat(score) {
  return Math.max(0, Math.min(100, score));
}

function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return url;
  }
}

function TopicCard({ topic, likeOp = 0, nopeOp = 0, ghost }) {
  const f = FIELDS[topic.field] || { emoji: "•", label: topic.field };
  const isEU = topic.page === "EU";
  return (
    <div style={{
      height: "100%", background: C.cream, borderRadius: 22,
      border: `1px solid ${C.creamEdge}`,
      boxShadow: ghost ? "none" : "0 24px 50px -20px rgba(0,0,0,0.55)",
      padding: 24, boxSizing: "border-box", display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
      userSelect: "none",
    }}>
      {/* top strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: isEU ? C.slate : C.orange }} />

      {/* stamps */}
      {!ghost && (
        <>
          <Stamp text="تأیید" color={C.orange} op={likeOp} side="left" />
          <Stamp text="رد" color={C.reject} op={nopeOp} side="right" />
        </>
      )}

      {/* tags */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(50,81,93,0.09)", padding: "6px 10px", borderRadius: 8 }}>
          <span style={{ fontSize: 14 }}>{f.emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, fontFamily: "'Space Grotesk', sans-serif" }}>{f.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: isEU ? C.slate : C.orangeDeep, fontFamily: "'Space Grotesk', sans-serif" }}>
          {isEU ? "🇪🇺 Europe" : "🇨🇦 Canada"}
        </div>
      </div>

      {/* Farsi hook */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 0" }}>
        <div dir="rtl" style={{
          fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, color: C.ink,
          fontSize: 25, lineHeight: 1.55, textAlign: "right", unicodeBidi: "plaintext",
        }}>
          {topic.title_fa}
        </div>
        {topic.title_en && (
          <div style={{ marginTop: 12, fontSize: 13.5, color: C.inkSoft, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}>
            {topic.title_en}
          </div>
        )}
      </div>

      {/* why now */}
      <div style={{ borderTop: `1px dashed ${C.creamEdge}`, paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.orange, display: "inline-block", boxShadow: `0 0 0 4px rgba(241,114,18,0.18)` }} />
          <span style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.inkSoft, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
            چرا الان
          </span>
        </div>
        <div dir="rtl" style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, lineHeight: 1.8, color: "#43555c", textAlign: "right", unicodeBidi: "plaintext" }}>
          {topic.why_now}
        </div>
        {topic.source_url && (
          <a
            href={topic.source_url}
            target="_blank"
            rel="noopener noreferrer"
            // Stop the card's drag handler from swallowing the tap so the link
            // actually opens (in a new tab) instead of starting a swipe.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10,
              fontSize: 12, fontWeight: 600, color: C.slate,
              fontFamily: "'Space Grotesk', sans-serif", textDecoration: "underline",
              direction: "ltr", cursor: "pointer",
            }}
          >
            🔗 {sourceHost(topic.source_url)} ↗
          </a>
        )}
        {/* heat */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, height: 7, background: "rgba(50,81,93,0.12)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${heat(topic.score)}%`, height: "100%", background: `linear-gradient(90deg, ${C.orange}, ${C.orangeDeep})`, borderRadius: 99 }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.orangeDeep, fontFamily: "'Space Grotesk', sans-serif", minWidth: 46, textAlign: "right" }}>
            {topic.score}<span style={{ fontSize: 10, color: C.inkSoft, fontWeight: 500 }}>/100</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stamp({ text, color, op, side }) {
  return (
    <div style={{
      position: "absolute", top: 26, [side]: 22, zIndex: 3,
      border: `3px solid ${color}`, color: color, borderRadius: 10,
      padding: "4px 12px", fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 20,
      transform: `rotate(${side === "left" ? -14 : 14}deg)`, opacity: op, transition: "opacity 0.1s",
      pointerEvents: "none", background: "rgba(242,229,192,0.6)",
    }}>
      {text}
    </div>
  );
}

function ActionBtn({ kind, onClick, disabled }) {
  const approve = kind === "approve";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={approve ? "Approve topic" : "Reject topic"}
      style={{
        width: 68, height: 68, borderRadius: "50%", cursor: disabled ? "default" : "pointer",
        border: approve ? "none" : `2px solid ${C.reject}`,
        background: approve ? `linear-gradient(180deg, ${C.orange}, ${C.orangeDeep})` : "rgba(242,229,192,0.04)",
        color: approve ? "#fff" : C.reject, fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: approve ? "0 12px 24px -8px rgba(241,114,18,0.6)" : "none",
        opacity: disabled ? 0.5 : 1, transition: "transform 0.12s",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {approve ? "✓" : "✕"}
    </button>
  );
}

function UndoBtn({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Undo — go back to previous topic"
      title="Undo (previous topic)"
      style={{
        width: 52, height: 52, borderRadius: "50%", cursor: disabled ? "default" : "pointer",
        border: `1px solid ${C.line}`, background: "rgba(242,229,192,0.04)",
        color: C.cream, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.35 : 1, transition: "transform 0.12s",
      }}
    >
      ↶
    </button>
  );
}

function CardSkeleton() {
  return (
    <div style={{ height: 500, background: "rgba(242,229,192,0.06)", border: `1px solid ${C.line}`, borderRadius: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 34, height: 34, border: `3px solid rgba(242,229,192,0.2)`, borderTopColor: C.orange, borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
      <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13.5, color: "rgba(242,229,192,0.6)", direction: "rtl" }}>
        در حال بررسی اخبار هفتهٔ اخیر…
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function EmptyDeck({ onRefresh }) {
  return (
    <div style={{ height: 500, background: "rgba(242,229,192,0.05)", border: `1px dashed ${C.line}`, borderRadius: 22, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 }}>
      <div style={{ fontSize: 34 }}>🎬</div>
      <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 15, direction: "rtl", color: C.cream }}>
        همهٔ موضوعات این دسته رو دیدی
      </div>
      <button onClick={onRefresh} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 12, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
        Get a fresh batch
      </button>
    </div>
  );
}

// Render script text line-by-line with automatic per-line direction, so mixed
// Farsi + English lines don't get visually scrambled by a single forced base
// direction. Each line resolves its own direction from its first strong char
// and aligns to that direction.
function ScriptBody({ text, tab }) {
  const font = tab === "fa" ? "'Vazirmatn', sans-serif" : "'Space Grotesk', sans-serif";
  const lines = (text || " ").split("\n");
  return (
    <div style={{ fontFamily: font, fontSize: 14, lineHeight: 2, color: C.cream }}>
      {lines.map((line, i) => (
        <div
          key={i}
          dir="auto"
          style={{
            textAlign: "start",
            unicodeBidi: "plaintext",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            minHeight: "1em",
          }}
        >
          {line || " "}
        </div>
      ))}
    </div>
  );
}

function ScriptView({ topic, scripts, loading, error, tab, setTab, copied, onCopy, onBack, onUndo, canUndo }) {
  const f = FIELDS[topic.field] || { emoji: "•", label: topic.field };
  const active = tab === "fa" ? scripts.fa : scripts.en;

  // Telegram send state
  const [tgState, setTgState] = useState("idle"); // idle | sending | sent | error
  const [tgMsg, setTgMsg] = useState("");

  const sendTelegram = async () => {
    if (tgState === "sending") return;
    if (!scripts.fa && !scripts.en) return;
    setTgState("sending");
    setTgMsg("");
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, fa: scripts.fa, en: scripts.en }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "failed");
      setTgState("sent");
      setTimeout(() => setTgState("idle"), 3000);
    } catch (e) {
      setTgState("error");
      setTgMsg(String(e.message || e));
    }
  };

  const tgLabel =
    tgState === "sending"
      ? "Sending…"
      : tgState === "sent"
      ? "Sent to Telegram ✓"
      : tgState === "error"
      ? "Retry Telegram"
      : "✈ Send to Telegram";

  return (
    <div style={{ width: "100%", maxWidth: 560, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onBack} style={{ background: "transparent", color: "rgba(242,229,192,0.7)", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>
          ← Back to deck
        </button>
        {canUndo && (
          <button onClick={onUndo} style={{ background: "rgba(242,229,192,0.06)", color: C.cream, border: `1px solid ${C.line}`, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" }}>
            ↶ Undo (previous topic)
          </button>
        )}
      </div>

      <div style={{ background: C.cream, borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>{f.emoji}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.slate, fontFamily: "'Space Grotesk', sans-serif" }}>{f.label}</span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: topic.page === "EU" ? C.slate : C.orangeDeep }}>{topic.page === "EU" ? "🇪🇺 Europe" : "🇨🇦 Canada"}</span>
        </div>
        <div dir="rtl" style={{ fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 18, color: C.ink, textAlign: "right", lineHeight: 1.6, unicodeBidi: "plaintext" }}>
          {topic.title_fa}
        </div>
        {topic.source_url && (
          <a
            href={topic.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12,
              fontSize: 12.5, fontWeight: 600, color: "#fff",
              fontFamily: "'Space Grotesk', sans-serif", textDecoration: "none",
              direction: "ltr", background: C.slate, border: `1px solid ${C.slate}`,
              borderRadius: 9, padding: "8px 12px",
            }}
          >
            🔗 Read the source: {sourceHost(topic.source_url)} ↗
          </a>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Tab active={tab === "fa"} onClick={() => setTab("fa")} label="سناریو فارسی" />
        <Tab active={tab === "en"} onClick={() => setTab("en")} label="English script" />
      </div>

      <div style={{ flex: 1, background: "rgba(242,229,192,0.05)", border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, minHeight: 300 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 260, gap: 14 }}>
            <div style={{ width: 30, height: 30, border: `3px solid rgba(242,229,192,0.2)`, borderTopColor: C.orange, borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
            <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, color: "rgba(242,229,192,0.6)", direction: "rtl" }}>در حال نوشتن سناریوی فارسی و انگلیسی…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13.5, color: C.orange, direction: "rtl", textAlign: "right" }}>{error}</div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: tab === "fa" ? "flex-start" : "flex-end", marginBottom: 12 }}>
              <button onClick={() => onCopy(tab)} style={{ background: copied === tab ? C.orangeDeep : "rgba(241,114,18,0.15)", color: copied === tab ? "#fff" : C.orange, border: `1px solid rgba(241,114,18,0.35)`, borderRadius: 9, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                {copied === tab ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <ScriptBody text={active} tab={tab} />
          </div>
        )}
      </div>

      {/* Telegram */}
      {!loading && !error && (
        <>
          <button
            onClick={sendTelegram}
            disabled={tgState === "sending" || (!scripts.fa && !scripts.en)}
            style={{
              marginTop: 16,
              background: tgState === "sent" ? C.slate : "rgba(50,81,93,0.35)",
              color: C.cream,
              border: `1px solid ${C.slate}`,
              borderRadius: 12,
              padding: "12px",
              fontWeight: 600,
              fontSize: 14,
              cursor: tgState === "sending" ? "default" : "pointer",
              opacity: tgState === "sending" ? 0.6 : 1,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {tgLabel}
          </button>
          {tgState === "error" && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, fontFamily: "'Space Grotesk', sans-serif", textAlign: "center" }}>
              {tgMsg}
            </div>
          )}
        </>
      )}

      <button onClick={onBack} style={{ marginTop: 12, background: `linear-gradient(180deg, ${C.orange}, ${C.orangeDeep})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
        Next topic →
      </button>
    </div>
  );
}

function Tab({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: active ? C.slate : "rgba(242,229,192,0.05)",
      color: active ? C.cream : "rgba(242,229,192,0.6)",
      border: `1px solid ${active ? C.slate : C.line}`, borderRadius: 10, padding: "10px",
      fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif",
    }}>
      {label}
    </button>
  );
}

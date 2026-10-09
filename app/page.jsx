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
  ground: "#f6f7f9",       // page background
  surface: "#ffffff",      // cards, rows, panels
  surfaceHi: "#f1f3f6",    // tracks, hover, subtle fills
  line: "#e6e8ec",         // hairline borders
  text: "#121a24",         // primary text
  text2: "#5b6675",        // secondary text
  text3: "#8b95a3",        // tertiary text / labels
  ink: "#121a24",          // text on cards (same as text in the light theme)
  inkSoft: "#5b6675",
  creamEdge: "#e6e8ec",
  slate: "#334155",
  teal: "#0e8a99",         // links, info
  orange: "#f26a12",       // brand action orange
  orangeDeep: "#d9560a",
  reject: "#e5484d",       // reject / errors
  success: "#12945e",
};

// "#rrggbb" + alpha -> rgba(), so one accent color can tint, border and glow.
function alpha(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Each topic type gets its own color, so a type is recognisable at a glance
// in the list, on the card and in the library.
const FIELDS = {
  "Work Permit": { emoji: "🛂", label: "Work Permit", color: "#0e8a99" },
  PNP: { emoji: "📍", label: "PNP", color: "#d9770a" },
  "Express Entry": { emoji: "⚡", label: "Express Entry", color: "#b8890b" },
  Study: { emoji: "🎓", label: "Study / PGWP", color: "#6d5bd0" },
  LMIA: { emoji: "📄", label: "LMIA", color: "#d6458f" },
  Policy: { emoji: "📢", label: "Policy", color: "#2f6fd6" },
  Court: { emoji: "⚖️", label: "Court", color: "#9a7a2c" },
  Europe: { emoji: "🇪🇺", label: "Europe", color: "#4560d8" },
  Citizenship: { emoji: "🪪", label: "Citizenship", color: "#12945e" },
  Family: { emoji: "👪", label: "Family", color: "#d64f80" },
};
function fieldOf(t) {
  return FIELDS[t && t.field] || { emoji: "•", label: (t && t.field) || "Topic", color: "#8fa3ab" };
}


// Topics arrive as a stream, one card per line, so the first card can be
// shown while the rest are still being written. Falls back to reading the
// whole body at once where a browser cannot read a stream.
async function streamTopics(exclude, force, { onTopic, onStats }) {
  const res = await fetch("/api/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclude, force, stream: true }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  let error = "";
  const handle = (line) => {
    if (!line.trim()) return;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch (_) {
      return;
    }
    if (ev.type === "topic" && ev.topic) onTopic(ev.topic);
    else if (ev.type === "stats") onStats(ev.stats || null);
    else if (ev.type === "error") error = ev.message || ev.error || "error";
  };
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handle(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    handle(buf);
  } else {
    (await res.text()).split("\n").forEach(handle);
  }
  return { error };
}

// The last deck shown on this device, so reopening the app shows cards
// immediately instead of waiting on the server.
const DECK_KEY = "sugimoto_deck_v1";
function loadDeckCache() {
  try {
    const d = JSON.parse(localStorage.getItem(DECK_KEY) || "null");
    // Older than three days is not worth showing as "today's" topics.
    if (!d || !Array.isArray(d.topics) || Date.now() - (d.at || 0) > 3 * 86400000) return [];
    return d.topics;
  } catch (_) {
    return [];
  }
}
function saveDeckCache(topics) {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify({ at: Date.now(), topics: topics.slice(-40) }));
  } catch (_) {}
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

// Mark a topic as seen ON THIS DEVICE — called when the user acts on a card
// (approve OR reject), never at load time. Topics the user never reaches stay
// unseen and can appear again.
function markSeenLocal(topic) {
  if (!topic) return;
  const seen = loadSeen();
  seen.push({ key: topicKey(topic), url: urlKey(topic), en: topic.title_en || topic.title_fa });
  saveSeen(seen);
}

// Reverse a local "seen" mark (used by Undo) so the card can be acted on again.
function unmarkSeenLocal(topic) {
  if (!topic) return;
  const k = topicKey(topic);
  const u = urlKey(topic);
  const seen = loadSeen().filter((s) => s.key !== k && (!u || s.url !== u));
  saveSeen(seen);
}

// Record a DECIDED topic (approved OR rejected) to the durable cross-device
// history (Google Sheet) so it never returns on any device. Only topics the
// user acted on are logged — never at generation time. Fire-and-forget.
async function recordSeenRemote(topic) {
  if (!topic) return;
  try {
    await fetch("/api/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
  } catch (_) {}
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

// ---- library: every generated script + article is kept here so approved
// content can be reused later. Stored in localStorage (instant, per-device) and
// mirrored to the Google Sheet when configured (durable, cross-device). ----
const LIB_KEY = "sugimoto_library_v1";

// De-dupe by id, keeping the newest record per id, newest-first.
function dedupeLibrary(list) {
  const map = new Map();
  for (const it of list) {
    if (!it || !it.id) continue;
    const prev = map.get(it.id);
    if (!prev || (it.ts || 0) >= (prev.ts || 0)) map.set(it.id, it);
  }
  return [...map.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function loadLibraryLocal() {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LIB_KEY) || "[]");
    return dedupeLibrary(Array.isArray(raw) ? raw : []);
  } catch (_) {
    return [];
  }
}

function saveLibraryLocal(list) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(dedupeLibrary(list).slice(0, 300)));
  } catch (_) {}
}

async function fetchLibraryRemote() {
  try {
    const res = await fetch("/api/library", { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (_) {
    return [];
  }
}

async function pushLibraryRemote(item) {
  try {
    await fetch("/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item }),
    });
  } catch (_) {}
}

export default function App() {
  const [topics, setTopics] = useState([]);
  const [index, setIndex] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loadingTopics, setLoadingTopics] = useState(true); // nothing on screen yet
  const [streaming, setStreaming] = useState(false); // new cards still arriving
  const [topicError, setTopicError] = useState(null);
  const [errDetail, setErrDetail] = useState("");
  const [deckStats, setDeckStats] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [view, setView] = useState("deck"); // deck | script
  const [scripts, setScripts] = useState({ fa: "", en: "" });
  const [scriptTopic, setScriptTopic] = useState(null);
  const [scriptError, setScriptError] = useState(null);
  const [scriptTab, setScriptTab] = useState("fa");
  const [copied, setCopied] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  // library — kept scripts + articles, browsable from the 📚 menu
  const [library, setLibrary] = useState([]);
  const [libFilter, setLibFilter] = useState("all");
  const [initialArticle, setInitialArticle] = useState(null);
  const [scriptReturn, setScriptReturn] = useState("deck"); // where "Back" goes

  // ---- background jobs --------------------------------------------------
  // The slow steps (scripts, Telegram, article, draft, Word file) run on the
  // SERVER as jobs; this page only starts them and checks on them. A phone
  // freezes a page the moment you switch apps, which used to freeze the whole
  // pipeline halfway. Now the work continues on the server, and this page
  // catches up when it wakes (see the visibility handler below).
  //   bg[topicKey][kind] = { id, kind, key, status, result, error, topic }
  const [bg, setBg] = useState({});
  const [dismissed, setDismissed] = useState({});
  const bgRef = useRef(bg);
  bgRef.current = bg;
  const handledRef = useRef(new Set());

  const patchJob = useCallback((key, kind, patch) => {
    setBg((prev) => {
      const cur = (prev[key] || {})[kind];
      if (!cur) return prev;
      return { ...prev, [key]: { ...prev[key], [kind]: { ...cur, ...patch } } };
    });
  }, []);

  const startJob = useCallback(async (kind, topic, extra = {}) => {
    const key = topicKey(topic);
    setDismissed((d) => ({ ...d, [key + ":" + kind]: false }));
    setBg((prev) => {
      const entry = { ...(prev[key] || {}) };
      // A new article makes any earlier draft/Word-file result stale.
      if (kind === "article") {
        delete entry.publish;
        delete entry.docfile;
      }
      entry[kind] = { id: null, kind, key, status: "running", result: null, error: "", topic, startedAt: Date.now() };
      return { ...prev, [key]: entry };
    });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, topic, ...extra }),
      });
      const data = await res.json();
      if (!res.ok || !data.job) throw new Error(data.error || "could not start");
      patchJob(key, kind, { id: data.job.id, startedAt: data.job.startedAt });
    } catch (e) {
      patchJob(key, kind, { status: "error", error: String(e.message || e) });
    }
  }, [patchJob]);

  // Apply what the server says about running jobs.
  const syncJobs = useCallback(async () => {
    const running = [];
    for (const key of Object.keys(bgRef.current)) {
      for (const j of Object.values(bgRef.current[key])) {
        if (j.status !== "running") continue;
        // A job whose start request never completed has no id to ask about.
        if (!j.id) {
          if (Date.now() - (j.startedAt || 0) > 25000) {
            patchJob(key, j.kind, { status: "error", error: "شروع نشد؛ دوباره امتحان کن." });
          }
          continue;
        }
        running.push(j);
      }
    }
    if (!running.length) return;
    let data;
    try {
      const res = await fetch("/api/jobs?ids=" + encodeURIComponent(running.map((j) => j.id).join(",")), { cache: "no-store" });
      data = await res.json();
    } catch (_) {
      return; // offline or the page is waking up: try again next tick
    }
    const byId = new Map((data.jobs || []).map((j) => [j.id, j]));
    for (const local of running) {
      const remote = byId.get(local.id);
      if (!remote) {
        if ((data.missing || []).includes(local.id)) {
          patchJob(local.key, local.kind, { status: "error", error: "سرور در حین کار ری‌استارت شد. دوباره امتحان کن." });
        }
        continue;
      }
      patchJob(local.key, local.kind, { status: remote.status, result: remote.result, error: remote.error });
      if (remote.status === "done" && !handledRef.current.has(remote.id)) {
        handledRef.current.add(remote.id);
        const t = local.topic || {};
        const base = {
          title_fa: t.title_fa, title_en: t.title_en, field: t.field, page: t.page,
          source_url: t.source_url || "", score: t.score || 0, why_now: t.why_now || "",
        };
        // The server already saved these to the shared Library; keep this
        // device's copy in step without writing the Sheet a second time.
        if (remote.kind === "script" && remote.result) {
          saveToLibrary({ ...base, id: "script:" + local.key, type: "script", script_fa: remote.result.fa, script_en: remote.result.en }, { remote: false });
        } else if (remote.kind === "article" && remote.result) {
          saveToLibrary({ ...base, id: "article:" + local.key, type: "article", article: remote.result.article }, { remote: false });
        }
      }
    }
  }, [patchJob]);

  // Unfinished jobs are remembered on this device so a reload (or the phone
  // discarding the page while you were away) can pick them back up. The restore
  // must run BEFORE anything is written: on first render bg is empty, and
  // saving that would wipe the very list being restored.
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sugimoto_jobs_v1") || "[]");
      if (Array.isArray(saved) && saved.length) {
        setBg((prev) => {
          const next = { ...prev };
          for (const j of saved) {
            if (!j || !j.id || !j.key || !j.kind) continue;
            next[j.key] = { ...(next[j.key] || {}), [j.kind]: { ...j, status: "running", result: null, error: "" } };
          }
          return next;
        });
      }
    } catch (_) {}
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      const open = [];
      for (const key of Object.keys(bg)) {
        for (const j of Object.values(bg[key])) {
          if (j.status === "running" && j.id) open.push({ id: j.id, kind: j.kind, key: j.key, topic: j.topic, startedAt: j.startedAt });
        }
      }
      localStorage.setItem("sugimoto_jobs_v1", JSON.stringify(open.slice(-20)));
    } catch (_) {}
  }, [bg]);

  const anyRunning = Object.values(bg).some((o) => Object.values(o).some((j) => j.status === "running"));
  useEffect(() => {
    if (!anyRunning) return;
    syncJobs();
    const t = setInterval(syncJobs, 2500);
    // Coming back to the page: ask straight away instead of waiting for a tick
    // (timers are paused while the page is in the background).
    const wake = () => { if (document.visibilityState === "visible") syncJobs(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    };
  }, [anyRunning, syncJobs]);

  // drag state
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(null); // 'left' | 'right' | null
  const startX = useRef(0);
  const cardRef = useRef(null);

  // undo history — lets you go back to the previous topic after reject/approve
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);

  // What was decided for each topic in this deck, so the list view can show
  // it and the card view can skip what was already handled from the list.
  const [decisions, setDecisions] = useState({}); // topicKey -> "approved" | "rejected"
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;
  const [deckMode, setDeckModeState] = useState("list"); // cards | list — list by default
  useEffect(() => {
    try {
      const m = localStorage.getItem("sugimoto_deck_mode_v2");
      if (m === "list" || m === "cards") setDeckModeState(m);
    } catch (_) {}
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
    setDecisions({});
  }, []);

  const pushHistory = () => {
    historyRef.current.push({ index, reviewedCount, approvedCount });
    setCanUndo(true);
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    // The card that was acted on is the one at the restored index — un-mark it
    // locally so it's available again.
    unmarkSeenLocal(topics[prev.index]);
    if (topics[prev.index]) {
      const k = topicKey(topics[prev.index]);
      setDecisions((d) => {
        const n = { ...d };
        delete n[k];
        return n;
      });
    }
    setExiting(null);
    setDx(0);
    setIndex(prev.index);
    setReviewedCount(prev.reviewedCount);
    setApprovedCount(prev.approvedCount);
    setView("deck");
    setCanUndo(historyRef.current.length > 0);
  };

  // Opening the app: the last deck saved on this device shows at once, and
  // new cards from the server are appended as each one is written, without
  // moving you off the card you are on. "Refresh" clears the deck and fills
  // it again card by card.
  const topicsRef = useRef(topics);
  topicsRef.current = topics;
  const afterRef = useRef(undefined);

  const loadTopics = useCallback(async (force = false) => {
    setTopicError(null);
    setErrDetail("");
    setUsingFallback(false);

    // A tab opened from "Next topic" carries ?after=<key of the card that was
    // showing>: it should open on the card after that one. Read once.
    if (afterRef.current === undefined) {
      afterRef.current = null;
      try {
        const after = new URLSearchParams(window.location.search).get("after");
        if (after) {
          afterRef.current = after;
          window.history.replaceState(null, "", window.location.pathname);
        }
      } catch (_) {}
    }

    const seen = loadSeen();
    const seenTitles = new Set(seen.map((s) => s.key));
    const seenUrls = new Set(seen.map((s) => s.url).filter(Boolean));
    const exclude = seen.map((s) => s.en || s.key).filter(Boolean).slice(-80);
    // Drop topics already ACTED ON (approved/rejected). Topics are NOT marked
    // seen just for appearing, so anything left stays available next time.
    const fresh = (t) => !isSeen(t, seenTitles, seenUrls);
    const same = (a, b) => topicKey(a) === topicKey(b) || (!!urlKey(a) && urlKey(a) === urlKey(b));

    let shown = 0;
    if (force) {
      // A refresh adds to the deck rather than wiping it: ideas not yet
      // decided stay, approved ones keep their state, and only declined ones
      // go. Undo history is cleared because row positions change.
      const keep = topicsRef.current.filter((t) => decisionsRef.current[topicKey(t)] !== "rejected");
      historyRef.current = [];
      setCanUndo(false);
      setTopics(keep);
      setIndex(nextUndecided(0));
      shown = keep.length;
      setLoadingTopics(keep.length === 0);
      setStreaming(true);
    } else if (!topicsRef.current.length) {
      const cached = loadDeckCache().filter(fresh);
      if (cached.length) {
        setTopics(cached);
        setIndex(0);
        setLoadingTopics(false);
        shown = cached.length;
      } else {
        setLoadingTopics(true);
      }
    } else {
      shown = topicsRef.current.length;
    }

    setStreaming(true);
    try {
      const r = await streamTopics(exclude, force, {
        onTopic: (t) => {
          if (!fresh(t)) return;
          setTopics((prev) => (prev.some((x) => same(x, t)) ? prev : [...prev, t]));
          shown++;
          setLoadingTopics(false);
        },
        onStats: (st) => st && setDeckStats(st),
      });
      setUpdatedAt(new Date());
      if (!shown) {
        if (r.error) throw new Error(r.error);
        setTopicError("خبر تازه‌ای که قبلاً ندیده باشی وجود نداره. اخبار مهاجرتی هر روز منتشر نمی‌شه — بعداً دوباره «Refresh» رو بزن.");
      }
    } catch (e) {
      // Cards already on screen stay; only an empty deck shows the error.
      if (!shown) {
        setUsingFallback(true);
        setTopicError("نتونستم اخبار تازه رو بیارم. دوباره «Refresh» رو بزن.");
        setErrDetail(String(e?.message || e));
      }
    } finally {
      setLoadingTopics(false);
      setStreaming(false);
    }
  }, [resetHistory]);

  // Keep this device's copy of the deck current, and honour ?after= once the
  // card it names has arrived (it may come later in the stream).
  useEffect(() => {
    if (!topics.length) return;
    saveDeckCache(topics);
    const after = afterRef.current;
    if (after) {
      const i = topics.findIndex((t) => (urlKey(t) || topicKey(t)) === after);
      if (i >= 0) {
        afterRef.current = null;
        setIndex(Math.min(i + 1, topics.length - 1));
      }
    }
  }, [topics]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  // Load the library: localStorage first (instant), then merge in the Sheet.
  useEffect(() => {
    const local = loadLibraryLocal();
    setLibrary(local);
    fetchLibraryRemote().then((remote) => {
      if (remote && remote.length) {
        const merged = dedupeLibrary([...local, ...remote]);
        setLibrary(merged);
        saveLibraryLocal(merged);
      }
    });
  }, []);

  const saveToLibrary = useCallback((item, { remote = true } = {}) => {
    const withTs = { ...item, ts: Date.now() };
    setLibrary((prev) => {
      const merged = dedupeLibrary([...prev, withTs]);
      saveLibraryLocal(merged);
      return merged;
    });
    if (remote) pushLibraryRemote(withTs);
  }, []);

  // Reopen a saved item in the script view (pulling the matching script AND
  // article for that topic so both are available).
  const openLibraryItem = useCallback(
    (item) => {
      const topicObj = {
        title_fa: item.title_fa,
        title_en: item.title_en,
        field: item.field,
        page: item.page,
        source_url: item.source_url || "",
        score: item.score || 0,
        why_now: item.why_now || "",
      };
      const key = topicKey(topicObj);
      const scriptItem = library.find((x) => x.type === "script" && x.id === "script:" + key);
      const articleItem = library.find((x) => x.type === "article" && x.id === "article:" + key);
      setScriptTopic(topicObj);
      setScripts(
        scriptItem
          ? { fa: scriptItem.script_fa || "", en: scriptItem.script_en || "" }
          : { fa: item.script_fa || "", en: item.script_en || "" }
      );
      setInitialArticle(articleItem ? articleItem.article : item.type === "article" ? item.article : null);
      setScriptError(null);
      setScriptTab("fa");
      setScriptReturn("library");
      setView("script");
    },
    [library]
  );

  const current = topics[index];

  const nextUndecided = (from) => {
    let i = from;
    while (i < topics.length && decisionsRef.current[topicKey(topics[i])]) i++;
    return i;
  };

  const advance = () => {
    setDx(0);
    setExiting(null);
    setIndex((i) => nextUndecided(i + 1));
  };

  const setDeckMode = (m) => {
    setDeckModeState(m);
    try {
      localStorage.setItem("sugimoto_deck_mode_v2", m);
    } catch (_) {}
    // Back to cards: continue from the first idea not handled in the list.
    if (m === "cards") setIndex(nextUndecided(0));
  };

  // A decision, from either view. Approving starts the server job that writes
  // the scripts; `open` shows them, which the list view skips so you can keep
  // going down the list while they are written.
  const approveTopic = (topic, { open = true } = {}) => {
    setReviewedCount((n) => n + 1);
    setApprovedCount((n) => n + 1);
    // Approved: remember it on this device AND in the durable cross-device
    // history (never repeat it — it's content you're making).
    markSeenLocal(topic);
    recordSeenRemote(topic);
    setDecisions((d) => ({ ...d, [topicKey(topic)]: "approved" }));
    if (open) {
      setScriptTopic(topic);
      setScripts({ fa: "", en: "" });
      setInitialArticle(null);
      setScriptError(null);
      setScriptTab("fa");
      setScriptReturn("deck");
      setView("script");
    }
    // The server writes the scripts, saves them to the Library and sends them
    // to Telegram. Nothing here waits, so leaving the app or moving on to the
    // next topic cannot interrupt it.
    startJob("script", topic, { topic });
  };

  const rejectTopic = (topic) => {
    // Rejecting is a decision too: remember it on this device AND in the durable
    // cross-device Sheet so it never returns anywhere.
    markSeenLocal(topic);
    recordSeenRemote(topic);
    setReviewedCount((n) => n + 1);
    setDecisions((d) => ({ ...d, [topicKey(topic)]: "rejected" }));
  };

  // List view only: put a rejected idea back. Like the card undo, this clears
  // it on this device; it may already be in the shared history.
  const restoreTopic = (topic) => {
    unmarkSeenLocal(topic);
    setReviewedCount((n) => Math.max(0, n - 1));
    setDecisions((d) => {
      const n = { ...d };
      delete n[topicKey(topic)];
      return n;
    });
  };

  const doReject = () => {
    if (exiting || !current) return;
    pushHistory();
    rejectTopic(current);
    setExiting("left");
    setTimeout(advance, 260);
  };

  const doApprove = () => {
    if (exiting || !current) return;
    pushHistory();
    approveTopic(current, { open: true });
    setExiting("right");
    setTimeout(advance, 260);
  };

  // Open a finished (or running) job from the "in progress" bar.
  const openJobTopic = (topic) => {
    setScriptTopic(topic);
    setScripts({ fa: "", en: "" });
    setInitialArticle(null);
    setScriptError(null);
    setScriptTab("fa");
    setScriptReturn("deck");
    setView("script");
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

  const navBtn = {
    height: 38, minWidth: 38, padding: "0 11px", borderRadius: 12, boxSizing: "border-box",
    background: C.surface, color: C.text, border: `1px solid ${C.line}`,
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap",
  };

  const wrap = {
    minHeight: "100vh",
    fontFamily: "'Inter', 'Vazirmatn', system-ui, sans-serif",
    color: C.text,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 16px 48px",
    boxSizing: "border-box",
  };

  // Column width: the list uses more room on a large screen, a single card
  // reads best narrow, and the script/library views sit in between.
  const colMax = view === "deck" ? (deckMode === "list" ? 720 : 460) : 600;

  // What the open topic's background jobs say. A job keeps its own result, so
  // this is correct however long the page was away.
  const svKey = scriptTopic ? topicKey(scriptTopic) : "";
  const svJobs = bg[svKey] || {};
  const sj = svJobs.script;
  const sjResult = sj && sj.result && (sj.result.fa || sj.result.en) ? sj.result : null;
  const viewScripts = sjResult ? { fa: sjResult.fa || "", en: sjResult.en || "" } : scripts;
  const viewLoading = !!sj && sj.status === "running" && !sjResult;
  const viewError =
    sj && sj.status === "error" && !(scripts.fa || scripts.en)
      ? "نوشتن سناریو با خطا مواجه شد. برگرد و دوباره تأیید کن."
      : scriptError;
  let viewTg = { state: "idle", msg: "" };
  if (svJobs.telegram) {
    const tj = svJobs.telegram;
    viewTg = { state: tj.status === "running" ? "sending" : tj.status === "done" ? "sent" : "error", msg: tj.error || "" };
  } else if (sjResult) {
    viewTg = {
      state: sj.status === "running" ? "sending" : sjResult.tg === "sent" ? "sent" : sjResult.tg === "error" ? "error" : "idle",
      msg: sjResult.tgMsg || "",
    };
  }

  // Work running or finished in the background, for the bar under the header.
  const bgRows = [];
  for (const key of Object.keys(bg)) {
    for (const kind of ["script", "article"]) {
      const j = bg[key][kind];
      if (!j || !j.topic) continue;
      if (dismissed[key + ":" + kind] && j.status !== "running") continue;
      if (view === "script" && key === svKey) continue; // that one is on screen already
      if (view === "deck" && deckMode === "list" && kind === "script") continue; // its row shows it
      bgRows.push(j);
    }
  }

  return (
    <div style={wrap}>
      {/* Header — frosted bar that stays put while you scroll */}
      <header
        className="ui-glass"
        style={{
          position: "sticky", top: 10, zIndex: 30, width: "100%", maxWidth: colMax, boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "9px 10px 9px 12px", marginBottom: 14, borderRadius: 18, border: `1px solid ${C.line}`,
          background: "rgba(255,255,255,0.86)", boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, overflow: "hidden" }}>
          <div aria-hidden style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: "grid", placeItems: "center", background: C.orange }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: "#fff", transform: "rotate(45deg)" }} />
          </div>
          <div style={{ minWidth: 0, lineHeight: 1.2, overflow: "hidden" }}>
            <div style={{ fontWeight: 700, letterSpacing: 1.2, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>SUGIMOTO</div>
            <div style={{ fontSize: 11.5, color: C.text3, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Topic Engine</div>
          </div>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setView(view === "library" ? "deck" : "library")}
            className="ui-btn"
            aria-label="Library"
            style={{
              ...navBtn, background: view === "library" ? alpha(C.orange, 0.18) : C.surface,
              border: `1px solid ${view === "library" ? alpha(C.orange, 0.55) : C.line}`,
            }}
          >
            📚 <span className="ui-wide">Library</span>
            {library.length > 0 && (
              <span style={{ background: C.orange, color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{library.length}</span>
            )}
          </button>
          <a href="/content-wizard" className="ui-btn" aria-label="Content Wizard" title="Content Wizard" style={{ ...navBtn, textDecoration: "none", color: C.text }}>
            ✨ <span className="ui-wide">Wizard</span>
          </a>
          <button
            onClick={() => loadTopics(true)}
            disabled={loadingTopics || streaming}
            className="ui-btn"
            aria-label="Refresh topics"
            title="Get fresh topics"
            style={{ ...navBtn, opacity: loadingTopics || streaming ? 0.6 : 1, cursor: loadingTopics || streaming ? "default" : "pointer" }}
          >
            <span className={loadingTopics || streaming ? "ui-spin" : ""} style={{ display: "inline-block" }}>⟳</span>
            <span className="ui-wide">{loadingTopics || streaming ? "Loading…" : "Refresh"}</span>
          </button>
        </nav>
      </header>

      <JobsBar
        width={colMax}
        rows={bgRows}
        onOpen={(j) => {
          setDismissed((d) => ({ ...d, [j.key + ":" + j.kind]: true }));
          openJobTopic(j.topic);
        }}
        onDismiss={(j) => setDismissed((d) => ({ ...d, [j.key + ":" + j.kind]: true }))}
        onRetry={(j) => startJob(j.kind, j.topic, { topic: j.topic })}
      />

      {/* Stat strip */}
      {view !== "library" && (
        <div style={{ width: "100%", maxWidth: colMax, display: "flex", gap: 8, marginBottom: 14 }}>
          <Stat label="Reviewed" value={reviewedCount} color={C.teal} icon="◉" />
          <Stat label="Approved" value={approvedCount} color={C.orange} icon="✓" />
          <Stat label="To review" value={topics.filter((t) => !decisions[topicKey(t)]).length} color="#6d5bd0" icon="☰" />
        </div>
      )}

      {view === "library" && (
        <LibraryView
          items={library}
          filter={libFilter}
          setFilter={setLibFilter}
          onOpen={openLibraryItem}
          onBack={() => setView("deck")}
        />
      )}

      {view === "deck" && (
        <div style={{ width: "100%", maxWidth: colMax, flex: 1, display: "flex", flexDirection: "column" }}>
          {topicError && (
            <div className="ui-fade" style={{ background: alpha(C.reject, 0.1), border: `1px solid ${alpha(C.reject, 0.35)}`, color: C.text, borderRadius: 14, padding: "11px 13px", fontSize: 12.5, marginBottom: 14, fontFamily: "'Vazirmatn', sans-serif", direction: "rtl", textAlign: "right" }}>
              {topicError}
              {errDetail && (
                <div dir="ltr" style={{ marginTop: 6, fontSize: 11, color: "rgba(18,26,36,0.7)", fontFamily: "monospace", textAlign: "left", wordBreak: "break-word" }}>
                  {errDetail}
                </div>
              )}
            </div>
          )}

          {!loadingTopics && <DeckWhy stats={deckStats} />}

          {!loadingTopics && topics.length > 0 && <ModeSwitch mode={deckMode} onChange={setDeckMode} />}

          {streaming && !loadingTopics && (
            <div dir="rtl" className="ui-progress ui-fade" style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 12, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, color: C.text }}>
              <span className="ui-pulse">⏳</span> موضوع‌های تازه در حال اضافه شدن به انتهای فهرست…
            </div>
          )}

          {deckMode === "list" && !loadingTopics && topics.length > 0 ? (
            <IdeasList
              topics={topics}
              decisions={decisions}
              jobs={bg}
              onApprove={(t) => approveTopic(t, { open: false })}
              onReject={rejectTopic}
              onRestore={restoreTopic}
              onOpenScript={(t) => {
                setDismissed((d) => ({ ...d, [topicKey(t) + ":script"]: true }));
                openJobTopic(t);
              }}
              onRetry={(t) => startJob("script", t, { topic: t })}
              onShowCard={(i) => {
                setDeckModeState("cards");
                try {
                  localStorage.setItem("sugimoto_deck_mode_v2", "cards");
                } catch (_) {}
                setIndex(i);
              }}
            />
          ) : (
          <>
          {!loadingTopics && topics.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <BackBtn onClick={() => setDeckMode("list")} label="List" />
              <span style={{ fontSize: 12, color: C.text3, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
                {Math.min(index + 1, topics.length)} / {topics.length}
              </span>
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
            <div style={{ display: "flex", gap: 18, marginTop: 24, justifyContent: "center", alignItems: "center" }}>
              <UndoBtn onClick={undo} disabled={!canUndo || !!exiting} />
              <ActionBtn kind="reject" onClick={doReject} disabled={!!exiting} />
              <ActionBtn kind="approve" onClick={doApprove} disabled={!!exiting} />
            </div>
          )}
          {!loadingTopics && current && topics[index + 1] && (
            // A real link: left-click skips to the next card without deciding
            // on this one (it stays unseen); right-click / middle-click opens
            // the deck in a new tab already positioned on the next card.
            <a
              href={"/?after=" + encodeURIComponent(urlKey(current) || topicKey(current))}
              onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (!exiting) advance();
              }}
              className="ui-btn ui-glass"
              style={{ display: "block", boxSizing: "border-box", textAlign: "center", textDecoration: "none", marginTop: 18, border: `1px solid ${alpha(C.orange, 0.4)}`, color: C.orange, borderRadius: 14, padding: "13px", fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}
            >
              Next topic →
            </a>
          )}
          {!loadingTopics && current && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11.5, color: C.text3 }}>
              Swipe the card, or use the buttons · ↶ undo · ← رد · تأیید →
            </div>
          )}
          </>
          )}
        </div>
      )}

      {view === "script" && scriptTopic && (
        <ScriptView
          key={"sv:" + topicKey(scriptTopic)}
          topic={scriptTopic}
          scripts={viewScripts}
          initialArticle={initialArticle}
          loading={viewLoading}
          error={viewError}
          tab={scriptTab}
          setTab={setScriptTab}
          copied={copied}
          onCopy={copy}
          onBack={() => { setView(scriptReturn === "library" ? "library" : "deck"); }}
          onUndo={undo}
          canUndo={canUndo && scriptReturn !== "library"}
          tgState={viewTg.state}
          tgMsg={viewTg.msg}
          onRetryTelegram={() => startJob("telegram", scriptTopic, { topic: scriptTopic, fa: viewScripts.fa, en: viewScripts.en })}
          articleJob={svJobs.article || null}
          publishJob={svJobs.publish || null}
          docJob={svJobs.docfile || null}
          onJob={(kind, extra) => startJob(kind, scriptTopic, { topic: scriptTopic, ...extra })}
        />
      )}
    </div>
  );
}

// Cards (swipe one at a time) or List (every idea's title at a glance).
function ModeSwitch({ mode, onChange }) {
  const idx = mode === "list" ? 1 : 0;
  return (
    <div style={{ position: "relative", display: "flex", padding: 3, borderRadius: 12, background: C.surfaceHi, border: `1px solid ${C.line}`, marginBottom: 14 }}>
      {/* sliding highlight under the active option */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 3, bottom: 3, left: 3, width: "calc(50% - 3px)", borderRadius: 9,
          background: C.surface, boxShadow: "0 1px 3px rgba(16,24,40,0.12)",
          transform: `translateX(${idx * 100}%)`, transition: "transform 0.28s cubic-bezier(.2,.8,.2,1)",
        }}
      />
      {[["cards", "🃏", "Cards"], ["list", "☰", "List"]].map(([m, ic, label]) => (
        <button
          key={m}
          className="ui-btn"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          style={{
            position: "relative", zIndex: 1, flex: 1, padding: "8px 10px", border: "none", background: "transparent",
            borderRadius: 9, cursor: "pointer", color: mode === m ? C.text : C.text3, fontWeight: 600, fontSize: 13,
            fontFamily: "'Inter', 'Vazirmatn', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          <span aria-hidden>{ic}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// Every idea in the deck as one compact row: title first, so the whole batch
// can be scanned in seconds. Approving here starts the script job without
// leaving the list; its progress shows in the row.
// Where an idea comes from, for the category filter. "Social" is any
// creator or community platform; everything else is a website (news, official
// pages, courts). Region comes from the card itself.
const SOCIAL_HOST = /(^|\.)(instagram\.com|youtube\.com|youtu\.be|reddit\.com|x\.com|twitter\.com|t\.me|tiktok\.com|facebook\.com|linkedin\.com)$/i;
function isSocialTopic(t) {
  if (t.social) return true;
  try {
    return SOCIAL_HOST.test(new URL(t.source_url || "").hostname);
  } catch (_) {
    return false;
  }
}
const CATEGORIES = [
  ["all", "همه", () => true],
  ["ca", "🇨🇦 کانادا", (t) => t.page !== "EU"],
  ["eu", "🇪🇺 اروپا", (t) => t.page === "EU"],
  ["social", "📱 شبکه‌های اجتماعی", (t) => isSocialTopic(t)],
  ["web", "🌐 سایت‌ها", (t) => !isSocialTopic(t)],
];

function IdeasList({ topics, decisions, jobs, onApprove, onReject, onRestore, onOpenScript, onRetry, onShowCard }) {
  const [filter, setFilter] = useState("all"); // all | pending | approved | rejected
  const [cat, setCat] = useState("all"); // see CATEGORIES
  const stateOf = (t) => decisions[topicKey(t)] || "pending";
  const inCat = CATEGORIES.find((c) => c[0] === cat)[2];
  const counts = { all: topics.length, pending: 0, approved: 0, rejected: 0 };
  for (const t of topics) counts[stateOf(t)]++;
  const catCounts = {};
  for (const [k, , test] of CATEGORIES) catCounts[k] = topics.filter(test).length;
  const rows = topics
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (filter === "all" || stateOf(t) === filter) && inCat(t));
  const TONE = { all: C.text, pending: C.teal, approved: C.success, rejected: C.reject };

  const chip = (k, label) => {
    const on = filter === k;
    return (
      <button
        key={k}
        className="ui-btn"
        onClick={() => setFilter(k)}
        style={{
          padding: "5px 9px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          border: `1px solid ${on ? alpha(TONE[k], 0.6) : C.line}`,
          background: on ? alpha(TONE[k], 0.14) : C.surface,
          color: on ? C.text : C.text2, fontSize: 11.5, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif",
          display: "inline-flex", alignItems: "center", gap: 5,
        }}
      >
        {label}
        <span style={{ minWidth: 18, padding: "0 5px", borderRadius: 99, background: alpha(TONE[k], on ? 0.3 : 0.14), color: on ? C.text : TONE[k], fontSize: 11, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
          {counts[k]}
        </span>
      </button>
    );
  };
  const smallBtn = (label, onClick, kind, aria) => (
    <button
      onClick={onClick}
      aria-label={aria}
      className={"ui-btn" + (kind === "primary" ? " ui-glow-orange" : kind === "danger" ? " ui-glow-danger" : "")}
      style={{
        minWidth: 36, height: 36, padding: "0 11px", borderRadius: 11, cursor: "pointer",
        border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? alpha(C.reject, 0.5) : C.line}`,
        background: kind === "primary" ? C.orange : kind === "success" ? alpha(C.success, 0.16) : "transparent",
        color: kind === "primary" ? "#fff" : kind === "danger" ? C.reject : kind === "success" ? C.success : C.text,
        fontWeight: 700, fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div dir="rtl" style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
        {chip("all", "همه")}
        {chip("pending", "در انتظار")}
        {chip("approved", "تأیید شده")}
        {chip("rejected", "رد شده")}
      </div>
      <div dir="rtl" style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
        {CATEGORIES.map(([k, label]) => {
          const on = cat === k;
          return (
            <button
              key={k}
              className="ui-btn"
              onClick={() => setCat(k)}
              style={{
                padding: "5px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                border: `1px solid ${on ? C.text : C.line}`, background: on ? C.text : C.surface,
                color: on ? "#fff" : C.text2, fontSize: 11.5, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif",
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              {label}
              <span style={{ minWidth: 16, padding: "0 4px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.surfaceHi, fontSize: 10.5, fontFamily: "'Inter', sans-serif" }}>
                {catCounts[k]}
              </span>
            </button>
          );
        })}
      </div>

      {!rows.length && (
        <div dir="rtl" className="ui-glass" style={{ textAlign: "center", padding: "30px 0", borderRadius: 16, border: `1px dashed ${C.line}`, color: C.text2, fontFamily: "'Vazirmatn', sans-serif", fontSize: 13 }}>
          موردی در این دسته نیست.
        </div>
      )}

      <div style={{ display: "grid", gap: 7 }}>
        {rows.map(({ t, i }, n) => {
          const st = stateOf(t);
          const f = fieldOf(t);
          const job = (jobs[topicKey(t)] || {}).script;
          const date = formatNewsDate(t.date);
          const score = Number(t.score) || 0;
          const scoreColor = score >= 85 ? C.orange : score >= 70 ? "#d97706" : C.text2;
          return (
            <div
              key={topicKey(t) + i}
              dir="rtl"
              className="ui-glass ui-lift ui-fade"
              style={{
                position: "relative", overflow: "hidden", animationDelay: `${Math.min(n, 14) * 28}ms`,
                display: "flex", gap: 10, alignItems: "center", padding: "10px 14px 10px 10px", borderRadius: 14,
                background: st === "approved" ? alpha(C.success, 0.07) : C.surface,
                border: `1px solid ${st === "approved" ? alpha(C.success, 0.35) : C.line}`,
                opacity: st === "rejected" ? 0.45 : 1,
              }}
            >
              {/* topic-type color stripe on the reading-start edge */}
              <div aria-hidden style={{ position: "absolute", top: 8, bottom: 8, right: 0, width: 3, borderRadius: "3px 0 0 3px", background: f.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={() => st === "pending" && onShowCard(i)}
                  title={(t.title_en ? t.title_en + " — " : "") + (st === "pending" ? "open as a card" : "")}
                  style={{
                    fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 14, lineHeight: 1.5,
                    color: C.text, cursor: st === "pending" ? "pointer" : "default",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    textDecoration: st === "rejected" ? "line-through" : "none",
                  }}
                >
                  {t.title_fa || t.title_en}
                </div>
                <div dir="ltr" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: "3px 8px", marginTop: 5, fontSize: 11, color: C.text2, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
                  <span style={{ color: f.color, background: alpha(f.color, 0.13), borderRadius: 99, padding: "1px 8px", fontWeight: 600 }}>
                    {f.emoji} {f.label}
                  </span>
                  {date && <span>{date}</span>}
                  {t.source_url && (
                    <a href={t.source_url} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, textDecoration: "none" }}>
                      {sourceHost(t.source_url)} ↗
                    </a>
                  )}
                  {t.grounding === "headline" && (
                    <span style={{ color: C.orange, border: `1px solid ${alpha(C.orange, 0.5)}`, borderRadius: 99, padding: "0 6px" }}>headline only</span>
                  )}
                  {t.coverage > 1 && (
                    <span title={"Also covered by: " + (t.outlets || []).join(", ")} style={{ color: "#c2410c", background: alpha("#f97316", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>🔥 {t.coverage} sources</span>
                  )}
                  {t.newsletter === "lexbase" && (
                    <span title={"From the Lexbase newsletter" + (t.citation ? " — " + t.citation : "")} style={{ color: "#6d5bd0", background: alpha("#6d5bd0", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>📬 Lexbase</span>
                  )}
                  {t.social === "instagram" && (
                    <span title="From a creator's Instagram post — check the claim before scripting" style={{ color: "#c13584", background: alpha("#c13584", 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 600 }}>📸 @{t.author}</span>
                  )}
                  <span style={{ color: scoreColor, background: alpha(scoreColor === C.text2 ? C.text : scoreColor, 0.12), borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>{score}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                {st === "pending" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {smallBtn("✓", () => onApprove(t), "primary", "Approve topic")}
                    {smallBtn("✕", () => onReject(t), "danger", "Reject topic")}
                  </div>
                )}
                {st === "approved" &&
                  (job && job.status === "running" ? (
                    <span className="ui-pulse" style={{ fontSize: 11.5, color: C.orange, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap" }}>⏳ در حال نوشتن</span>
                  ) : job && job.status === "error" ? (
                    smallBtn("⚠ دوباره", () => onRetry(t), "danger", "Retry")
                  ) : (
                    smallBtn("باز کن ✓", () => onOpenScript(t), "success", "Open script")
                  ))}
                {st === "rejected" && smallBtn("↶", () => onRestore(t), "ghost", "Restore topic")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Work that is running (or just finished) on the server for topics you have
// already moved on from. Tap a finished one to open it.
function JobsBar({ rows, onOpen, onDismiss, onRetry, width = 460 }) {
  if (!rows.length) return null;
  const KIND = { script: "سناریو", article: "مقاله" };
  return (
    <div style={{ width: "100%", maxWidth: width, marginBottom: 12, display: "grid", gap: 8 }}>
      {rows.map((j) => {
        const running = j.status === "running";
        const failed = j.status === "error";
        const tone = running ? C.orange : failed ? C.reject : C.success;
        const writing = j.kind === "script" && running && j.result && (j.result.fa || j.result.en);
        return (
          <div
            key={j.key + ":" + j.kind}
            dir="rtl"
            className={"ui-glass ui-fade" + (running ? " ui-progress" : "")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", borderRadius: 14,
              border: `1px solid ${alpha(tone, 0.35)}`, background: alpha(tone, 0.08),
              fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, color: C.text,
            }}
          >
            <span aria-hidden className={running ? "ui-pulse" : ""} style={{ width: 30, height: 30, borderRadius: 9, background: alpha(tone, 0.18), display: "grid", placeItems: "center", flexShrink: 0 }}>
              {running ? "⏳" : failed ? "⚠️" : "✓"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: tone }}>
                {running
                  ? writing ? "سناریو نوشته شد، در حال ارسال به تلگرام…" : `در حال نوشتن ${KIND[j.kind]}…`
                  : failed ? `${KIND[j.kind]} نشد` : `${KIND[j.kind]} آماده است`}
              </div>
              <div style={{ color: C.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {j.topic.title_fa || j.topic.title_en}
              </div>
            </div>
            {!running && !failed && (
              <button className="ui-btn" onClick={() => onOpen(j)} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 10, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif" }}>
                باز کن
              </button>
            )}
            {failed && (
              <button className="ui-btn" onClick={() => onRetry(j)} style={{ background: "transparent", color: C.text, border: `1px solid ${alpha(C.reject, 0.5)}`, borderRadius: 10, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif" }}>
                دوباره
              </button>
            )}
            {!running && (
              <button className="ui-btn" onClick={() => onDismiss(j)} aria-label="close" style={{ background: "transparent", color: C.text3, border: "none", fontSize: 18, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value, color = C.text, icon }) {
  return (
    <div className="ui-glass" style={{ flex: 1, position: "relative", overflow: "hidden", border: `1px solid ${C.line}`, borderRadius: 16, padding: "12px 12px 11px" }}>
      <div style={{ position: "absolute", top: 0, left: 12, right: 12, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
        <div aria-hidden style={{ width: 26, height: 26, borderRadius: 8, background: alpha(color, 0.16), color, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.text3, marginTop: 8, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function heat(score) {
  return Math.max(0, Math.min(100, score));
}

// One line explaining where this deck came from, so a short deck explains
// itself: how big the pool was, how much of it you had already used, and how
// fresh the harvest is. Tap to see the full breakdown.
function DeckWhy({ stats }) {
  if (!stats) return null;
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!Number.isFinite(m)) return "";
    return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
  const src = stats.harvest
    ? `harvested ${ago(stats.harvest.at)}`
    : stats.liveFetch && !stats.liveFetch.failed
      ? `live: ${stats.liveFetch.feedsOk}/${stats.liveFetch.feedsTotal} feeds`
      : "no source reachable";
  const full = (stats.written || 0) - (stats.headlineOnly || 0);
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
  return (
    <details className="ui-glass" style={{ fontSize: 11.5, color: C.text2, fontFamily: "'Inter', 'Vazirmatn', sans-serif", marginBottom: 12, direction: "ltr", border: `1px solid ${C.line}`, borderRadius: 12, padding: "8px 12px" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, boxShadow: `0 0 0 3px ${alpha(C.success, 0.2)}`, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <b style={{ color: C.text }}>{stats.eligible ?? 0}</b> fresh topics · <b style={{ color: C.text }}>{stats.written ?? 0}</b> cards ({full} full text) · {src}
        </span>
        <span aria-hidden style={{ color: C.text3 }}>▾</span>
      </summary>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}`, display: "grid", gap: 3 }}>
        {row("Articles in pool", stats.pool ?? 0)}
        {row("…of which Instagram posts", stats.socialPosts ?? 0)}
        {row("…of which Lexbase items", stats.newsletterItems ?? 0)}
        {row("Already approved or rejected", stats.alreadyUsed ?? 0)}
        {row("Off-topic or draw results", stats.offTopic ?? 0)}
        {row("Untrusted sources dropped", stats.untrusted ?? 0)}
        {row("Same story, other outlet", stats.duplicateStories ?? 0)}
        {row("Fresh candidates", stats.eligible ?? 0)}
        {row("Chosen by the editor model", stats.selected ?? 0)}
        {row("Cards written", stats.written ?? 0)}
        {row("…headline only (check source)", stats.headlineOnly ?? 0)}
      </div>
    </details>
  );
}

function sourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return url;
  }
}

// Format a news topic's "YYYY-MM-DD" publication date as e.g. "Jul 22, 2026".
// Returns "" for evergreen topics (no/empty/invalid date).
function formatNewsDate(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (_) {
    return d;
  }
}

function TopicCard({ topic, likeOp = 0, nopeOp = 0, ghost }) {
  const f = fieldOf(topic);
  const isEU = topic.page === "EU";
  const pill = {
    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
    fontFamily: "'Inter', 'Vazirmatn', sans-serif", direction: "ltr", borderRadius: 99, padding: "4px 10px",
    background: "rgba(255,255,255,0.55)", border: `1px solid ${C.textEdge}`, color: C.inkSoft, textDecoration: "none",
  };
  return (
    <div style={{
      height: "100%", background: C.surface, borderRadius: 22,
      border: `1px solid ${C.textEdge}`,
      boxShadow: ghost ? "none" : "0 1px 2px rgba(16,24,40,0.04), 0 18px 40px -24px rgba(16,24,40,0.25)",
      padding: "24px 22px 18px", boxSizing: "border-box", display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden", userSelect: "none",
    }}>
      {/* accent band and a soft glow in this topic type's color */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: f.color }} />

      {!ghost && (
        <>
          <Stamp text="تأیید" color={C.orange} op={likeOp} side="left" />
          <Stamp text="رد" color={C.reject} op={nopeOp} side="right" />
        </>
      )}

      {/* tags */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: alpha(f.color, 0.16), border: `1px solid ${alpha(f.color, 0.35)}`, padding: "5px 11px", borderRadius: 99 }}>
          <span style={{ fontSize: 13 }}>{f.emoji}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>{f.label}</span>
        </div>
        <div style={{ ...pill, color: isEU ? "#3a56c4" : C.orangeDeep, fontWeight: 700 }}>
          {isEU ? "🇪🇺 Europe" : "🇨🇦 Canada"}
        </div>
      </div>

      {/* Farsi hook */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", padding: "14px 0" }}>
        <div dir="rtl" style={{
          fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, color: C.ink,
          fontSize: 26, lineHeight: 1.55, textAlign: "right", unicodeBidi: "plaintext", letterSpacing: -0.2,
        }}>
          {topic.title_fa}
        </div>
        {topic.title_en && (
          <div style={{ marginTop: 10, fontSize: 13.5, color: C.inkSoft, fontFamily: "'Inter', 'Vazirmatn', sans-serif", fontWeight: 500, lineHeight: 1.45 }}>
            {topic.title_en}
          </div>
        )}
      </div>

      {/* why now */}
      <div dir="rtl" style={{ position: "relative", background: C.surfaceHi, borderRight: `3px solid ${f.color}`, borderRadius: 12, padding: "10px 12px" }}>
        <div style={{ fontSize: 10.5, letterSpacing: 0.5, color: C.inkSoft, fontFamily: "'Vazirmatn', sans-serif", fontWeight: 700, marginBottom: 3 }}>
          چرا الان
        </div>
        <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, lineHeight: 1.75, color: C.text2, textAlign: "right", unicodeBidi: "plaintext" }}>
          {topic.why_now}
        </div>
      </div>

      {/* meta + heat */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {topic.source_url && (
            <a
              href={topic.source_url}
              target="_blank"
              rel="noopener noreferrer"
              // Stop the card's drag handler from swallowing the tap so the link
              // actually opens (in a new tab) instead of starting a swipe.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{ ...pill, color: "#1f6f7a", cursor: "pointer" }}
            >
              🔗 {sourceHost(topic.source_url)} ↗
            </a>
          )}
          {formatNewsDate(topic.date) && <span style={pill}>📅 {formatNewsDate(topic.date)}</span>}
          {topic.coverage > 1 && (
            <span title={"Also covered by: " + (topic.outlets || []).join(", ")} style={{ ...pill, color: "#c2410c", background: alpha("#f97316", 0.1), border: `1px solid ${alpha("#f97316", 0.35)}`, fontWeight: 700 }}>
              🔥 {topic.coverage} sources
            </span>
          )}
          {topic.newsletter === "lexbase" && (
            <span title={"From the Lexbase newsletter" + (topic.citation ? " — " + topic.citation : "")} style={{ ...pill, color: "#6d5bd0", background: alpha("#6d5bd0", 0.08), border: `1px solid ${alpha("#6d5bd0", 0.3)}`, fontWeight: 700 }}>
              📬 Lexbase{topic.citation ? " · " + topic.citation : ""}
            </span>
          )}
          {topic.social === "instagram" && (
            <span title="From a creator's Instagram post — check the claim before scripting" style={{ ...pill, color: "#c13584", background: alpha("#c13584", 0.08), border: `1px solid ${alpha("#c13584", 0.3)}` }}>
              📸 @{topic.author}
            </span>
          )}
          {topic.grounding === "headline" && (
            <span
              title="Only the headline could be read for this one. Open the source and check it before writing a script."
              style={{ ...pill, color: C.orangeDeep, background: alpha(C.orange, 0.1), border: `1px solid ${alpha(C.orange, 0.45)}` }}
            >
              headline only
            </span>
          )}
        </div>
        <ScoreRing score={topic.score} />
      </div>
    </div>
  );
}

// Engagement score as a small ring: warmer and fuller the hotter the topic.
function ScoreRing({ score, size = 46 }) {
  const v = heat(Number(score) || 0);
  const color = v >= 85 ? C.orange : v >= 70 ? "#d97706" : C.inkSoft;
  return (
    <div title={`Engagement potential ${v}/100`} style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(${color} ${v * 3.6}deg, rgba(22,38,44,0.1) 0)`, display: "grid", placeItems: "center" }}>
      <div style={{ width: size - 8, height: size - 8, borderRadius: "50%", background: C.surface, display: "grid", placeItems: "center", fontFamily: "'Inter', 'Vazirmatn', sans-serif", fontWeight: 700, fontSize: 14, color: C.ink }}>
        {v}
      </div>
    </div>
  );
}

function Stamp({ text, color, op, side }) {
  return (
    <div style={{
      position: "absolute", top: 28, [side]: 22, zIndex: 3,
      border: `3px solid ${color}`, color: color, borderRadius: 12,
      padding: "4px 14px", fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 21,
      transform: `rotate(${side === "left" ? -14 : 14}deg)`, opacity: op, transition: "opacity 0.1s",
      pointerEvents: "none", background: "rgba(255,255,255,0.9)",
    }}>
      {text}
    </div>
  );
}

function ActionBtn({ kind, onClick, disabled }) {
  const approve = kind === "approve";
  const size = approve ? 74 : 62;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={approve ? "Approve topic" : "Reject topic"}
      className={"ui-btn " + (approve ? "ui-glow-orange" : "ui-glow-danger")}
      style={{
        width: size, height: size, borderRadius: "50%", cursor: disabled ? "default" : "pointer",
        border: approve ? "none" : `1.5px solid ${alpha(C.reject, 0.45)}`,
        background: approve ? C.orange : C.surface,
        color: approve ? "#fff" : C.reject, fontSize: approve ? 30 : 24, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: approve ? `0 10px 24px -10px ${alpha(C.orange, 0.6)}` : "0 1px 2px rgba(16,24,40,0.06)",
        opacity: disabled ? 0.5 : 1,
      }}
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
      className="ui-btn ui-glass"
      style={{
        width: 48, height: 48, borderRadius: "50%", cursor: disabled ? "default" : "pointer",
        border: `1px solid ${C.line}`, color: C.text, fontSize: 20,
        display: "flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1,
      }}
    >
      ↶
    </button>
  );
}

function CardSkeleton() {
  const bar = (w, h = 14, mt = 10) => <div className="ui-skeleton" style={{ width: w, height: h, marginTop: mt, marginLeft: "auto" }} />;
  return (
    <div className="ui-glass" style={{ height: 520, border: `1px solid ${C.line}`, borderRadius: 24, padding: 24, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="ui-skeleton" style={{ width: 96, height: 26, borderRadius: 99 }} />
        <div className="ui-skeleton" style={{ width: 80, height: 26, borderRadius: 99 }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {bar("92%", 22, 0)}
        {bar("74%", 22)}
        {bar("48%", 14, 16)}
      </div>
      <div className="ui-skeleton" style={{ height: 64, borderRadius: 12 }} />
      <div dir="rtl" style={{ textAlign: "center", marginTop: 14, fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, color: C.text2 }}>
        <span className="ui-pulse">در حال بررسی اخبار ۳۰ روز اخیر…</span>
      </div>
    </div>
  );
}

function EmptyDeck({ onRefresh }) {
  return (
    <div className="ui-glass ui-fade" style={{ height: 480, border: `1px dashed ${alpha(C.text, 0.18)}`, borderRadius: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 24 }}>
      <div style={{ width: 76, height: 76, borderRadius: 24, display: "grid", placeItems: "center", fontSize: 34, background: alpha(C.orange, 0.1), border: `1px solid ${C.line}` }}>
        🎬
      </div>
      <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 16, fontWeight: 700, direction: "rtl", color: C.text }}>
        همهٔ موضوعات این دسته رو دیدی
      </div>
      <button className="ui-btn ui-glow-orange" onClick={onRefresh} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 14, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
        ⟳ Get a fresh batch
      </button>
    </div>
  );
}

// Render script text line-by-line with automatic per-line direction, so mixed
// Farsi + English lines don't get visually scrambled by a single forced base
// direction. Each line resolves its own direction from its first strong char
// and aligns to that direction.
function ScriptBody({ text, tab }) {
  const font = tab === "fa" ? "'Vazirmatn', sans-serif" : "'Inter', 'Vazirmatn', sans-serif";
  const lines = (text || " ").split("\n");
  return (
    <div style={{ fontFamily: font, fontSize: 14, lineHeight: 2, color: C.text }}>
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
          {line || " "}
        </div>
      ))}
    </div>
  );
}

function ScriptView({ topic, scripts, initialArticle, loading, error, tab, setTab, copied, onCopy, onBack, onUndo, canUndo, tgState = "idle", tgMsg = "", onRetryTelegram, articleJob, publishJob, docJob, onJob }) {
  const f = fieldOf(topic);
  const active = tab === "fa" ? scripts.fa : scripts.en;

  // Blog article (on-demand). It is written by a server-side job, so this view
  // only reflects that job's state: leaving the page, or opening another
  // topic, does not interrupt it, and coming back shows where it got to.
  // Seeded from a saved item when opened via Library.
  const artState = articleJob
    ? articleJob.status === "running" ? "generating" : articleJob.status === "error" ? "error" : "ready"
    : initialArticle ? "ready" : "idle"; // idle | generating | ready | error
  const article =
    articleJob && articleJob.status === "done" && articleJob.result ? articleJob.result.article : initialArticle || null;
  const artMsg = (articleJob && articleJob.error) || "";
  const pubState = publishJob
    ? publishJob.status === "running" ? "publishing" : publishJob.status === "error" ? "error" : "done"
    : "idle"; // idle | publishing | done | error
  const pubMsg = (publishJob && publishJob.error) || "";
  const editLink = (publishJob && publishJob.status === "done" && publishJob.result && publishJob.result.edit_link) || "";

  const generateArticle = () => {
    if (artState === "generating") return;
    onJob("article", {});
  };

  const publishArticle = () => {
    if (!article || pubState === "publishing") return;
    onJob("publish", { article });
  };

  // Word file from the article — generated ENTIRELY in the app (no Google
  // account, no Apps Script, no config). Download locally and/or send the file
  // to the Telegram review channel.
  const [docLocal, setDocLocal] = useState("idle"); // idle | downloaded | error
  const [docLocalMsg, setDocLocalMsg] = useState("");
  const docState =
    docLocal !== "idle"
      ? docLocal
      : docJob
        ? docJob.status === "running" ? "sending" : docJob.status === "error" ? "error" : "sent"
        : "idle"; // idle | sending | sent | downloaded | error
  const docMsg = docLocal === "error" ? docLocalMsg : (docJob && docJob.error) || "";

  const buildDocHtml = () => {
    if (!article) return "";
    return (
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
      '<head><meta charset="utf-8"></head>' +
      '<body dir="rtl" style="text-align:right;font-family:Arial,sans-serif;line-height:1.8">' +
      "<h1>" + (article.title_fa || "") + "</h1>" +
      (article.content_html || "") +
      "</body></html>"
    );
  };

  const docFileName = () => ((article && (article.slug || "article")) + ".doc");

  // Download as a Word-compatible .doc — pure client-side, works offline of
  // any backend or Google service. Opens in Word and imports into Google Docs.
  const downloadDoc = () => {
    if (!article) return;
    try {
      const blob = new Blob(["﻿", buildDocHtml()], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setDocLocal("downloaded");
      setTimeout(() => setDocLocal("idle"), 2500);
    } catch (e) {
      setDocLocal("error");
      setDocLocalMsg(String(e.message || e));
    }
  };

  // Send the Word file to the Telegram review channel (uses the existing bot).
  // A server job, like the rest, so it survives leaving the page.
  const sendDocToTelegram = () => {
    if (!article || docState === "sending") return;
    setDocLocal("idle");
    onJob("docfile", { article });
  };

  return (
    <div style={{ width: "100%", maxWidth: 600, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <BackBtn onClick={onBack} label="Back to deck" />
        {canUndo && (
          <button onClick={onUndo} className="ui-btn ui-glass" style={{ color: C.text, border: `1px solid ${C.line}`, borderRadius: 99, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
            ↶ Undo (previous topic)
          </button>
        )}
      </div>

      <div className="ui-fade" style={{ position: "relative", overflow: "hidden", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: "18px 18px 16px", marginBottom: 14, boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
        <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: f.color }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: alpha(f.color, 0.16), border: `1px solid ${alpha(f.color, 0.35)}`, borderRadius: 99, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, color: C.ink, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
            {f.emoji} {f.label}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: topic.page === "EU" ? C.slate : C.orangeDeep }}>{topic.page === "EU" ? "🇪🇺 Europe" : "🇨🇦 Canada"}</span>
        </div>
        <div dir="rtl" style={{ fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 18, color: C.ink, textAlign: "right", lineHeight: 1.6, unicodeBidi: "plaintext" }}>
          {topic.title_fa}
        </div>
        {topic.source_url && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <a
              href={topic.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12.5, fontWeight: 600, color: "#fff",
                fontFamily: "'Inter', 'Vazirmatn', sans-serif", textDecoration: "none",
                direction: "ltr", background: C.teal, border: "none",
                borderRadius: 10, padding: "8px 13px",
              }}
            >
              🔗 Read the source: {sourceHost(topic.source_url)} ↗
            </a>
            {formatNewsDate(topic.date) && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: C.inkSoft, fontFamily: "'Inter', 'Vazirmatn', sans-serif", direction: "ltr" }}>
                📅 {formatNewsDate(topic.date)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Tab active={tab === "fa"} onClick={() => setTab("fa")} label="سناریو فارسی" />
        <Tab active={tab === "en"} onClick={() => setTab("en")} label="English script" />
      </div>

      <div className="ui-glass" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, minHeight: 300 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 260, gap: 14 }}>
            <div className="ui-spin" style={{ width: 30, height: 30, border: `3px solid ${alpha(C.text, 0.15)}`, borderTopColor: C.orange, borderRightColor: C.teal, borderRadius: "50%" }} />
            <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, color: "rgba(18,26,36,0.6)", direction: "rtl" }}>در حال نوشتن سناریوی فارسی و انگلیسی…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13.5, color: C.reject, direction: "rtl", textAlign: "right" }}>{error}</div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: tab === "fa" ? "flex-start" : "flex-end", marginBottom: 12 }}>
              <button className="ui-btn" onClick={() => onCopy(tab)} style={{ background: copied === tab ? C.success : alpha(C.orange, 0.14), color: copied === tab ? "#06281c" : C.orange, border: `1px solid ${copied === tab ? C.success : alpha(C.orange, 0.4)}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
                {copied === tab ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <ScriptBody text={active} tab={tab} />
          </div>
        )}
      </div>

      {/* Telegram — sent AUTOMATICALLY on approve; this only reports status. */}
      {!loading && !error && tgState !== "idle" && (
        <div
          style={{
            marginTop: 16,
            background: alpha(tgState === "error" ? C.reject : tgState === "sent" ? C.success : C.teal, 0.1),
            border: `1px solid ${alpha(tgState === "error" ? C.reject : tgState === "sent" ? C.success : C.teal, 0.4)}`,
            borderRadius: 14,
            padding: "12px",
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: "'Inter', 'Vazirmatn', sans-serif",
            color: C.text,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span>
            {tgState === "sending"
              ? "✈ در حال ارسال خودکار به تلگرام…"
              : tgState === "sent"
              ? "✓ به‌صورت خودکار به تلگرام ارسال شد"
              : "⚠️ ارسال خودکار به تلگرام ناموفق بود"}
          </span>
          {tgState === "error" && (
            <>
              <span style={{ fontSize: 11, color: C.reject, direction: "ltr", fontWeight: 500 }}>{tgMsg}</span>
              {onRetryTelegram && (
                <button
                  onClick={onRetryTelegram}
                  style={{ alignSelf: "center", background: "transparent", color: C.text, border: `1px solid ${C.slate}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}
                >
                  دوباره تلاش کن
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Blog article (on-demand) */}
      {!loading && !error && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          {artState !== "ready" && (
            <button
              onClick={generateArticle}
              disabled={artState === "generating"}
              className={"ui-btn" + (artState === "generating" ? " ui-progress" : "")}
              style={{
                width: "100%", background: alpha(C.teal, 0.12), color: C.text,
                border: `1px solid ${alpha(C.teal, 0.4)}`, borderRadius: 12, padding: "12px",
                fontWeight: 600, fontSize: 14, cursor: artState === "generating" ? "default" : "pointer",
                opacity: artState === "generating" ? 0.6 : 1, fontFamily: "'Inter', 'Vazirmatn', sans-serif",
              }}
            >
              {artState === "generating" ? "در حال نوشتن مقاله…" : artState === "error" ? "دوباره امتحان کن" : "📝 ساخت مقاله وبلاگ (Blog article)"}
            </button>
          )}
          {artState === "error" && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, direction: "ltr", textAlign: "center", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>{artMsg}</div>
          )}

          {artState === "ready" && article && (
            <div>
              <style>{`
                .article-preview h2{font-size:15px;font-weight:800;margin:14px 0 6px;color:#22343b}
                .article-preview h3{font-size:13.5px;font-weight:700;margin:10px 0 4px;color:#32515d}
                .article-preview p{margin:0 0 8px}
                .article-preview ul{margin:0 8px 8px 0;padding-right:18px}
                .article-preview li{margin:0 0 4px}
                .article-preview a{color:#d9600a;text-decoration:underline}
                .article-preview strong{color:#22343b}
              `}</style>
              {/* SEO meta line */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 11, fontFamily: "'Inter', 'Vazirmatn', sans-serif", color: "rgba(18,26,36,0.6)" }}>
                {article.focus_keyword && <span dir="rtl" style={{ background: alpha(C.teal, 0.14), color: C.teal, borderRadius: 99, padding: "3px 10px", fontFamily: "'Vazirmatn', sans-serif", fontWeight: 600 }}>🔑 {article.focus_keyword}</span>}
                {!article.parse_ok && <span style={{ color: C.orange }}>⚠️ خروجی ناقص — قبل از انتشار بررسی کن</span>}
              </div>

              {/* Article preview */}
              <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px", maxHeight: 360, overflowY: "auto" }}>
                <div dir="rtl" style={{ fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 18, color: C.ink, lineHeight: 1.6, marginBottom: 10, unicodeBidi: "plaintext" }}>
                  {article.title_fa}
                </div>
                <div
                  dir="rtl"
                  className="article-preview"
                  style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13.5, lineHeight: 1.9, color: "#2f3f45", textAlign: "right" }}
                  dangerouslySetInnerHTML={{ __html: article.content_html }}
                />
              </div>

              {/* Publish */}
              {pubState !== "done" ? (
                <button
                  onClick={publishArticle}
                  disabled={pubState === "publishing"}
                  style={{
                    width: "100%", marginTop: 12,
                    background: C.orange,
                    color: "#fff", border: "none", borderRadius: 12, padding: "13px",
                    fontWeight: 700, fontSize: 14, cursor: pubState === "publishing" ? "default" : "pointer",
                    opacity: pubState === "publishing" ? 0.6 : 1, fontFamily: "'Inter', 'Vazirmatn', sans-serif",
                  }}
                >
                  {pubState === "publishing" ? "در حال ساخت پیش‌نویس…" : pubState === "error" ? "دوباره امتحان کن — انتشار پیش‌نویس" : "⬆ انتشار پیش‌نویس در سایت (Publish draft)"}
                </button>
              ) : (
                <a
                  href={editLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block", marginTop: 12, textAlign: "center",
                    background: alpha(C.success, 0.14), color: C.success, border: `1px solid ${alpha(C.success, 0.5)}`,
                    borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14,
                    textDecoration: "none", fontFamily: "'Inter', 'Vazirmatn', sans-serif",
                  }}
                >
                  ✓ پیش‌نویس ساخته شد — ویرایش در وردپرس ↗
                </a>
              )}
              {pubState === "error" && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, direction: "ltr", textAlign: "center", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>{pubMsg}</div>
              )}

              {/* Word file — generated in the app, no Google account needed. */}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={downloadDoc}
                  style={{
                    flex: 1, background: alpha(C.teal, 0.12), color: C.text,
                    border: `1px solid ${alpha(C.teal, 0.4)}`, borderRadius: 12, padding: "12px",
                    fontWeight: 600, fontSize: 13.5, cursor: "pointer",
                    fontFamily: "'Inter', 'Vazirmatn', sans-serif",
                  }}
                >
                  {docState === "downloaded" ? "دانلود شد ✓" : "📄 دانلود فایل Word"}
                </button>
                <button
                  onClick={sendDocToTelegram}
                  disabled={docState === "sending"}
                  style={{
                    flex: 1, background: alpha(C.teal, 0.12), color: C.text,
                    border: `1px solid ${alpha(C.teal, 0.4)}`, borderRadius: 12, padding: "12px",
                    fontWeight: 600, fontSize: 13.5,
                    cursor: docState === "sending" ? "default" : "pointer",
                    opacity: docState === "sending" ? 0.6 : 1,
                    fontFamily: "'Inter', 'Vazirmatn', sans-serif",
                  }}
                >
                  {docState === "sending" ? "در حال ارسال…" : docState === "sent" ? "ارسال شد ✓" : "✈ فایل به تلگرام"}
                </button>
              </div>
              {docState === "error" && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, direction: "ltr", textAlign: "center", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>{docMsg}</div>
              )}

              <button onClick={generateArticle} disabled={artState === "generating"} style={{ width: "100%", marginTop: 8, background: "transparent", color: "rgba(18,26,36,0.6)", border: "none", cursor: "pointer", fontSize: 12, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
                ↻ بازنویسی مقاله
              </button>
            </div>
          )}
        </div>
      )}

      {/* A real link, so right-click / middle-click / Ctrl+click can open the
          next topic in a new tab and this one stays on the current script. The
          topic just handled is already marked seen, so a fresh tab's deck starts
          at the next card. A plain left click still stays in-page. */}
      <a
        href="/"
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onBack();
        }}
        style={{ display: "block", boxSizing: "border-box", textAlign: "center", textDecoration: "none", marginTop: 12, background: C.orange, color: "#fff", borderRadius: 14, padding: "14px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}
      >
        Next topic →
      </a>
    </div>
  );
}

function Tab({ active, onClick, label }) {
  return (
    <button className="ui-btn" onClick={onClick} style={{
      flex: 1, background: active ? alpha(C.orange, 0.16) : C.surface,
      color: active ? C.text : C.text2,
      border: `1px solid ${active ? alpha(C.orange, 0.55) : C.line}`, borderRadius: 12, padding: "10px",
      fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif",
      boxShadow: active ? `inset 0 -2px 0 ${C.orange}` : "none",
    }}>
      {label}
    </button>
  );
}

// Library — a browsable list of every saved script + article. Tapping a row
// reopens it in the script view (with copy / Telegram / publish all reusable).
function LibraryView({ items, filter, setFilter, onOpen, onBack }) {
  const scripts = items.filter((i) => i.type === "script");
  const articles = items.filter((i) => i.type === "article");
  const filtered =
    filter === "script" ? scripts : filter === "article" ? articles : items;

  return (
    <div style={{ width: "100%", maxWidth: 600, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <BackBtn onClick={onBack} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Library</span>
          <span style={{ fontSize: 12, color: C.text3 }}>{items.length} saved</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Tab active={filter === "all"} onClick={() => setFilter("all")} label={`همه (${items.length})`} />
        <Tab active={filter === "script"} onClick={() => setFilter("script")} label={`سناریوها (${scripts.length})`} />
        <Tab active={filter === "article"} onClick={() => setFilter("article")} label={`مقاله‌ها (${articles.length})`} />
      </div>

      {filtered.length === 0 ? (
        <div className="ui-glass" style={{ height: 320, border: `1px dashed ${C.line}`, borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center", fontSize: 28, background: alpha(C.orange, 0.1) }}>📚</div>
          <div dir="rtl" style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 14, lineHeight: 1.8, color: C.text2 }}>
            هنوز چیزی ذخیره نشده.<br />یک موضوع رو تأیید کن تا سناریو و مقاله‌اش همیشه اینجا بمونه.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((it, n) => (
            <LibraryRow key={it.id + ":" + (it.ts || 0)} item={it} n={n} onOpen={() => onOpen(it)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BackBtn({ onClick, label = "Deck" }) {
  return (
    <button className="ui-btn ui-glass" onClick={onClick} style={{ border: `1px solid ${C.line}`, color: C.text, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', 'Vazirmatn', sans-serif", borderRadius: 99, padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      ← {label}
    </button>
  );
}

function LibraryRow({ item, onOpen, n = 0 }) {
  const f = fieldOf(item);
  const isArticle = item.type === "article";
  const tone = isArticle ? C.teal : C.orange;
  let dateStr = "";
  if (item.ts) {
    try {
      dateStr = new Date(item.ts).toLocaleDateString("en-CA");
    } catch (_) {}
  }
  return (
    <button
      onClick={onOpen}
      className="ui-glass ui-lift ui-fade"
      style={{
        animationDelay: `${Math.min(n, 14) * 25}ms`, textAlign: "start", border: `1px solid ${C.line}`,
        borderRadius: 14, padding: "11px 12px", cursor: "pointer", color: C.text,
        display: "flex", alignItems: "center", gap: 12, width: "100%",
      }}
    >
      <span aria-hidden style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", fontSize: 18, flexShrink: 0, background: alpha(tone, 0.16), border: `1px solid ${alpha(tone, 0.35)}` }}>
        {isArticle ? "📝" : "🎬"}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span dir="rtl" style={{ display: "block", fontFamily: "'Vazirmatn', sans-serif", fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.5, unicodeBidi: "plaintext", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title_fa || item.title_en}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 11, color: C.text2, fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
          <span style={{ color: f.color }}>{f.emoji} {f.label}</span>
          <span style={{ color: tone }}>{isArticle ? "مقاله" : "سناریو"}</span>
          {dateStr && <span>{dateStr}</span>}
        </span>
      </span>
      <span aria-hidden style={{ fontSize: 15, color: C.text3, flexShrink: 0 }}>↗</span>
    </button>
  );
}

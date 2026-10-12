"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isUntrusted } from "../lib/trust";

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
    // A source blocked since the deck was saved goes too.
    return d.topics.filter((t) => !isUntrusted(t));
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

// ---- shared workspace: every topic the team acted on, with what was made
// from it (lib/workspace.js). The list shows these together with the new
// ideas, so nobody writes the same material twice. A copy is kept on this
// device so the list appears at once; the server's copy wins. ----
const WS_KEY = "sugimoto_ws_v1";
function loadWsCache() {
  try {
    const d = JSON.parse(localStorage.getItem(WS_KEY) || "null");
    return d && Array.isArray(d.entries) ? d.entries : [];
  } catch (_) {
    return [];
  }
}
function saveWsCache(entries) {
  try {
    localStorage.setItem(WS_KEY, JSON.stringify({ at: Date.now(), entries: entries.slice(0, 400) }));
  } catch (_) {}
}
function wsPost(action, topic) {
  return fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, topic }),
  }).catch(() => {});
}

export default function App() {
  const [topics, setTopics] = useState([]); // new ideas from the topic pipeline
  const [loadingTopics, setLoadingTopics] = useState(true); // nothing on screen yet
  const [streaming, setStreaming] = useState(false); // new ideas still arriving
  const [topicError, setTopicError] = useState(null);
  const [errDetail, setErrDetail] = useState("");
  const [deckStats, setDeckStats] = useState(null);
  const [view, setView] = useState("deck"); // deck | script
  const [scripts, setScripts] = useState({ fa: "", en: "" });
  const [scriptTopic, setScriptTopic] = useState(null);
  const [scriptError, setScriptError] = useState(null);
  const [scriptTab, setScriptTab] = useState("fa");
  const [copied, setCopied] = useState("");
  const [initialArticle, setInitialArticle] = useState(null);
  const [savedCarousel, setSavedCarousel] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [caps, setCaps] = useState({ carousel: true, telegram: { review: true, public: true }, video: false });

  useEffect(() => {
    fetch("/api/capabilities", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => c && setCaps(c))
      .catch(() => {});
  }, []);

  // ---- workspace ---------------------------------------------------------
  //   ws[key] = { key, topic, status: "new" | "active" | "archived", materials, updatedAt }
  const [ws, setWs] = useState({});
  const wsRef = useRef(ws);
  wsRef.current = ws;
  // A change made here wins over the server's copy for a couple of minutes,
  // so a refresh that started before the change cannot undo it on screen.
  const overridesRef = useRef({});

  const applyEntries = useCallback((entries) => {
    const now = Date.now();
    const next = {};
    for (const e of entries || []) {
      if (!e || !e.key || !e.topic) continue;
      next[e.key] = e;
    }
    for (const [k, o] of Object.entries(overridesRef.current)) {
      if (o.until < now) {
        delete overridesRef.current[k];
        continue;
      }
      next[k] = { ...(next[k] || { key: k, materials: {} }), ...o.entry, materials: { ...((next[k] || {}).materials || {}), ...(o.entry.materials || {}) } };
    }
    setWs(next);
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      const j = await r.json();
      if (!Array.isArray(j.entries)) return;
      applyEntries(j.entries);
      saveWsCache(j.entries);
    } catch (_) {}
  }, [applyEntries]);

  useEffect(() => {
    applyEntries(loadWsCache());
    loadWorkspace();
    const t = setInterval(() => document.visibilityState === "visible" && loadWorkspace(), 60000);
    const wake = () => document.visibilityState === "visible" && loadWorkspace();
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [applyEntries, loadWorkspace]);

  const patchWs = useCallback((topic, patch) => {
    const key = topicKey(topic);
    if (!key) return;
    const prev = wsRef.current[key] || { key, topic, status: "new", materials: {}, updatedAt: 0 };
    const entry = {
      ...prev,
      ...patch,
      topic: { ...prev.topic, ...topic },
      materials: { ...prev.materials, ...(patch.materials || {}) },
      updatedAt: Date.now(),
    };
    overridesRef.current[key] = { until: Date.now() + 120000, entry };
    setWs((w) => ({ ...w, [key]: entry }));
  }, []);

  // Approved / archived, as the list shows it.
  const decisions = useMemo(() => {
    const d = {};
    for (const e of Object.values(ws)) {
      if (e.status === "active") d[e.key] = "approved";
      else if (e.status === "archived") d[e.key] = "rejected";
    }
    return d;
  }, [ws]);
  const decisionsRef = useRef(decisions);
  decisionsRef.current = decisions;

  // ---- background jobs --------------------------------------------------
  // The slow steps (scripts, Telegram, article, draft, Word file, carousel)
  // run on the SERVER as jobs; this page only starts them and checks on them.
  // A phone freezes a page the moment you switch apps, which used to freeze
  // the whole pipeline halfway. Now the work continues on the server, and
  // this page catches up when it wakes (see the visibility handler below).
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
      // A new carousel replaces the earlier one and what was done to it.
      if (kind === "carousel") {
        delete entry.carousel_slide;
        delete entry.carousel_send;
      }
      entry[kind] = { id: null, kind, key, status: "running", result: null, error: "", topic, startedAt: Date.now(), extra };
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
        // The server already saved the material to the workspace; show it in
        // the list now rather than at the next workspace refresh.
        const t = local.topic || {};
        const r = remote.result || {};
        const now = Date.now();
        if (remote.kind === "script") patchWs(t, { status: "active", materials: { script: { ts: now } } });
        else if (remote.kind === "article") patchWs(t, { materials: { article: { ts: now } } });
        else if (remote.kind === "carousel" || remote.kind === "carousel_slide") {
          patchWs(t, { materials: { carousel: { ts: now, count: (r.slides || []).length, sent: r.sent || {} } } });
        } else if (remote.kind === "carousel_send") {
          const cur = ((wsRef.current[local.key] || {}).materials || {}).carousel || {};
          patchWs(t, { materials: { carousel: { ...cur, sent: r.sent || {} } } });
        }
      }
    }
  }, [patchJob, patchWs]);

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

  const [deckMode, setDeckModeState] = useState("list"); // list | lexbase
  useEffect(() => {
    try {
      const m = localStorage.getItem("sugimoto_deck_mode_v2");
      if (m === "lexbase") setDeckModeState(m);
    } catch (_) {}
  }, []);
  const setDeckMode = (m) => {
    setDeckModeState(m);
    try {
      localStorage.setItem("sugimoto_deck_mode_v2", m);
    } catch (_) {}
  };

  // Opening the app: the last ideas saved on this device show at once, and
  // new ones from the server are added as each one is written. "Refresh"
  // keeps every idea not archived and adds the new ones.
  const topicsRef = useRef(topics);
  topicsRef.current = topics;

  const loadTopics = useCallback(async (force = false) => {
    setTopicError(null);
    setErrDetail("");

    const seen = loadSeen();
    const seenTitles = new Set(seen.map((s) => s.key));
    const seenUrls = new Set(seen.map((s) => s.url).filter(Boolean));
    const exclude = seen.map((s) => s.en || s.key).filter(Boolean).slice(-80);
    // Ideas already acted on come from the workspace instead, with their state.
    const fresh = (t) => !isSeen(t, seenTitles, seenUrls);
    const same = (a, b) => topicKey(a) === topicKey(b) || (!!urlKey(a) && urlKey(a) === urlKey(b));

    let shown = 0;
    if (force) {
      const keep = topicsRef.current.filter((t) => decisionsRef.current[topicKey(t)] !== "rejected" && !isUntrusted(t));
      setTopics(keep);
      shown = keep.length;
      setLoadingTopics(keep.length === 0);
    } else if (!topicsRef.current.length) {
      const cached = loadDeckCache().filter(fresh);
      if (cached.length) {
        setTopics(cached);
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
      if (!shown && r.error) throw new Error(r.error);
    } catch (e) {
      // Ideas already on screen stay; only an empty list shows the error.
      if (!shown) {
        setTopicError("نتونستم اخبار تازه رو بیارم. دوباره «Refresh» رو بزن.");
        setErrDetail(String(e?.message || e));
      }
    } finally {
      setLoadingTopics(false);
      setStreaming(false);
    }
  }, []);

  useEffect(() => {
    if (topics.length) saveDeckCache(topics);
  }, [topics]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  // One list: new ideas and every topic in the workspace. A new idea that is
  // the same story as a workspace topic (same title or same source) shows as
  // that topic, with its state.
  const listTopics = useMemo(() => {
    const byUrl = new Map();
    for (const e of Object.values(ws)) {
      const u = urlKey(e.topic);
      if (u && !byUrl.has(u)) byUrl.set(u, e);
    }
    const out = [];
    const keys = new Set();
    const urls = new Set();
    const add = (t, ts) => {
      const k = topicKey(t);
      const u = urlKey(t);
      if (!k || keys.has(k) || (u && urls.has(u))) return;
      keys.add(k);
      if (u) urls.add(u);
      out.push(ts ? { ...t, _ts: ts } : t);
    };
    for (const t of topics) {
      const e = ws[topicKey(t)] || byUrl.get(urlKey(t));
      if (e) add({ ...t, ...e.topic }, e.updatedAt);
      else add(t);
    }
    for (const e of Object.values(ws)) add(e.topic, e.updatedAt);
    return out;
  }, [topics, ws]);

  // ---- decisions ----------------------------------------------------------
  // Approve: the server writes the scripts (and sends the news post to
  // Telegram) as a job, and the topic becomes "used" for everyone.
  const approveTopic = (topic) => {
    markSeenLocal(topic);
    recordSeenRemote(topic);
    patchWs(topic, { status: "active" });
    startJob("script", topic, { topic });
  };

  // ✕ archives, for everyone. It can be restored from the Archive filter.
  const rejectTopic = (topic) => {
    markSeenLocal(topic);
    recordSeenRemote(topic);
    patchWs(topic, { status: "archived" });
    wsPost("archive", topic);
  };

  const restoreTopic = (topic) => {
    unmarkSeenLocal(topic);
    const e = wsRef.current[topicKey(topic)];
    const used = !!(e && Object.keys(e.materials || {}).length);
    patchWs(topic, { status: used ? "active" : "new" });
    wsPost("restore", topic);
  };

  // Open a topic: its saved material comes from the workspace; anything a job
  // made in this session comes from the job.
  const openKeyRef = useRef("");
  const openTopic = (topic) => {
    const key = topicKey(topic);
    const e = wsRef.current[key];
    const t = e ? { ...topic, ...e.topic } : topic;
    openKeyRef.current = key;
    setScriptTopic(t);
    setScripts({ fa: "", en: "" });
    setInitialArticle(null);
    setSavedCarousel(null);
    setScriptError(null);
    setScriptTab("fa");
    setView("script");
    try {
      window.scrollTo(0, 0);
    } catch (_) {}
    if (e && Object.keys(e.materials || {}).length) {
      setLoadingSaved(true);
      fetch("/api/workspace?key=" + encodeURIComponent(key), { cache: "no-store" })
        .then((r) => r.json())
        .then(({ entry }) => {
          if (!entry || openKeyRef.current !== key) return;
          const m = entry.materials || {};
          if (m.script) setScripts({ fa: m.script.script_fa || "", en: m.script.script_en || "" });
          if (m.article) setInitialArticle(m.article.article || null);
          if (m.carousel) setSavedCarousel(m.carousel);
        })
        .catch(() => {})
        .finally(() => openKeyRef.current === key && setLoadingSaved(false));
    } else {
      setLoadingSaved(false);
    }
  };

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

  const colMax = view === "deck" ? 720 : 640;

  // What the open topic's background jobs say. A job keeps its own result, so
  // this is correct however long the page was away.
  const svKey = scriptTopic ? topicKey(scriptTopic) : "";
  const svJobs = bg[svKey] || {};
  const sj = svJobs.script;
  const sjResult = sj && sj.result && (sj.result.fa || sj.result.en) ? sj.result : null;
  const viewScripts = sjResult ? { fa: sjResult.fa || "", en: sjResult.en || "" } : scripts;
  const viewLoading = (!!sj && sj.status === "running" && !sjResult) || (loadingSaved && !viewScripts.fa && !viewScripts.en);
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

  // The carousel on screen: the newest job result this session, else the
  // saved one. `sent` merges what was sent since.
  let carousel = savedCarousel;
  let carouselJob = null;
  for (const kind of ["carousel", "carousel_slide"]) {
    const j = svJobs[kind];
    if (!j) continue;
    if (!carouselJob || (j.startedAt || 0) > (carouselJob.startedAt || 0)) carouselJob = j;
  }
  if (carouselJob && carouselJob.result && (carouselJob.result.slides || []).length) carousel = carouselJob.result;
  const sendJob = svJobs.carousel_send || null;
  if (carousel && sendJob && sendJob.status === "done" && sendJob.result && sendJob.result.sent) {
    carousel = { ...carousel, sent: { ...(carousel.sent || {}), ...sendJob.result.sent } };
  }

  const copy = (which) => {
    const t = which === "fa" ? viewScripts.fa : viewScripts.en;
    if (!t) return;
    navigator.clipboard?.writeText(t);
    setCopied(which);
    setTimeout(() => setCopied(""), 1400);
  };

  // Work running or finished in the background, for the bar under the header.
  const bgRows = [];
  for (const key of Object.keys(bg)) {
    for (const kind of ["script", "article", "carousel"]) {
      const j = bg[key][kind];
      if (!j || !j.topic) continue;
      if (dismissed[key + ":" + kind] && j.status !== "running") continue;
      if (view === "script" && key === svKey) continue; // that one is on screen already
      if (view === "deck" && kind === "script") continue; // its row shows it
      bgRows.push(j);
    }
  }

  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const t of listTopics) counts[decisions[topicKey(t)] || "pending"]++;

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
          <a href="/content-wizard" className="ui-btn" aria-label="Content Wizard" title="Content Wizard" style={{ ...navBtn, textDecoration: "none", color: C.text }}>
            ✨ <span className="ui-wide">Wizard</span>
          </a>
          <button
            onClick={() => {
              setView("deck");
              loadTopics(true);
              loadWorkspace();
            }}
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
          openTopic(j.topic);
        }}
        onDismiss={(j) => setDismissed((d) => ({ ...d, [j.key + ":" + j.kind]: true }))}
        onRetry={(j) => startJob(j.kind, j.topic, { topic: j.topic, ...(j.extra || {}) })}
      />

      {view === "deck" && (
        <div style={{ width: "100%", maxWidth: colMax, flex: 1, display: "flex", flexDirection: "column" }}>
          <ModeSwitch mode={deckMode} onChange={setDeckMode} />

          {deckMode === "lexbase" ? (
            <LexbaseSection
              decisions={decisions}
              jobs={bg}
              onApprove={approveTopic}
              onReject={rejectTopic}
              onRestore={restoreTopic}
              onOpen={openTopic}
              onRetry={(t) => startJob("script", t, { topic: t })}
            />
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <Stat label="New" value={counts.pending} color="#6d5bd0" icon="✦" />
                <Stat label="Made" value={counts.approved} color={C.success} icon="✓" />
                <Stat label="Archived" value={counts.rejected} color={C.text3} icon="🗄" />
              </div>

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

              {streaming && !loadingTopics && (
                <div dir="rtl" className="ui-progress ui-fade" style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 12, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, color: C.text }}>
                  <span className="ui-pulse">⏳</span> موضوع‌های تازه در حال اضافه شدن به فهرست…
                </div>
              )}

              {loadingTopics && !listTopics.length ? (
                <div style={{ display: "grid", gap: 7 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="ui-skeleton" style={{ height: 64, borderRadius: 14 }} />
                  ))}
                </div>
              ) : (
                <IdeasList
                  topics={listTopics}
                  decisions={decisions}
                  jobs={bg}
                  ws={ws}
                  onApprove={approveTopic}
                  onReject={rejectTopic}
                  onRestore={restoreTopic}
                  onOpen={openTopic}
                  onRetry={(t) => startJob("script", t, { topic: t })}
                />
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
          loadingText={loadingSaved && !(sj && sj.status === "running") ? "در حال بارگذاری محتوای ذخیره‌شده…" : ""}
          error={viewError}
          tab={scriptTab}
          setTab={setScriptTab}
          copied={copied}
          onCopy={copy}
          onBack={() => setView("deck")}
          onWrite={decisions[svKey] === "rejected" ? null : () => approveTopic(scriptTopic)}
          tgState={viewTg.state}
          tgMsg={viewTg.msg}
          onRetryTelegram={() => startJob("telegram", scriptTopic, { topic: scriptTopic, fa: viewScripts.fa, en: viewScripts.en })}
          articleJob={svJobs.article || null}
          publishJob={svJobs.publish || null}
          docJob={svJobs.docfile || null}
          carousel={carousel}
          carouselJob={carouselJob}
          sendJob={sendJob}
          videoJob={svJobs.video || null}
          caps={caps}
          onJob={(kind, extra) => startJob(kind, scriptTopic, { topic: scriptTopic, ...extra })}
        />
      )}
    </div>
  );
}

// List (every topic, new and used) or the Lexbase newsletter section.
const MODES = [["list", "☰", "List"], ["lexbase", "📬", "Lexbase"]];
function ModeSwitch({ mode, onChange }) {
  const idx = Math.max(0, MODES.findIndex((m) => m[0] === mode));
  return (
    <div style={{ position: "relative", display: "flex", padding: 3, borderRadius: 12, background: C.surfaceHi, border: `1px solid ${C.line}`, marginBottom: 14 }}>
      {/* sliding highlight under the active option */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 3, bottom: 3, left: 3, width: `calc((100% - 6px) / ${MODES.length})`, borderRadius: 9,
          background: C.surface, boxShadow: "0 1px 3px rgba(16,24,40,0.12)",
          transform: `translateX(${idx * 100}%)`, transition: "transform 0.28s cubic-bezier(.2,.8,.2,1)",
        }}
      />
      {MODES.map(([m, ic, label]) => (
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

// Every topic as one compact row, new and already used alike: title first,
// so the whole list can be scanned in seconds. ✓ starts the script job
// without leaving the list; ✕ archives; a used topic shows what was made
// from it and opens with it. Tapping a title opens the topic.
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
const MATERIAL_BADGE = {
  script: ["📝", "Scripts written"],
  article: ["📰", "Blog article written"],
  carousel: ["🖼", "Carousel made (📢 = sent to the public channel)"],
  video: ["🎬", "Video requested"],
};
const CATEGORIES = [
  ["all", "همه", () => true],
  ["ca", "🇨🇦 کانادا", (t) => t.page !== "EU"],
  ["eu", "🇪🇺 اروپا", (t) => t.page === "EU"],
  ["social", "📱 شبکه‌های اجتماعی", (t) => isSocialTopic(t)],
  ["web", "🌐 سایت‌ها", (t) => !isSocialTopic(t)],
];

function IdeasList({ topics, decisions, jobs, ws = {}, onApprove, onReject, onRestore, onOpen, onRetry, plain = false }) {
  const [filter, setFilter] = useState("all"); // all | pending | approved | rejected (archive)
  const [cat, setCat] = useState("all"); // see CATEGORIES
  const stateOf = (t) => decisions[topicKey(t)] || "pending";
  const inCat = CATEGORIES.find((c) => c[0] === cat)[2];
  // "All" is everything not archived; the archive has its own filter.
  const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const t of topics) {
    const st = stateOf(t);
    counts[st]++;
    if (st !== "rejected") counts.all++;
  }
  const catCounts = {};
  for (const [k, , test] of CATEGORIES) catCounts[k] = topics.filter(test).length;
  // Newest development first (cards arrive in the order they were written,
  // not by date). The newsletter section keeps its own priority order.
  const rows = topics
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (filter === "all" ? stateOf(t) !== "rejected" : stateOf(t) === filter) && inCat(t));
  // Newest first: the news date, or for a saved topic without one, when it was
  // last worked on.
  const when = (t) => t.date || (t._ts ? new Date(t._ts).toISOString().slice(0, 10) : "");
  if (!plain) rows.sort((a, b) => when(b.t).localeCompare(when(a.t)) || a.i - b.i);
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
        {chip("pending", "جدید")}
        {chip("approved", "ساخته‌شده")}
        {chip("rejected", "🗄 آرشیو")}
      </div>
      {!plain && <div dir="rtl" style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
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
      </div>}

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
                  onClick={() => onOpen && onOpen(t)}
                  title={(t.title_en ? t.title_en + " — " : "") + "open"}
                  style={{
                    fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 14, lineHeight: 1.5,
                    color: C.text, cursor: onOpen ? "pointer" : "default",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    textDecoration: st === "rejected" ? "line-through" : "none",
                  }}
                >
                  {t.title_fa || t.title_en}
                </div>
                {plain && t.why_now && (
                  <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, lineHeight: 1.6, color: C.text2, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.why_now}
                  </div>
                )}
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
                    <span title={"From the Lexbase newsletter" + (t.citation ? " — " + t.citation : "")} style={{ color: "#6d5bd0", background: alpha("#6d5bd0", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>📬 {t.citation || "Lexbase"}</span>
                  )}
                  {Object.keys(((ws[topicKey(t)] || {}).materials) || {}).map((k) => MATERIAL_BADGE[k] && (
                    <span key={"m" + k} title={MATERIAL_BADGE[k][1]} style={{ color: C.success, background: alpha(C.success, 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>
                      {MATERIAL_BADGE[k][0]}
                      {k === "carousel" && (((ws[topicKey(t)] || {}).materials || {}).carousel || {}).sent?.public ? " 📢" : ""}
                    </span>
                  ))}
                  {(t.focus || []).map((k) => (
                    <span key={k} style={{ color: "#b42318", background: alpha("#f04438", 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{FOCUS_LABEL[k] || k}</span>
                  ))}
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
                    smallBtn("باز کن ✓", () => onOpen(t), "success", "Open topic")
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

const FOCUS_LABEL = { iran: "⭐ Iran", study: "⭐ Study permit", startup: "⭐ Start-up Visa" };

// The newsletter section: a card for every item of a Lexbase issue, policy
// notes and court decisions alike, with the standing priorities (Iran, study
// permits, Start-up Visa) on top. The server writes the cards in the
// background; this shows the saved copy first and polls until all are in.
// Every issue's cards are kept on this device, so past issues stay on the
// platform and show at once; the server adds what is new.
const LEX_KEY = "sugimoto_lexbase_v2";
const LEX_GROUPS = [
  ["all", "همه", () => true],
  ["focus", "⭐ اولویت‌ها", (t) => (t.focus || []).length > 0],
  ["policy", "📋 فکت‌ها و سیاست‌ها", (t) => t.kind !== "court"],
  ["court", "⚖️ پرونده‌های دادگاه", (t) => t.kind === "court"],
];

function loadLexArchive() {
  try {
    const a = JSON.parse(localStorage.getItem(LEX_KEY) || "null");
    if (a && a.issues) return { known: [], ...a };
  } catch (_) {}
  const out = { issues: {}, known: [] };
  try {
    const v1 = JSON.parse(localStorage.getItem("sugimoto_lexbase_v1") || "null");
    if (v1 && v1.issue && Array.isArray(v1.cards)) {
      out.issues[v1.issue.key] = { issue: v1.issue, cards: v1.cards };
      out.known.push(v1.issue.key);
    }
  } catch (_) {}
  return out;
}
function saveLexArchive(a) {
  try {
    localStorage.setItem(LEX_KEY, JSON.stringify(a));
  } catch (_) {}
}
// Priority items first, then policy notes, then decisions — the server's order.
function lexOrder(cards) {
  const g = (t) => ((t.focus || []).length ? 0 : t.kind === "court" ? 2 : 1);
  return cards.slice().sort((a, b) => g(a) - g(b) || (a.n || 0) - (b.n || 0));
}
function mergeLexCards(old = [], fresh = []) {
  const m = new Map(old.map((c) => [c.n, c]));
  for (const c of fresh) m.set(c.n, c);
  return lexOrder([...m.values()]);
}

function LexbaseSection({ decisions, ...actions }) {
  const [issueKey, setIssueKey] = useState("");
  const [archive, setArchive] = useState({ issues: {}, known: [] });
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [group, setGroup] = useState("all");

  useEffect(() => {
    setArchive(loadLexArchive());
  }, []);

  useEffect(() => {
    let stop = false;
    let timer = null;
    const load = async () => {
      try {
        const r = await fetch("/api/lexbase/topics" + (issueKey ? "?issue=" + encodeURIComponent(issueKey) : ""), { cache: "no-store" });
        const j = await r.json();
        if (stop) return;
        if (j.error && !j.issue) throw new Error(j.error);
        setErr(j.error || "");
        setData(j);
        if (j.issue && j.issue.total != null && j.cards.length) {
          setArchive((prev) => {
            const a = loadLexArchive();
            const old = (a.issues[j.issue.key] || {}).cards;
            a.issues[j.issue.key] = { issue: j.issue, cards: mergeLexCards(old, j.cards) };
            if (!a.known.includes(j.issue.key)) a.known.push(j.issue.key);
            saveLexArchive(a);
            return a;
          });
        }
        if (j.writing || j.pending || (j.issue && j.missing > 0 && j.cards.length === 0)) timer = setTimeout(load, 4000);
      } catch (e) {
        if (stop) return;
        setErr(String(e?.message || e));
        timer = setTimeout(load, 10000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [issueKey]);

  // Issues: everything kept on this device plus whatever the server lists.
  const issueMap = new Map();
  for (const [k, v] of Object.entries(archive.issues)) issueMap.set(k, { key: k, subject: v.issue.subject, total: v.issue.total });
  for (const i of (data && data.issues) || []) {
    const had = issueMap.get(i.key);
    issueMap.set(i.key, { ...i, total: i.total != null ? i.total : had ? had.total : null });
  }
  const issueList = [...issueMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  const curKey = issueKey || (data && data.issue && data.issue.key) || (issueList[0] && issueList[0].key) || "";
  const saved = archive.issues[curKey];
  const live = data && data.issue && data.issue.key === curKey ? data : null;
  const iss = live && live.issue.total != null ? live.issue : saved ? saved.issue : live ? live.issue : null;
  const cards = mergeLexCards(saved ? saved.cards : [], live ? live.cards : []);
  const writing = !!(live && (live.writing || live.missing > 0));

  // Archived items stay out of the groups; the list's Archive filter has them.
  const visible = cards.filter((t) => decisions[topicKey(t)] !== "rejected");
  const inGroup = LEX_GROUPS.find((g) => g[0] === group)[2];
  const rows = visible.filter(inGroup);
  const font = { fontFamily: "'Vazirmatn', sans-serif" };

  return (
    <div>
      {issueList.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
          {issueList.map((i) => {
            const on = curKey === i.key;
            const isNew = !archive.known.includes(i.key) && Object.keys(archive.issues).length > 0;
            return (
              <button key={i.key} className="ui-btn" onClick={() => setIssueKey(i.key)} style={{ flexShrink: 0, padding: "5px 11px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${on ? "#6d5bd0" : C.line}`, background: on ? alpha("#6d5bd0", 0.12) : C.surface, color: on ? "#6d5bd0" : C.text2, fontSize: 12, fontWeight: 700 }}>
                {isNew && "🆕 "}
                {(i.subject || "").replace(/^.*?lexbase\s*[-–—:]?\s*/i, "") || i.key}
                {i.total != null ? " · " + i.total : ""}
              </button>
            );
          })}
        </div>
      )}

      <div dir="rtl" className="ui-glass" style={{ ...font, marginBottom: 12, padding: "11px 13px", borderRadius: 14, border: `1px solid ${alpha("#6d5bd0", 0.3)}`, background: alpha("#6d5bd0", 0.06), fontSize: 12.5, lineHeight: 1.8, color: C.text }}>
        {iss && iss.total != null ? (
          <>
            <b>📬 {iss.subject || "Lexbase " + iss.key}</b>
            <br />
            {iss.policy} فکت و سیاست · {iss.court} پرونده‌ی دادگاه · {iss.priority} مورد اولویت‌دار (ایران، مجوز تحصیل، استارتاپ ویزا)
            {writing && cards.length < iss.total ? (
              <div className="ui-pulse" style={{ color: "#6d5bd0", fontWeight: 700 }}>
                ⏳ {cards.length} از {iss.total} موضوع نوشته شده…
              </div>
            ) : null}
          </>
        ) : iss ? (
          <span className="ui-pulse">⏳ <b>{iss.subject}</b> — در حال خواندن این شماره… (اولین بار حدود یک دقیقه)</span>
        ) : data && data.pending ? (
          <span className="ui-pulse">⏳ در حال خواندن خبرنامه از ایمیل…</span>
        ) : data ? (
          <span>هیچ شماره‌ای از Lexbase در ایمیل پیدا نشد. {data.mailbox}</span>
        ) : (
          <span className="ui-pulse">⏳ در حال بارگذاری…</span>
        )}
        {err && <div dir="ltr" style={{ fontSize: 11, color: C.reject, textAlign: "left" }}>{err}</div>}
      </div>

      {cards.length > 0 && (
        <div dir="rtl" style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {LEX_GROUPS.map(([k, label, test]) => {
            const on = group === k;
            return (
              <button key={k} className="ui-btn" onClick={() => setGroup(k)} style={{ ...font, padding: "5px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? C.text : C.line}`, background: on ? C.text : C.surface, color: on ? "#fff" : C.text2, fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {label}
                <span style={{ minWidth: 16, padding: "0 4px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.surfaceHi, fontSize: 10.5, fontFamily: "'Inter', sans-serif" }}>{visible.filter(test).length}</span>
              </button>
            );
          })}
        </div>
      )}

      {cards.length === 0 && (iss || !data) ? (
        <div style={{ display: "grid", gap: 7 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ui-skeleton" style={{ height: 64, borderRadius: 14 }} />
          ))}
        </div>
      ) : (
        cards.length > 0 && <IdeasList topics={group === "all" ? cards : rows} decisions={decisions} plain {...actions} />
      )}
    </div>
  );
}

// Work that is running (or just finished) on the server for topics you have
// already moved on from. Tap a finished one to open it.
function JobsBar({ rows, onOpen, onDismiss, onRetry, width = 460 }) {
  if (!rows.length) return null;
  const KIND = { script: "سناریو", article: "مقاله", carousel: "کاروسل" };
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

// The source the scripts were written from, untranslated: the newsletter item
// or the article. For a newsletter item the whole issue can be opened too.
function OriginalText({ topic }) {
  const [state, setState] = useState({ loading: true });
  const [whole, setWhole] = useState(null); // null | { loading } | { text, title } | { error }
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let stop = false;
    setState({ loading: true });
    setWhole(null);
    fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) })
      .then((r) => r.json())
      .then((j) => !stop && setState(j.error ? { error: j.error } : j))
      .catch((e) => !stop && setState({ error: String(e?.message || e) }));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.source_url, topic.title_fa]);

  const loadWhole = () => {
    setWhole({ loading: true });
    fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, whole: true }) })
      .then((r) => r.json())
      .then((j) => setWhole(j.error ? { error: j.error } : j))
      .catch((e) => setWhole({ error: String(e?.message || e) }));
  };

  const copy = async (k, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(k);
      setTimeout(() => setCopied(""), 1500);
    } catch (_) {}
  };
  const copyBtn = (k, text) => (
    <button className="ui-btn" onClick={() => copy(k, text)} style={{ background: copied === k ? C.success : alpha(C.orange, 0.14), color: copied === k ? "#06281c" : C.orange, border: `1px solid ${copied === k ? C.success : alpha(C.orange, 0.4)}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
      {copied === k ? "Copied ✓" : "Copy"}
    </button>
  );
  const label = { lexbase: "Lexbase newsletter — this item", article: "Source article", snippet: "Source excerpt" }[state.kind] || "Source";
  const isLex = state.kind === "lexbase" || topic.newsletter === "lexbase";
  const body = { fontFamily: "'Inter', 'Vazirmatn', sans-serif", fontSize: 14, lineHeight: 1.8, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" };

  if (state.loading) {
    return <div className="ui-pulse" style={{ fontSize: 13, color: C.text3, padding: "30px 0", textAlign: "center" }}>Loading the original text…</div>;
  }
  return (
    <div dir="ltr">
      {state.error ? (
        <div style={{ fontSize: 13, color: C.reject }}>{state.error}</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
              {state.title && <div style={{ textTransform: "none", letterSpacing: 0, color: C.text2, fontWeight: 600, marginTop: 2 }}>{state.title}</div>}
            </div>
            {copyBtn("item", state.text)}
          </div>
          <div style={body}>{state.text}</div>
        </>
      )}

      {isLex && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          {!whole ? (
            <button className="ui-btn" onClick={loadWhole} style={{ width: "100%", padding: "11px", borderRadius: 12, border: `1px solid ${alpha("#6d5bd0", 0.4)}`, background: alpha("#6d5bd0", 0.08), color: "#6d5bd0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}>
              📬 Show the whole newsletter
            </button>
          ) : whole.loading ? (
            <div className="ui-pulse" style={{ fontSize: 13, color: C.text3, textAlign: "center" }}>Loading the whole newsletter…</div>
          ) : whole.error ? (
            <div style={{ fontSize: 13, color: C.reject }}>{whole.error}</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Whole newsletter
                  <div style={{ textTransform: "none", letterSpacing: 0, color: C.text2, fontWeight: 600, marginTop: 2 }}>{whole.title}</div>
                </div>
                {copyBtn("whole", whole.text)}
              </div>
              <div style={{ ...body, fontSize: 13.5 }}>{whole.text}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ScriptView({ topic, scripts, initialArticle, loading, loadingText = "", error, tab, setTab, copied, onCopy, onBack, onWrite, tgState = "idle", tgMsg = "", onRetryTelegram, articleJob, publishJob, docJob, carousel, carouselJob, sendJob, videoJob, caps = {}, onJob }) {
  const f = fieldOf(topic);
  const active = tab === "fa" ? scripts.fa : scripts.en;

  // Blog article (on-demand). It is written by a server-side job, so this view
  // only reflects that job's state: leaving the page, or opening another
  // topic, does not interrupt it, and coming back shows where it got to.
  // Seeded from the workspace when a used topic is opened.
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
        <BackBtn onClick={onBack} label="Back to list" />
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
        <Tab active={tab === "src"} onClick={() => setTab("src")} label="متن اصلی" />
      </div>

      <div className="ui-glass" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18, minHeight: 300 }}>
        {tab === "src" ? (
          <OriginalText topic={topic} />
        ) : loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 260, gap: 14 }}>
            <div className="ui-spin" style={{ width: 30, height: 30, border: `3px solid ${alpha(C.text, 0.15)}`, borderTopColor: C.orange, borderRightColor: C.teal, borderRadius: "50%" }} />
            <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13, color: "rgba(18,26,36,0.6)", direction: "rtl" }}>{loadingText || "در حال نوشتن سناریوی فارسی و انگلیسی…"}</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : error ? (
          <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 13.5, color: C.reject, direction: "rtl", textAlign: "right" }}>{error}</div>
        ) : !scripts.fa && !scripts.en ? (
          // Opened before approval: read the original first, then write.
          <div dir="rtl" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 240, fontFamily: "'Vazirmatn', sans-serif", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.8 }}>هنوز سناریویی برای این موضوع نوشته نشده.<br />متن خبر در «متن اصلی» هست.</div>
            {onWrite && (
              <button className="ui-btn ui-glow-orange" onClick={onWrite} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif" }}>
                ✍️ نوشتن سناریو (فارسی و انگلیسی)
              </button>
            )}
          </div>
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

      {/* What else to make from this topic, once the scripts exist. */}
      {!loading && !error && (scripts.fa || scripts.en) && (
        <>
          <CarouselPanel topic={topic} carousel={carousel} job={carouselJob} sendJob={sendJob} caps={caps} onJob={onJob} />
          <VideoPanel job={videoJob} enabled={!!caps.video} onStart={() => onJob("video", {})} />
        </>
      )}

      <button
        onClick={onBack}
        className="ui-btn"
        style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "center", marginTop: 16, background: C.surface, color: C.text, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Inter', 'Vazirmatn', sans-serif" }}
      >
        ← Back to list
      </button>
    </div>
  );
}

// Carousel post from this topic: choose the number of slides and add notes,
// the server writes the slides (the Content Wizard's carousel prompt) and
// draws each one with the image model, then the set can go to Telegram.
// Everything runs as server jobs and is saved with the topic for the team.
function CarouselPanel({ topic, carousel, job, sendJob, caps = {}, onJob }) {
  const [form, setForm] = useState(false);
  const [count, setCount] = useState(7);
  const [notes, setNotes] = useState("");
  const [copiedCap, setCopiedCap] = useState(false);
  const running = !!job && job.status === "running";
  const stage = running ? (job.result && job.result.stage) || "writing" : "";
  const failed = !!job && job.status === "error" ? job.error : "";
  const slides = (carousel && carousel.slides) || [];
  const drawn = slides.filter((s) => s.image_url).length;
  const missing = slides.length - drawn;
  const sending = !!sendJob && sendJob.status === "running";
  const sendErr = sendJob && sendJob.status === "error" ? sendJob.error : "";
  const sent = (carousel && carousel.sent) || {};
  const font = "'Inter', 'Vazirmatn', sans-serif";
  const fa = "'Vazirmatn', sans-serif";
  const when = (ts) => (ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

  const start = () => {
    if (slides.length && !window.confirm("A new carousel replaces the current one. Continue?")) return;
    setForm(false);
    onJob("carousel", { count, notes: notes.trim() });
  };
  const send = (target) => {
    if (target === "public" && !window.confirm("Publish this carousel to the public channel @sugimotovisa?")) return;
    onJob("carousel_send", { target });
  };
  const btn = (bg, color, border) => ({
    background: bg, color, border, borderRadius: 12, padding: "11px 12px", fontWeight: 700, fontSize: 13.5,
    cursor: "pointer", fontFamily: font,
  });

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      {!slides.length && !running && !form && (
        <button onClick={() => setForm(true)} className="ui-btn" style={{ ...btn(alpha("#6d5bd0", 0.1), C.text, `1px solid ${alpha("#6d5bd0", 0.4)}`), width: "100%" }}>
          🖼 ساخت پست کاروسل (Carousel post)
        </button>
      )}

      {form && !running && (
        <div dir="rtl" className="ui-fade" style={{ background: C.surface, border: `1px solid ${alpha("#6d5bd0", 0.35)}`, borderRadius: 16, padding: 14, fontFamily: fa }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>🖼 کاروسل از این موضوع</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>تعداد اسلاید</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} className="ui-btn" onClick={() => setCount(n)} style={{ minWidth: 38, height: 34, borderRadius: 10, cursor: "pointer", border: `1px solid ${count === n ? "#6d5bd0" : C.line}`, background: count === n ? alpha("#6d5bd0", 0.14) : C.surface, color: count === n ? "#6d5bd0" : C.text, fontWeight: 700, fontFamily: font }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>یادداشت‌ها (اختیاری)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="مثلاً: روی دانشجوها تمرکز کن، اسلاید مقایسه نذار، رنگ‌ها روشن باشه…"
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
          />
          <div style={{ fontSize: 11.5, color: C.text3, margin: "6px 0 12px" }}>
            متن اسلایدها فقط از متن خبر نوشته می‌شه و هر اسلاید با GPT Image 2 طراحی می‌شه (حدود ۵ سنت برای هر اسلاید، چند دقیقه طول می‌کشه).
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ui-btn ui-glow-orange" onClick={start} disabled={!caps.carousel} style={{ ...btn("#6d5bd0", "#fff", "none"), flex: 1, opacity: caps.carousel ? 1 : 0.5 }}>
              ساخت {count} اسلاید
            </button>
            <button className="ui-btn" onClick={() => setForm(false)} style={btn("transparent", C.text2, `1px solid ${C.line}`)}>
              انصراف
            </button>
          </div>
        </div>
      )}

      {running && (
        <div dir="rtl" className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha("#6d5bd0", 0.08), border: `1px solid ${alpha("#6d5bd0", 0.3)}`, fontFamily: fa, fontSize: 13, marginBottom: 10 }}>
          <span className="ui-pulse">⏳</span>{" "}
          {stage === "writing"
            ? "در حال نوشتن متن اسلایدها…"
            : slides.length
              ? `در حال طراحی اسلایدها… ${drawn} از ${slides.length}`
              : "در حال طراحی اسلاید…"}
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>می‌تونی از این صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.</div>
        </div>
      )}
      {failed && !running && (
        <div style={{ fontSize: 12, color: C.reject, marginBottom: 10, fontFamily: font, direction: "ltr" }}>⚠️ {failed}</div>
      )}

      {slides.length > 0 && (
        <div>
          <div dir="rtl" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, fontFamily: fa }}>
            <b style={{ fontSize: 14.5 }}>🖼 کاروسل · {slides.length} اسلاید</b>
            {!running && (
              <button className="ui-btn" onClick={() => setForm(true)} style={{ background: "transparent", border: "none", color: C.text2, cursor: "pointer", fontSize: 12.5, fontFamily: fa }}>
                ↻ ساخت دوباره
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {slides.map((sl) => (
              <div key={sl.num} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                {sl.image_url ? (
                  <a href={sl.image_url} target="_blank" rel="noopener noreferrer">
                    <img src={sl.image_url} alt={"Slide " + sl.num} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", background: C.surfaceHi }} />
                  </a>
                ) : (
                  <div className={running ? "ui-skeleton" : ""} style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", background: C.surfaceHi, color: C.text3, fontSize: 12, padding: 8, textAlign: "center", fontFamily: font }}>
                    {running ? "…" : "⚠️ " + (sl.error ? sl.error.slice(0, 80) : "no image")}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", fontSize: 11.5, fontFamily: font, color: C.text2 }}>
                  <span title={sl.content} style={{ fontWeight: 700 }}>{sl.num}/{slides.length}</span>
                  {!running && (
                    <button className="ui-btn" onClick={() => onJob("carousel_slide", { num: sl.num })} title="Draw this slide again" style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "2px 8px", cursor: "pointer", fontSize: 11.5, color: C.text2 }}>
                      ↻ redraw
                    </button>
                  )}
                </div>
                <div dir="rtl" style={{ padding: "0 8px 8px", fontFamily: fa, fontSize: 11.5, lineHeight: 1.6, color: C.text2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-line" }}>
                  {sl.content}
                </div>
              </div>
            ))}
          </div>

          {slides.some((sl) => sl.kept === "memory") && (
            <div dir="rtl" style={{ marginTop: 8, fontSize: 11.5, color: C.orangeDeep, fontFamily: fa, lineHeight: 1.7 }}>
              ⚠️ بعضی تصاویر در وردپرس ذخیره نشدن و فقط تا ری‌استارت بعدی سرور می‌مونن. اگه لازمشون داری دانلودشون کن یا به تلگرام بفرست.
            </div>
          )}
          {!running && missing > 0 && (
            <button className="ui-btn" onClick={() => onJob("carousel_slide", { num: "missing" })} style={{ ...btn(alpha(C.orange, 0.1), C.text, `1px solid ${alpha(C.orange, 0.4)}`), width: "100%", marginTop: 10 }}>
              طراحی {missing} اسلاید باقی‌مانده
            </button>
          )}

          {carousel.caption && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text3, letterSpacing: 0.5 }}>CAPTION</span>
                <button
                  className="ui-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(carousel.caption);
                    setCopiedCap(true);
                    setTimeout(() => setCopiedCap(false), 1400);
                  }}
                  style={{ background: copiedCap ? C.success : alpha(C.orange, 0.14), color: copiedCap ? "#fff" : C.orange, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {copiedCap ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <div dir="rtl" style={{ fontFamily: fa, fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto" }}>{carousel.caption}</div>
            </div>
          )}

          {drawn > 0 && !running && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {caps.telegram?.review !== false && (
                <button className="ui-btn" disabled={sending} onClick={() => send("review")} style={{ ...btn(alpha(C.teal, 0.12), C.text, `1px solid ${alpha(C.teal, 0.4)}`), flex: 1, minWidth: 160, opacity: sending ? 0.6 : 1 }}>
                  {sent.review ? "✓ " : "✈ "}کانال بررسی تیم
                  {sent.review && <div style={{ fontSize: 10.5, fontWeight: 500, color: C.text3 }}>sent {when(sent.review)}</div>}
                </button>
              )}
              {caps.telegram?.public !== false && (
                <button className="ui-btn" disabled={sending} onClick={() => send("public")} style={{ ...btn(sent.public ? alpha(C.success, 0.12) : C.orange, sent.public ? C.success : "#fff", sent.public ? `1px solid ${alpha(C.success, 0.5)}` : "none"), flex: 1, minWidth: 160, opacity: sending ? 0.6 : 1 }}>
                  {sent.public ? "✓ " : "📢 "}انتشار در @sugimotovisa
                  {sent.public && <div style={{ fontSize: 10.5, fontWeight: 500 }}>published {when(sent.public)}</div>}
                </button>
              )}
            </div>
          )}
          {sending && <div className="ui-pulse" style={{ marginTop: 8, fontSize: 12, color: C.text3, textAlign: "center", fontFamily: fa }}>در حال ارسال به تلگرام…</div>}
          {sendErr && <div style={{ marginTop: 8, fontSize: 11.5, color: C.reject, textAlign: "center", direction: "ltr" }}>⚠️ {sendErr}</div>}
        </div>
      )}
    </div>
  );
}

// English video through the team's video workflow. Shown now so the place is
// ready; it starts working when the server has VIDEO_WORKFLOW_URL.
function VideoPanel({ job, enabled, onStart }) {
  const running = !!job && job.status === "running";
  const state = !job ? "" : job.status === "running" ? "running" : job.status === "error" ? "error" : "done";
  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="ui-btn"
        onClick={enabled && !running ? onStart : undefined}
        disabled={!enabled || running}
        title={enabled ? "Send the English script to the video workflow" : "The video workflow will be connected later"}
        style={{
          width: "100%", background: enabled ? alpha(C.slate, 0.08) : C.surfaceHi, color: enabled ? C.text : C.text3,
          border: `1px ${enabled ? "solid" : "dashed"} ${C.line}`, borderRadius: 12, padding: "12px", fontWeight: 600,
          fontSize: 13.5, cursor: enabled && !running ? "pointer" : "default", fontFamily: "'Inter', 'Vazirmatn', sans-serif",
        }}
      >
        🎬 English video (Anthropic workflow)
        {!enabled ? " — coming soon" : state === "running" ? " — sending…" : state === "done" ? " — requested ✓" : ""}
      </button>
      {state === "error" && <div style={{ marginTop: 6, fontSize: 11.5, color: C.reject, textAlign: "center" }}>⚠️ {job.error}</div>}
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


function BackBtn({ onClick, label = "Deck" }) {
  return (
    <button className="ui-btn ui-glass" onClick={onClick} style={{ border: `1px solid ${C.line}`, color: C.text, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', 'Vazirmatn', sans-serif", borderRadius: 99, padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      ← {label}
    </button>
  );
}


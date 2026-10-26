"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isUntrusted } from "../lib/trust";
import { sameTopic } from "../lib/similar";
import CalendarStrip from "./CalendarStrip";
import CalendarButtons from "./CalendarButtons";
import DrivePicker from "./DrivePicker";
import { AppBar, barStyles } from "./editing/ui";
import { TEMPLATES } from "../lib/carousel-templates";
import VisaResults from "./VisaResults";
import StoryDesigner from "./StoryDesigner";
import { STORY_TEMPLATES } from "../lib/story/templates";
import { L, uiDir, isFa } from "../lib/i18n";
import { LOOKS, DEFAULT_LOOK, isLook, lookForBenchmark } from "../lib/video-looks";
import { STORY_BACKGROUNDS, STORY_BG_ORDER, STORY_BG_NAMES, isHexColour } from "../lib/story/colours";
import { Check, Clapperboard, FileText, GalleryHorizontal, Images, Lightbulb, Link2, Megaphone, Search, Mail, Newspaper, Pin, PinOff, RefreshCw, Send, Smartphone, Sparkles, X } from "lucide-react";

/* ============================================================
   SUGIMOTO VISA — Video Topic Engine
   - Pulls this week's live Canada/Europe immigration news
   - One topic per card, swipe/accept/reject (Tinder-style)
   - On approve: writes a full Reel script in Farsi + English;
     Telegram, article, carousel and the English video are separate steps
   Claude API calls run server-side (see /app/api/*) so the
   API key never reaches the browser.
   ============================================================ */

const C = {
  // Palette B (globals.css), main colour the logo's slate #32515d: orange and
  // orangeDeep keep their names but are the action slate; the logo's orange is logoOrange.
  ground: "#f7f5f0",       // page background (sand)
  surface: "#ffffff",      // cards, rows, panels
  surfaceHi: "#efebe3",    // tracks, hover, subtle fills
  line: "#e5e0d5",         // hairline borders
  text: "#14231f",         // primary text
  text2: "#52605b",        // secondary text
  text3: "#7d8984",        // tertiary text / labels
  ink: "#14231f",          // text on cards (same as text in the light theme)
  inkSoft: "#52605b",
  creamEdge: "#e5e0d5",
  slate: "#334155",
  teal: "#0e8a99",         // links, info
  orange: "#32515d",       // action colour (the logo's slate)
  orangeDeep: "#243b44",
  logoOrange: "#ea580c",
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
  "Work Permit": { emoji: "🛂", label: ["مجوز کار", "Work Permit"], color: "#0e8a99" },
  PNP: { emoji: "📍", label: "PNP", color: "#d9770a" },
  "Express Entry": { emoji: "⚡", label: "Express Entry", color: "#b8890b" },
  Study: { emoji: "🎓", label: ["تحصیل / PGWP", "Study / PGWP"], color: "#6d5bd0" },
  LMIA: { emoji: "📄", label: "LMIA", color: "#d6458f" },
  Policy: { emoji: "📢", label: ["سیاست‌ها", "Policy"], color: "#2f6fd6" },
  Court: { emoji: "⚖️", label: ["دادگاه", "Court"], color: "#9a7a2c" },
  Europe: { emoji: "🇪🇺", label: ["اروپا", "Europe"], color: "#4560d8" },
  Citizenship: { emoji: "🪪", label: ["شهروندی", "Citizenship"], color: "#12945e" },
  Family: { emoji: "👪", label: ["خانواده", "Family"], color: "#d64f80" },
};
// Labels are pairs; read in the chosen language each time a card is drawn.
function fieldOf(t) {
  const f = FIELDS[t && t.field];
  if (f) return { ...f, label: L(f.label) };
  return { emoji: "•", label: (t && t.field) || L("موضوع", "Topic"), color: "#8fa3ab" };
}


// Topics arrive as a stream, one card per line, so the first card can be
// shown while the rest are still being written. Falls back to reading the
// whole body at once where a browser cannot read a stream.
async function streamTopics(exclude, force, { onTopic, onStats }, shown = []) {
  const res = await fetch("/api/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exclude, force, stream: true, shown }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  let error = "";
  let generating = false;
  const handle = (line) => {
    if (!line.trim()) return;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch (_) {
      return;
    }
    if (ev.type === "topic" && ev.topic) onTopic(ev.topic);
    else if (ev.type === "stats") {
      onStats(ev.stats || null);
      if (ev.generating) generating = true; // the server is still writing a newer batch
    }
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
  return { error, generating };
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

// A topic opened in a new tab (right-click → open in new tab) travels by its
// key in the address; the card itself is handed over through this device's
// storage, so a new idea that is not in the workspace yet still opens.
const HANDOFF_KEY = "sugimoto_handoff_v1";
function handOff(topic) {
  try {
    const m = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "{}");
    m[topicKey(topic)] = { topic, at: Date.now() };
    const keep = Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, 30);
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch (_) {}
}
function handedOff(key) {
  try {
    const m = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "{}");
    return (m[key] && m[key].topic) || null;
  } catch (_) {
    return null;
  }
}
function topicHref(t) {
  return "/?t=" + encodeURIComponent(topicKey(t));
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
  const [savedStory, setSavedStory] = useState(null);
  const [savedTg, setSavedTg] = useState(null); // the news post as saved (text, picture, when sent)
  const [savedVideo, setSavedVideo] = useState(null);
  // The language content is made in on the topic page; the English versions are saved apart.
  const [contentLang, setContentLang] = useState("fa");
  const [savedEn, setSavedEn] = useState({});
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [caps, setCaps] = useState({ carousel: true, story: true, telegram: { review: true, public: true }, video: false });

  // The signed-in person (one login for the whole app): which other parts the header links to.
  const [me, setMe] = useState(null);
  useEffect(() => {
    fetch("/api/editing/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setMe(d && d.enabled ? d.user : null);
        setTeachFlag(!!(d && d.enabled && d.user && (d.user.role === "admin" || (d.user.ax || []).includes("learn"))));
      })
      .catch(() => {});
  }, []);
  const ax = (me && me.ax) || [];
  const signOut = async () => {
    await fetch("/api/editing/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/editing/login";
  };

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
      const base = kind.replace(/@en$/, "");
      const sfx = kind.endsWith("@en") ? "@en" : "";
      // A new article makes any earlier draft/Word-file result stale.
      if (base === "article") {
        delete entry["publish" + sfx];
        delete entry["docfile" + sfx];
      }
      // A new carousel replaces the earlier one and what was done to it.
      if (base === "carousel") {
        delete entry["carousel_slide" + sfx];
        delete entry["carousel_send" + sfx];
      }
      if (base === "story") {
        delete entry["story_draw" + sfx];
        delete entry["story_page" + sfx];
        delete entry["story_photo" + sfx];
        delete entry["story_send" + sfx];
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
      if (!res.ok || !data.job) throw new Error(data.error || L("شروع نشد", "could not start"));
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
            patchJob(key, j.kind, { status: "error", error: L("شروع نشد؛ دوباره امتحان کن.", "It did not start. Try again.") });
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
          patchJob(local.key, local.kind, { status: "error", error: L("سرور در حین کار ری‌استارت شد. دوباره امتحان کن.", "The server restarted mid-job. Try again.") });
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
        // English steps ("carousel@en") mark the same list badges as the Persian ones.
        const rk = remote.kind.replace(/@en$/, "");
        if (rk === "script") patchWs(t, { status: "active", materials: { script: { ts: now } } });
        else if (rk === "article") patchWs(t, { materials: { article: { ts: now } } });
        else if (rk === "telegram" || rk.startsWith("telegram_")) patchWs(t, { materials: { telegram: { ts: now } } });
        else if (rk === "video") patchWs(t, { status: "active", materials: { video: { ts: now, status: r.status || "requested" } } });
        else if (rk === "carousel" || rk === "carousel_slide") {
          patchWs(t, { materials: { carousel: { ts: now, count: (r.slides || []).length, sent: r.sent || {} } } });
        } else if (rk === "carousel_send") {
          const cur = ((wsRef.current[local.key] || {}).materials || {}).carousel || {};
          patchWs(t, { materials: { carousel: { ...cur, sent: r.sent || {} } } });
        } else if (rk === "story" || rk === "story_draw" || rk === "story_page" || rk === "story_photo") {
          patchWs(t, { materials: { story: { ts: now, count: (r.pages || []).length, sent: r.sent || {} } } });
        } else if (rk === "story_send") {
          const cur = ((wsRef.current[local.key] || {}).materials || {}).story || {};
          patchWs(t, { materials: { story: { ...cur, sent: r.sent || {} } } });
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
      if (m === "lexbase" || m === "ideas" || m === "studio") setDeckModeState(m);
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
  // The server writes a batch whether or not this page is open; this page only watches it. Leaving
  // stops the watching, never the writing, and coming back picks up whatever was written meanwhile.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

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

    // Everything already on this list, so the server writes only stories that are not here yet.
    const listed = [...topicsRef.current, ...loadDeckCache()];
    const shownList = listed.slice(-200).flatMap((t) => [{ u: t.source_url, t: t.source_title || "" }]);

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
      }, shownList);
      if (!shown && r.error) throw new Error(r.error);
      // A newer batch is still being written on the server: keep adding its cards as they appear.
      for (let n = 0; r.generating && n < 100 && aliveRef.current; n++) {
        await new Promise((ok) => setTimeout(ok, 4000));
        if (!aliveRef.current) break;
        const d = await fetch("/api/topics?deck=1", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (!d) continue;
        for (const t of d.topics || []) {
          if (!fresh(t)) continue;
          setTopics((prev) => (prev.some((x) => same(x, t)) ? prev : [...prev, t]));
          shown++;
        }
        if (d.stats) setDeckStats(d.stats);
        if (!d.generating) break;
      }
    } catch (e) {
      // Ideas already on screen stay; only an empty list shows the error.
      if (!shown) {
        setTopicError(L("نتونستم اخبار تازه رو بیارم. دوباره «تازه‌سازی» رو بزن.", "Could not load fresh news. Press Refresh again."));
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
  // that topic, with its state. Cards that report the same story in other
  // words (often written in different runs) are merged into one row that
  // lists every source; two topics that both have material stay apart.
  const listTopics = useMemo(() => {
    const byUrl = new Map();
    for (const e of Object.values(ws)) {
      const u = urlKey(e.topic);
      if (u && !byUrl.has(u)) byUrl.set(u, e);
    }
    const cands = [];
    const keys = new Set();
    const urls = new Set();
    const add = (t, ts, used, made = 0) => {
      const k = topicKey(t);
      const u = urlKey(t);
      if (!k || keys.has(k) || (u && urls.has(u))) return;
      keys.add(k);
      if (u) urls.add(u);
      cands.push({ t: ts || made ? { ...t, ...(ts ? { _ts: ts } : {}), ...(made ? { _made: made } : {}) } : t, used });
    };
    for (const t of topics) {
      const e = ws[topicKey(t)] || byUrl.get(urlKey(t));
      if (e) add({ ...t, ...e.topic }, e.updatedAt, true, e.createdAt);
      else add(t, 0, false);
    }
    for (const e of Object.values(ws)) add(e.topic, e.updatedAt, true, e.createdAt);

    // The row is shown under its best card: the one with material, else the
    // one written from full text, else the higher-scored.
    const rank = (c) => (c.used ? 1000 : 0) + (c.t.grounding === "headline" ? 0 : 100) + (Number(c.t.score) || 0);
    const groups = [];
    for (const c of cands) {
      const g = groups.find((g) => !(g.used && c.used) && g.members.some((m) => sameTopic(m.t, c.t)));
      if (!g) {
        groups.push({ used: c.used, members: [c] });
        continue;
      }
      g.members.push(c);
      g.used = g.used || c.used;
    }
    return groups.map((g) => {
      const members = g.members.slice().sort((a, b) => rank(b) - rank(a));
      const lead = members[0].t;
      if (members.length === 1) return lead;
      const also = members.slice(1).map((m) => ({ url: m.t.source_url || "", name: m.t.source_name || "" })).filter((x) => x.url);
      return { ...lead, _also: also, coverage: Math.max(Number(lead.coverage) || 1, 1) + also.length };
    });
  }, [topics, ws]);
  // Topics made from the editor's own links and pictures live in Studio, not in the news list.
  const studioTopics = useMemo(() => listTopics.filter((t) => t.custom), [listTopics]);
  const newsTopics = useMemo(() => listTopics.filter((t) => !t.custom), [listTopics]);

  // ---- decisions ----------------------------------------------------------
  // Approve: the server writes the scripts as a job, and the topic becomes
  // "used" for everyone. Telegram is a separate choice on the topic page.
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
  const listScrollRef = useRef(0);
  // A card made from the editor's links joins the list (and is
  // already in the shared workspace, so the team sees it too).
  const customJob = (bg[CUSTOM_NEWS_KEY] || {}).custom_news;
  const customDoneRef = useRef("");
  useEffect(() => {
    if (!customJob || customJob.status !== "done" || !customJob.result || !customJob.result.topic) return;
    if (customDoneRef.current === customJob.id) return;
    customDoneRef.current = customJob.id;
    const t = customJob.result.topic;
    setTopics((prev) => [t, ...prev.filter((x) => topicKey(x) !== topicKey(t))]);
    patchWs(t, { status: "new" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customJob && customJob.status, customJob && customJob.id]);

  // Cards from research (one idea, or several ideas on a subject) join the list the same way.
  const researchJob = (bg[RESEARCH_KEY] || {}).research;
  const researchDoneRef = useRef("");
  useEffect(() => {
    if (!researchJob || researchJob.status !== "done" || !researchJob.result || !(researchJob.result.topics || []).length) return;
    if (researchDoneRef.current === researchJob.id) return;
    researchDoneRef.current = researchJob.id;
    const ts = researchJob.result.topics;
    const keys = new Set(ts.map(topicKey));
    setTopics((prev) => [...ts, ...prev.filter((x) => !keys.has(topicKey(x)))]);
    for (const t of ts) patchWs(t, { status: "new" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchJob && researchJob.status, researchJob && researchJob.id]);

  const openTopic = (topic, { push = true } = {}) => {
    const key = topicKey(topic);
    if (view === "deck") listScrollRef.current = window.scrollY || 0;
    handOff(topic); // so a reload or Forward to this address finds it
    // A history entry per opened topic, so the browser's Back button returns
    // to the list instead of leaving the app.
    if (push) {
      try {
        window.history.pushState({ t: key }, "", topicHref(topic));
      } catch (_) {}
    }
    const e = wsRef.current[key];
    const t = e ? { ...topic, ...e.topic } : topic;
    openKeyRef.current = key;
    setScriptTopic(t);
    setScripts({ fa: "", en: "" });
    setInitialArticle(null);
    setSavedCarousel(null);
    setSavedStory(null);
    setSavedTg(null);
    setSavedEn({});
    setSavedVideo(null);
    setScriptError(null);
    setScriptTab("fa");
    setView("script");
    try {
      window.scrollTo(0, 0);
    } catch (_) {}
    // Always ask the server: a teammate (or a job this page lost track of)
    // may have saved material that this device's copy does not show yet.
    setLoadingSaved(true);
    loadSaved(key).finally(() => openKeyRef.current === key && setLoadingSaved(false));
  };

  // The open topic's saved material. `only` limits it to the parts that change
  // without this page doing anything (the video workflow reports back).
  const loadSaved = (key, only = null) =>
    fetch("/api/workspace?key=" + encodeURIComponent(key), { cache: "no-store" })
      .then((r) => r.json())
      .then(({ entry }) => {
        if (!entry || openKeyRef.current !== key) return;
        const m = entry.materials || {};
        if (!only) {
          if (m.script) setScripts({ fa: m.script.script_fa || "", en: m.script.script_en || "", hooks_fa: m.script.hooks_fa || [], hooks_en: m.script.hooks_en || [], sources: m.script.sources || [], supplement: m.script.supplement || null, before_check: !("sources" in m.script) });
          if (m.article) setInitialArticle(m.article.article || null);
          if (m.carousel) setSavedCarousel(m.carousel);
          if (m.story) setSavedStory(m.story);
          if (m.telegram) setSavedTg(m.telegram);
          setSavedEn({ article: (m.article_en && m.article_en.article) || null, carousel: m.carousel_en || null, story: m.story_en || null, telegram: m.telegram_en || null });
        }
        if (m.video) setSavedVideo(m.video);
      })
      .catch(() => {});

  // Back to the list, where you were in it.
  const showList = () => {
    setView("deck");
    openKeyRef.current = "";
    const y = listScrollRef.current;
    setTimeout(() => {
      try {
        window.scrollTo(0, y);
      } catch (_) {}
    }, 30);
  };
  const backToList = () => {
    try {
      if (window.history.state && window.history.state.t) {
        window.history.back(); // the popstate handler shows the list
        return;
      }
      window.history.replaceState(null, "", "/");
    } catch (_) {}
    showList();
  };

  // A topic by its key, from wherever this page knows it.
  const findTopic = (key) => {
    const e = wsRef.current[key];
    if (e) return e.topic;
    const t = topicsRef.current.find((x) => topicKey(x) === key);
    return t || handedOff(key);
  };

  // Browser Back / Forward between the list and opened topics.
  useEffect(() => {
    const onPop = () => {
      let key = "";
      try {
        key = new URLSearchParams(window.location.search).get("t") || "";
      } catch (_) {}
      const t = key && findTopic(key);
      if (t) openTopicRef.current(t, { push: false });
      else showList();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openTopicRef = useRef(openTopic);
  openTopicRef.current = openTopic;

  // Opened with ?t=<key> (a topic opened in a new tab): show that topic once
  // it is known. Back from it goes to the list, not out of the app.
  const pendingOpenRef = useRef(undefined);
  useEffect(() => {
    if (pendingOpenRef.current === undefined) {
      pendingOpenRef.current = null;
      try {
        const key = new URLSearchParams(window.location.search).get("t");
        if (key) {
          pendingOpenRef.current = key;
          window.history.replaceState(null, "", "/");
          window.history.pushState({ t: key }, "", "/?t=" + encodeURIComponent(key));
          // Not found by then (an idea that has expired): stay on the list.
          setTimeout(() => (pendingOpenRef.current = null), 20000);
        }
      } catch (_) {}
    }
    const key = pendingOpenRef.current;
    if (!key) return;
    const t = findTopic(key);
    if (t) {
      pendingOpenRef.current = null;
      openTopic(t, { push: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, topics]);

  const navBtn = {
    height: 38, minWidth: 38, padding: "0 11px", borderRadius: 12, boxSizing: "border-box",
    background: C.surface, color: C.text, border: `1px solid ${C.line}`,
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', 'Vazirmatn', sans-serif",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap",
  };

  const wrap = {
    minHeight: "100vh",
    fontFamily: "'Geist', 'Vazirmatn', system-ui, sans-serif",
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
  const viewScripts = sjResult ? { fa: sjResult.fa || "", en: sjResult.en || "", hooks_fa: sjResult.hooks_fa || [], hooks_en: sjResult.hooks_en || [], sources: sjResult.sources || [], supplement: sjResult.supplement || null } : { ...scripts };
  // A rewritten English script (into English, or to a length) replaces the
  // one on screen, unless it was a draft for the video editor only.
  const enJob = svJobs.script_en;
  const enRewrite = enJob && !(enJob.extra && enJob.extra.save === false) ? enJob : null;
  if (enRewrite && enRewrite.status === "done" && enRewrite.result && enRewrite.result.en) viewScripts.en = enRewrite.result.en;
  // A script rewritten by the team's note (one job per language) replaces that language's script
  // and its opening lines, when it is newer than whatever wrote them.
  const fixJobs = { fa: svJobs.script_fix || null, en: svJobs["script_fix@en"] || null };
  for (const l of ["fa", "en"]) {
    const fj = fixJobs[l];
    const newer = Math.max((sj && sj.startedAt) || 0, l === "en" ? (enRewrite && enRewrite.startedAt) || 0 : 0);
    if (fj && fj.status === "done" && fj.result && fj.result.text && (fj.startedAt || 0) >= newer) {
      viewScripts[l] = fj.result.text;
      viewScripts["hooks_" + l] = fj.result.hooks || [];
    }
  }
  const viewLoading = (!!sj && sj.status === "running" && !sjResult) || (loadingSaved && !viewScripts.fa && !viewScripts.en);
  const viewError =
    sj && sj.status === "error" && !(scripts.fa || scripts.en) && !loadingSaved
      ? L("نوشتن سناریو با خطا مواجه شد (", "Writing the script failed (") + (sj.error || "") + ")"
      : scriptError;
  // The Telegram news post on screen: the newest job result this session
  // (write, save, picture, send), else the saved one.
  // The chosen language's jobs, under their plain kind so the panels need not know.
  const EN = contentLang === "en";
  const sfx = EN ? "@en" : "";
  const LJ = (k) => (svJobs[k + sfx] ? { ...svJobs[k + sfx], kind: k } : null);
  const savedTgL = EN ? savedEn.telegram : savedTg;
  let tgPost = savedTgL && (savedTgL.text || savedTgL.image_url || savedTgL.sent) ? savedTgL : null;
  let tgJob = null;
  for (const kind of ["telegram_write", "telegram_save", "telegram_image", "telegram_send"]) {
    const j = LJ(kind);
    if (!j) continue;
    if (!tgJob || (j.startedAt || 0) > (tgJob.startedAt || 0)) tgJob = j;
  }
  for (const kind of ["telegram_write", "telegram_save", "telegram_image", "telegram_send"]) {
    const j = LJ(kind);
    if (j && j.status === "done" && j.result && (!tgPost || (j.startedAt || 0) >= (tgPost._at || 0))) tgPost = { ...j.result, _at: j.startedAt || 0 };
  }

  // The video: the newest request this session, else the saved record (which
  // the workflow keeps up to date through its callback).
  const vj = svJobs.video || null;
  let video = savedVideo;
  if (vj && vj.status === "done" && vj.result && (!video || (vj.result.requested_at || 0) > (video.requested_at || 0))) video = vj.result;

  // The carousel on screen: the newest job result this session, else the
  // saved one. `sent` merges what was sent since.
  let carousel = EN ? savedEn.carousel || null : savedCarousel;
  let carouselJob = null;
  for (const kind of ["carousel", "carousel_slide"]) {
    const j = LJ(kind);
    if (!j) continue;
    if (!carouselJob || (j.startedAt || 0) > (carouselJob.startedAt || 0)) carouselJob = j;
  }
  if (carouselJob && carouselJob.result && (carouselJob.result.slides || []).length) carousel = carouselJob.result;
  const sendJob = LJ("carousel_send");
  if (carousel && sendJob && sendJob.status === "done" && sendJob.result && sendJob.result.sent) {
    carousel = { ...carousel, sent: { ...(carousel.sent || {}), ...sendJob.result.sent } };
  }

  // The story, the same way as the carousel.
  let story = EN ? savedEn.story || null : savedStory;
  let storyJob = null;
  for (const kind of ["story", "story_draw", "story_page", "story_photo"]) {
    const j = LJ(kind);
    if (!j) continue;
    if (!storyJob || (j.startedAt || 0) > (storyJob.startedAt || 0)) storyJob = j;
  }
  if (storyJob && storyJob.result && (storyJob.result.pages || []).length) story = storyJob.result;
  const storySendJob = LJ("story_send");
  if (story && storySendJob && storySendJob.status === "done" && storySendJob.result && storySendJob.result.sent) {
    story = { ...story, sent: { ...(story.sent || {}), ...storySendJob.result.sent } };
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
    for (const kind of ["script", "article", "carousel", "story", "video"]) {
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
      <LearnNotice />
      {/* Signed in: the same dark bar as the calendar and Video Editing, so the app reads as one.
          Without accounts the Topic Engine keeps its own frosted header. */}
      {me ? (
        <div style={{ position: "sticky", top: 0, zIndex: 40, alignSelf: "stretch", margin: "-12px -16px 14px" }}>
          <AppBar
            me={{ loading: false, enabled: true, user: me }}
            actions={
              <>
                <a href="/content-wizard" className={barStyles.actBtn} title={L("ویزارد محتوا", "Content Wizard")}>
                  <Sparkles size={16} aria-hidden /> <span className={barStyles.actLabel}>{L("ویزارد", "Wizard")}</span>
                </a>
                <button
                  className={barStyles.actBtn}
                  onClick={() => {
                    if (view !== "deck") backToList();
                    loadTopics(true);
                    loadWorkspace();
                  }}
                  disabled={loadingTopics || streaming}
                  title={L("گرفتن موضوع‌های تازه", "Get fresh topics")}
                >
                  <RefreshCw size={16} className={loadingTopics || streaming ? "ui-spin" : ""} aria-hidden />
                  <span className={barStyles.actLabel}>{loadingTopics || streaming ? L("در حال بارگذاری…", "Loading…") : L("تازه‌سازی", "Refresh")}</span>
                </button>
              </>
            }
          />
        </div>
      ) : (
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
          <img src="/brand/logo-on-light.png" alt="Sugimoto Visa" style={{ height: 28, width: "auto", display: "block", flexShrink: 0 }} />
          <div dir={uiDir()} style={{ fontSize: 11.5, color: C.text3, fontWeight: 600, lineHeight: 1.2, minWidth: 0, borderLeft: `1px solid ${C.line}`, paddingLeft: 10 }}>{L("تاپیک انجین", "Topic Engine")}</div>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <a href="/content-wizard" className="ui-btn" aria-label={L("ویزارد محتوا", "Content Wizard")} title={L("ویزارد محتوا", "Content Wizard")} style={{ ...navBtn, textDecoration: "none", color: C.text }}>
            ✨ <span className="ui-wide">{L("ویزارد", "Wizard")}</span>
          </a>
          <AppMenu me={me} ax={ax} navBtn={navBtn} onSignOut={signOut} />
          <button
            onClick={() => {
              if (view !== "deck") backToList();
              loadTopics(true);
              loadWorkspace();
            }}
            disabled={loadingTopics || streaming}
            className="ui-btn"
            aria-label={L("تازه‌سازی موضوع‌ها", "Refresh topics")}
            title={L("گرفتن موضوع‌های تازه", "Get fresh topics")}
            style={{ ...navBtn, opacity: loadingTopics || streaming ? 0.6 : 1, cursor: loadingTopics || streaming ? "default" : "pointer" }}
          >
            <span className={loadingTopics || streaming ? "ui-spin" : ""} style={{ display: "inline-block" }}>⟳</span>
            <span className="ui-wide">{loadingTopics || streaming ? L("در حال بارگذاری…", "Loading…") : L("تازه‌سازی", "Refresh")}</span>
          </button>
        </nav>
      </header>
      )}

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

          {deckMode === "ideas" ? (
            <IdeasSection
              decisions={decisions}
              jobs={bg}
              ws={ws}
              onApprove={approveTopic}
              onReject={rejectTopic}
              onRestore={restoreTopic}
              onOpen={openTopic}
              onRetry={(t) => startJob("script", t, { topic: t })}
            />
          ) : deckMode === "studio" ? (
            <StudioSection
              topics={studioTopics}
              listProps={{ decisions, jobs: bg, ws, onApprove: approveTopic, onReject: rejectTopic, onRestore: restoreTopic, onOpen: openTopic, onRetry: (t) => startJob("script", t, { topic: t }) }}
              research={
                <ResearchBox
                  defaultOpen
                  job={(bg[RESEARCH_KEY] || {}).research || null}
                  onStart={(mode, query) => startJob("research", { title_fa: RESEARCH_KEY }, { mode, query, count: 6 })}
                  onOpen={openTopic}
                />
              }
              own={
                <CustomNewsBox
                  defaultOpen
                  job={(bg[CUSTOM_NEWS_KEY] || {}).custom_news || null}
                  onStart={(links, note, images) => startJob("custom_news", { title_fa: CUSTOM_NEWS_KEY }, { links, note, images: (images || []).map((i) => ({ name: i.name, data: i.data })) })}
                  onOpen={openTopic}
                />
              }
            />
          ) : deckMode === "lexbase" ? (
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
              {topicError && (
                <div className="ui-fade" style={{ background: alpha(C.reject, 0.1), border: `1px solid ${alpha(C.reject, 0.35)}`, color: C.text, borderRadius: 14, padding: "11px 13px", fontSize: 12.5, marginBottom: 14, fontFamily: "'Vazirmatn', sans-serif", direction: uiDir(), textAlign: isFa() ? "right" : "left" }}>
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
                <div dir={uiDir()} className="ui-progress ui-fade" style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 12, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, color: C.text }}>
                  <span className="ui-pulse">⏳</span> {L("موضوع‌های تازه در حال اضافه شدن به فهرست…", "New topics are being added to the list…")}
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
                  topics={newsTopics}
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
          initialArticle={EN ? savedEn.article || null : initialArticle}
          loading={viewLoading}
          loadingText={
            sj && sj.status === "running" && sj.result && sj.result.stage === "supplement"
              ? L("صفحهٔ اصلی جواب کامل رو نداشت؛ در حال پیدا کردن مطالب تکمیلی از منابع معتبر…", "The main page did not have the full answer; finding more from trusted sources…")
              : loadingSaved && !(sj && sj.status === "running") ? L("در حال بارگذاری محتوای ذخیره‌شده…", "Loading saved material…") : ""
          }
          error={viewError}
          tab={scriptTab}
          setTab={setScriptTab}
          copied={copied}
          onCopy={copy}
          onBack={backToList}
          onWrite={decisions[svKey] === "rejected" ? null : () => approveTopic(scriptTopic)}
          enError={(sjResult && sjResult.enError) || ""}
          enJob={enRewrite}
          fixJobs={fixJobs}
          draftJob={enJob && !enRewrite ? enJob : null}
          tgPost={tgPost}
          tgJob={tgJob}
          articleJob={LJ("article")}
          publishJob={LJ("publish")}
          docJob={LJ("docfile")}
          lang={contentLang}
          setLang={setContentLang}
          carousel={carousel}
          carouselJob={carouselJob}
          sendJob={sendJob}
          story={story}
          storyJob={storyJob}
          storySendJob={storySendJob}
          videoJob={vj}
          video={video}
          onRefreshVideo={() => loadSaved(svKey, "video")}
          caps={caps}
          onJob={(kind, extra) => startJob(LANG_KINDS.includes(kind) ? kind + sfx : kind, scriptTopic, { topic: scriptTopic, ...extra })}
        />
      )}
    </div>
  );
}

// Studio: what the team brings in itself, as three tabs, one shown at a time: research on an idea
// or subject, news from their own links and pictures, and clients' visa results. Each tab lists
// the topics it made (research topics carry `researched`).
const STUDIO_TABS = [
  ["research", Search, ["تحقیق", "Research"], ["روی ایده یا موضوع", "On an idea or subject"]],
  ["own", Link2, ["منابع خودم", "My sources"], ["از لینک و عکس", "From links and pictures"]],
  ["visa", Megaphone, ["خبر ویزا", "Visa news"], ["نتایج ویزای مشتری‌ها", "Clients' visa results"]],
];
function StudioSection({ topics, listProps, research, own }) {
  const [tab, setTabState] = useState("research");
  useEffect(() => {
    try {
      const t = localStorage.getItem("sugimoto_studio_tab_v1");
      if (STUDIO_TABS.some((x) => x[0] === t)) setTabState(t);
    } catch (_) {}
  }, []);
  const setTab = (t) => {
    setTabState(t);
    try {
      localStorage.setItem("sugimoto_studio_tab_v1", t);
    } catch (_) {}
  };
  const fa = "'Vazirmatn', sans-serif";
  const listed = tab === "research" ? topics.filter((t) => t.researched) : tab === "own" ? topics.filter((t) => !t.researched) : [];
  return (
    <div>
      <div dir={uiDir()} role="tablist" style={{ display: "grid", gridTemplateColumns: `repeat(${STUDIO_TABS.length}, 1fr)`, gap: 8, marginBottom: 14 }}>
        {STUDIO_TABS.map(([k, Ic, label, hint]) => {
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              className="ui-btn"
              onClick={() => setTab(k)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 6px", borderRadius: 14, cursor: "pointer",
                border: `1px solid ${on ? C.orange : C.line}`, background: on ? C.orange : C.surface, color: on ? "#fff" : C.text,
                boxShadow: on ? "0 6px 16px rgba(50,81,93,0.25)" : "0 1px 2px rgba(16,24,40,0.05)", transition: "all 0.2s", fontFamily: fa,
              }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", background: on ? "rgba(255,255,255,0.16)" : alpha(C.orange, 0.08) }}>
                <Ic size={18} aria-hidden />
              </span>
              <span style={{ fontWeight: 800, fontSize: 13.5 }}>{L(label)}</span>
              <span style={{ fontSize: 11, opacity: on ? 0.85 : 0.6 }}>{L(hint)}</span>
            </button>
          );
        })}
      </div>
      <div className="ui-fade" key={tab}>
        {tab === "research" && research}
        {tab === "own" && own}
        {tab === "visa" && <VisaResults C={C} learn={{ Toggle: LearnToggle, teach }} />}
        {listed.length > 0 && (
          <>
            <div dir={uiDir()} style={{ fontSize: 13, fontWeight: 800, margin: "6px 0 8px", fontFamily: fa }}>
              {tab === "research" ? L("موضوع‌هایی که از تحقیق ساخته شدن", "Topics made from research") : L("خبرهایی که از منابع خودت ساخته شدن", "News made from your own sources")}
            </div>
            <IdeasList topics={listed} {...listProps} />
          </>
        )}
      </div>
    </div>
  );
}

// List (every topic, new and used) or the Lexbase newsletter section.
// Steps made in the language chosen on the topic page (lib/jobs.js LANG_KINDS).
const LANG_KINDS = ["article", "publish", "telegram_write", "telegram_save", "telegram_image", "telegram_send", "carousel", "carousel_slide", "carousel_send", "story", "story_draw", "story_photo", "story_page", "story_send"];
const MODES = [["list", Newspaper, ["خبرها", "News"]], ["lexbase", Mail, ["Lexbase", "Lexbase"]], ["ideas", Lightbulb, ["ایده‌ها", "Ideas"]], ["studio", Images, ["استودیو", "Studio"]]];
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
      {MODES.map(([m, Ic, label]) => (
        <button
          key={m}
          className="ui-btn"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          style={{
            position: "relative", zIndex: 1, flex: 1, padding: "8px 10px", border: "none", background: "transparent",
            borderRadius: 9, cursor: "pointer", color: mode === m ? C.text : C.text3, fontWeight: 600, fontSize: 13,
            fontFamily: "'Geist', 'Vazirmatn', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          <Ic size={15} aria-hidden />
          {L(label)}
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
// Link behaviour for opening a topic: a plain click opens it here; Ctrl/Cmd/
// Shift-click, middle-click and right-click → "open in new tab" use the link,
// and the card is handed to the new tab through this device's storage.
function openLinkProps(t, onOpen) {
  return {
    onClick: (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        handOff(t);
        return;
      }
      e.preventDefault();
      onOpen && onOpen(t);
    },
    onAuxClick: () => handOff(t),
    onContextMenu: () => handOff(t),
  };
}

// What has been made from a topic, shown on its row so nobody makes it twice.
const MATERIAL_BADGE = {
  script: [["📝 اسکریپت", "📝 Script"], ["اسکریپت نوشته شده", "Scripts written"], "#12945e"],
  article: [["📰 مقاله", "📰 Article"], ["مقالهٔ بلاگ نوشته شده", "Blog article written"], "#0e8a99"],
  carousel: [["🖼 کاروسل", "🖼 Carousel"], ["پست کاروسل ساخته شده", "Carousel post made"], "#6d5bd0"],
  story: [["📱 استوری", "📱 Story"], ["استوری اینستاگرام ساخته شده", "Instagram story made"], "#c2410c"],
  video: [["🎬 ویدیو", "🎬 Video"], ["ویدیو درخواست شده", "Video requested"], "#334155"],
};
const CATEGORIES = [
  ["all", ["همه", "All"], () => true],
  ["ca", ["🇨🇦 کانادا", "🇨🇦 Canada"], (t) => t.page !== "EU"],
  ["eu", ["🇪🇺 اروپا", "🇪🇺 Europe"], (t) => t.page === "EU"],
  ["social", ["شبکه‌های اجتماعی", "Social media"], (t) => isSocialTopic(t)],
  ["web", ["سایت‌ها", "Websites"], (t) => !isSocialTopic(t)],
];

function IdeasList({ topics, decisions, jobs, ws = {}, onApprove, onReject, onRestore, onOpen, onRetry, plain = false }) {
  const [filter, setFilter] = useState("all"); // all | pending | approved | rejected (archive)
  // Pinned topics stay on top while they are being worked on. Kept on this device.
  const [pins, setPins] = useState({});
  useEffect(() => {
    try {
      setPins(JSON.parse(localStorage.getItem("sugimoto_pins_v1") || "{}") || {});
    } catch (_) {}
  }, []);
  const togglePin = (t) => {
    const k = topicKey(t);
    setPins((prev) => {
      const next = { ...prev };
      if (next[k]) delete next[k];
      else next[k] = Date.now();
      try {
        localStorage.setItem("sugimoto_pins_v1", JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };
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
  // Newest first by the news date, whether or not someone is working on the topic. A date still to
  // come (a rule "from November 3") counts as the day the topic appeared, else it would sit on top
  // for weeks. Pinned topics come first, newest pin first, until they are unpinned.
  const today = new Date().toISOString().slice(0, 10);
  const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");
  const when = (t) => (t.date && t.date <= today ? t.date : day(t._made) || (t.date ? today : day(t._ts)));
  const pinAt = (t) => pins[topicKey(t)] || 0;
  if (!plain) rows.sort((a, b) => pinAt(b.t) - pinAt(a.t) || when(b.t).localeCompare(when(a.t)) || a.i - b.i);
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
        <span style={{ minWidth: 18, padding: "0 5px", borderRadius: 99, background: alpha(TONE[k], on ? 0.3 : 0.14), color: on ? C.text : TONE[k], fontSize: 11, fontFamily: "'Geist', 'Vazirmatn', sans-serif" }}>
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
        minWidth: 36, height: 36, padding: "0 11px", borderRadius: 8, cursor: "pointer",
        border: kind === "primary" ? "none" : `1px solid ${kind === "danger" ? alpha(C.reject, 0.5) : C.line}`,
        background: kind === "primary" ? C.orange : kind === "success" ? alpha(C.success, 0.16) : "transparent",
        color: kind === "primary" ? "#fff" : kind === "danger" ? C.reject : kind === "success" ? C.success : C.text,
        fontWeight: 700, fontSize: 13, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  // A real link, like the title: right-click opens the topic in a new tab.
  const openBtn = (t, label) => (
    <a
      href={topicHref(t)}
      {...openLinkProps(t, onOpen)}
      aria-label={L("باز کردن موضوع", "Open topic")}
      className="ui-btn"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 36, height: 36, padding: "0 11px",
        borderRadius: 11, boxSizing: "border-box", textDecoration: "none", border: "none",
        background: alpha(C.success, 0.16), color: C.success, fontWeight: 700, fontSize: 13,
        fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap",
      }}
    >
      {label}
    </a>
  );

  return (
    <div>
      <div dir={uiDir()} style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
        {chip("all", L("همه", "All"))}
        {chip("pending", L("جدید", "New"))}
        {chip("approved", L("ساخته‌شده", "Made"))}
        {chip("rejected", L("🗄 بایگانی", "🗄 Archive"))}
      </div>
      {!plain && <div dir={uiDir()} style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
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
              {L(label)}
              <span style={{ minWidth: 16, padding: "0 4px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.surfaceHi, fontSize: 10.5, fontFamily: "'Geist', sans-serif" }}>
                {catCounts[k]}
              </span>
            </button>
          );
        })}
      </div>}

      {!rows.length && (
        <div dir={uiDir()} className="ui-glass" style={{ textAlign: "center", padding: "30px 0", borderRadius: 16, border: `1px dashed ${C.line}`, color: C.text2, fontFamily: "'Vazirmatn', sans-serif", fontSize: 13 }}>
          {L("موردی در این دسته نیست.", "Nothing in this group.")}
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
                border: `1px solid ${pins[topicKey(t)] ? alpha(C.orange, 0.6) : st === "approved" ? alpha(C.success, 0.35) : C.line}`,
                opacity: st === "rejected" ? 0.45 : 1,
              }}
            >
              {/* topic-type color stripe on the reading-start edge */}
              <div aria-hidden style={{ position: "absolute", top: 8, bottom: 8, right: 0, width: 3, borderRadius: "3px 0 0 3px", background: f.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={topicHref(t)}
                  {...openLinkProps(t, onOpen)}
                  title={(t.title_en ? t.title_en + " — " : "") + L("باز کن (راست‌کلیک: تب جدید)", "open (right-click: new tab)")}
                  style={{
                    fontFamily: "'Vazirmatn', sans-serif", fontWeight: 800, fontSize: 14, lineHeight: 1.5,
                    color: C.text, cursor: "pointer",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    textDecoration: st === "rejected" ? "line-through" : "none",
                  }}
                >
                  {t.title_fa || t.title_en}
                </a>
                {/* The headline as published, so the editor can judge the story before opening it. */}
                {t.title_fa && (t.source_title || t.title_en) && (
                  <div dir="auto" style={{ fontFamily: "'Geist', 'Vazirmatn', sans-serif", fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, color: C.text2, marginTop: 2, textAlign: "right", unicodeBidi: "plaintext", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.source_title || t.title_en}
                  </div>
                )}
                {plain && t.why_now && (
                  <div style={{ fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, lineHeight: 1.6, color: C.text2, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.why_now}
                  </div>
                )}
                {plain && t.evergreen && t.signals && t.signals.length > 0 && (
                  <div dir="ltr" style={{ fontFamily: "'Geist', 'Vazirmatn', sans-serif", fontSize: 11, lineHeight: 1.6, color: C.text3, marginTop: 2, textAlign: "right", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    🔍 {t.signals.join(" · ")}
                  </div>
                )}
                <div dir="ltr" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: "3px 8px", marginTop: 5, fontSize: 11, color: C.text2, fontFamily: "'Geist', 'Vazirmatn', sans-serif" }}>
                  <span style={{ color: f.color, background: alpha(f.color, 0.13), borderRadius: 99, padding: "1px 8px", fontWeight: 600 }}>
                    {f.label}
                  </span>
                  {date && <span>{date}</span>}
                  {t.source_url && (
                    <a href={t.source_url} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, textDecoration: "none" }}>
                      {sourceHost(t.source_url)} ↗
                    </a>
                  )}
                  {(t._also || []).map((x) => (
                    <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" title={L("همین خبر، گزارش‌شده در ", "Same story, also reported by ") + (x.name || sourceHost(x.url))} style={{ color: C.teal, textDecoration: "none", borderLeft: `1px solid ${C.line}`, paddingLeft: 8 }}>
                      + {sourceHost(x.url)} ↗
                    </a>
                  ))}
                  {t.grounding === "headline" && (
                    <span style={{ color: C.orange, border: `1px solid ${alpha(C.orange, 0.5)}`, borderRadius: 99, padding: "0 6px" }}>{L("فقط تیتر", "headline only")}</span>
                  )}
                  {t.outlier >= 2 && (
                    <span title={L("تعامل این پست چند برابرِ پست‌های معمول همین اکانت بوده", "This post's engagement compared with that account's usual posts")} style={{ color: "#7c3aed", background: alpha("#7c3aed", 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>
                      📈 {L(`${t.outlier}× معمول`, `${t.outlier}× usual`)}
                    </span>
                  )}
                  {t.coverage > 1 && (
                    <span title={L("پوشش‌داده‌شده در: ", "Also covered by: ") + (t.outlets || []).join(", ")} style={{ color: "#c2410c", background: alpha("#f97316", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>🔥 {L(`${t.coverage} منبع`, `${t.coverage} sources`)}</span>
                  )}
                  {t.newsletter === "lexbase" && (
                    <span title={L("از خبرنامهٔ Lexbase", "From the Lexbase newsletter") + (t.citation ? " — " + t.citation : "")} style={{ color: "#6d5bd0", background: alpha("#6d5bd0", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>📬 {t.citation || "Lexbase"}</span>
                  )}
                  {t.kind === "court" && (t.outcome === "allowed" || t.outcome === "dismissed") && (
                    <span
                      title={t.outcome === "allowed" ? L("دادگاه درخواست رو پذیرفت", "The Court allowed the application") : L("دادگاه درخواست رو رد کرد", "The Court dismissed the application")}
                      style={{ color: t.outcome === "allowed" ? "#0f7b4b" : "#b42318", background: alpha(t.outcome === "allowed" ? "#12945e" : "#d92d20", 0.12), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}
                    >
                      {t.outcome === "allowed" ? L("✓ پذیرفته شد", "✓ Allowed") : L("✕ رد شد", "✕ Dismissed")}
                    </span>
                  )}
                  {Object.entries(((ws[topicKey(t)] || {}).materials) || {}).map(([k, m]) => MATERIAL_BADGE[k] && (
                    <span key={"m" + k} title={L(MATERIAL_BADGE[k][1])} style={{ color: "#fff", background: MATERIAL_BADGE[k][2], borderRadius: 99, padding: "1px 8px", fontWeight: 700 }}>
                      {L(MATERIAL_BADGE[k][0])}
                      {k === "carousel" && m && m.count ? " " + m.count : ""}
                      {k === "carousel" && m && m.sent && m.sent.public ? L(" · 📢 منتشر شد", " · 📢 published") : ""}
                      {k === "story" && m && m.count > 1 ? " " + m.count : ""}
                    </span>
                  ))}
                  {t.evergreen && (
                    <span title={L("ایدهٔ همیشگی", "Evergreen idea") + (t.signals && t.signals.length ? " — " + t.signals.join(" · ") : "")} style={{ color: "#8a5a00", background: alpha("#f5a623", 0.16), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>💡 {t.format || L("ایده", "idea")}</span>
                  )}
                  {(t.focus || []).map((k) => (
                    <span key={k} style={{ color: "#b42318", background: alpha("#f04438", 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 700 }}>{FOCUS_LABEL[k] ? L(FOCUS_LABEL[k]) : k}</span>
                  ))}
                  {t.social === "instagram" && (
                    <span title={L("از پست اینستاگرام یک تولیدکننده — قبل از نوشتن اسکریپت ادعا رو چک کن", "From a creator's Instagram post — check the claim before scripting")} style={{ color: "#c13584", background: alpha("#c13584", 0.1), borderRadius: 99, padding: "0 7px", fontWeight: 600 }}>📸 @{t.author}</span>
                  )}
                  <span style={{ color: scoreColor, background: alpha(scoreColor === C.text2 ? C.text : scoreColor, 0.12), borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>{score}</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                {!plain && (
                  <button
                    className="ui-btn"
                    onClick={() => togglePin(t)}
                    aria-label={pins[topicKey(t)] ? L("برداشتن سنجاق", "Unpin topic") : L("سنجاق به بالای فهرست", "Pin topic to the top")}
                    title={pins[topicKey(t)] ? L("برداشتن سنجاق", "Unpin topic") : L("سنجاق به بالای فهرست", "Pin topic to the top")}
                    style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${pins[topicKey(t)] ? alpha(C.orange, 0.6) : C.line}`, background: pins[topicKey(t)] ? alpha(C.orange, 0.12) : "transparent", color: pins[topicKey(t)] ? C.orange : C.text3, display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}
                  >
                    {pins[topicKey(t)] ? <PinOff size={15} aria-hidden /> : <Pin size={15} aria-hidden />}
                  </button>
                )}
                {st === "pending" && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {smallBtn(<Check size={16} aria-hidden />, () => onApprove(t), "primary", L("تأیید موضوع", "Approve topic"))}
                    {smallBtn(<X size={16} aria-hidden />, () => onReject(t), "danger", L("رد موضوع", "Reject topic"))}
                  </div>
                )}
                {st === "approved" && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {openBtn(t, job && job.status === "running" ? L("باز کن ⏳", "Open ⏳") : L("باز کن ✓", "Open ✓"))}
                    {job && job.status === "running" && (
                      <span className="ui-pulse" style={{ fontSize: 11, color: C.orange, fontWeight: 700, fontFamily: "'Vazirmatn', sans-serif", whiteSpace: "nowrap" }}>{L("در حال نوشتن…", "Writing…")}</span>
                    )}
                    {job && job.status === "error" && smallBtn(L("⚠ دوباره", "⚠ Retry"), () => onRetry(t), "danger", L("دوباره", "Retry"))}
                  </div>
                )}
                {st === "rejected" && smallBtn("↶", () => onRestore(t), "ghost", L("برگردوندن موضوع", "Restore topic"))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FOCUS_LABEL = { iran: ["⭐ ایران", "⭐ Iran"], study: ["⭐ مجوز تحصیل", "⭐ Study permit"], startup: ["⭐ استارتاپ ویزا", "⭐ Start-up Visa"] };

// The newsletter section: a card for every item of a Lexbase issue, policy
// notes and court decisions alike, with the standing priorities (Iran, study
// permits, Start-up Visa) on top. The server writes the cards in the
// background; this shows the saved copy first and polls until all are in.
// Every issue's cards are kept on this device, so past issues stay on the
// platform and show at once; the server adds what is new.
const LEX_KEY = "sugimoto_lexbase_v2";
const LEX_GROUPS = [
  ["all", ["همه", "All"], () => true],
  ["focus", ["⭐ اولویت‌ها", "⭐ Priorities"], (t) => (t.focus || []).length > 0],
  ["policy", ["📋 فکت‌ها و سیاست‌ها", "📋 Facts and policy"], (t) => t.kind !== "court"],
  ["court", ["⚖️ پرونده‌های دادگاه", "⚖️ Court cases"], (t) => t.kind === "court"],
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

      <div dir={uiDir()} className="ui-glass" style={{ ...font, marginBottom: 12, padding: "11px 13px", borderRadius: 14, border: `1px solid ${alpha("#6d5bd0", 0.3)}`, background: alpha("#6d5bd0", 0.06), fontSize: 12.5, lineHeight: 1.8, color: C.text }}>
        {iss && iss.total != null ? (
          <>
            <b>📬 {iss.subject || "Lexbase " + iss.key}</b>
            <br />
            {L(`${iss.policy} فکت و سیاست · ${iss.court} پروندهٔ دادگاه · ${iss.priority} مورد اولویت‌دار (ایران، مجوز تحصیل، استارتاپ ویزا)`, `${iss.policy} facts and policy · ${iss.court} court cases · ${iss.priority} priority items (Iran, study permits, Start-up Visa)`)}
            {writing && cards.length < iss.total ? (
              <div className="ui-pulse" style={{ color: "#6d5bd0", fontWeight: 700 }}>
                ⏳ {L(`${cards.length} از ${iss.total} موضوع نوشته شده…`, `${cards.length} of ${iss.total} topics written…`)}
              </div>
            ) : null}
          </>
        ) : iss ? (
          <span className="ui-pulse">⏳ <b>{iss.subject}</b> — {L("در حال خواندن این شماره… (اولین بار حدود یک دقیقه)", "Reading this issue… (about a minute the first time)")}</span>
        ) : data && data.pending ? (
          <span className="ui-pulse">⏳ {L("در حال خواندن خبرنامه از ایمیل…", "Reading the newsletter from email…")}</span>
        ) : data ? (
          <span>{L("هیچ شماره‌ای از Lexbase در ایمیل پیدا نشد.", "No Lexbase issue found in the mailbox.")} {data.mailbox}</span>
        ) : (
          <span className="ui-pulse">⏳ {L("در حال بارگذاری…", "Loading…")}</span>
        )}
        {err && <div dir="ltr" style={{ fontSize: 11, color: C.reject, textAlign: "left" }}>{err}</div>}
      </div>

      {cards.length > 0 && (
        <div dir={uiDir()} style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {LEX_GROUPS.map(([k, label, test]) => {
            const on = group === k;
            return (
              <button key={k} className="ui-btn" onClick={() => setGroup(k)} style={{ ...font, padding: "5px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? C.text : C.line}`, background: on ? C.text : C.surface, color: on ? "#fff" : C.text2, fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {L(label)}
                <span style={{ minWidth: 16, padding: "0 4px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.surfaceHi, fontSize: 10.5, fontFamily: "'Geist', sans-serif" }}>{visible.filter(test).length}</span>
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

// General ideas: evergreen topics built from what people keep asking (Google
// searches in Persian and English, YouTube, IRCC's Help Centre, Reddit), each
// grounded on an official page. Batches are made on the server about weekly
// and kept for everyone; the button asks for a new batch now.
const IDEA_GROUPS = [
  ["all", ["همه", "All"], () => true],
  ["study", ["🎓 تحصیل", "🎓 Study"], (t) => t.subject === "study" || t.subject === "pgwp"],
  ["work", ["🛂 کار", "🛂 Work"], (t) => t.subject === "work"],
  ["family", ["👪 خانواده", "👪 Family"], (t) => t.subject === "family"],
  ["pr", ["⚡ اقامت و شهروندی", "⚡ PR and citizenship"], (t) => ["express", "pnp", "citizenship", "suv"].includes(t.subject)],
  ["other", ["🌐 ویزا و پرونده", "🌐 Visas and files"], (t) => ["visit", "refusal"].includes(t.subject)],
];

// The last ideas seen on this device show at once; the server's answer
// replaces them when it arrives (after a restart that can take a while).
const IDEAS_KEY = "sugimoto_ideas_v1";
function loadIdeasCache() {
  try {
    const d = JSON.parse(localStorage.getItem(IDEAS_KEY) || "null");
    return d && Array.isArray(d.ideas) ? d : null;
  } catch (_) {
    return null;
  }
}

function IdeasSection({ decisions, ...actions }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    const c = loadIdeasCache();
    if (c) setData((d) => d || c);
  }, []);
  const [err, setErr] = useState("");
  const [group, setGroup] = useState("all");
  const [asking, setAsking] = useState(false);
  const font = { fontFamily: "'Vazirmatn', sans-serif" };

  useEffect(() => {
    let stop = false;
    let timer = null;
    const load = async () => {
      try {
        const r = await fetch("/api/ideas", { cache: "no-store" });
        const j = await r.json();
        if (stop) return;
        if (j.error && !j.ideas) throw new Error(j.error);
        // An empty answer while the server is still reading its memory must
        // not wipe the ideas already on screen.
        setData((prev) => (prev && prev.ideas && prev.ideas.length && !(j.ideas || []).length && !j.generating ? { ...prev, signals: j.signals || prev.signals, generating: false } : j));
        if ((j.ideas || []).length) {
          try {
            localStorage.setItem(IDEAS_KEY, JSON.stringify({ ideas: j.ideas, generatedAt: j.generatedAt, signals: j.signals }));
          } catch (_) {}
        }
        setErr("");
        if (j.generating) timer = setTimeout(load, 5000);
      } catch (e) {
        if (stop) return;
        setErr(String(e?.message || e));
        timer = setTimeout(load, 15000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking]);

  const refresh = async () => {
    if (!window.confirm(L("الان یه دستهٔ تازه ایده بسازه؟ (یک بار صدا زدن مدل، چند سنت)", "Ask for a new batch of ideas now? (one model call, a few cents)"))) return;
    setAsking(true);
    try {
      const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh: true }) });
      setData(await r.json());
    } catch (_) {}
    setAsking(false);
  };

  const ideas = ((data && data.ideas) || []).filter((t) => decisions[topicKey(t)] !== "rejected");
  const inGroup = IDEA_GROUPS.find((g) => g[0] === group)[2];
  const rows = ideas.filter(inGroup);
  const sig = data && data.signals;
  const when = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

  return (
    <div>
      <div dir={uiDir()} className="ui-glass" style={{ ...font, marginBottom: 12, padding: "11px 13px", borderRadius: 14, border: `1px solid ${alpha("#f5a623", 0.45)}`, background: alpha("#f5a623", 0.07), fontSize: 12.5, lineHeight: 1.8, color: C.text }}>
        <b>💡 {L("ایده‌های همیشگی", "Evergreen ideas")}</b> — {L("سؤال‌هایی که مردم همیشه می‌پرسند، نه خبر.", "Questions people keep asking, not news.")}
        {sig ? (
          <div style={{ color: C.text2 }}>
            {L(
              `منبع ایده‌ها: ${sig.google} جست‌وجوی گوگل و یوتیوب (فارسی و انگلیسی) · ${sig.helpcentre} سؤال مرکز راهنمای اداره مهاجرت کانادا · ${sig.reddit} پرسش ردیت · مقایسه با ${sig.covered} مطلب سایت · برداشت ${when(sig.at)}`,
              `Sources: ${sig.google} Google and YouTube searches (Persian and English) · ${sig.helpcentre} IRCC Help Centre questions · ${sig.reddit} Reddit questions · compared with ${sig.covered} site posts · harvested ${when(sig.at)}`
            )}
            {sig.pages < sig.pagesTotal ? L(` · ${sig.pages} از ${sig.pagesTotal} صفحهٔ رسمی آماده`, ` · ${sig.pages} of ${sig.pagesTotal} official pages ready`) : ""}
          </div>
        ) : data ? (
          <div style={{ color: C.orangeDeep }}>{L("هنوز سیگنالی برداشت نشده؛ بعد از اولین اجرای روزانهٔ برداشت‌کننده ایده‌ها ساخته می‌شود.", "No signals harvested yet; ideas are made after the first daily harvest.")}</div>
        ) : null}
        {data && data.generating && <div className="ui-pulse" style={{ color: "#8a5a00", fontWeight: 700 }}>⏳ {L("در حال ساختن ایده‌های تازه… (حدود یک دقیقه)", "Making new ideas… (about a minute)")}</div>}
        {data && data.error && !data.generating && <div dir="ltr" style={{ fontSize: 11, color: C.reject, textAlign: "left" }}>{data.error}</div>}
        {err && <div dir="ltr" style={{ fontSize: 11, color: C.reject, textAlign: "left" }}>{err}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
          {data && data.generatedAt && <span style={{ color: C.text3, fontSize: 11.5 }}>{L("آخرین دسته: ", "Last batch: ")}{when(data.generatedAt)}</span>}
          <button className="ui-btn" disabled={asking || (data && data.generating) || !sig} onClick={refresh} style={{ ...font, padding: "5px 11px", borderRadius: 99, cursor: "pointer", border: `1px solid ${alpha("#f5a623", 0.6)}`, background: C.surface, color: "#8a5a00", fontSize: 12, fontWeight: 700, opacity: asking || (data && data.generating) || !sig ? 0.5 : 1 }}>
            ✨ {L("ایده‌های تازه", "New ideas")}
          </button>
        </div>
      </div>

      {ideas.length > 0 && (
        <div dir={uiDir()} style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", paddingBottom: 2 }}>
          {IDEA_GROUPS.map(([k, label, test]) => {
            const on = group === k;
            return (
              <button key={k} className="ui-btn" onClick={() => setGroup(k)} style={{ ...font, padding: "5px 10px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, border: `1px solid ${on ? C.text : C.line}`, background: on ? C.text : C.surface, color: on ? "#fff" : C.text2, fontSize: 11.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                {L(label)}
                <span style={{ minWidth: 16, padding: "0 4px", borderRadius: 99, background: on ? "rgba(255,255,255,0.22)" : C.surfaceHi, fontSize: 10.5, fontFamily: "'Geist', sans-serif" }}>{ideas.filter(test).length}</span>
              </button>
            );
          })}
        </div>
      )}

      {!data ? (
        <div style={{ display: "grid", gap: 7 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ui-skeleton" style={{ height: 64, borderRadius: 14 }} />
          ))}
        </div>
      ) : ideas.length ? (
        <IdeasList topics={rows} decisions={decisions} plain {...actions} />
      ) : (
        <div dir={uiDir()} className="ui-glass" style={{ ...font, textAlign: "center", padding: "30px 0", borderRadius: 16, border: `1px dashed ${C.line}`, color: C.text2, fontSize: 13 }}>
          {L("هنوز ایده‌ای ساخته نشده.", "No ideas made yet.")}
        </div>
      )}
    </div>
  );
}

// News from the editor's own links: paste links (one or more) and a note;
// the server reads the pages and writes one card from them, which joins the
// list for everyone. The note sets the angle; facts come only from the pages.
const CUSTOM_NEWS_KEY = "custom-news";
const RESEARCH_KEY = "idea-research";
// A picture made small enough to send (long edge 1800px, JPEG): enough for
// the text in a screenshot to stay readable, small enough for a phone upload.
function shrinkImage(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1800 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const g = c.getContext("2d");
        g.fillStyle = "#fff";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: file.name || "picture", data: c.toDataURL("image/jpeg", 0.88) });
      };
      img.onerror = () => resolve(null);
      img.src = r.result;
    };
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

function CustomNewsBox({ job, onStart, onOpen, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [links, setLinks] = useState("");
  const [note, setNote] = useState("");
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const addFiles = async (files) => {
    const list = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!list.length) return;
    const shrunk = (await Promise.all(list.map(shrinkImage))).filter(Boolean);
    setImages((prev) => [...prev, ...shrunk].slice(0, 5));
  };
  const running = !!job && job.status === "running";
  const failed = !!job && job.status === "error" ? job.error : "";
  const done = !!job && job.status === "done" && job.result && job.result.topic;
  const count = (links.match(/https?:\/\/\S+/gi) || []).length;
  const fa = "'Vazirmatn', sans-serif";
  const lastId = useRef("");
  useEffect(() => {
    // A finished card clears the form for the next one.
    if (done && job.id !== lastId.current) {
      lastId.current = job.id;
      setLinks("");
      setNote("");
      setImages([]);
    }
  }, [done, job]);
  const ready = count > 0 || images.length > 0;
  const field = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontSize: 13, lineHeight: 1.7, resize: "vertical", background: C.surface };

  return (
    <div dir={uiDir()} className="ui-glass" style={{ marginBottom: 12, borderRadius: 14, border: `1px solid ${alpha(C.teal, 0.35)}`, background: alpha(C.teal, 0.05), fontFamily: fa }}>
      <button
        className="ui-btn"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 13px", background: "transparent", border: "none", cursor: "pointer", fontFamily: fa, fontSize: 13.5, fontWeight: 800, color: C.text }}
      >
        <span>🔗 {L("ساخت خبر از لینک‌ها و عکس‌های خودت", "Make news from your own links and pictures")}</span>
        <span style={{ color: C.text3, fontSize: 12 }}>{running ? L("⏳ در حال ساخت…", "⏳ Making…") : open ? "▲" : "▼"}</span>
      </button>
      {(open || running || failed || done) && (
        <div style={{ padding: "0 13px 13px" }}>
          {!running && (
            <>
              <div style={{ fontSize: 12, color: C.text2, marginBottom: 6 }}>{L("لینک‌ها (هر لینک در یک خط، حداکثر ۵)", "Links (one per line, up to 5)")}</div>
              <textarea dir="ltr" value={links} onChange={(e) => setLinks(e.target.value)} rows={3} placeholder={"https://www.canada.ca/…\nhttps://www.cicnews.com/…"} style={{ ...field, fontFamily: "'Geist', monospace", fontSize: 12.5 }} />
              <div style={{ fontSize: 12, color: C.text2, margin: "10px 0 6px" }}>{L("عکس‌ها (اسکرین‌شات خبر، نامه، پست — حداکثر ۵)", "Pictures (screenshots of news, letters, posts — up to 5)")}</div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current && fileRef.current.click()}
                role="button"
                tabIndex={0}
                style={{ border: `2px dashed ${dragOver ? C.teal : alpha(C.teal, 0.4)}`, background: dragOver ? alpha(C.teal, 0.08) : C.surface, borderRadius: 12, padding: images.length ? 10 : "18px 10px", textAlign: "center", cursor: "pointer", fontSize: 12.5, color: C.text2 }}
              >
                {images.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-start" }}>
                    {images.map((im, i) => (
                      <div key={i} style={{ position: "relative", width: 72, height: 72, borderRadius: 9, overflow: "hidden", border: `1px solid ${C.line}` }}>
                        <img src={im.data} alt={im.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <button
                          aria-label={L("حذف عکس", "Remove picture")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setImages((prev) => prev.filter((_, j) => j !== i));
                          }}
                          style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 99, border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, cursor: "pointer", lineHeight: "20px", padding: 0 }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {images.length < 5 && (
                      <div style={{ width: 72, height: 72, borderRadius: 9, border: `1px dashed ${C.line}`, display: "grid", placeItems: "center", fontSize: 22, color: C.text3 }}>＋</div>
                    )}
                  </div>
                ) : (
                  <>🖼 {L("عکس‌ها رو اینجا بکش و رها کن، بزن تا انتخاب کنی، یا Ctrl+V", "Drop pictures here, tap to choose, or Ctrl+V")}</>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{L("متن داخل عکس‌ها کلمه‌به‌کلمه خوانده می‌شود و خبر فقط از همان نوشته می‌شود.", "The text in the pictures is read word for word, and the news is written only from it.")}</div>
              <div style={{ fontSize: 12, color: C.text2, margin: "8px 0 6px" }}>{L("یادداشت (اختیاری) — زاویه و تأکید؛ فکت‌ها فقط از خود لینک‌ها می‌آیند", "Note (optional) — angle and emphasis; facts come only from the links themselves")}</div>
              <textarea dir="auto" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={L("مثلاً: روی اثرش برای دانشجوهای ایرانی تمرکز کن، تاریخ اجرا را برجسته کن…", "e.g. focus on what it means for Iranian students, highlight the start date…")} style={{ ...field, fontFamily: fa }} />
              <button
                className="ui-btn ui-glow-orange"
                disabled={!ready}
                onClick={() => onStart(links, note.trim(), images)}
                style={{ marginTop: 10, width: "100%", background: ready ? C.teal : alpha(C.teal, 0.4), color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontWeight: 700, fontSize: 14, cursor: ready ? "pointer" : "default", fontFamily: fa }}
              >
                {L(
                  "ساخت خبر از " + ([count ? `${count} لینک` : "", images.length ? `${images.length} عکس` : ""].filter(Boolean).join(" و ") || "لینک یا عکس"),
                  "Make news from " + ([count ? `${count} link${count > 1 ? "s" : ""}` : "", images.length ? `${images.length} picture${images.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ") || "links or pictures")
                )}
              </button>
            </>
          )}
          {running && (
            <div className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha(C.teal, 0.08), fontSize: 13 }}>
              <span className="ui-pulse">⏳</span> {L("در حال خواندن صفحه‌ها و عکس‌ها و نوشتن خبر… می‌تونی از این صفحه بری.", "Reading the pages and pictures and writing the news… You can leave this page.")}
            </div>
          )}
          {failed && !running && <div dir="ltr" style={{ marginTop: 8, fontSize: 12, color: C.reject, textAlign: "left" }}>⚠️ {failed}</div>}
          {done && !running && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: alpha(C.success, 0.08), border: `1px solid ${alpha(C.success, 0.3)}`, fontSize: 13 }}>
              ✓ {L("خبر ساخته شد و به فهرست اضافه شد:", "The news was made and added to the list:")}{" "}
              <a href={"/?t=" + encodeURIComponent(topicKey(job.result.topic))} onClick={(e) => { e.preventDefault(); onOpen(job.result.topic); }} style={{ color: C.teal, fontWeight: 700 }}>
                {job.result.topic.title_fa}
              </a>
              {(job.result.skipped || []).length > 0 && (
                <div dir="ltr" style={{ marginTop: 6, fontSize: 11.5, color: C.orangeDeep, textAlign: "left" }}>
                  {L("استفاده نشد: ", "Not used: ")}{job.result.skipped.map((x) => x.url + " (" + x.error + ")").join("; ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Research beyond the daily news: an idea the editor had (found pages -> one card), or a subject
// (or the default subjects) searched for several post ideas (one card each). The search only finds
// pages; each card is written from the text of its own page (lib/idea-research.js).
function ResearchBox({ job, onStart, onOpen, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [q, setQ] = useState("");
  const running = !!job && job.status === "running";
  const failed = !!job && job.status === "error" ? job.error : "";
  const done = !!job && job.status === "done" && job.result && (job.result.topics || []).length > 0;
  const fa = "'Vazirmatn', sans-serif";
  const tone = "#7c5cd6";
  const lastId = useRef("");
  useEffect(() => {
    if (done && job.id !== lastId.current) {
      lastId.current = job.id;
      setQ("");
    }
  }, [done, job]);
  const btn = (on) => ({ flex: 1, minWidth: 150, background: on ? tone : alpha(tone, 0.35), color: "#fff", border: "none", borderRadius: 12, padding: "11px", fontWeight: 700, fontSize: 13.5, cursor: on ? "pointer" : "default", fontFamily: fa });
  const ideas = job && job.status === "running" ? null : job && job.result;
  return (
    <div dir={uiDir()} className="ui-glass" style={{ marginBottom: 12, borderRadius: 14, border: `1px solid ${alpha(tone, 0.35)}`, background: alpha(tone, 0.05), fontFamily: fa }}>
      <button
        className="ui-btn"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "11px 13px", background: "transparent", border: "none", cursor: "pointer", fontFamily: fa, fontSize: 13.5, fontWeight: 800, color: C.text }}
      >
        <span>🔎 {L("تحقیق روی ایده یا موضوع", "Research an idea or subject")}</span>
        <span style={{ color: C.text3, fontSize: 12 }}>{running ? L("⏳ در حال تحقیق…", "⏳ Researching…") : open ? "▲" : "▼"}</span>
      </button>
      {(open || running || failed || done) && (
        <div style={{ padding: "0 13px 13px" }}>
          {!running && (
            <>
              <div style={{ fontSize: 12, color: C.text2, marginBottom: 6, lineHeight: 1.7 }}>{L("ایده‌ای که به ذهنت رسیده، یا موضوعی که می‌خوای براش ایده‌ی پست پیدا بشه. خالی بذاری، از موضوع‌های همیشگی ما می‌گرده.", "An idea you had, or a subject to find post ideas for. Left empty, it searches our standing subjects.")}</div>
              <textarea
                dir="auto"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                rows={3}
                placeholder={L("مثلاً: ویزای همراه برای همسر دانشجو هنوز ممکنه؟ — یا: اسپانسرشیپ والدین", "e.g. Can a student's spouse still get an open work permit? — or: parent sponsorship")}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontSize: 13, lineHeight: 1.7, resize: "vertical", background: C.surface, fontFamily: fa }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="ui-btn" disabled={q.trim().length < 4} onClick={() => onStart("idea", q.trim())} style={btn(q.trim().length >= 4)}>
                  {L("تحقیق روی این ایده", "Research this idea")}
                </button>
                <button className="ui-btn" onClick={() => onStart("ideas", q.trim())} style={btn(true)}>
                  {q.trim() ? L("ایده‌های تازه در این موضوع", "New ideas on this subject") : L("ایده‌های تازه (موضوع‌های همیشگی)", "New ideas (standing subjects)")}
                </button>
              </div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 6, lineHeight: 1.7 }}>{L("جستجو فقط صفحه‌ها رو پیدا می‌کنه؛ هر کارت فقط از متن همون صفحه‌ها نوشته می‌شه. ایده‌های تازه: تا ۶ کارت.", "The search only finds pages; each card is written only from their text. New ideas: up to 6 cards.")}</div>
            </>
          )}
          {running && (
            <div className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha(tone, 0.08), fontSize: 13 }}>
              <span className="ui-pulse">⏳</span> {L("در حال جستجو، خواندن صفحه‌ها و نوشتن کارت… می‌تونی از این صفحه بری.", "Searching, reading pages and writing cards… You can leave this page.")}
            </div>
          )}
          {failed && !running && <div dir="ltr" style={{ marginTop: 8, fontSize: 12, color: C.reject, textAlign: "left" }}>⚠️ {failed}</div>}
          {done && !running && ideas && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: alpha(C.success, 0.08), border: `1px solid ${alpha(C.success, 0.3)}`, fontSize: 13, lineHeight: 1.8 }}>
              ✓ {ideas.topics.length > 1 ? L(`${ideas.topics.length} کارت ساخته شد و به فهرست اضافه شد:`, `${ideas.topics.length} cards made and added to the list:`) : L("کارت ساخته شد و به فهرست اضافه شد:", "Card made and added to the list:")}
              {ideas.topics.map((t) => (
                <div key={topicKey(t)}>
                  •{" "}
                  <a href={"/?t=" + encodeURIComponent(topicKey(t))} onClick={(e) => { e.preventDefault(); onOpen(t); }} style={{ color: C.teal, fontWeight: 700 }}>
                    {t.title_fa}
                  </a>
                </div>
              ))}
              {(ideas.skipped || []).length > 0 && (
                <div dir="ltr" style={{ marginTop: 6, fontSize: 11.5, color: C.orangeDeep, textAlign: "left" }}>
                  {L("استفاده نشد: ", "Not used: ")}{ideas.skipped.map((x) => x.url + " (" + x.error + ")").join("; ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Work that is running (or just finished) on the server for topics you have
// already moved on from. Tap a finished one to open it.
function JobsBar({ rows, onOpen, onDismiss, onRetry, width = 460 }) {
  if (!rows.length) return null;
  const KIND = { script: L("اسکریپت", "script"), article: L("مقاله", "article"), carousel: L("کاروسل", "carousel"), video: L("ویدیو انگلیسی", "English video") };
  return (
    // Pinned under the header so a finished or failed job is seen wherever
    // you are on the page.
    <div style={{ position: "sticky", top: 76, zIndex: 29, width: "100%", maxWidth: width, marginBottom: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, maxHeight: "40vh", overflowY: "auto", overflowX: "hidden" }}>
      {rows.map((j) => {
        const running = j.status === "running";
        const failed = j.status === "error";
        const tone = running ? C.orange : failed ? C.reject : C.success;
        const writing = j.kind === "script" && running && j.result && (j.result.fa || j.result.en);
        return (
          <div
            key={j.key + ":" + j.kind}
            dir={uiDir()}
            className={"ui-glass ui-fade" + (running ? " ui-progress" : "")}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", borderRadius: 14,
              border: `1px solid ${alpha(tone, 0.35)}`,
              // Solid underneath: it floats over the list.
              background: `linear-gradient(${alpha(tone, 0.1)}, ${alpha(tone, 0.1)}), ${C.surface}`,
              boxShadow: "0 6px 18px rgba(16,24,40,0.10)",
              fontFamily: "'Vazirmatn', sans-serif", fontSize: 12.5, color: C.text,
            }}
          >
            <span aria-hidden className={running ? "ui-pulse" : ""} style={{ width: 30, height: 30, borderRadius: 9, background: alpha(tone, 0.18), display: "grid", placeItems: "center", flexShrink: 0 }}>
              {running ? "⏳" : failed ? "⚠️" : "✓"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: tone }}>
                {running
                  ? writing ? L("اسکریپت‌ها تقریباً آماده‌اند…", "Scripts are almost ready…") : j.kind === "video" ? L("در حال ارسال به ورک‌فلوی ویدیو…", "Sending to the video workflow…") : L(`در حال نوشتن ${KIND[j.kind]}…`, `Writing the ${KIND[j.kind]}…`)
                  : failed ? L(`${KIND[j.kind]} نشد`, `The ${KIND[j.kind]} failed`) : j.kind === "video" ? L("ویدیو درخواست شد", "Video requested") : L(`${KIND[j.kind]} آماده است`, `The ${KIND[j.kind]} is ready`)}
              </div>
              <div style={{ color: C.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {j.topic.title_fa || j.topic.title_en}
              </div>
            </div>
            {!running && !failed && (
              <button className="ui-btn" onClick={() => onOpen(j)} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 10, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif" }}>
                {L("باز کن", "Open")}
              </button>
            )}
            {failed && (
              <button className="ui-btn" onClick={() => onRetry(j)} style={{ background: "transparent", color: C.text, border: `1px solid ${alpha(C.reject, 0.5)}`, borderRadius: 10, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "'Vazirmatn', sans-serif" }}>
                {L("دوباره", "Retry")}
              </button>
            )}
            {!running && (
              <button className="ui-btn" onClick={() => onDismiss(j)} aria-label={L("بستن", "Close")} style={{ background: "transparent", color: C.text3, border: "none", fontSize: 18, cursor: "pointer", padding: "2px 4px", lineHeight: 1 }}>
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
    return m < 90 ? L(`${m} دقیقه پیش`, `${m} min ago`) : L(`${Math.round(m / 60)} ساعت پیش`, `${Math.round(m / 60)} h ago`);
  };
  const src = stats.harvest
    ? L(`برداشت ${ago(stats.harvest.at)}`, `harvested ${ago(stats.harvest.at)}`)
    : stats.liveFetch && !stats.liveFetch.failed
      ? L(`زنده: ${stats.liveFetch.feedsOk}/${stats.liveFetch.feedsTotal} فید`, `live: ${stats.liveFetch.feedsOk}/${stats.liveFetch.feedsTotal} feeds`)
      : L("هیچ منبعی در دسترس نیست", "no source reachable");
  const full = (stats.written || 0) - (stats.headlineOnly || 0);
  const row = (k, v) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
  return (
    <details className="ui-glass" style={{ fontSize: 11.5, color: C.text2, fontFamily: "'Geist', 'Vazirmatn', sans-serif", marginBottom: 12, direction: uiDir(), border: `1px solid ${C.line}`, borderRadius: 12, padding: "8px 12px" }}>
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: C.success, boxShadow: `0 0 0 3px ${alpha(C.success, 0.2)}`, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <b style={{ color: C.text }}>{stats.eligible ?? 0}</b> {L("موضوع تازه", "fresh topics")} · <b style={{ color: C.text }}>{stats.written ?? 0}</b> {L(`کارت (${full} با متن کامل)`, `cards (${full} full text)`)} · {src}
        </span>
        <span aria-hidden style={{ color: C.text3 }}>▾</span>
      </summary>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.line}`, display: "grid", gap: 3 }}>
        {row(L("خبرهای موجود در مخزن", "Articles in pool"), stats.pool ?? 0)}
        {row(L("…از این‌ها پست اینستاگرام", "…of which Instagram posts"), stats.socialPosts ?? 0)}
        {row(L("…از این‌ها مورد Lexbase", "…of which Lexbase items"), stats.newsletterItems ?? 0)}
        {row(L("قبلاً تأیید یا رد شده", "Already approved or rejected"), stats.alreadyUsed ?? 0)}
        {row(L("قبلاً کارت داره (دوباره نوشته نمی‌شه)", "Already has a card (not written again)"), stats.alreadyShown ?? 0)}
        {row(L("بی‌ربط یا نتیجهٔ قرعه‌کشی", "Off-topic or draw results"), stats.offTopic ?? 0)}
        {row(L("منابع نامعتبر کنار گذاشته شد", "Untrusted sources dropped"), stats.untrusted ?? 0)}
        {row(L("همون خبر، رسانهٔ دیگه", "Same story, other outlet"), stats.duplicateStories ?? 0)}
        {row(L("گزینه‌های تازه", "Fresh candidates"), stats.eligible ?? 0)}
        {row(L("انتخاب‌شده توسط مدل ویراستار", "Chosen by the editor model"), stats.selected ?? 0)}
        {row(L("کارت‌های نوشته‌شده", "Cards written"), stats.written ?? 0)}
        {row(L("…فقط تیتر (منبع رو چک کن)", "…headline only (check source)"), stats.headlineOnly ?? 0)}
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
// Three other opening lines for the script (lib/hooks.js), each with what would make it lose the
// viewer. The script itself is untouched: these are options to say instead of its first line.
function HookOptions({ hooks, lang }) {
  if (!hooks || !hooks.length) return null;
  const en = lang === "en";
  return (
    <div dir={en ? "ltr" : "rtl"} style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 12, background: alpha(C.orange, 0.06), border: `1px solid ${alpha(C.orange, 0.3)}` }}>
      <div dir={uiDir()} style={{ fontSize: 12, fontWeight: 700, color: C.text2, marginBottom: 6, fontFamily: FONT }}>
        {L("سه جملهٔ شروع دیگه (به‌جای جملهٔ اول سناریو)", "Three other opening lines (instead of the script's first line)")}
      </div>
      <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 6 }}>
        {hooks.map((h, i) => (
          <li key={i} style={{ fontFamily: en ? FONT : FA_FONT, fontSize: 13.5, lineHeight: 1.7, color: C.text }}>
            <span data-copy>{h.line}</span>
            <div dir={uiDir()} style={{ fontSize: 11.5, fontFamily: FONT, color: h.problems && h.problems.length ? C.orangeDeep : C.success }}>
              {h.problems && h.problems.length ? "⚠ " + h.problems.join(" · ") : L("✓ مشکلی پیدا نشد", "✓ no problem found")}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScriptBody({ text, tab }) {
  const font = tab === "fa" ? "'Vazirmatn', sans-serif" : "'Geist', 'Vazirmatn', sans-serif";
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
    <button className="ui-btn" onClick={() => copy(k, text)} style={{ background: copied === k ? C.success : alpha(C.orange, 0.14), color: copied === k ? "#06281c" : C.orange, border: `1px solid ${copied === k ? C.success : alpha(C.orange, 0.4)}`, borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Geist', sans-serif" }}>
      {copied === k ? L("کپی شد ✓", "Copied ✓") : L("کپی", "Copy")}
    </button>
  );
  // A video link's text is its transcript (lib/video-transcript.js), shown under its own name.
  const isTranscript = /^\[Video transcript\]/.test(String(state.text || ""));
  const label = isTranscript ? L("متن گفته‌شده در ویدیو", "What the video says (transcript)") : L({ lexbase: ["خبرنامهٔ Lexbase — همین مورد", "Lexbase newsletter — this item"], article: ["خبر منبع", "Source article"], snippet: ["بخشی از منبع", "Source excerpt"] }[state.kind] || ["منبع", "Source"]);
  const isLex = state.kind === "lexbase" || topic.newsletter === "lexbase";
  // Each paragraph takes its own direction, so a Persian transcript or article reads right to left.
  const body = { fontFamily: "'Geist', 'Vazirmatn', sans-serif", fontSize: 14, lineHeight: 1.8, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word", unicodeBidi: "plaintext", textAlign: "start" };

  if (state.loading) {
    return <div className="ui-pulse" style={{ fontSize: 13, color: C.text3, padding: "30px 0", textAlign: "center" }}>{L("در حال بارگذاری متن اصلی…", "Loading the original text…")}</div>;
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
          <div style={body}>{isTranscript ? String(state.text).replace(/^\[Video transcript\]\n?/, "") : state.text}</div>
        </>
      )}

      {isLex && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
          {!whole ? (
            <button className="ui-btn" onClick={loadWhole} style={{ width: "100%", padding: "11px", borderRadius: 12, border: `1px solid ${alpha("#6d5bd0", 0.4)}`, background: alpha("#6d5bd0", 0.08), color: "#6d5bd0", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "'Geist', 'Vazirmatn', sans-serif" }}>
              📬 {L("نمایش کل خبرنامه", "Show the whole newsletter")}
            </button>
          ) : whole.loading ? (
            <div className="ui-pulse" style={{ fontSize: 13, color: C.text3, textAlign: "center" }}>{L("در حال بارگذاری کل خبرنامه…", "Loading the whole newsletter…")}</div>
          ) : whole.error ? (
            <div style={{ fontSize: 13, color: C.reject }}>{whole.error}</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {L("کل خبرنامه", "Whole newsletter")}
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

// Share of letters that are Persian script: an "English" script above about a
// fifth Persian came back in the wrong language.
function faShare(text) {
  const s = String(text || "");
  const fa = (s.match(/[؀-ۿﭐ-﷿ﹰ-﻿]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  return fa + latin ? fa / (fa + latin) : 0;
}

function when(ts) {
  return ts ? new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

const FONT = "'Geist', 'Vazirmatn', sans-serif";
const FA_FONT = "'Vazirmatn', sans-serif";

// A titled block on the topic page.
function Section({ title, hint, children, innerRef, dir }) {
  dir = dir || uiDir();
  return (
    <section ref={innerRef} style={{ marginTop: 18, scrollMarginTop: 90 }}>
      {title && (
        <div dir={dir} style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 4px 8px", fontFamily: dir === "rtl" ? FA_FONT : FONT }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{title}</span>
          {hint && <span style={{ fontSize: 11.5, color: C.text3 }}>{hint}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, boxShadow: "none" };

// One thing that can be made from the topic: what it is, and where it stands.
// The other parts of the app (one login): a small menu so the header stays one line on a phone.
function AppMenu({ me, ax, navBtn, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const items = [
    (!me || ax.includes("calendar")) && ["/calendar", "📅", L("تقویم محتوا", "Content calendar")],
    (!me || ax.includes("editing")) && ["/editing", "🎬", L("تدوین ویدیو", "Video Editing")],
    ax.includes("team") && ["/editing/team", "👥", L("تیم · چه کسی به چه چیزی دسترسی داره", "Team · who can open what")],
    me && ["/editing/password", "🔑", L("تغییر رمز عبور", "Change password")],
  ].filter(Boolean);
  const row = { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, color: C.text, textDecoration: "none", fontSize: 14, fontWeight: 600, fontFamily: FONT, background: "none", border: "none", width: "100%", cursor: "pointer", textAlign: "start" };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="ui-btn" onClick={() => setOpen((o) => !o)} aria-label={L("بخش‌ها و حساب", "Apps and account")} title={L("تقویم، تدوین ویدیو، تیم", "Calendar, Video Editing, Team")} style={{ ...navBtn, fontWeight: 800, color: me ? C.orange : C.text }}>
        {me ? String(me.name || "?").trim().charAt(0).toUpperCase() : "☰"}
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", right: 0, top: 44, zIndex: 50, minWidth: 230, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: "0 12px 32px rgba(16,24,40,0.16)", padding: 6, direction: uiDir() }}>
          {me && <div style={{ padding: "8px 12px 10px", fontSize: 12.5, color: C.text3, borderBottom: `1px solid ${C.line}`, marginBottom: 4, fontFamily: FONT }}>{L("وارد شده به‌عنوان ", "Signed in as ")}<b style={{ color: C.text }}>{me.name}</b></div>}
          {items.map(([href, icon, label]) => (
            <a key={href} href={href} role="menuitem" style={row}>
              <span style={{ width: 20, textAlign: "center" }}>{icon}</span>
              {label}
            </a>
          ))}
          {me && (
            <button role="menuitem" onClick={onSignOut} style={{ ...row, color: C.reject }}>
              <span style={{ width: 20, textAlign: "center" }}>↩</span>
              {L("خروج", "Sign out")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActionTile({ icon, title, sub, tone, status, onClick, disabled }) {
  const s = status || { label: "", tone: C.text3 };
  return (
    <button
      className={"ui-btn ui-tile" + (s.running ? " ui-progress" : "")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...card, position: "relative", overflow: "hidden", textAlign: "left", padding: "13px 13px 12px", cursor: disabled ? "default" : "pointer",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 112, fontFamily: FONT, color: C.text, opacity: disabled ? 0.6 : 1,
        borderColor: s.done ? alpha(tone, 0.45) : C.line,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: alpha(tone, 0.13), fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{title}</span>
      </div>
      <div dir={uiDir()} style={{ fontFamily: FA_FONT, fontSize: 11.5, color: C.text2, lineHeight: 1.6, textAlign: isFa() ? "right" : "left" }}>{sub}</div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: s.tone || C.text3 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: s.tone || C.text3, flexShrink: 0 }} className={s.running ? "ui-pulse" : ""} />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
      </div>
    </button>
  );
}

// Scripts / English / original text, as one segmented control.
function Segmented({ value, onChange, items }) {
  return (
    <div role="tablist" style={{ display: "flex", padding: 3, gap: 3, borderRadius: 12, background: C.surfaceHi, border: `1px solid ${C.line}` }}>
      {items.map(([k, label, font]) => (
        <button
          key={k}
          role="tab"
          aria-selected={value === k}
          className="ui-btn"
          onClick={() => onChange(k)}
          style={{
            flex: 1, border: "none", borderRadius: 9, padding: "8px 6px", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
            fontFamily: font || FONT, whiteSpace: "nowrap",
            background: value === k ? C.surface : "transparent", color: value === k ? C.text : C.text2,
            boxShadow: value === k ? "0 1px 3px rgba(16,24,40,0.12)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// The trusted pages added because the topic's own page did not answer what the card promises
// (lib/supplement.js). Every piece made from the topic was written from them too.
function ExtraSources({ sources = [], supplement = null }) {
  if (!sources.length && !(supplement && !supplement.enough)) return null;
  return (
    <div dir={uiDir()} style={{ marginTop: 14, padding: "10px 12px", borderRadius: 12, background: alpha(C.teal, 0.06), border: `1px solid ${alpha(C.teal, 0.25)}`, fontFamily: FA_FONT, fontSize: 12.5, lineHeight: 1.8 }}>
      {sources.length > 0 && (
        <>
          <b>📚 {L("صفحهٔ اصلی کافی نبود؛ مطالب تکمیلی از این منابع پیدا شد:", "The main page was not enough; more material came from these sources:")}</b>
          {sources.map((x) => (
            <div key={x.url} dir="ltr" style={{ textAlign: isFa() ? "right" : "left" }}>
              <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, fontWeight: 700, wordBreak: "break-all" }}>{x.host}</a>{" "}
              <span style={{ color: C.text3, fontSize: 11 }}>{x.url.replace(/^https?:\/\/(www\.)?[^/]+/, "").slice(0, 70)}</span>
            </div>
          ))}
        </>
      )}
      {supplement && !supplement.enough && (
        <div style={{ color: C.orangeDeep, marginTop: sources.length ? 6 : 0 }}>
          ⚠️ {L("حتی منابع معتبر هم همهٔ چیزی رو که این موضوع لازم داره نداشتن: ", "Even the trusted sources did not hold everything this topic needs: ")}
          <span dir="ltr">{supplement.missing}</span>
        </div>
      )}
    </div>
  );
}

// A note under the script, like the ones under the post, carousel and story: the script in this
// tab is rewritten by it from the same source (job script_fix, script_fix@en for English), and the
// note can teach a rule for every later script.
function ScriptNote({ topic, tab, script, job, onJob }) {
  const [note, setNote] = useState("");
  const [learn, setLearn] = useState(false);
  const running = !!job && job.status === "running";
  const failed = job && job.status === "error" ? job.error : "";
  const done = job && job.status === "done";
  const go = () => {
    const n = note.trim();
    if (!n || running) return;
    onJob(tab === "en" ? "script_fix@en" : "script_fix", { lang: tab, script, note: n });
    if (learn) teach({ topic, scope: "script", note: n, context: script });
    setNote("");
  };
  const tone = C.orange;
  return (
    <div dir={uiDir()} style={{ marginTop: 16, background: C.surface, border: `1px solid ${alpha(tone, 0.3)}`, borderRadius: 14, padding: 12, fontFamily: FA_FONT }}>
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>✏️ {tab === "en" ? L("بازنویسی اسکریپت انگلیسی با یادداشت", "Rewrite the English script with a note") : L("بازنویسی اسکریپت فارسی با یادداشت", "Rewrite the Persian script with a note")}</div>
      <textarea
        dir="auto"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={L("مثلاً: شروع رو قوی‌تر کن، کوتاه‌تر، جملهٔ آخر دعوت به مشاوره نباشه، تاریخ رو اول بگو…", "e.g. a stronger opening, shorter, no consultation line at the end, say the date first…")}
        style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: FA_FONT, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
      />
      <button className="ui-btn" disabled={running || !note.trim()} onClick={go} style={{ width: "100%", marginTop: 8, padding: "10px 14px", borderRadius: 12, background: alpha(tone, 0.1), color: C.text, border: `1px solid ${alpha(tone, 0.4)}`, fontWeight: 700, fontSize: 13, fontFamily: FA_FONT, cursor: running || !note.trim() ? "default" : "pointer", opacity: running || !note.trim() ? 0.5 : 1 }}>
        ↻ {L("بازنویسی اسکریپت", "Rewrite the script")}
      </button>
      <LearnToggle on={learn} setOn={setLearn} />
      {running && <div className="ui-progress" style={{ marginTop: 8, fontSize: 12.5, color: C.text2 }}><span className="ui-pulse">⏳</span> {L("در حال بازنویسی اسکریپت… می‌تونی از این صفحه بری.", "Rewriting the script… You can leave this page.")}</div>}
      {failed && !running && <div style={{ marginTop: 8, fontSize: 12.5, color: C.reject, unicodeBidi: "plaintext" }}>⚠️ {L("بازنویسی نشد: ", "Not rewritten: ")}{failed}</div>}
      {done && !running && job.result && job.result.note && <div style={{ marginTop: 8, fontSize: 12, color: C.success, unicodeBidi: "plaintext" }}>✓ {L("بازنویسی شد با یادداشت: ", "Rewritten with the note: ")}«{job.result.note}»</div>}
    </div>
  );
}

function ScriptView({ topic, scripts, initialArticle, loading, loadingText = "", error, tab, setTab, copied, onCopy, onBack, onWrite, enError = "", enJob, fixJobs = {}, draftJob, tgPost = null, tgJob = null, articleJob, publishJob, docJob, carousel, carouselJob, sendJob, story, storyJob, storySendJob, videoJob, video, onRefreshVideo, caps = {}, onJob, lang = "fa", setLang = () => {} }) {
  const f = fieldOf(topic);
  const hasScripts = !!(scripts.fa || scripts.en);
  const active = tab === "fa" ? scripts.fa : scripts.en;
  const enInFarsi = !!scripts.en && faShare(scripts.en) > 0.2;
  const enRunning = !!enJob && enJob.status === "running";
  const enFailed = enJob && enJob.status === "error" ? enJob.error : "";

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


  // ---- what to make from the topic ----------------------------------------
  const articleRef = useRef(null);
  const carouselRef = useRef(null);
  const storyRef = useRef(null);
  const videoRef = useRef(null);
  const reveal = (ref) => setTimeout(() => ref.current && ref.current.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  const [carouselOpen, setCarouselOpen] = useState(0); // bumped to open the carousel form
  const [storyOpen, setStoryOpen] = useState(0);
  const [composer, setComposer] = useState(false);
  const [draft, setDraft] = useState(null); // the video editor's state, kept while the topic is open

  const telegramRef = useRef(null);
  const [tgOpen, setTgOpen] = useState(false);
  const tgRunning = !!tgJob && tgJob.status === "running";
  const openTelegram = () => {
    setTgOpen(true);
    if (!(tgPost && tgPost.text) && !tgRunning) onJob("telegram_write", {});
    reveal(telegramRef);
  };

  const slides = (carousel && carousel.slides) || [];
  const carRunning = !!carouselJob && carouselJob.status === "running";
  const storyPages = (story && story.pages) || [];
  const stRunning = !!storyJob && storyJob.status === "running";
  const stStage = stRunning ? (storyJob.result && storyJob.result.stage) || "writing" : "";
  const vRunning = !!videoJob && videoJob.status === "running";
  const vStatus = vRunning ? "sending" : videoJob && videoJob.status === "error" && !(video && video.requested_at > (videoJob.startedAt || 0)) ? "error" : (video && video.status) || "";

  const tiles = [
    caps.publishing !== false && {
      k: "telegram", icon: <Send size={18} />, title: L("پست تلگرام", "Telegram post"), tone: C.teal,
      sub: L("ویرایش همین‌جا، با تصویر، ارسال به @sugimotovisa", "Edit here, with a picture, send to @sugimotovisa"),
      onClick: openTelegram,
      status:
        tgRunning ? { label: tgJob.kind === "telegram_send" ? L("در حال ارسال…", "Sending…") : tgJob.kind === "telegram_image" ? L("در حال کشیدن…", "Drawing…") : tgJob.kind === "telegram_save" ? L("در حال ذخیره…", "Saving…") : L("در حال نوشتن…", "Writing…"), tone: C.orange, running: true }
        : tgPost && tgPost.sent && tgPost.sent_to === "public" ? { label: L("ارسال شد · ", "Sent · ") + when(tgPost.sent), tone: C.success, done: true }
        : tgPost && tgPost.text ? { label: L("آمادهٔ ویرایش", "Ready to edit"), tone: C.success, done: true }
        : tgJob && tgJob.status === "error" ? { label: L("نشد — بزن تا دوباره", "Failed — tap to retry"), tone: C.reject }
        : { label: L("ساخته نشده", "Not made"), tone: C.text3 },
    },
    {
      k: "article", icon: <FileText size={18} />, title: L("مقالهٔ وبلاگ", "Blog article"), tone: "#0e8a99",
      sub: L("مقالهٔ سئو برای سایت + پیش‌نویس وردپرس", "SEO article for the site + WordPress draft"),
      onClick: () => {
        if (artState === "idle" || artState === "error") generateArticle();
        reveal(articleRef);
      },
      status:
        artState === "generating" ? { label: L("در حال نوشتن…", "Writing…"), tone: C.orange, running: true }
        : artState === "ready" ? { label: pubState === "done" ? L("پیش‌نویس روی سایت", "Draft on the site") : L("آماده", "Ready"), tone: C.success, done: true }
        : artState === "error" ? { label: L("نشد — بزن تا دوباره", "Failed — tap to retry"), tone: C.reject }
        : { label: L("ساخته نشده", "Not made"), tone: C.text3 },
    },
    {
      k: "carousel", icon: <GalleryHorizontal size={18} />, title: L("پست کاروسل", "Carousel post"), tone: "#6d5bd0",
      sub: L("اسلایدهای اینستاگرام با تصویر", "Instagram slides with pictures"),
      onClick: () => {
        if (!slides.length && !carRunning) setCarouselOpen((n) => n + 1);
        reveal(carouselRef);
      },
      status:
        carRunning ? { label: (carouselJob.result && carouselJob.result.stage === "drawing") ? L("در حال کشیدن اسلایدها…", "Drawing slides…") : L("در حال نوشتن اسلایدها…", "Writing slides…"), tone: C.orange, running: true }
        : slides.length ? { label: L(`${slides.length} اسلاید`, `${slides.length} slides`) + (carousel.sent && carousel.sent.public ? L(" · منتشر شد", " · published") : ""), tone: C.success, done: true }
        : carouselJob && carouselJob.status === "error" ? { label: L("نشد", "Failed"), tone: C.reject }
        : { label: L("ساخته نشده", "Not made"), tone: C.text3 },
    },
    {
      k: "story", icon: <Smartphone size={18} />, title: L("استوری", "Story"), tone: "#c2410c",
      sub: L("استوری فکت با اسکرین‌شات از منبع اصلی", "Fact story with a screenshot of the original source"),
      onClick: () => {
        if (!storyPages.length && !stRunning) setStoryOpen((n) => n + 1);
        reveal(storyRef);
      },
      status:
        stRunning ? { label: stStage === "screenshots" ? L("در حال گرفتن اسکرین‌شات…", "Taking screenshots…") : stStage === "drawing" ? L("در حال کشیدن…", "Drawing…") : L("در حال نوشتن…", "Writing…"), tone: C.orange, running: true }
        : storyPages.length ? { label: (storyPages.length === 1 ? L("۱ صفحه", "1 page") : L(`${storyPages.length} صفحه`, `${storyPages.length} pages`)) + (story.sent && story.sent.public ? L(" · منتشر شد", " · published") : ""), tone: C.success, done: true }
        : storyJob && storyJob.status === "error" ? { label: L("نشد", "Failed"), tone: C.reject }
        : caps.story === false ? { label: L("مرورگر سرور آماده نیست", "No browser on the server"), tone: C.text3 }
        : { label: L("ساخته نشده", "Not made"), tone: C.text3 },
    },
    {
      k: "video", icon: <Clapperboard size={18} />, title: L("ویدیوی انگلیسی", "English video"), tone: C.orangeDeep,
      sub: L("ویدیوی آواتار HeyGen از اسکریپت انگلیسی", "HeyGen avatar video from the English script"),
      disabled: !hasScripts,
      onClick: () => setComposer(true),
      status:
        !hasScripts ? { label: L("اول اسکریپت‌ها رو بنویس", "Write the scripts first"), tone: C.text3 }
        : vStatus === "sending" ? { label: L("در حال ارسال…", "Sending…"), tone: C.orange, running: true }
        : vStatus === "requested" ? { label: L("درخواست شد", "Requested"), tone: C.orange, running: true }
        : vStatus === "rendering" ? { label: L("در حال ساخت ویدیو…", "Rendering…"), tone: C.orange, running: true }
        : vStatus === "done" ? { label: L("آمادهٔ تماشا", "Ready to watch"), tone: C.success, done: true }
        : vStatus === "failed" || vStatus === "error" ? { label: L("نشد", "Failed"), tone: C.reject }
        : !caps.video ? { label: L("ورک‌فلو وصل نیست", "Workflow not connected"), tone: C.text3 }
        : { label: L("ساخته نشده", "Not made"), tone: C.text3 },
    },
  ];

  const pill = (bg, color) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color, borderRadius: 99, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, fontFamily: FONT, whiteSpace: "nowrap" });
  const smallBtn = (tone) => ({ background: alpha(tone, 0.12), color: tone === C.orange ? C.orangeDeep : tone, border: `1px solid ${alpha(tone, 0.35)}`, borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT });

  return (
    <div style={{ width: "100%", maxWidth: 640, flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <BackBtn onClick={onBack} label={L("همهٔ موضوع‌ها", "All topics")} />
      </div>

      {/* The topic */}
      <div className="ui-fade" style={{ ...card, position: "relative", overflow: "hidden", borderRadius: 22, padding: "16px 18px 16px", background: `linear-gradient(165deg, ${alpha(f.color, 0.13)} 0%, ${C.surface} 58%)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={pill(alpha(f.color, 0.16), C.ink)}>{f.label}</span>
          <span style={pill(C.surface, topic.page === "EU" ? C.slate : C.orangeDeep)}>{topic.page === "EU" ? L("🇪🇺 اروپا", "🇪🇺 Europe") : L("🇨🇦 کانادا", "🇨🇦 Canada")}</span>
          {formatNewsDate(topic.date) && <span style={pill(C.surface, C.text2)}>📅 {formatNewsDate(topic.date)}</span>}
          {topic.evergreen && <span style={pill(alpha("#6d5bd0", 0.12), "#6d5bd0")}>💡 {L("توضیحی", "Explainer")}</span>}
        </div>
        <div dir="rtl" style={{ fontFamily: FA_FONT, fontWeight: 800, fontSize: 20, color: C.ink, textAlign: "right", lineHeight: 1.65, unicodeBidi: "plaintext" }}>
          {topic.title_fa || topic.title_en}
        </div>
        {topic.title_en && topic.title_fa && (
          <div dir="ltr" style={{ marginTop: 4, fontSize: 13.5, fontWeight: 600, color: C.text2, lineHeight: 1.5 }}>{topic.title_en}</div>
        )}
        {topic.why_now && (
          <div dir="rtl" style={{ marginTop: 12, padding: "9px 12px", borderRadius: 12, background: alpha(C.surfaceHi, 0.8), borderRight: `3px solid ${f.color}`, fontFamily: FA_FONT, fontSize: 12.5, lineHeight: 1.85, color: C.text2, textAlign: "right", unicodeBidi: "plaintext" }}>
            {topic.why_now}
          </div>
        )}
        {topic.source_url && (
          <a
            href={topic.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn"
            style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: C.teal, textDecoration: "none", direction: "ltr", background: C.surface, border: `1px solid ${alpha(C.teal, 0.4)}`, borderRadius: 11, padding: "8px 12px", fontFamily: FONT }}
          >
            🔗 {sourceHost(topic.source_url)} <span aria-hidden>↗</span>
          </a>
        )}
      </div>

      {/* Scripts and the original text */}
      <Section title={L("اسکریپت و متن اصلی", "Script and original text")}>
        {Array.isArray(topic.outline) && topic.outline.length > 0 && (
          <div dir={uiDir()} style={{ ...card, padding: "10px 14px", marginBottom: 10, fontFamily: FA_FONT, fontSize: 12.5, lineHeight: 1.8 }}>
            <b>🧭 {L("بخش‌هایی که این موضوع باید پوشش بده (از تحقیق):", "What this subject covers (from the research):")}</b>
            <ol dir="ltr" style={{ margin: "4px 0 0", paddingInlineStart: 20, textAlign: "left", color: C.text2 }}>
              {topic.outline.map((x, i) => <li key={i}>{x}</li>)}
            </ol>
          </div>
        )}
        <div className="ui-fade" style={{ ...card, padding: 14, minHeight: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Segmented value={tab} onChange={setTab} items={[["fa", "فارسی", FA_FONT], ["en", "English"], ["src", L("متن اصلی", "Original"), FA_FONT]]} />
            </div>
            {tab !== "src" && active && !loading && !(tab === "en" && (enInFarsi || enRunning)) && (
              <button className="ui-btn" onClick={() => onCopy(tab)} style={{ ...smallBtn(copied === tab ? C.success : C.orange), flexShrink: 0 }}>
                {copied === tab ? L("کپی شد ✓", "Copied ✓") : L("کپی", "Copy")}
              </button>
            )}
          </div>

          {tab === "src" ? (
            <OriginalText topic={topic} />
          ) : loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 220, gap: 14 }}>
              <div className="ui-spin" style={{ width: 30, height: 30, border: `3px solid ${alpha(C.text, 0.15)}`, borderTopColor: C.orange, borderRightColor: C.teal, borderRadius: "50%" }} />
              <div style={{ fontFamily: FA_FONT, fontSize: 13, color: C.text2, direction: uiDir() }}>{loadingText || L("در حال نوشتن اسکریپت فارسی و انگلیسی…", "Writing the Persian and English scripts…")}</div>
            </div>
          ) : error ? (
            <div dir={uiDir()} style={{ fontFamily: FA_FONT, fontSize: 13.5, color: C.reject, textAlign: isFa() ? "right" : "left" }}>
              {error}
              {onWrite && (
                <div style={{ marginTop: 14 }}>
                  <button className="ui-btn ui-glow-orange" onClick={onWrite} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 12, padding: "11px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: FA_FONT }}>
                    ↻ {L("دوباره بنویس", "Write again")}
                  </button>
                </div>
              )}
            </div>
          ) : !hasScripts ? (
            // Opened before approval: read the original first, then write.
            <div dir={uiDir()} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 200, fontFamily: FA_FONT, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.8 }}>{L("هنوز اسکریپتی برای این موضوع نوشته نشده.", "No script has been written for this topic yet.")}<br />{L("متن خبر در «متن اصلی» هست.", "The news text is under “Original”.")}</div>
              {onWrite && (
                <button className="ui-btn ui-glow-orange" onClick={onWrite} style={{ background: C.orange, color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: FA_FONT }}>
                  ✍️ {L("نوشتن اسکریپت (فارسی و انگلیسی)", "Write the scripts (Persian and English)")}
                </button>
              )}
            </div>
          ) : tab === "en" && (enRunning || enInFarsi || !scripts.en) ? (
            // The English script is missing, came back in Persian, or is
            // being rewritten: say so instead of showing Persian as English.
            <div dir={uiDir()} style={{ fontFamily: FONT }}>
              {enRunning ? (
                <div className="ui-progress" style={{ padding: "12px 14px", borderRadius: 12, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, fontSize: 13 }}>
                  <span className="ui-pulse">⏳</span> {L("در حال نوشتن اسکریپت انگلیسی…", "Writing the English script…")}
                </div>
              ) : (
                <div style={{ padding: "12px 14px", borderRadius: 12, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.35)}`, fontSize: 13, lineHeight: 1.6 }}>
                  <b>{enInFarsi ? L("این اسکریپت «انگلیسی» به فارسی نوشته شده.", "This “English” script came out in Persian.") : L("اسکریپت انگلیسی نیست.", "The English script is missing.")}</b>
                  <div style={{ color: C.text2, marginTop: 2 }}>
                    {L("از همون متن منبع به انگلیسی بازنویسی‌اش کن", "Rewrite it in English from the same source text")}{enInFarsi ? L("؛ نسخهٔ فارسی در تب فارسی می‌مونه", "; the Persian version stays in the Farsi tab") : ""}.
                  </div>
                  {(enFailed || (!scripts.en && enError)) && <div style={{ color: C.reject, fontSize: 12, marginTop: 6 }}>⚠️ {enFailed || enError}</div>}
                  <button className="ui-btn ui-glow-orange" onClick={() => onJob("script_en", { script: scripts.en || scripts.fa })} style={{ marginTop: 10, background: C.orange, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    ✍️ {L("به انگلیسی بنویس", "Write it in English")}
                  </button>
                </div>
              )}
              {enInFarsi && !enRunning && (
                <div style={{ marginTop: 14, opacity: 0.55 }}>
                  <ScriptBody text={scripts.en} tab="en" />
                </div>
              )}
            </div>
          ) : (
            <>
              <HookOptions hooks={scripts["hooks_" + tab] || []} lang={tab} />
              <ScriptBody text={active} tab={tab} />
              <ExtraSources sources={scripts.sources} supplement={scripts.supplement} />
              {scripts.before_check && onWrite && (
                <button className="ui-btn" onClick={() => window.confirm(L("اسکریپت فارسی و انگلیسی از نو نوشته می‌شن؛ اگه صفحهٔ اصلی کافی نباشه، اول از منابع معتبر مطلب تکمیلی پیدا می‌شه. ادامه بدیم؟", "Both scripts are written again; if the main page is not enough, more material is found from trusted sources first. Continue?")) && onWrite()} style={{ marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 12, border: `1px solid ${alpha(C.teal, 0.4)}`, background: alpha(C.teal, 0.08), color: C.text, fontWeight: 700, fontSize: 13, fontFamily: FA_FONT, cursor: "pointer" }}>
                  🔎 {L("نوشتن دوباره، با تحقیق بیشتر اگه صفحهٔ اصلی کافی نباشه", "Write again, researching more if the main page is not enough")}
                </button>
              )}
              <ScriptNote key={tab} topic={topic} tab={tab} script={active} job={fixJobs[tab]} onJob={onJob} />
            </>
          )}
        </div>
      </Section>

      {/* What to make from it */}
      {!loading && !error && (
        <Section title={L("ساخت از این موضوع", "Make from this topic")} hint={L("هر کدوم جدا؛ هیچ‌چیز خودکار ارسال نمی‌شه", "Each one separately; nothing is sent automatically")}>
          {/* Chosen before anything is made: the post, article, carousel and story below are
              written in this language, and each language keeps its own versions. */}
          <div style={{ marginBottom: 12 }}>
            <div dir={uiDir()} style={{ fontFamily: FA_FONT, fontSize: 12.5, fontWeight: 700, color: C.text2, marginBottom: 6, textAlign: isFa() ? "right" : "left" }}>{L("زبان محتوا", "Content language")}</div>
            <Segmented value={lang} onChange={setLang} items={[["fa", "فارسی", FA_FONT], ["en", "English"]]} />
            <div dir={uiDir()} style={{ fontFamily: FA_FONT, fontSize: 11.5, color: C.text3, marginTop: 6, textAlign: isFa() ? "right" : "left" }}>
              {lang === "en"
                ? L("پست تلگرام، مقاله، کاروسل و استوری به انگلیسی ساخته می‌شن. نسخه‌های فارسی همون‌طور می‌مونن.", "Telegram post, blog article, carousel and story are made in English. The Persian versions stay as they are.")
                : L("پست تلگرام، مقاله، کاروسل و استوری به فارسی ساخته می‌شن. نسخه‌های انگلیسی جدا نگه داشته می‌شن.", "Telegram post, blog article, carousel and story are made in Persian. The English versions are kept apart.")}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {tiles.filter(Boolean).map((t) => <ActionTile key={t.k} {...t} />)}
          </div>
        </Section>
      )}

      {/* Telegram news post (nothing until asked for or made) */}
      {!loading && !error && (tgOpen || tgPost || tgJob) && (
        <div ref={telegramRef} style={{ scrollMarginTop: 90 }}>
          <TelegramPanel key={"tg:" + lang} topic={topic} post={tgPost} job={tgJob} caps={caps} onJob={onJob} lang={lang} />
        </div>
      )}

      {/* Blog article */}
      {!loading && !error && artState !== "idle" && (
        <Section title={L("مقالهٔ وبلاگ", "Blog article") + (lang === "en" ? L(" · انگلیسی", " · English") : "")} innerRef={articleRef}>
          {artState === "generating" && (
            <div dir={uiDir()} className="ui-progress" style={{ ...card, padding: "12px 14px", fontFamily: FA_FONT, fontSize: 13 }}>
              <span className="ui-pulse">⏳</span> {L("در حال نوشتن مقاله…", "Writing the article…")}
              <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>{L("می‌تونی از این صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.", "You can leave this page; the work carries on on the server.")}</div>
            </div>
          )}
          {artState === "error" && (
            <div style={{ ...card, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 11.5, color: C.reject, direction: "ltr", fontFamily: FONT, marginBottom: 8 }}>{artMsg}</div>
              <button className="ui-btn" onClick={generateArticle} style={smallBtn(C.teal)}>{L("دوباره امتحان کن", "Try again")}</button>
            </div>
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
              <div style={{ ...card, padding: "16px 18px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 11, fontFamily: FONT }}>
                  {article.focus_keyword && <span dir="rtl" style={{ background: alpha(C.teal, 0.14), color: C.teal, borderRadius: 99, padding: "3px 10px", fontFamily: FA_FONT, fontWeight: 600 }}>🔑 {article.focus_keyword}</span>}
                  {!article.parse_ok && <span dir={uiDir()} style={{ color: C.orange }}>⚠️ {L("خروجی ناقص — قبل از انتشار بررسی کن", "Incomplete output — check before publishing")}</span>}
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  <div dir={article.lang === "en" ? "ltr" : "rtl"} style={{ fontFamily: article.lang === "en" ? FONT : FA_FONT, fontWeight: 800, fontSize: 18, color: C.ink, lineHeight: 1.6, marginBottom: 10, unicodeBidi: "plaintext" }}>
                    {article.title_fa}
                  </div>
                  <div
                    dir={article.lang === "en" ? "ltr" : "rtl"}
                    className="article-preview"
                    style={{ fontFamily: article.lang === "en" ? FONT : FA_FONT, fontSize: 13.5, lineHeight: 1.9, color: "#2f3f45", textAlign: article.lang === "en" ? "left" : "right" }}
                    dangerouslySetInnerHTML={{ __html: article.content_html }}
                  />
                </div>
              </div>

              {caps.publishing === false ? null : pubState !== "done" ? (
                <button
                  className="ui-btn ui-glow-orange"
                  onClick={publishArticle}
                  disabled={pubState === "publishing"}
                  style={{
                    width: "100%", marginTop: 10, background: C.orange, color: "#fff", border: "none", borderRadius: 12, padding: "13px",
                    fontWeight: 700, fontSize: 14, cursor: pubState === "publishing" ? "default" : "pointer",
                    opacity: pubState === "publishing" ? 0.6 : 1, fontFamily: FONT,
                  }}
                >
                  {pubState === "publishing" ? L("در حال ساخت پیش‌نویس…", "Making the draft…") : pubState === "error" ? L("دوباره امتحان کن — انتشار پیش‌نویس", "Try again — publish draft") : L("⬆ انتشار پیش‌نویس در سایت", "⬆ Publish draft to the site")}
                </button>
              ) : (
                <a
                  href={editLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block", marginTop: 10, textAlign: "center", background: alpha(C.success, 0.14), color: C.success, border: `1px solid ${alpha(C.success, 0.5)}`,
                    borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 14, textDecoration: "none", fontFamily: FONT,
                  }}
                >
                  ✓ {L("پیش‌نویس ساخته شد — ویرایش در وردپرس", "Draft made — edit in WordPress")} ↗
                </a>
              )}
              {pubState === "error" && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, direction: "ltr", textAlign: "center", fontFamily: FONT }}>{pubMsg}</div>
              )}

              {/* Word file — generated in the app, no Google account needed. */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="ui-btn" onClick={downloadDoc} style={{ ...smallBtn(C.teal), flex: 1, padding: "11px", color: C.text }}>
                  {docState === "downloaded" ? L("دانلود شد ✓", "Downloaded ✓") : L("📄 دانلود فایل Word", "📄 Download Word file")}
                </button>

              </div>
              {docState === "error" && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.orange, direction: "ltr", textAlign: "center", fontFamily: FONT }}>{docMsg}</div>
              )}

              <button className="ui-btn" onClick={generateArticle} style={{ width: "100%", marginTop: 6, background: "transparent", color: C.text2, border: "none", cursor: "pointer", fontSize: 12, fontFamily: FONT, padding: 8 }}>
                ↻ {L("بازنویسی مقاله", "Rewrite the article")}
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Carousel (it shows nothing until asked for or made) */}
      {!loading && !error && (
        <div ref={carouselRef} style={{ scrollMarginTop: 90 }}>
          <CarouselPanel key={"car:" + lang} lang={lang} topic={topic} carousel={carousel} job={carouselJob} sendJob={sendJob} caps={caps} onJob={onJob} openSignal={carouselOpen} />
        </div>
      )}

      {/* Story (nothing until asked for or made) */}
      {!loading && !error && (
        <div ref={storyRef} style={{ scrollMarginTop: 90 }}>
          <StoryPanel key={"st:" + lang} lang={lang} topic={topic} story={story} job={storyJob} sendJob={storySendJob} caps={caps} onJob={onJob} openSignal={storyOpen} />
        </div>
      )}

      {/* English video */}
      {!loading && !error && (videoJob || video) && (
        <Section title={L("ویدیوی انگلیسی", "English video")} innerRef={videoRef}>
          <VideoPanel job={videoJob} video={video} onRefresh={onRefreshVideo} onOpen={() => setComposer(true)} />
        </Section>
      )}

      {/* Content calendar: each thing made from this topic can become a post */}
      {!loading && !error && (
        <CalendarStrip
          topic={topic}
          C={C}
          FONT={FONT}
          version={[
            slides.filter((x) => x.image_url).length,
            storyPages.filter((x) => x.image_url).length,
            (video && video.video_url) || "",
            article ? 1 : 0,
            hasScripts ? 1 : 0,
          ].join("|")}
        />
      )}

      {composer && (
        <VideoComposer
          topic={topic}
          enabled={!!caps.video}
          initial={draft || videoDraftFrom(scripts.en, video && video.request)}
          savedScript={scripts.en}
          draftJob={draftJob}
          onDraft={setDraft}
          onClose={() => setComposer(false)}
          onFit={(x) => onJob("script_en", { ...x, save: false })}
          onSubmit={(req) => {
            onJob("video", { video: req });
            setComposer(false);
            reveal(videoRef);
          }}
        />
      )}

      <button
        onClick={onBack}
        className="ui-btn"
        style={{ display: "block", width: "100%", boxSizing: "border-box", textAlign: "center", marginTop: 22, background: "transparent", color: C.text2, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: FONT }}
      >
        ← {L("همهٔ موضوع‌ها", "All topics")}
      </button>
    </div>
  );
}

// Carousel post from this topic: choose the number of slides and add notes,
// the server writes the slides (the Content Wizard's carousel prompt) and
// draws each one with the image model, then the set can go to Telegram.
// Everything runs as server jobs and is saved with the topic for the team.
// Every drawn slide as its own file (not a zip), one after another. The
// browser may ask once to allow several downloads from this site.
async function downloadSlides(slides, topic) {
  const base = String((topic && topic.title_en) || "carousel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carousel";
  for (const s of slides.filter((x) => x.image_url)) {
    const a = document.createElement("a");
    a.href = "/api/carousel/download?url=" + encodeURIComponent(s.image_url) + "&name=" + encodeURIComponent(`${base}-${String(s.num).padStart(2, "0")}.jpg`);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
    await new Promise((r) => setTimeout(r, 700));
  }
}

function CarouselPanel({ topic, carousel, job, sendJob, caps = {}, onJob, openSignal = 0, lang = "fa" }) {
  const textDir = lang === "en" ? "ltr" : "rtl";
  const [form, setForm] = useState(false);
  // The Carousel tile on the topic page opens the form.
  useEffect(() => {
    if (openSignal) setForm(true);
  }, [openSignal]);
  const [count, setCount] = useState(7);
  const [notes, setNotes] = useState("");
  const [copiedCap, setCopiedCap] = useState(false);
  const [preview, setPreview] = useState(0); // slide number shown large, 0 = closed
  const [revNotes, setRevNotes] = useState("");
  const [learnRev, setLearnRev] = useState(false);
  const [editing, setEditing] = useState(0); // slide number whose edit sheet is open
  const [template, setTemplate] = useState((carousel && carousel.template) || 1);
  const [textOpen, setTextOpen] = useState(false); // the slide-text editor over a drawn carousel
  const [draft, setDraft] = useState([]); // [{ title, body }] being edited
  const [capOpen, setCapOpen] = useState(false);
  const [capText, setCapText] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const running = !!job && job.status === "running";
  const stage = running ? (job.result && job.result.stage) || "writing" : "";
  const failed = !!job && job.status === "error" ? job.error : "";
  const slides = (carousel && carousel.slides) || [];
  const drawn = slides.filter((s) => s.image_url).length;
  const missing = slides.length - drawn;
  // Which slide a single-slide job is working on, so only that one shows it.
  const busySlide = running && job.kind === "carousel_slide" ? (job.extra && job.extra.num) || 0 : 0;
  const font = "'Geist', 'Vazirmatn', sans-serif";
  const fa = "'Vazirmatn', sans-serif";

  const isDraft = !!(carousel && carousel.draft) && !slides.some((x) => x.image_url);
  const mode = (job && job.extra && job.extra.mode) || "";
  // The editor follows the saved text whenever a new version arrives, never while it is typed in.
  const version = slides.map((x) => x.content).join("\u0001") + "|" + ((carousel && carousel.template) || 1) + "|" + ((carousel && carousel.caption) || "");
  useEffect(() => {
    setDraft(slides.map((x) => splitSlide(x.content)));
    setDraftCaption((carousel && carousel.caption) || "");
    if (carousel && carousel.template) setTemplate(carousel.template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const start = (textOnly) => {
    if (slides.length && !window.confirm(L("کاروسل جدید جای کاروسل فعلی رو می‌گیره. ادامه بدیم؟", "A new carousel replaces the current one. Continue?"))) return;
    setForm(false);
    onJob("carousel", { count, notes: notes.trim(), template, ...(textOnly ? { mode: "text" } : {}) });
  };
  const editedSlides = () => draft.map((d) => ({ title: d.title, body: d.body })).filter((d) => d.title.trim() || d.body.trim());
  const saveText = () => onJob("carousel", { mode: "save", slides: editedSlides(), caption: draftCaption, template });
  const drawText = () => {
    setTextOpen(false);
    onJob("carousel", { mode: "draw", slides: editedSlides(), caption: draftCaption, template });
  };
  const saveCaption = () => {
    setCapOpen(false);
    onJob("carousel", { mode: "save", slides: slides.map((x) => ({ content: x.content })), caption: capText, template: (carousel && carousel.template) || 1 });
  };
  const changed = draft.some((d, i) => !slides[i] || [d.title.trim(), d.body.trim()].filter(Boolean).join("\n") !== slides[i].content) || draft.length !== slides.length || template !== ((carousel && carousel.template) || 1) || draftCaption !== ((carousel && carousel.caption) || "");
  const btn = (bg, color, border) => ({
    background: bg, color, border, borderRadius: 12, padding: "11px 12px", fontWeight: 700, fontSize: 13.5,
    cursor: "pointer", fontFamily: font,
  });

  if (!slides.length && !running && !form && !failed) return null;
  return (
    <Section title={L("پست کاروسل", "Carousel post") + (lang === "en" ? L(" · انگلیسی", " · English") : "")}>

      {form && !running && (
        <div dir={uiDir()} className="ui-fade" style={{ background: C.surface, border: `1px solid ${alpha("#6d5bd0", 0.35)}`, borderRadius: 16, padding: 14, fontFamily: fa }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>🖼 {L("کاروسل از این موضوع", "Carousel from this topic")}</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("تعداد اسلاید", "Number of slides")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} className="ui-btn" onClick={() => setCount(n)} style={{ minWidth: 38, height: 34, borderRadius: 10, cursor: "pointer", border: `1px solid ${count === n ? "#6d5bd0" : C.line}`, background: count === n ? alpha("#6d5bd0", 0.14) : C.surface, color: count === n ? "#6d5bd0" : C.text, fontWeight: 700, fontFamily: font }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("یادداشت‌ها (اختیاری)", "Notes (optional)")}</div>
          <textarea
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={L("مثلاً: روی دانشجوها تمرکز کن، اسلاید مقایسه نذار، رنگ‌ها روشن باشه…", "e.g. focus on students, no comparison slide, keep the colours light…")}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
          />
          <div style={{ fontSize: 11.5, color: C.text3, margin: "6px 0 12px" }}>
            {L(
              "متن اسلایدها فقط از متن خبر نوشته می‌شه و هر اسلاید با GPT Image 2 طراحی می‌شه (حدود ۵ سنت برای هر اسلاید، چند دقیقه طول می‌کشه). «نوشتن متن» اول فقط متن رو می‌نویسه تا تیتر و بدنهٔ هر اسلاید رو عوض کنی، بعد طراحی می‌شه.",
              "The slide text is written only from the news text and each slide is designed with GPT Image 2 (about 5 cents a slide, takes a few minutes). “Write the text” writes only the text first, so you can change each slide's heading and body before it is designed."
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("قالب اسلایدها", "Slide template")}</div>
          <TemplatePicker value={template} onChange={setTemplate} font={fa} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ui-btn" onClick={() => start(true)} disabled={!caps.carousel} style={{ ...btn(alpha("#6d5bd0", 0.1), "#6d5bd0", `1px solid ${alpha("#6d5bd0", 0.5)}`), flex: 1, minWidth: 150, opacity: caps.carousel ? 1 : 0.5 }}>
              ✍️ {L(`نوشتن متن ${count} اسلاید`, `Write the text of ${count} slides`)}
            </button>
            <button className="ui-btn ui-glow-orange" onClick={() => start(false)} disabled={!caps.carousel} style={{ ...btn("#6d5bd0", "#fff", "none"), flex: 1, minWidth: 150, opacity: caps.carousel ? 1 : 0.5 }}>
              {L(`ساخت ${count} اسلاید`, `Make ${count} slides`)}
            </button>
            <button className="ui-btn" onClick={() => setForm(false)} style={btn("transparent", C.text2, `1px solid ${C.line}`)}>
              {L("انصراف", "Cancel")}
            </button>
          </div>
        </div>
      )}

      {running && (
        <div dir={uiDir()} className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha("#6d5bd0", 0.08), border: `1px solid ${alpha("#6d5bd0", 0.3)}`, fontFamily: fa, fontSize: 13, marginBottom: 10 }}>
          <span className="ui-pulse">⏳</span>{" "}
          {mode === "save"
            ? L("در حال ذخیره…", "Saving…")
            : stage === "writing"
            ? L("در حال نوشتن متن اسلایدها…", "Writing the slide text…")
            : slides.length
              ? L(`در حال طراحی اسلایدها… ${drawn} از ${slides.length}`, `Designing the slides… ${drawn} of ${slides.length}`)
              : L("در حال طراحی اسلاید…", "Designing the slide…")}
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>{L("می‌تونی از این صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.", "You can leave this page; the work carries on on the server.")}</div>
        </div>
      )}
      {failed && !running && (
        <div style={{ fontSize: 12, color: C.reject, marginBottom: 10, fontFamily: font, direction: "ltr" }}>⚠️ {failed}</div>
      )}

      {slides.length > 0 && !running && (isDraft || textOpen) && (
        <SlideTextEditor
          draft={draft}
          setDraft={setDraft}
          template={template}
          setTemplate={setTemplate}
          caption={draftCaption}
          setCaption={setDraftCaption}
          drawnBefore={!isDraft}
          changed={changed}
          onSave={saveText}
          onDraw={drawText}
          onClose={isDraft ? null : () => setTextOpen(false)}
          btn={btn}
          fa={fa}
        />
      )}

      {slides.length > 0 && !(isDraft && !running) && !textOpen && (
        <div>
          <div dir={uiDir()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, fontFamily: fa }}>
            <b style={{ fontSize: 14.5 }}>🖼 {L(`کاروسل · ${slides.length} اسلاید`, `Carousel · ${slides.length} slides`)}</b>
            {!running && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                {drawn > 0 && (
                  <button className="ui-btn" onClick={() => downloadSlides(slides, topic)} style={{ background: alpha(C.teal, 0.1), border: `1px solid ${alpha(C.teal, 0.4)}`, borderRadius: 9, padding: "5px 10px", color: C.text, cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: fa }}>
                    ⬇ {L(`دانلود همه (${drawn})`, `Download all (${drawn})`)}
                  </button>
                )}
                <button className="ui-btn" onClick={() => setTextOpen(true)} style={{ background: alpha("#6d5bd0", 0.1), border: `1px solid ${alpha("#6d5bd0", 0.4)}`, borderRadius: 9, padding: "5px 10px", color: "#6d5bd0", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: fa }}>
                  ✍️ {L("متن اسلایدها", "Slide text")}
                </button>
                <button className="ui-btn" onClick={() => setForm(true)} style={{ background: "transparent", border: "none", color: C.text2, cursor: "pointer", fontSize: 12.5, fontFamily: fa }}>
                  ↻ {L("از نو (بدون نسخهٔ قبلی)", "Start over (without the last version)")}
                </button>
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {slides.map((sl) => (
              <div key={sl.num} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                {sl.image_url ? (
                  <button onClick={() => setPreview(sl.num)} aria-label={L("پیش‌نمایش اسلاید ", "Preview slide ") + sl.num} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                    <img src={sl.image_url} alt={L("اسلاید ", "Slide ") + sl.num} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", background: C.surfaceHi }} />
                  </button>
                ) : (
                  <div className={running ? "ui-skeleton" : ""} style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", background: C.surfaceHi, color: C.text3, fontSize: 12, padding: 8, textAlign: "center", fontFamily: font }}>
                    {running ? "…" : "⚠️ " + (sl.error ? sl.error.slice(0, 80) : L("بدون تصویر", "no image"))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", fontSize: 11.5, fontFamily: font, color: C.text2 }}>
                  <span title={sl.content} style={{ fontWeight: 700 }}>{sl.num}/{slides.length}</span>
                  {busySlide === sl.num ? (
                    <span className="ui-pulse" style={{ fontSize: 11.5, color: C.orangeDeep }}>⏳ {L("در حال کار…", "working…")}</span>
                  ) : !running && (
                    <span style={{ display: "inline-flex", gap: 4 }}>
                      {sl.image_url && (
                        <button className="ui-btn" onClick={() => setEditing(sl.num)} title={L("فقط همین اسلاید عوض بشه", "Change only this slide")} aria-label={L("ویرایش اسلاید ", "Edit slide ") + sl.num} style={{ background: alpha("#6d5bd0", 0.1), border: `1px solid ${alpha("#6d5bd0", 0.4)}`, borderRadius: 8, padding: "2px 8px", cursor: "pointer", fontSize: 11.5, color: "#6d5bd0" }}>
                          ✏️
                        </button>
                      )}
                      <button className="ui-btn" onClick={() => onJob("carousel_slide", { num: sl.num })} title={L("این اسلاید از اول دوباره کشیده بشه", "Draw this slide again from scratch")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "2px 8px", cursor: "pointer", fontSize: 11.5, color: C.text2 }}>
                        ↻
                      </button>
                    </span>
                  )}
                </div>
                <div dir={textDir} style={{ padding: "0 8px 8px", fontFamily: fa, fontSize: 11.5, lineHeight: 1.6, color: C.text2, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-line" }}>
                  {sl.content}
                </div>
              </div>
            ))}
          </div>

          {slides.some((sl) => sl.kept === "memory") && (
            <div dir={uiDir()} style={{ marginTop: 8, fontSize: 11.5, color: C.orangeDeep, fontFamily: fa, lineHeight: 1.7 }}>
              ⚠️ {L("بعضی تصاویر در وردپرس ذخیره نشدن و فقط تا ری‌استارت بعدی سرور می‌مونن. اگه لازمشون داری دانلودشون کن یا به تلگرام بفرست.", "Some pictures were not saved in WordPress and last only until the server's next restart. Download them if you need them.")}
            </div>
          )}
          {!running && (
            <div dir={uiDir()} style={{ marginTop: 14, background: C.surface, border: `1px solid ${alpha("#6d5bd0", 0.35)}`, borderRadius: 14, padding: 12, fontFamily: fa }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>✏️ {L("یادداشت برای نسخهٔ بعد", "Note for the next version")}</div>
              <textarea
                dir="auto"
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                rows={3}
                placeholder={L("چه چیزی عوض بشه؟ مثلاً: اسلاید ۲ کوتاه‌تر، تیتر اسلاید اول درشت‌تر، عکس واقعی‌تر، رنگ‌ها روشن‌تر…", "What should change? e.g. slide 2 shorter, a bigger heading on slide 1, a more real photo, lighter colours…")}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  className="ui-btn ui-glow-orange"
                  disabled={!revNotes.trim()}
                  onClick={() => {
                    onJob("carousel", { count: slides.length, notes: revNotes.trim(), revise: true });
                    if (learnRev) teach({ topic, scope: "carousel", note: revNotes.trim(), context: slides.map((x) => x.content).join("\n---\n") });
                  }}
                  style={{ ...btn("#6d5bd0", "#fff", "none"), flex: 1, opacity: revNotes.trim() ? 1 : 0.5, cursor: revNotes.trim() ? "pointer" : "default" }}
                >
                  ↻ {L("ساخت دوباره با این یادداشت", "Make again with this note")}
                </button>
                <span style={{ fontSize: 11.5, color: C.text3 }}>{L("نسخهٔ فعلی پایهٔ کار می‌مونه؛ فقط چیزهایی که نوشتی عوض می‌شه.", "The current version stays the base; only what you wrote changes.")}</span>
              </div>
              <LearnToggle on={learnRev} setOn={setLearnRev} />
            </div>
          )}
          {preview > 0 && <SlidePreview slides={slides.filter((x) => x.image_url)} start={preview} onClose={() => setPreview(0)} />}
          {editing > 0 && slides.some((x) => x.num === editing) && (
            <EditPictureSheet
              title={L(`اسلاید ${editing} از ${slides.length}`, `Slide ${editing} of ${slides.length}`)}
              item={slides.find((x) => x.num === editing)}
              text={slides.find((x) => x.num === editing).content}
              ratio="4 / 5"
              tone="#6d5bd0"
              onClose={() => setEditing(0)}
              onSubmit={(edit, learn) => {
                onJob("carousel_slide", { num: editing, edit });
                if (learn) teach({ topic, scope: "design", note: edit, context: (slides.find((x) => x.num === editing) || {}).content || "" });
                setEditing(0);
              }}
            />
          )}
          {!running && missing > 0 && (
            <button className="ui-btn" onClick={() => onJob("carousel_slide", { num: "missing" })} style={{ ...btn(alpha(C.orange, 0.1), C.text, `1px solid ${alpha(C.orange, 0.4)}`), width: "100%", marginTop: 10 }}>
              {L(`طراحی ${missing} اسلاید باقی‌مانده`, `Design the ${missing} remaining slides`)}
            </button>
          )}

          {carousel.caption && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text3, letterSpacing: 0.5 }}>{L("کپشن", "CAPTION")}</span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                {!running && !capOpen && (
                  <button className="ui-btn" onClick={() => { setCapText(carousel.caption); setCapOpen(true); }} title={L("ویرایش کپشن", "Edit the caption")} aria-label={L("ویرایش کپشن", "Edit the caption")} style={{ background: alpha("#6d5bd0", 0.1), border: `1px solid ${alpha("#6d5bd0", 0.4)}`, borderRadius: 8, padding: "3px 8px", cursor: "pointer", fontSize: 11.5, color: "#6d5bd0" }}>
                    ✏️
                  </button>
                )}
                <button
                  className="ui-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(carousel.caption);
                    setCopiedCap(true);
                    setTimeout(() => setCopiedCap(false), 1400);
                  }}
                  style={{ background: copiedCap ? C.success : alpha(C.orange, 0.14), color: copiedCap ? "#fff" : C.orange, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {copiedCap ? L("کپی شد ✓", "Copied ✓") : L("کپی", "Copy")}
                </button>
                </span>
              </div>
              {capOpen ? (
                <div dir={textDir}>
                  <textarea value={capText} onChange={(e) => setCapText(e.target.value)} rows={8} style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 12.5, lineHeight: 1.8, resize: "vertical" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button className="ui-btn" onClick={saveCaption} disabled={!capText.trim()} style={{ ...btn("#6d5bd0", "#fff", "none"), padding: "7px 14px", opacity: capText.trim() ? 1 : 0.5 }}>{L("ذخیرهٔ کپشن", "Save caption")}</button>
                    <button className="ui-btn" onClick={() => setCapOpen(false)} style={{ ...btn("transparent", C.text2, `1px solid ${C.line}`), padding: "7px 14px" }}>{L("انصراف", "Cancel")}</button>
                    <span dir={uiDir()} style={{ fontSize: 11.5, color: C.text3, fontFamily: fa }}>{L("حداکثر ۳ هشتگ نگه داشته می‌شه.", "At most 3 hashtags are kept.")}</span>
                  </div>
                </div>
              ) : (
                <div dir={textDir} style={{ fontFamily: fa, fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap", maxHeight: 180, overflowY: "auto" }}>{carousel.caption}</div>
              )}
            </div>
          )}

          {drawn > 0 && !running && (
            <CalendarButtons topic={topic} made={lang === "en" ? "carousel_en" : "carousel"} version={slides.map((x) => x.image_url || "").join("|")} C={C} FONT={font} />
          )}
        </div>
      )}
    </Section>
  );
}

// A slide's text as the editor sees it: the first line is the heading, the rest the body.
function splitSlide(content) {
  const lines = String(content || "").split("\n");
  return { title: (lines[0] || "").trim(), body: lines.slice(1).join("\n").trim() };
}

function TemplatePicker({ value, onChange, font }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, marginBottom: 12 }}>
      {TEMPLATES.map((t) => {
        const on = Number(value) === t.id;
        return (
          <button key={t.id} type="button" className="ui-btn" onClick={() => onChange(t.id)} aria-pressed={on} style={{ textAlign: "start", padding: 8, borderRadius: 12, cursor: "pointer", border: `${on ? 2 : 1}px solid ${on ? "#6d5bd0" : C.line}`, background: on ? alpha("#6d5bd0", 0.08) : C.surface, fontFamily: font }}>
            {t.cover ? (
              <img src={t.cover} alt="" loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}`, marginBottom: 6, background: t.swatch[0] }} />
            ) : (
              <div style={{ display: "flex", height: 34, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 6 }}>
                {t.swatch.map((c, i) => (
                  <span key={i} style={{ flex: i === 0 ? 2 : 1, background: c }} />
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 800, color: on ? "#6d5bd0" : C.text }}>{t.id}. {L(t.fa, t.name)}</div>
            {isFa() && <div style={{ fontSize: 10.5, color: C.text3, direction: "ltr", textAlign: "right" }}>{t.name}</div>}
          </button>
        );
      })}
    </div>
  );
}

// The slides' words before (or instead of) drawing them again: a heading and a body per slide,
// the caption, and the template. Drawing again keeps the picture of every slide whose words and
// template did not change.
function SlideTextEditor({ draft, setDraft, template, setTemplate, caption, setCaption, drawnBefore, changed, onSave, onDraw, onClose, btn, fa }) {
  const set = (i, k, v) => setDraft(draft.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  const field = { width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line}`, padding: 9, fontFamily: fa, fontSize: 13, lineHeight: 1.7, background: C.surface, color: C.text };
  const any = draft.some((d) => d.title.trim() || d.body.trim());
  return (
    <div dir={uiDir()} className="ui-fade" style={{ background: C.surface, border: `1px solid ${alpha("#6d5bd0", 0.35)}`, borderRadius: 16, padding: 14, fontFamily: fa, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <b style={{ fontSize: 14.5 }}>✍️ {L(`متن اسلایدها · ${draft.length} اسلاید`, `Slide text · ${draft.length} slides`)}</b>
        {onClose && (
          <button className="ui-btn" onClick={onClose} style={{ background: "transparent", border: "none", color: C.text2, cursor: "pointer", fontSize: 12.5, fontFamily: fa }}>
            {L("بستن", "Close")}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.text3, marginBottom: 10 }}>{L("تیتر و بدنهٔ هر اسلاید رو عوض کن؛ بعد «طراحی اسلایدها» رو بزن.", "Change each slide's heading and body, then press “Design slides”.")} {drawnBefore ? L("فقط اسلایدهایی که متنشون عوض شده دوباره طراحی می‌شن (با قالب جدید، همه).", "Only slides whose text changed are designed again (all of them with a new template).") : ""}</div>
      {draft.map((d, i) => (
        <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 10, marginBottom: 8, background: C.surfaceHi }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#6d5bd0", marginBottom: 6 }}>{L("اسلاید ", "Slide ")}{i + 1}{i === 0 ? L(" (کاور)", " (cover)") : i === draft.length - 1 ? L(" (آخر)", " (last)") : ""}</div>
          <div style={{ fontSize: 11.5, color: C.text2, marginBottom: 3 }}>{L("تیتر", "Heading")}</div>
          <input dir="auto" value={d.title} onChange={(e) => set(i, "title", e.target.value)} style={{ ...field, fontWeight: 700, marginBottom: 6 }} />
          <div style={{ fontSize: 11.5, color: C.text2, marginBottom: 3 }}>{L("بدنه", "Body")}</div>
          <textarea dir="auto" value={d.body} onChange={(e) => set(i, "body", e.target.value)} rows={Math.min(8, Math.max(3, d.body.split("\n").length + 1))} style={{ ...field, resize: "vertical" }} />
        </div>
      ))}
      <div style={{ fontSize: 12.5, color: C.text2, margin: "10px 0 4px" }}>{L("کپشن (حداکثر ۳ هشتگ)", "Caption (at most 3 hashtags)")}</div>
      <textarea dir="auto" value={caption} onChange={(e) => setCaption(e.target.value)} rows={6} style={{ ...field, resize: "vertical", marginBottom: 12 }} />
      <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("قالب اسلایدها", "Slide template")}</div>
      <TemplatePicker value={template} onChange={setTemplate} font={fa} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="ui-btn ui-glow-orange" onClick={onDraw} disabled={!any || (drawnBefore && !changed)} style={{ ...btn("#6d5bd0", "#fff", "none"), flex: 1, minWidth: 150, opacity: any && (!drawnBefore || changed) ? 1 : 0.5 }}>
          🎨 {L("طراحی اسلایدها", "Design slides")}
        </button>
        <button className="ui-btn" onClick={onSave} disabled={!any || !changed} style={{ ...btn("transparent", C.text, `1px solid ${C.line}`), opacity: any && changed ? 1 : 0.5 }}>
          💾 {L("ذخیرهٔ متن", "Save text")}
        </button>
      </div>
    </div>
  );
}

// A slide shown large over the page: arrows, swipe or the keyboard move
// between slides, Esc or a tap outside closes.
// Instagram fact story: 1 to 4 pages (1 by default). The server writes a
// short Farsi fact per page, photographs the original source (the Lexbase PDF
// or the news page) with the proving sentence highlighted, and draws each
// page at 1080x1920. Screenshots are taken only for topics made into stories.
const STORY_TONE = "#c2410c";
// Save one story page. On a phone the share sheet offers "Save Image" (to
// Photos); elsewhere it downloads. The image comes through the app because
// the page cannot read HCTI's images itself.
async function saveStoryImage(url, name) {
  try {
    const res = await fetch("/api/story/image?u=" + encodeURIComponent(url) + "&name=" + encodeURIComponent(name));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const file = new File([blob], name, { type: blob.type || "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // closed the share sheet
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (_) {
    window.open(url, "_blank", "noopener"); // long-press to save from there
  }
}

// English names for the story templates, whose own list (lib/story/templates.js) holds only Persian.
const STORY_TEMPLATE_EN = { simple: "Simple (default)", c2: "News card on a photo", c3: "News site page", c4: "Attention", c5: "Breaking news", c6: "Formal and calm", c7: "Local news", c8: "Did you know? Dark", c9: "Did you know? Bold", c10: "Did you know? Paper", c11: "Magazine", c12: "Warning", c16: "Bulletin", c17: "Red wave", c18: "Navy update", c19: "Tabloid" };
// The ten preset backgrounds (lib/story/colours.js) and a colour wheel for any other: the picked
// colour travels as its hex and is drawn with text colours that follow its brightness.
function BgSwatches({ value, onPick, disabled }) {
  const picked = isHexColour(value) ? value.toLowerCase() : "";
  const wheel = useRef(null);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {STORY_BG_ORDER.map((k) => (
        <button
          key={k}
          className="ui-btn"
          disabled={disabled}
          aria-label={L(STORY_BG_NAMES[k])}
          title={L(STORY_BG_NAMES[k])}
          onClick={() => onPick(k)}
          style={{ width: 34, height: 34, borderRadius: 99, background: STORY_BACKGROUNDS[k].bg, cursor: disabled ? "default" : "pointer", border: value === k ? `3px solid ${STORY_TONE}` : `1px solid ${C.line}`, boxShadow: value === k ? `0 0 0 2px #fff inset` : "none" }}
        />
      ))}
      <label
        title={L("رنگ دلخواه", "Any colour")}
        style={{ position: "relative", width: 34, height: 34, borderRadius: 99, cursor: disabled ? "default" : "pointer", border: picked ? `3px solid ${STORY_TONE}` : `1px solid ${C.line}`, boxShadow: picked ? "0 0 0 2px #fff inset" : "none", background: picked ? picked : "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)", display: "grid", placeItems: "center", fontSize: 14, color: picked ? "transparent" : "#fff", textShadow: "0 0 3px rgba(0,0,0,.6)" }}
      >
        {picked ? "" : "+"}
        <input
          ref={wheel}
          type="color"
          disabled={disabled}
          value={picked || "#8a3893"}
          aria-label={L("انتخاب رنگ دلخواه", "Pick any colour")}
          onChange={(e) => onPick(String(e.target.value).toLowerCase())}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "inherit" }}
        />
      </label>
      {picked && <span dir="ltr" style={{ fontSize: 11.5, color: C.text3, fontFamily: "monospace" }}>{picked}</span>}
    </div>
  );
}
// The story templates (lib/story/templates.js), each shown by a small
// picture of a sample page in that look (public/story-templates).
function StoryTemplatePicker({ value, onPick, disabled }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {STORY_TEMPLATES.map((t) => {
        const on = (value || "simple") === t.key;
        return (
          <button
            key={t.key}
            className="ui-btn"
            disabled={disabled}
            onClick={() => onPick(t.key)}
            title={L(t.name, STORY_TEMPLATE_EN[t.key] || t.name)}
            style={{ flex: "0 0 auto", width: 76, padding: 0, background: "none", cursor: disabled ? "default" : "pointer", border: "none", textAlign: "center" }}
          >
            <img src={`/story-templates/${t.key}.jpg`} alt="" loading="lazy" style={{ display: "block", width: 76, height: 135, objectFit: "cover", borderRadius: 10, border: on ? `3px solid ${STORY_TONE}` : `1px solid ${C.line}`, boxSizing: "border-box" }} />
            <div style={{ fontSize: 10.5, marginTop: 4, fontWeight: on ? 800 : 500, color: on ? STORY_TONE : C.text2, fontFamily: "'Vazirmatn', sans-serif", lineHeight: 1.3 }}>{L(t.name, STORY_TEMPLATE_EN[t.key] || t.name)}</div>
          </button>
        );
      })}
    </div>
  );
}
function StoryPanel({ topic, story, job, sendJob, caps = {}, onJob, openSignal = 0, lang = "fa" }) {
  const [form, setForm] = useState(false);
  useEffect(() => {
    if (openSignal) setForm(true);
  }, [openSignal]);
  const [count, setCount] = useState(1);
  const [bg, setBg] = useState("purple");
  const [template, setTemplate] = useState("simple");
  const [notes, setNotes] = useState("");
  const [revNotes, setRevNotes] = useState("");
  const [learnRev, setLearnRev] = useState(false);
  const [copiedCap, setCopiedCap] = useState(false);
  const [preview, setPreview] = useState(0);
  const [editing, setEditing] = useState(0); // page number whose edit sheet is open
  const [designing, setDesigning] = useState(0); // page number laid out by hand
  const running = !!job && job.status === "running";
  const stage = running ? (job.result && job.result.stage) || "writing" : "";
  const failed = !!job && job.status === "error" ? job.error : "";
  const pages = (story && story.pages) || [];
  const drawn = pages.filter((p) => p.image_url).length;
  const missing = pages.length - drawn;
  const busyPage = running && (job.kind === "story_page" || job.kind === "story_photo") ? (job.extra && job.extra.num) || 0 : 0;
  // The chosen template has an AI photo on each page, which the team can change.
  const hasPhoto = !!(STORY_TEMPLATES.find((t) => t.key === ((story && story.template) || "simple")) || {}).photo;
  const [photoFor, setPhotoFor] = useState(0); // page whose photo note box is open
  const [photoNote, setPhotoNote] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  // A picture from the device: made smaller here (at most 1600 px), sent to
  // the server to be kept, then that page is drawn again with it.
  const uploadPhoto = async (num, file) => {
    setUploadErr("");
    try {
      const img = await new Promise((ok, bad) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => bad(new Error(L("این فایل عکس نیست", "this file is not a picture")));
        im.src = URL.createObjectURL(file);
      });
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * k);
      cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const res = await fetch("/api/story/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: cv.toDataURL("image/jpeg", 0.88) }) });
      const j = await res.json();
      if (!res.ok || !j.url) throw new Error(j.error || L("آپلود نشد", "upload failed"));
      onJob("story_photo", { num, url: j.url });
    } catch (e) {
      setUploadErr(String(e.message || e));
    }
  };
  const font = "'Geist', 'Vazirmatn', sans-serif";
  const fa = "'Vazirmatn', sans-serif";
  const isLex = topic && (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || ""));

  const start = () => {
    if (pages.length && !window.confirm(L("استوری جدید جای استوری فعلی رو می‌گیره. ادامه بدیم؟", "A new story replaces the current one. Continue?"))) return;
    setForm(false);
    onJob("story", { count, notes: notes.trim(), bg, template });
  };
  const btn = (bg, color, border) => ({ background: bg, color, border, borderRadius: 12, padding: "11px 12px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: font });

  if (!pages.length && !running && !form && !failed) return null;
  return (
    <Section title={L("استوری", "Story") + (lang === "en" ? L(" · انگلیسی", " · English") : "")}>
      {form && !running && (
        <div dir={uiDir()} className="ui-fade" style={{ background: C.surface, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 16, padding: 14, fontFamily: fa }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, marginBottom: 10 }}>📱 {L("استوری فکت از این موضوع", "Fact story from this topic")}</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("تعداد صفحه", "Number of pages")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} className="ui-btn" onClick={() => setCount(n)} style={{ minWidth: 44, height: 34, borderRadius: 10, cursor: "pointer", border: `1px solid ${count === n ? STORY_TONE : C.line}`, background: count === n ? alpha(STORY_TONE, 0.12) : C.surface, color: count === n ? STORY_TONE : C.text, fontWeight: 700, fontFamily: font }}>
                {n}
              </button>
            ))}
          </div>
          {STORY_TEMPLATES.length > 1 && (
            <>
              <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("قالب", "Template")}</div>
              <div style={{ marginBottom: 12 }}>
                <StoryTemplatePicker value={template} onPick={setTemplate} />
              </div>
            </>
          )}
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("رنگ پس‌زمینه", "Background colour")}</div>
          <div style={{ marginBottom: 12 }}>
            <BgSwatches value={bg} onPick={setBg} />
          </div>
          <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6 }}>{L("یادداشت‌ها (اختیاری)", "Notes (optional)")}</div>
          <textarea
            dir="auto"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={L("مثلاً: روی عدد اصلی تمرکز کن، صفحهٔ دوم دربارهٔ مهلت باشه…", "e.g. focus on the main number, make page 2 about the deadline…")}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
          />
          <div style={{ fontSize: 11.5, color: C.text3, margin: "6px 0 12px", lineHeight: 1.7 }}>
            {L(
              `هر صفحه یک واقعیت از متن منبع + اسکرین‌شات واقعی از ${isLex ? "PDF اصلی لکس‌بیس" : "صفحهٔ منبع"} که جمله‌اش هایلایت شده. اسکرین‌شات فقط برای همین موضوع گرفته می‌شه.`,
              `Each page is one fact from the source text + a real screenshot of ${isLex ? "the original Lexbase PDF" : "the source page"} with its sentence highlighted. Screenshots are taken only for this topic.`
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="ui-btn ui-glow-orange" onClick={start} disabled={caps.story === false} style={{ ...btn(STORY_TONE, "#fff", "none"), flex: 1, opacity: caps.story === false ? 0.5 : 1 }}>
              {count === 1 ? L("ساخت استوری تک‌صفحه", "Make a one-page story") : L(`ساخت استوری ${count} صفحه‌ای`, `Make a ${count}-page story`)}
            </button>
            <button className="ui-btn" onClick={() => setForm(false)} style={btn("transparent", C.text2, `1px solid ${C.line}`)}>
              {L("انصراف", "Cancel")}
            </button>
          </div>
          {caps.story === false && <div style={{ fontSize: 11.5, color: C.reject, marginTop: 8 }}>{L("مرورگر Chromium روی سرور نصب نیست (و کلید HCTI هم نیست)؛ استوری کشیده نمی‌شود.", "No Chromium on the server (and no HCTI keys), so stories cannot be drawn.")}</div>}
        </div>
      )}

      {running && (
        <div dir={uiDir()} className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha(STORY_TONE, 0.07), border: `1px solid ${alpha(STORY_TONE, 0.3)}`, fontFamily: fa, fontSize: 13, marginBottom: 10 }}>
          <span className="ui-pulse">⏳</span>{" "}
          {stage === "writing" ? L("در حال نوشتن متن استوری…", "Writing the story text…") : stage === "screenshots" ? L("در حال گرفتن اسکرین‌شات از منبع اصلی…", "Taking screenshots of the original source…") : stage === "photos" ? L("در حال ساخت عکس‌ها با هوش مصنوعی…", "Making the photos with AI…") : L(`در حال طراحی صفحه‌ها… ${drawn} از ${pages.length}`, `Designing the pages… ${drawn} of ${pages.length}`)}
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>{L("می‌تونی از این صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.", "You can leave this page; the work carries on on the server.")}</div>
        </div>
      )}
      {failed && !running && <div style={{ fontSize: 12, color: C.reject, marginBottom: 10, fontFamily: font, direction: "ltr" }}>⚠️ {failed}</div>}

      {pages.length > 0 && (
        <div>
          <div dir={uiDir()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, fontFamily: fa }}>
            <b style={{ fontSize: 14.5 }}>📱 {L(`استوری · ${pages.length} صفحه`, `Story · ${pages.length} ${pages.length === 1 ? "page" : "pages"}`)}</b>
            {!running && (
              <button className="ui-btn" onClick={() => setForm(true)} style={{ background: "transparent", border: "none", color: C.text2, cursor: "pointer", fontSize: 12.5, fontFamily: fa }}>
                ↻ {L("از نو (بدون نسخهٔ قبلی)", "Start over (without the last version)")}
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {pages.map((pg) => (
              <div key={pg.num} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                {pg.image_url ? (
                  <button onClick={() => setPreview(pg.num)} aria-label={L("پیش‌نمایش صفحهٔ ", "Preview page ") + pg.num} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                    <img src={pg.image_url} alt={L("صفحهٔ استوری ", "Story page ") + pg.num} loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "9 / 16", objectFit: "cover", background: C.surfaceHi }} />
                  </button>
                ) : (
                  <div className={running ? "ui-skeleton" : ""} style={{ aspectRatio: "9 / 16", display: "grid", placeItems: "center", background: C.surfaceHi, color: C.text3, fontSize: 12, padding: 8, textAlign: "center", fontFamily: font }}>
                    {running ? "…" : "⚠️ " + (pg.error ? pg.error.slice(0, 80) : L("بدون تصویر", "no image"))}
                  </div>
                )}
                <div dir={uiDir()} style={{ padding: "6px 8px 8px", fontFamily: fa, fontSize: 11.5, lineHeight: 1.6, color: C.text2 }}>
                  {busyPage === pg.num ? (
                    <div className="ui-pulse" style={{ marginBottom: 6, fontSize: 11.5, color: C.orangeDeep }}>⏳ {L("در حال تغییر…", "Changing…")}</div>
                  ) : pg.image_url && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                      <button
                        className="ui-btn"
                        onClick={() => saveStoryImage(pg.image_url, `sugimoto-story-${pg.num}.png`)}
                        style={{ background: alpha(STORY_TONE, 0.1), color: STORY_TONE, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 8, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: fa }}
                      >
                        ⬇ {L("ذخیره", "Save")}
                      </button>
                      {!running && (
                        <button className="ui-btn" onClick={() => setEditing(pg.num)} title={L("فقط همین صفحه عوض بشه", "Change only this page")} aria-label={L("ویرایش صفحهٔ ", "Edit page ") + pg.num} style={{ background: alpha(STORY_TONE, 0.1), color: STORY_TONE, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 8, padding: "3px 8px", fontSize: 11.5, cursor: "pointer" }}>
                          ✏️
                        </button>
                      )}
                      {!running && pg.shot_url && (
                        <button className="ui-btn" onClick={() => setDesigning(designing === pg.num ? 0 : pg.num)} title={L("چیدن این صفحه با دست", "Lay this page out by hand")} aria-label={L("طراحی صفحهٔ ", "Design page ") + pg.num} style={{ background: designing === pg.num ? STORY_TONE : alpha(STORY_TONE, 0.1), color: designing === pg.num ? "#fff" : STORY_TONE, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 8, padding: "3px 8px", fontSize: 11.5, cursor: "pointer", fontFamily: fa }}>
                          {L("طراحی", "Design")}
                        </button>
                      )}
                    </div>
                  )}
                  {hasPhoto && !running && pg.image_url && (
                    <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                      <button className="ui-btn" onClick={() => { setPhotoFor(photoFor === pg.num ? 0 : pg.num); setPhotoNote(""); }} title={L("دوباره ساختن عکس این صفحه", "Make this page's photo again")} style={{ background: photoFor === pg.num ? STORY_TONE : alpha(STORY_TONE, 0.1), color: photoFor === pg.num ? "#fff" : STORY_TONE, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 8, padding: "3px 8px", fontSize: 11.5, cursor: "pointer", fontFamily: fa }}>
                        🖼 {L("عکس جدید", "New photo")}
                      </button>
                      <label title={L("استفاده از عکس خودت", "Use your own picture")} style={{ background: alpha(STORY_TONE, 0.1), color: STORY_TONE, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 8, padding: "3px 8px", fontSize: 11.5, cursor: "pointer", fontFamily: fa }}>
                        ⬆ {L("آپلود عکس", "Upload photo")}
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) uploadPhoto(pg.num, f); }} />
                      </label>
                    </div>
                  )}
                  {photoFor === pg.num && !running && (
                    <div style={{ marginBottom: 6 }}>
                      <textarea
                        dir="auto"
                        value={photoNote}
                        onChange={(e) => setPhotoNote(e.target.value)}
                        rows={2}
                        placeholder={L("چه عکسی؟ (اختیاری) مثلاً: فرودگاه ونکوور، بدون آدم", "What photo? (optional) e.g. Vancouver airport, no people")}
                        style={{ width: "100%", boxSizing: "border-box", borderRadius: 8, border: `1px solid ${C.line}`, padding: 6, fontFamily: fa, fontSize: 11.5, lineHeight: 1.6, resize: "vertical" }}
                      />
                      <button className="ui-btn" onClick={() => { onJob("story_photo", { num: pg.num, note: photoNote.trim() }); setPhotoFor(0); }} style={{ marginTop: 4, width: "100%", background: STORY_TONE, color: "#fff", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: fa }}>
                        {L("ساخت عکس جدید", "Make a new photo")}
                      </button>
                    </div>
                  )}
                  {pg.photo_error && hasPhoto && <div style={{ color: C.orangeDeep, marginBottom: 4 }}>⚠️ {L("عکس ساخته نشد؛ «عکس جدید» رو بزن.", "The photo was not made; press “New photo”.")}</div>}
                  <b dir="auto" style={{ color: C.text, display: "block" }}>{pg.headline}</b>
                  {pg.shot_error && <div style={{ color: C.orangeDeep, marginTop: 4 }}>⚠️ {L("اسکرین‌شات این جمله پیدا نشد؛ اسکرین‌شات صفحهٔ دیگه استفاده شد.", "No screenshot of this sentence was found; another page's screenshot was used.")}</div>}
                </div>
              </div>
            ))}
          </div>

          {designing > 0 && pages.some((x) => x.num === designing) && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 14, padding: 12 }}>
              <div dir={uiDir()} style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8, fontFamily: fa }}>{L(`طراحی دستی · صفحهٔ ${designing}`, `Design by hand · page ${designing}`)}</div>
              <StoryDesigner
                key={designing}
                page={pages.find((x) => x.num === designing)}
                bg={story.bg || "purple"}
                busy={running}
                onMake={(manual) => onJob("story_page", { num: designing, manual })}
                onReset={() => onJob("story_page", { num: designing, manual: null })}
                onSave={(url) => saveStoryImage(url, `sugimoto-story-${designing}.png`)}
              />
            </div>
          )}
          {!running && (
            <div dir={uiDir()} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontFamily: fa, fontSize: 12.5, color: C.text2, flexWrap: "wrap" }}>
              <span>{L("رنگ پس‌زمینه:", "Background colour:")}</span>
              <BgSwatches value={story.bg || "purple"} onPick={(k) => k !== (story.bg || "purple") && onJob("story_draw", { bg: k })} />
            </div>
          )}
          {!running && STORY_TEMPLATES.length > 1 && (
            <div dir={uiDir()} style={{ marginTop: 12, fontFamily: fa, fontSize: 12.5, color: C.text2 }}>
              <div style={{ marginBottom: 6 }}>{L("قالب (متن عوض نمی‌شه، فقط صفحه‌ها دوباره کشیده می‌شن):", "Template (the text stays, only the pages are drawn again):")}</div>
              <StoryTemplatePicker value={story.template || "simple"} onPick={(k) => k !== (story.template || "simple") && onJob("story_draw", { template: k })} />
            </div>
          )}
          {uploadErr && <div style={{ fontSize: 12, color: C.reject, marginTop: 8, direction: "ltr" }}>⚠️ {uploadErr}</div>}
          {!running && missing > 0 && (
            <button className="ui-btn" onClick={() => onJob("story_draw", {})} style={{ ...btn(alpha(C.orange, 0.1), C.text, `1px solid ${alpha(C.orange, 0.4)}`), width: "100%", marginTop: 10 }}>
              {L(`طراحی ${missing} صفحهٔ باقی‌مانده`, `Design the ${missing} remaining pages`)}
            </button>
          )}

          {!running && (
            <div dir={uiDir()} style={{ marginTop: 14, background: C.surface, border: `1px solid ${alpha(STORY_TONE, 0.35)}`, borderRadius: 14, padding: 12, fontFamily: fa }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>✏️ {L("یادداشت برای نسخهٔ بعد", "Note for the next version")}</div>
              <textarea
                dir="auto"
                value={revNotes}
                onChange={(e) => setRevNotes(e.target.value)}
                rows={3}
                placeholder={L("چه چیزی عوض بشه؟ مثلاً: تیتر کوتاه‌تر، عدد رو در تیتر بیار…", "What should change? e.g. a shorter headline, put the number in the headline…")}
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
              />
              <button
                className="ui-btn ui-glow-orange"
                disabled={!revNotes.trim()}
                onClick={() => {
                  onJob("story", { count: pages.length, notes: revNotes.trim(), revise: true, bg: story.bg || "purple" });
                  if (learnRev) teach({ topic, scope: "story", note: revNotes.trim(), context: pages.map((x) => `${x.headline || ""}\n${x.body || ""}`).join("\n---\n") });
                }}
                style={{ ...btn(STORY_TONE, "#fff", "none"), width: "100%", marginTop: 8, opacity: revNotes.trim() ? 1 : 0.5, cursor: revNotes.trim() ? "pointer" : "default" }}
              >
                ↻ {L("ساخت دوباره با این یادداشت", "Make again with this note")}
              </button>
              <LearnToggle on={learnRev} setOn={setLearnRev} />
            </div>
          )}
          {preview > 0 && <SlidePreview slides={pages.filter((x) => x.image_url)} start={preview} onClose={() => setPreview(0)} />}
          {editing > 0 && pages.some((x) => x.num === editing) && (
            <StoryPageSheet
              page={pages.find((x) => x.num === editing)}
              total={pages.length}
              onClose={() => setEditing(0)}
              onSubmit={(edit, learn) => {
                onJob("story_page", { num: editing, ...edit });
                if (learn && edit.instruction) teach({ topic, scope: "story", note: edit.instruction, context: `${edit.headline}\n${edit.body}` });
                setEditing(0);
              }}
            />
          )}

          {story.caption && (
            <div style={{ marginTop: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text3, letterSpacing: 0.5 }}>{L("کپشن", "CAPTION")}</span>
                <button
                  className="ui-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(story.caption);
                    setCopiedCap(true);
                    setTimeout(() => setCopiedCap(false), 1400);
                  }}
                  style={{ background: copiedCap ? C.success : alpha(C.orange, 0.14), color: copiedCap ? "#fff" : C.orange, border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                >
                  {copiedCap ? L("کپی شد ✓", "Copied ✓") : L("کپی", "Copy")}
                </button>
              </div>
              <div dir={lang === "en" ? "ltr" : "rtl"} style={{ fontFamily: fa, fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{story.caption}</div>
            </div>
          )}

          {drawn > 0 && !running && (
            <CalendarButtons topic={topic} made={lang === "en" ? "story_en" : "story"} version={pages.map((x) => x.image_url || "").join("|")} C={C} FONT={font} />
          )}
        </div>
      )}
    </Section>
  );
}

// The Telegram news post, edited here rather than in Telegram: the text
// (with **bold**), the related sugimotovisa.com page, and one 4:5 picture
// that can be drawn again or changed with a note. Send puts it on the public
// channel @sugimotovisa; nothing is sent until that button is pressed.
const TG_TONE = "#0088cc";
function TelegramPanel({ topic, post, job, caps = {}, onJob, lang = "fa" }) {
  const [text, setText] = useState((post && post.text) || "");
  const [dirty, setDirty] = useState(false);
  const [link, setLink] = useState((post && post.link) || null);
  const [notes, setNotes] = useState("");
  const [learnRev, setLearnRev] = useState(false);
  const [editPic, setEditPic] = useState(false);
  const [preview, setPreview] = useState(false);
  const running = !!job && job.status === "running";
  const failed = !!job && job.status === "error" ? job.error : "";
  const kind = (job && job.kind) || "";
  const fa = "'Vazirmatn', sans-serif";
  const font = "'Geist', 'Vazirmatn', sans-serif";
  const image = (post && post.image_url) || "";
  // An English post goes only to the English channel (TELEGRAM_PUBLIC_CHANNEL_ID_EN).
  const en = lang === "en";
  const publicOk = en ? !!caps.telegram?.english : caps.telegram?.public !== false;
  const where = en ? L("کانال انگلیسی", "the English channel") : "@sugimotovisa";

  // What the server has, unless someone is typing over it.
  useEffect(() => {
    if (!dirty && post) {
      setText(post.text || "");
      setLink(post.link || null);
    }
  }, [post && post.text, post && post.link && post.link.url]);

  const btn = (bg, color, border) => ({ background: bg, color, border, borderRadius: 12, padding: "11px 12px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: fa });
  const small = { background: alpha(TG_TONE, 0.1), color: TG_TONE, border: `1px solid ${alpha(TG_TONE, 0.35)}`, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: fa };

  const save = () => {
    setDirty(false);
    onJob("telegram_save", { text, link });
  };
  const send = () => {
    if (!text.trim()) return;
    const again = post && post.sent && post.sent_to === "public" ? L("\n\nقبلاً در " + when(post.sent) + " ارسال شده.", "\n\nIt was already sent on " + when(post.sent) + ".") : "";
    if (!window.confirm((image ? L(`این پست با تصویرش همین الان به ${where} ارسال بشه؟`, `Send this post with its picture to ${where} now?`) : L(`این پست بدون تصویر همین الان به ${where} ارسال بشه؟`, `Send this post to ${where} now, without a picture?`)) + again)) return;
    setDirty(false);
    onJob("telegram_send", { text, link });
  };
  const rewrite = () => {
    if (dirty && !window.confirm(L("بازنویسی جای ویرایش‌هات رو می‌گیره. ادامه بدیم؟", "Your edits will be replaced by the rewrite. Continue?"))) return;
    setDirty(false);
    onJob("telegram_write", { notes: notes.trim(), revise: !!(post && post.text) });
    if (learnRev) teach({ topic, scope: "telegram", note: notes.trim(), context: text });
    setNotes("");
  };
  const fullLen = text.length + (link ? (link.title || "").length + 6 : 0);
  const label = { telegram_write: L("در حال نوشتن پست…", "Writing the post…"), telegram_image: L("در حال طراحی تصویر…", "Designing the picture…"), telegram_send: L(`در حال ارسال به ${where}…`, `Sending to ${where}…`), telegram_save: L("در حال ذخیره…", "Saving…") }[kind] || "…";

  return (
    <Section title={L("پست تلگرام", "Telegram post") + (en ? L(" · انگلیسی", " · English") : "")}>
      {running && (
        <div dir={uiDir()} className="ui-progress" style={{ padding: "10px 12px", borderRadius: 12, background: alpha(TG_TONE, 0.07), border: `1px solid ${alpha(TG_TONE, 0.3)}`, fontFamily: fa, fontSize: 13, marginBottom: 10 }}>
          <span className="ui-pulse">⏳</span> {label}
          <div style={{ fontSize: 11.5, color: C.text3, marginTop: 2 }}>{L("می‌تونی از این صفحه بری؛ کار روی سرور ادامه پیدا می‌کنه.", "You can leave this page; the work carries on on the server.")}</div>
        </div>
      )}
      {failed && !running && <div style={{ fontSize: 12, color: C.reject, marginBottom: 10, fontFamily: font, direction: "ltr" }}>⚠️ {failed}</div>}
      {post && post.sent && post.sent_to === "public" && (
        <div dir={uiDir()} style={{ fontSize: 12.5, color: C.success, marginBottom: 10, fontFamily: fa }}>✓ {L(`ارسال شد به ${where}`, `Sent to ${where}`)} · {when(post.sent)}</div>
      )}

      {!text && !running && !(post && post.text) ? (
        <div style={{ textAlign: "center" }}>
          <button className="ui-btn ui-glow-orange" onClick={() => onJob("telegram_write", {})} style={{ ...btn(TG_TONE, "#fff", "none"), padding: "12px 20px" }}>{en ? L("✍️ نوشتن پست تلگرام انگلیسی", "✍️ Write the English Telegram post") : L("✍️ نوشتن پست تلگرام", "✍️ Write the Telegram post")}</button>
        </div>
      ) : (
        <div dir={uiDir()} style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: fa }}>
          {/* the picture */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 170, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line}`, background: C.surfaceHi }}>
              {image ? (
                <button onClick={() => setPreview(true)} aria-label={L("پیش‌نمایش تصویر", "Preview the picture")} style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                  <img src={image} alt={L("تصویر پست تلگرام", "Telegram post picture")} style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover" }} />
                </button>
              ) : (
                <div className={running && kind === "telegram_image" ? "ui-skeleton" : ""} style={{ aspectRatio: "4 / 5", display: "grid", placeItems: "center", color: C.text3, fontSize: 12, padding: 10, textAlign: "center" }}>
                  {running && kind === "telegram_image" ? "…" : L("بدون تصویر", "No picture")}
                </div>
              )}
            </div>
            <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.7 }}>{L("یک تصویر ۴:۵ با تیتر پست، در سبک کاروسل‌های برند و با لوگو.", "One 4:5 picture with the post's headline, in the brand's carousel style, with the logo.")}</div>
              {!running && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {image ? (
                    <>
                      <button className="ui-btn" onClick={() => setEditPic(true)} style={small} title={L("فقط همین تصویر عوض بشه", "Change only this picture")}>✏️ {L("ویرایش تصویر", "Edit picture")}</button>
                      <button className="ui-btn" onClick={() => onJob("telegram_image", { text })} style={small} title={L("کشیدن یک تصویر تازه", "Draw a new picture")}>↻ {L("طراحی دوباره", "Design again")}</button>
                      <a className="ui-btn" href={"/api/carousel/download?url=" + encodeURIComponent(image) + "&name=" + encodeURIComponent("sugimoto-telegram.jpg")} style={{ ...small, textDecoration: "none" }}>⬇ {L("دانلود", "Download")}</a>
                    </>
                  ) : (
                    <button className="ui-btn" onClick={() => onJob("telegram_image", { text })} disabled={!caps.carousel} style={{ ...small, opacity: caps.carousel ? 1 : 0.5 }}>🎨 {L("ساخت تصویر", "Make picture")}</button>
                  )}
                </div>
              )}
              {post && post.kept === "memory" && <div style={{ fontSize: 11, color: C.orangeDeep }}>⚠️ {L("این تصویر در وردپرس ذخیره نشد و فقط تا ری‌استارت بعدی سرور می‌مونه.", "This picture was not saved in WordPress and lasts only until the server's next restart.")}</div>}
            </div>
          </div>

          {/* the text */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 13.5 }}>{L("متن پست", "Post text")}</b>
              <span style={{ fontSize: 11, color: fullLen > 1000 ? C.text3 : C.success, direction: uiDir() }}>
                {L(`${fullLen} حرف`, `${fullLen} chars`)} · {fullLen > 1000 ? L("تصویر، بعد متن زیرش", "picture, then the text under it") : L("یک پیام همراه تصویر", "one message with the picture")}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
              }}
              rows={12}
              disabled={running && kind === "telegram_write"}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${dirty ? alpha(TG_TONE, 0.6) : C.line}`, padding: 12, fontFamily: en ? font : fa, fontSize: 13.5, lineHeight: 1.9, resize: "vertical", direction: en ? "ltr" : "rtl", unicodeBidi: "plaintext" }}
            />
            <div style={{ fontSize: 11.5, color: C.text3, marginTop: 4 }}>{L("برای متن پررنگ دو ستاره بذار: **متن**", "For bold text use two stars: **text**")}</div>
          </div>

          {link && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "8px 10px", borderRadius: 10, background: C.surfaceHi, border: `1px solid ${C.line}` }}>
              <span>📎</span>
              <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.title || link.url}</a>
              <button className="ui-btn" onClick={() => { setLink(null); setDirty(true); }} title={L("حذف لینک", "Remove the link")} style={{ background: "transparent", border: "none", color: C.text3, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="ui-btn" disabled={!dirty || running} onClick={save} style={{ ...btn("transparent", C.text, `1px solid ${C.line}`), flex: "0 0 auto", opacity: dirty && !running ? 1 : 0.5 }}>
              💾 {L("ذخیره", "Save")}
            </button>
            <button className="ui-btn ui-glow-orange" disabled={running || !text.trim() || !publicOk} onClick={send} style={{ ...btn(TG_TONE, "#fff", "none"), flex: 1, minWidth: 180, opacity: running || !text.trim() || !publicOk ? 0.5 : 1 }}>
              📢 {L(`ارسال به ${where}`, `Send to ${where}`)}
            </button>
          </div>
          {/* The send's outcome right under the button, where the eye is. */}
          {kind === "telegram_send" && running && <div className="ui-pulse" style={{ fontSize: 12.5, color: C.text2, textAlign: "center" }}>⏳ {L(`در حال ارسال به ${where}…`, `Sending to ${where}…`)}</div>}
          {kind === "telegram_send" && failed && !running && <div style={{ fontSize: 12.5, color: C.reject, direction: "ltr", textAlign: "center" }}>⚠️ {L("ارسال نشد: ", "Not sent: ")}{failed}</div>}
          {kind === "telegram_send" && job.status === "done" && <div style={{ fontSize: 12.5, color: C.success, textAlign: "center" }}>✓ {L(`ارسال شد به ${where}`, `Sent to ${where}`)}</div>}
          {!publicOk && <div style={{ fontSize: 11.5, color: C.reject, direction: uiDir() }}>{en ? L("کانال تلگرام انگلیسی تنظیم نشده (TELEGRAM_PUBLIC_CHANNEL_ID_EN)، یا حسابت دسترسی انتشار نداره. پست رو هنوز می‌شه نوشت، ذخیره کرد و کپی کرد.", "No English Telegram channel is set (TELEGRAM_PUBLIC_CHANNEL_ID_EN), or your account has no publishing access. The post can still be written, saved and copied.") : L("کانال عمومی تنظیم نشده (TELEGRAM_PUBLIC_CHANNEL_ID)، یا حسابت دسترسی انتشار نداره.", "The public channel is not configured (TELEGRAM_PUBLIC_CHANNEL_ID), or your account has no publishing access.")}</div>}

          <div style={{ background: C.surface, border: `1px solid ${alpha(TG_TONE, 0.3)}`, borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>✏️ {L("بازنویسی با یادداشت", "Rewrite with a note")}</div>
            <textarea
              dir="auto"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={L("مثلاً: کوتاه‌تر، تاریخ رو در تیتر بیار، پاراگراف آخر رو حذف کن…", "e.g. shorter, put the date in the headline, remove the last paragraph…")}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.7, resize: "vertical" }}
            />
            <button className="ui-btn" disabled={running || !notes.trim()} onClick={rewrite} style={{ ...btn(alpha(TG_TONE, 0.1), C.text, `1px solid ${alpha(TG_TONE, 0.4)}`), width: "100%", marginTop: 8, opacity: running || !notes.trim() ? 0.5 : 1 }}>
              ↻ {L("بازنویسی پست", "Rewrite the post")}
            </button>
            <LearnToggle on={learnRev} setOn={setLearnRev} />
          </div>
        </div>
      )}

      {preview && image && <SlidePreview slides={[{ num: 1, image_url: image }]} start={1} onClose={() => setPreview(false)} />}
      {editPic && image && (
        <EditPictureSheet
          title={L("تصویر تلگرام", "Telegram picture")}
          item={{ image_url: image, edits: (post && post.image_edits) || [] }}
          ratio="4 / 5"
          tone={TG_TONE}
          onClose={() => setEditPic(false)}
          onSubmit={(edit, learn) => {
            onJob("telegram_image", { text, edit });
            if (learn) teach({ topic, scope: "design", note: edit, context: text });
            setEditPic(false);
          }}
        />
      )}
    </Section>
  );
}

// A sheet over the page for changing ONE picture: the picture, what to
// change, and the changes asked for before. Only this picture is redone,
// starting from itself.
function Sheet({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(10,14,20,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="ui-fade" style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: C.surface, borderRadius: "20px 20px 0 0", padding: "16px 16px 22px", boxSizing: "border-box", boxShadow: "0 -8px 30px rgba(0,0,0,0.25)" }}>
        {children}
      </div>
    </div>
  );
}

// ---- Teaching the app (Hamed, and whoever he ticks "Teach the app" for) --------------------
// "Learn from this note": the note goes to a server job that decides whether it holds a
// rule for future content of that kind (lib/learning.js). The click never waits for it; the
// outcome appears as a notice at the bottom of the page.
const teachFlag = { on: false, subs: new Set() };
function setTeachFlag(on) {
  teachFlag.on = !!on;
  for (const f of teachFlag.subs) f(teachFlag.on);
}
function useCanTeach() {
  const [on, setOn] = useState(teachFlag.on);
  useEffect(() => {
    teachFlag.subs.add(setOn);
    setOn(teachFlag.on);
    return () => teachFlag.subs.delete(setOn);
  }, []);
  return on;
}
function teach({ topic, scope, note, context = "" }) {
  const say = (detail) => window.dispatchEvent(new CustomEvent("sv-learn", { detail }));
  say({ state: "working" });
  (async () => {
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "learn", topic, scope, note, context }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.job) throw new Error(d.error || L("شروع نشد", "could not start"));
      for (let i = 0; i < 60; i++) {
        await new Promise((ok) => setTimeout(ok, 2500));
        const q = await fetch(`/api/jobs?ids=${d.job.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        const j = q && q.jobs && q.jobs[0];
        if (!j) continue;
        if (j.status === "done") return say({ state: "done", ...(j.result || {}) });
        if (j.status === "error") throw new Error(j.error || L("نشد", "failed"));
      }
      throw new Error(L("هنوز جوابی نیومده؛ شاید هنوز تموم بشه", "no answer yet; it may still finish"));
    } catch (e) {
      say({ state: "error", error: String(e.message || e) });
    }
  })();
}
function LearnToggle({ on, setOn }) {
  if (!useCanTeach()) return null;
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, fontSize: 12.5, color: C.text2, lineHeight: 1.7, cursor: "pointer" }}>
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} style={{ marginTop: 4 }} />
      <b style={{ color: C.text }}>🧠 {L("از این یادداشت یاد بگیر", "Learn from this note")}</b>
    </label>
  );
}
function LearnNotice() {
  const [n, setN] = useState(null);
  useEffect(() => {
    const on = (e) => setN(e.detail);
    window.addEventListener("sv-learn", on);
    return () => window.removeEventListener("sv-learn", on);
  }, []);
  useEffect(() => {
    if (!n || n.state === "working") return;
    const t = setTimeout(() => setN(null), 12000);
    return () => clearTimeout(t);
  }, [n]);
  if (!n) return null;
  const text =
    n.state === "working" ? L("🧠 دارم یادداشت رو بررسی می‌کنم…", "🧠 Checking the note…")
    : n.state === "error" ? L(`🧠 یاد گرفتن انجام نشد: ${n.error}`, `🧠 Learning did not happen: ${n.error}`)
    : n.learned ? L("🧠 یاد گرفتم: ", "🧠 Learned: ") + ((n.lesson && (isFa() ? n.lesson.rule_fa || n.lesson.rule_en : n.lesson.rule_en || n.lesson.rule_fa)) || "")
    : L(`🧠 قانون تازه‌ای ثبت نشد: ${n.why || ""}`, `🧠 No new rule was saved: ${n.why || ""}`);
  return (
    <div dir={uiDir()} role="status" onClick={() => setN(null)} style={{ position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 90, maxWidth: 560, margin: "0 auto", background: "#1f2a30", color: "#fff", borderRadius: 14, padding: "12px 14px", fontSize: 13, lineHeight: 1.8, fontFamily: "'Vazirmatn', sans-serif", boxShadow: "0 10px 30px rgba(0,0,0,.25)", cursor: "pointer" }}>
      {text}
    </div>
  );
}

function EditPictureSheet({ title, item, text = "", ratio = "4 / 5", tone = C.orange, onClose, onSubmit }) {
  const [ask, setAsk] = useState("");
  const [learn, setLearn] = useState(false);
  const fa = "'Vazirmatn', sans-serif";
  const edits = (item && item.edits) || [];
  return (
    <Sheet onClose={onClose}>
      <div dir={uiDir()} style={{ fontFamily: fa }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>✏️ {L("ویرایش همین تصویر", "Edit this picture")} <span style={{ fontWeight: 500, color: C.text3, fontSize: 12.5, direction: "ltr", unicodeBidi: "isolate" }}>{title}</span></b>
          <button className="ui-btn" onClick={onClose} aria-label={L("بستن", "Close")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: C.text2 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <img src={item.image_url} alt="" style={{ width: 150, aspectRatio: ratio, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.line}`, flexShrink: 0 }} />
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: C.text2, marginBottom: 6, lineHeight: 1.7 }}>{L("چه چیزی در این تصویر عوض بشه؟ فقط همین تصویر از روی خودش تغییر می‌کنه؛ بقیه دست نمی‌خورن.", "What should change in this picture? Only this picture changes, starting from itself; the others are not touched.")}</div>
            <textarea
              autoFocus
              dir="auto"
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              rows={5}
              placeholder={L("مثلاً: عکس سمت چپ رو با یک پاسپورت و بلیط هواپیما عوض کن، تیتر بزرگ‌تر بشه، رنگ پس‌زمینه روشن‌تر…", "e.g. replace the photo on the left with a passport and a plane ticket, a bigger headline, a lighter background…")}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.8, resize: "vertical" }}
            />
            {edits.length > 0 && (
              <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6, lineHeight: 1.7 }}>
                {L("تغییرهای قبلی: ", "Earlier changes: ")}{edits.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
          </div>
        </div>
        <LearnToggle on={learn} setOn={setLearn} />
        {text && (
          <details style={{ marginTop: 10, fontSize: 12, color: C.text2 }}>
            <summary style={{ cursor: "pointer" }}>{L("متن روی تصویر", "Text on the picture")}</summary>
            <div dir="auto" style={{ whiteSpace: "pre-line", lineHeight: 1.8, marginTop: 6 }}>{text}</div>
          </details>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="ui-btn ui-glow-orange" disabled={!ask.trim()} onClick={() => onSubmit(ask.trim(), learn)} style={{ flex: 1, background: tone, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontWeight: 700, fontSize: 14, cursor: ask.trim() ? "pointer" : "default", opacity: ask.trim() ? 1 : 0.5, fontFamily: fa }}>
            {L("اعمال تغییر روی همین تصویر", "Apply the change to this picture")}
          </button>
          <button className="ui-btn" onClick={onClose} style={{ background: "transparent", color: C.text2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px", fontWeight: 600, cursor: "pointer", fontFamily: fa }}>{L("انصراف", "Cancel")}</button>
        </div>
        <div style={{ fontSize: 11, color: C.text3, marginTop: 8 }}>{L("حدود ۵ سنت، کمتر از یک دقیقه.", "About 5 cents, under a minute.")}</div>
      </div>
    </Sheet>
  );
}

// A story page's pencil: its screenshot is a photograph of the source and is
// never redrawn, so what changes is the page's text — typed here, or
// rewritten from the source text by an instruction — and that page alone is
// drawn again.
function StoryPageSheet({ page, total, onClose, onSubmit }) {
  const [headline, setHeadline] = useState(page.headline || "");
  const [body, setBody] = useState(page.body || "");
  const [ask, setAsk] = useState("");
  const [learn, setLearn] = useState(false);
  const fa = "'Vazirmatn', sans-serif";
  const typed = headline.trim() !== (page.headline || "").trim() || body.trim() !== (page.body || "").trim();
  const ready = !!headline.trim() && (typed || !!ask.trim());
  const field = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: 10, fontFamily: fa, fontSize: 13, lineHeight: 1.8, resize: "vertical" };
  return (
    <Sheet onClose={onClose}>
      <div dir={uiDir()} style={{ fontFamily: fa }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <b style={{ fontSize: 15 }}>✏️ {L(`ویرایش صفحهٔ ${page.num} از ${total}`, `Edit page ${page.num} of ${total}`)}</b>
          <button className="ui-btn" onClick={onClose} aria-label={L("بستن", "Close")} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: C.text2 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <img src={page.image_url} alt="" style={{ width: 120, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 10, border: `1px solid ${C.line}`, flexShrink: 0 }} />
          <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12.5, color: C.text2 }}>
              {L("تیتر", "Headline")}
              <textarea dir="auto" value={headline} onChange={(e) => setHeadline(e.target.value)} rows={2} style={{ ...field, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: 12.5, color: C.text2 }}>
              {L("متن زیر اسکرین‌شات", "Text under the screenshot")}
              <textarea dir="auto" value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ ...field, marginTop: 4 }} />
            </label>
          </div>
        </div>
        <label style={{ display: "block", fontSize: 12.5, color: C.text2, marginTop: 10 }}>
          {L("یا بنویس چه چیزی عوض بشه (از روی متن منبع بازنویسی می‌شه)", "Or write what should change (rewritten from the source text)")}
          <textarea dir="auto" value={ask} onChange={(e) => setAsk(e.target.value)} rows={2} placeholder={L("مثلاً: عدد اصلی رو بیار توی تیتر، متن کوتاه‌تر…", "e.g. put the main number in the headline, shorter text…")} style={{ ...field, marginTop: 4 }} />
        </label>
        {ask.trim() && <LearnToggle on={learn} setOn={setLearn} />}
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 6, lineHeight: 1.7 }}>{L("اسکرین‌شات همون عکس واقعی منبع می‌مونه و جملهٔ هایلایت‌شده عوض نمی‌شه؛ فقط متن همین صفحه تغییر می‌کنه و همین صفحه دوباره ساخته می‌شه.", "The screenshot stays the real photo of the source and the highlighted sentence does not change; only this page's text changes and only this page is made again.")}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            className="ui-btn ui-glow-orange"
            disabled={!ready}
            onClick={() => onSubmit({ headline: headline.trim(), body: body.trim(), ...(ask.trim() ? { instruction: ask.trim() } : {}) }, learn && !!ask.trim())}
            style={{ flex: 1, background: STORY_TONE, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontWeight: 700, fontSize: 14, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.5, fontFamily: fa }}
          >
            {L("اعمال روی همین صفحه", "Apply to this page")}
          </button>
          <button className="ui-btn" onClick={onClose} style={{ background: "transparent", color: C.text2, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px", fontWeight: 600, cursor: "pointer", fontFamily: fa }}>{L("انصراف", "Cancel")}</button>
        </div>
      </div>
    </Sheet>
  );
}

function SlidePreview({ slides, start, onClose }) {
  const [i, setI] = useState(Math.max(0, slides.findIndex((s) => s.num === start)));
  const touchX = useRef(null);
  const go = (d) => setI((x) => (x + d + slides.length) % slides.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const s = slides[i];
  if (!s) return null;
  const arrow = (d, label) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        go(d);
      }}
      aria-label={label}
      style={{ position: "absolute", top: "50%", [d > 0 ? "right" : "left"]: 10, transform: "translateY(-50%)", width: 44, height: 44, borderRadius: 99, border: "none", background: "rgba(255,255,255,0.9)", fontSize: 20, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,0.25)" }}
    >
      {d > 0 ? "›" : "‹"}
    </button>
  );
  return (
    <div
      role="dialog"
      aria-label={L("پیش‌نمایش اسلاید", "Slide preview")}
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,14,20,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}
    >
      <div style={{ position: "relative", maxWidth: "min(92vw, 640px)" }} onClick={(e) => e.stopPropagation()}>
        <img src={s.image_url} alt={L("اسلاید ", "Slide ") + s.num} style={{ display: "block", maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }} />
        {slides.length > 1 && arrow(-1, L("اسلاید قبلی", "Previous slide"))}
        {slides.length > 1 && arrow(1, L("اسلاید بعدی", "Next slide"))}
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, color: "#fff", fontSize: 13, fontFamily: "'Geist', sans-serif" }}>
        <span>{i + 1} / {slides.length}</span>
        <a href={s.image_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", opacity: 0.85 }}>{L("نمایش در اندازهٔ کامل", "Open full size")} ↗</a>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 99, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>{L("بستن", "Close")} ✕</button>
      </div>
    </div>
  );
}

// ---- English video ------------------------------------------------------
// The video is made by the team's n8n workflow (HeyGen digital twin). The
// page collects what the workflow needs (length, notes, the final script, a
// benchmark video and the format), starts a server job that hands it over,
// and then shows what the workflow reports back.

const VIDEO_LENGTHS = [[30, ["۳۰ ثانیه", "30 sec"]], [45, ["۴۵ ثانیه", "45 sec"]], [60, ["۱ دقیقه", "1 min"]], [90, ["۱ دقیقه و ۳۰", "1 min 30"]], [120, ["۲ دقیقه", "2 min"]], [150, ["۲ دقیقه و ۳۰", "2 min 30"]], [180, ["۳ دقیقه", "3 min"]]];
// Spoken English at the presenter's pace (the same rate the server uses).
const WORDS_PER_SEC = 2.5;

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : L(`${s} ثانیه`, `${s}s`);
}

function wordCount(t) {
  return (String(t || "").trim().match(/\S+/g) || []).length;
}

// The team's benchmark videos, from the shared Drive folder: a thumbnail of
// each, which format its shape suits, tap to use it (and its format).
function BenchmarkPicker({ value, ratio, onPick, onGone = () => {} }) {
  const [state, setState] = useState({ loading: true, videos: [], folder: "", error: "" });
  // Only the folder's videos are samples: one remembered from an earlier video that is no longer
  // in the folder (or a link pasted before the folder was the only source) is let go.
  useEffect(() => {
    if (value && !state.loading && !state.error && !state.videos.some((v) => v.url === value)) onGone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, value]);
  const load = (fresh) => {
    setState((x) => ({ ...x, loading: true }));
    fetch("/api/video/benchmarks" + (fresh ? "?fresh=1" : ""), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setState({ loading: false, videos: j.videos || [], folder: j.folder || "", error: j.error || "" }))
      .catch((e) => setState((x) => ({ ...x, loading: false, error: String(e.message || e) })));
  };
  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Videos that suit the chosen format first.
  const videos = state.videos.slice().sort((a, b) => (b.ratio === ratio) - (a.ratio === ratio));
  const tag = (v) => (v.orientation === "vertical" ? L("▯ عمودی", "▯ Vertical") : v.orientation === "horizontal" ? L("▭ افقی", "▭ Horizontal") : v.orientation === "square" ? L("□ مربع", "□ Square") : "");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: C.text3, marginBottom: 8 }}>
        <span>{L("از پوشهٔ Benchmarks", "From the Benchmarks folder")}</span>
        {state.folder && <a href={state.folder} target="_blank" rel="noopener noreferrer" style={{ color: C.teal, textDecoration: "none", fontWeight: 600 }}>{L("باز کردن پوشه", "Open folder")} ↗</a>}
        <button className="ui-btn" onClick={() => load(true)} style={{ background: "transparent", border: "none", color: C.text2, cursor: "pointer", fontSize: 11.5, padding: 0 }}>
          {state.loading ? L("در حال بارگذاری…", "Loading…") : L("↻ تازه‌سازی", "↻ Refresh")}
        </button>
      </div>
      {state.error && <div style={{ fontSize: 11.5, color: C.reject, marginBottom: 6 }}>{state.error}</div>}
      {!state.loading && !state.videos.length && !state.error && <div style={{ fontSize: 11.5, color: C.text3 }}>{L("هنوز ویدیویی در پوشه نیست.", "No videos in the folder yet.")}</div>}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {videos.map((v) => {
          const on = value === v.url;
          const fits = !ratio || !v.ratio || v.ratio === ratio;
          return (
            <button
              key={v.id}
              className="ui-btn"
              onClick={() => onPick(v)}
              title={v.title}
              style={{ flex: "0 0 auto", width: v.orientation === "horizontal" ? 180 : 104, padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", textAlign: "left", background: C.surface, border: on ? `2px solid ${C.orange}` : `1px solid ${C.line}`, opacity: fits || on ? 1 : 0.55 }}
            >
              <div style={{ position: "relative", aspectRatio: v.orientation === "horizontal" ? "16 / 9" : v.orientation === "square" ? "1 / 1" : "9 / 16", background: "#111" }}>
                <img src={v.thumb} alt="" loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
                <span style={{ position: "absolute", left: 6, bottom: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.6)", borderRadius: 99, padding: "2px 7px" }}>{tag(v)}</span>
                {on && <span style={{ position: "absolute", right: 6, top: 6, fontSize: 11, fontWeight: 800, color: "#fff", background: C.orange, borderRadius: 99, padding: "1px 7px" }}>✓</span>}
              </div>
              <div style={{ padding: "5px 7px 7px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</div>
                {v.fits && <div style={{ fontSize: 10, color: C.text3 }}>{v.fits}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LINK_KINDS = { google_drive: "Google Drive", heygen: "HeyGen", youtube: "YouTube", instagram: "Instagram", other: ["لینک ویدیو", "Video link"] };
function linkKind(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return "";
  if (/drive\.google\.com|docs\.google\.com/.test(u)) return "google_drive";
  if (/heygen\.com/.test(u)) return "heygen";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/instagram\.com/.test(u)) return "instagram";
  return "other";
}

// The editor's starting point: the English script as it is now, and the
// options of the last request for this topic, if there was one.
function videoDraftFrom(script, last) {
  const preset = last && VIDEO_LENGTHS.some(([s]) => s === last.duration_sec);
  return {
    length: last ? (preset ? last.duration_sec : "custom") : 60,
    customMin: last && !preset ? String(Math.floor(last.duration_sec / 60)) : "1",
    customSec: last && !preset ? String(last.duration_sec % 60) : "0",
    script: script || "",
    notes: (last && last.notes) || "",
    benchmark: (last && last.benchmark && last.benchmark.url) || "",
    ratio: (last && last.format && last.format.aspect_ratio) || "9:16",
    captions: last && last.format ? last.format.captions !== false : true,
    voice: (last && last.voice) || "primary",
    look: (last && isLook(last.look_id) && last.look_id) || DEFAULT_LOOK,
  };
}

function VideoComposer({ topic, enabled, initial, savedScript, draftJob, onDraft, onClose, onFit, onSubmit }) {
  const [d, setD] = useState(initial);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const [change, setChange] = useState("");
  useEffect(() => {
    onDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  // A finished "fit to length" rewrite lands in the editor once. Anything that
  // finished before the editor opened is not applied again.
  const appliedRef = useRef(draftJob ? draftJob.startedAt : 0);
  useEffect(() => {
    if (!draftJob || draftJob.status !== "done" || !draftJob.result || !draftJob.result.en) return;
    if (appliedRef.current === draftJob.startedAt) return;
    appliedRef.current = draftJob.startedAt;
    set({ script: draftJob.result.en });
    setChange("");
  }, [draftJob]);
  const fitting = !!draftJob && draftJob.status === "running" && appliedRef.current !== draftJob.startedAt;
  const fitError = draftJob && draftJob.status === "error" && appliedRef.current !== draftJob.startedAt ? draftJob.error : "";

  // Esc closes; the page behind does not scroll.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seconds = d.length === "custom" ? (Number(d.customMin) || 0) * 60 + (Number(d.customSec) || 0) : d.length;
  const words = wordCount(d.script);
  const spoken = words / WORDS_PER_SEC;
  const targetWords = Math.round(seconds * WORDS_PER_SEC);
  const off = seconds ? (spoken - seconds) / seconds : 0;
  const fits = Math.abs(off) <= 0.15;
  const persian = faShare(d.script) > 0.2;
  const bench = d.benchmark.trim();
  const benchErr = bench && !/^https?:\/\/\S+$/i.test(bench) ? L("لینک کامل رو بذار، با https:// شروع بشه", "Paste the full link, starting with https://") : "";
  const kind = linkKind(bench);
  const lenErr = seconds < 10 ? L("حداقل ۱۰ ثانیه", "At least 10 seconds") : seconds > 600 ? L("حداکثر ۱۰ دقیقه", "At most 10 minutes") : "";

  const blocker = !enabled
    ? L("ورک‌فلوی ویدیو هنوز وصل نیست (VIDEO_WORKFLOW_URL روی Render).", "The video workflow is not connected yet (VIDEO_WORKFLOW_URL on Render).")
    : words < 10 ? L("اسکریپت خالیه.", "The script is empty.")
    : persian ? L("اسکریپت فارسیه. اول به انگلیسی بازنویسی‌اش کن.", "The script is in Persian. Rewrite it in English first.")
    : lenErr || benchErr || (fitting ? L("صبر کن بازنویسی تموم بشه.", "Wait for the rewrite to finish.") : "");

  const submit = () => {
    if (blocker) return;
    onSubmit({
      script_en: d.script.trim(),
      duration_sec: seconds,
      notes: d.notes.trim(),
      benchmark_url: bench,
      aspect_ratio: d.ratio,
      captions: d.captions,
      voice: d.voice,
      look_id: d.look,
    });
  };

  const label = { fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: 0.2, marginBottom: 7, display: "flex", alignItems: "center", gap: 8 };
  const hint = { fontSize: 11.5, color: C.text3, fontWeight: 500 };
  const field = { width: "100%", boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.line}`, padding: "10px 12px", fontFamily: FONT, fontSize: 13.5, color: C.text, background: C.surface, outline: "none" };
  const chip = (on) => ({
    height: 36, padding: "0 12px", borderRadius: 10, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
    border: `1px solid ${on ? C.orange : C.line}`, background: on ? alpha(C.orange, 0.12) : C.surface, color: on ? C.orangeDeep : C.text,
  });
  const block = { padding: "14px 16px", borderTop: `1px solid ${C.line}` };

  return (
    <div className="ui-sheet-wrap" role="dialog" aria-modal="true" aria-label={L("ویدیوی انگلیسی", "English video")} onClick={onClose}>
      <div className="ui-sheet" dir={uiDir()} onClick={(e) => e.stopPropagation()} style={{ fontFamily: FONT, color: C.text }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 12px" }}>
          <span aria-hidden style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: alpha(C.orangeDeep, 0.13), fontSize: 18, flexShrink: 0 }}>🎬</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5 }}>{L("ویدیوی انگلیسی", "English video")}</div>
            <div dir="auto" style={{ fontSize: 12, color: C.text2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{topic.title_en || topic.title_fa}</div>
          </div>
          <button className="ui-btn" onClick={onClose} aria-label={L("بستن", "Close")} style={{ width: 34, height: 34, borderRadius: 99, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontSize: 15, color: C.text2 }}>✕</button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {/* 1. length */}
          <div style={block}>
            <div style={label}>1 · {L("مدت", "Length")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {VIDEO_LENGTHS.map(([s, l]) => (
                <button key={s} className="ui-btn" onClick={() => set({ length: s })} style={chip(d.length === s)}>{L(l)}</button>
              ))}
              <button className="ui-btn" onClick={() => set({ length: "custom" })} style={chip(d.length === "custom")}>{L("دلخواه…", "Custom…")}</button>
            </div>
            {d.length === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <input inputMode="numeric" value={d.customMin} onChange={(e) => set({ customMin: e.target.value.replace(/\D/g, "").slice(0, 2) })} style={{ ...field, width: 70, textAlign: "center" }} aria-label={L("دقیقه", "Minutes")} />
                <span style={hint}>{L("دقیقه", "min")}</span>
                <input inputMode="numeric" value={d.customSec} onChange={(e) => set({ customSec: e.target.value.replace(/\D/g, "").slice(0, 2) })} style={{ ...field, width: 70, textAlign: "center" }} aria-label={L("ثانیه", "Seconds")} />
                <span style={hint}>{L("ثانیه", "sec")}</span>
                {lenErr && <span style={{ fontSize: 12, color: C.reject, marginInlineStart: 4 }}>{lenErr}</span>}
              </div>
            )}
          </div>

          {/* 2. script */}
          <div style={block}>
            <div style={{ ...label, justifyContent: "space-between" }}>
              <span>2 · {L("اسکریپت", "Script")} <span style={hint}>· {L("آزادانه ویرایش کن، این همون چیزیه که گوینده می‌گه", "edit freely, this is what the presenter says")}</span></span>
              {savedScript && d.script !== savedScript && (
                <button className="ui-btn" onClick={() => set({ script: savedScript })} style={{ background: "transparent", border: "none", color: C.text2, fontSize: 11.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>↺ {L("برگردوندن", "Reset")}</button>
              )}
            </div>
            <textarea
              value={d.script}
              onChange={(e) => set({ script: e.target.value })}
              rows={11}
              dir="auto"
              disabled={fitting}
              style={{ ...field, lineHeight: 1.7, resize: "vertical", minHeight: 180, opacity: fitting ? 0.5 : 1 }}
            />
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, color: !seconds ? C.text3 : fits ? C.success : C.orangeDeep }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: !seconds ? C.text3 : fits ? C.success : C.orange }} />
                {L(`${words} کلمه · حدود ${fmtDur(spoken)} گفتار`, `${words} words · about ${fmtDur(spoken)} spoken`)}
              </span>
              {seconds > 0 && <span style={{ color: C.text3 }}>{L(`هدف ${fmtDur(seconds)} ≈ ${targetWords} کلمه`, `target ${fmtDur(seconds)} ≈ ${targetWords} words`)}{!fits && words ? (off > 0 ? L(" · زیادی بلند", " · too long") : L(" · زیادی کوتاه", " · too short")) : ""}</span>}
              {(persian || (!fits && seconds >= 10 && words >= 10)) && (
                <button
                  className="ui-btn"
                  disabled={fitting}
                  onClick={() => onFit({ script: d.script, seconds, notes: d.notes.trim() })}
                  style={{ marginInlineStart: "auto", background: alpha(C.orange, 0.12), color: C.orangeDeep, border: `1px solid ${alpha(C.orange, 0.4)}`, borderRadius: 9, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: fitting ? "default" : "pointer", fontFamily: FONT }}
                >
                  {fitting ? L("در حال بازنویسی…", "Rewriting…") : persian ? L(`✍️ بازنویسی به انگلیسی (${fmtDur(seconds)})`, `✍️ Rewrite in English (${fmtDur(seconds)})`) : L(`✂️ اندازه کردن با ${fmtDur(seconds)}`, `✂️ Fit to ${fmtDur(seconds)}`)}
                </button>
              )}
            </div>
            {fitting && <div className="ui-pulse" style={{ marginTop: 6, fontSize: 11.5, color: C.text3 }}>{L("فقط از روی متن منبع بازنویسی می‌شه؛ برای پر کردن وقت چیزی ساخته نمی‌شه.", "Rewriting from the source text only; nothing invented to fill time.")}</div>}
            {fitError && <div style={{ marginTop: 6, fontSize: 11.5, color: C.reject }}>⚠️ {fitError}</div>}

            {/* Change the script with a note: rewritten from the source text, at the length chosen above. */}
            <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: `1px dashed ${alpha(C.orange, 0.45)}`, background: alpha(C.orange, 0.04) }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>✏️ {L("تغییر اسکریپت", "Change the script")} <span style={hint}>· {L("مثلاً «جزئیات بیشتر دربارهٔ اینکه کی واجد شرایطه»، «کلمه‌های ساده‌تر»، «با مهلت شروع کن»", 'e.g. "more detail on who qualifies", "simpler words", "start with the deadline"')}</span></div>
              <textarea
                value={change}
                onChange={(e) => setChange(e.target.value)}
                rows={2}
                dir="auto"
                disabled={fitting}
                placeholder={L("چه چیزی عوض بشه؟", "What should change?")}
                style={{ ...field, lineHeight: 1.6, resize: "vertical" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button
                  className="ui-btn"
                  disabled={fitting || !change.trim()}
                  onClick={() => onFit({ script: d.script, seconds, notes: "CHANGE REQUESTED BY THE EDITOR (apply it): " + change.trim() + (d.notes.trim() ? "\nVideo notes: " + d.notes.trim() : "") })}
                  style={{ background: change.trim() && !fitting ? C.orange : alpha(C.orange, 0.35), color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: change.trim() && !fitting ? "pointer" : "default", fontFamily: FONT }}
                >
                  {fitting ? L("در حال بازنویسی…", "Rewriting…") : L("↻ ساخت دوبارهٔ اسکریپت", "↻ Regenerate script")}
                </button>
                <span style={{ fontSize: 11.5, color: C.text3 }}>{L(`مدت طبق انتخاب بالاست (${seconds ? fmtDur(seconds) : "تعیین نشده"})؛ فکت‌ها فقط از منبع.`, `Length follows the choice above (${seconds ? fmtDur(seconds) : "not set"}); facts only from the source.`)}</span>
              </div>
            </div>
          </div>

          {/* 3. notes */}
          <div style={block}>
            <div style={label}>3 · {L("یادداشت‌ها", "Notes")} <span style={hint}>{L("اختیاری", "optional")}</span></div>
            <textarea
              value={d.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              dir="auto"
              placeholder={L("برای چه کسیه، لحن، روی چی تأکید بشه، متن روی صفحه، ایده‌های B-roll…", "Who it's for, tone, what to stress, on-screen text, B-roll ideas…")}
              style={{ ...field, lineHeight: 1.6, resize: "vertical" }}
            />
          </div>

          {/* 4. benchmark */}
          <div style={block}>
            <div style={label}>4 · {L("ویدیوی نمونه", "Benchmark video")} <span style={hint}>{L("اختیاری · سبکی که باید شبیهش بشه", "optional · the style to match")}</span></div>
            <BenchmarkPicker
              value={d.benchmark}
              ratio={d.ratio}
              onPick={(v) => set(d.benchmark === v.url ? { benchmark: "" } : { benchmark: v.url, ...(v.ratio ? { ratio: v.ratio } : {}), ...(lookForBenchmark(v.url) ? { look: lookForBenchmark(v.url) } : {}) })}
              onGone={() => set({ benchmark: "" })}
            />
            <div style={{ ...hint, marginTop: 8, lineHeight: 1.6 }}>
              {L("نمونه‌ها فقط از پوشهٔ Benchmarks میان. برای نمونهٔ تازه، ویدیو رو توی همون پوشه بذار و «تازه‌سازی» رو بزن. نمونه ریتم و کادربندی رو نشون می‌ده؛ لباس و جا رو بخش ۵ تعیین می‌کنه.", "Samples come only from the Benchmarks folder. For a new one, put the video in that folder and tap Refresh. A sample sets the pacing and framing; the outfit and place come from section 5.")}
            </div>
          </div>

          {/* 5. look: the outfit and place HeyGen renders; a sample only shows one */}
          <div style={block}>
            <div style={label}>5 · {L("ظاهر حامد در ویدیو", "Hamed's look in the video")} <span style={hint}>{L("لباس و جایی که ویدیو توش ساخته می‌شه", "the outfit and place the video is made in")}</span></div>
            {bench && !lookForBenchmark(bench) && (
              <div dir={uiDir()} style={{ fontSize: 12, lineHeight: 1.7, color: C.orangeDeep, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                {L("از لباس این ویدیوی نمونه هنوز ظاهری در HeyGen ساخته نشده، پس ویدیو با ظاهری که این‌جا انتخاب می‌کنی ساخته می‌شه؛ نمونه فقط قالب و ریتم رو مشخص می‌کنه.", "HeyGen has no look of the outfit in this sample yet, so the video is made in the look you choose here; the sample only sets the format and pacing.")}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {LOOKS.map((lk) => (
                <button key={lk.id} type="button" className="ui-btn" onClick={() => set({ look: lk.id })} aria-pressed={d.look === lk.id} style={{ padding: 0, borderRadius: 12, overflow: "hidden", cursor: "pointer", background: C.surface, border: `2px solid ${d.look === lk.id ? C.teal : C.line}`, textAlign: "start", fontFamily: FONT }}>
                  <img src={lk.picture} alt="" loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "9 / 14", objectFit: "cover" }} />
                  <div dir={uiDir()} style={{ padding: "6px 7px", fontSize: 11, fontWeight: 700, lineHeight: 1.4, color: C.text }}>
                    {d.look === lk.id ? "✓ " : ""}{L(lk.name)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 6. format */}
          <div style={block}>
            <div style={label}>6 · {L("قالب", "Format")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
              {[["9:16", ["ریلز / شورتز", "Reel / Short"], "9:16"], ["16:9", "YouTube", "16:9"], ["1:1", ["فید", "Feed"], "1:1"]].map(([v, l, sub]) => (
                <button key={v} className="ui-btn" onClick={() => set({ ratio: v })} style={{ ...chip(d.ratio === v), height: "auto", padding: "8px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span>{L(l)}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.7 }}>{sub}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button className="ui-btn" onClick={() => set({ captions: !d.captions })} style={chip(d.captions)}>{d.captions ? "✓ " : ""}{L("زیرنویس روی ویدیو", "Burn in captions")}</button>
              <button className="ui-btn" onClick={() => set({ voice: "primary" })} style={chip(d.voice === "primary")}>{L("صدا: کلون اصلی", "Voice: main clone")}</button>
              <button className="ui-btn" onClick={() => set({ voice: "secondary" })} style={chip(d.voice === "secondary")}>{L("صدا: کلون دوم", "Voice: second clone")}</button>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.line}`, background: C.surface }}>
          {blocker && <div style={{ fontSize: 12, color: enabled ? C.orangeDeep : C.text2, marginBottom: 8, textAlign: "center" }}>{blocker}</div>}
          <button
            className="ui-btn ui-glow-orange"
            onClick={submit}
            disabled={!!blocker}
            style={{ width: "100%", background: blocker ? C.surfaceHi : C.orange, color: blocker ? C.text3 : "#fff", border: "none", borderRadius: 13, padding: "14px", fontWeight: 800, fontSize: 14.5, cursor: blocker ? "default" : "pointer", fontFamily: FONT }}
          >
            🎬 {L(`ساخت ویدیو${seconds >= 10 ? " " + fmtDur(seconds) : ""}`, `Generate ${seconds >= 10 ? fmtDur(seconds) + " " : ""}video`)}
          </button>
          <div style={{ ...hint, textAlign: "center", marginTop: 7 }}>{L("ورک‌فلو ویدیو رو در HeyGen می‌سازه و نتیجه رو برای تأیید به تلگرام می‌فرسته.", "The workflow renders in HeyGen and sends the result to Telegram for approval.")}</div>
        </div>
      </div>
    </div>
  );
}

// Where the English video stands: sent, rendering, ready (with links) or
// failed. Asks the server every 20 seconds while the workflow is working.
function VideoPanel({ job, video, onRefresh, onOpen }) {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const st = video && video.status;
  const waiting = st === "requested" || st === "rendering";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => refreshRef.current && refreshRef.current(), 20000);
    return () => clearInterval(t);
  }, [waiting]);

  const sending = !!job && job.status === "running";
  const sendErr = job && job.status === "error" && !(video && video.requested_at > (job.startedAt || 0)) ? job.error : "";
  const req = (video && video.request) || {};
  const tone = sendErr || st === "failed" ? C.reject : st === "done" ? C.success : C.orange;
  const title = sending
    ? L("در حال ارسال به ورک‌فلوی ویدیو…", "Sending to the video workflow…")
    : sendErr ? L("به ورک‌فلوی ویدیو وصل نشد", "Could not reach the video workflow")
    : st === "requested" ? L("درخواست شد · در انتظار ورک‌فلو", "Requested · waiting for the workflow")
    : st === "rendering" ? L("در حال ساخت در HeyGen…", "Rendering in HeyGen…")
    : st === "done" ? L("ویدیو آماده است", "Video ready")
    : st === "failed" ? L("ورک‌فلو خطا گزارش داد", "The workflow reported a failure")
    : L("ویدیو", "Video");
  const link = { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 11, padding: "9px 13px", fontSize: 13, fontWeight: 700, textDecoration: "none", fontFamily: FONT };

  return (
    <div dir={uiDir()} className={"ui-fade" + (sending || waiting ? " ui-progress" : "")} style={{ ...card, padding: 14, fontFamily: FONT, borderColor: alpha(tone, 0.4) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden className={sending || waiting ? "ui-pulse" : ""} style={{ width: 9, height: 9, borderRadius: 99, background: tone, flexShrink: 0 }} />
        <b style={{ fontSize: 14 }}>{title}</b>
        {video && video.requested_at > 0 && <span style={{ marginInlineStart: "auto", fontSize: 11.5, color: C.text3 }}>{when(video.requested_at)}</span>}
      </div>
      {(sendErr || (st === "failed" && video.error)) && (
        <div style={{ marginTop: 6, fontSize: 12, color: C.reject }}>⚠️ {sendErr || video.error}</div>
      )}
      {req.duration_sec > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, fontSize: 11.5, color: C.text2 }}>
          <span style={{ background: C.surfaceHi, borderRadius: 99, padding: "3px 9px" }}>⏱ {fmtDur(req.duration_sec)}</span>
          {req.format && <span style={{ background: C.surfaceHi, borderRadius: 99, padding: "3px 9px" }}>▭ {req.format.aspect_ratio}{req.format.captions ? L(" · زیرنویس", " · captions") : ""}</span>}
          {req.script_en && <span style={{ background: C.surfaceHi, borderRadius: 99, padding: "3px 9px" }}>{L(`${wordCount(req.script_en)} کلمه`, `${wordCount(req.script_en)} words`)}</span>}
          {req.benchmark && req.benchmark.url && (
            <a href={req.benchmark.url} target="_blank" rel="noopener noreferrer" style={{ background: alpha(C.teal, 0.1), color: C.teal, borderRadius: 99, padding: "3px 9px", textDecoration: "none", fontWeight: 600 }}>
              {L("نمونه", "benchmark")} ↗
            </a>
          )}
        </div>
      )}
      {waiting && <div style={{ marginTop: 8, fontSize: 11.5, color: C.text3 }}>{L("HeyGen معمولاً چند دقیقه طول می‌کشه. می‌تونی از این صفحه بری؛ نتیجه با موضوع ذخیره می‌شه.", "HeyGen usually takes a few minutes. You can leave this page; the result is saved with the topic.")}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {st === "done" && video.video_url && (
          <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="ui-btn" style={{ ...link, background: C.orange, color: "#fff" }}>▶ {L("تماشا / دانلود", "Watch / download")}</a>
        )}
        {video && video.page_url && (
          <a href={video.page_url} target="_blank" rel="noopener noreferrer" className="ui-btn" style={{ ...link, background: C.surface, color: C.text, border: `1px solid ${C.line}` }}>{L("باز کردن در HeyGen", "Open in HeyGen")} ↗</a>
        )}
        {!sending && (
          <button className="ui-btn" onClick={onOpen} style={{ ...link, background: "transparent", color: C.text2, border: `1px solid ${C.line}`, cursor: "pointer" }}>
            {st === "done" ? L("↻ ساخت یک نسخهٔ دیگه", "↻ Make another version") : sendErr || st === "failed" ? L("↻ دوباره امتحان کن", "↻ Try again") : L("✎ ویرایش و ارسال دوباره", "✎ Edit and send again")}
          </button>
        )}
      </div>
    </div>
  );
}

function BackBtn({ onClick, label }) {
  label = label || L("فهرست", "Deck");
  return (
    <button className="ui-btn ui-glass" onClick={onClick} style={{ border: `1px solid ${C.line}`, color: C.text, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "'Geist', 'Vazirmatn', sans-serif", borderRadius: 99, padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      ← {label}
    </button>
  );
}


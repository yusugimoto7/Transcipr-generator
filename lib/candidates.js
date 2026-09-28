// The durable candidate pool. A scheduled GitHub Actions job
// (.github/workflows/harvest.yml -> scripts/harvest.mjs) fetches every feed
// every few hours and accumulates what it finds into candidates.json on the
// `harvest-data` branch; the app reads that file when you press the button.
//
// Why: an RSS feed only ever exposes its latest 10-25 posts. Fetching on click
// meant that after two quiet weeks the engine saw only what each feed showed at
// that instant — everything published in between had already scrolled off.
// The harvester catches it as it appears, so the pool is still there later.
//
// The repo is public, so the file is read over raw.githubusercontent.com with
// no token. Items are public news headlines; nothing private is stored.

import { articleKey } from "./news.js";

export const HARVEST_URL =
  process.env.HARVEST_DATA_URL ||
  "https://raw.githubusercontent.com/yusugimoto7/Transcipr-generator/harvest-data/candidates.json";

export const KEEP_DAYS = 45; // retention in the store; the app serves 30 days
export const MAX_STORED = 2500; // hard ceiling so the file stays quick to load

// ── Relevance ─────────────────────────────────────────────────────────────────
// A cheap, deterministic first pass. Broad Google News queries return a lot of
// general news that happens to contain a keyword; a model call per item to weed
// that out would cost more than everything else combined. Each hit on a
// distinctive immigration term adds weight; an item with none is not a topic.
const STRONG = [
  "ircc", "pgwp", "lmia", "study permit", "work permit", "express entry",
  "provincial nominee", "pnp", "oinp", "bc pnp", "aaip", "sinp", "mpnp",
  "permanent residen", "temporary resident", "citizenship", "refugee", "asylum",
  "sponsorship", "spousal", "open work permit", "visitor visa", "super visa",
  "caregiver", "francophone", "atlantic immigration", "rural community",
  "immigration levels", "processing time", "biometric", "judicial review",
  "federal court", "ministerial instruction", "canada gazette", "iec",
  "working holiday", "international student", "opportunity card", "blue card",
  "chancenkarte", "schengen", "golden visa", "digital nomad visa", "residence permit",
  "skilled worker", "job seeker visa", "family reunification",
];
const WEAK = ["immigra", "visa", "permit", "migrant", "newcomer", "foreign worker", "deport", "border"];

// US-only immigration news is out of scope for the brand.
const US_ONLY = /\b(uscis|h-1b|h1b|green card|ice raid|daca|trump administration|u\.s\. immigration|us immigration)\b/i;
// Canada, Europe, or a Canada-only program name (which implies Canada).
const IN_SCOPE_PLACE =
  /\b(canada|canadian|ircc|ottawa|ontario|quebec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland|prince edward island|yukon|pgwp|lmia|express entry|pnp|oinp|aaip|mpnp|sinp|europe|european|eu|schengen|germany|german|portugal|spain|france|netherlands|dutch|finland|italy|ireland|sweden|austria|belgium)\b/i;

export function relevance(item) {
  const hay = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
  if (US_ONLY.test(hay) && !IN_SCOPE_PLACE.test(hay)) return 0;
  // Web-wide keyword searches also return Qatar, Australia or UK visa news
  // that merely shares a word with the query. Dedicated immigration sources
  // are in scope by construction; search results must name a place we cover.
  if (item.broad && !IN_SCOPE_PLACE.test(hay)) return 0;
  let score = 0;
  for (const t of STRONG) if (hay.includes(t)) score += 3;
  for (const t of WEAK) if (hay.includes(t)) score += 1;
  return score;
}

// Express Entry draw results are covered by the separate draws poster, so
// they never become topics. Only DRAW items — a policy change that merely
// mentions Express Entry is still a topic.
export function isDrawResult(item) {
  const hay = `${item.title || ""} ${item.snippet || ""}`.toLowerCase();
  return (
    /express\s*entry[^.]{0,40}\b(draw|round)/.test(hay) ||
    /\b(draw|round of invitations)[^.]{0,40}express\s*entry/.test(hay) ||
    /\bcrs\s*(cut[- ]?off|score of|minimum)/.test(hay) ||
    /latest\s+(express entry\s+)?draw|draw\s+results/.test(hay)
  );
}

// ── Merge ─────────────────────────────────────────────────────────────────────
// Fold a fresh fetch into the stored pool. first_seen is preserved so "new
// since your last visit" means something; enrichment already done (resolved
// article URL, fetched text) is never thrown away by a later, thinner copy.
export function mergeCandidates(stored, fresh, nowMs = Date.now()) {
  const byKey = new Map();
  for (const c of stored || []) if (c && c.key) byKey.set(c.key, c);
  let added = 0;
  const nowIso = new Date(nowMs).toISOString();
  for (const f of fresh || []) {
    const key = f.key || articleKey(f.source_url);
    if (!key) continue;
    const prev = byKey.get(key);
    if (prev) {
      byKey.set(key, {
        ...f,
        ...prev,
        snippet: (f.snippet || "").length > (prev.snippet || "").length ? f.snippet : prev.snippet,
        last_seen: nowIso,
      });
    } else {
      byKey.set(key, { ...f, key, first_seen: nowIso, last_seen: nowIso });
      added++;
    }
  }
  const cutoff = nowMs - KEEP_DAYS * 86400000;
  const kept = [...byKey.values()]
    .filter((c) => {
      const t = c.published_ms || Date.parse(c.first_seen || "") || 0;
      return t >= cutoff;
    })
    .sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0))
    .slice(0, MAX_STORED);
  return { items: kept, added };
}

// ── Read (app side) ───────────────────────────────────────────────────────────
let _cache = { data: null, at: 0 };
const CACHE_MS = 10 * 60 * 1000;

// The stored pool, or null if it cannot be read — in which case the app falls
// back to a live fetch exactly as before, so a missing harvest never breaks it.
export async function loadHarvest({ timeoutMs = 6000 } = {}) {
  if (_cache.data && Date.now() - _cache.at < CACHE_MS) return _cache.data;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(HARVEST_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.items)) return null;
    _cache = { data, at: Date.now() };
    return data;
  } catch (_) {
    return null;
  }
}

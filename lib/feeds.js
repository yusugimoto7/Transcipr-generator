// The list of topic SOURCES, kept apart from the ingest logic in news.js so
// the two can change independently: adding a feed is a one-line edit here and
// never touches parsing, dedupe or scoring. After adding one, confirm it on
// /api/feeds once deployed — ingest swallows per-feed failures by design, so a
// wrong URL just silently contributes nothing.
//
// Runtime additions without a code change: NEWS_FEED_URLS, X_FEED_URLS and
// YOUTUBE_FEED_URLS (see .env.example).

// Curated, real immigration feeds. The first three are the ones already proven
// in the n8n workflow; the rest are reputable additions. Any that 404 or time
// out are skipped silently, so it is safe to keep a broad list here.
// Google News search feeds are the single strongest lever for breadth and
// freshness: free, no API key, and they aggregate hundreds of outlets we could
// never subscribe to individually. `when:30d` bounds each query at the source.
// One query per beat keeps each result set on-topic instead of one broad query
// whose top results are always the same big stories.
export const GNEWS = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=en-CA&gl=CA&ceid=CA:en`;

export const CORE_FEEDS = [
  // ── Dedicated immigration outlets ──────────────────────────────────────
  { url: "https://www.cicnews.com/feed", name: "CIC News" },
  { url: "https://immigrationnewscanada.ca/feed/", name: "Immigration News Canada" },
  {
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=25&format=atom",
    name: "IRCC",
  },
  { url: "https://www.canadim.com/feed/", name: "Canadim" },
  { url: "https://canadianimmigrant.ca/feed", name: "Canadian Immigrant" },
  { url: "https://www.immigration.ca/feed/", name: "Immigration.ca" },
  { url: "https://www.cimmigrationnews.com/feed/", name: "CI News" },
  { url: "https://www.schengenvisainfo.com/news/feed/", name: "SchengenVisaInfo" },
  { url: "https://www.imi-daily.com/feed/", name: "IMI Daily" },

  // ── Per-beat Google News queries ───────────────────────────────────────
  // Each one mines a different vein, so a quiet week in one beat does not
  // empty the whole deck.
  { url: GNEWS('"canada immigration" policy OR rules OR changes'), name: "Google News" },
  { url: GNEWS("IRCC announcement OR update OR memo"), name: "Google News" },
  { url: GNEWS('"study permit" OR PGWP OR "international students" canada'), name: "Google News" },
  { url: GNEWS('"work permit" OR LMIA OR "temporary foreign worker" canada'), name: "Google News" },
  { url: GNEWS('"provincial nominee" OR PNP OR "BC PNP" OR OINP canada'), name: "Google News" },
  { url: GNEWS("canada immigration processing times OR backlog OR fees"), name: "Google News" },
  { url: GNEWS('canada immigration "federal court" OR ruling OR lawsuit'), name: "Google News" },
  { url: GNEWS("canada sponsorship OR spousal OR parents grandparents immigration"), name: "Google News" },
  { url: GNEWS("citizenship canada rules OR test OR oath changes"), name: "Google News" },
  // Europe lane — uncontested white space for the brand.
  { url: GNEWS("germany opportunity card OR skilled worker visa"), name: "Google News" },
  { url: GNEWS("europe OR portugal OR netherlands OR spain residence permit visa changes"), name: "Google News" },
  { url: GNEWS("schengen visa rules OR EU blue card changes"), name: "Google News" },
  // Iranian-audience angle — passports, sanctions, consular access.
  { url: GNEWS("iranian OR iran visa OR immigration canada OR europe"), name: "Google News" },

  // ── Primary government & legal sources ─────────────────────────────────
  // Straight from the regulator/court/legislature rather than reported
  // through an outlet — catches changes before news coverage exists. Every
  // URL below was fetched and confirmed to return a live RSS/Atom feed
  // before being added here.
  { url: "https://gazette.gc.ca/rss/p1-eng.xml", name: "Canada Gazette Part I" },
  { url: "https://gazette.gc.ca/rss/p2-eng.xml", name: "Canada Gazette Part II" },
  // Federal Court, not the Court of Appeal — this is where IRB judicial
  // review applications (the bulk of immigration litigation) actually land.
  { url: "https://www.canlii.org/en/ca/fct/rss_new.xml", name: "CanLII — Federal Court" },
  // IRCC Ministerial Instructions and the notices index on canada.ca expose
  // no RSS/Atom feed of their own (checked directly on the live pages) —
  // the "IRCC" entry above (api.io.canada.ca news centre) is the closest
  // real feed IRCC publishes.

  // Provincial nominee programs: RSS only exists for these two. BC
  // (welcomebc.ca), Ontario (ontario.ca), Alberta (alberta.ca) and
  // Saskatchewan (saskatchewan.ca) were checked directly on their PNP
  // update pages and have none — the PNP Google News query above covers
  // those instead.
  { url: "https://immigratemanitoba.com/news/feed/", name: "Manitoba PNP" },
  { url: "https://liveinnovascotia.com/taxonomy/term/3/feed", name: "Nova Scotia PNP" },

  { url: "https://www.reddit.com/r/ImmigrationCanada/top/.rss?t=week", name: "r/ImmigrationCanada" },
];

// ── YouTube ──────────────────────────────────────────────────────────────────
// Immigration lawyers and consultants often break down a change on YouTube
// before the written outlets cover it, and every channel exposes a free RSS
// feed — no API key, no quota.
//
// That feed is keyed by channel_id (UC…), which is not visible in a normal
// YouTube URL. Rather than make anyone hunt one down, ANY YouTube URL works
// here — a video link, an @handle, or a channel page — and the channel_id is
// resolved at runtime and cached. Add more via YOUTUBE_FEED_URLS.
export const YOUTUBE_SOURCES = [
  "https://youtu.be/2PoyUt8oH1A",
  "https://youtu.be/6PK_EXszNrg",
  "https://youtu.be/s4ZhP7XFufM",
  "https://youtu.be/I0X2UpWpUpI",
];

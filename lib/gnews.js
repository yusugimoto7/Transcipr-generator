// Resolve a Google News RSS link (news.google.com/rss/articles/CBMi...) to the
// publisher's real article URL.
//
// Google News is the broadest source the engine has, but its links are opaque
// redirects: fetching one returns a Google interstitial, not the article. So a
// Google News topic had nothing to ground a script on but its headline, and
// the card linked to Google instead of the publisher.
//
// Google exposes no API for this. The method below is what Google's own page
// does (read a signature + timestamp from the article page, then call its
// batchexecute endpoint), as used by open-source decoders. It is undocumented
// and can change without notice, so every failure returns null and callers
// carry on with the Google link — the harvest log reports the success rate, so
// a break is visible instead of silent.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function articleId(link) {
  try {
    const u = new URL(link);
    if (!/(^|\.)news\.google\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

async function timedFetch(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function decodingParams(id, timeoutMs) {
  for (const base of ["https://news.google.com/articles/", "https://news.google.com/rss/articles/"]) {
    try {
      const res = await timedFetch(base + id, { headers: { "User-Agent": UA } }, timeoutMs);
      if (!res.ok) continue;
      const html = await res.text();
      const sg = html.match(/data-n-a-sg="([^"]+)"/);
      const ts = html.match(/data-n-a-ts="([^"]+)"/);
      if (sg && ts) return { signature: sg[1], timestamp: ts[1] };
    } catch (_) {}
  }
  return null;
}

export async function resolveGoogleNewsUrl(link, { timeoutMs = 8000 } = {}) {
  const id = articleId(link);
  if (!id) return null;
  try {
    const params = await decodingParams(id, timeoutMs);
    if (!params) return null;
    const inner =
      `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],` +
      `"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${params.timestamp},"${params.signature}"]`;
    const body = "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner]]]));
    const res = await timedFetch(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": UA,
        },
        body,
      },
      timeoutMs
    );
    if (!res.ok) return null;
    const text = await res.text();
    const chunk = text.split("\n\n")[1];
    if (!chunk) return null;
    const outer = JSON.parse(chunk);
    const url = JSON.parse(outer[0][2])[1];
    return typeof url === "string" && /^https?:\/\//.test(url) && !/news\.google\.com/.test(url)
      ? url
      : null;
  } catch (_) {
    return null;
  }
}

import Parser from "rss-parser";
import { fetchNews } from "/home/user/Transcipr-generator/lib/news.js";

// 1. Graceful failure when feeds are unreachable (sandbox blocks them).
const r = await fetchNews({ nowMs: Date.parse("2026-07-24T00:00:00Z") });
console.log("fetchNews ->", "items:", r.items.length, "| feeds tried:", r.feedStatus.length, "| any ok:", r.feedStatus.some(f=>f.ok));

// 2. rss-parser field assumptions for RSS 2.0 and Atom (offline parseString).
const p = new Parser();
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
<item><title>Canada raises PGWP rules</title><link>https://www.cicnews.com/2026/07/pgwp-abc.htm</link>
<pubDate>Wed, 22 Jul 2026 10:00:00 GMT</pubDate><description>Some &lt;b&gt;news&lt;/b&gt; body here.</description></item>
</channel></rss>`;
const atom = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>IRCC policy update</title><link href="https://www.canada.ca/en/news/xyz.html"/>
<published>2026-07-23T12:00:00Z</published><summary>Atom summary text.</summary></entry></feed>`;
const a = await p.parseString(rss);
const b = await p.parseString(atom);
console.log("RSS item:", JSON.stringify({title:a.items[0].title, link:a.items[0].link, isoDate:a.items[0].isoDate, snip:(a.items[0].contentSnippet||"").slice(0,20)}));
console.log("Atom item:", JSON.stringify({title:b.items[0].title, link:b.items[0].link, isoDate:b.items[0].isoDate, snip:(b.items[0].contentSnippet||"").slice(0,20)}));

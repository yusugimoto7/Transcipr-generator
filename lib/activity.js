// Who did what, and when (Hamed, Nov 10 2026: "I need to see the logs of every user in Settings: any
// activity Yegane or Farhad did, with date and time in Vancouver time"). The middleware sees every
// signed-in request and hands the ones that are an action or a page opened to /api/activity, which
// lands here; the Topic Engine's jobs are recorded by /api/jobs itself, because only it knows what
// was made and for which topic. Entries are kept in memory for a minute and then added to one file
// per Vancouver day on editing-data (`activity/<YYYY-MM-DD>.json`), so a busy minute is one write.
// The same action on the same thing within a few minutes (the calendar's and the editor's autosaves)
// is one entry with a count. Only the admin reads them (/api/activity, Settings → Activity).
import { get, put, update, storeConfigured } from "./editing/store.js";

const FLUSH_MS = 60 * 1000;
const SAME_MS = 5 * 60 * 1000;
export const ZONE = "America/Vancouver";

const mem = globalThis.__activity || (globalThis.__activity = { queue: [], last: new Map(), timer: null });

export const dayOf = (at) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));

// [method, path pattern, Persian, English]; the first match names the action. A path that matches
// nothing is still kept, by its address, so nothing done is lost.
const ACTIONS = [
  ["POST", /^\/api\/editing\/auth\/login$/, "وارد شد", "signed in"],
  ["POST", /^\/api\/editing\/auth\/logout$/, "خارج شد", "signed out"],
  ["POST", /^\/api\/editing\/auth\/password$/, "رمزش را عوض کرد", "changed their password"],
  ["POST", /^\/api\/editing\/auth\/lang$/, "زبان برنامه را عوض کرد", "changed the app language"],
  ["POST", /^\/api\/editing\/projects$/, "پروژهٔ تدوین ساخت", "created an editing project"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/approve$/, "نسخه را تأیید کرد", "approved a version"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/corrections\/voice$/, "اصلاحیه را با صدا گفت", "spoke corrections"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/corrections$/, "اصلاحیه فرستاد", "sent corrections"],
  ["DELETE", /^\/api\/editing\/projects\/([^/]+)\/corrections$/, "اصلاحیه را پاک کرد", "removed a correction"],
  ["PUT", /^\/api\/editing\/projects\/([^/]+)\/draft$/, "در ویرایشگر دستی کار کرد", "worked in the hand editor"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/draft$/, "در ویرایشگر دستی تصویر گذاشت", "added a picture in the hand editor"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/edit$/, "از ویرایش دستی نسخه ساخت", "made a version from the hand editor"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/stage$/, "مرحلهٔ بعد را شروع کرد", "started the next step"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/rerun$/, "نسخه را دوباره راه انداخت", "ran a version again"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/access$/, "دسترسی پروژه را عوض کرد", "changed who sees a project"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/subtitles$/, "متن زیرنویس را ویرایش کرد", "edited subtitle lines"],
  ["POST", /^\/api\/editing\/projects\/([^/]+)\/subtitle-style$/, "تنظیمات زیرنویس را عوض کرد", "changed the subtitle settings"],
  ["PATCH", /^\/api\/editing\/projects\/([^/]+)$/, "پروژه را ویرایش کرد", "edited a project"],
  ["DELETE", /^\/api\/editing\/projects\/([^/]+)$/, "پروژه را پاک کرد", "deleted a project"],
  ["POST", /^\/api\/editing\/voices\/upload$/, "صدا بارگذاری کرد", "uploaded a voice"],
  ["POST", /^\/api\/editing\/team$/, "عضو تیم اضافه کرد", "added a team member"],
  ["*", /^\/api\/editing\/team\/([^/]+)$/, "دسترسی عضو تیم را عوض کرد", "changed a team member"],
  ["*", /^\/api\/editing\/lessons/, "درس تدوین را بررسی کرد", "reviewed an editing lesson"],
  ["*", /^\/api\/editing\/content-lessons/, "قاعدهٔ محتوا را عوض کرد", "changed a content rule"],
  ["POST", /^\/api\/calendar\/boards\/([^/]+)\/cards$/, "کارت تقویم ساخت", "added a calendar card"],
  ["POST", /^\/api\/calendar\/boards\/([^/]+)\/cards\/([^/]+)\/action$/, "روی کارت تقویم اقدام کرد", "acted on a calendar card"],
  ["POST", /^\/api\/calendar\/boards\/([^/]+)\/cards\/([^/]+)\/comments$/, "روی کارت تقویم نظر گذاشت", "commented on a calendar card"],
  ["DELETE", /^\/api\/calendar\/boards\/([^/]+)\/cards\/([^/]+)$/, "کارت تقویم را پاک کرد", "deleted a calendar card"],
  ["*", /^\/api\/calendar\/boards\/([^/]+)\/cards\/([^/]+)$/, "کارت تقویم را ویرایش کرد", "edited a calendar card"],
  ["POST", /^\/api\/calendar\/boards\/([^/]+)\/archive$/, "کارتی را از بایگانی برگرداند", "restored a card from the archive"],
  ["*", /^\/api\/calendar\/boards\/([^/]+)\/lists$/, "لیست‌های تقویم را عوض کرد", "changed calendar lists"],
  ["POST", /^\/api\/calendar\/topic$/, "از موضوع کارت تقویم ساخت", "sent a topic to the calendar"],
  ["POST", /^\/api\/calendar\/visa$/, "خبر ویزا را به تقویم فرستاد", "sent a visa story to the calendar"],
  ["*", /^\/api\/calendar\/connect\//, "کانال انتشار را وصل کرد", "connected a publishing channel"],
  ["POST", /^\/api\/workspace$/, "موضوع را برداشت، بایگانی یا اضافه کرد", "picked, archived or added a topic"],
  ["POST", /^\/api\/publish$/, "در وردپرس منتشر کرد", "published to WordPress"],
  ["POST", /^\/api\/gdoc$/, "فایل Google Doc ساخت", "made a Google Doc"],
  ["POST", /^\/api\/topics$/, "موضوع‌ها را تازه کرد", "refreshed the topics"],
  ["POST", /^\/api\/visa-cases/, "پروندهٔ خبر ویزا را عوض کرد", "changed a visa story case"],
  ["POST", /^\/api\/story\/upload$/, "برای استوری تصویر گذاشت", "uploaded a story picture"],
  ["POST", /^\/api\/share$/, "از گوشی پست فرستاد", "shared a post from the phone"],
  ["POST", /^\/api\/voice-study/, "مطالعهٔ صدا را راه انداخت", "started the voice study"],
  ["POST", /^\/api\/glossary$/, "واژه‌نامه را به‌روز کرد", "updated the glossary"],
  ["GET", /^\/editing\/p\/([^/]+)\/edit$/, "ویرایشگر دستی را باز کرد", "opened the hand editor"],
  ["GET", /^\/editing\/p\/([^/]+)$/, "پروژهٔ تدوین را باز کرد", "opened an editing project"],
  ["GET", /^\/editing\/new$/, "صفحهٔ پروژهٔ جدید را باز کرد", "opened New project"],
  ["GET", /^\/editing\/team$/, "صفحهٔ تیم را باز کرد", "opened Team"],
  ["GET", /^\/editing\/topics$/, "موضوع‌های ضبط را باز کرد", "opened Topics to record"],
  ["GET", /^\/editing\/lessons/, "درس‌ها را باز کرد", "opened Lessons"],
  ["GET", /^\/editing\/?$/, "تدوین ویدیو را باز کرد", "opened Video Editing"],
  ["GET", /^\/calendar/, "تقویم محتوا را باز کرد", "opened the content calendar"],
  ["GET", /^\/settings$/, "تنظیمات را باز کرد", "opened Settings"],
  ["GET", /^\/$/, "Topic Engine را باز کرد", "opened the Topic Engine"],
];

// What the Topic Engine's jobs are, for the log (lib/jobs.js kinds; "@en" is the English version).
const JOBS = {
  script: ["اسکریپت نوشت", "wrote the scripts"], script_fix: ["اسکریپت را اصلاح کرد", "revised a script"],
  telegram_write: ["پست تلگرام نوشت", "wrote the Telegram post"], telegram_save: ["پست تلگرام را ویرایش کرد", "edited the Telegram post"],
  telegram_image: ["تصویر تلگرام ساخت", "made the Telegram picture"], telegram_send: ["پست را به تلگرام فرستاد", "sent the post to Telegram"],
  article: ["مقاله نوشت یا ویرایش کرد", "wrote or edited the article"], draft: ["پیش‌نویس وردپرس ساخت", "made a WordPress draft"],
  publish: ["در وردپرس منتشر کرد", "published to WordPress"], docfile: ["فایل Word ساخت", "made a Word file"],
  carousel: ["کاروسل ساخت یا ویرایش کرد", "made or changed a carousel"], carousel_slide: ["یک اسلاید را عوض کرد", "changed a slide"],
  carousel_read: ["متن اسلاید را خواند", "read a slide's text"], story: ["استوری ساخت", "made a story"], story_page: ["صفحهٔ استوری را عوض کرد", "changed a story page"],
  video: ["ویدیوی انگلیسی سفارش داد", "ordered the English video"], custom_news: ["خبر از منبع خودش ساخت", "made a topic from their own source"],
  research: ["تحقیق کرد", "ran a research"], learn: ["به برنامه قاعده یاد داد", "taught the app a rule"], assistant: ["با دستیار نوشتن کار کرد", "used the writing assistant"],
  visa_scan: ["تصویر خبر ویزا را خواند", "scanned a visa result"], visa_fix: ["خوانش خبر ویزا را اصلاح کرد", "corrected a visa reading"],
  visa_restyle: ["طرح خبر ویزا را عوض کرد", "restyled a visa story"], visa_story: ["استوری خبر ویزا ساخت", "made a visa story"],
};

export function jobLabel(kind) {
  const base = String(kind || "").replace(/@en$/, "");
  const l = JOBS[base] || [`کار «${base}»`, `job "${base}"`];
  return /@en$/.test(kind) ? [l[0] + " (انگلیسی)", l[1] + " (English)"] : l;
}

export function describe(method, path) {
  for (const [m, re, fa, en] of ACTIONS) {
    if (m !== "*" && m !== method) continue;
    const hit = path.match(re);
    if (hit) return { what: [fa, en], ids: hit.slice(1) };
  }
  return null;
}

export { worthLogging } from "./activity-filter.js";

export function record({ uid, method = "", path = "", what = null, detail = "", ref = "" }) {
  if (!uid || !storeConfigured()) return;
  const d = what ? { what, ids: [] } : describe(method, path);
  const at = Date.now();
  const entry = { at, uid, what: d ? d.what : null, path: d ? "" : `${method} ${path}`, ids: d ? d.ids : [], detail: String(detail || "").slice(0, 200), ref: String(ref || "").slice(0, 200) };
  const key = [uid, JSON.stringify(entry.what || entry.path), entry.ids.join("/"), entry.detail].join("|");
  const prev = mem.last.get(key);
  if (prev && at - prev.at < SAME_MS) {
    prev.n = (prev.n || 1) + 1;
    prev.until = at;
    prev.at_last = at;
    if (!mem.queue.includes(prev)) mem.queue.push(prev);
    return;
  }
  mem.last.set(key, entry);
  if (mem.last.size > 2000) mem.last.delete(mem.last.keys().next().value);
  mem.queue.push(entry);
  if (!mem.timer) mem.timer = setTimeout(flush, FLUSH_MS);
}

// An entry already written comes back with a higher count: the day's file keeps one line for it.
export async function flush() {
  mem.timer = null;
  const batch = mem.queue.splice(0);
  if (!batch.length) return;
  const byDay = new Map();
  for (const e of batch) {
    const day = dayOf(e.at);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({ ...e });
  }
  for (const [day, items] of byDay) {
    const merge = (cur) => {
      const list = Array.isArray(cur && cur.items) ? cur.items : [];
      for (const e of items) {
        const i = list.findIndex((x) => x.at === e.at && x.uid === e.uid);
        if (i >= 0) list[i] = e;
        else list.push(e);
      }
      return { day, items: list };
    };
    try {
      // the day's first entries make its file (update only changes a file that exists)
      if (await get(`activity/${day}.json`).catch(() => null)) await update(`activity/${day}.json`, merge, `app: activity ${day}`);
      else await put(`activity/${day}.json`, merge(null), null, `app: activity ${day}`);
    } catch (e) {
      console.log("[activity] not saved:", String(e.message || e).slice(0, 160));
      mem.queue.push(...items); // tried again with the next minute's
      if (!mem.timer) mem.timer = setTimeout(flush, FLUSH_MS);
    }
  }
}

// A day's entries, newest first, with what is still waiting to be written.
export async function readDay(day) {
  const rec = await get(`activity/${day}.json`).catch(() => null);
  const saved = (rec && rec.data && rec.data.items) || [];
  const waiting = mem.queue.filter((e) => dayOf(e.at) === day);
  const all = [...saved.filter((e) => !waiting.some((w) => w.at === e.at && w.uid === e.uid)), ...waiting];
  return all.sort((a, b) => (b.at_last || b.at) - (a.at_last || a.at));
}

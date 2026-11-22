// One heavy thing at a time (Hamed, Nov 22 2026: «این داستان مموری رو یک بار برای همیشه حل کن», after the
// server passed its 512 MB twice while a story was made). The server's own Chromium and the OCR engine
// each take hundreds of MB; measured on a story of an X post: OCR kept ~120 MB for the server's life and
// Chromium stood beside it. Every such job goes through `heavy(kind, fn)`: jobs run one after another,
// and before a job of another kind starts, the kind that ran before gives its memory back (its `release`:
// the browser closes, the OCR worker ends). Never call heavy() from inside a heavy job: it would wait
// on itself.
import sharp from "sharp";

// the picture library keeps up to 50 MB of its own cache and a thread per core: neither helps here
sharp.cache(false);
sharp.concurrency(1);

const releases = new Map();
let queue = Promise.resolve();
let last = "";

export function onRelease(kind, fn) {
  releases.set(kind, fn);
}

const mb = (n) => Math.round(n / 1048576);
export function memoryNow() {
  const m = process.memoryUsage();
  return { rss_mb: mb(m.rss), heap_mb: mb(m.heapUsed), external_mb: mb(m.external + (m.arrayBuffers || 0)) };
}

export function heavy(kind, fn) {
  const run = queue.then(async () => {
    if (last && last !== kind && releases.has(last)) await Promise.resolve(releases.get(last)()).catch(() => {});
    last = kind;
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

// Everything heavy given back at once (a memory warning, or the end of a job that used several kinds).
export function releaseAll() {
  return heavy("", async () => {
    for (const fn of releases.values()) await Promise.resolve(fn()).catch(() => {});
  });
}

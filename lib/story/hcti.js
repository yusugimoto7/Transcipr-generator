// htmlcsstoimage.com: a real browser in the cloud, already used for the draws
// story card. Stories use it twice: to photograph source pages and to draw
// the story itself (Persian shaping and web fonts come out right only in a
// browser, and the server has none).

export function hctiEnabled() {
  return !!process.env.HCTI_USER_ID && !!process.env.HCTI_API_KEY;
}

// body: HCTI's image request (html/css/selector, or url). Returns the hosted
// PNG's URL, which stays up on HCTI.
export async function hctiImage(body, { timeoutMs = 90000 } = {}) {
  if (!hctiEnabled()) throw new Error("HCTI_USER_ID / HCTI_API_KEY are not set, so the story cannot be drawn");
  const auth = Buffer.from(`${process.env.HCTI_USER_ID}:${process.env.HCTI_API_KEY}`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(`HCTI ${res.status}: ${String(data.message || data.error || JSON.stringify(data)).slice(0, 200)}`);
    return data.url;
  } finally {
    clearTimeout(timer);
  }
}

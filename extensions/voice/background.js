// Sends a recording to the Topic Engine's speech route with the person's key. Done here, not in
// the page, because the extension's own request is not bound by the page's rules (Odoo's).
const DEFAULT_SERVER = "https://sugimoto-topic-engine.onrender.com";

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.type !== "transcribe") return;
  (async () => {
    const { server = DEFAULT_SERVER, key = "" } = await chrome.storage.sync.get(["server", "key"]);
    if (!key) return reply({ error: "no-key" });
    const bytes = Uint8Array.from(atob(msg.audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("audio", new Blob([bytes], { type: msg.mime || "audio/webm" }), "note." + (/mp4/.test(msg.mime) ? "m4a" : "webm"));
    try {
      const res = await fetch(server.replace(/\/+$/, "") + "/api/voice/ext", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form });
      const d = await res.json().catch(() => ({}));
      reply(res.ok ? { text: d.text || "" } : { error: d.error || "HTTP " + res.status });
    } catch (e) {
      reply({ error: String(e.message || e) });
    }
  })();
  return true;
});

// A microphone at the corner of the text box you are in, on any site (made for Odoo's "Log note"
// and "Send message"). Tap it, speak Farsi, English or both, tap again: the words are typed where
// the cursor was, as if typed by hand, so the page saves them like any typing.
(() => {
  if (window.__sugimotoVoice) return;
  window.__sugimotoVoice = true;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = "Voice typing (Farsi / English)";
  btn.setAttribute("aria-label", btn.title);
  Object.assign(btn.style, {
    position: "fixed", zIndex: 2147483647, width: "34px", height: "34px", borderRadius: "50%", border: "none",
    background: "#32515d", color: "#fff", display: "none", alignItems: "center", justifyContent: "center",
    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.25)", padding: "0", font: "600 11px system-ui",
  });
  const MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
  const STOP = '<svg width="14" height="14" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/></svg>';
  btn.innerHTML = MIC;
  document.documentElement.appendChild(btn);

  let field = null; // the box being typed in
  let saved = null; // where the cursor was: a Range for rich boxes, [start, end] for plain ones
  let rec = null;
  let chunks = [];
  let busy = false;

  const editable = (el) =>
    el && (el.isContentEditable || (el.tagName === "TEXTAREA" && !el.readOnly && !el.disabled) ||
      (el.tagName === "INPUT" && /^(text|search|email|url|)$/i.test(el.type || "") && !el.readOnly && !el.disabled));

  function place() {
    if (!field || !document.contains(field)) return hide();
    const r = field.getBoundingClientRect();
    if (!r.width || !r.height) return hide();
    btn.style.left = Math.max(4, r.right - 40) + "px";
    btn.style.top = Math.max(4, r.bottom - 40) + "px";
    btn.style.display = "flex";
  }
  function hide() {
    if (rec || busy) return;
    btn.style.display = "none";
  }
  function remember() {
    if (!field) return;
    if (field.isContentEditable) {
      const sel = window.getSelection();
      saved = sel && sel.rangeCount && field.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    } else saved = [field.selectionStart, field.selectionEnd];
  }

  document.addEventListener("focusin", (e) => {
    const el = e.target && e.target.closest ? e.target.closest("[contenteditable=''],[contenteditable='true'],textarea,input") || e.target : e.target;
    if (editable(el)) { field = el; place(); }
  }, true);
  document.addEventListener("focusout", () => setTimeout(() => { if (!rec && !busy && !editable(document.activeElement)) hide(); }, 200), true);
  for (const ev of ["keyup", "mouseup", "selectionchange"]) document.addEventListener(ev, () => { if (!rec && field && document.activeElement === field) remember(); }, true);
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  // Keep the focus in the box when the microphone is pressed.
  btn.addEventListener("mousedown", (e) => e.preventDefault());

  function insert(text) {
    if (!text || !field) return;
    field.focus();
    if (field.isContentEditable) {
      const sel = window.getSelection();
      if (saved) { sel.removeAllRanges(); sel.addRange(saved); }
    } else if (saved) field.setSelectionRange(saved[0], saved[1]);
    // As typing: the page's own editor (Odoo's) sees an ordinary input and keeps the text.
    const spaced = (/\S$/.test(beforeCursor()) ? " " : "") + text;
    if (!document.execCommand("insertText", false, spaced)) {
      if (field.isContentEditable) field.textContent += spaced;
      else field.value += spaced;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    remember();
  }
  function beforeCursor() {
    try {
      if (field.isContentEditable) {
        if (!saved) return "";
        const r = saved.cloneRange();
        r.setStart(field, 0);
        return r.toString();
      }
      return field.value.slice(0, saved ? saved[0] : field.value.length);
    } catch { return ""; }
  }

  function flash(msg) {
    btn.title = msg;
    btn.innerHTML = "!";
    btn.style.background = "#b42318";
    setTimeout(() => { btn.innerHTML = MIC; btn.style.background = "#32515d"; btn.title = "Voice typing (Farsi / English)"; }, 3500);
    console.warn("[Sugimoto voice]", msg);
  }

  async function start() {
    remember();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return flash("The microphone is blocked for this site: allow it in the address bar.");
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); send(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); rec = null; };
    rec.start();
    btn.innerHTML = STOP;
    btn.style.background = "#b42318";
  }

  async function send(blob) {
    busy = true;
    btn.innerHTML = "…";
    btn.style.background = "#5b6675";
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    chrome.runtime.sendMessage({ type: "transcribe", audio: btoa(bin), mime: blob.type }, (r) => {
      busy = false;
      btn.innerHTML = MIC;
      btn.style.background = "#32515d";
      if (!r) return flash("No answer from the extension; reload the page.");
      if (r.error === "no-key") return flash("Open the extension (puzzle icon → Sugimoto voice typing) and paste your key from the Topic Engine's Settings.");
      if (r.error) return flash(r.error);
      insert(r.text.trim());
      place();
    });
  }

  btn.addEventListener("click", () => {
    if (busy) return;
    if (rec) rec.stop();
    else start();
  });
})();

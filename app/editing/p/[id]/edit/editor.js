// The hand editor of Video Editing (Hamed, 29 Oct 2026: "like CapCut", benchmarked on his screen
// recording of CapCut: split, speed, dragging clips, overlays; phone and desktop). It edits a version
// under review the way CapCut does, over the version's 720p preview, and hands back a cut list in that
// version's own seconds: the pieces to keep, in order, each with its speed, and picture overlays. The
// worker in english-sugimotovisa (scripts/hand_edit.py) maps the list back to the original footage and
// renders the full-quality file from it, so nothing made here is ever a re-encode of the preview.
//
// Written as plain DOM code mounted by page.jsx: dragging a clip redraws positions on every pointer
// move, and React re-renders in that path made dragging stutter on a phone in the prototype.

const FPS = 30, MIN = 0.1, OVMIN = 0.3, TW = 34, SNAP = 8;
const ANCH = [0.1, 1, 2, 5, 10, 100]; // CapCut's speed scale: equal spacing between these
const MAX_OVERLAYS = 10, OV_PX = 1600;

const ICON = {
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  split: '<path d="M9 3v18M15 3v18"/><path d="M4 8h3M4 16h3M17 8h3M17 16h3"/>',
  speed: '<path d="M12 20a8 8 0 1 1 8-8"/><path d="m12 12 4-4"/><circle cx="12" cy="12" r="1.2"/>',
  overlay: '<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="11" width="7" height="6" rx="1"/>',
  add: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 8.5v7M8.5 12h7"/>',
  del: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  tin: '<path d="M5 4v16"/><path d="m13 8-4 4 4 4"/><path d="M9 12h11"/>',
  tout: '<path d="M19 4v16"/><path d="m11 8 4 4-4 4"/><path d="M15 12H4"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  back2: '<path d="m12 6-6 6 6 6M18 6l-6 6 6 6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  prevf: '<path d="M15 6 9 12l6 6"/><path d="M6 6v12"/>',
  nextf: '<path d="m9 6 6 6-6 6"/><path d="M18 6v12"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h2"/>',
};
const svg = (k, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const SCALE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
const esc = (x) => String(x).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

// opts: { src, title, version, t(fa, en), rtl, onSave({ pieces, overlays }) -> Promise, onClose() }
export function mountEditor(host, opts) {
  const t = opts.t;
  host.innerHTML = `<div class="he"><div id="he-app">
  <header>
    <button class="icon" id="he-close" aria-label="${t("بستن ویرایشگر", "Close the editor")}">${svg("close", 2)}</button>
    <span class="title" id="he-title">${esc(opts.title || "")}</span>
    <span class="spacer"></span>
    <button class="pill ghost" id="he-list">${t("لیست برش", "Cut list")}</button>
    <button class="pill primary" id="he-done">${t("ساخت نسخه", "Make version")}</button>
  </header>
  <div id="he-stage">
    <video id="he-v" playsinline webkit-playsinline preload="auto"></video>
    <div id="he-frame"><i class="guide" id="he-gv"></i><i class="guide" id="he-gh"></i></div>
    <div id="he-empty">${t("در حال باز کردن پیش‌نمایش…", "Opening the preview…")}</div>
  </div>
  <div id="he-transport">
    <div class="tc" id="he-tc">00:00 <span>/ 00:00</span></div>
    <button class="icon" id="he-prevf" aria-label="${t("یک فریم عقب", "Back one frame")}">${svg("prevf", 2)}</button>
    <button class="icon play" id="he-play" aria-label="${t("پخش", "Play")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path id="he-playPath" d="M7 4.5v15l13-7.5z"/></svg></button>
    <button class="icon" id="he-nextf" aria-label="${t("یک فریم جلو", "Forward one frame")}">${svg("nextf", 2)}</button>
    <span class="spacer"></span>
    <button class="icon" id="he-undo" aria-label="${t("برگرداندن", "Undo")}" disabled>${svg("undo", 2)}</button>
    <button class="icon" id="he-redo" aria-label="${t("دوباره", "Redo")}" disabled>${svg("redo", 2)}</button>
  </div>
  <div id="he-tl">
    <div id="he-scroller"><div id="he-content"><div id="he-ruler"></div><div id="he-lane"></div><div id="he-olane"></div></div></div>
    <button id="he-addRow">${svg("plus", 2)}${t("افزودن تصویر روی ویدیو", "Add overlay")}</button>
    <div id="he-reorder" hidden></div>
    <div id="he-playhead"></div>
  </div>
  <nav id="he-tools"></nav>
  <aside id="he-panel" dir="${opts.rtl ? "rtl" : "ltr"}" aria-label="${t("جزئیات", "Inspector")}"></aside>
</div>
<input type="file" id="he-ofile" accept="image/*" hidden>
<div id="he-toast" role="status" dir="auto"></div>
<div id="he-sheet" dir="${opts.rtl ? "rtl" : "ltr"}" hidden></div></div>`;

  const $ = (id) => host.querySelector("#he-" + id);
  const v = $("v"), app = $("app"), sc = $("scroller"), content = $("content"), lane = $("lane"), olane = $("olane"),
    ruler = $("ruler"), tlEl = $("tl"), frame = $("frame"), panel = $("panel"), rl = $("reorder"), stage = $("stage");
  const desk = matchMedia("(min-width:900px) and (min-height:560px)");
  const geo = () => (desk.matches ? { top: 32, th: 68, row: 42, oh: 34 } : { top: 30, th: 58, row: 38, oh: 30 });

  // every listener on window, document or the media query goes through on(), so unmounting removes them
  const offs = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); offs.push(() => target.removeEventListener(type, fn, o)); };

  let dur = 0, segs = [], ovs = [], imgs = {}, sel = null, bar = "root", panelOpen = null, saving = false, dead = false;
  let pps = 50, playing = false, pad = 0, lastSet = -1, nextId = 1;
  let past = [], future = [], thumbs = [], thumbStep = 1, gesture = null, quietClick = 0, frameW = 1, frameH = 1;
  let tnow = 0; // the playhead, in seconds of the edited timeline

  /* ---------- model: kept pieces of the version, in timeline order; overlays on their own track ---------- */
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const len = (s) => (s.out - s.in) / s.speed;
  const total = () => segs.reduce((a, s) => a + len(s), 0);
  const startOf = (i) => { let a = 0; for (let k = 0; k < i; k++) a += len(segs[k]); return a; };
  const segIdx = (id) => segs.findIndex((s) => s.id === id);
  const selSeg = () => (sel && sel.k === "seg" ? segs.find((s) => s.id === sel.id) : null);
  const selOv = () => (sel && sel.k === "ov" ? ovs.find((o) => o.id === sel.id) : null);
  function locate(time) {
    let a = 0;
    for (let i = 0; i < segs.length; i++) {
      const L = len(segs[i]);
      if (time < a + L - 1e-6 || i === segs.length - 1) return { i, s: segs[i], src: segs[i].in + clamp(time - a, 0, L) * segs[i].speed };
      a += L;
    }
    return null;
  }
  // pictures stay out of the history (imgs): a snapshot per edit would copy every picture each time
  const snap = () => JSON.stringify({ segs, ovs });
  function commit(before) { if (before === snap()) return; past.push(before); if (past.length > 150) past.shift(); future = []; refreshUndo(); }
  function refreshUndo() { $("undo").disabled = !past.length; $("redo").disabled = !future.length; }
  function restore(j) {
    const o = JSON.parse(j); segs = o.segs; ovs = o.ovs;
    if (sel && !(sel.k === "seg" ? segs : ovs).some((x) => x.id === sel.id)) sel = null;
    tnow = Math.min(tnow, total()); refreshUndo(); render(); seekVideo();
  }
  function undo() { if (!past.length || gesture) return; future.push(snap()); restore(past.pop()); }
  function redo() { if (!future.length || gesture) return; past.push(snap()); restore(future.pop()); }
  $("undo").onclick = undo; $("redo").onclick = redo;

  /* ---------- formatting ---------- */
  const mmss = (x) => { x = Math.max(0, x); const m = Math.floor(x / 60), s = Math.floor(x % 60); return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"); };
  const exact = (x) => { const m = Math.floor(x / 60), s = x - m * 60; return m + ":" + s.toFixed(3).padStart(6, "0"); };
  const fmtX = (x) => (x < 10 ? x.toFixed(1) : Math.round(x)) + "x";
  let toastT;
  function toast(msg) { const el = $("toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2200); }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  /* ---------- layout and drawing ---------- */
  function ovRows() {
    // overlays that overlap in time go on separate rows, as CapCut stacks them
    const ends = [], map = {};
    [...ovs].sort((a, b) => a.start - b.start).forEach((o) => { let r = 0; while (ends[r] !== undefined && ends[r] > o.start + 1e-6) r++; ends[r] = o.start + o.len; map[o.id] = r; });
    return { map, n: ends.length };
  }
  function layout() {
    const g = geo(), rows = ovRows();
    pad = sc.clientWidth / 2;
    const T = total(), W = Math.max(T, ...ovs.map((o) => o.start + o.len)) * pps;
    content.style.width = W + pad * 2 + "px";
    for (const el of [lane, ruler, olane]) el.style.left = pad + "px";
    lane.style.width = T * pps + "px"; ruler.style.width = olane.style.width = W + "px";
    lane.style.top = rl.style.top = g.top + "px"; lane.style.height = rl.style.height = g.th + "px";
    const otop = g.top + g.th + 10;
    olane.style.top = otop + "px";
    const addTop = otop + rows.n * g.row;
    $("addRow").style.top = addTop + "px";
    const compact = panelOpen && !desk.matches; // phone with a panel open: only the main track, as in CapCut
    $("addRow").hidden = compact;
    const h = compact ? g.top + g.th + 12 : Math.max(desk.matches ? 232 : 184, addTop + 30 + 12);
    if (app.style.getPropertyValue("--tlh") !== h + "px") app.style.setProperty("--tlh", h + "px");
    return rows;
  }
  function renderRuler() {
    const W = parseFloat(ruler.style.width) / pps, step = pps >= 70 ? 1 : pps >= 30 ? 2 : pps >= 12 ? 5 : pps >= 5 ? 10 : 30;
    let h = "";
    for (let s = 0; s <= W + 1e-6; s += step) {
      h += `<span class="tick" style="left:${s * pps}px">${mmss(s)}</span>`;
      if (s + step / 2 <= W) h += `<span class="dot" style="left:${(s + step / 2) * pps}px"></span>`;
    }
    ruler.innerHTML = h;
  }
  const thumbAt = (src) => thumbs[clamp(Math.round(src / thumbStep), 0, Math.max(0, thumbs.length - 1))];
  function tilesFor(s, w) {
    const n = Math.min(400, Math.max(1, Math.ceil(w / TW))); let h = "";
    for (let k = 0; k < n; k++) {
      const img = thumbAt(s.in + (((k + 0.5) * TW) / pps) * s.speed);
      h += `<i style="width:${TW}px${img ? `;background-image:url(${img})` : ""}"></i>`;
    }
    return h;
  }
  const isSel = (k, id) => !!sel && sel.k === k && sel.id === id;
  function renderLane() {
    let h = "", a = 0;
    segs.forEach((s, i) => {
      const w = len(s) * pps;
      h += `<div class="seg${isSel("seg", s.id) ? " sel" : ""}" data-id="${s.id}" style="left:${a * pps}px;width:${w}px">`
        + `<div class="tiles">${tilesFor(s, w)}</div><span class="badge">${len(s).toFixed(1)}s</span>`
        + (s.speed !== 1 ? `<span class="spd">${fmtX(s.speed)}</span>` : "")
        + `<div class="handle l" data-h="l"></div><div class="handle r" data-h="r"></div></div>`;
      if (i > 0) h += `<i class="join" style="left:${a * pps}px"></i>`;
      a += len(s);
    });
    lane.innerHTML = h;
  }
  function renderOvLane(rows) {
    const g = geo();
    olane.innerHTML = ovs.map((o) => `<div class="oclip${isSel("ov", o.id) ? " sel" : ""}" data-id="${o.id}" style="left:${o.start * pps}px;width:${o.len * pps}px;top:${rows.map[o.id] * g.row}px;height:${g.oh}px;background-image:url(${imgs[o.img]})">`
      + `<span class="badge">${o.len.toFixed(1)}s</span><div class="handle l" data-h="l"></div><div class="handle r" data-h="r"></div></div>`).join("");
  }
  function fitFrame() {
    const sw = stage.clientWidth, sh = stage.clientHeight, vw = v.videoWidth || 9, vh = v.videoHeight || 16, k = Math.min(sw / vw, sh / vh);
    frameW = vw * k; frameH = vh * k;
    Object.assign(frame.style, { left: (sw - frameW) / 2 + "px", top: (sh - frameH) / 2 + "px", width: frameW + "px", height: frameH + "px" });
    ovs.forEach((o) => placeOv(o));
  }
  function renderFrame() {
    frame.querySelectorAll(".ov").forEach((e) => e.remove());
    ovs.forEach((o) => {
      const d = document.createElement("div"), on_ = isSel("ov", o.id);
      d.className = "ov" + (on_ ? " sel" : ""); d.dataset.id = o.id;
      d.innerHTML = `<img src="${imgs[o.img]}" alt="" draggable="false">`
        + (on_ ? `<button class="ox" aria-label="${t("حذف تصویر", "Delete overlay")}">×</button><span class="osc" role="img" aria-label="${t("تغییر اندازه", "Resize")}">${SCALE_ICON}</span>` : "");
      frame.appendChild(d); placeOv(o, d);
    });
    showOvs();
  }
  function placeOv(o, d) {
    d = d || frame.querySelector(`.ov[data-id="${o.id}"]`); if (!d) return;
    const w = o.w * frameW, h = w * o.ar;
    Object.assign(d.style, { left: o.x * frameW - w / 2 + "px", top: o.y * frameH - h / 2 + "px", width: w + "px", height: h + "px" });
  }
  function showOvs() {
    frame.querySelectorAll(".ov").forEach((d) => { const o = ovs.find((x) => x.id === +d.dataset.id); d.hidden = !(o && tnow >= o.start - 1e-6 && tnow < o.start + o.len); });
  }
  function render() {
    if (dead || (gesture && gesture.type !== "pan")) return; // a gesture owns the timeline until it ends
    app.classList.toggle("panelOpen", !!panelOpen && !desk.matches);
    const rows = layout(); fitFrame(); renderRuler(); renderLane(); renderOvLane(rows); renderFrame();
    renderTools(); renderPanel(); setScroll(tnow * pps); updateTC();
  }
  // light update while something is being dragged: positions only, the dragged piece's filmstrip redrawn
  function relayout(changedId) {
    layout(); renderRuler();
    let a = 0;
    segs.forEach((s) => {
      const el = lane.querySelector(`.seg[data-id="${s.id}"]`), w = len(s) * pps;
      if (el) {
        el.style.left = a * pps + "px"; el.style.width = w + "px";
        el.querySelector(".badge").textContent = len(s).toFixed(1) + "s";
        const sp = el.querySelector(".spd"); if (sp) sp.textContent = fmtX(s.speed);
        if (s.id === changedId) el.querySelector(".tiles").innerHTML = tilesFor(s, w);
      }
      a += len(s);
    });
    const joins = lane.querySelectorAll(".join"); let b = 0;
    segs.forEach((s, i) => { if (i > 0 && joins[i - 1]) joins[i - 1].style.left = b * pps + "px"; b += len(s); });
  }
  function updateTC() {
    $("tc").innerHTML = `${mmss(tnow)} <span>/ ${mmss(total())}</span>`;
    showOvs();
    const sp = $("tools").querySelector('[data-a="split"]'); if (sp) sp.disabled = !canSplit();
  }

  /* ---------- tool bar: changes with the selection, as in CapCut ---------- */
  const tool = (a, label, icon, cls) => `<button class="tool${cls ? " " + cls : ""}" data-a="${a}">${svg(icon)}${label}</button>`;
  const back = (a, icon) => `<button class="tool back" data-a="${a}" aria-label="${t("برگشت", "Back")}">${svg(icon || "back")}</button>`;
  function canSplit() {
    const L = locate(tnow); if (!L) return false;
    const o = selOv();
    if (o) return tnow - o.start >= OVMIN && o.start + o.len - tnow >= OVMIN;
    const s = selSeg(); if (s && L.s.id !== s.id) return false;
    return (L.src - L.s.in) / L.s.speed >= MIN && (L.s.out - L.src) / L.s.speed >= MIN;
  }
  function renderTools() {
    const T = {
      split: t("برش", "Split"), speed: t("سرعت", "Speed"), tin: t("کوتاه از اول", "Trim start"), tout: t("کوتاه از آخر", "Trim end"),
      del: t("حذف", "Delete"), oadd: t("افزودن تصویر", "Add overlay"), edit: t("ویرایش", "Edit"), overlay: t("تصویر روی ویدیو", "Overlay"), list: t("لیست برش", "Cut list"),
    };
    let h;
    if (selSeg()) h = back("back") + tool("split", T.split, "split") + tool("speed", T.speed, "speed") + tool("tin", T.tin, "tin") + tool("tout", T.tout, "tout") + tool("del", T.del, "del", "danger");
    else if (selOv()) h = back("oback", "back2") + tool("oadd", T.oadd, "add") + tool("split", T.split, "split") + tool("odel", T.del, "del", "danger");
    else if (bar === "overlay") h = back("root", "back2") + tool("oadd", T.oadd, "add");
    else h = tool("edit", T.edit, "edit") + tool("split", T.split, "split") + tool("speed", T.speed, "speed") + tool("overlay", T.overlay, "overlay") + tool("list", T.list, "list");
    $("tools").innerHTML = h;
  }
  const ACTIONS = {
    edit() { const L = locate(tnow); if (L) select({ k: "seg", id: L.s.id }); },
    split() { selOv() ? splitOv() : split(); },
    speed() { const L = locate(tnow); if (!selSeg() && L) sel = { k: "seg", id: L.s.id }; if (!desk.matches) panelOpen = "speed"; render(); },
    overlay() { bar = "overlay"; render(); },
    oadd() { if (ovs.length >= MAX_OVERLAYS) return toast(t(`حداکثر ${MAX_OVERLAYS} تصویر`, `At most ${MAX_OVERLAYS} overlays`)); $("ofile").click(); },
    odel() { delOv(); },
    del() { del(); },
    tin() { trimTo("in"); }, tout() { trimTo("out"); },
    back() { select(null); }, oback() { sel = null; bar = "overlay"; render(); }, root() { bar = "root"; render(); },
    list() { showList(false); },
    spok() { panelOpen = null; render(); },
    centre() { const o = selOv(); if (!o) return; const b = snap(); o.x = o.y = 0.5; commit(b); render(); },
  };
  function onAction(e) { const b = e.target.closest("button[data-a]"); if (b && !b.disabled && ACTIONS[b.dataset.a]) ACTIONS[b.dataset.a](); }
  $("tools").addEventListener("click", onAction);
  panel.addEventListener("click", onAction);

  /* ---------- inspector (desktop, always shown) and the speed panel (phone, opened from Speed) ---------- */
  const x2pos = (x) => { let k = 0; while (k < 4 && x > ANCH[k + 1]) k++; return (k + (x - ANCH[k]) / (ANCH[k + 1] - ANCH[k])) / 5; };
  function pos2x(p) { const k = Math.min(4, Math.floor(p * 5)), f = p * 5 - k, x = ANCH[k] + (ANCH[k + 1] - ANCH[k]) * f; return x < 10 ? Math.max(0.1, Math.round(x * 10) / 10) : Math.round(x); }
  const at = (p) => `calc(11px + ${p} * (100% - 22px))`;
  function speedHTML(s, sheet) {
    return `<div class="speed" dir="ltr"><div class="sph"><label class="chk"><input type="checkbox" id="he-spPitch"${s.pitch ? " checked" : ""}>${t("تغییر زیر و بمی صدا", "Change audio pitch")}</label>`
      + (sheet ? `<b>${t("سرعت", "Speed")}</b><button class="icon" data-a="spok" aria-label="${t("تمام", "Done")}">${svg("ok")}</button>` : "") + `</div>`
      + `<div class="spdur" id="he-spDur" dir="${opts.rtl ? "rtl" : "ltr"}"></div>`
      + `<div class="spsl"><span class="bubble" id="he-spBub"></span><div class="ticks"></div>`
      + `<input type="range" id="he-spR" min="0" max="1000" step="1" value="${Math.round(x2pos(s.speed) * 1000)}" aria-label="${t("سرعت", "Speed")}">`
      + `<div class="lbl">${ANCH.map((a, k) => `<span style="left:${at(k / 5)}">${a}x</span>`).join("")}</div></div>`
      + (desk.matches ? `<p class="spnote">${t("پیش‌نمایش حداکثر ۱۶ برابر پخش می‌شه؛ فایل نهایی با همین سرعتی که انتخاب کردی ساخته می‌شه.", "The preview plays at most 16x; the final file is made at the exact speed.")}</p>` : "") + `</div>`;
  }
  function bindSpeed(s) {
    const r = $("spR"); if (!r) return;
    let before = null, src0 = null;
    const show = () => {
      $("spDur").innerHTML = `${t("مدت", "Duration")}: <span dir="ltr">${(s.out - s.in).toFixed(1)}s <span class="arr">→</span> <b>${len(s).toFixed(1)}s</b></span>`;
      const b = $("spBub"); b.textContent = fmtX(s.speed); b.style.left = at(x2pos(s.speed));
      r.setAttribute("aria-valuetext", fmtX(s.speed));
    };
    show();
    r.addEventListener("input", () => {
      if (before === null) { before = snap(); pause(); const L = locate(tnow); src0 = L && L.s.id === s.id ? L.src : null; }
      s.speed = pos2x(r.value / 1000);
      tnow = src0 !== null ? startOf(segIdx(s.id)) + (src0 - s.in) / s.speed : Math.min(tnow, total());
      relayout(s.id); setScroll(tnow * pps); updateTC(); show();
    });
    r.addEventListener("change", () => { if (before !== null) { commit(before); before = null; render(); } });
    $("spPitch").onchange = (e) => { const b = snap(); s.pitch = e.target.checked; commit(b); };
  }
  function renderPanel() {
    const s = selSeg(), o = selOv();
    if (!desk.matches) {
      if (panelOpen === "speed" && s) { panel.classList.add("open"); panel.innerHTML = speedHTML(s, true); bindSpeed(s); }
      else { panelOpen = null; app.classList.remove("panelOpen"); panel.classList.remove("open"); panel.innerHTML = ""; }
      return;
    }
    panel.classList.add("open");
    if (s) {
      const i = segIdx(s.id);
      panel.innerHTML = `<h3>${t(`تکهٔ ${i + 1} از ${segs.length}`, `Clip ${i + 1} of ${segs.length}`)}</h3><dl>`
        + `<dt>${t("شروع در نسخه", "In the version from")}</dt><dd>${exact(s.in)}</dd><dt>${t("تا", "to")}</dt><dd>${exact(s.out)}</dd>`
        + `<dt>${t("روی خط زمان", "On the timeline")}</dt><dd>${exact(startOf(i))} – ${exact(startOf(i) + len(s))}</dd></dl>`
        + speedHTML(s, false)
        + `<div class="prow"><button class="pill ghost" data-a="split">${t("برش", "Split")}</button><button class="pill danger" data-a="del">${t("حذف", "Delete")}</button></div>`;
      bindSpeed(s);
    } else if (o) {
      panel.innerHTML = `<h3>${t("تصویر روی ویدیو", "Overlay")}</h3><dl><dt>${t("فایل", "File")}</dt><dd>${esc(o.name)}</dd>`
        + `<dt>${t("نمایش", "Shows")}</dt><dd>${exact(o.start)} – ${exact(o.start + o.len)}</dd>`
        + `<dt>${t("جا", "Position")}</dt><dd>${Math.round(o.x * 100)}%, ${Math.round(o.y * 100)}%</dd></dl>`
        + `<label class="hint" for="he-ovSize">${t("اندازه", "Size")}: <b id="he-ovSizeV">${Math.round(o.w * 100)}%</b> ${t("از عرض تصویر", "of the frame width")}</label>`
        + `<input class="range" dir="ltr" type="range" id="he-ovSize" min="5" max="150" value="${Math.round(o.w * 100)}">`
        + `<p class="hint">${t("روی پیش‌نمایش بکشش تا جابه‌جا بشه؛ دستگیرهٔ گوشه اندازه‌ش رو عوض می‌کنه. روی خط‌های وسط می‌چسبه.", "Drag it on the preview to move it; the corner handle resizes it. It snaps to the centre lines.")}</p>`
        + `<div class="prow"><button class="pill ghost" data-a="centre">${t("وسط", "Centre")}</button><button class="pill danger" data-a="odel">${t("حذف", "Delete")}</button></div>`;
      let before = null;
      $("ovSize").addEventListener("input", (e) => { if (before === null) before = snap(); o.w = e.target.value / 100; placeOv(o); $("ovSizeV").textContent = e.target.value + "%"; });
      $("ovSize").addEventListener("change", () => { if (before !== null) { commit(before); before = null; } });
    } else {
      const removed = dur - segs.reduce((a, s) => a + s.out - s.in, 0);
      panel.innerHTML = `<h3>${esc(opts.title || "")}</h3><dl><dt>${t("تکه‌ها", "Pieces")}</dt><dd>${segs.length}</dd><dt>${t("مدت", "Length")}</dt><dd>${exact(total())}</dd>`
        + `<dt>${t("حذف‌شده", "Removed")}</dt><dd>${Math.max(0, removed).toFixed(1)} s</dd><dt>${t("تصویرها", "Overlays")}</dt><dd>${ovs.length}</dd></dl>`
        + `<p class="hint">${t("روی یک تکه بزن تا انتخاب بشه. تکه رو بکش تا جابه‌جا بشه؛ لبه‌های سفیدش رو بکش تا کوتاه بشه. خط زمان خالی یا خط‌کش رو بکش تا جلو و عقب بری.", "Click a clip to select it. Drag a clip to move it; drag its white edges to trim. Drag the empty timeline or the ruler to scrub.")}</p>`
        + `<p class="hint">${t("این ویرایشگر روی همین نسخه کار می‌کنه: چیزی که برش اتوماتیک حذف کرده اینجا نیست.", "The editor works on this version: what the automatic cut removed is not here.")}</p>`
        + `<div class="keys"><kbd>Space</kbd><span>${t("پخش / توقف", "Play / pause")}</span><kbd>S</kbd><span>${t("برش در جای خط پخش", "Split at the playhead")}</span>`
        + `<kbd>Delete</kbd><span>${t("حذف انتخاب‌شده", "Delete the selection")}</span><kbd>← →</kbd><span>${t("یک فریم (با Shift یک ثانیه)", "One frame (Shift: one second)")}</span>`
        + `<kbd>⌘Z / Ctrl+Z</kbd><span>${t("برگرداندن (با Shift دوباره)", "Undo (Shift: redo)")}</span><kbd>+ −</kbd><span>${t("بزرگ و کوچک کردن خط زمان", "Zoom the timeline")}</span><kbd>Esc</kbd><span>${t("لغو انتخاب", "Deselect")}</span></div>`;
    }
  }

  /* ---------- edits ---------- */
  function select(s) { sel = s; if (!s || s.k !== "seg") panelOpen = null; if (s && s.k === "ov") bar = "overlay"; if (!s && bar !== "overlay") bar = "root"; render(); }
  function split() {
    pause(); const L = locate(tnow); if (!L || !canSplit()) { toast(t("خط پخش رو از لبهٔ تکه دور کن", "Move the playhead away from the clip edge")); return; }
    const { i, s, src } = L, b = snap();
    segs.splice(i, 1, { ...s, id: nextId++, out: src }, { ...s, id: nextId++, in: src });
    sel = { k: "seg", id: segs[i + 1].id }; commit(b); render(); toast(t("برش خورد", "Split"));
  }
  function del() {
    const s = selSeg(); if (!s) return;
    if (segs.length === 1) { toast(t("این آخرین تکه‌ست؛ کوتاهش کن", "This is the last piece; trim it instead")); return; }
    const i = segIdx(s.id), b = snap(), a = startOf(i);
    segs.splice(i, 1); sel = null; panelOpen = null; commit(b);
    tnow = Math.min(a, Math.max(0, total() - 1 / FPS)); render(); seekVideo(); toast(t("حذف شد", "Deleted"));
  }
  function trimTo(edge) {
    const s = selSeg(); if (!s) return; const i = segIdx(s.id), L = locate(tnow);
    if (!L || L.s.id !== s.id) { toast(t("خط پخش رو داخل تکهٔ انتخاب‌شده بذار", "Put the playhead inside the selected clip")); return; }
    const b = snap();
    if (edge === "in") { if (s.out - L.src < MIN) return; s.in = L.src; tnow = startOf(i); }
    else { if (L.src - s.in < MIN) return; s.out = L.src; tnow = startOf(i) + len(s) - 1 / FPS; }
    commit(b); render(); seekVideo();
  }
  function splitOv() {
    const o = selOv(); if (!o || !canSplit()) { toast(t("خط پخش رو داخل تصویر بذار", "Move the playhead inside the overlay")); return; }
    const b = snap(), cut = tnow - o.start, o2 = { ...o, id: nextId++, start: tnow, len: o.len - cut };
    o.len = cut; ovs.push(o2); sel = { k: "ov", id: o2.id }; commit(b); render(); toast(t("برش خورد", "Split"));
  }
  function delOv() {
    const o = selOv(); if (!o) return; const b = snap();
    ovs = ovs.filter((x) => x.id !== o.id); sel = null; commit(b); render(); toast(t("تصویر حذف شد", "Overlay deleted"));
  }
  // a picture is shrunk on the device to at most 1600 px (PNG keeps its transparency) before it is kept
  function readPicture(f) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        const k = Math.min(1, OV_PX / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const png = /png|gif|webp/.test(f.type);
        res({ data: c.toDataURL(png ? "image/png" : "image/jpeg", 0.9), ar: c.height / c.width });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("bad picture")); };
      img.src = url;
    });
  }
  $("ofile").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const p = await readPicture(f), key = "i" + nextId++;
      imgs[key] = p.data;
      const b = snap(), start = tnow >= total() - OVMIN ? 0 : tnow;
      const o = { id: nextId++, img: key, name: f.name.slice(0, 80), ar: p.ar, start, len: Math.max(OVMIN, Math.min(3, total() - start)), x: 0.5, y: 0.62, w: 0.7 };
      ovs.push(o); sel = { k: "ov", id: o.id }; bar = "overlay"; commit(b); render(); toast(t("تصویر اضافه شد", "Overlay added"));
    } catch (err) { toast(t("این تصویر اینجا باز نمی‌شه", "This picture can't be opened here")); }
  };
  $("addRow").onclick = () => ACTIONS.oadd();

  /* ---------- timeline: scroll = scrub ---------- */
  function setScroll(x) { lastSet = Math.round(x); sc.scrollLeft = x; }
  let scrubRAF = 0;
  sc.addEventListener("scroll", () => {
    if (Math.abs(sc.scrollLeft - lastSet) <= 1) return;
    if (gesture && gesture.type !== "pan") return;
    if (playing) pause();
    tnow = clamp(sc.scrollLeft / pps, 0, total()); updateTC();
    if (!scrubRAF) scrubRAF = requestAnimationFrame(() => { scrubRAF = 0; seekVideo(); });
  }, { passive: true });

  // taps select; a long press (or a mouse drag) moves; handles trim
  tlEl.addEventListener("click", (e) => {
    if (Date.now() - quietClick < 400 || e.target.closest(".handle,#he-addRow")) return;
    const seg = e.target.closest(".seg"), oc = e.target.closest(".oclip");
    if (seg) return select(isSel("seg", +seg.dataset.id) ? null : { k: "seg", id: +seg.dataset.id });
    if (oc) return select(isSel("ov", +oc.dataset.id) ? null : { k: "ov", id: +oc.dataset.id });
    if (e.target.closest("#he-ruler")) return;
    if (sel) select(null);
  });
  tlEl.addEventListener("contextmenu", (e) => e.preventDefault());
  // once a drag has started the page must not scroll under the finger
  on(document, "touchmove", (e) => { if (gesture && gesture.type !== "pan") e.preventDefault(); }, { passive: false });

  function press(e, begin) {
    // touch: hold still 300 ms, then the drag starts (moving earlier is a normal scroll); mouse: starts after 4 px
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== "mouse";
    let timer = 0, done = false;
    const stop = () => { clearTimeout(timer); removeEventListener("pointermove", mv); removeEventListener("pointerup", stop); removeEventListener("pointercancel", stop); };
    const go = (x, y) => { if (done || dead) return; done = true; stop(); begin(x, y, id); };
    const mv = (ev) => { if (ev.pointerId !== id) return; const d = Math.hypot(ev.clientX - x0, ev.clientY - y0); if (touch) { if (d > 10) stop(); } else if (d > 4) go(ev.clientX, ev.clientY); };
    addEventListener("pointermove", mv); addEventListener("pointerup", stop); addEventListener("pointercancel", stop);
    if (touch) timer = setTimeout(() => go(x0, y0), 300);
  }
  const laneX = (cx) => cx - sc.getBoundingClientRect().left + sc.scrollLeft - pad; // timeline px under a screen x
  const playheadX = () => sc.scrollLeft; // timeline px under the playhead
  function snapX(x, extra) {
    // snap an edge to the playhead or a clip boundary, with a tick on phones
    for (const p of [playheadX(), ...(extra || [])]) if (Math.abs(x - p) < SNAP) { if (gesture && gesture.snapped !== p) { gesture.snapped = p; buzz(8); } return p; }
    if (gesture) gesture.snapped = null;
    return x;
  }
  const boundaries = () => { const b = [0]; let a = 0; segs.forEach((s) => { a += len(s); b.push(a * pps); }); return b; };

  tlEl.addEventListener("pointerdown", (e) => {
    if (gesture || pinch) return;
    const h = e.target.closest(".handle");
    if (h) { e.preventDefault(); e.stopPropagation(); return h.closest(".oclip") ? startOvTrim(e, h) : startTrim(e, h); }
    const seg = e.target.closest(".seg"), oc = e.target.closest(".oclip");
    if (seg && segs.length > 1) return press(e, (x, y, id) => startReorder(segIdx(+seg.dataset.id), x, id));
    if (oc) return press(e, (x, y, id) => startOvMove(+oc.dataset.id, x, id));
    if (e.pointerType === "mouse" && e.button === 0 && !e.target.closest("#he-addRow")) {
      // desktop: grab the timeline to scrub; a click on the ruler jumps there
      if (e.target.closest("#he-ruler")) { pause(); tnow = clamp(laneX(e.clientX) / pps, 0, total()); setScroll(tnow * pps); updateTC(); seekVideo(); }
      const x0 = e.clientX, s0 = sc.scrollLeft;
      gesture = { type: "pan", pid: e.pointerId, x: e.clientX, move(cx) { sc.scrollLeft = s0 - (cx - x0); }, end() {} };
    }
  });
  on(window, "pointermove", (e) => { if (gesture && gesture.pid === e.pointerId) { gesture.x = e.clientX; gesture.move(e.clientX); } });
  function endGesture(e) {
    if (!gesture || gesture.pid !== e.pointerId) return;
    const g = gesture; g.active = false;
    if (g.type !== "pan") quietClick = Date.now();
    g.end();
    if (gesture === g) gesture = null;
  }
  on(window, "pointerup", endGesture); on(window, "pointercancel", endGesture);

  // near the timeline's edges the view scrolls by itself while dragging, faster the closer the finger is
  function edgeTick() {
    const g = gesture; if (!g || !g.active || dead) return;
    const r = tlEl.getBoundingClientRect(), E = 48, inL = g.x < r.left + E, inR = g.x > r.right - E;
    // a drag that starts inside an edge zone (a handle at the screen edge) scrolls only once the finger has left it and come back
    if (g.armL === undefined) { g.armL = !inL; g.armR = !inR; }
    if (!inL) g.armL = true;
    if (!inR) g.armR = true;
    let d = 0;
    if (inL && g.armL) d = -Math.ceil((r.left + E - g.x) / 3);
    else if (inR && g.armR) d = Math.ceil((g.x - (r.right - E)) / 3);
    if (d) g.scroll(d);
    requestAnimationFrame(edgeTick);
  }

  /* trim a clip by its white edges; the right edge pushes the clips after it live (ripple) */
  function startTrim(e, h) {
    pause();
    const el = h.closest(".seg"), i = segIdx(+el.dataset.id), s = segs[i];
    gesture = { type: "trim", pid: e.pointerId, x: e.clientX, active: true, edge: h.dataset.h, el, s, in0: s.in, out0: s.out,
      left0: startOf(i) * pps, x0: laneX(e.clientX), before: snap(),
      scroll(d) { setScroll(sc.scrollLeft + d); this.move(this.x); },
      move: moveTrim, end: endTrim };
    edgeTick();
  }
  function moveTrim(cx) {
    const g = gesture, s = g.s, dx = laneX(cx) - g.x0;
    if (g.edge === "r") {
      const end = snapX(g.left0 + ((g.out0 - g.in0) / s.speed) * pps + dx);
      s.out = clamp(g.in0 + ((end - g.left0) / pps) * s.speed, s.in + MIN * s.speed, dur);
      relayout(s.id); seekTo(Math.max(s.in, s.out - 1 / FPS));
    } else {
      // the clip's right end stays put while its start follows the finger; the gap closes on release
      const st = snapX(g.left0 + dx);
      s.in = clamp(g.in0 + ((st - g.left0) / pps) * s.speed, 0, s.out - MIN * s.speed);
      const w = len(s) * pps;
      g.el.style.left = g.left0 + ((s.in - g.in0) / s.speed) * pps + "px"; g.el.style.width = w + "px";
      g.el.querySelector(".tiles").innerHTML = tilesFor(s, w);
      g.el.querySelector(".badge").textContent = len(s).toFixed(1) + "s";
      seekTo(s.in);
    }
  }
  function endTrim() {
    const g = gesture, s = g.s;
    let x = tnow * pps;
    // closing the gap pulls everything before the clip right, so the trimmed clip stays where it is on screen
    if (g.edge === "l") x = sc.scrollLeft - ((s.in - g.in0) / s.speed) * pps;
    gesture = null; commit(g.before);
    tnow = clamp(x / pps, 0, total()); render(); seekVideo();
  }

  /* long-press a clip: every clip shrinks to a tile and the held one follows the finger; the others slide aside */
  function startReorder(i, cx, pid) {
    pause(); buzz(12);
    const r = tlEl.getBoundingClientRect(), B = desk.matches ? 64 : 54, GAP = 6;
    rl.innerHTML = "";
    const blocks = segs.map((s, k) => {
      const d = document.createElement("div"); d.className = "rb";
      const img = thumbAt(s.in + (s.out - s.in) / 2); if (img) d.style.backgroundImage = `url(${img})`;
      d.style.left = pad + startOf(k) * pps - sc.scrollLeft + "px"; d.style.width = Math.max(4, len(s) * pps) + "px";
      rl.appendChild(d); return d;
    });
    rl.hidden = false; lane.style.visibility = "hidden"; void rl.offsetWidth;
    const x = cx - r.left, step = B + GAP;
    gesture = { type: "reorder", pid, x: cx, active: true, i, id: segs[i].id, blocks, B, step, target: i, order: segs.map((_, k) => k),
      origin: x - i * step - B / 2, before: snap(),
      scroll(d) {
        const n = segs.length, w = tlEl.clientWidth; if (n * step < w - 96) return;
        this.origin = clamp(this.origin - d, w - 48 - n * step, 48); this.move(this.x);
      },
      move: moveReorder, end: endReorder };
    blocks.forEach((d) => (d.style.width = B + "px")); blocks[i].classList.add("lift");
    moveReorder(cx); edgeTick();
  }
  function moveReorder(cx) {
    const g = gesture, x = cx - tlEl.getBoundingClientRect().left, n = segs.length;
    const tgt = clamp(Math.round((x - g.B / 2 - g.origin) / g.step), 0, n - 1);
    if (tgt !== g.target) { g.target = tgt; buzz(6); }
    const order = [...Array(n).keys()].filter((k) => k !== g.i); order.splice(tgt, 0, g.i); g.order = order;
    order.forEach((k, slot) => { if (k !== g.i) g.blocks[k].style.left = g.origin + slot * g.step + "px"; });
    g.blocks[g.i].style.left = x - g.B / 2 + "px";
  }
  function endReorder() {
    const g = gesture, old = segs;
    if (g.order.some((k, slot) => k !== slot)) { segs = g.order.map((k) => old[k]); commit(g.before); toast(t("جابه‌جا شد", "Moved")); }
    const ni = segIdx(g.id); tnow = startOf(ni) + Math.min(len(segs[ni]) / 2, 0.5); sel = { k: "seg", id: g.id };
    // grow the tiles back into the real clips before handing the timeline back
    segs.forEach((s, k) => { const d = g.blocks[old.indexOf(s)]; d.classList.remove("lift"); d.style.left = pad + startOf(k) * pps - tnow * pps + "px"; d.style.width = len(s) * pps + "px"; });
    gesture = { type: "settle" };
    setTimeout(() => { if (dead) return; rl.hidden = true; rl.innerHTML = ""; lane.style.visibility = ""; gesture = null; render(); seekVideo(); }, 190);
  }

  /* overlay clip: long-press to move it in time, edges to trim */
  function startOvMove(id, cx, pid) {
    pause(); buzz(10);
    const o = ovs.find((x) => x.id === id), el = olane.querySelector(`.oclip[data-id="${id}"]`);
    sel = { k: "ov", id }; bar = "overlay";
    olane.querySelectorAll(".oclip.sel").forEach((x) => x.classList.remove("sel")); el.classList.add("sel");
    gesture = { type: "ovmove", pid, x: cx, active: true, o, el, s0: o.start, x0: laneX(cx), before: snap(),
      scroll(d) { setScroll(sc.scrollLeft + d); this.move(this.x); },
      move(c) {
        const b = boundaries(), w = this.o.len * pps;
        let x = this.s0 * pps + laneX(c) - this.x0;
        const sx = snapX(x, b); if (sx !== x) x = sx; else { const ex = snapX(x + w, b); x = ex - w; }
        this.o.start = Math.max(0, x / pps); this.el.style.left = this.o.start * pps + "px"; showOvs();
      },
      end() { gesture = null; commit(this.before); render(); } };
    edgeTick();
  }
  function startOvTrim(e, h) {
    pause();
    const el = h.closest(".oclip"), o = ovs.find((x) => x.id === +el.dataset.id);
    gesture = { type: "ovtrim", pid: e.pointerId, x: e.clientX, active: true, o, el, edge: h.dataset.h, s0: o.start, l0: o.len, x0: laneX(e.clientX), before: snap(),
      scroll(d) { setScroll(sc.scrollLeft + d); this.move(this.x); },
      move(c) {
        const dx = laneX(c) - this.x0, b = boundaries();
        if (this.edge === "r") { const end = snapX((this.s0 + this.l0) * pps + dx, b); this.o.len = Math.max(OVMIN, end / pps - this.s0); }
        else { const st = snapX(this.s0 * pps + dx, b); this.o.start = clamp(st / pps, 0, this.s0 + this.l0 - OVMIN); this.o.len = this.s0 + this.l0 - this.o.start; }
        this.el.style.left = this.o.start * pps + "px"; this.el.style.width = this.o.len * pps + "px";
        this.el.querySelector(".badge").textContent = this.o.len.toFixed(1) + "s"; showOvs();
      },
      end() { gesture = null; commit(this.before); render(); } };
    edgeTick();
  }

  /* pinch / ctrl+wheel zoom keep the moment under the playhead in place */
  let pinch = null, zoomRAF = 0;
  function zoom(p) { pps = clamp(p, 4, 400); if (!zoomRAF) zoomRAF = requestAnimationFrame(() => { zoomRAF = 0; render(); }); }
  const tdist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  tlEl.addEventListener("touchstart", (e) => { if (e.touches.length === 2 && !gesture) pinch = { d: tdist(e), p: pps }; }, { passive: true });
  tlEl.addEventListener("touchmove", (e) => { if (!pinch || e.touches.length !== 2) return; e.preventDefault(); zoom((pinch.p * tdist(e)) / pinch.d); }, { passive: false });
  tlEl.addEventListener("touchend", (e) => { if (e.touches.length < 2) pinch = null; });
  tlEl.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(pps * (e.deltaY < 0 ? 1.12 : 0.89)); return; }
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); sc.scrollLeft += e.deltaY; } // a plain mouse wheel scrubs
  }, { passive: false });

  /* ---------- overlay on the preview: drag to move, corner to resize, two fingers to pinch ---------- */
  let ovG = null; const fingers = new Map();
  const fdist = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ox")) { e.preventDefault(); delOv(); return; }
    const d = e.target.closest(".ov");
    if (!d) { if (selOv()) { sel = null; render(); } return; }
    e.preventDefault(); pause();
    const id = +d.dataset.id, o = ovs.find((x) => x.id === id);
    if (!isSel("ov", id)) { sel = { k: "ov", id }; bar = "overlay"; panelOpen = null; render(); }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const fr = frame.getBoundingClientRect(), cx = fr.left + o.x * frameW, cy = fr.top + o.y * frameH;
    if (!ovG) ovG = { o, before: snap(), x0: o.x, y0: o.y, w0: o.w, px: e.clientX, py: e.clientY, cx, cy,
      mode: e.target.closest(".osc") ? "scale" : "move", r0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1 };
    if (fingers.size === 2) { ovG.mode = "pinch"; ovG.d0 = fdist(); ovG.w0 = o.w; }
  });
  on(window, "pointermove", (e) => {
    if (!ovG || !fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = ovG, o = g.o;
    if (g.mode === "move") {
      let x = g.x0 + (e.clientX - g.px) / frameW, y = g.y0 + (e.clientY - g.py) / frameH;
      const sx = Math.abs(x - 0.5) * frameW < SNAP, sy = Math.abs(y - 0.5) * frameH < SNAP;
      if (sx) x = 0.5;
      if (sy) y = 0.5;
      $("gv").classList.toggle("on", sx); $("gh").classList.toggle("on", sy);
      o.x = x; o.y = y;
    } else if (g.mode === "scale") o.w = clamp((g.w0 * Math.hypot(e.clientX - g.cx, e.clientY - g.cy)) / g.r0, 0.05, 2);
    else if (fingers.size === 2) o.w = clamp((g.w0 * fdist()) / g.d0, 0.05, 2);
    placeOv(o);
  });
  function ovUp(e) {
    if (!fingers.delete(e.pointerId) || fingers.size) return;
    $("gv").classList.remove("on"); $("gh").classList.remove("on");
    if (ovG) { commit(ovG.before); ovG = null; renderPanel(); }
  }
  on(window, "pointerup", ovUp); on(window, "pointercancel", ovUp);

  /* ---------- playback across the kept pieces, each at its own speed ---------- */
  let seekWant = null;
  function seekTo(x) { if (v.seeking) seekWant = x; else v.currentTime = x; } // never queue more than one seek: scrubbing stays smooth
  v.addEventListener("seeked", () => { if (seekWant !== null) { const x = seekWant; seekWant = null; v.currentTime = x; } });
  function seekVideo() { const L = locate(tnow); if (L && isFinite(L.src)) seekTo(L.src); }
  function applyRate(s) { v.playbackRate = clamp(s.speed, 0.0625, 16); v.preservesPitch = !s.pitch; }
  function play() {
    if (!segs.length) return;
    if (tnow >= total() - 1 / FPS) tnow = 0;
    const L = locate(tnow); applyRate(L.s); seekWant = null; v.currentTime = L.src;
    v.play().then(() => { playing = true; setPlayIcon(); loop(); }).catch(() => toast(t("دوباره روی پخش بزن", "Tap play again to start")));
  }
  function pause() { if (!playing) return; playing = false; v.pause(); setPlayIcon(); }
  function setPlayIcon() { $("playPath").setAttribute("d", playing ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M7 4.5v15l13-7.5z"); $("play").setAttribute("aria-label", playing ? t("توقف", "Pause") : t("پخش", "Play")); }
  function loop() {
    if (!playing || dead) return;
    const L = locate(tnow);
    if (L) {
      const ct = v.currentTime;
      if (ct >= L.s.out - 0.03 || ct < L.s.in - 0.25) {
        if (L.i + 1 < segs.length) { const n = segs[L.i + 1]; applyRate(n); v.currentTime = n.in; tnow = startOf(L.i + 1); }
        else { pause(); tnow = total(); }
      } else if (ct >= L.s.in - 0.05) tnow = startOf(L.i) + Math.max(0, ct - L.s.in) / L.s.speed;
      setScroll(tnow * pps); updateTC();
    }
    requestAnimationFrame(loop);
  }
  $("play").onclick = () => (playing ? pause() : play());
  v.addEventListener("ended", pause);
  function stepFrame(n) { pause(); tnow = clamp(tnow + n / FPS, 0, total()); setScroll(tnow * pps); updateTC(); seekVideo(); }
  $("prevf").onclick = () => stepFrame(-1); $("nextf").onclick = () => stepFrame(1);

  /* ---------- keyboard (desktop) ---------- */
  on(window, "keydown", (e) => {
    if (e.target.closest && e.target.closest("input,textarea") && e.target.type !== "range") return;
    if (!$("sheet").hidden) { if (e.key === "Escape" && !saving) $("sheet").hidden = true; return; }
    const mod = e.metaKey || e.ctrlKey, k = e.key;
    if (mod && (k === "z" || k === "Z")) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === "y") { e.preventDefault(); redo(); return; }
    if (mod) return;
    if (e.target.type === "range" && (k === "ArrowLeft" || k === "ArrowRight")) return;
    if (k === " ") { e.preventDefault(); playing ? pause() : play(); }
    else if (k === "s" || k === "S") { selOv() ? splitOv() : split(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); selOv() ? delOv() : del(); }
    else if (k === "ArrowLeft" || k === "ArrowRight") { e.preventDefault(); stepFrame((k === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? FPS : 1)); }
    else if (k === "+" || k === "=") zoom(pps * 1.25);
    else if (k === "-") zoom(pps / 1.25);
    else if (k === "Escape") { panelOpen = null; select(null); }
  });

  /* ---------- the cut list, and making the version from it ---------- */
  const changed = () => past.length > 0;
  function cutList() {
    return {
      pieces: segs.map((s) => ({ in: +s.in.toFixed(3), out: +s.out.toFixed(3), speed: s.speed, pitch: !!s.pitch })),
      overlays: ovs.map((o) => ({ image: imgs[o.img], name: o.name, start: +o.start.toFixed(3), end: +(o.start + o.len).toFixed(3), x: +o.x.toFixed(4), y: +o.y.toFixed(4), width: +o.w.toFixed(4) })),
    };
  }
  function showList(making) {
    pause();
    const rows = segs.map((s, i) => `<tr><td>${i + 1}</td><td>${exact(s.in)}</td><td>${exact(s.out)}</td><td>${fmtX(s.speed)}</td><td>${len(s).toFixed(2)} s</td></tr>`).join("");
    const orows = ovs.map((o, i) => `<tr><td>${i + 1}</td><td>${exact(o.start)}</td><td>${exact(o.start + o.len)}</td><td>${Math.round(o.w * 100)}%</td><td>${Math.round(o.x * 100)}%, ${Math.round(o.y * 100)}%</td></tr>`).join("");
    const removed = dur - segs.reduce((a, s) => a + s.out - s.in, 0);
    const v2 = (opts.version || 0) + 1;
    const sh = $("sheet");
    sh.innerHTML = `<div class="card" role="dialog" aria-label="${t("لیست برش", "Cut list")}"><h2>${making ? t(`ساخت نسخهٔ ${v2}`, `Make version ${v2}`) : t("لیست برش", "Cut list")}</h2>`
      + `<p>${t(`${segs.length} تکه، ${mmss(total())}؛ ${Math.max(0, removed).toFixed(1)} ثانیه از این نسخه حذف شده.`, `${segs.length} piece${segs.length > 1 ? "s" : ""}, ${mmss(total())} long; ${Math.max(0, removed).toFixed(1)} s of this version left out.`)} `
      + `${t("ورکر فایل با کیفیت کامل رو از فیلم اصلی می‌سازه، نه از این پیش‌نمایش، و نسخهٔ جدید برای بازبینی میاد.", "The worker renders the full-quality file from the original footage, not from this preview, and the new version comes back for review.")}</p>`
      + `<table><tr><th>#</th><th>${t("از", "From")}</th><th>${t("تا", "To")}</th><th>${t("سرعت", "Speed")}</th><th>${t("مدت", "Length")}</th></tr>${rows}</table>`
      + (ovs.length ? `<h4>${t("تصویرها", "Overlays")}</h4><table><tr><th>#</th><th>${t("از", "From")}</th><th>${t("تا", "To")}</th><th>${t("اندازه", "Size")}</th><th>${t("مرکز", "Centre")}</th></tr>${orows}</table>` : "")
      + `<div class="row"><button class="pill ghost" id="he-sClose">${making ? t("ادامهٔ ویرایش", "Keep editing") : t("بستن", "Close")}</button>`
      + (making ? `<button class="pill primary" id="he-sMake"${changed() ? "" : " disabled"}>${t(`ساخت نسخهٔ ${v2}`, `Make version ${v2}`)}</button>` : "") + `</div>`
      + (making && !changed() ? `<p style="margin-top:12px">${t("هنوز چیزی عوض نشده.", "Nothing has changed yet.")}</p>` : "") + `</div>`;
    sh.hidden = false;
    $("sClose").onclick = () => { if (!saving) sh.hidden = true; };
    sh.onclick = (e) => { if (e.target === sh && !saving) sh.hidden = true; };
    const mk = $("sMake");
    if (mk) mk.onclick = async () => {
      saving = true; mk.disabled = true; mk.textContent = t("در حال فرستادن…", "Sending…");
      try { await opts.onSave(cutList()); past = []; }
      catch (err) { saving = false; mk.disabled = false; mk.textContent = t(`ساخت نسخهٔ ${v2}`, `Make version ${v2}`); toast(err.message || String(err)); }
    };
  }
  $("list").onclick = () => showList(false);
  $("done").onclick = () => showList(true);
  $("close").onclick = () => { if (!changed() || confirm(t("تغییرها ذخیره نشده‌اند. از ویرایشگر خارج می‌شی؟", "Your changes are not saved. Leave the editor?"))) { past = []; opts.onClose(); } };
  on(window, "beforeunload", (e) => { if (changed() && !saving) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- the version's preview and its filmstrip ---------- */
  let thumbJob = 0;
  async function makeThumbs(url) {
    const job = ++thumbJob, tv = document.createElement("video");
    tv.muted = true; tv.playsInline = true; tv.preload = "auto"; tv.src = url;
    await new Promise((r) => { tv.onloadeddata = r; tv.onerror = r; setTimeout(r, 8000); });
    thumbStep = Math.max(0.5, dur / 160);
    const c = document.createElement("canvas"), g = c.getContext("2d"); c.width = 72; c.height = 128;
    for (let k = 0; k * thumbStep <= dur; k++) {
      if (job !== thumbJob || dead) break;
      await new Promise((r) => { const done = () => { tv.onseeked = null; r(); }; tv.onseeked = done; tv.currentTime = Math.min(k * thumbStep + 0.05, dur - 0.05); setTimeout(done, 1500); });
      const vw = tv.videoWidth || 9, vh = tv.videoHeight || 16, s = Math.max(c.width / vw, c.height / vh);
      g.drawImage(tv, (c.width - vw * s) / 2, (c.height - vh * s) / 2, vw * s, vh * s);
      try { thumbs[k] = c.toDataURL("image/jpeg", 0.6); } catch (e) { break; }
      if (k % 12 === 11 && !gesture) render();
    }
    tv.removeAttribute("src"); tv.load();
    if (!gesture && !dead) render();
  }
  v.addEventListener("loadedmetadata", () => {
    if (dur) return;
    dur = v.duration; segs = [{ id: nextId++, in: 0, out: dur, speed: 1, pitch: false }];
    tnow = 0; pps = clamp((sc.clientWidth * (desk.matches ? 1.5 : 3)) / dur, 4, 60);
    $("empty").hidden = true; render(); v.currentTime = 0.01;
    makeThumbs(opts.src);
  });
  v.addEventListener("error", () => { if (!dur) $("empty").textContent = t("پیش‌نمایش این نسخه باز نشد. صفحه رو دوباره باز کن.", "This version's preview did not open. Reload the page."); });
  const ro = new ResizeObserver(() => { if (!gesture && dur) render(); });
  ro.observe(stage);
  on(desk, "change", () => { panelOpen = null; render(); });
  v.src = opts.src;

  return function destroy() {
    dead = true; thumbJob++;
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
    ro.disconnect(); offs.forEach((f) => f());
    host.innerHTML = "";
  };
}

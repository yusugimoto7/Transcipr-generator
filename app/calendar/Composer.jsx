"use client";

// The post composer, in the manner of Zoho Social: pick networks by their icons, write one caption
// and customise it per network where needed, attach the video or image, choose when, and watch a
// live preview of every network on the right. Members send posts for approval; only Hamed
// approves, schedules and publishes.

import { useEffect, useMemo, useState } from "react";
import { apiAt } from "../editing/ui";
import { NETWORKS, NET, STATUS, effectiveCaption, thumbOf } from "./channels";
import { Preview } from "./Previews";
import c from "./publishing.module.css";

const cal = (path, opts) => apiAt("/api/calendar", path, opts);
const pad = (n) => String(n).padStart(2, "0");
const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const blank = () => ({
  title: "", caption: "", media: { kind: "none", url: "" }, publish_at: null,
  channels: Object.fromEntries(NETWORKS.map((n) => [n.key, { on: false, custom: false, caption: "", ...(n.key === "instagram" ? { format: "reel" } : {}), ...(n.key === "youtube" ? { title: "" } : {}) }])),
});

export function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span className={c.statusPill} style={{ background: s.color }}>
      {s.name}
    </span>
  );
}

export function NetChip({ k, state }) {
  const n = NET[k];
  const ring = state === "published" ? "0 0 0 2px #12a150" : ["failed", "unknown", "missed"].includes(state) ? "0 0 0 2px #e5484d" : "none";
  return (
    <span className={c.chip} style={{ background: n.color, boxShadow: ring }} title={`${n.name}${state ? ": " + state : ""}`}>
      {n.short}
    </span>
  );
}

export default function Composer({ boards, boardId, cardId, start, me, channels, sources, onClose, onSaved, onOpenCard }) {
  const admin = me.role === "admin";
  const [bid, setBid] = useState(boardId || (boards[0] && boards[0].id) || "");
  const [id, setId] = useState(cardId || "");
  const [saved, setSaved] = useState(null);
  const [d, setD] = useState(() => ({ ...blank(), ...(start ? { publish_at: start } : {}) }));
  const [tab, setTab] = useState("original");
  const [pv, setPv] = useState("");
  const [when, setWhen] = useState(start ? "schedule" : "none");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cardId) return;
    cal(`/boards/${boardId}/cards/${cardId}`)
      .then(({ card }) => {
        setSaved(card);
        setD(card);
        setWhen(card.publish_at ? "schedule" : "none");
      })
      .catch((e) => setMsg({ kind: "bad", text: e.message }));
  }, [boardId, cardId]);

  const on = NETWORKS.filter((n) => d.channels[n.key] && d.channels[n.key].on);
  useEffect(() => {
    if (!on.some((n) => n.key === pv)) setPv(on[0] ? on[0].key : "");
    if (tab !== "original" && !on.some((n) => n.key === tab)) setTab("original");
  }, [on.map((n) => n.key).join(), pv, tab]);

  const locked = saved && Object.values(saved.publish || {}).some((p) => ["published", "publishing"].includes(p.status));
  const setCh = (k, patch) => setD({ ...d, channels: { ...d.channels, [k]: { ...d.channels[k], ...patch } } });
  const toggleNet = (k) => !locked && setCh(k, { on: !d.channels[k].on });
  const status = saved ? saved.status : "draft";
  const dirty = !saved || JSON.stringify(pick(saved)) !== JSON.stringify(pick(d));

  function pick(x) {
    return { title: x.title || "", caption: x.caption || "", media: x.media, channels: x.channels, publish_at: x.publish_at || null };
  }

  const body = () => {
    const f = pick(d);
    if (!f.title.trim()) f.title = (f.caption || on.map((n) => effectiveCaption(d, n.key)).find(Boolean) || "New post").split("\n")[0].slice(0, 80);
    if (when === "none") f.publish_at = null;
    return f;
  };

  // Save first, then the action, so an approval always covers exactly what is stored.
  const save = async () => {
    const f = body();
    if (when === "schedule" && !f.publish_at) throw new Error("choose the date and time");
    if (!id) {
      const r = await cal(`/boards/${bid}/cards`, { method: "POST", body: f });
      setId(r.card.id);
      return r.card.id;
    }
    if (dirty) await cal(`/boards/${bid}/cards/${id}`, { method: "PATCH", body: f });
    return id;
  };
  const reload = async (cid) => {
    const { card } = await cal(`/boards/${bid}/cards/${cid}`);
    setSaved(card);
    setD(card);
    onSaved && onSaved();
    return card;
  };
  const run = async (label, steps) => {
    setBusy(true);
    setMsg({ kind: "", text: "" });
    try {
      const cid = await save();
      for (const s of steps) await cal(`/boards/${bid}/cards/${cid}/action`, { method: "POST", body: s });
      await reload(cid);
      setMsg({ kind: "ok", text: label });
    } catch (e) {
      setMsg({ kind: "bad", text: e.message });
    }
    setBusy(false);
  };
  const reject = async () => {
    const note = window.prompt("What should change? (sent to the team with the post)");
    if (note === null) return;
    setBusy(true);
    try {
      await cal(`/boards/${bid}/cards/${id}/action`, { method: "POST", body: { action: "reject", note } });
      await reload(id);
      setMsg({ kind: "ok", text: "Sent back to the team as a draft." });
    } catch (e) {
      setMsg({ kind: "bad", text: e.message });
    }
    setBusy(false);
  };
  const close = () => {
    if (dirty && (d.caption || on.length) && !window.confirm("Close without saving?")) return;
    onClose();
  };

  const counts = useMemo(
    () => on.map((n) => ({ n, len: effectiveCaption(d, n.key).length })),
    [d, on]
  );
  const editing = tab === "original" ? null : d.channels[tab];
  const thumb = thumbOf(d.media);
  const needsVideo = on.some((n) => n.key === "tiktok" || n.key === "youtube" || (n.key === "instagram" && d.channels.instagram.format !== "post"));

  return (
    <div className={c.bg} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={c.composer} role="dialog" aria-modal="true" aria-label="Post composer">
        <div className={c.cHead}>
          <h2>{id ? "Edit post" : "New post"}</h2>
          <StatusPill status={status} />
          <select id="cmp-board" className={c.select} value={bid} disabled={!!id} onChange={(e) => setBid(e.target.value)} aria-label="Market">
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {id && onOpenCard && (
            <button className={c.btn} onClick={() => onOpenCard(bid, id)}>
              Planning details
            </button>
          )}
          <button className={c.btn} onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={c.cBody}>
          <div className={c.cLeft}>
            {saved && saved.review && !saved.approved && (
              <div className={`${c.banner} ${c.bWarn}`}>Waiting for Hamed's approval{saved.review.note ? `: ${saved.review.note}` : ""}.</div>
            )}
            {saved && saved.approval && !saved.approved && (
              <div className={`${c.banner} ${c.bWarn}`}>Changed after approval: it needs approving again.</div>
            )}
            {locked && <div className={`${c.banner} ${c.bInfo}`}>Already published or publishing: the text and media can no longer change.</div>}

            <div>
              <div className={c.label} style={{ marginBottom: 8 }}>
                Publish to
              </div>
              <div className={c.nets}>
                {NETWORKS.map((n) => {
                  const sel = d.channels[n.key].on;
                  const st = channels[n.key];
                  return (
                    <button key={n.key} className={`${c.netBtn} ${sel ? c.on : ""}`} style={{ background: n.color }} onClick={() => toggleNet(n.key)} title={`${n.name}${st && !st.connected ? " (not connected)" : ""}`} aria-pressed={sel} aria-label={n.name}>
                      {n.short}
                      {sel && <span className={c.tick}>✓</span>}
                      {st && !st.connected && <span className={c.warnDot} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className={c.row}>
              <span className={c.label}>Post name</span>
              <input id="cmp-title" className={`${c.input} ${c.grow}`} dir="auto" placeholder="For the team; not published" value={d.title || ""} onChange={(e) => setD({ ...d, title: e.target.value })} />
            </label>

            <div>
              <div className={c.tabs} role="tablist">
                <button className={`${c.tab} ${tab === "original" ? c.on : ""}`} onClick={() => setTab("original")}>
                  Original
                </button>
                {on.map((n) => (
                  <button key={n.key} className={`${c.tab} ${tab === n.key ? c.on : ""}`} onClick={() => setTab(n.key)}>
                    <NetChip k={n.key} /> {n.name}
                    {d.channels[n.key].custom ? " ✎" : ""}
                  </button>
                ))}
              </div>
              {editing && (
                <div className={c.row} style={{ padding: "8px 0" }}>
                  <label className={c.row} style={{ fontSize: 13 }}>
                    <input id="cmp-custom" type="checkbox" checked={!!editing.custom} disabled={locked} onChange={(e) => setCh(tab, { custom: e.target.checked, caption: e.target.checked && !editing.caption ? d.caption : editing.caption })} />
                    Customize for {NET[tab].name}
                  </label>
                  {tab === "instagram" && (
                    <select id="cmp-igformat" className={c.select} value={editing.format || "reel"} disabled={locked} onChange={(e) => setCh("instagram", { format: e.target.value })}>
                      <option value="reel">Reel (video)</option>
                      <option value="post">Feed post (image)</option>
                    </select>
                  )}
                  {tab === "youtube" && <input id="cmp-yttitle" className={`${c.input} ${c.grow}`} dir="auto" placeholder="YouTube title" value={editing.title || ""} disabled={locked} onChange={(e) => setCh("youtube", { title: e.target.value })} />}
                </div>
              )}
              <div className={c.editor}>
                <textarea
                  id="cmp-text"
                  dir="auto"
                  disabled={locked || (editing && !editing.custom)}
                  placeholder={tab === "original" ? "What do you want to share? One caption for every network; customise a network in its tab." : ""}
                  value={tab === "original" ? d.caption || "" : effectiveCaption(d, tab)}
                  onChange={(e) => (tab === "original" ? setD({ ...d, caption: e.target.value }) : setCh(tab, { caption: e.target.value }))}
                />
                <div className={c.editorFoot}>
                  {counts.length === 0 && <span>Choose a network above.</span>}
                  {counts.map(({ n, len }) => (
                    <span key={n.key} className={`${c.count} ${len > n.max ? c.bad : ""}`}>
                      <NetChip k={n.key} /> {len}/{n.max}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className={c.label} style={{ marginBottom: 8 }}>
                Media {needsVideo && <span className={c.muted}>· a video is needed for {on.filter((n) => n.key !== "linkedin" && n.key !== "x").map((n) => n.name).join(", ")}</span>}
              </div>
              <div className={c.mediaBox}>
                <div className={c.thumb} style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                  {d.media.kind === "video" ? "▶" : d.media.kind === "image" ? "" : "+"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 240px", minWidth: 0 }}>
                  <div className={c.row}>
                    <select id="cmp-mkind" className={c.select} value={d.media.kind} disabled={locked} onChange={(e) => {
                      const kind = e.target.value;
                      // A Reel needs a video: an image makes the Instagram post a feed post, and back.
                      const ig = { ...d.channels.instagram, format: kind === "image" ? "post" : kind === "video" ? "reel" : d.channels.instagram.format };
                      setD({ ...d, media: { ...d.media, kind }, channels: { ...d.channels, instagram: ig } });
                    }}>
                      <option value="none">No media</option>
                      <option value="video">Video</option>
                      <option value="image">Image</option>
                    </select>
                    {d.media.kind !== "none" && (
                      <input id="cmp-murl" className={`${c.input} ${c.grow}`} placeholder="Google Drive link (Anyone with the link)" value={d.media.url || ""} disabled={locked} onChange={(e) => setD({ ...d, media: { ...d.media, url: e.target.value } })} />
                    )}
                  </div>
                  {sources.videos.length > 0 && !locked && (
                    <select id="cmp-mpick" className={c.select} value="" onChange={(e) => {
                      const v = sources.videos.find((x) => x.id === e.target.value);
                      if (v) setD({ ...d, media: { kind: "video", url: v.url, project_id: v.id }, title: d.title || v.title });
                    }}>
                      <option value="">Use an approved Video Editing video…</option>
                      {sources.videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} (v{v.version})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className={c.label} style={{ marginBottom: 8 }}>
                When
              </div>
              <div className={c.when}>
                {[["none", "No date yet"], ["schedule", "Schedule"]].map(([k, label]) => (
                  <button key={k} className={`${c.whenOpt} ${when === k ? c.on : ""}`} onClick={() => setWhen(k)}>
                    {label}
                  </button>
                ))}
                {when === "schedule" && (
                  <input id="cmp-when" type="datetime-local" className={c.input} value={toLocal(d.publish_at)} onChange={(e) => setD({ ...d, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                )}
              </div>
            </div>

            {saved && saved.publish && Object.keys(saved.publish).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className={c.label}>Results</div>
                {Object.entries(saved.publish).map(([k, p]) => (
                  <div key={k} className={`${c.banner} ${p.status === "published" ? c.bOk : p.status === "publishing" ? c.bInfo : c.bBad}`}>
                    <NetChip k={k} /> {NET[k].name}: {p.status}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        open the post
                      </a>
                    )}
                    {(p.error || p.note) && <span>· {p.error || p.note}</span>}
                    {admin && ["failed", "unknown", "missed"].includes(p.status) && (
                      <button className={c.btn} disabled={busy} onClick={() => run("Cleared; publish again when ready.", [{ action: "retry", channel: k }])}>
                        Allow another try
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={c.cRight}>
            <div className={c.row}>
              <span className={c.label}>Preview</span>
              <div className={c.tabs} style={{ border: 0 }}>
                {on.map((n) => (
                  <button key={n.key} className={`${c.tab} ${pv === n.key ? c.on : ""}`} onClick={() => setPv(n.key)}>
                    <NetChip k={n.key} />
                  </button>
                ))}
              </div>
            </div>
            <div className={c.pvWrap}>{pv ? <Preview card={d} network={pv} /> : <p className={c.muted}>Choose a network to see how the post will look.</p>}</div>
            {pv && <span className={c.muted}>The preview is approximate; each network crops and shortens in its own way.</span>}
          </div>
        </div>

        {msg.text && (
          <div className={`${c.banner} ${msg.kind === "ok" ? c.bOk : c.bBad}`} style={{ margin: "0 18px 8px" }}>
            {msg.text}
          </div>
        )}
        <div className={c.cFoot}>
          <button className={c.btn} disabled={busy || locked || (!dirty && !!id)} onClick={() => run("Saved as a draft.", [])}>
            Save draft
          </button>
          <span className={c.grow} />
          {!admin && !locked && (
            <button className={`${c.btn} ${c.primary}`} disabled={busy || !on.length} onClick={() => run("Sent to Hamed for approval.", [{ action: "request_review" }])}>
              Send for approval
            </button>
          )}
          {admin && saved && saved.review && !saved.approved && (
            <button className={`${c.btn} ${c.danger}`} disabled={busy} onClick={reject}>
              Send back
            </button>
          )}
          {admin && !locked && (
            <>
              <button className={`${c.btn} ${c.blue}`} disabled={busy || !on.length} onClick={() => run(when === "schedule" ? "Approved and scheduled." : "Approved. Give it a time to schedule it.", [{ action: "approve" }])}>
                {when === "schedule" ? "Approve & schedule" : "Approve"}
              </button>
              <button className={`${c.btn} ${c.primary}`} disabled={busy || !on.length} onClick={() => window.confirm(`Publish now on ${on.map((n) => n.name).join(", ")}?`) && run("Publishing started; results appear here.", [{ action: "approve" }, { action: "publish_now" }])}>
                Publish now
              </button>
            </>
          )}
          {admin && saved && saved.approved && !locked && !dirty && (
            <button className={c.btn} disabled={busy} onClick={() => run("Approval withdrawn.", [{ action: "unapprove" }])}>
              Withdraw approval
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

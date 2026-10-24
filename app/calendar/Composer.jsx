"use client";

// The post composer, in the manner of Zoho Social: pick networks by their icons, write one caption
// and customise it per network where needed, attach the video or image, choose when, and watch a
// live preview of every network on the right. Members send posts for approval; only Hamed
// approves, schedules and publishes.

import { Check, Clock, Play, Plus } from "lucide-react";
import PostFiles from "./PostFiles";
import { Badge } from "../../components/ui/badge";
import { pickerNote } from "../../lib/tz";
import { useEffect, useMemo, useState } from "react";
import { apiAt } from "../editing/ui";
import DrivePicker from "../DrivePicker";
import { NETWORKS, NET, effectiveCaption, thumbOf, statusName, netName, publishStateName } from "./channels";
import { L, uiDir } from "../../lib/i18n";
import { IG_ACCOUNTS, IG_ACCOUNT_NOTES } from "../../lib/calendar/igAccounts";
import { publishStateOf } from "../../lib/calendar/publishState";
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

// Soft tint with dark text, the same as the board's badges.
const PILL = { draft: "draft", pending: "pending", approved: "scheduled", scheduled: "scheduled", publishing: "scheduled", published: "published", failed: "failed" };
export function StatusPill({ status }) {
  return <Badge variant={PILL[status] || "draft"}>{statusName(status)}</Badge>;
}

export function NetChip({ k, state }) {
  const n = NET[k];
  const ring = state === "published" ? "0 0 0 2px #12a150" : ["failed", "unknown", "missed"].includes(state) ? "0 0 0 2px #e5484d" : "none";
  return (
    <span className={c.chip} style={{ background: n.color, boxShadow: ring }} title={`${netName(k)}${state ? ": " + publishStateName(state) : ""}`}>
      {n.short}
    </span>
  );
}

export default function Composer({ boards, boardId, cardId, start, me, channels, sources, onClose, onSaved, onOpenCard, settings = {} }) {
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

  const locked = saved && Object.values(saved.publish || {}).some((p) => ["published", "publishing"].includes(publishStateOf(p)));
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
    if (when === "schedule" && !f.publish_at) throw new Error(L("تاریخ و ساعت را انتخاب کن", "choose the date and time"));
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
    const note = window.prompt(L("چه چیزی باید عوض بشه؟ (همراه پست برای تیم فرستاده می‌شه)", "What should change? (sent to the team with the post)"));
    if (note === null) return;
    setBusy(true);
    try {
      await cal(`/boards/${bid}/cards/${id}/action`, { method: "POST", body: { action: "reject", note } });
      await reload(id);
      setMsg({ kind: "ok", text: L("به‌صورت پیش‌نویس به تیم برگشت.", "Sent back to the team as a draft.") });
    } catch (e) {
      setMsg({ kind: "bad", text: e.message });
    }
    setBusy(false);
  };
  const close = () => {
    if (dirty && (d.caption || on.length) && !window.confirm(L("بدون ذخیره بسته بشه؟", "Close without saving?"))) return;
    onClose();
  };

  const counts = useMemo(
    () => on.map((n) => ({ n, len: effectiveCaption(d, n.key).length })),
    [d, on]
  );
  const editing = tab === "original" ? null : d.channels[tab];
  const thumb = thumbOf(d.media);
  const album = (d.media && d.media.items) || [];
  const needsVideo = on.some((n) => n.key === "tiktok" || n.key === "youtube" || (n.key === "instagram" && d.channels.instagram.format === "reel"));

  return (
    <div className={c.bg} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={c.composer} role="dialog" aria-modal="true" aria-label={L("نوشتن پست", "Post composer")}>
        <div className={c.cHead}>
          <h2>{id ? L("ویرایش پست", "Edit post") : L("پست جدید", "New post")}</h2>
          <StatusPill status={status} />
          {boards.length > 1 && <select id="cmp-board" className={c.select} value={bid} disabled={!!id} onChange={(e) => setBid(e.target.value)} aria-label={L("برد", "Board")}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>}
          {id && onOpenCard && (
            <button className={c.btn} onClick={() => onOpenCard(bid, id)}>
              {L("جزئیات برنامه‌ریزی", "Planning details")}
            </button>
          )}
          <button className={c.btn} onClick={close} aria-label={L("بستن", "Close")}>
            ✕
          </button>
        </div>

        <div className={c.cBody}>
          <div className={c.cLeft}>
            {saved && saved.review && !saved.approved && (
              <div className={`${c.banner} ${c.bWarn}`} dir={uiDir()}>{L("در انتظار تأیید حامد", "Waiting for Hamed's approval")}{saved.review.note ? `: ${saved.review.note}` : ""}.</div>
            )}
            {saved && saved.approval && !saved.approved && (
              <div className={`${c.banner} ${c.bWarn}`} dir={uiDir()}>{L("بعد از تأیید عوض شده: دوباره باید تأیید بشه.", "Changed after approval: it needs approving again.")}</div>
            )}
            {locked && <div className={`${c.banner} ${c.bInfo}`} dir={uiDir()}>{L("منتشر شده یا در حال انتشاره: متن و فایل‌ها دیگه عوض نمی‌شن.", "Already published or publishing: the text and media can no longer change.")}</div>}

            <div>
              <div className={c.label} style={{ marginBottom: 8 }}>
                {L("انتشار در", "Publish to")}
              </div>
              <div className={c.nets}>
                {NETWORKS.map((n) => {
                  const sel = d.channels[n.key].on;
                  const st = channels[n.key];
                  return (
                    <button key={n.key} className={`${c.netBtn} ${sel ? c.on : ""}`} style={{ background: n.color }} onClick={() => toggleNet(n.key)} title={`${netName(n.key)}${st && !st.connected ? L(" (وصل نیست)", " (not connected)") : ""}`} aria-pressed={sel} aria-label={netName(n.key)}>
                      {n.short}
                      {sel && <span className={c.tick}><Check size={11} strokeWidth={3} aria-hidden /></span>}
                      {st && !st.connected && <span className={c.warnDot} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Which of the three Instagram pages, chosen up front where the networks are picked. */}
            {d.channels.instagram.on && (
              <label className={c.row}>
                <span className={c.label}>{L("صفحه اینستاگرام", "Instagram page")}</span>
                <select id="cmp-igaccount" className={`${c.select} ${c.grow}`} value={d.channels.instagram.account || ""} disabled={locked} onChange={(e) => setCh("instagram", { account: e.target.value })}>
                  <option value="">{L("خودکار (انگلیسی ← @sugimoto.visa، فارسی EU ← اروپا، بقیه ← @sugimotovisa)", "Automatic (English → @sugimoto.visa, Persian EU → Europe, the rest → @sugimotovisa)")}</option>
                  {Object.entries(IG_ACCOUNTS).map(([k, name]) => (
                    <option key={k} value={k}>{name} · {L(...IG_ACCOUNT_NOTES[k])}</option>
                  ))}
                </select>
              </label>
            )}

            <label className={c.row}>
              <span className={c.label}>{L("نام پست", "Post name")}</span>
              <input id="cmp-title" className={`${c.input} ${c.grow}`} dir="auto" placeholder={L("برای تیم؛ منتشر نمی‌شه", "For the team; not published")} value={d.title || ""} onChange={(e) => setD({ ...d, title: e.target.value })} />
            </label>

            <div>
              <div className={c.tabs} role="tablist">
                <button className={`${c.tab} ${tab === "original" ? c.on : ""}`} onClick={() => setTab("original")}>
                  {L("اصلی", "Original")}
                </button>
                {on.map((n) => (
                  <button key={n.key} className={`${c.tab} ${tab === n.key ? c.on : ""}`} onClick={() => setTab(n.key)}>
                    <NetChip k={n.key} /> {netName(n.key)}
                    {d.channels[n.key].custom ? " ✎" : ""}
                  </button>
                ))}
              </div>
              {editing && (
                <div className={c.row} style={{ padding: "8px 0" }}>
                  <label className={c.row} style={{ fontSize: 13 }}>
                    <input id="cmp-custom" type="checkbox" checked={!!editing.custom} disabled={locked} onChange={(e) => setCh(tab, { custom: e.target.checked, caption: e.target.checked && !editing.caption ? d.caption : editing.caption })} />
                    {L(`سفارشی برای ${netName(tab)}`, `Customize for ${netName(tab)}`)}
                  </label>
                  {tab === "instagram" && (
                    <select id="cmp-igformat" className={c.select} value={editing.format || "reel"} disabled={locked} onChange={(e) => setCh("instagram", { format: e.target.value })}>
                      <option value="reel">{L("ریلز (ویدیو)", "Reel (video)")}</option>
                      <option value="post">{L("پست فید (عکس یا کاروسل)", "Feed post (image or carousel)")}</option>
                      <option value="story">{L("استوری (هر فایل یک استوری)", "Stories (each file its own story)")}</option>
                    </select>
                  )}
                  {tab === "youtube" && <input id="cmp-yttitle" className={`${c.input} ${c.grow}`} dir="auto" placeholder={L("عنوان YouTube", "YouTube title")} value={editing.title || ""} disabled={locked} onChange={(e) => setCh("youtube", { title: e.target.value })} />}
                </div>
              )}
              <div className={c.editor}>
                <textarea
                  id="cmp-text"
                  dir="auto"
                  disabled={locked || (editing && !editing.custom)}
                  placeholder={tab === "original" ? L("چی می‌خوای به اشتراک بذاری؟ یک کپشن برای همهٔ شبکه‌ها؛ هر شبکه را در زبانهٔ خودش سفارشی کن.", "What do you want to share? One caption for every network; customise a network in its tab.") : ""}
                  value={tab === "original" ? d.caption || "" : effectiveCaption(d, tab)}
                  onChange={(e) => (tab === "original" ? setD({ ...d, caption: e.target.value }) : setCh(tab, { caption: e.target.value }))}
                />
                <div className={c.editorFoot}>
                  {counts.length === 0 && <span>{L("بالا یک شبکه انتخاب کن.", "Choose a network above.")}</span>}
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
                {L("فایل‌ها", "Media")} {needsVideo && <span className={c.muted}>{L(
                  `· تا وقتی ایده است اختیاریه؛ برای ${on.filter((n) => n.key !== "linkedin" && n.key !== "x").map((n) => netName(n.key)).join("، ")} قبل از انتشار ویدیو لازمه`,
                  `· optional while it is an idea; a video is needed on ${on.filter((n) => n.key !== "linkedin" && n.key !== "x").map((n) => netName(n.key)).join(", ")} before it can go out`
                )}</span>}
              </div>
              {album.length > 1 ? (
                <div className={c.mediaBox}>
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
                    {album.map((m, i) => (
                      <div key={i} className={c.thumb} style={m.kind === "image" ? { backgroundImage: `url(${m.url})`, flex: "0 0 auto" } : { flex: "0 0 auto" }} title={L(`${i + 1} از ${album.length}`, `${i + 1} of ${album.length}`)}>
                        {m.kind === "video" ? <Play size={14} fill="currentColor" aria-hidden /> : ""}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 0 auto" }}>
                    <span className={c.muted}>{L(`${album.length} فایل، با هم پست می‌شن`, `${album.length} files, posted together`)}</span>
                    {!locked && <button className={c.btn} onClick={() => setD({ ...d, media: { kind: "none", url: "" } })}>{L("حذف فایل‌ها", "Remove the files")}</button>}
                  </div>
                </div>
              ) : (
              <div className={c.mediaBox}>
                <div className={c.thumb} style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                  {d.media.kind === "video" ? <Play size={18} fill="currentColor" aria-hidden /> : d.media.kind === "image" ? "" : <Plus size={20} aria-hidden />}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "1 1 240px", minWidth: 0 }}>
                  <div className={c.row}>
                    <select id="cmp-mkind" className={c.select} value={d.media.kind} disabled={locked} onChange={(e) => {
                      const kind = e.target.value;
                      // A Reel needs a video: an image makes the Instagram post a feed post, and back.
                      const ig = { ...d.channels.instagram, format: kind === "image" ? "post" : kind === "video" ? "reel" : d.channels.instagram.format };
                      setD({ ...d, media: { ...d.media, kind }, channels: { ...d.channels, instagram: ig } });
                    }}>
                      <option value="none">{L("بدون فایل", "No media")}</option>
                      <option value="video">{L("ویدیو", "Video")}</option>
                      <option value="image">{L("عکس", "Image")}</option>
                    </select>
                    {d.media.kind !== "none" && (
                      <input id="cmp-murl" data-no-voice className={`${c.input} ${c.grow}`} placeholder={L("لینک Google Drive (هر کسی که لینک را دارد)", "Google Drive link (Anyone with the link)")} value={d.media.url || ""} disabled={locked} onChange={(e) => setD({ ...d, media: { ...d.media, url: e.target.value } })} />
                    )}
                  </div>
                  {d.media.kind !== "none" && !locked && (
                    <DrivePicker kind={d.media.kind} onPick={(file) => setD((x) => ({ ...x, media: { kind: x.media.kind, url: file.url } }))} />
                  )}
                  {sources.videos.length > 0 && !locked && (
                    <select id="cmp-mpick" className={c.select} value="" onChange={(e) => {
                      const v = sources.videos.find((x) => x.id === e.target.value);
                      if (v) setD({ ...d, media: { kind: "video", url: v.url, project_id: v.id }, title: d.title || v.title });
                    }}>
                      <option value="">{L("استفاده از یک ویدیوی تأییدشدهٔ تدوین ویدیو…", "Use an approved Video Editing video…")}</option>
                      {sources.videos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} (v{v.version})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              )}
            </div>

            <div>
              <div className={c.label} style={{ marginBottom: 8 }}>
                {L("زمان", "When")}
              </div>
              <div className={c.when}>
                {[["none", ["هنوز بدون تاریخ", "No date yet"]], ["schedule", ["زمان‌بندی", "Schedule"]]].map(([k, label]) => (
                  <button key={k} className={`${c.whenOpt} ${when === k ? c.on : ""}`} onClick={() => setWhen(k)}>
                    {L(label)}
                  </button>
                ))}
                {when === "schedule" && (
                  <>
                  <input id="cmp-when" type="datetime-local" className={c.input} value={toLocal(d.publish_at)} onChange={(e) => setD({ ...d, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                  {d.publish_at && <span className={c.muted} style={{ flexBasis: "100%" }}><Clock size={12} aria-hidden /> {pickerNote(toLocal(d.publish_at))}</span>}
                  </>
                )}
              </div>
            </div>

            {saved && saved.id && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className={c.label}>{L("بردن فایل‌ها", "Take it with you")}</div>
                {dirty && <span className={c.muted} dir={uiDir()}>{L("اول پیش‌نویس را ذخیره کن؛ فایل‌های زیر نسخهٔ ذخیره‌شده‌اند.", "Save the draft first; the files below are the saved version.")}</span>}
                <PostFiles boardId={bid} cardId={saved.id} card={saved} />
              </div>
            )}

            {saved && saved.publish && Object.keys(saved.publish).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className={c.label}>{L("نتیجه‌ها", "Results")}</div>
                {Object.entries(saved.publish).map(([k, p]) => (
                  <div key={k} className={`${c.banner} ${publishStateOf(p) === "published" ? c.bOk : ["publishing", "tested"].includes(publishStateOf(p)) ? c.bInfo : c.bBad}`}>
                    <NetChip k={k} /> {netName(k)}: {publishStateName(publishStateOf(p))}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {L("باز کردن پست", "open the post")}
                      </a>
                    )}
                    {(p.error || p.note) && <span>· {p.error || p.note}</span>}
                    {admin && ["failed", "unknown", "missed"].includes(p.status) && (
                      <button className={c.btn} disabled={busy} onClick={() => run(L("پاک شد؛ هر وقت آماده بود دوباره منتشر کن.", "Cleared; publish again when ready."), [{ action: "retry", channel: k }])}>
                        {L("اجازهٔ یک تلاش دیگر", "Allow another try")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={c.cRight}>
            <div className={c.row}>
              <span className={c.label}>{L("پیش‌نمایش", "Preview")}</span>
              <div className={c.tabs} style={{ border: 0 }}>
                {on.map((n) => (
                  <button key={n.key} className={`${c.tab} ${pv === n.key ? c.on : ""}`} onClick={() => setPv(n.key)}>
                    <NetChip k={n.key} />
                  </button>
                ))}
              </div>
            </div>
            <div className={c.pvWrap}>{pv ? <Preview card={d} network={pv} /> : <p className={c.muted} dir={uiDir()}>{L("یک شبکه انتخاب کن تا ببینی پست چه شکلی می‌شه.", "Choose a network to see how the post will look.")}</p>}</div>
            {pv && <span className={c.muted} dir={uiDir()}>{L("پیش‌نمایش تقریبیه؛ هر شبکه به روش خودش برش می‌زنه و کوتاه می‌کنه.", "The preview is approximate; each network crops and shortens in its own way.")}</span>}
          </div>
        </div>

        {msg.text && (
          <div className={`${c.banner} ${msg.kind === "ok" ? c.bOk : c.bBad}`} style={{ margin: "0 18px 8px" }} dir={uiDir()}>
            {msg.text}
          </div>
        )}
        <div className={c.cFoot}>
          <button className={c.btn} disabled={busy || locked || (!dirty && !!id)} onClick={() => run(L("به‌صورت پیش‌نویس ذخیره شد.", "Saved as a draft."), [])}>
            {L("ذخیرهٔ پیش‌نویس", "Save draft")}
          </button>
          <span className={c.grow} />
          {!admin && !locked && (
            <button className={`${c.btn} ${c.primary}`} disabled={busy || !on.length} onClick={() => run(L("برای تأیید به حامد فرستاده شد.", "Sent to Hamed for approval."), [{ action: "request_review" }])}>
              {L("ارسال برای تأیید", "Send for approval")}
            </button>
          )}
          {admin && saved && saved.review && !saved.approved && (
            <button className={`${c.btn} ${c.danger}`} disabled={busy} onClick={reject}>
              {L("برگرداندن", "Send back")}
            </button>
          )}
          {admin && !locked && (
            <>
              <button className={`${c.btn} ${c.blue}`} disabled={busy || !on.length} onClick={() => run(when === "schedule" ? L("تأیید و زمان‌بندی شد.", "Approved and scheduled.") : L("تأیید شد. برای زمان‌بندی یک زمان بهش بده.", "Approved. Give it a time to schedule it."), [{ action: "approve" }])}>
                {when === "schedule" ? L("تأیید و زمان‌بندی", "Approve & schedule") : L("تأیید", "Approve")}
              </button>
              {settings.platform_posting !== false && (
              <button className={`${c.btn} ${c.primary}`} disabled={busy || !on.length} onClick={() => window.confirm(L(`همین الان در ${on.map((n) => netName(n.key)).join("، ")} منتشر بشه؟`, `Publish now on ${on.map((n) => netName(n.key)).join(", ")}?`)) && run(L("انتشار شروع شد؛ نتیجه‌ها همین‌جا می‌آیند.", "Publishing started; results appear here."), [{ action: "approve" }, { action: "publish_now" }])}>
                {L("انتشار همین الان", "Publish now")}
              </button>
              )}
            </>
          )}
          {admin && saved && saved.approved && !locked && !dirty && (
            <button className={c.btn} disabled={busy} onClick={() => run(L("تأیید پس گرفته شد.", "Approval withdrawn."), [{ action: "unapprove" }])}>
              {L("پس گرفتن تأیید", "Withdraw approval")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  closestCorners, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Shell, apiAt } from "../editing/ui";
import c from "./calendar.module.css";

const CH = [
  ["instagram", "IG", "Instagram"], ["tiktok", "TT", "TikTok"], ["youtube", "YT", "YouTube"],
  ["linkedin", "in", "LinkedIn page"], ["x", "X", "X"],
];
const CAPTION_MAX = { instagram: 2200, tiktok: 2200, youtube: 5000, linkedin: 3000, x: 280 };
const COLORS = {
  sky: "#5aa9e6", orange: "#f28c28", yellow: "#d9a923", purple: "#9b7fd4", green: "#4caf7a",
  red: "#e5484d", pink: "#e86fa8", lime: "#7fb236", gray: "#8b95a3", navy: "#2f5d9b",
};
const LINKS = [["docs", "Google Docs"], ["canva", "Canva"], ["final", "Final work"], ["other", "Other link"]];

const pad = (n) => String(n).padStart(2, "0");
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : null;
}
function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shortWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function initials(name) {
  return String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
const hasFarsi = (t) => /[؀-ۿ]/.test(t || "");

// ---- card face ----------------------------------------------------------------------------------

function CardFace({ card, board, users, onOpen, compact }) {
  const labels = (card.labels || []).map((id) => board.labels.find((l) => l.id === id)).filter(Boolean);
  const people = (card.members || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const done = (card.checklist || []).filter((i) => i.done).length;
  const overdue = card.due_at && new Date(card.due_at) < new Date() && !Object.keys(card.publish || {}).length;
  return (
    <div className={c.card} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      {labels.length > 0 && (
        <div className={c.labels}>
          {labels.map((l) => (
            <span key={l.id} className={c.label} style={{ background: COLORS[l.color] || COLORS.gray }}>
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div dir="auto" className={hasFarsi(card.title) ? c.rtl : ""}>
        {card.title}
      </div>
      {!compact && (
        <div className={c.badges}>
          {card.publish_at && <span className={c.badge}>🗓 {shortWhen(card.publish_at)}</span>}
          {card.due_at && <span className={`${c.badge} ${overdue ? c.bad : ""}`}>Due {shortWhen(card.due_at)}</span>}
          {card.checklist && card.checklist.length > 0 && (
            <span className={`${c.badge} ${done === card.checklist.length ? c.ok : ""}`}>
              ☑ {done}/{card.checklist.length}
            </span>
          )}
          {card.approved && <span className={`${c.badge} ${c.ok}`}>Approved</span>}
          {card.stale_approval && <span className={`${c.badge} ${c.warn}`}>Changed after approval</span>}
          {CH.filter(([k]) => card.channels && card.channels[k] && card.channels[k].on).map(([k, short]) => {
            const st = (card.publish || {})[k];
            return (
              <span key={k} title={st ? `${k}: ${st.status}` : k} className={`${c.chan} ${st && st.status === "published" ? c.done : ""} ${st && ["failed", "unknown", "missed"].includes(st.status) ? c.failed : ""}`}>
                {short}
              </span>
            );
          })}
          {people.length > 0 && (
            <span className={c.avatars}>
              {people.map((u) => (
                <span key={u.id} className={c.avatar} title={u.name}>
                  {initials(u.name)}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SortableCard({ card, ...rest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: "card" } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? c.dragging : ""} {...attributes} {...listeners}>
      <CardFace card={card} {...rest} />
    </div>
  );
}

function ListColumn({ list, cards, board, users, onOpen, onAdd }) {
  const { setNodeRef } = useDroppable({ id: list.id, data: { type: "list" } });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(list.id, title.trim());
    setTitle("");
  };
  return (
    <section className={c.list} aria-label={list.name}>
      <div className={c.listHead}>
        <span className={c.grow}>{list.name}</span>
        <span className={c.count}>{cards.length}</span>
      </div>
      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={c.cards}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} board={board} users={users} onOpen={() => onOpen(card.id)} />
          ))}
        </div>
      </SortableContext>
      {adding ? (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea id={`new-${list.id}`} className={c.textarea} style={{ minHeight: 56 }} autoFocus placeholder="Card title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit(e)} />
          <div className={c.bar}>
            <button className={`${c.btn} ${c.primary}`}>Add card</button>
            <button type="button" className={`${c.btn} ${c.ghost}`} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className={c.addCard} onClick={() => setAdding(true)}>
          + Add a card
        </button>
      )}
    </section>
  );
}

// Position between the neighbours, so only the moved card is written (as in Trello).
function posBetween(prev, next) {
  if (prev && next) return (prev.pos + next.pos) / 2;
  if (prev) return prev.pos + 1000;
  if (next) return next.pos / 2;
  return 1000;
}

function BoardView({ board, users, filter, onOpen, onMove, onAdd }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const byId = useMemo(() => Object.fromEntries(board.cards.map((x) => [x.id, x])), [board]);
  const build = useCallback(() => {
    const cols = {};
    for (const l of board.lists) cols[l.id] = [];
    for (const card of [...board.cards].sort((a, b) => a.pos - b.pos)) if (cols[card.list_id] && filter(card)) cols[card.list_id].push(card.id);
    return cols;
  }, [board, filter]);
  const [cols, setCols] = useState(build);
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!active) setCols(build());
  }, [build, active]);
  const findCol = (id) => (cols[id] ? id : Object.keys(cols).find((k) => cols[k].includes(id)));

  const onDragOver = ({ active: a, over }) => {
    if (!over) return;
    const from = findCol(a.id);
    const to = findCol(over.id);
    if (!from || !to || from === to) return;
    setCols((prev) => {
      const target = [...prev[to]];
      const i = prev[to].indexOf(over.id);
      target.splice(i < 0 ? target.length : i, 0, a.id);
      return { ...prev, [from]: prev[from].filter((x) => x !== a.id), [to]: target };
    });
  };
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return setCols(build());
    const col = findCol(a.id);
    let ids = [...cols[col]];
    const oi = ids.indexOf(a.id);
    const ni = cols[over.id] ? ids.length - 1 : ids.indexOf(over.id);
    if (ni >= 0 && oi !== ni) {
      ids.splice(oi, 1);
      ids.splice(ni, 0, a.id);
      setCols({ ...cols, [col]: ids });
    }
    const idx = ids.indexOf(a.id);
    const card = byId[a.id];
    const prev = byId[ids[idx - 1]];
    const next = byId[ids[idx + 1]];
    if (card.list_id === col && (!prev || prev.pos < card.pos) && (!next || next.pos > card.pos)) return;
    onMove(a.id, { list_id: col, pos: posBetween(prev, next) });
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setActive(e.active.id)} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={c.board}>
        {board.lists.map((l) => (
          <ListColumn key={l.id} list={l} cards={(cols[l.id] || []).map((id) => byId[id]).filter(Boolean)} board={board} users={users} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
      <DragOverlay>{active && byId[active] ? <div className={c.overlay}><CardFace card={byId[active]} board={board} users={users} onOpen={() => {}} /></div> : null}</DragOverlay>
    </DndContext>
  );
}

// ---- month view ---------------------------------------------------------------------------------

function Mini({ card, board, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const label = board.labels.find((l) => l.id === (card.labels || [])[0]);
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`${c.mini} ${isDragging ? c.dragging : ""}`} style={{ borderLeftColor: label ? COLORS[label.color] : undefined }} onClick={() => onOpen(card.id)}>
      {card.publish_at && <b>{timeOf(card.publish_at)}{card.approved ? " ✓" : ""}</b>}
      <span dir="auto">{card.title}</span>
    </div>
  );
}

function DayCell({ date, month, cards, dues, board, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day-" + dayKey(date) });
  const today = dayKey(date) === dayKey(new Date());
  return (
    <div ref={setNodeRef} className={`${c.day} ${date.getMonth() !== month ? c.other : ""} ${today ? c.today : ""} ${isOver ? c.over : ""}`}>
      <span className={c.num}>{date.getDate()}</span>
      {cards.map((card) => (
        <Mini key={card.id} card={card} board={board} onOpen={onOpen} />
      ))}
      {dues.map((card) => (
        <span key={"d" + card.id} className={c.due} onClick={() => onOpen(card.id)} dir="auto">
          Due: {card.title}
        </span>
      ))}
    </div>
  );
}

function Unscheduled({ cards, board, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" });
  return (
    <aside ref={setNodeRef} className={c.side} style={isOver ? { background: "#fff4e5" } : undefined}>
      <div className={c.listHead}>
        <span className={c.grow}>No publish date</span>
        <span className={c.count}>{cards.length}</span>
      </div>
      <span className={c.muted}>Drag a card onto a day to schedule it. Drag it back here to unschedule.</span>
      {cards.map((card) => (
        <Mini key={card.id} card={card} board={board} onOpen={onOpen} />
      ))}
    </aside>
  );
}

function MonthView({ board, filter, onOpen, onMove }) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [showDue, setShowDue] = useState(true);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );
  const published = board.lists.find((l) => l.role === "published");
  const cards = board.cards.filter(filter);
  const start = new Date(anchor);
  start.setDate(1 - ((anchor.getDay() + 6) % 7)); // weeks start on Monday
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const byDay = {};
  const dueDay = {};
  for (const card of cards) {
    if (card.publish_at) (byDay[dayKey(new Date(card.publish_at))] ||= []).push(card);
    if (showDue && card.due_at) (dueDay[dayKey(new Date(card.due_at))] ||= []).push(card);
  }
  for (const k of Object.keys(byDay)) byDay[k].sort((a, b) => new Date(a.publish_at) - new Date(b.publish_at));
  const unscheduled = cards.filter((x) => !x.publish_at && (!published || x.list_id !== published.id));
  const [active, setActive] = useState(null);
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const card = board.cards.find((x) => x.id === a.id);
    if (over.id === "unscheduled") {
      if (card.publish_at) onMove(card.id, { publish_at: null });
      return;
    }
    const [y, m, d] = over.id.slice(4).split("-").map(Number);
    const old = card.publish_at ? new Date(card.publish_at) : null;
    const when = new Date(y, m - 1, d, old ? old.getHours() : 18, old ? old.getMinutes() : 0);
    if (!old || when.getTime() !== old.getTime()) onMove(card.id, { publish_at: when.toISOString() });
  };
  const title = anchor.toLocaleString([], { month: "long", year: "numeric" });
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={c.bar} style={{ marginBottom: 8 }}>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} aria-label="Previous month">
          ‹
        </button>
        <button className={c.btn} onClick={() => setAnchor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
          Today
        </button>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} aria-label="Next month">
          ›
        </button>
        <strong style={{ fontSize: 17 }}>{title}</strong>
        <span className={c.grow} />
        <label className={c.muted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input id="show-due" type="checkbox" checked={showDue} onChange={(e) => setShowDue(e.target.checked)} /> Show due dates
        </label>
      </div>
      <div className={c.calWrap}>
        <Unscheduled cards={unscheduled} board={board} onOpen={onOpen} />
        <div className={c.gridScroll}>
          <div className={c.grid}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className={c.dow}>
                {d}
              </div>
            ))}
            {days.map((d) => (
              <DayCell key={dayKey(d)} date={d} month={anchor.getMonth()} cards={byDay[dayKey(d)] || []} dues={dueDay[dayKey(d)] || []} board={board} onOpen={onOpen} />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>{active ? <div className={c.mini}>{board.cards.find((x) => x.id === active)?.title}</div> : null}</DragOverlay>
    </DndContext>
  );
}

// ---- card editor --------------------------------------------------------------------------------

function CardEditor({ boardId, cardId, board, users, me, channels, sources, onClose, onChanged }) {
  const [card, setCard] = useState(null);
  const [draft, setDraft] = useState(null);
  const [comments, setComments] = useState([]);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const admin = me.role === "admin";
  const load = useCallback(async () => {
    const d = await calApi(`/boards/${boardId}/cards/${cardId}`);
    setCard(d.card);
    setDraft(d.card);
    setComments(d.comments);
  }, [boardId, cardId]);
  useEffect(() => {
    load().catch((e) => setMsg({ error: e.message, ok: "" }));
  }, [load]);
  const dirty = card && draft && JSON.stringify(card) !== JSON.stringify(draft);
  const close = () => {
    if (dirty && !window.confirm("Close without saving your changes?")) return;
    onClose();
  };
  const set = (k, v) => setDraft({ ...draft, [k]: v });
  const setCh = (k, f, v) => set("channels", { ...draft.channels, [k]: { ...draft.channels[k], [f]: v } });
  const save = async () => {
    setBusy(true);
    try {
      const fields = ["title", "description", "labels", "members", "start_at", "due_at", "publish_at", "channels", "media", "links", "checklist", "list_id"];
      const body = {};
      for (const f of fields) if (JSON.stringify(card[f]) !== JSON.stringify(draft[f])) body[f] = draft[f];
      const d = await calApi(`/boards/${boardId}/cards/${cardId}`, { method: "PATCH", body });
      setCard({ ...card, ...d.card });
      setDraft({ ...card, ...d.card });
      setMsg({ error: "", ok: d.card.approved || !card.approval ? "Saved." : "Saved. The content changed, so Hamed needs to approve it again." });
      onChanged();
    } catch (e) {
      setMsg({ error: e.message, ok: "" });
    }
    setBusy(false);
  };
  const action = async (a, extra = {}) => {
    setBusy(true);
    try {
      await calApi(`/boards/${boardId}/cards/${cardId}/action`, { method: "POST", body: { action: a, ...extra } });
      if (a === "archive") {
        onChanged();
        onClose();
        return;
      }
      await load();
      onChanged();
      setMsg({ error: "", ok: a === "publish_now" ? "Publishing started. This card updates when each channel is done." : "Done." });
    } catch (e) {
      setMsg({ error: e.message, ok: "" });
    }
    setBusy(false);
  };
  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await calApi(`/boards/${boardId}/cards/${cardId}/comments`, { method: "POST", body: { text: comment } });
      setComment("");
      await load();
    } catch (err) {
      setMsg({ error: err.message, ok: "" });
    }
  };
  useEffect(() => {
    const live = card && Object.values(card.publish || {}).some((p) => p.status === "publishing");
    if (!live) return;
    const t = setInterval(() => load().catch(() => {}), 8000);
    return () => clearInterval(t);
  }, [card, load]);
  const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || (id === "scheduler" ? "Scheduler" : "Someone");
  return (
    <div className={c.modalBg} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={c.modal} role="dialog" aria-modal="true" aria-label="Card">
        {!draft ? (
          <p className={c.muted}>{msg.error || "Loading…"}</p>
        ) : (
          <>
            <div className={c.titleRow}>
              <input id="card-title" className={c.titleInput} dir="auto" value={draft.title} onChange={(e) => set("title", e.target.value)} aria-label="Title" />
              <button className={`${c.btn} ${c.ghost}`} onClick={close} aria-label="Close">
                ✕
              </button>
            </div>
            <div className={c.muted}>
              In list{" "}
              <select id="card-list" className={c.select} value={draft.list_id} onChange={(e) => set("list_id", e.target.value)}>
                {board.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>{" "}
              {draft.source && (
                <span>
                  · from {draft.source.type === "project" ? "Video Editing" : "the Topic Engine"}: <b dir="auto">{draft.source.title}</b>
                  {draft.source.url && (
                    <>
                      {" "}
                      <a href={draft.source.url} target="_blank" rel="noreferrer">
                        source
                      </a>
                    </>
                  )}
                </span>
              )}
            </div>
            <div className={c.modalGrid}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                <div className={c.section}>
                  <h3>Description</h3>
                  <textarea id="card-desc" className={c.textarea} dir="auto" value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Notes, script, brief…" />
                </div>
                <div className={c.section}>
                  <h3>Media</h3>
                  <div className={c.bar}>
                    <select id="media-kind" className={c.select} value={draft.media.kind} onChange={(e) => set("media", { ...draft.media, kind: e.target.value })}>
                      <option value="none">No media</option>
                      <option value="video">Video</option>
                      <option value="image">Image</option>
                    </select>
                    {draft.media.kind !== "none" && (
                      <input id="media-url" className={`${c.input} ${c.grow}`} placeholder="Drive link (Anyone with the link) or https:// file link" value={draft.media.url} onChange={(e) => set("media", { ...draft.media, url: e.target.value })} />
                    )}
                  </div>
                  {sources.videos.length > 0 && draft.media.kind === "video" && (
                    <select id="media-pick" className={c.select} value="" onChange={(e) => {
                      const v = sources.videos.find((x) => x.id === e.target.value);
                      if (v) set("media", { kind: "video", url: v.url, project_id: v.id });
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
                <div className={c.section}>
                  <h3>Channels and captions</h3>
                  {CH.map(([k, , name]) => {
                    const x = draft.channels[k];
                    const st = (draft.publish || {})[k];
                    const len = (x.caption || "").length;
                    return (
                      <div key={k} className={`${c.channel} ${x.on ? "" : c.off}`}>
                        <label className={c.bar} style={{ fontWeight: 600, fontSize: 14 }}>
                          <input id={`ch-${k}`} type="checkbox" checked={x.on} onChange={(e) => setCh(k, "on", e.target.checked)} /> {name}
                          {channels[k] && !channels[k].connected && <span className={`${c.badge} ${c.warn}`}>not connected</span>}
                          {st && (
                            <span className={`${c.badge} ${st.status === "published" ? c.ok : st.status === "publishing" ? "" : c.bad}`}>
                              {st.status}
                              {st.url && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a href={st.url} target="_blank" rel="noreferrer">
                                    open
                                  </a>
                                </>
                              )}
                            </span>
                          )}
                        </label>
                        {st && (st.error || st.note) && <span className={c.muted}>{st.error || st.note}</span>}
                        {st && admin && ["failed", "unknown", "missed"].includes(st.status) && (
                          <div>
                            <button className={c.btn} disabled={busy} onClick={() => action("retry", { channel: k })}>
                              Clear and allow another try
                            </button>
                          </div>
                        )}
                        {x.on && (
                          <>
                            {k === "instagram" && (
                              <select id="ig-format" className={c.select} value={x.format} onChange={(e) => setCh(k, "format", e.target.value)}>
                                <option value="reel">Reel (video)</option>
                                <option value="post">Feed post (image)</option>
                              </select>
                            )}
                            {k === "youtube" && <input id="yt-title" className={c.input} dir="auto" placeholder="YouTube title" value={x.title || ""} onChange={(e) => setCh(k, "title", e.target.value)} />}
                            <textarea id={`cap-${k}`} className={c.textarea} dir="auto" placeholder={k === "youtube" ? "Description" : "Caption"} value={x.caption} onChange={(e) => setCh(k, "caption", e.target.value)} />
                            <span className={c.muted} style={{ color: len > CAPTION_MAX[k] ? "#b42318" : undefined }}>
                              {len}/{CAPTION_MAX[k]}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className={c.section}>
                  <h3>Checklist</h3>
                  {(draft.checklist || []).map((i, n) => (
                    <label key={i.id || n} className={c.bar} style={{ fontSize: 14 }}>
                      <input id={`chk-${n}`} type="checkbox" checked={i.done} onChange={(e) => set("checklist", draft.checklist.map((x, j) => (j === n ? { ...x, done: e.target.checked } : x)))} />
                      <input id={`chk-t-${n}`} className={`${c.input} ${c.grow}`} dir="auto" value={i.text} onChange={(e) => set("checklist", draft.checklist.map((x, j) => (j === n ? { ...x, text: e.target.value } : x)))} />
                      <button className={`${c.btn} ${c.ghost}`} onClick={() => set("checklist", draft.checklist.filter((_, j) => j !== n))} aria-label="Remove item">
                        ✕
                      </button>
                    </label>
                  ))}
                  <div>
                    <button className={c.btn} onClick={() => set("checklist", [...(draft.checklist || []), { text: "", done: false }])}>
                      + Add an item
                    </button>
                  </div>
                </div>
                <div className={c.section}>
                  <h3>Comments and history</h3>
                  <form onSubmit={addComment} className={c.bar}>
                    <input id="comment" className={`${c.input} ${c.grow}`} dir="auto" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                    <button className={c.btn}>Send</button>
                  </form>
                  {[...comments].reverse().map((m) =>
                    m.type === "comment" ? (
                      <div key={m.id} className={c.comment}>
                        <span className={c.muted}>
                          <b>{nameOf(m.by)}</b> · {shortWhen(new Date(m.at).toISOString())}
                        </span>
                        <span dir="auto">{m.text}</span>
                      </div>
                    ) : (
                      <div key={m.id} className={c.event}>
                        {nameOf(m.by)} {m.text} · {shortWhen(new Date(m.at).toISOString())}
                      </div>
                    )
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
                <div className={c.section}>
                  <h3>Publish</h3>
                  <input id="publish-at" type="datetime-local" className={c.input} value={toLocalInput(draft.publish_at)} onChange={(e) => set("publish_at", fromLocalInput(e.target.value))} />
                  {card.approved ? (
                    <span className={c.note}>Approved by Hamed. It goes out at the publish time{draft.publish_at ? "" : " (set one)"}.</span>
                  ) : card.approval ? (
                    <span className={c.error}>Changed after approval: Hamed needs to approve it again.</span>
                  ) : (
                    <span className={c.muted}>Waiting for Hamed's approval. Nothing is published before that.</span>
                  )}
                  {admin && (
                    <div className={c.bar}>
                      {!card.approved ? (
                        <button className={`${c.btn} ${c.primary}`} disabled={busy || dirty} onClick={() => action("approve")} title={dirty ? "Save first" : ""}>
                          Approve for publishing
                        </button>
                      ) : (
                        <>
                          <button className={c.btn} disabled={busy} onClick={() => action("unapprove")}>
                            Withdraw approval
                          </button>
                          <button className={`${c.btn} ${c.primary}`} disabled={busy || dirty} onClick={() => window.confirm("Publish on the selected channels now?") && action("publish_now")}>
                            Publish now
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className={c.section}>
                  <h3>Timeline</h3>
                  <label className={c.field}>
                    Start
                    <input id="start-at" type="datetime-local" className={c.input} value={toLocalInput(draft.start_at)} onChange={(e) => set("start_at", fromLocalInput(e.target.value))} />
                  </label>
                  <label className={c.field}>
                    Due (ready by)
                    <input id="due-at" type="datetime-local" className={c.input} value={toLocalInput(draft.due_at)} onChange={(e) => set("due_at", fromLocalInput(e.target.value))} />
                  </label>
                </div>
                <div className={c.section}>
                  <h3>Labels</h3>
                  <div className={c.bar}>
                    {board.labels.map((l) => {
                      const on = (draft.labels || []).includes(l.id);
                      return (
                        <button key={l.id} className={`${c.chip} ${on ? c.on : ""}`} style={on ? { background: COLORS[l.color] } : undefined} onClick={() => set("labels", on ? draft.labels.filter((x) => x !== l.id) : [...(draft.labels || []), l.id])}>
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={c.section}>
                  <h3>Members</h3>
                  <div className={c.bar}>
                    {users.map((u) => {
                      const on = (draft.members || []).includes(u.id);
                      return (
                        <button key={u.id} className={`${c.chip} ${on ? c.on : ""}`} style={on ? { background: "#121a24" } : undefined} onClick={() => set("members", on ? draft.members.filter((x) => x !== u.id) : [...(draft.members || []), u.id])}>
                          {u.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={c.section}>
                  <h3>Links</h3>
                  {LINKS.map(([k, name]) => (
                    <label key={k} className={c.field}>
                      {name}
                      {draft.links && draft.links[k] ? (
                        <a href={draft.links[k]} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>
                          open
                        </a>
                      ) : null}
                      <input id={`link-${k}`} className={c.input} placeholder="https://" value={(draft.links || {})[k] || ""} onChange={(e) => set("links", { ...(draft.links || {}), [k]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <div className={c.section}>
                  <button className={`${c.btn} ${c.danger}`} disabled={busy} onClick={() => window.confirm("Archive this card?") && action("archive")}>
                    Archive card
                  </button>
                </div>
              </div>
            </div>
            {msg.error && <div className={c.error}>{msg.error}</div>}
            {msg.ok && <div className={c.note}>{msg.ok}</div>}
            <div className={c.bar} style={{ position: "sticky", bottom: 0, background: "var(--surface)", paddingTop: 8 }}>
              <button className={`${c.btn} ${c.primary}`} disabled={!dirty || busy} onClick={save}>
                {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </button>
              <button className={c.btn} onClick={close}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function calApi(path, opts) {
  return apiAt("/api/calendar", path, opts);
}

// ---- pickers and settings -----------------------------------------------------------------------

function SourcePicker({ sources, admin, onPick, onClose }) {
  const [q, setQ] = useState("");
  const match = (t) => !q || String(t || "").toLowerCase().includes(q.toLowerCase());
  return (
    <div className={c.modalBg} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={c.modal} style={{ width: "min(640px, 100%)" }}>
        <div className={c.bar}>
          <strong className={c.grow}>Add a card from a topic or a video</strong>
          <button className={`${c.btn} ${c.ghost}`} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <input id="pick-q" className={c.input} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className={c.picker}>
          {sources.videos.filter((v) => match(v.title)).map((v) => (
            <button key={v.id} className={c.pickItem} onClick={() => onPick({ type: "project", key: v.id, title: v.title, url: v.url }, v)}>
              <b dir="auto">🎬 {v.title}</b>
              <span className={c.muted}>Approved video, version {v.version}{v.topic ? ` · ${v.topic}` : ""}</span>
            </button>
          ))}
          {admin &&
            sources.topics.filter((t) => match(t.title) || match(t.title_fa)).map((t) => (
              <button key={t.key} className={c.pickItem} onClick={() => onPick({ type: "topic", key: t.key, title: t.title, url: t.url })}>
                <b dir="auto">{t.title}</b>
                {t.title_fa && t.title_fa !== t.title && <span className={c.rtl} dir="rtl">{t.title_fa}</span>}
                <span className={c.muted}>Topic · {t.status}{t.has.length ? ` · has ${t.has.join(", ")}` : ""}</span>
              </button>
            ))}
          {!sources.videos.length && !(admin && sources.topics.length) && <p className={c.muted}>Nothing to add yet: approved videos and Topic Engine topics appear here.</p>}
        </div>
      </div>
    </div>
  );
}

function ChannelsPanel({ channels, settings, onClose }) {
  return (
    <div className={c.modalBg} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={c.modal} style={{ width: "min(640px, 100%)" }}>
        <div className={c.bar}>
          <strong className={c.grow}>Publishing channels</strong>
          <button className={`${c.btn} ${c.ghost}`} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {settings.dry_run && <div className={c.note}>Test mode is on: publishing only pretends (CALENDAR_DRY_RUN).</div>}
        {!settings.autopublish && <div className={c.muted}>The publishing clock is off (CALENDAR_AUTOPUBLISH): approved cards go out only with “Publish now”.</div>}
        {CH.map(([k, , name]) => {
          const s = channels[k] || {};
          return (
            <div key={k} className={c.channel}>
              <div className={c.bar}>
                <b className={c.grow}>{name}</b>
                <span className={`${c.badge} ${s.connected ? c.ok : c.warn}`}>{s.connected ? "connected" : "not connected"}</span>
                {s.connect && (
                  <a className={c.btn} href={`/api/calendar/connect/${k}`}>
                    {s.connected ? "Reconnect" : "Connect"}
                  </a>
                )}
              </div>
              <span className={c.muted}>{s.detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardSettings({ board, onSave, onClose }) {
  const [lists, setLists] = useState(board.lists.map((l) => ({ ...l })));
  const [labels, setLabels] = useState(board.labels.map((l) => ({ ...l })));
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await onSave({ lists, labels });
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };
  const move = (i, d) => {
    const n = [...lists];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setLists(n);
  };
  return (
    <div className={c.modalBg} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={c.modal} style={{ width: "min(640px, 100%)" }}>
        <strong>Lists and labels of {board.name}</strong>
        <div className={c.section}>
          <h3>Lists</h3>
          {lists.map((l, i) => (
            <div key={l.id || i} className={c.bar}>
              <input id={`list-${i}`} className={`${c.input} ${c.grow}`} value={l.name} onChange={(e) => setLists(lists.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select id={`role-${i}`} className={c.select} value={l.role || ""} onChange={(e) => setLists(lists.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} title="Approved cards move to the 'scheduled' list; fully published cards to the 'published' list">
                <option value="">Normal</option>
                <option value="scheduled">Approved goes here</option>
                <option value="published">Published goes here</option>
              </select>
              <button className={c.btn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button className={c.btn} disabled={i === lists.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
              <button className={`${c.btn} ${c.danger}`} onClick={() => setLists(lists.filter((_, j) => j !== i))} aria-label="Remove list">
                ✕
              </button>
            </div>
          ))}
          <div>
            <button className={c.btn} onClick={() => setLists([...lists, { name: "New list", role: "" }])}>
              + Add a list
            </button>
          </div>
        </div>
        <div className={c.section}>
          <h3>Labels</h3>
          {labels.map((l, i) => (
            <div key={l.id || i} className={c.bar}>
              <span className={c.label} style={{ background: COLORS[l.color] }}>
                {l.name || "label"}
              </span>
              <input id={`label-${i}`} className={`${c.input} ${c.grow}`} value={l.name} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <select id={`color-${i}`} className={c.select} value={l.color} onChange={(e) => setLabels(labels.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}>
                {Object.keys(COLORS).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button className={`${c.btn} ${c.danger}`} onClick={() => setLabels(labels.filter((_, j) => j !== i))} aria-label="Remove label">
                ✕
              </button>
            </div>
          ))}
          <div>
            <button className={c.btn} onClick={() => setLabels([...labels, { name: "", color: "gray" }])}>
              + Add a label
            </button>
          </div>
        </div>
        {error && <div className={c.error}>{error}</div>}
        <div className={c.bar}>
          <button className={`${c.btn} ${c.primary}`} onClick={save}>
            Save
          </button>
          <button className={c.btn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- page ---------------------------------------------------------------------------------------

function Calendar({ user }) {
  const q = useSearchParams();
  const admin = user.role === "admin";
  const [boards, setBoards] = useState([]);
  const [bid, setBid] = useState("");
  const [data, setData] = useState(null);
  const [view, setView] = useState("board");
  const [open, setOpen] = useState("");
  const [panel, setPanel] = useState("");
  const [sources, setSources] = useState({ topics: [], videos: [] });
  const [error, setError] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [mine, setMine] = useState(false);
  const busy = useRef(0);

  useEffect(() => {
    try {
      const v = localStorage.getItem("cal-view");
      if (v) setView(v);
    } catch (_) {}
    calApi("/boards")
      .then((d) => {
        setBoards(d.boards);
        let saved = "";
        try {
          saved = localStorage.getItem("cal-board") || "";
        } catch (_) {}
        setBid(d.boards.some((b) => b.id === saved) ? saved : d.boards[0]?.id || "");
      })
      .catch((e) => setError(e.message));
    calApi("/sources").then(setSources).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    if (!bid) return;
    try {
      const d = await calApi(`/boards/${bid}`);
      if (busy.current === 0) setData(d);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [bid]);
  useEffect(() => {
    setData(null);
    load();
    try {
      if (bid) localStorage.setItem("cal-board", bid);
    } catch (_) {}
    const t = setInterval(() => !open && load(), 20000);
    return () => clearInterval(t);
  }, [bid, load, open]);
  useEffect(() => {
    try {
      localStorage.setItem("cal-view", view);
    } catch (_) {}
  }, [view]);

  // Optimistic: the card moves at once; the server write follows and a failure reloads the board.
  const move = async (id, fields) => {
    setData((d) => ({ ...d, board: { ...d.board, cards: d.board.cards.map((x) => (x.id === id ? { ...x, ...fields } : x)) } }));
    busy.current++;
    try {
      await calApi(`/boards/${bid}/cards/${id}`, { method: "PATCH", body: fields });
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current--;
      load();
    }
  };
  const add = async (listId, title, extra = {}) => {
    try {
      const { card } = await calApi(`/boards/${bid}/cards`, { method: "POST", body: { title, list_id: listId, ...extra } });
      await load();
      return card;
    } catch (e) {
      setError(e.message);
    }
  };
  const addBoard = async () => {
    const name = window.prompt("Name of the new board (for example a market or a page)");
    if (!name) return;
    try {
      const { board } = await calApi("/boards", { method: "POST", body: { name } });
      setBoards([...boards, { id: board.id, name: board.name }]);
      setBid(board.id);
    } catch (e) {
      setError(e.message);
    }
  };
  const fromSource = async (source, video) => {
    setPanel("");
    const card = await add(data.board.lists[0].id, source.title, {
      source,
      ...(video ? { media: { kind: "video", url: video.url, project_id: video.id } } : {}),
    });
    if (card) setOpen(card.id);
  };
  const filter = useCallback(
    (card) => (!labelFilter || (card.labels || []).includes(labelFilter)) && (!mine || (card.members || []).includes(user.id)),
    [labelFilter, mine, user.id]
  );

  return (
    <>
      {q.get("connected") && <div className={c.note}>{q.get("connected")}</div>}
      <div className={c.bar}>
        <div className={c.tabs}>
          {boards.map((b) => (
            <button key={b.id} className={`${c.tab} ${b.id === bid ? c.on : ""}`} onClick={() => setBid(b.id)}>
              {b.name}
            </button>
          ))}
          {admin && (
            <button className={c.tab} onClick={addBoard} title="Add a board">
              +
            </button>
          )}
        </div>
        <span className={c.grow} />
        <div className={c.seg} role="tablist">
          <button className={view === "board" ? c.on : ""} onClick={() => setView("board")}>
            Board
          </button>
          <button className={view === "calendar" ? c.on : ""} onClick={() => setView("calendar")}>
            Calendar
          </button>
        </div>
      </div>
      {data && (
        <div className={c.bar}>
          <button className={`${c.btn} ${c.primary}`} onClick={() => setPanel("source")}>
            + From a topic or video
          </button>
          <select id="label-filter" className={c.select} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} aria-label="Filter by label">
            <option value="">All labels</option>
            {data.board.labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <label className={c.muted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input id="mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only my cards
          </label>
          <span className={c.grow} />
          {data.settings.dry_run && <span className={`${c.badge} ${c.warn}`}>Test mode: nothing is really posted</span>}
          <button className={c.btn} onClick={() => setPanel("channels")}>
            Channels
          </button>
          {admin && (
            <button className={c.btn} onClick={() => setPanel("settings")}>
              Lists and labels
            </button>
          )}
        </div>
      )}
      {error && <div className={c.error}>{error}</div>}
      {!data ? (
        <p className={c.muted}>{boards.length || error ? "Loading the board…" : "Loading…"}</p>
      ) : view === "board" ? (
        <BoardView board={data.board} users={data.users} filter={filter} onOpen={setOpen} onMove={move} onAdd={(listId, title) => add(listId, title)} />
      ) : (
        <MonthView board={data.board} filter={filter} onOpen={setOpen} onMove={move} />
      )}
      {open && data && (
        <CardEditor key={open} boardId={bid} cardId={open} board={data.board} users={data.users} me={data.me} channels={data.channels} sources={sources} onClose={() => setOpen("")} onChanged={load} />
      )}
      {panel === "source" && data && <SourcePicker sources={sources} admin={admin} onPick={fromSource} onClose={() => setPanel("")} />}
      {panel === "channels" && data && <ChannelsPanel channels={data.channels} settings={data.settings} onClose={() => setPanel("")} />}
      {panel === "settings" && data && (
        <BoardSettings board={data.board} onSave={async (body) => {
          await calApi(`/boards/${bid}`, { method: "PATCH", body });
          await load();
        }} onClose={() => setPanel("")} />
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell wide>
      {(user) => (
        <Suspense>
          <Calendar user={user} />
        </Suspense>
      )}
    </Shell>
  );
}

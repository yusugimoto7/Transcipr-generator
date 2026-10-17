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
import p from "./publishing.module.css";
import Composer, { NetChip, StatusPill } from "./Composer";
import { WeekView, PostList, LIST_TABS, inTab, Tile, captionOf } from "./Publishing";
import { NETWORKS, onNetworks } from "./channels";

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

function DayCell({ date, month, cards, dues, onOpen, onNew }) {
  const { setNodeRef, isOver } = useDroppable({ id: "day-" + dayKey(date) });
  const today = dayKey(date) === dayKey(new Date());
  return (
    <div ref={setNodeRef} onDoubleClick={() => onNew(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18).toISOString())} className={`${c.day} ${date.getMonth() !== month ? c.other : ""} ${today ? c.today : ""} ${isOver ? c.over : ""}`}>
      <span className={c.num}>{date.getDate()}</span>
      {cards.map((card) => (
        <Tile key={card.id} card={card} onOpen={onOpen} />
      ))}
      {dues.map((card) => (
        <span key={"d" + card.id} className={c.due} onClick={() => onOpen(card)} dir="auto">
          Due: {card.title}
        </span>
      ))}
    </div>
  );
}

function Unscheduled({ cards, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unscheduled" });
  return (
    <aside ref={setNodeRef} className={c.side} style={isOver ? { background: "#fff4e5" } : undefined}>
      <div className={c.listHead}>
        <span className={c.grow}>No publish date</span>
        <span className={c.count}>{cards.length}</span>
      </div>
      <span className={c.muted}>Drag a post onto a day to schedule it, or back here to unschedule.</span>
      {cards.map((card) => (
        <Tile key={card.id} card={card} onOpen={onOpen} />
      ))}
    </aside>
  );
}

function MonthView({ cards, onOpen, onMove, onNew }) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [showDue, setShowDue] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } })
  );
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
  const unscheduled = cards.filter((x) => !x.publish_at && x.status !== "published" && onNetworks(x).length);
  const [active, setActive] = useState(null);
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const card = cards.find((x) => x.id === a.id);
    if (over.id === "unscheduled") {
      if (card.publish_at) onMove(card, { publish_at: null });
      return;
    }
    const [y, m, d] = over.id.slice(4).split("-").map(Number);
    const old = card.publish_at ? new Date(card.publish_at) : null;
    const when = new Date(y, m - 1, d, old ? old.getHours() : 18, old ? old.getMinutes() : 0);
    if (!old || when.getTime() !== old.getTime()) onMove(card, { publish_at: when.toISOString() });
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
        <Unscheduled cards={unscheduled} onOpen={onOpen} />
        <div className={c.gridScroll}>
          <div className={c.grid}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className={c.dow}>
                {d}
              </div>
            ))}
            {days.map((d) => (
              <DayCell key={dayKey(d)} date={d} month={anchor.getMonth()} cards={byDay[dayKey(d)] || []} dues={dueDay[dayKey(d)] || []} onOpen={onOpen} onNew={onNew} />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay>{active ? <div className={c.mini}>{cards.find((x) => x.id === active)?.title}</div> : null}</DragOverlay>
    </DndContext>
  );
}

// ---- card editor --------------------------------------------------------------------------------

function CardEditor({ boardId, cardId, board, users, onClose, onChanged, onCompose }) {
  const [card, setCard] = useState(null);
  const [draft, setDraft] = useState(null);
  const [comments, setComments] = useState([]);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
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
  const save = async () => {
    setBusy(true);
    try {
      const fields = ["title", "description", "labels", "members", "start_at", "due_at", "links", "checklist", "list_id"];
      const body = {};
      for (const f of fields) if (JSON.stringify(card[f]) !== JSON.stringify(draft[f])) body[f] = draft[f];
      const d = await calApi(`/boards/${boardId}/cards/${cardId}`, { method: "PATCH", body });
      setCard({ ...card, ...d.card });
      setDraft({ ...card, ...d.card });
      setMsg({ error: "", ok: "Saved." });
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
      setMsg({ error: "", ok: "Done." });
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
                  <h3>Post</h3>
                  <div className={c.bar}>
                    <StatusPill status={card.status} />
                    {onNetworks(card).map((n) => (
                      <NetChip key={n.key} k={n.key} state={(card.publish || {})[n.key]?.status} />
                    ))}
                    {card.publish_at && <span className={c.muted}>{shortWhen(card.publish_at)}</span>}
                  </div>
                  {captionOf(card) && (
                    <p dir="auto" className={c.muted} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                      {captionOf(card).slice(0, 280)}
                    </p>
                  )}
                  <div>
                    <button className={`${c.btn} ${c.primary}`} onClick={() => (dirty && !window.confirm("Close without saving your changes?") ? null : onCompose(boardId, cardId))}>
                      {onNetworks(card).length ? "Edit the post" : "Write the post"}
                    </button>
                  </div>
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

const VIEWS = [
  ["month", "Calendar"],
  ["week", "Week"],
];

function Calendar({ user }) {
  const q = useSearchParams();
  const admin = user.role === "admin";
  const [boards, setBoards] = useState([]);
  const [data, setData] = useState({}); // board id -> { board, users, channels, settings, me }
  const [market, setMarket] = useState("all");
  const [view, setView] = useState("month");
  const [nets, setNets] = useState([]); // network filter, empty = all
  const [labelFilter, setLabelFilter] = useState("");
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState(null); // planning card { bid, id }
  const [compose, setCompose] = useState(null); // { bid, id, start }
  const [panel, setPanel] = useState("");
  const [sources, setSources] = useState({ topics: [], videos: [] });
  const [error, setError] = useState("");
  const busy = useRef(0);

  useEffect(() => {
    try {
      setView(localStorage.getItem("cal-view2") || "month");
      setMarket(localStorage.getItem("cal-market") || "all");
    } catch (_) {}
    calApi("/boards").then((d) => setBoards(d.boards)).catch((e) => setError(e.message));
    calApi("/sources").then(setSources).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("cal-view2", view);
      localStorage.setItem("cal-market", market);
    } catch (_) {}
  }, [view, market]);

  const load = useCallback(async () => {
    if (!boards.length) return;
    try {
      const all = await Promise.all(boards.map((b) => calApi(`/boards/${b.id}`)));
      if (busy.current === 0) setData(Object.fromEntries(all.map((d) => [d.board.id, d])));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [boards]);
  useEffect(() => {
    load();
    const t = setInterval(() => !open && !compose && load(), 20000);
    return () => clearInterval(t);
  }, [load, open, compose]);

  // Opened from a topic ("Open in calendar"): show that post in the composer once its board is in.
  const deep = useRef(false);
  useEffect(() => {
    const bid = q.get("board");
    const cid = q.get("card");
    if (deep.current || !bid || !cid || !data[bid]) return;
    deep.current = true;
    if (data[bid].board.cards.some((x) => x.id === cid)) setCompose({ bid, id: cid });
  }, [q, data]);

  const first = boards[0] && data[boards[0].id];
  const one = market !== "all" && data[market] ? data[market] : null;
  const planBoard = one || first;
  const allCards = Object.values(data).flatMap((d) => d.board.cards.map((x) => ({ ...x, board_id: d.board.id, board_name: d.board.name })));
  const cards = allCards.filter(
    (x) =>
      (market === "all" || x.board_id === market) &&
      (!nets.length || onNetworks(x).some((n) => nets.includes(n.key))) &&
      (!mine || (x.members || []).includes(user.id) || x.created_by === user.id)
  );
  const counts = Object.fromEntries(LIST_TABS.map(([k]) => [k, cards.filter((x) => inTab(x, k)).length]));

  // Optimistic: the post moves at once; the server write follows and a failure reloads.
  const move = async (card, fields) => {
    setData((d) => {
      const b = d[card.board_id].board;
      return { ...d, [card.board_id]: { ...d[card.board_id], board: { ...b, cards: b.cards.map((x) => (x.id === card.id ? { ...x, ...fields } : x)) } } };
    });
    busy.current++;
    try {
      await calApi(`/boards/${card.board_id}/cards/${card.id}`, { method: "PATCH", body: fields });
    } catch (e) {
      setError(e.message);
    } finally {
      busy.current--;
      load();
    }
  };
  const add = async (bid, listId, title, extra = {}) => {
    try {
      const { card } = await calApi(`/boards/${bid}/cards`, { method: "POST", body: { title, list_id: listId, ...extra } });
      await load();
      return card;
    } catch (e) {
      setError(e.message);
    }
  };
  const quick = async (card, action) => {
    let note = "";
    if (action === "reject") {
      note = window.prompt("What should change? (sent to the team with the post)");
      if (note === null) return;
    }
    try {
      await calApi(`/boards/${card.board_id}/cards/${card.id}/action`, { method: "POST", body: { action, note } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  const addBoard = async () => {
    const name = window.prompt("Name of the new market or page");
    if (!name) return;
    try {
      const { board } = await calApi("/boards", { method: "POST", body: { name } });
      setBoards([...boards, { id: board.id, name: board.name }]);
      setMarket(board.id);
    } catch (e) {
      setError(e.message);
    }
  };
  const fromSource = async (source, video) => {
    setPanel("");
    const b = planBoard.board;
    const card = await add(b.id, b.lists[0].id, source.title, {
      source,
      ...(video ? { media: { kind: "video", url: video.url, project_id: video.id } } : {}),
    });
    if (card) setOpen({ bid: b.id, id: card.id });
  };
  const openPost = (card) => setCompose({ bid: card.board_id, id: card.id });
  const newPost = (start) => setCompose({ bid: market !== "all" ? market : boards[0]?.id, id: "", start: typeof start === "string" ? start : "" });
  const planFilter = useCallback(
    (card) => (!labelFilter || (card.labels || []).includes(labelFilter)) && (!mine || (card.members || []).includes(user.id)),
    [labelFilter, mine, user.id]
  );
  const ready = boards.length > 0 && boards.every((b) => data[b.id]);

  const NavItem = ({ v, label, n }) => (
    <button className={`${p.nav} ${view === v ? p.on : ""}`} onClick={() => setView(v)}>
      <span>{label}</span>
      {n !== undefined && <span className={p.n}>{n}</span>}
    </button>
  );

  return (
    <div className={p.shell}>
      <nav className={p.side} aria-label="Content calendar">
        <button className={p.newPost} onClick={() => newPost()} disabled={!ready}>
          + New post
        </button>
        <div className={p.navHead}>Publishing</div>
        {VIEWS.map(([v, label]) => (
          <NavItem key={v} v={v} label={label} />
        ))}
        <div className={p.navHead}>Posts</div>
        {LIST_TABS.map(([k, label]) => (
          <NavItem key={k} v={"list-" + k} label={label} n={counts[k]} />
        ))}
        <div className={p.navHead}>Planning</div>
        <NavItem v="board" label="Board" />
        <button className={p.nav} onClick={() => setPanel("source")} disabled={!ready}>
          <span>From a topic or video</span>
        </button>
        <div className={p.navHead}>Settings</div>
        <button className={p.nav} onClick={() => setPanel("channels")} disabled={!ready}>
          <span>Channels</span>
        </button>
        {admin && (
          <button className={p.nav} onClick={() => setPanel("settings")} disabled={!ready}>
            <span>Lists and labels</span>
          </button>
        )}
      </nav>

      <div className={p.main}>
        {q.get("connected") && <div className={c.note}>{q.get("connected")}</div>}
        <div className={c.bar}>
          <div className={c.tabs}>
            {view !== "board" && (
              <button className={`${c.tab} ${market === "all" ? c.on : ""}`} onClick={() => setMarket("all")}>
                All markets
              </button>
            )}
            {boards.map((b) => (
              <button key={b.id} className={`${c.tab} ${(market === b.id || (view === "board" && market === "all" && b.id === boards[0].id)) ? c.on : ""}`} onClick={() => setMarket(b.id)}>
                {b.name}
              </button>
            ))}
            {admin && (
              <button className={c.tab} onClick={addBoard} title="Add a market or page">
                +
              </button>
            )}
          </div>
          <span className={c.grow} />
          {first && first.settings.dry_run && <span className={`${c.badge} ${c.warn}`}>Test mode: nothing is really posted</span>}
        </div>
        {view !== "board" ? (
          <div className={c.bar}>
            <span className={c.muted}>Networks</span>
            {NETWORKS.map((n) => {
              const sel = nets.includes(n.key);
              return (
                <button key={n.key} className={`${c.chip} ${sel ? c.on : ""}`} style={sel ? { background: n.color } : undefined} onClick={() => setNets(sel ? nets.filter((x) => x !== n.key) : [...nets, n.key])}>
                  {n.name}
                </button>
              );
            })}
            <label className={c.muted} style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
              <input id="mine" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine
            </label>
          </div>
        ) : (
          planBoard && (
            <div className={c.bar}>
              <select id="label-filter" className={c.select} value={labelFilter} onChange={(e) => setLabelFilter(e.target.value)} aria-label="Filter by label">
                <option value="">All labels</option>
                {planBoard.board.labels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <label className={c.muted} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input id="mine-plan" type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only my cards
              </label>
            </div>
          )
        )}
        {error && <div className={c.error}>{error}</div>}
        {!ready ? (
          <p className={c.muted}>Loading…</p>
        ) : view === "month" ? (
          <MonthView cards={cards} onOpen={openPost} onMove={move} onNew={newPost} />
        ) : view === "week" ? (
          <WeekView cards={cards} onOpen={openPost} onMove={move} onNew={newPost} />
        ) : view === "board" ? (
          <BoardView
            board={planBoard.board}
            users={planBoard.users}
            filter={planFilter}
            onOpen={(id) => setOpen({ bid: planBoard.board.id, id })}
            onMove={(id, fields) => move({ id, board_id: planBoard.board.id }, fields)}
            onAdd={(listId, title) => add(planBoard.board.id, listId, title)}
          />
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 18 }}>{LIST_TABS.find(([k]) => "list-" + k === view)?.[1]}</h2>
            <PostList cards={cards} tab={view.slice(5)} admin={admin} onOpen={openPost} onAction={quick} />
          </>
        )}
      </div>

      {open && data[open.bid] && (
        <CardEditor key={open.id} boardId={open.bid} cardId={open.id} board={data[open.bid].board} users={data[open.bid].users} onClose={() => setOpen(null)} onChanged={load} onCompose={(bid, id) => {
          setOpen(null);
          setCompose({ bid, id });
        }} />
      )}
      {compose && first && (
        <Composer
          key={compose.id || "new" + compose.start}
          boards={boards}
          boardId={compose.bid}
          cardId={compose.id}
          start={compose.start}
          me={first.me}
          channels={first.channels}
          sources={sources}
          onClose={() => {
            setCompose(null);
            load();
          }}
          onSaved={load}
          onOpenCard={(bid, id) => {
            setCompose(null);
            setOpen({ bid, id });
          }}
        />
      )}
      {panel === "source" && planBoard && <SourcePicker sources={sources} admin={admin} onPick={fromSource} onClose={() => setPanel("")} />}
      {panel === "channels" && first && <ChannelsPanel channels={first.channels} settings={first.settings} onClose={() => setPanel("")} />}
      {panel === "settings" && planBoard && (
        <BoardSettings board={planBoard.board} onSave={async (body) => {
          await calApi(`/boards/${planBoard.board.id}`, { method: "PATCH", body });
          await load();
        }} onClose={() => setPanel("")} />
      )}
    </div>
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

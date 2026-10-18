"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  closestCorners, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Shell, apiAt, Avatar } from "../editing/ui";
import c from "./calendar.module.css";
import p from "./publishing.module.css";
import Composer, { NetChip, StatusPill } from "./Composer";
import { WeekView, PostList, LIST_TABS, inTab, Tile, captionOf, ZoneBanner } from "./Publishing";
import { whenAll, pickerNote } from "../../lib/tz";
import { NETWORKS, STATUS, onNetworks, thumbOf } from "./channels";
import { AlignLeft, Archive, ArrowRight, CalendarDays, Check, Clock, Link2, MessageSquare, Megaphone, Paperclip, Pencil, Play, Plus, SquareCheck, Tag, Users, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input, Textarea } from "../../components/ui/input";

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

function fileCount(media) {
  if (!media || media.kind === "none") return 0;
  return (media.items && media.items.length) || (media.url ? 1 : 0);
}

// When a date is: Trello colours a due date red when late and yellow when close.
function dueState(card) {
  if (!card.due_at) return "";
  if (card.status === "published") return "done";
  const t = new Date(card.due_at).getTime() - Date.now();
  return t < 0 ? "late" : t < 24 * 3600 * 1000 ? "soon" : "";
}

// Labels as soft tints with dark text (the new look), keyed by the board's colour names.
const LABEL_TINT = {
  sky: ["#e0f2fe", "#075985"], orange: ["#ffedd5", "#9a3412"], yellow: ["#fef9c3", "#854d0e"], purple: ["#ede9fe", "#5b21b6"],
  green: ["#dcfce7", "#166534"], red: ["#fee2e2", "#991b1b"], pink: ["#fce7f3", "#9d174d"], lime: ["#ecfccb", "#3f6212"],
  gray: ["#f1efe9", "#3f3f46"], navy: ["#dbeafe", "#1e3a8a"],
};
const STATUS_BADGE = { draft: "draft", pending: "pending", approved: "scheduled", scheduled: "scheduled", publishing: "scheduled", published: "published", failed: "failed" };

function CardFace({ card, board, users, onOpen }) {
  const labels = (card.labels || []).map((id) => board.labels.find((l) => l.id === id)).filter(Boolean);
  const people = (card.members || []).map((id) => users.find((u) => u.id === id)).filter(Boolean);
  const done = (card.checklist || []).filter((i) => i.done).length;
  const files = fileCount(card.media);
  const cover = thumbOf(card.media);
  const due = dueState(card);
  const st = STATUS[card.status] || STATUS.draft;
  const nets = onNetworks(card);
  const dueTone = due === "late" ? "bg-[#fef2f2] text-[#b91c1c]" : due === "soon" ? "bg-[#fff7ed] text-[#9a3412]" : due === "done" ? "bg-[#f0fdf4] text-[#15803d]" : "text-muted";
  return (
    <div
      className="flex cursor-pointer select-none flex-col overflow-hidden rounded-[10px] border border-solid border-border bg-surface text-sm text-ink transition-shadow [touch-action:manipulation] hover:shadow-[0_0_0_2px_var(--orange)] focus-visible:shadow-[0_0_0_2px_var(--orange)] focus-visible:outline-none"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      {(cover || card.media?.kind === "video") && (
        <div className="relative grid h-[132px] place-items-center bg-[#1d3038] bg-cover bg-center" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
          {card.media.kind === "video" && (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white">
              <Play size={14} fill="currentColor" />
            </span>
          )}
          {files > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11.5px] font-bold text-white">1/{files}</span>}
        </div>
      )}
      <div className="flex flex-col gap-2 px-3 py-2.5">
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((l) => {
              const [bg, fg] = LABEL_TINT[l.color] || LABEL_TINT.gray;
              return (
                <span key={l.id} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] px-1.5 py-px text-[11px] font-semibold" style={{ background: bg, color: fg }} title={l.name}>
                  {l.name}
                </span>
              );
            })}
          </div>
        )}
        <div dir="auto" className={`${c.cardTitle} ${hasFarsi(card.title) ? c.fa : ""} font-medium`}>
          {card.title}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {(card.publish_at || nets.length > 0) && (
            <Badge variant={STATUS_BADGE[card.status] || "draft"} title={`${st.name}${card.publish_at ? " · " + whenAll(card.publish_at) : ""}`}>
              {card.status === "published" ? <Check size={12} /> : <CalendarDays size={12} />}
              {card.publish_at ? shortWhen(card.publish_at) : st.name}
            </Badge>
          )}
          {card.due_at && (
            <span className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-px ${dueTone}`} title={`Ready by · ${whenAll(card.due_at)}`}>
              <Clock size={12} /> {shortWhen(card.due_at)}
            </span>
          )}
          {card.description && (
            <span className="inline-flex" title="This card has a description">
              <AlignLeft size={13} />
            </span>
          )}
          {card.checklist && card.checklist.length > 0 && (
            <span className={`inline-flex items-center gap-1 rounded-[5px] px-1.5 py-px ${done === card.checklist.length ? "bg-[#f0fdf4] text-[#15803d]" : ""}`} title="Checklist">
              <SquareCheck size={12} /> {done}/{card.checklist.length}
            </span>
          )}
          {files > 0 && (
            <span className="inline-flex items-center gap-1" title={`${files} file${files > 1 ? "s" : ""}`}>
              <Paperclip size={12} /> {files}
            </span>
          )}
          {card.stale_approval && <Badge variant="pending">changed after approval</Badge>}
          {nets.map((n) => (
            <NetChip key={n.key} k={n.key} state={(card.publish || {})[n.key]?.status} />
          ))}
          {people.length > 0 && (
            <span className="ml-auto flex gap-0.5">
              {people.map((u) => (
                <Avatar key={u.id} user={u} size={24} />
              ))}
            </span>
          )}
        </div>
      </div>
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
  const dot = list.role === "scheduled" ? "#1d4ed8" : list.role === "published" ? "#15803d" : "var(--orange)";
  return (
    <section className={c.list} aria-label={list.name}>
      <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-1">
        <span className="h-2 w-2 flex-none rounded-full" style={{ background: dot }} aria-hidden />
        <h2 className="m-0 flex-1 text-sm font-semibold text-ink" dir="auto">
          {list.name}
        </h2>
        {list.role === "scheduled" && <CalendarDays size={14} className="text-muted" aria-label="Approved posts move here" />}
        {list.role === "published" && <Check size={14} className="text-muted" aria-label="Posts move here once published" />}
        <span className="text-xs text-muted">{cards.length}</span>
      </div>
      <SortableContext items={cards.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={c.cards}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} board={board} users={users} onOpen={() => onOpen(card.id)} />
          ))}
        </div>
      </SortableContext>
      {adding ? (
        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <Textarea id={`new-${list.id}`} className="min-h-[56px]" autoFocus placeholder="Card title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit(e)} />
          <div className="flex gap-1.5">
            <Button size="sm">Add card</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)} aria-label="Cancel">
              <X />
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="justify-start text-muted" onClick={() => setAdding(true)}>
          <Plus /> Add a card
        </Button>
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

// Phones get the compact month grid (PhoneMonth) instead of the wide one.
function useNarrow(px = 700) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [px]);
  return narrow;
}

// A phone's month, as in a phone's own calendar app: the whole month as a grid of days with a dot
// per post (coloured by where it stands), and the chosen day's posts listed under it.
function PhoneMonth({ days, month, byDay, dues, onOpen, onNew }) {
  const today = dayKey(new Date());
  const inMonth = days.filter((d) => d.getMonth() === month);
  const [picked, setPicked] = useState("");
  const sel = picked && inMonth.some((d) => dayKey(d) === picked) ? picked : inMonth.some((d) => dayKey(d) === today) ? today : dayKey(inMonth[0]);
  const selDate = days.find((d) => dayKey(d) === sel) || inMonth[0];
  const posts = byDay[sel] || [];
  const due = dues[sel] || [];
  return (
    <div className={c.pmWrap}>
      <div className={c.pmGrid}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className={c.pmDow}>
            {d}
          </div>
        ))}
        {days.map((d) => {
          const k = dayKey(d);
          const list = byDay[k] || [];
          return (
            <button
              key={k}
              className={`${c.pmDay} ${d.getMonth() !== month ? c.pmOther : ""} ${k === today ? c.pmToday : ""} ${k === sel ? c.pmSel : ""}`}
              onClick={() => setPicked(k)}
              aria-label={d.toDateString() + (list.length ? `, ${list.length} post${list.length > 1 ? "s" : ""}` : "")}
            >
              <span className={c.pmNum}>{d.getDate()}</span>
              <span className={c.pmDots}>
                {list.slice(0, 3).map((card) => (
                  <i key={card.id} style={{ background: (STATUS[card.status] || STATUS.draft).color }} />
                ))}
                {(dues[k] || []).length > 0 && list.length < 3 && <i className={c.pmDueDot} />}
              </span>
            </button>
          );
        })}
      </div>
      <section className={c.pmList}>
        <div className={c.agHead}>
          <span className={c.agNum}>{selDate.getDate()}</span>
          <span>{selDate.toLocaleDateString([], { weekday: "long", month: "long" })}</span>
          <span className={c.grow} />
          <button className={`${c.btn}`} onClick={() => onNew(new Date(selDate.getFullYear(), selDate.getMonth(), selDate.getDate(), 18).toISOString())}>
            + Post this day
          </button>
        </div>
        {posts.map((card) => (
          <Tile key={card.id} card={card} onOpen={onOpen} drag={false} />
        ))}
        {due.map((card) => (
          <span key={"d" + card.id} className={c.due} onClick={() => onOpen(card)} dir="auto">
            Due: {card.title}
          </span>
        ))}
        {!posts.length && !due.length && <span className={c.muted}>Nothing planned on this day.</span>}
      </section>
    </div>
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
  const narrow = useNarrow();
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
      {narrow ? (
        <>
          <PhoneMonth days={days} month={anchor.getMonth()} byDay={byDay} dues={dueDay} onOpen={onOpen} onNew={onNew} />
          {unscheduled.length > 0 && <Unscheduled cards={unscheduled} onOpen={onOpen} />}
        </>
      ) : (
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
      )}
      <DragOverlay>{active ? <div className={c.mini}>{cards.find((x) => x.id === active)?.title}</div> : null}</DragOverlay>
    </DndContext>
  );
}

// ---- card editor --------------------------------------------------------------------------------

// A card opened, as on Trello: everything saves as you change it (no Save button); title and
// description save when you leave the field.
function CardEditor({ boardId, cardId, board, users, me, onClose, onChanged, onCompose }) {
  const [card, setCard] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(""); // "" | "saving" | "saved"
  const [pop, setPop] = useState(""); // labels | members | dates | links | move
  const [title, setTitle] = useState("");
  // The title box grows with the title, so a long Persian title is never cut to one line.
  const titleRef = useRef(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [title]);
  const [desc, setDesc] = useState(null); // null: not editing
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const [links, setLinks] = useState({});
  const load = useCallback(async () => {
    const d = await calApi(`/boards/${boardId}/cards/${cardId}`);
    setCard(d.card);
    setTitle(d.card.title);
    setLinks(d.card.links || {});
    setComments(d.comments);
  }, [boardId, cardId]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && (pop ? setPop("") : close());
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const commit = async (fields) => {
    setCard((x) => ({ ...x, ...fields }));
    setSaving("saving");
    setError("");
    try {
      const d = await calApi(`/boards/${boardId}/cards/${cardId}`, { method: "PATCH", body: fields });
      setCard((x) => ({ ...x, ...d.card }));
      setSaving("saved");
      onChanged();
    } catch (e) {
      setError(e.message);
      setSaving("");
      load().catch(() => {});
    }
  };
  const saveTitle = () => title.trim() && title.trim() !== card.title && commit({ title: title.trim() });
  const close = async () => {
    if (card && title.trim() && title.trim() !== card.title) await commit({ title: title.trim() });
    if (card && desc !== null && desc !== card.description && !window.confirm("Close without saving the description?")) return;
    onClose();
  };
  const action = async (a) => {
    try {
      await calApi(`/boards/${boardId}/cards/${cardId}/action`, { method: "POST", body: { action: a } });
      onChanged();
      if (a === "archive") return onClose();
      await load();
    } catch (e) {
      setError(e.message);
    }
  };
  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    try {
      await calApi(`/boards/${boardId}/cards/${cardId}/comments`, { method: "POST", body: { text: comment } });
      setComment("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  };
  const person = (id) => users.find((u) => u.id === id) || { id, name: id === "scheduler" ? "Scheduler" : "Someone" };
  const toggle = (k, id) => commit({ [k]: (card[k] || []).includes(id) ? card[k].filter((x) => x !== id) : [...(card[k] || []), id] });
  const setCheck = (list) => commit({ checklist: list });

  if (!card)
    return (
      <div className={c.modalBg}>
        <div className={c.modal2} style={{ padding: 24 }}>
          <p className={c.muted}>{error || "Loading…"}</p>
          {error && (
            <button className={c.btn} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    );

  const list = board.lists.find((l) => l.id === card.list_id);
  const labels = (card.labels || []).map((id) => board.labels.find((l) => l.id === id)).filter(Boolean);
  const people = (card.members || []).map(person);
  const cover = thumbOf(card.media);
  const done = (card.checklist || []).filter((i) => i.done).length;
  const total = (card.checklist || []).length;
  const due = dueState(card);
  const SideBtn = ({ k, Icon, label, onClick, tone }) => (
    <Button
      variant="outline"
      className={`h-10 justify-start gap-2.5 px-3 max-md:h-12 max-md:rounded-[10px] ${pop === k ? "border-primary bg-primary-soft" : ""} ${tone || ""}`}
      onClick={onClick || (() => setPop(pop === k ? "" : k))}
    >
      <Icon className="text-muted" /> {label}
    </Button>
  );
  const popTitle = { labels: "Labels", members: "Members", dates: "Dates", links: "Links", move: "Move card" }[pop];
  const popover = pop && (
    <div
      className="z-20 flex flex-col gap-2.5 rounded-[12px] border border-solid border-border bg-surface p-3 shadow-[0_12px_32px_rgba(9,30,66,0.2)] max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:max-h-[70dvh] max-md:overflow-y-auto md:absolute md:right-[calc(100%+8px)] md:top-0 md:w-72"
      role="dialog"
      aria-label={pop}
    >
      <div className="flex items-center justify-between text-sm font-semibold text-ink">
        {popTitle}
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPop("")} aria-label="Close">
          <X />
        </Button>
      </div>
      {pop === "labels" &&
        board.labels.map((l) => {
          const on = (card.labels || []).includes(l.id);
          const [bg, fg] = LABEL_TINT[l.color] || LABEL_TINT.gray;
          return (
            <label key={l.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[var(--orange)]" checked={on} onChange={() => toggle("labels", l.id)} />
              <span className="flex-1 rounded-md px-2.5 py-1.5 text-[13px] font-semibold" style={{ background: bg, color: fg }}>
                {l.name}
              </span>
            </label>
          );
        })}
      {pop === "members" &&
        users.map((u) => (
          <label key={u.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--orange)]" checked={(card.members || []).includes(u.id)} onChange={() => toggle("members", u.id)} />
            <Avatar user={u} size={26} />
            <span>{u.name}</span>
          </label>
        ))}
      {pop === "dates" && (
        <>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Start
            <Input id="start-at" type="datetime-local" value={toLocalInput(card.start_at)} onChange={(e) => commit({ start_at: fromLocalInput(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            Due (ready by)
            <Input id="due-at" type="datetime-local" value={toLocalInput(card.due_at)} onChange={(e) => commit({ due_at: fromLocalInput(e.target.value) })} />
          </label>
          {(card.start_at || card.due_at) && <span className="text-[13px] text-muted">{pickerNote(toLocalInput(card.due_at || card.start_at))}</span>}
          <span className="text-[13px] text-muted">The publish time is set in the post.</span>
        </>
      )}
      {pop === "links" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit({ links });
            setPop("");
          }}
          className="flex flex-col gap-2"
        >
          {LINKS.map(([k, name]) => (
            <label key={k} className="flex flex-col gap-1 text-[13px] text-muted">
              {name}
              <Input id={`link-${k}`} placeholder="https://" value={links[k] || ""} onChange={(e) => setLinks({ ...links, [k]: e.target.value })} />
            </label>
          ))}
          <Button>Save links</Button>
        </form>
      )}
      {pop === "move" && (
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          List
          <select id="card-list" className="h-10 rounded-md border border-solid border-border bg-surface px-2 text-sm text-ink" value={card.list_id} onChange={(e) => (commit({ list_id: e.target.value }), setPop(""))}>
            {board.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
  const Section = ({ Icon, title, children }) => (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon size={16} className="text-muted" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  );
  const dueTone = due === "late" ? "bg-[#fef2f2] text-[#b91c1c]" : due === "soon" ? "bg-[#fff7ed] text-[#9a3412]" : due === "done" ? "bg-[#f0fdf4] text-[#15803d]" : "bg-[#f1efe9] text-ink";
  const metaLabel = "text-xs font-medium text-muted";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(9,15,25,0.55)] md:px-3 md:py-10" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="relative flex w-full max-w-[880px] flex-col overflow-hidden bg-[#faf9f6] shadow-[0_24px_60px_rgba(0,0,0,0.3)] max-md:min-h-dvh md:rounded-[14px]" role="dialog" aria-modal="true" aria-label={card.title}>
        <div
          className={`relative bg-cover bg-center ${cover || card.media?.kind === "video" ? "h-[170px] bg-[#1d3038] max-md:h-[200px]" : "h-[72px] max-md:h-[120px]"}`}
          // An inline gradient: Tailwind's gradient utilities need its global reset, which is off.
          style={cover ? { backgroundImage: `url(${cover})` } : card.media?.kind === "video" ? undefined : { backgroundImage: "linear-gradient(135deg, #243b44, #32515d)" }}
        >
          <Button variant="outline" size="icon" className="absolute left-3 top-3 h-9 w-9 rounded-full bg-white/90 md:left-auto md:right-3" onClick={close} aria-label="Close">
            <X />
          </Button>
          {card.media?.kind === "video" && (
            <span className="absolute inset-0 m-auto grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
              <Play size={16} fill="currentColor" />
            </span>
          )}
          {fileCount(card.media) > 1 && <span className="absolute bottom-2 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-bold text-white">{fileCount(card.media)} files</span>}
        </div>

        <div className="flex flex-col gap-1 px-4 pb-1 pt-4 md:px-7 md:pt-5">
          <textarea
            id="card-title"
            ref={titleRef}
            className={`m-0 w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-1 text-[22px] font-bold leading-[1.4] text-ink [unicode-bidi:plaintext] focus:bg-surface focus:outline focus:outline-2 focus:outline-primary md:text-2xl ${hasFarsi(title) ? c.fa : ""}`}
            dir="auto"
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            aria-label="Title"
          />
          <div className="flex items-center gap-2 px-1 text-[13px] text-muted">
            <span className="min-w-0 flex-1 truncate">
              <b className="font-semibold text-ink">{board.name}</b> / <span dir="auto">{list ? list.name : "?"}</span>
            </span>
            <button className="cursor-pointer border-0 bg-transparent p-1 font-[inherit] text-[15px] font-semibold text-primary hover:underline" onClick={() => setPop(pop === "move" ? "" : "move")}>
              Move
            </button>
            <span className="hidden items-center gap-1.5 text-xs md:inline-flex" aria-live="polite">
              {error ? <span className="text-[#b91c1c]">{error}</span> : saving === "saving" ? "Saving…" : saving === "saved" ? <><Check size={13} className="text-[#15803d]" /> Saved</> : null}
            </span>
          </div>
          {card.source && (
            <div className="px-1 text-xs text-muted">
              From {card.source.type === "project" ? "Video Editing" : "the Topic Engine"}: <b dir="auto">{card.source.title}</b>
              {card.source.url && (
                <>
                  {" "}
                  <a className="text-primary" href={card.source.url} target="_blank" rel="noreferrer">
                    source ↗
                  </a>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 px-4 pb-6 pt-3 md:grid md:grid-cols-[minmax(0,1fr)_220px] md:gap-6 md:px-7">
          <aside className="relative order-first flex flex-col gap-1.5 rounded-[12px] border border-solid border-border bg-surface p-3 md:order-last md:border-0 md:bg-transparent md:p-0">
            <div className="mb-1 text-[15px] font-semibold text-ink md:text-xs md:font-medium md:text-muted">
              <span className="md:hidden">Quick actions</span>
              <span className="hidden md:inline">Add to card</span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-col md:gap-1.5">
              <SideBtn k="members" Icon={Users} label="Members" />
              <SideBtn k="labels" Icon={Tag} label="Labels" />
              <SideBtn k="check" Icon={SquareCheck} label="Checklist" onClick={() => document.getElementById("chk-new")?.focus()} />
              <SideBtn k="dates" Icon={Clock} label="Dates" />
              <SideBtn k="links" Icon={Link2} label="Links" />
              <SideBtn k="compose" Icon={Pencil} label={onNetworks(card).length ? "Edit the post" : "Write the post"} onClick={() => onCompose(boardId, cardId)} />
              <SideBtn k="move" Icon={ArrowRight} label="Move" />
              <SideBtn k="archive" Icon={Archive} label="Archive" tone="text-[#b91c1c]" onClick={() => window.confirm("Archive this card?") && action("archive")} />
            </div>
            {popover}
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            {(people.length > 0 || labels.length > 0 || card.start_at || card.due_at) && (
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {people.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className={metaLabel}>Members</span>
                    <div className="flex items-center gap-1">
                      {people.map((u) => (
                        <Avatar key={u.id} user={u} size={30} />
                      ))}
                      <Button variant="outline" size="icon" className="h-[30px] w-[30px] rounded-full border-dashed" onClick={() => setPop("members")} aria-label="Add a member">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                )}
                {labels.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className={metaLabel}>Labels</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {labels.map((l) => {
                        const [bg, fg] = LABEL_TINT[l.color] || LABEL_TINT.gray;
                        return (
                          <span key={l.id} className="rounded-md px-2.5 py-1 text-[13px] font-semibold" style={{ background: bg, color: fg }}>
                            {l.name}
                          </span>
                        );
                      })}
                      <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => setPop("labels")} aria-label="Add a label">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                )}
                {(card.start_at || card.due_at) && (
                  <div className="flex flex-col gap-1.5">
                    <span className={metaLabel}>Dates</span>
                    <button className={`cursor-pointer rounded-md border-0 px-3 py-1.5 font-[inherit] text-[13px] font-medium ${dueTone}`} onClick={() => setPop("dates")} title={card.due_at ? whenAll(card.due_at) : whenAll(card.start_at)}>
                      {card.start_at ? shortWhen(card.start_at) : ""}
                      {card.start_at && card.due_at ? " – " : ""}
                      {card.due_at ? shortWhen(card.due_at) : ""}
                      {due === "late" ? " · late" : due === "soon" ? " · due soon" : ""}
                    </button>
                  </div>
                )}
              </div>
            )}

            <Section Icon={AlignLeft} title="Description">
              {desc === null ? (
                <div
                  className={`cursor-pointer whitespace-pre-wrap rounded-[10px] border border-solid px-3.5 py-3 text-sm leading-relaxed ${card.description ? "border-border bg-surface text-ink" : "min-h-[52px] border-transparent bg-[#efebe3] text-muted"}`}
                  dir="auto"
                  onClick={() => setDesc(card.description || "")}
                  role="button"
                  tabIndex={0}
                >
                  {card.description || "Add a more detailed description: notes, script, brief…"}
                </div>
              ) : (
                <>
                  <Textarea id="card-desc" dir="auto" autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-[140px]" />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (desc !== card.description) commit({ description: desc });
                        setDesc(null);
                      }}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setDesc(null)}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </Section>

            <Section Icon={Megaphone} title="Post">
              <div className="flex flex-col gap-2.5 rounded-[12px] border border-solid border-border bg-surface p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={card.status} />
                  {onNetworks(card).map((n) => (
                    <NetChip key={n.key} k={n.key} state={(card.publish || {})[n.key]?.status} />
                  ))}
                  {card.publish_at && (
                    <span className="inline-flex items-center gap-1 text-[13px] text-muted">
                      <CalendarDays size={13} /> {whenAll(card.publish_at)}
                    </span>
                  )}
                </div>
                {captionOf(card) ? (
                  <p dir="auto" className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {captionOf(card).slice(0, 320)}
                    {captionOf(card).length > 320 ? "…" : ""}
                  </p>
                ) : (
                  <p className="m-0 text-sm text-muted">No caption yet.</p>
                )}
                {card.media && card.media.items && card.media.items.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto">
                    {card.media.items.map((m, i) => (
                      <span key={i} className="grid h-[70px] w-14 flex-none place-items-center rounded-md bg-[#1d3038] bg-cover bg-center text-white" style={m.kind === "image" ? { backgroundImage: `url(${m.url})` } : undefined}>
                        {m.kind === "video" ? <Play size={14} fill="currentColor" /> : null}
                      </span>
                    ))}
                  </div>
                )}
                <div>
                  <Button onClick={() => onCompose(boardId, cardId)}>
                    <Pencil /> {onNetworks(card).length ? "Edit the post, schedule or publish" : "Write the post"}
                  </Button>
                </div>
              </div>
            </Section>

            <Section Icon={SquareCheck} title="Checklist">
              {total > 0 && (
                <div className="flex items-center gap-2.5 text-xs text-muted">
                  <span className="w-8">{Math.round((done / total) * 100)}%</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e5e0d5]">
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${(done / total) * 100}%`, background: done === total ? "#16a34a" : "var(--orange)" }} />
                  </div>
                </div>
              )}
              {(card.checklist || []).map((i, n) => (
                <label key={i.id || n} className="group -mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1 text-sm hover:bg-black/[0.04]">
                  <input id={`chk-${n}`} type="checkbox" className="h-4 w-4 flex-none accent-[var(--orange)]" checked={i.done} onChange={(e) => setCheck(card.checklist.map((x, j) => (j === n ? { ...x, done: e.target.checked } : x)))} />
                  <span dir="auto" className={`min-w-0 flex-1 ${i.done ? "text-muted line-through" : ""}`}>
                    {i.text}
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 max-md:opacity-100" onClick={(e) => (e.preventDefault(), setCheck(card.checklist.filter((_, j) => j !== n)))} aria-label="Remove item">
                    <X />
                  </Button>
                </label>
              ))}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!item.trim()) return;
                  setCheck([...(card.checklist || []), { text: item.trim(), done: false }]);
                  setItem("");
                }}
              >
                <Input id="chk-new" className="flex-1" dir="auto" placeholder="Add an item" value={item} onChange={(e) => setItem(e.target.value)} />
                <Button variant="outline">Add</Button>
              </form>
            </Section>

            {Object.keys(card.links || {}).length > 0 && (
              <Section Icon={Link2} title="Links">
                <div className="flex flex-wrap gap-2">
                  {LINKS.filter(([k]) => card.links[k]).map(([k, name]) => (
                    <a key={k} className="rounded-md bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary-deep no-underline" href={card.links[k]} target="_blank" rel="noreferrer">
                      {name} ↗
                    </a>
                  ))}
                </div>
              </Section>
            )}

            <Section Icon={MessageSquare} title="Activity">
              <form onSubmit={addComment} className="flex items-center gap-2.5">
                <Avatar user={me || { name: "Me" }} size={30} />
                <Input id="comment" className="flex-1" dir="auto" placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button variant="outline" disabled={!comment.trim()}>
                  Send
                </Button>
              </form>
              {[...comments].reverse().map((m) =>
                m.type === "comment" ? (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <Avatar user={person(m.by)} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-muted">
                        <b className="text-ink">{person(m.by).name}</b> · {shortWhen(new Date(m.at).toISOString())}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-solid border-border bg-surface px-3 py-2 text-sm" dir="auto">
                        {m.text}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <Avatar user={person(m.by)} size={30} />
                    <div className="pt-1.5 text-[13px] leading-snug text-muted">
                      <b className="text-ink">{person(m.by).name}</b> {m.text} · {shortWhen(new Date(m.at).toISOString())}
                    </div>
                  </div>
                )
              )}
            </Section>
            <div className="text-xs text-muted md:hidden" aria-live="polite">
              {error ? <span className="text-[#b91c1c]">{error}</span> : saving === "saving" ? "Saving…" : saving === "saved" ? "All changes saved" : ""}
            </div>
          </div>
        </div>
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
        {settings.dry_run && <div className={c.note}>Test mode is on: publishing only pretends (CALENDAR_DRY_RUN). The state below is the real one.</div>}
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
              {s.redirect && !s.connected && (
                <span className={c.muted} style={{ wordBreak: "break-all" }}>
                  Return address to register in the {name} developer settings, exactly: <code style={{ userSelect: "all", color: "var(--text)" }}>{s.redirect}</code>
                </span>
              )}
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
  const phone = useNarrow(900);
  const [sheet, setSheet] = useState(""); // phone: "posts" | "more"
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
  // Right-click (or a long press on a phone) on a board's tab removes it, for the admin.
  const removeBoard = async (b) => {
    if (!admin) return;
    const n = (data[b.id] && data[b.id].board && data[b.id].board.cards.length) || 0;
    if (!window.confirm(`Remove the board “${b.name}”?${n ? ` Its ${n} card${n > 1 ? "s" : ""} will no longer be shown.` : ""}`)) return;
    try {
      await calApi(`/boards/${b.id}`, { method: "DELETE" });
      setBoards(boards.filter((x) => x.id !== b.id));
      if (market === b.id) setMarket("all");
    } catch (e) {
      setError(e.message);
    }
  };
  const pressTimer = useRef(null);
  const tabPress = (b) =>
    admin
      ? {
          onContextMenu: (e) => {
            e.preventDefault();
            removeBoard(b);
          },
          onTouchStart: () => {
            clearTimeout(pressTimer.current);
            pressTimer.current = setTimeout(() => removeBoard(b), 650);
          },
          onTouchEnd: () => clearTimeout(pressTimer.current),
          onTouchMove: () => clearTimeout(pressTimer.current),
          title: "Right-click (or press and hold) to remove this board",
        }
      : {};
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

  // On a phone the left navigation becomes a bottom tab bar (as in Trello's app): the main places
  // one tap away, the rest in a sheet, instead of a strip of cut-off pills.
  const phoneSheetItems = sheet === "posts"
    ? LIST_TABS.map(([k, label]) => ({ key: "list-" + k, label, n: counts[k], onClick: () => setView("list-" + k) }))
    : [
        { key: "week", label: "Week", onClick: () => setView("week") },
        { key: "source", label: "From a topic or video", onClick: () => setPanel("source") },
        { key: "channels", label: "Channels", onClick: () => setPanel("channels") },
        ...(admin ? [{ key: "settings", label: "Lists and labels", onClick: () => setPanel("settings") }] : []),
      ];
  const tab = (k, icon, label, on, onClick, disabled) => (
    <button key={k} className={`${p.tabItem} ${on ? p.tabOn : ""}`} onClick={onClick} disabled={disabled} aria-current={on ? "page" : undefined}>
      <span className={p.tabIcon} aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className={p.shell}>
      {phone && (
        <>
          <nav className={p.tabBar} aria-label="Content calendar">
            {tab("month", "📅", "Calendar", view === "month" || view === "week", () => setView("month"))}
            {tab("posts", "📋", "Posts", view.startsWith("list-"), () => setSheet(sheet === "posts" ? "" : "posts"))}
            <button className={p.tabNew} onClick={() => setSheet("start")} disabled={!ready} aria-label="New post">
              +
            </button>
            {tab("board", "🗂", "Board", view === "board", () => setView("board"))}
            {tab("more", "☰", "More", false, () => setSheet(sheet === "more" ? "" : "more"), !ready)}
          </nav>
          {sheet && sheet !== "start" && (
            <div className={p.sheetBg} onClick={() => setSheet("")}>
              <div className={p.sheet} onClick={(e) => e.stopPropagation()} role="menu">
                <div className={p.sheetHandle} aria-hidden />
                <div className={p.sheetTitle}>{sheet === "posts" ? "Posts" : "More"}</div>
                {phoneSheetItems.map((it) => (
                  <button
                    key={it.key}
                    role="menuitem"
                    className={`${p.sheetItem} ${view === it.key ? p.sheetOn : ""}`}
                    onClick={() => {
                      setSheet("");
                      it.onClick();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.n !== undefined && <span className={p.n}>{it.n}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {/* "+" first asks where the post comes from: written here, or made in the Topic Engine. */}
      {sheet === "start" && (
        <div className={`${p.sheetBg} ${p.startBg}`} onClick={() => setSheet("")}>
          <div className={`${p.sheet} ${p.startSheet}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Start a post">
            <div className={p.sheetHandle} aria-hidden />
            <div className={p.startTitle}>How do you want to start?</div>
            {[
              ["✏️", "New post from scratch", "Write the caption and add the files yourself.", () => newPost()],
              ["📰", "Use something made in the Topic Engine", "A carousel, story, video, article or script you already made.", () => setPanel("source")],
              ["🚀", "Make something new in the Topic Engine", "Pick a topic there and make a carousel, story or video, then send it here.", () => (window.location.href = "/")],
            ].map(([icon, title, sub, go]) => (
              <button
                key={title}
                className={p.startItem}
                onClick={() => {
                  setSheet("");
                  go();
                }}
              >
                <span className={p.startIcon} aria-hidden>{icon}</span>
                <span className={p.startText}>
                  <b>{title}</b>
                  <span>{sub}</span>
                </span>
                <span className={p.startGo} aria-hidden>›</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className={p.side} aria-label="Content calendar" hidden={phone}>
        <button className={p.newPost} onClick={() => setSheet("start")} disabled={!ready}>
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
              <button key={b.id} className={`${c.tab} ${(market === b.id || (view === "board" && market === "all" && b.id === boards[0].id)) ? c.on : ""}`} onClick={() => setMarket(b.id)} {...tabPress(b)}>
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
        {view !== "board" && <ZoneBanner />}
        {error && <div className={c.error}>{error}</div>}
        {!ready ? (
          <p className={c.muted}>Loading…</p>
        ) : view === "month" ? (
          <MonthView cards={cards} onOpen={openPost} onMove={move} onNew={newPost} />
        ) : view === "week" ? (
          <WeekView cards={cards} onOpen={openPost} onMove={move} onNew={newPost} />
        ) : view === "board" ? (
          <div className={c.boardWrap}>
          <BoardView
            board={planBoard.board}
            users={planBoard.users}
            filter={planFilter}
            onOpen={(id) => setOpen({ bid: planBoard.board.id, id })}
            onMove={(id, fields) => move({ id, board_id: planBoard.board.id }, fields)}
            onAdd={(listId, title) => add(planBoard.board.id, listId, title)}
          />
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 18 }}>{LIST_TABS.find(([k]) => "list-" + k === view)?.[1]}</h2>
            <PostList cards={cards} tab={view.slice(5)} admin={admin} onOpen={openPost} onAction={quick} />
          </>
        )}
      </div>

      {open && data[open.bid] && (
        <CardEditor key={open.id} boardId={open.bid} cardId={open.id} board={data[open.bid].board} users={data[open.bid].users} me={data[open.bid].me} onClose={() => setOpen(null)} onChanged={load} onCompose={(bid, id) => {
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

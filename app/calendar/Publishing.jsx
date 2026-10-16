"use client";

// Publishing views: the week planner (posts in their hour, drag to move) and the post lists by
// status (Drafts, Waiting for approval, Scheduled, Published, Failed), as in Zoho Social.

import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from "@dnd-kit/core";
import { NETWORKS, STATUS, effectiveCaption, onNetworks, thumbOf } from "./channels";
import { NetChip, StatusPill } from "./Composer";
import c from "./publishing.module.css";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function captionOf(card) {
  return card.caption || onNetworks(card).map((n) => effectiveCaption(card, n.key)).find(Boolean) || "";
}

export function Tile({ card, onOpen, drag = true }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !drag || card.status === "published" });
  const st = STATUS[card.status] || STATUS.draft;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`${c.tile} ${isDragging ? c.dragging : ""}`} style={{ borderLeftColor: st.color }} onClick={() => onOpen(card)} title={`${st.name}${card.board_name ? " · " + card.board_name : ""}`}>
      <b>
        {card.publish_at ? timeOf(card.publish_at) : ""}
        {onNetworks(card).map((n) => (
          <NetChip key={n.key} k={n.key} state={(card.publish || {})[n.key]?.status} />
        ))}
      </b>
      <span dir="auto">{card.title || captionOf(card) || "Untitled post"}</span>
    </div>
  );
}

function Slot({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${c.slot} ${isOver ? c.over : ""}`}>
      {children}
    </div>
  );
}

const sensorsCfg = [
  [PointerSensor, { activationConstraint: { distance: 6 } }],
  [TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }],
];

export function WeekView({ cards, onOpen, onMove, onNew }) {
  const sensors = useSensors(useSensor(sensorsCfg[0][0], sensorsCfg[0][1]), useSensor(sensorsCfg[1][0], sensorsCfg[1][1]));
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  });
  const [active, setActive] = useState(null);
  const scroller = useRef(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 52 * 8; // start the day at 8:00
  }, []);
  const days = Array.from({ length: 7 }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i));
  const slots = {};
  for (const card of cards) {
    if (!card.publish_at) continue;
    const t = new Date(card.publish_at);
    (slots[`${dayKey(t)}-${t.getHours()}`] ||= []).push(card);
  }
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const card = cards.find((x) => x.id === a.id);
    const [y, m, d, h] = over.id.split("-").map(Number);
    const old = card.publish_at ? new Date(card.publish_at) : null;
    const when = new Date(y, m - 1, d, h, old ? old.getMinutes() : 0);
    if (!old || when.getTime() !== old.getTime()) onMove(card, { publish_at: when.toISOString() });
  };
  const label = `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={c.row}>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 7))} aria-label="Previous week">
          ‹
        </button>
        <button className={c.btn} onClick={() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          setAnchor(d);
        }}>
          This week
        </button>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7))} aria-label="Next week">
          ›
        </button>
        <strong>{label}</strong>
        <span className={c.muted}>Double-click an hour to write a post for that time. Drag posts to move them.</span>
      </div>
      <div className={c.weekScroll} ref={scroller}>
        <div className={c.week}>
          <div className={c.wHead} />
          {days.map((d) => (
            <div key={dayKey(d)} className={`${c.wHead} ${dayKey(d) === dayKey(new Date()) ? c.today : ""}`}>
              {d.toLocaleDateString([], { weekday: "short", day: "numeric" })}
            </div>
          ))}
          {Array.from({ length: 24 }, (_, h) => (
            <Hour key={h} h={h} days={days} slots={slots} onOpen={onOpen} onNew={onNew} />
          ))}
        </div>
      </div>
      <DragOverlay>{active ? <div className={c.tile}>{cards.find((x) => x.id === active)?.title}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Hour({ h, days, slots, onOpen, onNew }) {
  return (
    <>
      <div className={c.hour}>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })}</div>
      {days.map((d) => {
        const key = `${dayKey(d)}-${h}`;
        return (
          <div key={key} onDoubleClick={() => onNew(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString())}>
            <Slot id={key}>
              {(slots[key] || []).map((card) => (
                <Tile key={card.id} card={card} onOpen={onOpen} />
              ))}
            </Slot>
          </div>
        );
      })}
    </>
  );
}

export const LIST_TABS = [
  ["draft", "Drafts"],
  ["pending", "Waiting for approval"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
  ["failed", "Failed"],
];

export function inTab(card, tab) {
  if (tab === "scheduled") return ["scheduled", "approved", "publishing"].includes(card.status);
  return card.status === tab;
}

export function PostList({ cards, tab, admin, onOpen, onAction }) {
  const rows = cards
    .filter((x) => inTab(x, tab))
    .sort((a, b) => {
      const ta = a.publish_at ? new Date(a.publish_at).getTime() : Infinity;
      const tb = b.publish_at ? new Date(b.publish_at).getTime() : Infinity;
      return tab === "published" ? tb - ta : ta - tb;
    });
  if (!rows.length) {
    const empty = {
      draft: "No drafts. Start one with New post.",
      pending: "Nothing is waiting for approval.",
      scheduled: "Nothing scheduled yet.",
      published: "Nothing published yet.",
      failed: "No failed posts.",
    };
    return <div className={`${c.list} ${c.empty}`}>{empty[tab]}</div>;
  }
  return (
    <div className={c.list}>
      {rows.map((card) => {
        const thumb = thumbOf(card.media);
        const fails = Object.entries(card.publish || {}).filter(([, p]) => ["failed", "unknown", "missed"].includes(p.status));
        return (
          <div key={card.id} className={c.listRow} onClick={() => onOpen(card)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ fontSize: 14 }}>{card.publish_at ? new Date(card.publish_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "No date"}</b>
              <span className={c.muted}>{card.board_name}</span>
            </div>
            <div className={c.rowThumb} style={thumb ? { backgroundImage: `url(${thumb})` } : { background: "#c9ced6" }}>
              {card.media && card.media.kind === "video" ? "▶" : ""}
            </div>
            <div className={c.rowText}>
              <div className={c.row} style={{ gap: 6 }}>
                {onNetworks(card).map((n) => (
                  <NetChip key={n.key} k={n.key} state={(card.publish || {})[n.key]?.status} />
                ))}
                <b dir="auto">{card.title || "Untitled post"}</b>
              </div>
              <p dir="auto">{captionOf(card)}</p>
              {fails.map(([k, p]) => (
                <span key={k} style={{ color: "#b42318", fontSize: 12 }}>
                  {NETWORKS.find((n) => n.key === k).name}: {p.error || p.status}
                </span>
              ))}
            </div>
            <div className={c.rowActs} onClick={(e) => e.stopPropagation()}>
              <StatusPill status={card.status} />
              {admin && card.status === "pending" && (
                <>
                  <button className={`${c.btn} ${c.blue}`} onClick={() => onAction(card, "approve")}>
                    Approve
                  </button>
                  <button className={`${c.btn} ${c.danger}`} onClick={() => onAction(card, "reject")}>
                    Send back
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

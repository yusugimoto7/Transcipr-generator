'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, AtSign, FileUp, Mail, UserPlus, CheckCheck } from 'lucide-react';
import LocalTime from '@/components/LocalTime';

export const KIND_ICON = { mention: AtSign, documents: FileUp, email: Mail, assigned: UserPlus };

export async function notifAction(body) {
  const res = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.ok ? res.json() : null;
}

/** Open a notification's link (same page: just the #section, which the file follows). */
export function openLink(link) {
  if (!link) return;
  window.location.assign(link);
}

/**
 * The notification center in the top bar (team only): unread count, the
 * latest notifications, mark as read, and a link to the full list. Checks
 * for new ones every minute and when the window gets focus.
 */
export default function NotificationBell() {
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  const load = () => fetch('/api/notifications?limit=15').then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function go(n) {
    setOpen(false);
    if (!n.readAt) {
      const d = await notifAction({ action: 'read', ids: [n.id] });
      if (d) setData({ items: data.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)), unread: d.unread });
    }
    openLink(n.link);
  }
  async function readAll() {
    const d = await notifAction({ action: 'read' });
    if (d) setData({ items: d.items.slice(0, 15), unread: d.unread });
  }

  return (
    <div className="notif" ref={box}>
      <button type="button" className="top-btn icon-only" aria-label={`Notifications${data.unread ? ` (${data.unread} unread)` : ''}`} aria-expanded={open} onClick={() => { setOpen(!open); if (!open) load(); }}>
        <Bell size={17} aria-hidden="true" />
        {data.unread > 0 && <span className="notif-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {data.unread > 0 && <button type="button" className="btn-ghost btn-sm" onClick={readAll}><CheckCheck size={14} aria-hidden="true" /> Mark all read</button>}
          </div>
          {data.items.length ? (
            <ul className="notif-list">
              {data.items.map((n) => {
                const Icon = KIND_ICON[n.kind] || Bell;
                return (
                  <li key={n.id}>
                    <button type="button" className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={() => go(n)}>
                      <span className={`notif-ico k-${n.kind}`}><Icon size={14} aria-hidden="true" /></span>
                      <span className="notif-body">
                        <span className="notif-text">{n.text}</span>
                        <span className="notif-when"><LocalTime iso={n.at} /></span>
                      </span>
                      {!n.readAt && <span className="notif-dot" aria-label="unread" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted small" style={{ padding: '14px 16px', margin: 0 }}>Nothing yet. You&apos;ll be told here when someone mentions you, or a client of yours sends documents or an email.</p>
          )}
          <Link href="/notifications" className="notif-all" onClick={() => setOpen(false)}>See all notifications</Link>
        </div>
      )}
    </div>
  );
}

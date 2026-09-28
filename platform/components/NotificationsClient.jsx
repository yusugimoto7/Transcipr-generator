'use client';

import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import LocalTime from '@/components/LocalTime';
import { KIND_ICON, notifAction, openLink } from '@/components/NotificationBell';

const KINDS = { all: 'All', unread: 'Unread', mention: 'Mentions', documents: 'Documents', email: 'Emails', assigned: 'New files' };

/** The full notification list: filter, open, mark read or unread. */
export default function NotificationsClient() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const load = () => fetch('/api/notifications?limit=300').then((r) => r.json()).then(setData).catch(() => setData({ items: [], unread: 0 }));
  useEffect(() => { load(); }, []);

  const items = (data?.items || []).filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.readAt : n.kind === filter));
  const set = async (body) => { const d = await notifAction(body); if (d) load(); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">Mentions in team notes, documents and emails from your clients, and files given to you.</p>
        </div>
        {data?.unread > 0 && <button type="button" className="btn-secondary" onClick={() => set({ action: 'read' })}><CheckCheck size={16} aria-hidden="true" /> Mark all read</button>}
      </div>
      <div className="cluster" style={{ marginBottom: 12 }}>
        {Object.entries(KINDS).map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? 'btn-navy btn-sm' : 'btn-secondary btn-sm'} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}{k === 'unread' && data?.unread ? ` (${data.unread})` : ''}
          </button>
        ))}
      </div>
      <section className="card card-flush">
        {!data ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : items.length ? (
          <ul className="notif-list page">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind] || Bell;
              return (
                <li key={n.id} className="notif-row">
                  <button type="button" className={`notif-item${n.readAt ? '' : ' unread'}`} onClick={async () => { if (!n.readAt) await notifAction({ action: 'read', ids: [n.id] }); openLink(n.link); }}>
                    <span className={`notif-ico k-${n.kind}`}><Icon size={15} aria-hidden="true" /></span>
                    <span className="notif-body">
                      <span className="notif-text">{n.text}</span>
                      <span className="notif-when"><LocalTime iso={n.at} /></span>
                    </span>
                    {!n.readAt && <span className="notif-dot" aria-label="unread" />}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => set({ action: n.readAt ? 'unread' : 'read', ids: [n.id] })}>
                    {n.readAt ? 'Mark unread' : 'Mark read'}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted" style={{ padding: 16, margin: 0 }}>{filter === 'all' ? 'No notifications yet.' : 'Nothing here.'}</p>
        )}
      </section>
    </>
  );
}

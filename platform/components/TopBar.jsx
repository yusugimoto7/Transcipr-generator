'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen, Settings2, LogOut } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';

export function initials(name = '', email = '') {
  const src = (name || email.split('@')[0] || '?').trim();
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

export default function TopBar({ user }) {
  const router = useRouter();
  const path = usePathname() || '';
  const staff = user?.role === 'admin' || user?.role === 'manager';
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  const on = (p) => (path === p || path.startsWith(`${p}/`) ? 'active' : '');
  return (
    <header className="app-top">
      <Link href="/dashboard" className="brand-logo" aria-label="Sugimoto Visa — home">
        <img src="/sugimoto-visa-logo.png" alt="Sugimoto Visa" />
      </Link>
      <nav className="top-nav" aria-label="Main">
        <Link href="/dashboard" className={on('/dashboard') || (path.startsWith('/application') ? 'active' : '')}>
          <FolderOpen size={16} aria-hidden="true" />
          <span>{staff ? 'Client files' : 'My applications'}</span>
        </Link>
        {user?.role === 'admin' && (
          <Link href="/admin" className={on('/admin')}>
            <Settings2 size={16} aria-hidden="true" />
            <span>Admin</span>
          </Link>
        )}
      </nav>
      <div className="top-spacer" />
      {staff && <NotificationBell />}
      {user?.email && (
        <div className="user-chip" title={user.email}>
          <span className="avatar" aria-hidden="true">{initials(user.name, user.email)}</span>
          <span className="who">
            <span>{user.name || user.email}</span>
            <span>{{ superadmin: 'Super admin', admin: 'Admin', manager: 'Account manager', applicant: 'Client' }[user.level || user.role] || user.role}</span>
          </span>
        </div>
      )}
      <button className="top-btn btn-sm" onClick={logout} aria-label="Sign out">
        <LogOut size={15} aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </header>
  );
}

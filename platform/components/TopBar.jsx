'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TopBar({ user }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <div className="topbar">
      <Link href="/dashboard" className="brand" style={{ color: '#fff' }}>
        <span className="maple">🍁</span> Canada Visa Platform
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {user?.role === 'admin' && (
          <Link href="/admin" className="small" style={{ color: '#fff', fontWeight: 600 }}>Admin</Link>
        )}
        {user?.email && (
          <span className="small" style={{ color: '#cfd6e6' }}>
            {user.email}{user.role && user.role !== 'applicant' ? ` · ${user.role}` : ''}
          </span>
        )}
        <button className="btn-ghost" onClick={logout} style={{ color: '#fff', borderColor: '#33405e' }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

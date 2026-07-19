'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthForm({ mode }) {
  const isLogin = mode === 'login';
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${isLogin ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      router.push('/dashboard');
      router.refresh();
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="brand"><span className="maple">🍁</span> Canada Visa Platform</div>
      </div>
      <div className="container narrow">
        <div className="card">
          <h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted small">
            {isLogin
              ? 'Sign in to continue your application.'
              : 'Start preparing your Canadian study permit application.'}
          </p>
          {err && <div className="alert err" style={{ marginTop: 14 }}>{err}</div>}
          <form onSubmit={submit} style={{ marginTop: 14 }}>
            {!isLogin && (
              <div className="field">
                <label>Full name</label>
                <input value={form.name} onChange={set('name')} placeholder="As in your passport" />
              </div>
            )}
            <div className="field">
              <label>Email</label>
              <input type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={set('password')}
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
              />
            </div>
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? <span className="spinner" /> : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="muted small" style={{ marginTop: 16, textAlign: 'center' }}>
            {isLogin ? (
              <>No account? <Link href="/register">Create one</Link></>
            ) : (
              <>Already have an account? <Link href="/login">Sign in</Link></>
            )}
          </p>
        </div>
        <p className="muted small" style={{ marginTop: 16, textAlign: 'center' }}>
          This platform helps you prepare documents. It is not a law firm and does not provide legal advice.
        </p>
      </div>
    </>
  );
}

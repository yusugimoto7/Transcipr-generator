'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

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
    <div className="auth">
      <aside className="auth-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sugimoto-visa-logo.png" alt="Sugimoto Visa" />
        <div>
          <h2>Canadian visas and permits, prepared with care.</h2>
          <ul>
            <li><CheckCircle2 size={18} aria-hidden="true" /> Upload your documents once. They are read, checked and organized for you.</li>
            <li><CheckCircle2 size={18} aria-hidden="true" /> See what is still needed for your application at any time.</li>
            <li><CheckCircle2 size={18} aria-hidden="true" /> Work with your licensed consultant (RCIC) on one shared file.</li>
          </ul>
        </div>
        <p className="fine">Sugimoto Visa Inc.</p>
      </aside>
      <main className="auth-form">
        <div className="box">
          <h1>{isLogin ? 'Sign in' : 'Create your account'}</h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            {isLogin ? 'Welcome back. Sign in to continue.' : 'Start your application with Sugimoto Visa.'}
          </p>
          {err && <div className="alert err">{err}</div>}
          <form onSubmit={submit}>
            {!isLogin && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <input id="name" autoComplete="name" value={form.name} onChange={set('name')} placeholder="As in your passport" />
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={isLogin ? undefined : 8}
                value={form.password}
                onChange={set('password')}
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
              />
            </div>
            <button type="submit" disabled={busy} className="btn-block" style={{ marginTop: 4, minHeight: 42 }}>
              {busy ? <span className="spinner" /> : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <p className="muted small" style={{ marginTop: 18, textAlign: 'center' }}>
            {isLogin ? (
              <>New client? <Link href="/register">Create an account</Link></>
            ) : (
              <>Already have an account? <Link href="/login">Sign in</Link></>
            )}
          </p>
          <p className="faint tiny" style={{ marginTop: 28, textAlign: 'center' }}>
            Team members: use the account your admin created for you.
          </p>
        </div>
      </main>
    </div>
  );
}

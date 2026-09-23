import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { getApplication, canAccess, effectiveRole } from './store';

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Ensure a user is logged in (and not deactivated). Returns the user or a NextResponse error. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { error: error('Not authenticated.', 401) };
  if (user.active === false) return { error: error('This account has been deactivated.', 403) };
  return { user };
}

/** Require an admin. */
export async function requireAdmin() {
  const { user, error: authErr } = await requireUser();
  if (authErr) return { error: authErr };
  if (effectiveRole(user) !== 'admin') return { error: error('Admin access required.', 403) };
  return { user };
}

/** Require staff (admin or account manager). */
export async function requireStaff() {
  const { user, error: authErr } = await requireUser();
  if (authErr) return { error: authErr };
  const role = effectiveRole(user);
  if (role !== 'admin' && role !== 'manager') return { error: error('Staff access required.', 403) };
  return { user, role };
}

/**
 * Require login AND access to the application: the applicant who owns it,
 * a manager it is assigned to, or an admin.
 */
export async function requireAppAccess(id) {
  const { user, error: authErr } = await requireUser();
  if (authErr) return { error: authErr };
  const app = await getApplication(id);
  if (!app) return { error: error('Application not found.', 404) };
  if (!canAccess(user, app)) return { error: error('Forbidden.', 403) };
  return { user, app, role: effectiveRole(user) };
}

/** Back-compat name used by the existing routes. */
export const requireOwnedApp = requireAppAccess;

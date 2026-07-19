import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { getApplication } from './store';

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Ensure a user is logged in. Returns the user or a NextResponse error. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { error: error('Not authenticated.', 401) };
  return { user };
}

/** Require login AND ownership of the application. */
export async function requireOwnedApp(id) {
  const { user, error: authErr } = await requireUser();
  if (authErr) return { error: authErr };
  const app = await getApplication(id);
  if (!app) return { error: error('Application not found.', 404) };
  if (app.userId !== user.id) return { error: error('Forbidden.', 403) };
  return { user, app };
}

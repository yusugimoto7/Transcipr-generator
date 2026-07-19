import { getUserByEmail } from '@/lib/store';
import { verifyPassword, createSession } from '@/lib/auth';
import { json, error } from '@/lib/api';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const user = await getUserByEmail(email);
  if (!user) return error('Incorrect email or password.', 401);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return error('Incorrect email or password.', 401);

  await createSession(user.id);
  return json({ id: user.id, email: user.email, name: user.name });
}

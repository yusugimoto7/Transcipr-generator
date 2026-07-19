import { createUser } from '@/lib/store';
import { hashPassword, createSession } from '@/lib/auth';
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
  const name = String(body.name || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Enter a valid email address.');
  if (password.length < 8) return error('Password must be at least 8 characters.');

  try {
    const hash = await hashPassword(password);
    const user = await createUser({ email, name, passwordHash: hash });
    await createSession(user.id);
    return json({ id: user.id, email: user.email, name: user.name }, 201);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') return error(e.message, 409);
    return error('Could not create account.', 500);
  }
}
